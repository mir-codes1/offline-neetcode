# Authoring a problem file

One JSON file per problem in `problems/`, named `NN-slug.json` (two-digit id, e.g. `07-product-of-array-except-self.json`).
Worked example: `problems/01-contains-duplicate.json`. Copy its shape.

Sources for content (my own paraphrases, already in this repo):
- `../NEET75.md`: descriptions, examples, test tables, pattern hints for all 75 problems (ids = numbering there).
- `~/Downloads/blind75.md`: NeetCode-style signatures/starter code and more test cases + NeetCode constraints.

## Rules
1. **Write everything in your own words.** Do not copy text from LeetCode/NeetCode pages. Descriptions, hints, explanations are original prose.
2. Signatures follow `~/Downloads/blind75.md` (NeetCode names, e.g. `hasDuplicate`, `foreignDictionary`, `PrefixTree`, `Interval`).
3. `starterCode` = the class + method signature with an empty body (trailing 8 spaces after the signature is fine). It must FAIL the tests.
4. `solution.code` = a correct, idiomatic, intended-pattern Python solution (same class/method names). `solution.explanation` = 3-6 sentences on the idea, plus complexity reasoning.
5. 3 hints, increasing in how much they give away. No hint contains the full solution.
6. Tests: all examples from the sources, plus edge cases (empty, single, duplicates, negatives, boundaries, tricky shapes). Mark the first 2 simple ones `"example": true` (they appear as Case 1 / Case 2 and match the Examples section). Add 1-3 **stress tests** using `{"$py": "..."}` for O(n)/O(n log n) problems so a quadratic solution times out (limit is 3 s per test, so size them for a 10-100x gap, e.g. n = 10^5 for O(n) vs O(n^2)). Don't add stress tests for inherently exponential/backtracking problems beyond LeetCode's real limits.
7. **Never edit `runner.py`, `server.py`, `scripts/`, `static/`.** If you hit a runner limitation, work around it (or note it in your final report). Only create your own problem files.
8. Verify: `python3 scripts/verify_solutions.py <ids...>` must print `ok` for each of your ids (reference passes ALL tests; starter code fails). Also hand-check every expected value is correct for the problem, not merely what your solution outputs.
9. Final report (keep under 150 words): ids done, anything you couldn't make work, any runner limitation. Do not paste file contents.

## Fields
```
id, slug, title, difficulty ("Easy"|"Medium"|"Hard"), topic (category heading from NEET75.md),
leetcodeUrl, videoUrl (always null; filled in later), description (markdown: `code`, **bold**, \n\n paragraphs),
examples: [{"input": "nums = [1, 2, 3, 3]", "output": "true", "explanation": "optional"}],
constraints: ["0 <= nums.length <= 10^5", ...]   (NeetCode-style limits from blind75.md are fine),
topics: ["Array", "Hash Set"]   (short tags), complexity: {"time": "O(n)", "space": "O(n)"},
hints: [h1, h2, h3], kind, className, starterCode, tests, solution: {explanation, code}
```
Premium-on-LeetCode problems (6, 46, 47, 48, 66, 67): same format; the statement is yours.

## kind = "function" (most problems)
```
"kind": "function", "className": "Solution", "methodName": "twoSum",
"params": [{"name": "nums", "type": "List[int]", "kind": "raw"}, {"name": "target", "type": "int", "kind": "raw"}],
"returns": "raw",           // how to read the return value, see below
"compare": "exact",         // see below
"tests": [{"args": [[2,7,11,15], 9], "expected": [0,1], "example": true}, ...]
```
Param `kind` (how a JSON arg becomes an object; JSON `args` is always a list, one entry per param):
- `raw`: as-is (numbers, strings, lists, matrices)
- `list`: JSON array -> `ListNode` linked list (head). `ListNode(val, next)` is provided.
- `cyclelist`: arg is `[array, pos]` -> list whose tail links to index `pos` (-1 = no cycle). Only `hasCycle`.
- `listarray`: array of arrays -> list of `ListNode` heads (Merge K Lists)
- `tree`: level-order array with `null` -> `TreeNode` root. `TreeNode(val, left, right)` provided.
- `treeref`: a value -> the node with that value inside the FIRST param's tree (LCA's p and q). The first param must be `tree`.
- `graph`: adjacency list (entry i = neighbours of node i+1) -> `Node` (node 1), `[]` -> None. `Node(val, neighbors)` provided.
- `intervals`: `[[s,e],...]` -> list of `Interval(start, end)` objects (Meeting Rooms I/II, NeetCode style)

`returns`: `raw` | `list` (ListNode->array) | `tree` (TreeNode->level-order array, trailing nulls trimmed, so write `expected` that way, e.g. `[1,null,2]`) | `graph` (Node->sorted adjacency list) | `nodeval` (node -> its `.val`) | `none` (method returns nothing).
In-place problems (Reorder List, Rotate Image, Set Matrix Zeroes): `"returns": "none", "inPlaceArg": 0` (index of the param mutated) and `expected` is that param's final value (array for `list`/matrix for `raw`).
Clone Graph: also set `"checkDeepCopy": true`.

`compare`: `exact` (default; ints/floats/bools/strings/lists; floats use a 1e-5 tolerance) | `sorted` (result list compared as a sorted list) | `sorted_nested` (sort each inner list AND the outer list; for groups/combinations/triplets) | `sorted_rows` (sort only the outer list; inner order matters, e.g. coordinate pairs) | `validator` (many valid answers): add `"validator": "def validate(args, got):\n    ...return True/False"`. `args` is the list of raw JSON args; keep it self-contained (typing and math are available). Tests still need an `expected` (any valid answer; it's just displayed).

## kind = "design" (class with multiple methods: PrefixTree, WordDictionary, MedianFinder)
```
"kind": "design", "className": "MedianFinder",
"tests": [{"ops": ["MedianFinder","addNum","addNum","findMedian"], "args": [[],[1],[2],[]], "expected": [null,null,null,1.5], "example": true}]
```
First op is the constructor (args[0] = constructor args). `expected` has `null` for methods that return nothing. `params`/`methodName`/`returns` are not needed.

## kind = "roundtrip" (self-checking encode/decode)
Encode and Decode Strings: `"roundtrip": {"type": "strlist", "encode": "encode", "decode": "decode"}`, `"className": "Solution"`, tests `{"input": ["neet","code"]}` (decode(encode(x)) must equal x; no `expected`).
Serialize and Deserialize Binary Tree: `"roundtrip": {"type": "tree", "encode": "serialize", "decode": "deserialize"}`, `"className": "Codec"`, tests `{"input": [1,2,3,null,null,4,5]}` (level-order, trailing nulls trimmed).

## Large inputs
Anywhere in `args`/`expected`/`input`, a value `{"$py": "expr"}` is replaced by the evaluated expression. Allowed: `range list len sum min max sorted str int set zip abs reversed tuple dict enumerate chr ord`, `random` (a seeded `random.Random`), `math`, `string`. Examples: `{"$py": "list(range(100000)) + [5]"}`, `{"$py": "[random.randint(-10**9, 10**9) for _ in range(10**5)]"}`, `{"$py": "'a' * 10**5"}`. Only whole values can be replaced, not parts of a string.
