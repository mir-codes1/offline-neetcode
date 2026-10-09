# Description style guide

Goal: a reader who has never seen the problem should understand **exactly what to produce** after one read, without having
to decode jargon. Each problem file's `description` and `examples` fields are rewritten to this guide.

## You may edit (and nothing else)
- `description` and `examples` in your assigned `problems/NN-*.json` files.
- In `tests`: only set `"example": true` on the tests that match Example 1 and Example 2 (and add a test for that example if
  none matches) so Case 1 / Case 2 in the console equal Example 1 / Example 2. Don't change any other test.
- Don't touch constraints, hints, topics, complexity, starter code, solution, runner/server/static/scripts, or other agents' files.

## Original wording (important)
Write in your own words. Do not copy phrasing from LeetCode or NeetCode. Re-explain; don't transcribe. Keep the problem
identical in meaning (same inputs, outputs, rules). Example *data* can stay as it is in the current file.

## `description` structure (blocks separated by a blank line; about 50-160 words total)
1. **The task**, in one or two plain sentences: what you are given (name every input in `code` font, matching the
   `params` names, and say what it holds) and exactly what to return (type + meaning). Start with "Given ..." or "You are given ...".
2. **Key terms**: define any term a beginner could trip on, in one line each. Put the term in **bold** and add a tiny
   concrete illustration in brackets or after a dash (anagram, subsequence, BST, level order, in-place, island, prefix,
   topological order...). Skip this block only if there is truly no jargon; then use the Rules block as the second block.
3. **Rules** as a short bullet list (`- `), only the points that change the answer or are easy to miss: output order
   doesn't matter, an element can't be used twice, indices are 0-based, what to return when nothing exists, guarantees
   ("exactly one answer exists"), in-place requirement, required complexity ("must run in O(n)").
4. Optional **callout** for one trap or follow-up: a line starting with `> ` e.g. `> Note: an empty string only matches another empty string.`

Do **not** hint at the solution technique, name algorithms/data structures to use, or describe how to solve it. Do not
repeat constraints (they are listed separately). No filler ("This is a classic problem..."). Short sentences, active voice.

Allowed markup: `code`, **bold**, *italic*, bullet lists with `- `, numbered lists with `1. `, callouts with `> `,
paragraphs separated by a blank line. No headings, no tables, no HTML.

## `examples` (2 or 3, each with all three fields)
```
{"input": "strs = [\"act\", \"pots\", \"tops\", \"cat\", \"stop\", \"hat\"]",
 "output": "[[\"hat\"], [\"act\", \"cat\"], [\"stop\", \"pots\", \"tops\"]]",
 "explanation": "\"act\" and \"cat\" use the same letters, and so do \"pots\", \"tops\" and \"stop\". \"hat\" has no partner, so it forms a group of one. Any ordering of the groups is accepted."}
```
- Example 1: the standard case. Example 2 (and 3): an edge or tricky case (empty/minimum input, duplicates, negatives,
  no answer, an answer that surprises people). At least one example must show an edge case.
- `explanation` is **required** on every example: 1-3 sentences that say *why* the output is what it is (walk through the
  key step; for multi-answer problems say which other answers are also accepted). Plain English, no solution technique.
- `input`: `name = value` pairs separated by `, ` using the exact parameter names from `params`, in order. **JSON syntax
  only**: double quotes, `null`, `true`, `false`. Trees/lists use the same arrays the tests use (level-order for trees, with `null`).
  - cycle list (Linked List Cycle): `head = [3, 2, 0, -4], pos = 1` (pos = index the tail links back to, -1 for none)
  - design problems: `ops = ["Name", "m1", "m2"], args = [[], [..], [..]]`, `output` = JSON list with `null` for methods that return nothing
  - round-trip problems (Encode/Decode Strings, Serialize/Deserialize): `input` = the data (e.g. `strs = ["a", "b"]` / `root = [1, 2, 3]`),
    `output` = identical to the input; say in the explanation that decoding the encoded form gives the original back.
  - in-place problems: `output` = the final value of the modified input.
- `output` must be exactly what a correct solution returns for that input. A script checks every example against the reference solution.

## Worked example (Group Anagrams)
description:
```
Given an array of strings `strs`, put the strings that are **anagrams** of each other into the same group, and return all the groups.

An **anagram** of a word is another word made from exactly the same letters, each used the same number of times, in any order. `"tea"` and `"eat"` are anagrams; `"tea"` and `"tee"` are not.

- Every string must end up in exactly one group.
- The groups can be returned in any order, and so can the strings inside a group.

> Note: an empty string `""` is only an anagram of another empty string.
```

## Verify before you report
`cd /Users/mirzohairali/Desktop/neet75/app && python3 scripts/check_examples.py <your ids>` must say `ok` for every id
(it checks the style rules and that every example is correct), and `python3 scripts/verify_solutions.py <your ids>` must still
print `ok`. If an example looks wrong, trust the problem statement and the reference solution's behaviour; fix the example.
Final report under 100 words: ids done, any problem whose statement you found ambiguous or any example you had to change materially.
