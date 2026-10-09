"""Test harness. Reads one JSON request on stdin, prints one JSON result on stdout.

Request: {"problem": {...}, "code": "...", "tests": [{"args": [...], "expected": ..., "ops": [...]}, ...]}
Run in its own process by server.py (never import user code into the server).
"""
import collections
import contextlib
import copy
import io
import json
import math
import signal
import sys
import time
import traceback
from collections import deque

PER_TEST_SECONDS = 3
MAX_OUT = 2000
MAX_REPR = 600


# ---------------------------------------------------------------- data structures
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right


class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []


class Interval:
    def __init__(self, start, end):
        self.start = start
        self.end = end


def make_list(arr):
    dummy = cur = ListNode()
    for v in arr:
        cur.next = ListNode(v)
        cur = cur.next
    return dummy.next


def list_to_arr(head):
    out, seen = [], 0
    while head is not None:
        out.append(head.val)
        head = head.next
        seen += 1
        if seen > 100000:
            raise RuntimeError("returned list is too long or contains a cycle")
    return out


def make_cycle_list(arr, pos):
    head = make_list(arr)
    if pos < 0 or head is None:
        return head
    target, tail, node, i = None, head, head, 0
    while node:
        if i == pos:
            target = node
        tail = node
        node = node.next
        i += 1
    tail.next = target
    return head


def make_tree(arr):
    if not arr or arr[0] is None:
        return None
    root = TreeNode(arr[0])
    q, i = deque([root]), 1
    while q and i < len(arr):
        node = q.popleft()
        if i < len(arr) and arr[i] is not None:
            node.left = TreeNode(arr[i])
            q.append(node.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            node.right = TreeNode(arr[i])
            q.append(node.right)
        i += 1
    return root


def tree_to_arr(root):
    if root is None:
        return []
    out, q = [], deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        q.append(node.left)
        q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def find_node(root, val):
    stack = [root]
    while stack:
        n = stack.pop()
        if n is None:
            continue
        if n.val == val:
            return n
        stack.append(n.left)
        stack.append(n.right)
    return None


def make_graph(adj):
    if not adj:
        return None
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, nbrs in enumerate(adj):
        nodes[i].neighbors = [nodes[j - 1] for j in nbrs]
    return nodes[0]


def graph_to_adj(node):
    if node is None:
        return []
    seen, q = {node.val: node}, deque([node])
    while q:
        cur = q.popleft()
        for n in cur.neighbors:
            if n.val not in seen:
                seen[n.val] = n
                q.append(n)
    return [sorted(n.val for n in seen[k].neighbors) for k in sorted(seen)]


def graph_is_deep_copy(orig_root, clone_root):
    """True if no node object is shared between the two graphs."""
    def collect(root):
        out, q = {}, deque([root] if root else [])
        while q:
            n = q.popleft()
            if id(n) in out:
                continue
            out[id(n)] = n
            q.extend(n.neighbors)
        return out
    return not (set(collect(orig_root)) & set(collect(clone_root)))


# ---------------------------------------------------------------- converters
def to_arg(kind, val, built):
    if kind == "raw":
        return val
    if kind == "list":
        return make_list(val)
    if kind == "tree":
        return make_tree(val)
    if kind == "graph":
        return make_graph(val)
    if kind == "cyclelist":          # val = [array, pos]
        return make_cycle_list(val[0], val[1])
    if kind == "listarray":          # list of linked lists
        return [make_list(v) for v in val]
    if kind == "intervals":          # [[s, e], ...] -> [Interval, ...]
        return [Interval(s, e) for s, e in val]
    if kind == "treeref":            # value -> node inside the first tree argument
        return find_node(built[0], val)
    raise ValueError(f"unknown arg kind {kind}")


def from_result(kind, res, built):
    if kind == "raw":
        return res
    if kind == "list":
        return list_to_arr(res)
    if kind == "tree":
        return tree_to_arr(res)
    if kind == "graph":
        return graph_to_adj(res)
    if kind == "nodeval":
        return None if res is None else res.val
    if kind == "none":
        return None
    raise ValueError(f"unknown return kind {kind}")


def deep_eq(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b or (type(a) == type(b) and a == b)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-5, abs_tol=1e-5)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(deep_eq(x, y) for x, y in zip(a, b))
    return a == b


def sort_key(x):
    return json.dumps(x, sort_keys=True, default=repr)


def compare(mode, got, expected, validator, args):
    if mode == "exact":
        return deep_eq(got, expected)
    if mode == "sorted":
        return deep_eq(sorted(got), sorted(expected))
    if mode == "sorted_nested":
        norm = lambda x: sorted((sorted(r) for r in x), key=sort_key)
        return deep_eq(norm(got), norm(expected))
    if mode == "sorted_rows":
        norm = lambda x: sorted((list(r) for r in x), key=sort_key)
        return deep_eq(norm(got), norm(expected))
    if mode == "validator":
        return bool(validator(args, got))
    raise ValueError(f"unknown compare mode {mode}")


# ---------------------------------------------------------------- execution helpers
class Timeout(Exception):
    pass


def _alarm(signum, frame):
    raise Timeout("Time Limit Exceeded")


def short(v):
    s = repr(v)
    return s if len(s) <= MAX_REPR else s[:MAX_REPR] + "..."


def jsonable(v):
    try:
        json.dumps(v)
        return v
    except Exception:
        return short(v)


def user_traceback(exc):
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == "solution.py"]
    lines = ["Traceback (most recent call last):"]
    for f in frames:
        lines.append(f'  line {f.lineno}, in {f.name}')
        if f.line:
            lines.append(f"    {f.line}")
    lines.append(f"{type(exc).__name__}: {exc}")
    return "\n".join(lines)


def make_namespace():
    import bisect, functools, heapq, itertools, math as _m, string, typing
    ns = {"__name__": "solution"}
    exec("from typing import *\nfrom collections import *\nimport collections, heapq, bisect, functools, itertools, math, string, re, sys, random",
         ns)
    ns.update(ListNode=ListNode, TreeNode=TreeNode, Node=Node, Interval=Interval)
    return ns


class Captured:
    def __enter__(self):
        self.buf = io.StringIO()
        self._cm = contextlib.redirect_stdout(self.buf)
        self._cm.__enter__()
        return self

    def __exit__(self, *a):
        self._cm.__exit__(*a)

    @property
    def text(self):
        t = self.buf.getvalue()
        return t if len(t) <= MAX_OUT else t[:MAX_OUT] + "\n...(output truncated)"


def run_one_function(problem, ns, test):
    cls = ns[problem["className"]]
    arg_kinds = [p.get("kind", "raw") for p in problem["params"]]
    ret_kind = problem.get("returns", "raw")
    inplace = problem.get("inPlaceArg")
    raw_args = copy.deepcopy(test["args"])
    built = []
    for kind, val in zip(arg_kinds, raw_args):
        built.append(to_arg(kind, val, built))
    inst = cls()
    result = getattr(inst, problem["methodName"])(*built)
    if inplace is not None:
        got = from_result(problem["params"][inplace].get("kind", "raw"), built[inplace], built)
    else:
        got = from_result(ret_kind, result, built)
    extra_ok = True
    if problem.get("checkDeepCopy"):
        extra_ok = graph_is_deep_copy(built[0], result)
    return got, built, extra_ok


def run_design(problem, ns, test):
    ops, args = test["ops"], copy.deepcopy(test["args"])
    cls = ns[ops[0]]
    inst = cls(*args[0])
    out = [None]
    for name, a in zip(ops[1:], args[1:]):
        out.append(getattr(inst, name)(*a))
    return out


def run_roundtrip(problem, ns, test):
    rt = problem["roundtrip"]
    inst = ns[problem["className"]]()
    data = copy.deepcopy(test["input"])
    if rt["type"] == "tree":
        enc = getattr(inst, rt["encode"])(make_tree(data))
        if not isinstance(enc, str):
            raise TypeError(f"{rt['encode']} must return a string, got {type(enc).__name__}")
        dec = getattr(inst, rt["decode"])(enc)
        return tree_to_arr(dec), enc
    enc = getattr(inst, rt["encode"])(data)
    if not isinstance(enc, str):
        raise TypeError(f"{rt['encode']} must return a string, got {type(enc).__name__}")
    return getattr(inst, rt["decode"])(enc), enc


def resolve(obj):
    """Replace {"$py": "expr"} with the value of the Python expression (for large generated inputs)."""
    if isinstance(obj, dict):
        if set(obj) == {"$py"}:
            import random, string
            rnd = random.Random(12345)
            return eval(obj["$py"], {"__builtins__": {"range": range, "list": list, "len": len, "sum": sum,
                                                      "min": min, "max": max, "sorted": sorted, "str": str,
                                                      "int": int, "set": set, "zip": zip, "abs": abs,
                                                      "reversed": reversed, "tuple": tuple, "dict": dict,
                                                      "enumerate": enumerate, "chr": chr, "ord": ord},
                                     "random": rnd, "math": math, "string": string})
        return {k: resolve(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [resolve(v) for v in obj]
    return obj


def clip(s, n=300):
    return s if len(s) <= n else s[:n] + f"... ({len(s)} chars)"


def display_args(problem, test):
    if problem["kind"] == "design":
        return clip(json.dumps(list(zip(test["ops"], test["args"]))))
    if problem["kind"] == "roundtrip":
        return clip(json.dumps(test["input"]))
    names = [p["name"] for p in problem["params"]]
    return "\n".join(f"{n} = {clip(json.dumps(a))}" for n, a in zip(names, test["args"]))


def main():
    req = json.load(sys.stdin)
    problem, code, tests = req["problem"], req["code"], req["tests"]
    out = {"status": "ok", "results": [], "error": ""}
    ns = make_namespace()
    validator = None
    if problem.get("validator"):
        vns = make_namespace()
        exec(problem["validator"], vns)
        validator = vns["validate"]
    try:
        exec(compile(code, "solution.py", "exec"), ns)
    except BaseException as e:  # noqa: BLE001
        out["status"] = "compile_error"
        out["error"] = user_traceback(e) if isinstance(e, Exception) else str(e)
        print(json.dumps(out))
        return
    sys.setrecursionlimit(6000)
    signal.signal(signal.SIGALRM, _alarm)
    mode = problem.get("compare", "exact")
    for test in tests:
        test = resolve(test)
        res = {"input": display_args(problem, test), "ok": False, "got": None,
               "expected": jsonable(test.get("expected")), "stdout": "", "error": "", "ms": 0}
        t0 = time.perf_counter()
        cap = Captured()
        try:
            with cap:
                signal.setitimer(signal.ITIMER_REAL, PER_TEST_SECONDS)
                try:
                    if problem["kind"] == "function":
                        got, built, extra_ok = run_one_function(problem, ns, test)
                    elif problem["kind"] == "design":
                        got, extra_ok = run_design(problem, ns, test), True
                    else:
                        got, enc = run_roundtrip(problem, ns, test)
                        extra_ok = True
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
            res["got"] = jsonable(got)
            if problem["kind"] == "roundtrip":         # self-checking: decode(encode(x)) must equal x
                res["ok"] = got == test["input"]
                res["expected"] = jsonable(test["input"])
            elif "expected" not in test:               # custom case: show output only
                res["ok"] = None
            else:
                res["ok"] = bool(extra_ok) and compare(mode, got, test["expected"], validator,
                                                       test.get("args"))
                if not extra_ok:
                    res["error"] = "The returned graph shares nodes with the original; it must be a deep copy."
        except Timeout:
            res["error"] = "Time Limit Exceeded (over %ds)" % PER_TEST_SECONDS
        except BaseException as e:  # noqa: BLE001
            res["error"] = user_traceback(e)
        res["stdout"] = cap.text
        res["ms"] = round((time.perf_counter() - t0) * 1000, 1)
        out["results"].append(res)
    print(json.dumps(out, default=repr))


if __name__ == "__main__":
    main()
