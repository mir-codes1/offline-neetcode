(function () {
  var TOTALS = { Easy: 19, Medium: 49, Hard: 7 };
  var problems = [], prog = { solved: {}, starred: {} };
  var $ = function (id) { return document.getElementById(id); };

  $("themebtn").innerHTML = icon("sun");
  $("i-ok").innerHTML = icon("check");
  $("i-star").innerHTML = icon("star");
  $("i-search").innerHTML = icon("search");
  $("rand").innerHTML = icon("shuffle");
  $("reset").innerHTML = icon("trash");

  function load() {
    return api("/api/problems").then(function (rows) {
      problems = rows.sort(function (a, b) { return a.id - b.id; });
      prog.solved = {}; prog.starred = {};
      rows.forEach(function (p) { if (p.solved) prog.solved[p.id] = 1; if (p.starred) prog.starred[p.id] = 1; });
      render();
    }).catch(function (e) {
      $("sections").innerHTML = '<div class="empty">Could not load problems: ' + esc(e.message) + "</div>";
    });
  }

  function stats() {
    var s = { Easy: 0, Medium: 0, Hard: 0 }, seen = { Easy: 0, Medium: 0, Hard: 0 }, solved = 0, starred = 0;
    problems.forEach(function (p) {
      seen[p.difficulty] = (seen[p.difficulty] || 0) + 1;
      if (p.solved) { solved++; s[p.difficulty]++; }
      if (p.starred) starred++;
    });
    var tot = {};
    ["Easy", "Medium", "Hard"].forEach(function (d) { tot[d] = Math.max(TOTALS[d], seen[d]); });
    $("solvedC").textContent = solved + "/" + Math.max(75, problems.length);
    $("starC").textContent = starred;
    $("diffrows").innerHTML = ["Easy", "Medium", "Hard"].map(function (d) {
      return '<div><b class="' + diffClass(d) + '">' + d + '</b><span class="n">' + s[d] + "/" + tot[d] + "</span></div>";
    }).join("");
    var N = Math.max(75, problems.length), R = 52, C = 2 * Math.PI * R, off = 0, arcs = "";
    ["Easy", "Medium", "Hard"].forEach(function (d) {
      var len = C * s[d] / N;
      if (len > 0) arcs += '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--' + diffClass(d) + ')" stroke-width="8" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + (-off) + '"/>';
      off += len;
    });
    $("ring").innerHTML = '<svg width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="' + R + '" fill="none" stroke="var(--border)" stroke-width="8"/>' + arcs +
      '</svg><div class="mid"><b>' + solved + "</b><small>/" + N + "<br>Solved</small></div>";
  }

  function filtered() {
    var q = $("q").value.trim().toLowerCase(), d = $("fDiff").value, st = $("fStatus").value, sr = $("fStar").value;
    return problems.filter(function (p) {
      if (q && p.title.toLowerCase().indexOf(q) < 0 && String(p.id) !== q && p.topic.toLowerCase().indexOf(q) < 0) return false;
      if (d && p.difficulty !== d) return false;
      if (st === "solved" && !p.solved) return false;
      if (st === "todo" && p.solved) return false;
      if (sr && !p.starred) return false;
      return true;
    });
  }

  function render() {
    stats();
    var list = filtered(), groups = [], idx = {};
    list.forEach(function (p) {
      if (!(p.topic in idx)) { idx[p.topic] = groups.length; groups.push({ topic: p.topic, items: [] }); }
      groups[idx[p.topic]].items.push(p);
    });
    if (!groups.length) { $("sections").innerHTML = '<div class="empty">No problems match.</div>'; return; }
    $("sections").innerHTML = groups.map(function (g) {
      return '<section class="section"><h2>' + esc(g.topic) + '</h2><table class="plist"><thead><tr><th class="c">Status</th><th class="c">Star</th><th>Problem</th><th class="diff">Difficulty</th><th class="c">Solution</th></tr></thead><tbody>' +
        g.items.map(function (p) {
          return "<tr><td class=\"c\"><span class=\"chk" + (p.solved ? "" : " off") + '" title="' + (p.solved ? "Solved" : "Not solved") + '">' + (p.solved ? icon("check") : '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>') + "</span></td>" +
            '<td class="c"><button class="star' + (p.starred ? " on" : "") + '" data-id="' + p.id + '" title="Star">' + icon("star") + "</button></td>" +
            '<td><span class="pnum">' + p.id + '</span><a class="ptitle" href="/problem/' + p.id + '">' + esc(p.title) + "</a></td>" +
            '<td class="diff ' + diffClass(p.difficulty) + '">' + esc(p.difficulty) + "</td>" +
            '<td class="c"><a class="sol" href="/problem/' + p.id + '#solution" title="Solution">' + icon("doc") + "</a></td></tr>";
        }).join("") + "</tbody></table></section>";
    }).join("");
  }

  $("sections").addEventListener("click", function (e) {
    var b = e.target.closest(".star");
    if (!b) return;
    var id = +b.dataset.id, p = problems.filter(function (x) { return x.id === id; })[0];
    p.starred = !p.starred;
    render();
    api("/api/progress", { star: { id: id, value: p.starred } }).catch(function () { p.starred = !p.starred; render(); });
  });
  ["q", "fDiff", "fStatus", "fStar"].forEach(function (id) { $(id).addEventListener("input", render); });
  $("rand").onclick = function () {
    var pool = problems.filter(function (p) { return !p.solved; });
    if (!pool.length) pool = problems;
    if (pool.length) location.href = "/problem/" + pool[Math.floor(Math.random() * pool.length)].id;
  };
  $("reset").onclick = function () {
    if (!confirm("Reset ALL progress (solved, starred, saved drafts and submissions)? This cannot be undone.")) return;
    api("/api/progress", { reset: true }).then(load);
  };
  load();
})();
