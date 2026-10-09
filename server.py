#!/usr/bin/env python3
"""Offline NEET75 practice server. Stdlib only.   Usage: python3 server.py [port]"""
import json
import mimetypes
import os
import re
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PROBLEM_DIR = os.path.join(ROOT, "problems")
STATIC_DIR = os.path.join(ROOT, "static")
# Set NEET75_DATA to point tests at a scratch folder so they never touch your real progress.
DATA_DIR = os.environ.get("NEET75_DATA") or os.path.join(ROOT, "data")
PROGRESS_FILE = os.path.join(DATA_DIR, "progress.json")
VIDEOS_FILE = os.path.join(ROOT, "videos.json")
RUNNER = os.path.join(ROOT, "runner.py")
RUN_TIMEOUT = 25  # whole-process guard; runner also enforces a per-test limit
MEM_LIMIT = 1024 * 1024 * 1024

_lock = threading.Lock()


# ------------------------------------------------------------------ problems
def load_problems():
    problems = {}
    if not os.path.isdir(PROBLEM_DIR):
        return problems
    videos = {}
    if os.path.exists(VIDEOS_FILE):
        with open(VIDEOS_FILE) as f:
            videos = json.load(f)
    for name in sorted(os.listdir(PROBLEM_DIR)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(PROBLEM_DIR, name)) as f:
            p = json.load(f)
        if p["slug"] in videos:
            p["videoUrl"] = videos[p["slug"]]
        problems[p["id"]] = p
    return problems


def public_problem(p):
    """Problem without hidden tests and without the reference solution."""
    q = {k: v for k, v in p.items() if k not in ("tests", "solution", "validator")}
    q["exampleCount"] = len(example_tests(p))
    q["testCount"] = len(p["tests"])
    q["exampleTests"] = example_tests(p)
    return q


def example_tests(p):
    ex = [t for t in p["tests"] if t.get("example")]
    return ex if ex else p["tests"][:2]


# ------------------------------------------------------------------ progress
def read_progress():
    try:
        with open(PROGRESS_FILE) as f:
            d = json.load(f)
    except (OSError, ValueError):
        d = {}
    for k in ("solved", "starred", "drafts", "submissions"):
        d.setdefault(k, {})
    return d


def write_progress(d):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    with os.fdopen(fd, "w") as f:
        json.dump(d, f)
    os.replace(tmp, PROGRESS_FILE)


# ------------------------------------------------------------------ running code
def _limits():
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (RUN_TIMEOUT, RUN_TIMEOUT))
        resource.setrlimit(resource.RLIMIT_AS, (MEM_LIMIT, MEM_LIMIT))
    except Exception:
        pass


def run_tests(problem, code, tests):
    req = json.dumps({"problem": problem, "code": code, "tests": tests})
    try:
        proc = subprocess.run([sys.executable, RUNNER], input=req, capture_output=True, text=True,
                              timeout=RUN_TIMEOUT, preexec_fn=_limits, cwd=tempfile.gettempdir())
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": "Time Limit Exceeded", "results": []}
    if proc.returncode != 0 or not proc.stdout.strip():
        msg = (proc.stderr or "").strip().splitlines()
        err = "\n".join(msg[-6:]) or "The runner was terminated (out of memory or time)."
        return {"status": "error", "error": err, "results": []}
    try:
        return json.loads(proc.stdout.strip().splitlines()[-1])
    except ValueError:
        return {"status": "error", "error": "Could not read runner output:\n" + proc.stdout[-500:],
                "results": []}


def summarize(res):
    results = res.get("results", [])
    judged = [r for r in results if r["ok"] is not None]
    res["passed"] = sum(1 for r in judged if r["ok"])
    res["total"] = len(judged)
    res["accepted"] = (res["status"] == "ok" and res["total"] > 0 and res["passed"] == res["total"]
                       and not any(r["error"] for r in results))
    return res


# ------------------------------------------------------------------ HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "Neet75/1.0"

    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        path = urlparse(self.path).path
        problems = self.server.problems
        if path == "/api/problems":
            prog = read_progress()
            rows = [{"id": p["id"], "slug": p["slug"], "title": p["title"], "difficulty": p["difficulty"],
                     "topic": p["topic"], "solved": bool(prog["solved"].get(str(p["id"]))),
                     "starred": bool(prog["starred"].get(str(p["id"]))), "videoUrl": p.get("videoUrl")}
                    for p in problems.values()]
            return self._send(200, rows)
        m = re.fullmatch(r"/api/problems/(\d+)(/solution)?", path)
        if m:
            p = problems.get(int(m.group(1)))
            if not p:
                return self._send(404, {"error": "no such problem"})
            if m.group(2):
                return self._send(200, {"solution": p.get("solution"), "videoUrl": p.get("videoUrl"),
                                        "complexity": p.get("complexity")})
            return self._send(200, public_problem(p))
        if path == "/api/progress":
            return self._send(200, read_progress())
        if path == "/" or re.fullmatch(r"/problem/\d+", path):
            return self._static("index.html" if path == "/" else "problem.html")
        return self._static(path.lstrip("/"))

    def _static(self, rel):
        full = os.path.realpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(os.path.realpath(STATIC_DIR) + os.sep) or not os.path.isfile(full):
            return self._send(404, "not found", "text/plain")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            self._send(200, f.read(), ctype)

    def do_POST(self):
        path = urlparse(self.path).path
        problems = self.server.problems
        try:
            body = self._json_body()
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        if path in ("/api/run", "/api/submit"):
            p = problems.get(int(body.get("id", -1)))
            if not p:
                return self._send(404, {"error": "no such problem"})
            code = body.get("code", "")
            if path == "/api/run":
                tests = list(example_tests(p))
                for c in body.get("cases", []):
                    tests.append({"args": c["args"]} if p["kind"] == "function"
                                 else {k: v for k, v in c.items() if k != "expected"})
                res = summarize(run_tests(p, code, tests))
                for r in res.get("results", []):
                    pass
                return self._send(200, res)
            res = summarize(run_tests(p, code, p["tests"]))
            with _lock:
                prog = read_progress()
                subs = prog["submissions"].setdefault(str(p["id"]), [])
                subs.insert(0, {"time": int(time.time()), "accepted": res["accepted"], "passed": res["passed"],
                                "total": res["total"], "status": res["status"], "code": code})
                del subs[30:]
                if res["accepted"]:
                    prog["solved"][str(p["id"])] = True
                write_progress(prog)
            # hide the hidden tests' inputs after the first failure (like an online judge)
            return self._send(200, res)
        if path == "/api/progress":
            with _lock:
                prog = read_progress()
                if "star" in body:
                    prog["starred"][str(body["star"]["id"])] = bool(body["star"]["value"])
                if "solved" in body:
                    prog["solved"][str(body["solved"]["id"])] = bool(body["solved"]["value"])
                if "draft" in body:
                    prog["drafts"][str(body["draft"]["id"])] = body["draft"]["code"]
                if body.get("reset"):
                    prog = {"solved": {}, "starred": {}, "drafts": {}, "submissions": {}}
                write_progress(prog)
            return self._send(200, {"ok": True})
        return self._send(404, {"error": "not found"})


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self):
        # HTTPServer.server_bind() calls socket.getfqdn(), a reverse-DNS lookup that can stall
        # for 30+ seconds (especially offline). We only bind to loopback, so skip it.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]

    def __init__(self, addr):
        super().__init__(addr, Handler)
        self.problems = load_problems()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8075
    srv = Server(("127.0.0.1", port))
    print(f"Neet75 Offline: {len(srv.problems)} problems loaded. Open http://127.0.0.1:{port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
