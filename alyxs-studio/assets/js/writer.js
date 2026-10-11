/* Alyx's Studio — the Writing room (owner only, private).
   A place to finish an article: write or paste, and the page keeps reading along —
   word count, information density, repeats grouped and coloured, versions kept beside the paragraph
   they belong to, topic and timeline order, hints when a paragraph drifts from the thesis,
   missing citations, MLA 9 slips, Portuguese spelling. Gemini (with your key) or a copied prompt
   does the parts that need judgment; nothing changes in your text until you accept it.
   Everything is saved to the private repository (studio-drafts → papers/), never to the website. */
(function () {
  "use strict";
  var A = function () { return window.AlyxAnalyze; };
  var E = function () { return window.AlyxEditor; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  function toast(m) { if (E() && E().toast) E().toast(m); }
  function fmtN(n) { return Number(n || 0).toLocaleString(); }
  var COLORS = ["#e4572e", "#2e86ab", "#7a9e3e", "#a14ebf", "#d4a017", "#17a398", "#c2185b", "#5d6d7e", "#ef8354", "#3f51b5"];

  var W = { ctx: null, list: null, listSha: null, paper: null, sha: null, view: "write", an: null, history: [], status: "", ai: null, aiSha: null, timers: {} };

  /* ---------- storage (private repository) ---------- */
  function priv() { return E().priv; }
  function loadList() {
    return priv().read("papers/index.json").then(function (r) { W.list = (r && r.data && r.data.papers) || []; W.listSha = r && r.sha; })
      .catch(function () { W.list = []; W.failed = true; });
  }
  function saveList() {
    clearTimeout(W.timers.list);
    W.timers.list = setTimeout(function () {
      priv().write("papers/index.json", { papers: W.list }, W.listSha).then(function (sha) { W.listSha = sha; }).catch(function () {});
    }, 1500);
  }
  function loadAI() {
    if (W.ai) return Promise.resolve(W.ai);
    return priv().read("journal/settings.json").then(function (r) { W.ai = (r && r.data) || {}; W.aiSha = r && r.sha; return W.ai; }).catch(function () { W.ai = {}; return W.ai; });
  }
  function saveAI() { priv().write("journal/settings.json", W.ai, W.aiSha).then(function (sha) { W.aiSha = sha; }).catch(function () {}); }
  function openPaper(id) {
    W.paper = null; W.an = null; W.history = []; W.view = "write";
    render();
    return priv().read("papers/" + id + ".json").then(function (r) {
      var cloud = r && r.data, local = null;
      try { local = JSON.parse(localStorage.getItem("alyx-paper:" + id) || "null"); } catch (e) {}
      W.sha = r && r.sha;
      if (local && (!cloud || (local.updated || 0) > (cloud.updated || 0))) { W.paper = local; setStatus("Restored changes not yet saved"); scheduleSave(); }
      else W.paper = cloud || { id: id, title: "Untitled", body: "" };
      fill(W.paper);
      analyzeNow();
      render();
    }).catch(function (e) { console.error(e); W.paper = null; toast("Couldn't open this paper. Check your sign-in."); render(); });
  }
  function fill(p) {
    p.title = p.title || "Untitled"; p.body = p.body || ""; p.thesis = p.thesis || ""; p.keywords = p.keywords || ""; p.readers = p.readers || "";
    p.samples = p.samples || ""; p.alternatives = p.alternatives || []; p.english = p.english || {}; p.notes = p.notes || ""; p.pt = p.pt || "pt-PT";
    return p;
  }
  function setStatus(t) { W.status = t; var el = $(".wr-status"); if (el) el.textContent = t; }
  function scheduleSave() {
    var p = W.paper; if (!p) return;
    p.updated = Date.now();
    try { localStorage.setItem("alyx-paper:" + p.id, JSON.stringify(p)); } catch (e) {}
    setStatus("Saving…");
    clearTimeout(W.timers.save);
    W.timers.save = setTimeout(function () {
      priv().write("papers/" + p.id + ".json", p, W.sha).then(function (sha) {
        W.sha = sha; setStatus("✓ Saved privately");
        try { localStorage.removeItem("alyx-paper:" + p.id); } catch (e) {}
        var entry = (W.list || []).filter(function (x) { return x.id === p.id; })[0], words = A().count(p.body).total;
        if (!entry) { entry = { id: p.id }; (W.list = W.list || []).unshift(entry); }
        if (entry.title !== p.title || entry.words !== words || Date.now() - (entry.updated || 0) > 6e4) { entry.title = p.title; entry.words = words; entry.updated = Date.now(); saveList(); }
      }).catch(function (e) { console.error(e); setStatus("Not saved yet — kept on this device"); });
    }, 2200);
  }
  function remember() { if (!W.paper) return; W.history.push(W.paper.body); if (W.history.length > 40) W.history.shift(); }
  function setBody(text, note) {
    remember();
    W.paper.body = text;
    analyzeNow(); scheduleSave(); render();
    if (note) toast(note);
  }

  /* ---------- analysis ---------- */
  function analyzeNow() {
    var p = W.paper; if (!p) return;
    W.an = A().analyze(p.body, { thesis: p.thesis, keywords: p.keywords, alternatives: (p.alternatives || []).map(function (x) { return x.text; }) });
  }
  function paras() { return A().paragraphs(W.paper.body); }
  function joinParas(list) { return list.join("\n\n"); }

  /* ---------- mounting ---------- */
  function mount(ctx) {
    W.ctx = ctx;
    var id = (ctx.hash.match(/^p=(.+)$/) || [])[1];
    if (W.list == null) { ctx.el.innerHTML = '<p class="empty">Opening your writing room…</p>'; loadList().then(function () { loadAI(); mount(ctx); }); return; }
    if (id && (!W.paper || W.paper.id !== id)) return openPaper(id);
    if (!id) W.paper = null;
    render();
  }
  function render() {
    var el = W.ctx && W.ctx.el; if (!el) return;
    if (!W.paper) return renderList(el);
    var p = W.paper, c = W.an ? W.an.count : A().count(p.body);
    var tabs = [["write", "Write"], ["review", "Review"], ["organize", "Organize"], ["inbox", "Paste & sort"], ["check", "Check"], ["english", "English"], ["setup", "Thesis & style"]];
    el.innerHTML =
      '<div class="wr-top"><a class="wr-back" href="#">← All papers</a>' +
        '<input class="wr-title" value="' + esc(p.title) + '" aria-label="Title">' +
        '<span class="wr-count" title="Chinese characters + English words">' + fmtN(c.total) + " 字/words · " + fmtN(c.cjk) + " 汉字 · " + fmtN(c.words) + ' English</span>' +
        '<span class="wr-status">' + esc(W.status) + "</span>" +
        (W.history.length ? '<button type="button" class="pill" data-w="undo">Undo</button>' : "") + "</div>" +
      '<nav class="wr-tabs">' + tabs.map(function (t) { return '<button type="button" class="chip' + (W.view === t[0] ? " on" : "") + '" data-w="tab" data-v="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</nav>" +
      '<div class="wr-body"></div>';
    var body = $(".wr-body", el);
    ({ write: viewWrite, review: viewReview, organize: viewOrganize, inbox: viewInbox, check: viewCheck, english: viewEnglish, setup: viewSetup }[W.view] || viewWrite)(body);
    wireTop(el);
  }
  function wireTop(el) {
    var t = $(".wr-title", el);
    t.addEventListener("input", function () { W.paper.title = t.value; scheduleSave(); });
    $(".wr-back", el).addEventListener("click", function (e) { e.preventDefault(); flushWrite(); W.ctx.setHash(""); });
    el.onclick = function (e) {
      var b = e.target.closest("[data-w]"); if (!b) return;
      var k = b.getAttribute("data-w");
      if (k === "tab") { flushWrite(); W.view = b.getAttribute("data-v"); render(); }
      if (k === "undo") { if (!W.history.length) return; W.paper.body = W.history.pop(); analyzeNow(); scheduleSave(); render(); toast("Undone."); }
      action(k, b);
    };
  }

  /* ---------- list of papers ---------- */
  function renderList(el) {
    var list = (W.list || []).slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    el.innerHTML = '<div class="page-head"><h1>Writing room</h1><p class="intro">Your articles and drafts. Only you can see this page; everything is saved privately as you type.</p></div>' +
      (W.failed ? '<p class="j-hint">Private storage couldn\'t open. Open /admin once in this browser to sign in, then reload.</p>' : "") +
      '<p class="owner-tools"><button type="button" class="pill solid" data-l="new">+ New paper</button></p>' +
      (list.length ? '<ul class="wr-list">' + list.map(function (x) {
        return '<li><a href="#p=' + esc(x.id) + '"><span class="wr-l-title">' + esc(x.title || "Untitled") + '</span><span class="wr-l-meta">' + fmtN(x.words || 0) + " 字/words · " +
          (x.updated ? new Date(x.updated).toLocaleDateString() : "") + '</span></a><button type="button" class="mini-btn" data-l="del" data-id="' + esc(x.id) + '">Delete</button></li>';
      }).join("") + "</ul>" : '<p class="empty">No papers yet.</p>');
    el.onclick = function (e) {
      var b = e.target.closest("[data-l]"); if (!b) return;
      if (b.getAttribute("data-l") === "new") {
        var id = "paper-" + stamp();
        W.paper = fill({ id: id, title: "Untitled", body: "", created: Date.now() });
        (W.list = W.list || []).unshift({ id: id, title: "Untitled", words: 0, updated: Date.now() });
        saveList(); scheduleSave(); analyzeNow();
        W.view = "setup";
        W.ctx.setHash("p=" + id);
      }
      if (b.getAttribute("data-l") === "del") {
        var did = b.getAttribute("data-id");
        if (!window.confirm("Delete this paper from the list? (Its file stays in your private repository, in papers/.)")) return;
        W.list = W.list.filter(function (x) { return x.id !== did; }); saveList(); renderList(el);
      }
    };
  }

  /* ---------- Write: the document, with marks in the margin ---------- */
  function paraHTML(t) { return "<p>" + esc(t) + "</p>"; }
  function viewWrite(body) {
    var an = W.an;
    body.innerHTML = '<div class="wr-grid"><div class="wr-docwrap"><div class="wr-doc" contenteditable="true" spellcheck="true" data-ph="Write, or paste your draft here. 写或粘贴草稿。">' +
      paras().map(paraHTML).join("") + '</div><div class="wr-gutter" aria-hidden="false"></div></div>' + sidePanel() + "</div>" +
      '<div class="wr-pastebar" hidden></div>';
    var doc = $(".wr-doc", body), timer;
    decorate(doc, body);
    doc.addEventListener("input", function () {
      clearTimeout(timer);
      setStatus("Typing…");
      timer = setTimeout(function () { flushWrite(); decorate(doc, body); refreshSide(body); }, 900);
    });
    doc.addEventListener("paste", function (e) {
      var t = e.clipboardData && e.clipboardData.getData("text/plain");
      if (t == null) return;
      e.preventDefault();
      var ps = A().paragraphs(t);
      if (ps.length >= 3 && paras().length >= 2) return askSort(body, doc, t, ps);
      document.execCommand("insertHTML", false, ps.map(paraHTML).join("") || esc(t));
    });
    doc.addEventListener("keyup", selCount); doc.addEventListener("mouseup", selCount);
    window.onresize = function () { decorate(doc, body); };
    if (!paras().length) doc.focus();
  }
  function selCount() {
    var s = String(window.getSelection ? window.getSelection() : "");
    var el = $(".wr-count"); if (!el || !W.an) return;
    var c = W.an.count, sc = s.trim() ? A().count(s) : null;
    el.textContent = (sc ? "Selected " + fmtN(sc.total) + " · " : "") + fmtN(c.total) + " 字/words · " + fmtN(c.cjk) + " 汉字 · " + fmtN(c.words) + " English";
  }
  function readDoc(doc) {
    var out = [];
    Array.prototype.forEach.call(doc.childNodes, function (n) {
      var t = (n.nodeType === 3 ? n.nodeValue : n.innerText || "").replace(/ /g, " ");
      t.split(/\n+/).forEach(function (x) { if (x.trim()) out.push(x.trim()); });
    });
    return out;
  }
  function flushWrite() {
    var doc = $(".wr-doc"); if (!doc || !W.paper) return;
    var text = joinParas(readDoc(doc));
    if (text === W.paper.body) { setStatus(W.status === "Typing…" ? "✓ Saved privately" : W.status); return; }
    W.paper.body = text; analyzeNow(); scheduleSave();
    var c = W.an.count, el = $(".wr-count"); if (el) el.textContent = fmtN(c.total) + " 字/words · " + fmtN(c.cjk) + " 汉字 · " + fmtN(c.words) + " English";
  }
  function tagFor(p) {
    var bits = [];
    if (p.heading) return "";
    bits.push("★" + p.score);
    if (p.dup != null) bits.push(p.isBest ? "best version" : "repeat");
    if (p.versions && p.versions.length) bits.push(p.versions.length + (p.versions.length === 1 ? " version" : " versions"));
    if (p.drift) bits.push("off topic?");
    if (p.needsCite) bits.push("cite?");
    if (p.years.length) bits.push(Math.min.apply(null, p.years));
    return bits.join(" · ");
  }
  function decorate(doc, body) {
    var an = W.an; if (!an) return;
    var blocks = Array.prototype.filter.call(doc.children, function (n) { return (n.innerText || "").trim(); });
    var gutter = $(".wr-gutter", body); gutter.innerHTML = "";
    blocks.forEach(function (b, i) {
      var p = an.paragraphs[i]; if (!p) return;
      b.className = (p.dup != null ? "dup " : "") + (p.drift ? "drift " : "") + (p.score <= 20 && !p.heading ? "weak " : "") + (p.score >= 80 ? "strong " : "") + (p.heading && !p.ref ? "head" : "") + (p.ref ? " ref" : "");
      b.style.setProperty("--dup", p.dup != null ? COLORS[p.dup % COLORS.length] : "transparent");
      var tag = tagFor(p); if (!tag) return;
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "wr-chip" + (p.dup != null ? " dup" : "") + (p.drift ? " drift" : "") + (p.needsCite ? " cite" : "");
      chip.style.top = b.offsetTop + "px";
      if (p.dup != null) chip.style.setProperty("--dup", COLORS[p.dup % COLORS.length]);
      chip.textContent = tag;
      chip.setAttribute("data-w", "para"); chip.setAttribute("data-i", i);
      gutter.appendChild(chip);
    });
  }
  function sidePanel() {
    var an = W.an || { paragraphs: [], dupGroups: [], topics: [] }, p = W.paper;
    var real = an.paragraphs.filter(function (x) { return !x.heading; });
    var avg = real.length ? Math.round(real.reduce(function (a, x) { return a + x.score; }, 0) / real.length) : 0;
    var drift = real.filter(function (x) { return x.drift; }).length, cite = real.reduce(function (a, x) { return a + x.needsCite; }, 0);
    var weak = real.filter(function (x) { return x.score <= 20; }).length;
    return '<aside class="wr-side">' +
      (p.thesis ? '<p class="wr-thesis"><b>Thesis</b> ' + esc(p.thesis) + "</p>" : '<p class="wr-thesis muted"><button type="button" class="linkish" data-w="tab" data-v="setup">Write your thesis</button> so the page can tell what is on topic.</p>') +
      '<ul class="wr-stats">' +
        "<li><b>" + real.length + "</b> paragraphs · density avg <b>" + avg + "</b></li>" +
        (an.dupGroups.length ? '<li><button type="button" class="linkish" data-w="tab" data-v="organize">' + an.dupGroups.length + (an.dupGroups.length === 1 ? " set" : " sets") + " of repeats</button> (same colour = same content)</li>" : "<li>No repeats found</li>") +
        (weak ? "<li>" + weak + " thin paragraphs (much wording, little information)</li>" : "") +
        (drift ? '<li><button type="button" class="linkish" data-w="tab" data-v="organize">' + drift + " may be off topic</button></li>" : "") +
        (cite ? '<li><button type="button" class="linkish" data-w="tab" data-v="check">' + cite + " sentences may need a citation</button></li>" : "") +
        ((p.alternatives || []).length ? "<li>" + p.alternatives.length + " versions kept aside</li>" : "") + "</ul>" +
      '<p class="wr-legend"><span class="lg strong">★80+ dense</span> <span class="lg weak">thin</span> <span class="lg dup">colour bar = repeat</span> <span class="lg drift">off topic?</span></p>' +
      '<p class="j-hint">Click a label in the margin for that paragraph: explain it, make it denser, see its versions…</p></aside>';
  }
  function refreshSide(body) { var s = $(".wr-side", body); if (s) s.outerHTML = sidePanel(); }
  function askSort(body, doc, text, ps) {
    var bar = $(".wr-pastebar", body);
    bar.hidden = false;
    bar.innerHTML = "<span>You pasted " + ps.length + " paragraphs.</span>" +
      '<button type="button" class="pill solid" data-p="sort">Sort them into the draft</button><button type="button" class="pill" data-p="asis">Paste as is</button>';
    bar.onclick = function (e) {
      var b = e.target.closest("[data-p]"); if (!b) return;
      bar.hidden = true;
      if (b.getAttribute("data-p") === "asis") { doc.focus(); document.execCommand("insertHTML", false, ps.map(paraHTML).join("")); return; }
      flushWrite();
      var res = sortIn(ps, true);
      setBody(res.body, res.note);
    };
  }

  /* ---------- placing pasted text: next to its twin, never lost ---------- */
  function sortIn(list, auto) {
    var body = W.paper.body, n = { repeat: 0, version: 0, replaced: 0, related: 0, new: 0 };
    list.forEach(function (t) {
      var ps = A().paragraphs(body), pl = A().place(t, body);
      if (pl.kind === "repeat") { n.repeat++; return; }
      if (pl.kind === "version") {
        var old = ps[pl.best], an = A().analyze(joinParas([old, t]));
        var better = an.paragraphs[1] && an.paragraphs[0] && an.paragraphs[1].score > an.paragraphs[0].score + 5;
        if (auto && better) { W.paper.alternatives.push({ text: old, at: Date.now() }); ps[pl.best] = t; n.replaced++; }
        else { W.paper.alternatives.push({ text: t, at: Date.now() }); n.version++; }
        body = joinParas(ps); return;
      }
      // new material goes before the Works Cited list, never after it
      var refAt = -1; ps.forEach(function (x, k) { if (refAt < 0 && /^\s*#*\s*(works cited|参考文献|引用文献|bibliography)\s*$/i.test(x)) refAt = k; });
      if (pl.kind === "related" && (refAt < 0 || pl.best < refAt)) { ps.splice(pl.best + 1, 0, t); n.related++; }
      else { if (refAt > -1) ps.splice(refAt, 0, t); else ps.push(t); n.new++; }
      body = joinParas(ps);
    });
    var bits = [];
    if (n.replaced) bits.push(n.replaced + " replaced a weaker version (kept aside)");
    if (n.version) bits.push(n.version + " kept as versions of existing paragraphs");
    if (n.related) bits.push(n.related + " placed next to related paragraphs");
    if (n.new) bits.push(n.new + " new, added at the end");
    if (n.repeat) bits.push(n.repeat + " exact repeats skipped");
    return { body: body, note: bits.join(" · ") || "Nothing new.", counts: n };
  }

  /* ---------- Review: every sentence marked ---------- */
  function sentenceHTML(s) {
    var t = esc(s.text);
    (s.filler || []).forEach(function (f) { t = t.replace(new RegExp(esc(f).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), function (m) { return '<mark class="fl">' + m + "</mark>"; }); });
    var cls = s.top ? "s-top" : s.weak ? "s-weak" : "";
    if (s.needsCite) cls += " s-cite";
    return '<span class="' + cls + '" title="density ' + s.score + (s.needsCite ? " · may need a citation" : "") + '">' + t + "</span>";
  }
  function viewReview(body) {
    var an = W.an;
    body.innerHTML = '<p class="wr-legend"><span class="lg s-top">dense sentence</span> <span class="lg s-weak">thin sentence</span> <mark class="fl">padding</mark> <span class="lg s-cite">needs citation?</span></p>' +
      '<div class="wr-review">' + an.paragraphs.map(function (p) {
        if (p.heading) return '<h3 class="wr-h">' + esc(p.text.replace(/^#+\s*/, "")) + "</h3>";
        return '<div class="wr-rp' + (p.drift ? " drift" : "") + '" style="--dup:' + (p.dup != null ? COLORS[p.dup % COLORS.length] : "transparent") + '">' +
          '<div class="wr-rp-head"><span>¶' + (p.i + 1) + " · ★" + p.score + (p.dup != null ? (p.isBest ? " · best of its repeats" : " · repeat") : "") + (p.drift ? " · off topic?" : "") +
          (p.years.length ? " · " + p.years.join(", ") : "") + (p.versions.length ? " · " + p.versions.length + " versions" : "") + "</span>" + paraButtons(p.i) + "</div>" +
          '<p class="wr-rp-text">' + p.sentences.map(sentenceHTML).join("") + "</p></div>";
      }).join("") + "</div>";
  }
  function paraButtons(i) {
    return '<span class="wr-acts"><button type="button" class="mini-btn" data-w="para" data-i="' + i + '">More…</button></span>';
  }

  /* ---------- the paragraph menu ---------- */
  function paraMenu(i) {
    var an = W.an, p = an.paragraphs[i]; if (!p) return;
    var vers = p.versions.map(function (vi) { return an.alternatives[vi]; });
    var group = p.dup != null ? an.dupGroups[p.dup].members : [];
    var html = '<p class="wr-quote">' + esc(p.text) + "</p>" +
      '<p class="j-hint">★' + p.score + " density" + (p.filler.length ? " · padding: " + esc(p.filler.join(", ")) : "") + (p.drift ? " · seems far from the thesis" : "") + "</p>" +
      '<div class="ed-menu">' +
        '<button type="button" class="pill" data-m="explain">Explain for readers</button>' +
        '<button type="button" class="pill" data-m="denser">Make it denser</button>' +
        '<button type="button" class="pill" data-m="thesis">Tie it to the thesis</button>' +
        (p.needsCite ? '<button type="button" class="pill" data-m="cite">Find the source</button>' : "") +
        (group.length > 1 ? '<button type="button" class="pill" data-m="merge">Merge its ' + group.length + " repeats</button>" : "") +
        '<button type="button" class="pill" data-m="aside">Set aside as a version</button>' +
        '<button type="button" class="pill danger" data-m="delete">Delete</button></div>' +
      (vers.length ? '<h4 class="wr-sub">Versions kept aside (' + vers.length + ')</h4>' + vers.map(function (v) {
        var va = A().analyze(v.text).paragraphs[0] || { score: 0, sentences: [] };
        return '<div class="wr-ver"><p class="j-hint">★' + va.score + ' · tap a sentence to add it to the paragraph</p><p>' + va.sentences.map(function (s, si) {
          return '<button type="button" class="wr-sent" data-m="take" data-v="' + v.i + '" data-s="' + si + '">' + esc(s.text) + "</button>";
        }).join("") + '</p><p class="owner-tools"><button type="button" class="mini-btn" data-m="use" data-v="' + v.i + '">Use this version instead</button><button type="button" class="mini-btn" data-m="dropv" data-v="' + v.i + '">Delete version</button></p></div>';
      }).join("") : "");
    var wrap = sheet("¶" + (i + 1), html);
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest("[data-m]"); if (!b) return;
      var k = b.getAttribute("data-m"), ps = paras();
      if (k === "explain" || k === "denser" || k === "thesis" || k === "cite") { closeSheet(); return runAI(k, { i: i, text: ps[i] }); }
      if (k === "merge") { closeSheet(); return runAI("merge", { i: i, members: group }); }
      if (k === "aside") { W.paper.alternatives.push({ text: ps[i], at: Date.now() }); ps.splice(i, 1); closeSheet(); return setBody(joinParas(ps), "Set aside. It shows as a version of the closest paragraph."); }
      if (k === "delete") { if (!window.confirm("Delete this paragraph? (Undo is at the top.)")) return; ps.splice(i, 1); closeSheet(); return setBody(joinParas(ps)); }
      var vi = +b.getAttribute("data-v"), alt = W.paper.alternatives[vi];
      if (k === "use" && alt) { var old = ps[i]; ps[i] = alt.text; W.paper.alternatives[vi] = { text: old, at: Date.now() }; closeSheet(); return setBody(joinParas(ps), "Swapped. The old wording is kept as a version."); }
      if (k === "dropv" && alt) { W.paper.alternatives.splice(vi, 1); closeSheet(); return setBody(W.paper.body); }
      if (k === "take" && alt) {
        var s = A().analyze(alt.text).paragraphs[0].sentences[+b.getAttribute("data-s")];
        ps[i] = ps[i].replace(/\s*$/, "") + (/[㐀-鿿]/.test(ps[i]) ? "" : " ") + s.text.trim();
        b.disabled = true; b.classList.add("taken");
        remember(); W.paper.body = joinParas(ps); analyzeNow(); scheduleSave(); W.needRender = true;
        toast("Added to the paragraph.");
      }
    });
  }

  /* ---------- Organize: repeats, topics, timeline, off topic ---------- */
  function viewOrganize(body) {
    var an = W.an, ps = paras(), mode = W.orgMode || "topic";
    var short = function (t) { return esc(t.length > 110 ? t.slice(0, 110) + "…" : t); };
    var html = '<div class="ed-tabs">' + [["topic", "By topic"], ["time", "By time"], ["repeats", "Repeats (" + an.dupGroups.length + ")"], ["drift", "Off topic?"], ["aside", "Set aside (" + (W.paper.alternatives || []).length + ")"]].map(function (m) {
      return '<button type="button" class="chip' + (mode === m[0] ? " on" : "") + '" data-o="mode" data-v="' + m[0] + '">' + m[1] + "</button>";
    }).join("") + "</div>";
    if (mode === "topic") {
      var order = topicOrder();
      html += '<p class="j-hint">Paragraphs about the same thing, grouped in the order each topic first appears. Within a topic, repeats are coloured and the strongest is marked ★.</p>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-o="apply-topic">Put the draft in this order</button>' +
        '<button type="button" class="pill" data-o="ai-order">Ask Gemini for the best order</button></p>' +
        an.topics.map(function (t, ti) {
          return '<section class="wr-topic"><h4>' + esc(t.label.join(" · ") || "Topic " + (ti + 1)) + (t.firstYear ? ' <span class="j-hint">from ' + t.firstYear + "</span>" : "") + "</h4><ol>" +
            t.members.map(function (m) { var p = an.paragraphs[m]; return '<li style="--dup:' + (p.dup != null ? COLORS[p.dup % COLORS.length] : "transparent") + '"' + (p.dup != null ? ' class="dup"' : "") + '><span class="wr-n">¶' + (m + 1) + " ★" + p.score + (p.isBest ? " best" : "") + "</span> " + short(p.text) + "</li>"; }).join("") + "</ol></section>";
        }).join("");
      W.pendingOrder = order;
    }
    if (mode === "time") {
      var t = timeOrder();
      html += '<p class="j-hint">Ordered by the earliest year each paragraph mentions; paragraphs without a year stay with the paragraph before them.</p>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-o="apply-time">Put the draft in this order</button></p><ol class="wr-olist">' +
        t.map(function (m) { var p = an.paragraphs[m]; return "<li><span class=\"wr-n\">" + (p.years.length ? Math.min.apply(null, p.years) : "—") + " · ¶" + (m + 1) + "</span> " + short(p.text) + "</li>"; }).join("") + "</ol>";
      W.pendingOrder = t;
    }
    if (mode === "repeats") {
      html += an.dupGroups.length ? '<p class="j-hint">Each set says the same thing. Keep the strongest and set the others aside as versions (their good sentences stay one tap away), or let Gemini merge them.</p>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-o="keep-all">Keep ★ in every set, set the rest aside</button></p>' +
        an.dupGroups.map(function (g, gi) {
          return '<section class="wr-topic" style="--dup:' + COLORS[gi % COLORS.length] + '"><h4><span class="wr-dot"></span>Set ' + (gi + 1) + "</h4><ol>" + g.members.map(function (m) {
            var p = an.paragraphs[m]; return '<li class="dup"><span class="wr-n">¶' + (m + 1) + " ★" + p.score + (m === g.best ? " — strongest" : "") + "</span> " + short(p.text) + "</li>";
          }).join("") + '</ol><p class="owner-tools"><button type="button" class="mini-btn" data-o="keep" data-g="' + gi + '">Keep ★, set the rest aside</button><button type="button" class="mini-btn" data-o="merge" data-g="' + gi + '">Merge with Gemini</button></p></section>';
        }).join("") : '<p class="empty">No repeats.</p>';
    }
    if (mode === "drift") {
      var d = an.paragraphs.filter(function (p) { return p.drift; });
      html += '<p class="j-hint">These share few words with your thesis and the rest of the draft. It is only a hint — ask Gemini to check, rewrite them toward the thesis, or set them aside.</p>' +
        '<p class="owner-tools"><button type="button" class="pill" data-o="ai-fit">Ask Gemini which paragraphs serve the thesis</button></p>' +
        (d.length ? '<ol class="wr-olist">' + d.map(function (p) { return '<li><span class="wr-n">¶' + (p.i + 1) + "</span> " + short(p.text) + ' <button type="button" class="mini-btn" data-w="para" data-i="' + p.i + '">More…</button></li>'; }).join("") + "</ol>" : '<p class="empty">Nothing looks off topic.</p>') +
        (W.fit ? '<h4 class="wr-sub">Gemini\'s view</h4><ol class="wr-olist">' + W.fit.map(function (f) { return "<li><b>¶" + f.n + " " + esc(f.fit) + "</b> " + esc(f.why || "") + "</li>"; }).join("") + "</ol>" : "");
    }
    if (mode === "aside") {
      var alts = W.paper.alternatives || [];
      html += alts.length ? '<p class="j-hint">Earlier wordings and repeats you set aside. Each one also appears under the paragraph it resembles (Write → label → More…).</p><ol class="wr-olist">' +
        alts.map(function (a, ai) { var at = an.alternatives[ai]; return "<li><span class=\"wr-n\">" + (at && at.to > -1 ? "→ ¶" + (at.to + 1) : "no match") + "</span> " + short(a.text) +
          ' <button type="button" class="mini-btn" data-o="restore" data-a="' + ai + '">Put back at the end</button><button type="button" class="mini-btn" data-o="dropa" data-a="' + ai + '">Delete</button></li>'; }).join("") + "</ol>" : '<p class="empty">Nothing set aside.</p>';
    }
    body.innerHTML = html;
    body.onclick = function (e) {
      var b = e.target.closest("[data-o]"); if (!b) return;
      var k = b.getAttribute("data-o"), ps2 = paras();
      if (k === "mode") { W.orgMode = b.getAttribute("data-v"); render(); }
      if (k === "apply-topic" || k === "apply-time") { setBody(joinParas(W.pendingOrder.map(function (m) { return ps2[m]; })), "Reordered. Undo is at the top."); }
      if (k === "keep" || k === "keep-all") {
        var sets = k === "keep" ? [an.dupGroups[+b.getAttribute("data-g")]] : an.dupGroups, drop = {};
        sets.forEach(function (g) { g.members.forEach(function (m) { if (m !== g.best) { drop[m] = 1; W.paper.alternatives.push({ text: ps2[m], at: Date.now() }); } }); });
        setBody(joinParas(ps2.filter(function (x, m) { return !drop[m]; })), "Kept the strongest; the others are set aside as versions.");
      }
      if (k === "merge") runAI("merge", { members: an.dupGroups[+b.getAttribute("data-g")].members, i: an.dupGroups[+b.getAttribute("data-g")].best });
      if (k === "ai-order") runAI("order", {});
      if (k === "ai-fit") runAI("fit", {});
      if (k === "restore") { var a = W.paper.alternatives.splice(+b.getAttribute("data-a"), 1)[0]; var r = sortIn([a.text], false); setBody(r.body); }
      if (k === "dropa") { W.paper.alternatives.splice(+b.getAttribute("data-a"), 1); setBody(W.paper.body); }
      if (b.getAttribute("data-w") === "para") paraMenu(+b.getAttribute("data-i"));
    };
  }
  function topicOrder() {
    var an = W.an, out = [], heads = an.paragraphs.filter(function (p) { return p.heading && !p.ref; }).map(function (p) { return p.i; });
    // headings keep their place at the top of what follows them; refs (Works Cited) stay at the end
    if (heads.length && heads[0] === 0) out.push(0);
    an.topics.forEach(function (t) { t.members.forEach(function (m) { out.push(m); }); });
    an.paragraphs.forEach(function (p) { if (out.indexOf(p.i) < 0 && !p.ref) out.push(p.i); });
    an.paragraphs.forEach(function (p) { if (p.ref) out.push(p.i); });
    return out;
  }
  function timeOrder() {
    var an = W.an, items = [], last = -Infinity;
    an.paragraphs.forEach(function (p) {
      if (p.ref) return;
      var y = p.years.length ? Math.min.apply(null, p.years) : null;
      if (y != null) last = y;
      items.push({ i: p.i, y: y != null ? y : last, own: y != null });
    });
    items.sort(function (a, b) { return (a.y - b.y) || (a.i - b.i); });
    return items.map(function (x) { return x.i; }).concat(an.paragraphs.filter(function (p) { return p.ref; }).map(function (p) { return p.i; }));
  }

  /* ---------- Paste & sort ---------- */
  function viewInbox(body) {
    body.innerHTML = '<p class="j-hint">Paste anything here — a new version from Gemini, a page of notes, thirty pages of drafts. Each paragraph goes where it belongs: an exact repeat is skipped, a new wording of an existing paragraph is kept beside it as a version (or replaces it when it is clearly denser), related text goes next to its neighbour, new material goes to the end. Nothing is lost; Undo is at the top.</p>' +
      '<textarea class="ed-input wr-inbox" rows="12" placeholder="粘贴到这里 · Paste here"></textarea>' +
      '<p class="owner-tools"><label class="ed-check"><input type="checkbox" class="wr-auto" checked> Replace a paragraph when the new wording is clearly denser</label></p>' +
      '<p class="owner-tools"><button type="button" class="pill solid" data-i="sort">Sort into the draft</button><button type="button" class="pill" data-i="preview">Show me first</button></p><div class="wr-inres"></div>';
    var ta = $(".wr-inbox", body), res = $(".wr-inres", body);
    body.onclick = function (e) {
      var b = e.target.closest("[data-i]"); if (!b) return;
      var ps = A().paragraphs(ta.value); if (!ps.length) { ta.focus(); return; }
      if (b.getAttribute("data-i") === "sort") {
        var r = sortIn(ps, $(".wr-auto", body).checked);
        ta.value = ""; setBody(r.body, r.note);
      } else {
        var draft = W.paper.body;
        res.innerHTML = '<ol class="wr-olist">' + ps.map(function (t) {
          var pl = A().place(t, draft), what = { repeat: "exact repeat of ¶" + (pl.exact + 1) + " — skipped", version: "another wording of ¶" + (pl.best + 1), related: "goes after ¶" + (pl.best + 1), new: "new — goes to the end" }[pl.kind];
          return '<li><span class="wr-n">' + what + "</span> " + esc(t.slice(0, 120)) + (t.length > 120 ? "…" : "") + "</li>";
        }).join("") + "</ol>";
      }
    };
  }

  /* ---------- Check: citations, MLA 9, Portuguese ---------- */
  function viewCheck(body) {
    var an = W.an, mla = A().mlaIssues(W.paper.body), pt = A().portuguese(W.paper.body);
    var need = [];
    an.paragraphs.forEach(function (p) { p.sentences.forEach(function (s) { if (s.needsCite) need.push({ i: p.i, s: s.text }); }); });
    body.innerHTML =
      '<section class="wr-topic"><h4>Sentences that may need a citation (' + need.length + ")</h4>" +
        (need.length ? '<ol class="wr-olist">' + need.map(function (n, k) { return '<li><span class="wr-n">¶' + (n.i + 1) + "</span> " + esc(n.s) + ' <button type="button" class="mini-btn" data-c="cite" data-k="' + k + '">Find the source</button></li>'; }).join("") + "</ol>" : '<p class="empty">None found.</p>') + "</section>" +
      '<section class="wr-topic"><h4>MLA 9 (' + mla.issues.length + ")</h4>" +
        (mla.issues.length ? '<ol class="wr-olist">' + mla.issues.map(function (x, k) { return "<li><code>" + esc(x.show || x.found) + "</code>" + (x.fix ? " → <code>" + esc(x.fix) + "</code>" : "") + ' <span class="j-hint">' + esc(x.why) + "</span>" +
          (x.fix ? ' <button type="button" class="mini-btn" data-c="fix" data-k="' + k + '">Fix</button>' : "") + "</li>"; }).join("") + "</ol>" +
          '<p class="owner-tools"><button type="button" class="pill" data-c="fixall">Fix all the simple ones</button></p>' : '<p class="empty">No slips found by the quick check.</p>') +
        '<p class="owner-tools"><button type="button" class="pill" data-c="mla-ai">Ask Gemini to format all citations and the Works Cited in MLA 9</button></p></section>' +
      '<section class="wr-topic"><h4>Portuguese (' + pt.length + ' phrases)</h4><p class="j-hint">Words with Portuguese letters and Latin-script text in brackets. Spelling is checked by LanguageTool (free; the phrases are sent to it). Spelling from the 1820s may be flagged as old-fashioned — keep it if it is a quotation.</p>' +
        '<p class="owner-tools"><select class="ed-input wr-ptv" style="width:auto"><option value="pt-PT"' + (W.paper.pt === "pt-PT" ? " selected" : "") + '>Portugal</option><option value="pt-BR"' + (W.paper.pt === "pt-BR" ? " selected" : "") + '>Brazil</option></select>' +
        '<button type="button" class="pill" data-c="pt">Check spelling</button></p><div class="wr-ptres">' + (pt.length ? '<p class="j-hint">' + pt.map(esc).join(" · ") + "</p>" : "") + "</div></section>";
    body.onclick = function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      var k = b.getAttribute("data-c");
      if (k === "cite") { var n = need[+b.getAttribute("data-k")]; runAI("cite", { i: n.i, text: n.s }); }
      if (k === "fix" || k === "fixall") {
        var list = k === "fix" ? [mla.issues[+b.getAttribute("data-k")]] : mla.issues.filter(function (x) { return x.fix; });
        var t = W.paper.body; list.forEach(function (x) { t = t.split(x.found).join(x.fix); });
        setBody(t, list.length + " fixed.");
      }
      if (k === "mla-ai") runAI("mla", {});
      if (k === "pt") { W.paper.pt = $(".wr-ptv", body).value; scheduleSave(); checkPortuguese(pt, $(".wr-ptres", body)); }
    };
  }
  function checkPortuguese(list, box) {
    if (!list.length) { box.innerHTML = '<p class="empty">No Portuguese found.</p>'; return; }
    box.innerHTML = '<p class="j-hint">Checking…</p>';
    var text = list.join("\n"), lang = W.paper.pt || "pt-PT";
    fetch("https://api.languagetool.org/v2/check", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "language=" + encodeURIComponent(lang) + "&text=" + encodeURIComponent(text) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var ms = (j.matches || []).filter(function (m) { return m.replacements && m.replacements.length; });
        if (!ms.length) { box.innerHTML = '<p class="empty">No spelling problems found.</p>'; return; }
        box.innerHTML = '<ol class="wr-olist">' + ms.map(function (m, k) {
          var wrong = text.substr(m.offset, m.length);
          return "<li><code>" + esc(wrong) + "</code> → " + m.replacements.slice(0, 3).map(function (r, ri) { return '<button type="button" class="mini-btn" data-pt="' + k + '" data-r="' + ri + '">' + esc(r.value) + "</button>"; }).join("") +
            ' <span class="j-hint">' + esc(m.message) + "</span></li>";
        }).join("") + "</ol>";
        box.onclick = function (e) {
          var b = e.target.closest("[data-pt]"); if (!b) return;
          var m = ms[+b.getAttribute("data-pt")], wrong = text.substr(m.offset, m.length), right = m.replacements[+b.getAttribute("data-r")].value;
          var line = text.slice(text.lastIndexOf("\n", m.offset) + 1, (text.indexOf("\n", m.offset) + 1 || text.length + 1) - 1);
          var fixed = line.replace(wrong, right);
          setBody(W.paper.body.split(line).join(fixed), "Changed “" + wrong + "” to “" + right + "”.");
        };
      }).catch(function () { box.innerHTML = '<p class="j-hint">LanguageTool didn\'t answer. Try again in a minute.</p>'; });
  }

  /* ---------- English (optional, side by side) ---------- */
  function hashOf(t) { var h = 0; t = String(t); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return "h" + (h >>> 0).toString(36) + t.length; }
  function viewEnglish(body) {
    var ps = paras(), en = W.paper.english;
    body.innerHTML = '<p class="j-hint">Only when you want it: English beside each paragraph. It stays private here; paragraphs keep their English when you move them.</p>' +
      '<p class="owner-tools"><button type="button" class="pill" data-e="all">Translate empty ones with Gemini</button></p>' +
      '<div class="wr-en">' + ps.map(function (p, i) {
        var h = hashOf(p);
        return '<div class="desk-row"><div class="desk-zh">' + esc(p) + '</div><div class="desk-en"><textarea data-h="' + h + '" rows="3">' + esc(en[h] || "") + "</textarea>" +
          '<div class="desk-tools"><a class="mini-btn" target="_blank" rel="noopener" href="https://www.deepl.com/translator#zh/en-us/' + encodeURIComponent(p).replace(/%2F/g, "%5C%2F") + '">DeepL ↗</a>' +
          '<button type="button" class="mini-btn" data-e="one" data-i="' + i + '">Gemini</button></div></div></div>';
      }).join("") + "</div>";
    var t;
    body.oninput = function (e) { var h = e.target.getAttribute("data-h"); if (!h) return; en[h] = e.target.value; clearTimeout(t); t = setTimeout(scheduleSave, 600); };
    body.onclick = function (e) {
      var b = e.target.closest("[data-e]"); if (!b) return;
      var todo = b.getAttribute("data-e") === "one" ? [+b.getAttribute("data-i")] : ps.map(function (x, i) { return i; }).filter(function (i) { return !en[hashOf(ps[i])]; });
      if (!aiKey()) return runAI("translate", { i: todo[0], text: ps[todo[0]] });
      setStatus("Translating " + todo.length + "…");
      todo.reduce(function (pr, i) {
        return pr.then(function () { return gemini(prompt("translate", { text: ps[i] })).then(function (r) { en[hashOf(ps[i])] = r.text.trim(); var ta = $('textarea[data-h="' + hashOf(ps[i]) + '"]', body); if (ta) ta.value = r.text.trim(); }); });
      }, Promise.resolve()).then(function () { scheduleSave(); setStatus("✓ Translated"); }).catch(function () { setStatus("Gemini didn't answer"); });
    };
  }

  /* ---------- Thesis & style ---------- */
  function viewSetup(body) {
    var p = W.paper, ai = W.ai || {};
    body.innerHTML = '<div class="wr-setup">' +
      '<label class="ed-field"><span class="ed-label">Thesis — the one argument everything should serve</span><textarea class="ed-input" data-s="thesis" rows="3" placeholder="例如：Lucas 第二部分并非影射 Alcipe，而是模仿不同时期的文体，这些文体所处的社会经历着相似的转型。">' + esc(p.thesis) + "</textarea></label>" +
      '<label class="ed-field"><span class="ed-label">Key names and terms (comma separated)</span><input class="ed-input" data-s="keywords" value="' + esc(p.keywords) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Who reads it, and what they already know</span><input class="ed-input" data-s="readers" value="' + esc(p.readers) + '" placeholder="e.g. Lusophone and comparative literature scholars; not specialists in 1820s Rio"></label>' +
      '<label class="ed-field"><span class="ed-label">Style you like — paste passages (yours or earlier drafts) whose writing you want to keep, even if the content is old</span><textarea class="ed-input" data-s="samples" rows="8">' + esc(p.samples) + "</textarea></label>" +
      '<label class="ed-field"><span class="ed-label">Notes to yourself</span><textarea class="ed-input" data-s="notes" rows="4">' + esc(p.notes) + "</textarea></label>" +
      '<h4 class="wr-sub">Gemini</h4><p class="j-hint">With a free key from aistudio.google.com the suggestions appear right here. Without one, each button copies a ready-made prompt and opens Gemini; paste its answer into “Paste & sort”.</p>' +
      '<div class="ed-row2"><label class="ed-field"><span class="ed-label">Gemini key (kept in your private repository)</span><input class="ed-input" type="password" data-a="gemini_key" value="' + esc(ai.gemini_key || "") + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Model</span><select class="ed-input" data-a="ai_model"><option value="gemini-2.5-pro"' + (ai.ai_model === "gemini-2.5-pro" ? " selected" : "") + '>Pro — best writing, slower</option><option value="gemini-flash-latest"' + (ai.ai_model !== "gemini-2.5-pro" ? " selected" : "") + ">Flash — fast</option></select></label></div>" +
      '<h4 class="wr-sub">Take it out</h4><p class="owner-tools"><button type="button" class="pill" data-x="copy">Copy all</button><button type="button" class="pill" data-x="md">Download .md</button></p></div>';
    var t;
    body.oninput = function (e) {
      var s = e.target.getAttribute("data-s"), a = e.target.getAttribute("data-a");
      if (s) { p[s] = e.target.value; clearTimeout(t); t = setTimeout(function () { analyzeNow(); scheduleSave(); }, 600); }
      if (a) { W.ai[a] = e.target.value.trim(); clearTimeout(W.timers.ai); W.timers.ai = setTimeout(saveAI, 800); }
    };
    body.onchange = body.oninput;
    body.onclick = function (e) {
      var b = e.target.closest("[data-x]"); if (!b) return;
      if (b.getAttribute("data-x") === "copy") navigator.clipboard.writeText(p.body).then(function () { toast("Copied."); });
      if (b.getAttribute("data-x") === "md") {
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["# " + p.title + "\n\n" + p.body], { type: "text/markdown" }));
        a.download = (p.title || "paper").replace(/[\\/:*?"<>|]+/g, " ") + ".md"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
      }
    };
  }

  /* ---------- Gemini, or a prompt to paste into Gemini ---------- */
  function aiKey() { return (W.ai || {}).gemini_key; }
  function context() {
    var p = W.paper, c = "You are helping a literary scholar revise an academic article in literary studies (how knowledge of the East is produced, how East and West are written, in the Lusophone world: Brazil, Portugal, Portuguese Asia). Treat it as literary analysis, not history.\n";
    if (p.thesis) c += "\nThesis of the article: " + p.thesis;
    if (p.keywords) c += "\nKey names and terms: " + p.keywords;
    if (p.readers) c += "\nReaders: " + p.readers;
    if (p.samples) c += "\n\nPassages whose style she wants to keep (match their voice, rhythm and vocabulary; do not reuse their content):\n\"\"\"\n" + p.samples.slice(0, 6000) + "\n\"\"\"";
    return c + "\n\nWrite in the language of the text you are given (usually Chinese). Never invent facts, quotations or sources.\n";
  }
  function numbered() { return paras().map(function (t, i) { return "[" + (i + 1) + "] " + t; }).join("\n\n"); }
  function prompt(kind, d) {
    var c = context();
    if (kind === "explain") return c + "\nRead this paragraph as an intelligent reader without specialist background. First list every name, term, work, event or allusion that needs explaining, with a one-line explanation each. Then, under the heading '## Sentences to add', write 1–3 sentences she could add so the paragraph explains itself, in her style.\n\nParagraph:\n" + d.text;
    if (kind === "denser") return c + "\nRewrite this paragraph to carry the most information in the fewest words. Keep every fact, name, date, quotation and citation exactly. Cut filler, hedging and AI clichés. Prefer argument and analysis over flat chronological narration. Output only the rewritten paragraph.\n\nParagraph:\n" + d.text;
    if (kind === "thesis") return c + "\nRewrite this paragraph so that it clearly serves the thesis: make the connection explicit, keep all facts and citations, and cut what does not serve it. Output only the rewritten paragraph.\n\nParagraph:\n" + d.text;
    if (kind === "merge") return c + "\nThese are versions of the same passage. Write ONE paragraph that keeps the best sentences, the most specific details and the strongest prose from all of them, with no repetition. Keep every citation. Output only the paragraph.\n\n" + d.members.map(function (m, k) { return "Version " + (k + 1) + ":\n" + paras()[m]; }).join("\n\n");
    if (kind === "cite") return c + "\nFind who made this claim or wrote this quotation: the scholar, the work and, if possible, the page. Give (1) the source with a link, (2) an MLA 9 in-text citation, (3) an MLA 9 Works Cited entry. If you cannot verify the source, say so plainly — do not guess.\n\nSentence:\n" + d.text + "\n\nParagraph it comes from:\n" + paras()[d.i];
    if (kind === "mla") return c + "\nCorrect every in-text citation and the Works Cited list to MLA 9 (MLA Handbook, 9th edition). Do not change any other wording. Return the full corrected text, then a line '---CHANGES---' and a short list of what you changed.\n\nText:\n" + W.paper.body;
    if (kind === "order") return c + "\nHere are the numbered paragraphs of the draft. Propose the clearest order for the argument: chronological where history matters, paragraphs about the same thing together, the thesis set up early. Also list paragraphs that repeat others closely enough to set aside. Answer JSON only: {\"order\":[paragraph numbers, every paragraph exactly once except those set aside], \"aside\":[numbers], \"why\":\"a few sentences\"}\n\n" + numbered();
    if (kind === "fit") return c + "\nFor each numbered paragraph, say whether it serves the thesis: yes, partly or no, with a reason of at most 12 words. Answer JSON only: [{\"n\":1,\"fit\":\"yes\",\"why\":\"…\"}]\n\n" + numbered();
    if (kind === "translate") return "Translate this paragraph of a literary-studies article into natural academic English. Follow English conventions: titles of books and periodicals in *italics*, MLA 9 citations kept as they are, English punctuation. Output only the translation.\n\n" + d.text;
    return c;
  }
  function gemini(text, search) {
    var key = aiKey(), model = (W.ai || {}).ai_model || "gemini-flash-latest";
    var call = function (m) {
      return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: text }] }], generationConfig: { temperature: 0.5 }, tools: search ? [{ google_search: {} }] : undefined })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error((j.error && j.error.message) || r.status); e.status = r.status; throw e; } return j; }); });
    };
    return call(model).catch(function (e) { if (e.status === 404 || e.status === 400) return call("gemini-2.5-flash"); throw e; }).then(function (j) {
      var cand = (j.candidates || [])[0] || {}, out = ((cand.content || {}).parts || []).map(function (p) { return p.text || ""; }).join("");
      var src = (((cand.groundingMetadata || {}).groundingChunks) || []).map(function (g) { return g.web; }).filter(Boolean);
      return { text: out, sources: src };
    });
  }
  function runAI(kind, d) {
    var text = prompt(kind, d);
    if (!aiKey()) {
      var go = function () { window.open("https://gemini.google.com/app", "_blank", "noopener"); toast("Prompt copied. Paste it into Gemini, then paste the answer into “Paste & sort”."); };
      var manual = function () { window.prompt("Copy this prompt, then paste it into Gemini", text); window.open("https://gemini.google.com/app", "_blank", "noopener"); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(go, manual);
      else manual();
      return;
    }
    setStatus("Asking Gemini…");
    var wrap = sheet("Gemini", '<p class="j-hint">Thinking…</p>');
    gemini(text, kind === "cite").then(function (r) {
      setStatus("");
      if (!document.body.contains(wrap)) return;
      showAnswer(wrap, kind, d, r);
    }).catch(function (e) { $(".ed-body", wrap).innerHTML = '<p class="j-hint">Gemini didn\'t answer: ' + esc(e.message) + ". Check the key in “Thesis & style”.</p>"; setStatus(""); });
  }
  function showAnswer(wrap, kind, d, r) {
    var t = r.text.trim(), box = $(".ed-body", wrap), ps = paras(), btns = [];
    if (kind === "order" || kind === "fit") {
      var j = null; try { j = JSON.parse((t.match(/[\[{][\s\S]*[\]}]/) || [t])[0]); } catch (e) {}
      if (!j) { box.innerHTML = "<pre class=\"wr-pre\">" + esc(t) + "</pre>"; return; }
      if (kind === "fit") { W.fit = j; closeSheet(); W.orgMode = "drift"; render(); return; }
      var order = (j.order || []).map(function (n) { return n - 1; }).filter(function (n) { return n >= 0 && n < ps.length; });
      var aside = (j.aside || []).map(function (n) { return n - 1; });
      ps.forEach(function (x, i) { if (order.indexOf(i) < 0 && aside.indexOf(i) < 0) order.push(i); });
      box.innerHTML = "<p>" + esc(j.why || "") + '</p><ol class="wr-olist">' + order.map(function (i) { return "<li><span class=\"wr-n\">¶" + (i + 1) + "</span> " + esc(ps[i].slice(0, 100)) + "…</li>"; }).join("") + "</ol>" +
        (aside.length ? '<p class="j-hint">Set aside as repeats: ' + aside.map(function (i) { return "¶" + (i + 1); }).join(", ") + "</p>" : "");
      btns.push({ label: "Use this order", run: function () { aside.forEach(function (i) { if (ps[i]) W.paper.alternatives.push({ text: ps[i], at: Date.now() }); }); closeSheet(); setBody(joinParas(order.map(function (i) { return ps[i]; })), "Reordered. Undo is at the top."); } });
    } else {
      box.innerHTML = '<div class="wr-answer">' + esc(t).replace(/\n/g, "<br>") + "</div>" +
        (r.sources && r.sources.length ? '<h4 class="wr-sub">Sources Gemini looked at</h4><ul>' + r.sources.map(function (s) { return '<li><a href="' + esc(s.uri) + '" target="_blank" rel="noopener">' + esc(s.title || s.uri) + "</a></li>"; }).join("") + "</ul>" : "");
      var main = t.split(/---CHANGES---/)[0].trim();
      if (kind === "explain") {
        var add = (t.split(/##\s*Sentences to add/i)[1] || "").trim();
        if (add) btns.push({ label: "Add these sentences to the paragraph", run: function () { ps[d.i] = ps[d.i] + add.replace(/\n+/g, ""); closeSheet(); setBody(joinParas(ps)); } });
      }
      if (kind === "denser" || kind === "thesis" || kind === "merge") {
        btns.push({ label: "Use it (old wording kept as a version)", run: function () {
          var members = kind === "merge" ? d.members.slice().sort(function (a, b) { return b - a; }) : [d.i];
          members.forEach(function (m) { W.paper.alternatives.push({ text: ps[m], at: Date.now() }); });
          var at = Math.min.apply(null, members);
          members.forEach(function (m) { ps.splice(m, 1); });
          ps.splice(at, 0, main);
          closeSheet(); setBody(joinParas(ps), "Done. The earlier wording is kept as a version.");
        } });
        btns.push({ label: "Keep it as a version only", run: function () { W.paper.alternatives.push({ text: main, at: Date.now() }); closeSheet(); setBody(W.paper.body); } });
      }
      if (kind === "mla") btns.push({ label: "Use the corrected text", run: function () { closeSheet(); setBody(main, "Citations formatted. Undo is at the top."); } });
      if (kind === "translate") btns.push({ label: "Use as English", run: function () { W.paper.english[hashOf(ps[d.i])] = main; closeSheet(); scheduleSave(); render(); } });
      btns.push({ label: "Copy", run: function () { navigator.clipboard.writeText(main); toast("Copied."); } });
    }
    var foot = $(".ed-actions", wrap); foot.innerHTML = "";
    btns.concat([{ label: "Close", run: closeSheet }]).forEach(function (b, k) {
      var x = document.createElement("button"); x.type = "button"; x.className = "pill" + (k === 0 && b.label !== "Close" ? " solid" : ""); x.textContent = b.label; x.addEventListener("click", b.run); foot.appendChild(x);
    });
  }

  /* ---------- a simple sheet ---------- */
  function sheet(title, html) {
    closeSheet();
    var wrap = document.createElement("div");
    wrap.className = "ed-sheet wr-sheet"; wrap.setAttribute("role", "dialog");
    wrap.innerHTML = '<div class="ed-panel"><header class="ed-head"><h2>' + esc(title) + '</h2><button type="button" class="ed-x" aria-label="Close">×</button></header><div class="ed-body">' + html +
      '</div><footer class="ed-foot"><span class="ed-status"></span><span class="ed-actions"><button type="button" class="pill">Close</button></span></footer></div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add("lb-open");
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.classList.contains("ed-x") || (e.target.closest(".ed-actions") && e.target.textContent === "Close")) closeSheet(); });
    return wrap;
  }
  function closeSheet() {
    var s = $(".wr-sheet"); if (s) s.remove();
    if (!$(".ed-sheet") && !$(".ed-write")) document.documentElement.classList.remove("lb-open");
    if (W.needRender) { W.needRender = false; render(); }
  }

  function action(k, b) { if (k === "para") paraMenu(+b.getAttribute("data-i")); }

  window.addEventListener("beforeunload", function () { if (W.paper) { flushWrite(); try { localStorage.setItem("alyx-paper:" + W.paper.id, JSON.stringify(W.paper)); } catch (e) {} } });
  window.AlyxWriter = { mount: mount, _W: W };
})();
