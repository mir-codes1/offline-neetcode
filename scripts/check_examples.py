#!/usr/bin/env python3
"""Check the written examples of each problem against its reference solution.

For every example {"input": "nums = [1, 2], target = 3", "output": "[0, 1]", "explanation": "..."} the input text is
parsed into arguments, the reference solution is run on it, and the result must match the written output (using the
problem's own compare mode). Also checks that Case 1 / Case 2 in the console equal Example 1 / Example 2, and that
descriptions and examples follow the house style (see DESC_STYLE.md).

Usage: python3 scripts/check_examples.py            # all problems
       python3 scripts/check_examples.py 1 2 3      # only these ids
Example text must use JSON syntax: double quotes, null / true / false.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

NAME = re.compile(r"[A-Za-z_]\w*\s*=(?!=)\s*")


def split_assignments(s):
    """'a = [1, 2], b = "x, y = z"' -> [('a', '[1, 2]'), ('b', '"x, y = z"')] (bracket and string aware)."""
    marks, depth, quote, esc, i = [], 0, None, False, 0
    while i < len(s):
        c = s[i]
        if quote:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
        elif c in "\"'":
            quote = c
        elif c in "[({":
            depth += 1
        elif c in "])}":
            depth -= 1
        elif depth == 0 and (i == 0 or s[:i].rstrip().endswith(",")):
            m = NAME.match(s, i)
            if m:
                marks.append((m.start(), m.end(), m.group(0).split("=")[0].strip()))
                i = m.end()
                continue
        i += 1
    out = []
    for k, (st, en, name) in enumerate(marks):
        stop = marks[k + 1][0] if k + 1 < len(marks) else len(s)
        out.append((name, s[en:stop].strip().rstrip(",").strip()))
    return out


def parse_value(text):
    try:
        return json.loads(text)
    except ValueError:
        pass
    try:
        import ast
        return ast.literal_eval(re.sub(r"\bnull\b", "None", re.sub(r"\btrue\b", "True", re.sub(r"\bfalse\b", "False", text))))
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"cannot parse {text!r} (use JSON: double quotes, null/true/false)") from e


def build_test(p, ex):
    pairs = split_assignments(ex["input"])
    if not pairs:
        raise ValueError("input must look like 'name = value, name2 = value2'")
    vals = {n: parse_value(v) for n, v in pairs}
    out = parse_value(ex["output"])
    kind = p["kind"]
    if kind == "design":
        if set(vals) != {"ops", "args"}:
            raise ValueError("design example input must be 'ops = [...], args = [...]'")
        return {"ops": vals["ops"], "args": vals["args"], "expected": out}
    if kind == "roundtrip":
        if len(vals) != 1:
            raise ValueError("roundtrip example input must be a single 'name = value'")
        v = next(iter(vals.values()))
        if parse_value(ex["output"]) != v:
            raise ValueError("roundtrip output must equal the input")
        return {"input": v}
    values = list(vals.values())
    kinds = [q.get("kind", "raw") for q in p["params"]]
    if "cyclelist" in kinds:
        if len(values) != 2:
            raise ValueError("cycle-list example needs two values: the list and the cycle position")
        values = [[values[0], values[1]]]
    if len(values) != len(p["params"]):
        raise ValueError(f"expected {len(p['params'])} argument(s) {[q['name'] for q in p['params']]}, found {list(vals)}")
    return {"args": values, "expected": out}


def canon(t):
    return json.dumps({k: t.get(k) for k in ("args", "ops", "input")}, sort_keys=True)


def check(p):
    errs = []
    d = p.get("description", "")
    words = len(re.findall(r"\S+", d))
    if not 25 <= words <= 220:
        errs.append(f"description has {words} words (want roughly 40-170)")
    if len(re.split(r"\n\s*\n", d.strip())) < 2:
        errs.append("description should have at least two paragraphs/blocks (task, then key terms or rules)")
    exs = p.get("examples", [])
    if not 2 <= len(exs) <= 3:
        errs.append(f"{len(exs)} examples (want 2 or 3)")
    tests, kept = [], []
    for i, ex in enumerate(exs):
        if len((ex.get("explanation") or "").split()) < 5:
            errs.append(f"example {i + 1} needs an explanation (at least a short sentence)")
        try:
            tests.append(build_test(p, ex))
            kept.append(i)
        except ValueError as e:
            errs.append(f"example {i + 1}: {e}")
    if tests:
        res = server.summarize(server.run_tests(p, p["solution"]["code"], tests))
        if res.get("status") != "ok":
            errs.append("runner: " + res.get("error", "")[:200])
        for i, r in zip(kept, res.get("results", [])):
            if not r["ok"]:
                errs.append(f"example {i + 1} is WRONG: reference solution got {str(r['got'])[:100]}, example says {str(r['expected'])[:100]}"
                            + (f" ({r['error'].splitlines()[-1][:100]})" if r["error"] else ""))
    cases = server.example_tests(p)
    for i, t in enumerate(cases[:2]):
        if i < len(tests) and canon(t) != canon(tests[i]) and i in kept:
            errs.append(f"Case {i + 1} in the console differs from Example {i + 1}: set \"example\": true on the test that matches the example (add it to tests if missing)")
    return errs


def main():
    wanted = {int(a) for a in sys.argv[1:]}
    problems = server.load_problems()
    bad = 0
    for pid in sorted(problems):
        if wanted and pid not in wanted:
            continue
        errs = check(problems[pid])
        if errs:
            bad += 1
            print(f"[{pid:>2}] {problems[pid]['title']}")
            for e in errs:
                print("      -", e)
        else:
            print(f"[{pid:>2}] ok   {problems[pid]['title']}")
    print("\n" + ("ALL GOOD" if not bad else f"{bad} problem(s) need attention"))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
