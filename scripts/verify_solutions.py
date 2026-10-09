#!/usr/bin/env python3
"""Check every problem file: reference solution must pass all tests, starter stub must not.

Usage: python3 scripts/verify_solutions.py            # all problems
       python3 scripts/verify_solutions.py 1 2 3      # only these ids
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import server  # noqa: E402

REQUIRED = ["id", "slug", "title", "difficulty", "topic", "leetcodeUrl", "description", "examples",
            "constraints", "topics", "complexity", "hints", "kind", "className", "starterCode",
            "tests", "solution"]


def check_schema(p):
    errs = [f"missing field '{k}'" for k in REQUIRED if k not in p]
    if p.get("difficulty") not in ("Easy", "Medium", "Hard"):
        errs.append("difficulty must be Easy/Medium/Hard")
    if len(p.get("hints", [])) != 3:
        errs.append("need exactly 3 hints")
    if p.get("kind") == "function" and not (p.get("methodName") and p.get("params")):
        errs.append("function problems need methodName and params")
    if not p.get("tests"):
        errs.append("no tests")
    sol = p.get("solution") or {}
    if not sol.get("code") or not sol.get("explanation"):
        errs.append("solution needs explanation and code")
    return errs


def main():
    wanted = {int(a) for a in sys.argv[1:]}
    problems = server.load_problems()
    bad = 0
    for pid in sorted(problems):
        if wanted and pid not in wanted:
            continue
        p = problems[pid]
        errs = check_schema(p)
        if errs:
            print(f"[{pid:>2}] {p.get('title')}: SCHEMA  " + "; ".join(errs))
            bad += 1
            continue
        res = server.summarize(server.run_tests(p, p["solution"]["code"], p["tests"]))
        stub = server.summarize(server.run_tests(p, p["starterCode"], p["tests"]))
        ok_ref = res["accepted"]
        stub_fails = not stub["accepted"]
        slowest = max((r["ms"] for r in res.get("results", [])), default=0)
        status = "ok " if ok_ref and stub_fails else "FAIL"
        print(f"[{pid:>2}] {status} {p['title']}  ({res.get('passed')}/{res.get('total')} tests, slowest {slowest} ms)")
        if not ok_ref:
            bad += 1
            if res.get("error"):
                print("      runner:", res["error"][:300])
            for r in res.get("results", []):
                if not r["ok"]:
                    print("      input:   ", r["input"].replace("\n", " | ")[:200])
                    print("      got:     ", str(r["got"])[:200])
                    print("      expected:", str(r["expected"])[:200])
                    if r["error"]:
                        print("      error:   ", r["error"].splitlines()[-1][:200])
                    break
        if not stub_fails:
            bad += 1
            print("      starter code passes all tests (it must fail)")
    print("\n%s" % ("ALL GOOD" if not bad else f"{bad} problem(s) need attention"))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
