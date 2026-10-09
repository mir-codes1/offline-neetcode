(function () {
  var $ = function (id) { return document.getElementById(id); };
  var m = location.pathname.match(/\/problem\/(\d+)/);
  var PID = m ? +m[1] : 0;
  var P = null, progress = { solved: {}, drafts: {}, submissions: {} }, ids = [];
  var editor = null, monacoReady = null, busy = false, saveTimer = null;
  var cases = [], curCase = 0, lastOut = null, ctab = "case";
  var solCache = null, ltab = "question";

  $("backBtn").innerHTML = icon("list");
  $("themebtn").innerHTML = icon("sun");
  $("prevBtn").innerHTML = icon("left");
  $("nextBtn").innerHTML = icon("right");
  $("resetCode").innerHTML = icon("reset");
  $("conChev").innerHTML = icon("chev");
  $("pnum").textContent = "#" + PID;
  document.querySelector('[data-t="question"]').innerHTML = icon("doc") + " Question";
  document.querySelector('[data-t="solution"]').innerHTML = icon("bulb") + " Solution";
  document.querySelector('[data-t="subs"]').innerHTML = icon("clock") + " Submissions";
  document.querySelector('[data-c="case"]').innerHTML = icon("flask") + " Test Case";
  document.querySelector('[data-c="out"]').innerHTML = icon("term") + " Output";

  /* ---------------- markdown-lite ---------------- */
  // `code` spans are escaped and left alone; **bold** and *italic* apply only outside them.
  function inline(s) {
    return String(s == null ? "" : s).split(/(`[^`]+`)/).map(function (part) {
      if (part.length > 2 && part.charAt(0) === "`" && part.charAt(part.length - 1) === "`") return "<code>" + esc(part.slice(1, -1)) + "</code>";
      return esc(part).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<i>$2</i>");
    }).join("");
  }
  function md(src) {
    var blocks = String(src || "").replace(/\r/g, "").split(/\n\s*\n/), out = [];
    blocks.forEach(function (b) {
      var lines = b.split("\n").filter(function (l) { return l.trim() !== ""; });
      if (!lines.length) return;
      if (lines.every(function (l) { return /^\s*>\s?/.test(l); })) {
        var txt = lines.map(function (l) { return l.replace(/^\s*>\s?/, ""); }).join(" ");
        var lab = /^(Note|Follow-up|Tip|Warning|Reminder):\s*/i.exec(txt);
        out.push('<div class="callout">' + (lab ? "<b>" + esc(lab[1]) + ":</b> " : "") + inline(lab ? txt.slice(lab[0].length) : txt) + "</div>");
      } else if (lines.every(function (l) { return /^\s*[-*]\s+/.test(l); })) {
        out.push("<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>"; }).join("") + "</ul>");
      } else if (lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); })) {
        out.push("<ol>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*\d+[.)]\s+/, "")) + "</li>"; }).join("") + "</ol>");
      } else out.push("<p>" + lines.map(inline).join("<br>") + "</p>");
    });
    return out.join("");
  }

  /* ---------------- loading ---------------- */
  function notFound(msg) {
    $("main").innerHTML = '<div class="notfound"><h2>' + esc(msg) + '</h2><p><a href="/">Back to the problem list</a></p></div>';
  }

  function init() {
    if (!PID) return notFound("No such problem.");
    Promise.all([
      api("/api/problems/" + PID),
      api("/api/progress").catch(function () { return progress; }),
      api("/api/problems").catch(function () { return []; })
    ]).then(function (r) {
      P = r[0]; progress = r[1];
      ["solved", "drafts", "submissions", "starred"].forEach(function (k) { progress[k] = progress[k] || {}; });
      ids = r[2].map(function (x) { return x.id; }).sort(function (a, b) { return a - b; });
      document.title = P.id + ". " + P.title + " - Neet75 Offline";
      setNav();
      buildCases();
      renderLeft();
      renderConsole();
      startEditor();
      if (location.hash === "#solution") setLTab("solution");
    }).catch(function (e) {
      notFound(e.status === 404 ? "Problem " + PID + " is not available (yet)." : "Could not load problem: " + e.message);
    });
  }

  function setNav() {
    var i = ids.indexOf(PID), prev = ids[i - 1], next = ids[i + 1];
    var set = function (el, id) {
      if (id) { el.href = "/problem/" + id; el.style.visibility = ""; } else el.style.visibility = "hidden";
    };
    set($("prevBtn"), prev); set($("nextBtn"), next);
  }

  /* ---------------- left pane ---------------- */
  function isSolved() { return !!progress.solved[PID]; }

  function renderLeft() {
    if (ltab === "question") renderQuestion();
    else if (ltab === "solution") renderSolution();
    else renderSubs();
  }
  function setLTab(t) {
    ltab = t;
    document.querySelectorAll("#ltabs .tab").forEach(function (b) { b.classList.toggle("active", b.dataset.t === t); });
    renderLeft();
  }
  $("ltabs").addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (b) setLTab(b.dataset.t); });

  function renderQuestion() {
    var p = P, h = "";
    h += '<h1 class="qtitle">' + p.id + ". " + esc(p.title) + '<span class="chk" id="solvedChk" title="Solved" style="' + (isSolved() ? "" : "display:none") + '">' + icon("check") + "</span></h1>";
    h += '<div class="pills"><span class="pill ' + diffClass(p.difficulty) + '">' + esc(p.difficulty) + "</span>" +
      '<button class="pill" data-go="topics">' + icon("book") + " Topics</button>" +
      '<button class="pill" data-go="hint1">' + icon("bulb") + " Hints</button></div>";
    h += '<div class="desc">' + md(p.description) + "</div>";
    (p.examples || []).forEach(function (ex, i) {
      h += '<div class="extitle">Example ' + (i + 1) + ':</div><div class="ex">' +
        '<div class="exrow"><span class="exl">Input:</span> ' + esc(ex.input) + "</div>" +
        '<div class="exrow"><span class="exl">Output:</span> ' + esc(ex.output) + "</div></div>" +
        (ex.explanation ? '<div class="exwhy"><b>Explanation:</b> ' + inline(ex.explanation) + "</div>" : "");
    });
    if ((p.constraints || []).length) {
      h += '<h4 class="sec">Constraints:</h4><ul class="cons">' + p.constraints.map(function (c) { return "<li><code>" + esc(c) + "</code></li>"; }).join("") + "</ul>";
    }
    h += '<div style="margin-top:28px"></div>';
    h += '<details class="acc" id="acc-topics"><summary>Topics</summary><div class="pills">' + (p.topics || []).map(function (t) { return '<span class="pill">' + esc(t) + "</span>"; }).join("") + "</div></details>";
    if (p.complexity) h += '<details class="acc"><summary>Recommended Time &amp; Space Complexity</summary><div>Time complexity: <code>' + esc(p.complexity.time) + "</code><br>Space complexity: <code>" + esc(p.complexity.space) + "</code></div></details>";
    (p.hints || []).forEach(function (t, i) {
      h += '<details class="acc" id="acc-hint' + (i + 1) + '"><summary>Hint ' + (i + 1) + "</summary><div>" + md(t) + "</div></details>";
    });
    $("lbody").innerHTML = h;
  }
  $("lbody").addEventListener("click", function (e) {
    var g = e.target.closest("[data-go]");
    if (!g) return;
    var el = $("acc-" + g.dataset.go);
    if (el) { el.open = true; el.scrollIntoView({ behavior: "smooth", block: "center" }); }
  });

  var solText = null;
  // Monaco assigns colour classes per theme, so this must re-run whenever the theme changes.
  function colorizeSolution() {
    if (!monacoReady || solText === null) return;
    var text = solText;
    monacoReady.then(function (monaco) {
      monaco.editor.colorize(text, "neetpython", { tabSize: 4 }).then(function (html) {
        if ($("solCode") && solText === text) $("solCode").innerHTML = html;
      });
    }).catch(function () {});
  }

  function renderSolution() {
    var body = $("lbody");
    body.innerHTML = '<div class="empty"><span class="spin"></span>Loading...</div>';
    var go = solCache ? Promise.resolve(solCache) : api("/api/problems/" + PID + "/solution").then(function (s) { return (solCache = s); });
    go.then(function (s) {
      if (ltab !== "solution") return;
      var sol = s.solution, h = '<h1 class="qtitle">Solution</h1>';
      if (!sol) { body.innerHTML = h + '<div class="hint-empty">No solution written yet.</div>'; return; }
      h += '<div class="desc">' + md(sol.explanation) + "</div>";
      h += '<div class="codeblock"><button class="btn copy" id="copySol">Copy</button><pre id="solCode">' + esc(sol.code) + "</pre></div>";
      var c = s.complexity || P.complexity;
      if (c) h += "<p>Time complexity: <code>" + esc(c.time) + "</code> &nbsp; Space complexity: <code>" + esc(c.space) + "</code></p>";
      if (s.videoUrl) h += '<p><a class="btn green" style="display:inline-block" href="' + esc(s.videoUrl) + '" target="_blank" rel="noopener noreferrer">Watch the video</a> <span class="note">opens in a new tab; needs internet</span></p>';
      body.innerHTML = h;
      $("copySol").onclick = function () {
        var b = this, done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1200); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sol.code).then(done, fallback); else fallback();
        function fallback() {
          var ta = document.createElement("textarea"); ta.value = sol.code; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (x) {} ta.remove();
        }
      };
      solText = sol.code;
      colorizeSolution();
    }).catch(function (e) { body.innerHTML = '<div class="hint-empty">Could not load solution: ' + esc(e.message) + "</div>"; });
  }

  function renderSubs() {
    var subs = progress.submissions[PID] || [], h = '<h1 class="qtitle">Submissions</h1>';
    if (!subs.length) h += '<div class="hint-empty">No submissions yet. Press Submit to run the full test suite.</div>';
    else h += '<div class="card" style="padding:4px">' + subs.map(function (s, i) {
      return '<div class="sub"><span class="st ' + (s.accepted ? "ok" : "bad") + '">' + (s.accepted ? "Accepted" : statusName(s)) + "</span><span class=\"tm\">" + new Date(s.time * 1000).toLocaleString() + "</span><span>" + s.passed + "/" + s.total + '</span><button class="btn" data-load="' + i + '">Load code</button></div>';
    }).join("") + "</div>";
    $("lbody").innerHTML = h;
  }
  function statusName(s) {
    if (s.status === "compile_error") return "Compile Error";
    if (s.status === "error") return "Runtime Error";
    return "Wrong Answer";
  }
  $("lbody").addEventListener("click", function (e) {
    var b = e.target.closest("[data-load]");
    if (!b || !editor) return;
    var s = (progress.submissions[PID] || [])[+b.dataset.load];
    if (s && confirm("Replace the code in the editor with this submission?")) editor.setValue(s.code);
  });
  function setSolved() {
    progress.solved[PID] = true;
    var c = $("solvedChk"); if (c) c.style.display = "";
  }

  /* ---------------- editor ---------------- */
  function monacoTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "neet-light" : "neet-dark"; }
  function startEditor() {
    var base = location.origin + "/vendor/monaco/";
    window.MonacoEnvironment = {
      getWorkerUrl: function () {
        var src = "self.MonacoEnvironment={baseUrl:'" + base + "'};importScripts('" + base + "vs/base/worker/workerMain.js');";
        return "data:text/javascript;charset=utf-8," + encodeURIComponent(src);
      }
    };
    monacoReady = new Promise(function (resolve, reject) {
      if (!window.require) return reject(new Error("Monaco loader missing (run scripts/fetch_vendor.py)"));
      require.config({ paths: { vs: "/vendor/monaco/vs" } });
      require(["vs/editor/editor.main"], function () {
        try { window.registerNeetPython(window.monaco); } catch (e) { return reject(e); }
        window.monaco.editor.setTheme(monacoTheme());
        resolve(window.monaco);
      }, reject);
    });
    monacoReady.then(function (monaco) {
      var host = $("editor"); host.innerHTML = "";
      var start = typeof progress.drafts[PID] === "string" ? progress.drafts[PID] : P.starterCode;
      editor = monaco.editor.create(host, {
        value: start, language: "neetpython", theme: monacoTheme(), automaticLayout: true, fontSize: 14, lineHeight: 22,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4, insertSpaces: true, fixedOverflowWidgets: true,
        padding: { top: 8 }, renderLineHighlight: "line", fontLigatures: false,
        bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true },
        matchBrackets: "always", smoothScrolling: true, cursorBlinking: "smooth", occurrencesHighlight: "singleFile"
      });
      editor.onDidChangeCursorPosition(function (e) { $("pos").textContent = "Ln " + e.position.lineNumber + ", Col " + e.position.column; });
      editor.onDidChangeModelContent(function () {
        $("saveState").textContent = "Saving...";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 600);
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function () { doRun(); });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Quote, function () { doSubmit(); });
      if (ltab === "solution") renderSolution();
    }).catch(function (e) {
      $("editor").innerHTML = '<div class="loadmsg">Editor failed to load: ' + esc(e && e.message || e) + "</div>";
    });
  }
  function saveDraft() {
    if (!editor) return;
    api("/api/progress", { draft: { id: PID, code: editor.getValue() } }).then(function () {
      progress.drafts[PID] = editor.getValue();
      $("saveState").textContent = "Saved";
    }).catch(function () { $("saveState").textContent = "Not saved"; });
  }
  window.addEventListener("beforeunload", function () {
    if (editor && saveTimer) { try { navigator.sendBeacon("/api/progress", new Blob([JSON.stringify({ draft: { id: PID, code: editor.getValue() } })], { type: "application/json" })); } catch (e) {} }
  });
  window.addEventListener("themechange", function () {
    if (window.monaco) { monaco.editor.setTheme(monacoTheme()); colorizeSolution(); }
  });
  $("resetCode").onclick = function () {
    if (editor && confirm("Reset the editor to the starter code? Your current code will be lost.")) editor.setValue(P.starterCode);
  };

  /* ---------------- test cases ---------------- */
  function paramNames() { return (P.params || []).map(function (p) { return p.name; }); }
  function buildCases() {
    cases = (P.exampleTests || []).map(function (t) { return { example: true, vals: valsFromTest(t) }; });
    if (!cases.length) cases.push({ example: false, vals: blankVals() });
  }
  function valsFromTest(t) {
    if (P.kind === "design") return [JSON.stringify({ ops: t.ops, args: t.args })];
    if (P.kind === "roundtrip") return [JSON.stringify(t.input)];
    return (t.args || []).map(function (a) { return JSON.stringify(a); });
  }
  function blankVals() {
    if (P.kind === "design") return ['{"ops": [], "args": []}'];
    if (P.kind === "roundtrip") return [""];
    return paramNames().map(function () { return ""; });
  }
  function fieldLabels() {
    if (P.kind === "design") return ['{"ops", "args"}'];
    if (P.kind === "roundtrip") return ["input"];
    return paramNames();
  }

  function renderConsole() {
    document.querySelectorAll("#console .tab").forEach(function (b) { b.classList.toggle("active", b.dataset.c === ctab); });
    if (ctab === "case") renderCases(); else renderOutput();
  }
  $("console").querySelector(".ctabs").addEventListener("click", function (e) {
    var b = e.target.closest(".tab"); if (!b) return;
    ctab = b.dataset.c; openConsole(true); renderConsole();
  });

  function renderCases() {
    var c = cases[curCase], labels = fieldLabels(), h = '<div class="casebar">';
    cases.forEach(function (x, i) {
      h += '<button class="casebtn' + (i === curCase ? " active" : "") + '" data-case="' + i + '">Case ' + (i + 1) + (x.example ? "" : '<span class="x" data-del="' + i + '" title="Remove">&times;</span>') + "</button>";
    });
    h += '<button class="casebtn" data-add="1" title="Add a custom case">+</button></div>';
    c.vals.forEach(function (v, i) {
      h += '<div class="field"><label>' + esc(labels[i]) + ' =</label><textarea rows="' + Math.min(6, Math.max(1, v.split("\n").length)) + '" data-f="' + i + '" spellcheck="false"' + (c.example ? " readonly" : "") + ">" + esc(v) + '</textarea><div class="err" id="err' + i + '"></div></div>';
    });
    if (c.example) h += '<div class="note">Example cases are fixed. Press + to copy this case into an editable custom case.</div>';
    else if (P.kind === "function") h += '<div class="note">Values are JSON, e.g. [1,2,3,3] or "abc". Custom cases show output only (no expected value).</div>';
    $("cbody").innerHTML = h;
  }
  $("cbody").addEventListener("click", function (e) {
    if (ctab !== "case") { var ob = e.target.closest("[data-oc]"); if (ob) { outCase = +ob.dataset.oc; renderOutput(); } return; }
    var d = e.target.closest("[data-del]");
    if (d) { var i = +d.dataset.del; cases.splice(i, 1); curCase = Math.min(curCase, cases.length - 1); if (curCase < 0) curCase = 0; renderCases(); e.stopPropagation(); return; }
    var a = e.target.closest("[data-add]");
    if (a) { cases.push({ example: false, vals: cases[curCase] ? cases[curCase].vals.slice() : blankVals() }); curCase = cases.length - 1; renderCases(); return; }
    var b = e.target.closest("[data-case]");
    if (b) { curCase = +b.dataset.case; renderCases(); }
  });
  $("cbody").addEventListener("input", function (e) {
    var t = e.target; if (t.dataset.f === undefined) return;
    cases[curCase].vals[+t.dataset.f] = t.value;
    var er = $("err" + t.dataset.f); if (er) er.textContent = "";
  });

  function collectCustom() {
    var out = [], bad = null;
    cases.forEach(function (c, ci) {
      if (c.example) return;
      try {
        if (P.kind === "design") {
          var o = JSON.parse(c.vals[0]);
          if (!o || !Array.isArray(o.ops) || !Array.isArray(o.args)) throw new Error('expected {"ops": [...], "args": [...]}');
          out.push({ ops: o.ops, args: o.args });
        } else if (P.kind === "roundtrip") out.push({ input: JSON.parse(c.vals[0]) });
        else out.push({ args: c.vals.map(function (v, i) {
          try { return JSON.parse(v); } catch (e) { var er = new Error(paramNames()[i] + ": " + e.message); er.field = i; throw er; }
        }) });
      } catch (e) { if (!bad) bad = { ci: ci, msg: e.message, field: e.field || 0 }; }
    });
    return bad ? { error: bad } : { cases: out };
  }

  /* ---------------- run / submit ---------------- */
  var outCase = 0;
  function openConsole(open) {
    $("console").classList.toggle("collapsed", !open);
    $("hsplit").style.display = open ? "" : "none";
  }
  $("hsplit").style.display = "none";
  $("conBtn").onclick = function () { openConsole($("console").classList.contains("collapsed")); };

  function setBusy(b, which) {
    busy = b; $("runBtn").disabled = b; $("subBtn").disabled = b;
    $("runBtn").innerHTML = b && which === "run" ? '<span class="spin"></span>Running' : "Run";
    $("subBtn").innerHTML = b && which === "submit" ? '<span class="spin"></span>Judging' : "Submit";
  }

  function doRun() {
    if (busy || !editor) return;
    var c = collectCustom();
    if (c.error) {
      ctab = "case"; openConsole(true); curCase = c.error.ci; renderConsole();
      var er = $("err" + c.error.field); if (er) er.textContent = "Invalid JSON: " + c.error.msg;
      return;
    }
    ctab = "out"; openConsole(true);
    lastOut = null; $("cbody").innerHTML = '<div class="empty"><span class="spin"></span>Running...</div>'; renderTabs();
    setBusy(true, "run");
    api("/api/run", { id: PID, code: editor.getValue(), cases: c.cases }).then(function (res) {
      lastOut = { mode: "run", res: res }; outCase = firstBad(res);
    }).catch(function (e) { lastOut = { mode: "run", fail: e.message }; })
      .then(function () { setBusy(false); renderConsole(); });
  }
  function doSubmit() {
    if (busy || !editor) return;
    ctab = "out"; openConsole(true);
    lastOut = null; $("cbody").innerHTML = '<div class="empty"><span class="spin"></span>Judging against all tests...</div>'; renderTabs();
    setBusy(true, "submit");
    api("/api/submit", { id: PID, code: editor.getValue() }).then(function (res) {
      lastOut = { mode: "submit", res: res }; outCase = firstBad(res);
      if (res.accepted) setSolved();
      return api("/api/progress").then(function (p) { progress.submissions = p.submissions || {}; progress.solved = p.solved || progress.solved; if (ltab === "subs") renderSubs(); }).catch(function () {});
    }).catch(function (e) { lastOut = { mode: "submit", fail: e.message }; })
      .then(function () { setBusy(false); renderConsole(); });
  }
  function renderTabs() { document.querySelectorAll("#console .tab").forEach(function (b) { b.classList.toggle("active", b.dataset.c === ctab); }); }
  $("runBtn").onclick = doRun; $("subBtn").onclick = doSubmit;
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "Enter") { e.preventDefault(); doRun(); }
    else if (e.key === "'") { e.preventDefault(); doSubmit(); }
  });

  function firstBad(res) {
    var r = res.results || [];
    for (var i = 0; i < r.length; i++) if (r[i].ok === false || r[i].error) return i;
    return 0;
  }
  function caseStatus(r) {
    if (r.error) return /^Time Limit Exceeded/.test(r.error) ? "Time Limit Exceeded" : "Runtime Error";
    if (r.ok === null) return "Output";
    return r.ok ? "Accepted" : "Wrong Answer";
  }
  function verdict(res) {
    if (res.status === "compile_error") return "Compile Error";
    if (res.status === "error") return /^Time Limit Exceeded/.test(res.error || "") ? "Time Limit Exceeded" : "Runtime Error";
    var rs = res.results || [];
    for (var i = 0; i < rs.length; i++) if (rs[i].error) return caseStatus(rs[i]);
    if (res.accepted) return "Accepted";
    if (res.total === 0) return "No judged cases";
    return "Wrong Answer";
  }
  function show(v) { return v === undefined ? "" : JSON.stringify(v); }
  function blk(k, txt, cls) { return '<div class="blk"><div class="k">' + k + '</div><pre class="' + (cls || "") + '">' + esc(txt) + "</pre></div>"; }

  function renderOutput() {
    if (!lastOut) { $("cbody").innerHTML = '<div class="hint-empty">Run your code to see the output here. (Ctrl/Cmd+Enter to run, Ctrl/Cmd+\' to submit)</div>'; return; }
    if (lastOut.fail) { $("cbody").innerHTML = '<div class="verdict bad">Request failed</div>' + blk("Error", lastOut.fail, "errtxt"); return; }
    var res = lastOut.res, v = verdict(res), ok = v === "Accepted", rs = res.results || [], h = "";
    h += '<div class="verdict ' + (ok ? "ok" : "bad") + '">' + v + "</div>";
    if (res.total) h += '<div class="out-meta">' + res.passed + "/" + res.total + " " + (lastOut.mode === "submit" ? "test cases passed" : "cases passed") + "</div>";
    if (res.status !== "ok" && res.error) h += blk(res.status === "compile_error" ? "Compile error" : "Error", res.error, "errtxt");
    if (lastOut.mode === "submit") {
      if (ok) {
        h += '<div class="banner"><b>Accepted.</b> All ' + res.total + " test cases passed. Problem marked as solved.</div>";
      } else if (rs.length) {
        var bi = firstBad(rs.length ? res : res), r = rs[bi];
        h += '<div class="banner bad">Failed on test case ' + (bi + 1) + " of " + rs.length + ".</div>";
        h += caseDetail(r);
      }
    } else if (rs.length) {
      h += '<div class="casebar">' + rs.map(function (r, i) {
        var cls = r.ok === false || r.error ? "fail" : r.ok ? "pass" : "";
        return '<button class="casebtn ' + cls + (i === outCase ? " active" : "") + '" data-oc="' + i + '">Case ' + (i + 1) + "</button>";
      }).join("") + "</div>";
      var r2 = rs[Math.min(outCase, rs.length - 1)];
      h += '<div class="out-meta"><b class="' + (r2.ok ? "easy" : r2.ok === null && !r2.error ? "" : "hard") + '">' + caseStatus(r2) + "</b> &nbsp; " + (r2.ms != null ? r2.ms + " ms" : "") + "</div>" + caseDetail(r2);
    }
    $("cbody").innerHTML = h;
  }
  function caseDetail(r) {
    var h = blk("Input", r.input);
    h += blk("Output", r.error && r.got == null ? "" : show(r.got));
    if (r.ok !== null) h += blk("Expected", show(r.expected));
    if (r.stdout) h += blk("Stdout", r.stdout);
    if (r.error) h += blk("Error", r.error, "errtxt");
    return h;
  }

  /* ---------------- splitters ---------------- */
  function drag(handle, onmove) {
    handle.addEventListener("pointerdown", function (e) {
      e.preventDefault(); handle.setPointerCapture(e.pointerId); handle.classList.add("dragging");
      document.body.style.userSelect = "none";
      var mv = function (ev) { onmove(ev); };
      var up = function () {
        handle.classList.remove("dragging"); document.body.style.userSelect = "";
        handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up);
        try { localStorage.setItem("neet75-layout", JSON.stringify({ w: document.documentElement.style.getPropertyValue("--leftw"), h: document.documentElement.style.getPropertyValue("--conh") })); } catch (x) {}
      };
      handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up);
    });
  }
  drag($("vsplit"), function (e) {
    var r = $("main").getBoundingClientRect(), x = Math.min(Math.max(e.clientX - r.left, 320), r.width - 380);
    document.documentElement.style.setProperty("--leftw", x + "px");
  });
  drag($("hsplit"), function (e) {
    var r = $("right").getBoundingClientRect(), h = Math.min(Math.max(r.bottom - e.clientY - 52, 90), r.height - 52 - 120);
    document.documentElement.style.setProperty("--conh", h + "px");
  });
  try {
    var lay = JSON.parse(localStorage.getItem("neet75-layout") || "null");
    if (lay) { if (lay.w) document.documentElement.style.setProperty("--leftw", lay.w); if (lay.h) document.documentElement.style.setProperty("--conh", lay.h); }
  } catch (e) {}

  init();
})();
