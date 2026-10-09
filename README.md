# Neet75 Offline

Practice the Blind 75 (NeetCode's "Blind 75" list) with no internet: problem list, a code editor, Run/Submit against local tests, hints, reference solutions and progress tracking.

## Start

```
cd ~/Desktop/neet75/app
python3 server.py          # then open http://127.0.0.1:8075
python3 server.py 9000     # or pick another port
```

Needs only Python 3 (no pip/npm). Everything the page loads, including the Monaco editor, is stored in `static/vendor/`. Only the "Watch the video" links on each Solution tab need internet.

## Using it
- **List page:** search, filter, star problems, random problem, solved ring. The trash button resets all progress.
- **Problem page:** `Run` checks the example cases plus any custom cases (`+` in the console); `Submit` runs every hidden test. Shortcuts: Cmd/Ctrl+Enter = Run, Cmd/Ctrl+' = Submit.
- A problem turns solved only when Submit passes all tests. Each test has a 3 s limit, so slow solutions fail with "Time Limit Exceeded".
- Your code drafts, stars, solved flags and submission history are saved to `data/progress.json`. Delete that file to start fresh.

## Layout
```
server.py        local server + JSON API (binds 127.0.0.1 only)
runner.py        runs your code against the tests in a separate process
problems/        one JSON file per problem (statement, tests, hints, solution)
videos.json      slug -> NeetCode video URL
static/          the web pages (+ vendor/monaco)
scripts/verify_solutions.py   checks every reference solution passes and every starter fails
scripts/fetch_vendor.py       re-downloads Monaco (only needed if static/vendor is deleted)
AUTHORING.md     format for adding or editing a problem
```

## Notes
- The runner executes your code on your own machine with a time limit and a memory cap. It is not a security sandbox.
- Problem text, hints and solutions are written in original wording. Always read the official statement on the original sites too.
- Premium-on-LeetCode problems (6, 46, 47, 48, 66, 67) work the same here.
