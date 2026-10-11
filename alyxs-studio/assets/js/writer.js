/* Alyx's Studio — Thesis: a private place to finish an article, in four steps.
   1 Write    paste everything; it is put in time order, repeats are merged (the best kept),
              Gemini rewrites it into fluent, dense paragraphs and finds a vivid opening; you edit
              in place. The page remembers which paragraphs Gemini wrote and which you changed.
   2 Translate  paragraph by paragraph with DeepL (website, no key), quotations kept aside.
   3 Sources  sentences that need a citation, with Google AI Mode, Scholar and PDF searches.
   4 Format   MLA 9 fixes and a formatted Word file.
   All analysis runs in the background and never appears in your text, so it copies cleanly.
   Everything is saved to your private repository (studio-drafts → papers/), never to the website. */
(function () {
  "use strict";
  var A = function () { return window.AlyxAnalyze; };
  var E = function () { return window.AlyxEditor; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  function uid() { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function toast(m) { if (E() && E().toast) E().toast(m); }
  function fmtN(n) { return Number(n || 0).toLocaleString(); }
  function hashText(t) { var h = 0; t = String(t).replace(/\s+/g, ""); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return "h" + (h >>> 0).toString(36) + t.length; }
  var CJK = /[㐀-鿿]/;

  var W = { ctx: null, list: null, listSha: null, paper: null, sha: null, step: 1, history: [], status: "", ai: null, aiSha: null, timers: {}, job: null };

  /* ---------- storage ---------- */
  function priv() { return E().priv; }
  function loadList() {
    return priv().read("papers/index.json").then(function (r) { W.list = (r && r.data && r.data.papers) || []; W.listSha = r && r.sha; })
      .catch(function () { W.list = []; W.failed = true; });
  }
  function saveList() {
    clearTimeout(W.timers.list);
    W.timers.list = setTimeout(function () { priv().write("papers/index.json", { papers: W.list }, W.listSha).then(function (sha) { W.listSha = sha; }).catch(function () {}); }, 1500);
  }
  function loadAI() {
    if (W.ai) return Promise.resolve(W.ai);
    return priv().read("journal/settings.json").then(function (r) { W.ai = (r && r.data) || {}; W.aiSha = r && r.sha; return W.ai; }).catch(function () { W.ai = {}; return W.ai; });
  }
  function saveAI() { priv().write("journal/settings.json", W.ai, W.aiSha).then(function (sha) { W.aiSha = sha; }).catch(function () {}); }
  function upgrade(p) {
    p = p || {};
    if (!p.blocks) {   // papers from the first version: one text and "alternatives"
      p.blocks = A().paragraphs(p.body || "").map(function (t) { return { id: uid(), text: t, by: "paste", src: [] }; });
      p.aside = (p.alternatives || []).map(function (a) { return { text: a.text, at: a.at, why: "version" }; });
      delete p.body; delete p.alternatives; p.english = {};
    }
    p.title = p.title || "Untitled"; p.aside = p.aside || []; p.deleted = p.deleted || []; p.english = p.english || {};
    p.thesis = p.thesis || ""; p.keywords = p.keywords || ""; p.readers = p.readers || ""; p.samples = p.samples || "";
    p.sources = p.sources || {}; p.mla = p.mla || {}; p.worksCited = p.worksCited || ""; p.pt = p.pt || "pt-PT"; p.version = 2;
    return p;
  }
  function openPaper(id) {
    W.paper = null; W.history = []; W.step = 1;
    render();
    return priv().read("papers/" + id + ".json").then(function (r) {
      var cloud = r && r.data, local = null;
      try { local = JSON.parse(localStorage.getItem("alyx-paper:" + id) || "null"); } catch (e) {}
      W.sha = r && r.sha;
      if (local && (!cloud || (local.updated || 0) > (cloud.updated || 0))) { W.paper = upgrade(local); setStatus("Restored changes not yet saved"); save(); }
      else W.paper = upgrade(cloud || { id: id, title: "Untitled" });
      W.paper.id = id;
      render();
    }).catch(function (e) { console.error(e); W.paper = null; toast("Couldn't open this paper. Check your sign-in."); render(); });
  }
  function setStatus(t) { W.status = t; var el = $(".wr-status"); if (el) el.textContent = t; }
  function save() {
    var p = W.paper; if (!p) return;
    p.updated = Date.now();
    try { localStorage.setItem("alyx-paper:" + p.id, JSON.stringify(p)); } catch (e) {}
    setStatus("Saving…");
    clearTimeout(W.timers.save);
    W.timers.save = setTimeout(function () {
      priv().write("papers/" + p.id + ".json", p, W.sha).then(function (sha) {
        W.sha = sha; setStatus("✓ Saved");
        try { localStorage.removeItem("alyx-paper:" + p.id); } catch (e) {}
        var entry = (W.list || []).filter(function (x) { return x.id === p.id; })[0], words = A().count(text()).total;
        if (!entry) { entry = { id: p.id }; (W.list = W.list || []).unshift(entry); }
        if (entry.title !== p.title || entry.words !== words || Date.now() - (entry.updated || 0) > 6e4) { entry.title = p.title; entry.words = words; entry.updated = Date.now(); saveList(); }
      }).catch(function (e) { console.error(e); setStatus("Not saved yet — kept on this device"); });
    }, 2000);
  }
  function text(blocks) { return (blocks || W.paper.blocks).map(function (b) { return b.text; }).join("\n\n"); }
  function remember() { W.history.push(JSON.stringify(W.paper.blocks)); if (W.history.length > 40) W.history.shift(); }

  /* ---------- organizing (in the background, nothing shown in the text) ---------- */
  var REF = /^\s*#*\s*(works cited|参考文献|引用文献|bibliography)\s*$/i;
  // effective year of each paragraph: its own earliest year, or the year of the paragraph it is most like
  function effectiveYears(texts) {
    var an = A().analyze(texts.join("\n\n")), ps = an.paragraphs, ys = [];
    var vec = ps.map(function (p) { return p.vec; });
    ps.forEach(function (p, i) { ys[i] = p.years.length ? Math.min.apply(null, p.years) : null; });
    var own = ys.slice();
    ps.forEach(function (p, i) {
      if (own[i] != null || p.heading) return;
      var best = -1, bs = 0;
      ps.forEach(function (q, j) { if (own[j] == null) return; var s = A().cosine(vec[i], vec[j]); if (s > bs) { bs = s; best = j; } });
      if (bs >= 0.15) ys[i] = own[best];
    });
    var last = -Infinity;
    for (var i = 0; i < ys.length; i++) { if (ys[i] == null) ys[i] = last; else last = ys[i]; }
    // a heading travels with the paragraph after it
    for (var k = ps.length - 2; k >= 0; k--) if (ps[k].heading) ys[k] = ys[k + 1];
    return { years: ys, an: an };
  }
  function organize(paragraphs, keepBlocks) {
    var refs = [], body = [], inRefs = false;
    paragraphs.forEach(function (t) { if (REF.test(t)) inRefs = true; (inRefs ? refs : body).push(t); });
    var an = A().analyze(body.join("\n\n"));
    var ps = an.paragraphs.map(function (p) { return p.text; });
    // repeats → one block, best wording first, the others kept as its versions
    var used = {}, units = [];
    an.dupGroups.forEach(function (g) {
      var best = g.best, src = g.members.map(function (m) { return ps[m]; });
      src.sort(function (a, b) { return (a === ps[best] ? -1 : b === ps[best] ? 1 : 0); });
      g.members.forEach(function (m) { used[m] = 1; });
      units.push({ at: Math.min.apply(null, g.members), text: ps[best], src: src });
    });
    ps.forEach(function (t, i) { if (!used[i]) units.push({ at: i, text: t, src: [t] }); });
    units.sort(function (a, b) { return a.at - b.at; });
    // time order (stable: same year keeps the order you wrote it in)
    var ey = effectiveYears(units.map(function (u) { return u.text; })).years;
    units.forEach(function (u, i) { u.y = ey[i]; u.i = i; });
    units.sort(function (a, b) { return (a.y - b.y) || (a.i - b.i); });
    var blocks = units.map(function (u) { return { id: uid(), text: u.text, by: "paste", src: u.src.length > 1 ? u.src : [] }; });
    (keepBlocks || []).forEach(function (b) { blocks.push(b); });
    refs.forEach(function (t) { blocks.push({ id: uid(), text: t, by: "paste", src: [], ref: true }); });
    return { blocks: blocks, merged: an.dupGroups.reduce(function (n, g) { return n + g.members.length - 1; }, 0) };
  }
  // reorder existing blocks by time; repeats merged; your own edits kept word for word
  function reorganize() {
    var bs = W.paper.blocks.filter(function (b) { return !b.ref && !REF.test(b.text); }), refs = W.paper.blocks.filter(function (b) { return b.ref || REF.test(b.text); });
    var an = A().analyze(text(bs)), drop = {};
    an.dupGroups.forEach(function (g) {
      var keep = g.members.filter(function (m) { return bs[m].by === "me"; })[0];
      if (keep == null) keep = g.best;
      g.members.forEach(function (m) {
        if (m === keep) return;
        bs[keep].src = (bs[keep].src || []).concat(bs[m].src && bs[m].src.length ? bs[m].src : [bs[m].text]);
        drop[m] = 1;
      });
    });
    bs = bs.filter(function (b, i) { return !drop[i]; });
    var hook = bs.filter(function (b) { return b.hook; }), rest = bs.filter(function (b) { return !b.hook; });
    var ey = effectiveYears(rest.map(function (b) { return b.text; })).years;
    var order = rest.map(function (b, i) { return { b: b, y: ey[i], i: i }; }).sort(function (a, b) { return (a.y - b.y) || (a.i - b.i); }).map(function (x) { return x.b; });
    var lead = 0; while (lead < order.length && /^#/.test(order[lead].text)) lead++;
    return order.slice(0, lead).concat(hook, order.slice(lead)).concat(refs);
  }
  // more text pasted into an existing draft
  function addText(paragraphs) {
    var bs = W.paper.blocks, n = { skipped: 0, versions: 0, placed: 0, gone: 0 };
    paragraphs.forEach(function (t) {
      if (REF.test(t)) return;
      var h = hashText(t);
      var wasDeleted = W.paper.deleted.indexOf(h) > -1 || W.paper.aside.some(function (a) { return a.why === "deleted" && A().cosine(A().terms(a.text), A().terms(t)) > 0.8; });
      if (wasDeleted) { n.gone++; return; }
      var best = -1, bsim = 0, v = A().terms(t);
      bs.forEach(function (b, i) { if (b.ref) return; var s = A().cosine(v, A().terms(b.text)); if (s > bsim) { bsim = s; best = i; } });
      var exact = bs.some(function (b) { return hashText(b.text) === h || (b.src || []).some(function (x) { return hashText(x) === h; }); });
      if (exact) { n.skipped++; return; }
      if (bsim >= 0.5) {   // another wording of a paragraph you have
        var b = bs[best];
        b.src = b.src && b.src.length ? b.src : [b.text];
        b.src.push(t); b.fresh = true; n.versions++; return;
      }
      // new: into its place in time
      var nb = { id: uid(), text: t, by: "paste", src: [], fresh: true };
      var refAt = bs.findIndex(function (x) { return x.ref || REF.test(x.text); });
      if (bsim >= 0.2) bs.splice(best + 1, 0, nb); else bs.splice(refAt > -1 ? refAt : bs.length, 0, nb);
      n.placed++;
    });
    W.paper.blocks = reorganize();
    var bits = [];
    if (n.placed) bits.push(n.placed + " new paragraphs put in place");
    if (n.versions) bits.push(n.versions + " new wordings added to paragraphs you have");
    if (n.skipped) bits.push(n.skipped + " repeats skipped");
    if (n.gone) bits.push(n.gone + " you had deleted before, left out");
    return bits.join(" · ") || "Nothing new.";
  }

  /* ---------- Gemini ---------- */
  function aiKey() { return (W.ai || {}).gemini_key; }
  function context() {
    var p = W.paper, c = "You are helping a literary scholar finish an academic article in literary studies (how knowledge of the East is produced and how East and West are written, in the Lusophone world: Brazil, Portugal, Portuguese Asia). Treat it as literary analysis, not history.\n";
    if (p.thesis) c += "\nThesis of the article: " + p.thesis;
    if (p.keywords) c += "\nKey names and terms: " + p.keywords;
    if (p.readers) c += "\nReaders: " + p.readers;
    if (p.samples) c += "\n\nPassages whose style she wants to keep (match their voice, rhythm and vocabulary, not their content):\n\"\"\"\n" + p.samples.slice(0, 6000) + "\n\"\"\"";
    return c + "\n";
  }
  var RULES = "Write each as ONE finished paragraph, in the same language as the input (usually Chinese):\n" +
    "- If an item has several versions, combine them: keep the best sentences, the most specific details and the most vivid images; never repeat a point.\n" +
    "- Make it fluent and natural. Avoid short, choppy sentences: join related points into well-built longer sentences, but every clause must carry information — no padding, no clichés, no 'it is worth noting'. Aim for the highest information density.\n" +
    "- The paragraph states its point and completes the argument with its evidence.\n" +
    "- Where a reader without background would get lost (a name, a term, an event, a work), explain it briefly inside the sentence, clearly, the way a good teacher would.\n" +
    "- Keep every fact, name, date, quotation (exact wording, original language) and citation. Never add facts, quotations or sources.\n" +
    "- Analysis, not flat chronological narration.\n";
  function gemini(prompt, opts) {
    opts = opts || {};
    var key = aiKey(), model = opts.model || (W.ai || {}).ai_model || "gemini-flash-latest";
    var call = function (m, retry) {
      return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: Object.assign({ temperature: 0.6 }, opts.json ? { responseMimeType: "application/json" } : {}),
          tools: opts.search ? [{ google_search: {} }] : undefined })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error((j.error && j.error.message) || r.status); e.status = r.status; throw e; } return j; }); })
        .catch(function (e) {
          if (e.status === 429 && !retry) return new Promise(function (res) { setTimeout(res, 20000); }).then(function () { return call(m === "gemini-2.5-pro" ? "gemini-flash-latest" : m, true); });
          if ((e.status === 404 || e.status === 400) && m !== "gemini-2.5-flash") return call("gemini-2.5-flash", true);
          throw e;
        });
    };
    return call(model).then(function (j) {
      var cand = (j.candidates || [])[0] || {}, out = ((cand.content || {}).parts || []).map(function (p) { return p.text || ""; }).join("");
      var src = (((cand.groundingMetadata || {}).groundingChunks) || []).map(function (g) { return g.web; }).filter(Boolean);
      return { text: out, sources: src };
    });
  }
  function parseJSON(t) { try { return JSON.parse((String(t).match(/[\[{][\s\S]*[\]}]/) || [t])[0]); } catch (e) { return null; } }
  function copyPrompt(prompt, after) {
    var go = function () { window.open("https://gemini.google.com/app", "_blank", "noopener"); toast(after || "Prompt copied. Paste it into Gemini, then paste the answer back here."); };
    var manual = function () { window.prompt("Copy this prompt, then paste it into Gemini", prompt); window.open("https://gemini.google.com/app", "_blank", "noopener"); };
    if (navigator.clipboard) navigator.clipboard.writeText(prompt).then(go, manual); else manual();
  }
  /* rewrite paragraphs in batches; never touches a paragraph you edited */
  function polish(ids, withHook) {
    var p = W.paper;
    if (!aiKey()) {
      copyPrompt(context() + "\n" + RULES + "\nThen put the paragraphs in time order and open with the most vivid, image-rich passage as a hook. Output the article only, paragraphs separated by blank lines.\n\n" + text(),
        "Prompt copied with your whole draft. Paste it into Gemini, then paste Gemini's article into “Add more text” — each new paragraph goes next to the one it rewrites.");
      return;
    }
    var todo = p.blocks.filter(function (b) { return !b.ref && b.by !== "me" && (!ids || ids.indexOf(b.id) > -1) && !/^#/.test(b.text) && (b.by === "paste" || b.fresh || ids); });
    var batches = [], cur = [], size = 0;
    todo.forEach(function (b) {
      var len = (b.src && b.src.length ? b.src.join("") : b.text).length;
      if (cur.length && (size + len > 5000 || cur.length >= 8)) { batches.push(cur); cur = []; size = 0; }
      cur.push(b); size += len;
    });
    if (cur.length) batches.push(cur);
    var job = W.job = { total: batches.length + (withHook ? 1 : 0), done: 0, stop: false };
    progress();
    var run = batches.reduce(function (pr, batch) {
      return pr.then(function () {
        if (job.stop) return;
        var items = batch.map(function (b, k) {
          var vs = b.src && b.src.length > 1 ? b.src : null;
          return "[" + (k + 1) + "] " + (vs ? vs.map(function (v, vi) { return "(version " + (vi + 1) + ") " + v; }).join("\n") : b.text);
        }).join("\n\n");
        var prompt = context() + "\n" + RULES + "\nAnswer JSON only: {\"1\": \"paragraph\", \"2\": \"…\"} with exactly these keys.\n\nItems:\n" + items;
        return gemini(prompt, { json: true }).then(function (r) {
          var j = parseJSON(r.text) || {};
          batch.forEach(function (b, k) {
            var out = j[String(k + 1)];
            if (!out || typeof out !== "string") return;
            var live = W.paper.blocks.filter(function (x) { return x.id === b.id; })[0];
            if (!live || live.by === "me") return;          // you changed it meanwhile: yours wins
            if (!live.src || !live.src.length) live.src = [live.text];
            live.text = out.trim(); live.by = "ai"; live.ai = live.text; live.fresh = false;
          });
          job.done++; progress(); save(); refreshDoc();
          return new Promise(function (res) { setTimeout(res, 1200); });
        }).catch(function (e) { job.error = e.message; job.done++; progress(); });
      });
    }, Promise.resolve());
    run.then(function () { if (withHook && !job.stop) return makeHook(job); }).then(function () {
      W.job = null; progress();
      toast(job.error ? "Gemini stopped part way: " + job.error : "Gemini has finished. Paragraphs it wrote have a small purple dot in the margin.");
    });
  }
  function makeHook(job) {
    var bs = W.paper.blocks.filter(function (b) { return !b.ref && !b.hook; });
    var prompt = context() + "\nFrom the numbered paragraphs of the draft below, pick the passage with the most vivid, concrete, image-rich or narrative writing — the one that would make the best opening hook. Then write an opening paragraph in the same language that starts from that image or scene and leads into the thesis. Keep facts and quotations exact. " +
      "Answer JSON only: {\"from\": paragraph number, \"opening\": \"…\"}\n\n" + bs.map(function (b, i) { return "[" + (i + 1) + "] " + b.text; }).join("\n\n");
    return gemini(prompt, { json: true }).then(function (r) {
      var j = parseJSON(r.text); if (!j || !j.opening) return;
      var old = W.paper.blocks.filter(function (b) { return b.hook; })[0];
      if (old && old.by === "me") return;
      var src = bs[(+j.from || 1) - 1];
      var hook = { id: old ? old.id : uid(), text: j.opening.trim(), by: "ai", ai: j.opening.trim(), hook: true, src: src ? [src.text] : [] };
      var rest = W.paper.blocks.filter(function (b) { return !b.hook; }), lead = 0;
      while (lead < rest.length && /^#/.test(rest[lead].text)) lead++;   // after a first heading such as "# 引言"
      W.paper.blocks = rest.slice(0, lead).concat([hook], rest.slice(lead));
      if (job) { job.done++; progress(); }
      save(); refreshDoc();
    }).catch(function () {});
  }
  function progress() {
    var el = $(".wr-job"); if (!el) return;
    var j = W.job;
    el.hidden = !j;
    if (j) el.innerHTML = '<span class="wr-job-bar"><span style="width:' + Math.round(j.done / Math.max(1, j.total) * 100) + '%"></span></span>' +
      "<span>Gemini is writing… " + j.done + " / " + j.total + "</span>" + '<button type="button" class="mini-btn" data-w="stop">Stop</button>';
  }

  /* ---------- mounting ---------- */
  function mount(ctx) {
    W.ctx = ctx;
    var id = (ctx.hash.match(/^p=(.+)$/) || [])[1];
    if (W.list == null) { ctx.el.innerHTML = '<p class="empty">Opening…</p>'; loadList().then(function () { loadAI().then(function () { mount(ctx); }); }); return; }
    if (id && (!W.paper || W.paper.id !== id)) return openPaper(id);
    if (!id) W.paper = null;
    render();
  }
  function render() {
    var el = W.ctx && W.ctx.el; if (!el) return;
    if (!W.paper) return renderList(el);
    var p = W.paper, c = A().count(text());
    var steps = [[1, "Write"], [2, "Translate"], [3, "Sources"], [4, "Format"]];
    el.innerHTML =
      '<div class="wr-top"><a class="wr-back" href="#">← All</a>' +
        '<input class="wr-title" value="' + esc(p.title) + '" aria-label="Title">' +
        '<span class="wr-count">' + fmtN(c.total) + " 字 / words</span>" +
        '<span class="wr-status">' + esc(W.status) + "</span>" +
        '<button type="button" class="mini-btn" data-w="settings" title="Thesis, readers, style, Gemini">Thesis & style</button></div>' +
      '<nav class="wr-steps">' + steps.map(function (s) {
        return '<button type="button" class="wr-step' + (W.step === s[0] ? " on" : "") + '" data-w="step" data-v="' + s[0] + '"><b>' + s[0] + "</b> " + s[1] + "</button>";
      }).join('<span class="wr-arrow">→</span>') + "</nav>" +
      '<div class="wr-job" hidden></div><div class="wr-body"></div>';
    var body = $(".wr-body", el);
    [null, stepWrite, stepTranslate, stepSources, stepFormat][W.step](body);
    progress();
    var t = $(".wr-title", el);
    t.addEventListener("input", function () { W.paper.title = t.value; save(); });
    $(".wr-back", el).addEventListener("click", function (e) { e.preventDefault(); flush(); W.ctx.setHash(""); });
    el.onclick = function (e) {
      var b = e.target.closest("[data-w]"); if (!b) return;
      var k = b.getAttribute("data-w");
      if (k === "step") { flush(); W.step = +b.getAttribute("data-v"); render(); }
      if (k === "settings") settings();
      if (k === "stop" && W.job) { W.job.stop = true; toast("Stopping after this part."); }
    };
  }

  /* ---------- the list ---------- */
  function renderList(el) {
    var list = (W.list || []).slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    el.innerHTML = '<div class="page-head"><h1>' + esc(W.ctx.title || "Thesis") + '</h1><p class="intro">Your articles. Only you can see this page; everything is saved privately as you work.</p></div>' +
      (W.failed ? '<p class="j-hint">Private storage couldn\'t open. Open /admin once in this browser to sign in, then reload.</p>' : "") +
      '<p class="owner-tools"><button type="button" class="pill solid" data-l="new">+ New article</button></p>' +
      (list.length ? '<ul class="wr-list">' + list.map(function (x) {
        return '<li><a href="#p=' + esc(x.id) + '"><span class="wr-l-title">' + esc(x.title || "Untitled") + '</span><span class="wr-l-meta">' + fmtN(x.words || 0) + " 字 / words · " +
          (x.updated ? new Date(x.updated).toLocaleDateString() : "") + '</span></a><button type="button" class="mini-btn" data-l="del" data-id="' + esc(x.id) + '">Remove</button></li>';
      }).join("") + "</ul>" : "");
    el.onclick = function (e) {
      var b = e.target.closest("[data-l]"); if (!b) return;
      if (b.getAttribute("data-l") === "new") {
        var id = "paper-" + stamp();
        W.paper = upgrade({ id: id, title: "Untitled", blocks: [], created: Date.now() });
        (W.list = W.list || []).unshift({ id: id, title: "Untitled", words: 0, updated: Date.now() });
        saveList(); save(); W.step = 1;
        W.ctx.setHash("p=" + id);
      }
      if (b.getAttribute("data-l") === "del") {
        var did = b.getAttribute("data-id");
        if (!window.confirm("Remove this article from the list? (Its file stays in your private repository.)")) return;
        W.list = W.list.filter(function (x) { return x.id !== did; }); saveList(); renderList(el);
      }
    };
  }

  /* ================= 1 · WRITE ================= */
  function stepWrite(body) {
    var p = W.paper;
    if (!p.blocks.length) {
      body.innerHTML = '<div class="wr-start"><p class="wr-lead">Paste your draft — a few pages or a few hundred, notes and Gemini versions all mixed together.</p>' +
        '<p class="j-hint">It is put in time order, paragraphs that say the same thing are merged with the best wording kept' + (aiKey() ? ", then Gemini rewrites everything into fluent, dense paragraphs and finds a vivid opening." : ". With a Gemini key (Thesis & style) it also rewrites everything into fluent, dense paragraphs.") +
        " You can start editing straight away.</p>" +
        '<textarea class="ed-input wr-paste" rows="14" placeholder="粘贴草稿 · Paste here"></textarea>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-s="go">Organize</button></p></div>';
      var ta = $(".wr-paste", body);
      var go = function () {
        var ps = A().paragraphs(ta.value); if (!ps.length) { ta.focus(); return; }
        remember();
        var r = organize(ps);
        p.blocks = r.blocks; save(); render();
        toast("Put in time order" + (r.merged ? "; " + r.merged + " repeated paragraphs merged" : "") + ".");
        if (aiKey()) polish(null, true);
      };
      ta.addEventListener("paste", function () { setTimeout(function () { if (A().paragraphs(ta.value).length > 2) go(); }, 50); });
      body.onclick = function (e) { if (e.target.closest("[data-s=go]")) go(); };
      ta.focus();
      return;
    }
    body.innerHTML =
      '<div class="wr-tools">' +
        '<button type="button" class="pill" data-s="more">Add more text</button>' +
        '<button type="button" class="pill" data-s="order">Put in time order again</button>' +
        '<button type="button" class="pill" data-s="polish">' + (aiKey() ? "Rewrite with Gemini" : "Rewrite with Gemini (copy prompt)") + "</button>" +
        '<button type="button" class="pill" data-s="copy">Copy all</button>' +
        '<button type="button" class="pill" data-s="docx">Download .docx</button>' +
        (W.history.length ? '<button type="button" class="pill" data-s="undo">Undo</button>' : "") +
        '<span class="wr-key"><i class="dot ai"></i> written by Gemini <i class="dot me"></i> changed by you</span></div>' +
      '<div class="wr-more" hidden><textarea class="ed-input wr-paste" rows="8" placeholder="Paste more: new Gemini versions, notes, pages… each paragraph goes where it belongs."></textarea>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-s="add">Add to the draft</button></p></div>' +
      '<div class="wr-docwrap"><div class="wr-marks" aria-hidden="false"></div><div class="wr-doc" contenteditable="true" spellcheck="true"></div></div>';
    var doc = $(".wr-doc", body);
    fillDoc(doc);
    var timer;
    doc.addEventListener("input", function () { clearTimeout(timer); setStatus("Typing…"); timer = setTimeout(function () { readDoc(doc); marks(); }, 700); });
    doc.addEventListener("paste", function (e) {
      var t = e.clipboardData && e.clipboardData.getData("text/plain"); if (t == null) return;
      e.preventDefault();
      var ps = A().paragraphs(t);
      if (ps.length > 2) { readDoc(doc); remember(); var note = addText(ps); save(); render(); toast(note); if (aiKey()) polish(W.paper.blocks.filter(function (b) { return b.fresh; }).map(function (b) { return b.id; })); return; }
      document.execCommand("insertText", false, t.replace(/\s*\n+\s*/g, " "));
    });
    window.onresize = marks;
    body.onclick = function (e) {
      var b = e.target.closest("[data-s]"), m = e.target.closest("[data-mark]");
      if (m) return compare(m.getAttribute("data-mark"));
      if (!b) return;
      var k = b.getAttribute("data-s");
      if (k === "more") { var box = $(".wr-more", body); box.hidden = !box.hidden; if (!box.hidden) $("textarea", box).focus(); }
      if (k === "add") { var ps = A().paragraphs($(".wr-more textarea", body).value); if (!ps.length) return; readDoc(doc); remember(); var note = addText(ps); save(); render(); toast(note); if (aiKey()) polish(W.paper.blocks.filter(function (x) { return x.fresh; }).map(function (x) { return x.id; })); }
      if (k === "order") { readDoc(doc); remember(); W.paper.blocks = reorganize(); save(); render(); toast("In time order; repeats merged. Your own wording is untouched."); }
      if (k === "polish") { readDoc(doc); polish(null, !W.paper.blocks.some(function (x) { return x.hook; })); }
      if (k === "copy") { readDoc(doc); navigator.clipboard.writeText(text()).then(function () { toast("Copied — plain paragraphs, nothing extra."); }); }
      if (k === "docx") { readDoc(doc); docx(false, "zh"); }
      if (k === "undo" && W.history.length) { W.paper.blocks = JSON.parse(W.history.pop()); save(); render(); toast("Undone."); }
    };
    setTimeout(marks, 30);
  }
  function fillDoc(doc) {
    doc.innerHTML = W.paper.blocks.map(function (b) { return '<p data-id="' + b.id + '"' + (/^#/.test(b.text) ? ' class="head"' : b.ref || REF.test(b.text) ? ' class="ref"' : "") + ">" + esc(b.text) + "</p>"; }).join("");
  }
  function readDoc(doc) {
    doc = doc || $(".wr-doc"); if (!doc || !W.paper) return;
    var by = {}, seen = {}, out = [];
    W.paper.blocks.forEach(function (b) { by[b.id] = b; });
    Array.prototype.forEach.call(doc.childNodes, function (n) {
      var t = (n.nodeType === 3 ? n.nodeValue : n.innerText || "").replace(/ /g, " ");
      var lines = t.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
      lines.forEach(function (line, li) {
        var id = li === 0 && n.nodeType === 1 ? n.getAttribute("data-id") : null;
        if (!id || seen[id]) { id = uid(); if (li === 0 && n.nodeType === 1) n.setAttribute("data-id", id); }
        seen[id] = 1;
        var old = by[id];
        if (old) { if (old.text !== line) { old.text = line; old.by = "me"; } out.push(old); }
        else out.push({ id: id, text: line, by: "me", src: [] });
      });
    });
    // paragraphs you removed: remembered, so they don't come back, and kept aside in case
    W.paper.blocks.forEach(function (b) {
      if (seen[b.id]) return;
      W.paper.deleted.push(hashText(b.text));
      W.paper.aside.push({ text: b.text, at: Date.now(), why: "deleted" });
    });
    var changed = JSON.stringify(out.map(function (b) { return [b.id, b.text]; })) !== JSON.stringify(W.paper.blocks.map(function (b) { return [b.id, b.text]; }));
    W.paper.blocks = out;
    if (changed) save(); else setStatus(W.status === "Typing…" ? "✓ Saved" : W.status);
    var c = $(".wr-count"); if (c) c.textContent = fmtN(A().count(text()).total) + " 字 / words";
  }
  function flush() { if (W.step === 1 && $(".wr-doc")) readDoc(); }
  function refreshDoc() {
    var doc = $(".wr-doc"); if (!doc) return;
    // put Gemini's new text into paragraphs you are not typing in
    var active = document.activeElement === doc ? (window.getSelection().anchorNode || {}).parentElement : null;
    W.paper.blocks.forEach(function (b, i) {
      var el = doc.querySelector('p[data-id="' + b.id + '"]');
      if (!el) {
        var np = document.createElement("p"); np.setAttribute("data-id", b.id); np.textContent = b.text;
        var next = W.paper.blocks[i + 1] && doc.querySelector('p[data-id="' + W.paper.blocks[i + 1].id + '"]');
        if (i === 0) doc.insertBefore(np, doc.firstChild); else if (next) doc.insertBefore(np, next); else doc.appendChild(np);
      } else if (el !== active && el.innerText.trim() !== b.text) el.textContent = b.text;
    });
    marks();
  }
  function marks() {
    var doc = $(".wr-doc"), box = $(".wr-marks"); if (!doc || !box) return;
    box.innerHTML = "";
    W.paper.blocks.forEach(function (b) {
      var el = doc.querySelector('p[data-id="' + b.id + '"]'); if (!el) return;
      var kind = b.by === "ai" ? "ai" : b.by === "me" && (b.src && b.src.length || b.ai) ? "me" : b.by === "me" ? "me" : "";
      var hasVersions = b.src && b.src.length > 1;
      if (!kind && !hasVersions) return;
      var m = document.createElement("button");
      m.type = "button"; m.className = "wr-mark" + (kind ? " " + kind : "") + (hasVersions ? " v" : "");
      m.style.top = (el.offsetTop + 6) + "px";
      m.setAttribute("data-mark", b.id);
      m.title = (kind === "ai" ? "Written by Gemini" : kind === "me" ? "Changed by you" : "Your wording") + (hasVersions ? " · other versions available" : "") + " — click to compare";
      box.appendChild(m);
    });
  }

  /* compare a paragraph with its originals, sentence by sentence */
  function sentenceAlign(current, versions) {
    var cs = A().sentences(current), used = {}, rows = cs.map(function (s) { return { s: s, alts: [] }; });
    var all = [];
    versions.forEach(function (v, vi) { A().sentences(v).forEach(function (x) { all.push({ t: x, v: vi }); }); });
    all.forEach(function (x, k) {
      var best = -1, bs = 0, vx = A().terms(x.t);
      cs.forEach(function (s, i) { var sim = A().cosine(vx, A().terms(s)); if (sim > bs) { bs = sim; best = i; } });
      if (bs >= 0.35 && x.t.replace(/\s/g, "") !== cs[best].replace(/\s/g, "")) { rows[best].alts.push(x.t); used[k] = 1; }
      else if (bs >= 0.35) used[k] = 1;
    });
    var left = all.filter(function (x, k) { return !used[k]; }).map(function (x) { return x.t; });
    return { rows: rows, left: left };
  }
  function diffHTML(a, b) {
    var tok = function (s) { return String(s).match(/[㐀-鿿]|[A-Za-zÀ-ÿ0-9]+|\s+|[^\sA-Za-zÀ-ÿ0-9㐀-鿿]/g) || []; };
    var x = tok(a), y = tok(b);
    if (x.length * y.length > 900000) return esc(b);
    var n = x.length, m = y.length, dp = [];
    for (var i = 0; i <= n; i++) { dp[i] = new Uint16Array(m + 1); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var out = "", ins = "", del = "";
    var flushD = function () { if (del) out += '<del>' + esc(del) + "</del>"; if (ins) out += "<ins>" + esc(ins) + "</ins>"; del = ins = ""; };
    i = 0; j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { flushD(); out += esc(x[i]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { del += x[i++]; }
      else { ins += y[j++]; }
    }
    while (i < n) del += x[i++];
    while (j < m) ins += y[j++];
    flushD();
    return out;
  }
  function compare(id) {
    readDoc();
    var b = W.paper.blocks.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    var versions = (b.src || []).filter(function (v) { return v !== b.text; });
    var al = sentenceAlign(b.text, versions);
    var who = b.by === "ai" ? (b.src && b.src.length > 1 ? "Gemini wrote this from " + b.src.length + " versions of yours." : "Gemini rewrote this from your wording.") : b.by === "me" ? "You changed this paragraph." : "Your own wording" + (versions.length ? ", with other versions you wrote." : ".");
    var html = '<p class="j-hint">' + esc(who) + (b.hook ? " It opens the article." : "") + "</p>" +
      (versions.length ? '<h4 class="wr-sub">What changed, compared with your original</h4><p class="wr-diff">' + diffHTML(b.src[0], b.text) + "</p>" : "") +
      '<h4 class="wr-sub">Sentence by sentence' + (versions.length ? " — tap another wording to use it" : "") + "</h4>" +
      al.rows.map(function (r, ri) {
        return '<div class="wr-srow"><p class="wr-scur">' + esc(r.s) + "</p>" + r.alts.map(function (a) { return '<button type="button" class="wr-salt" data-c="swap" data-r="' + ri + '" data-t="' + esc(a) + '">' + esc(a) + "</button>"; }).join("") + "</div>";
      }).join("") +
      (al.left.length ? '<h4 class="wr-sub">From your versions, not used yet — tap to add</h4>' + al.left.map(function (t) { return '<button type="button" class="wr-salt" data-c="add" data-t="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") : "") +
      '<div class="ed-menu" style="margin-top:16px">' +
        (versions.length ? '<button type="button" class="pill" data-c="orig">Back to my original</button>' : "") +
        '<button type="button" class="pill" data-c="again">Ask Gemini again</button>' +
        '<button type="button" class="pill" data-c="explain">Explain more for readers</button>' +
        '<button type="button" class="pill danger" data-c="del">Delete paragraph</button></div>';
    var wrap = sheet("Paragraph", html);
    wrap.addEventListener("click", function (e) {
      var c = e.target.closest("[data-c]"); if (!c) return;
      var k = c.getAttribute("data-c");
      remember();
      if (k === "swap") { var s = al.rows[+c.getAttribute("data-r")].s; b.text = b.text.replace(s, c.getAttribute("data-t")); b.by = "me"; c.classList.add("taken"); al.rows[+c.getAttribute("data-r")].s = c.getAttribute("data-t"); save(); W.needRender = true; return; }
      if (k === "add") { b.text = b.text + (CJK.test(b.text) ? "" : " ") + c.getAttribute("data-t"); b.by = "me"; c.disabled = true; c.classList.add("taken"); save(); W.needRender = true; return; }
      if (k === "orig") { b.text = b.src[0]; b.by = "paste"; save(); closeSheet(); render(); return; }
      if (k === "del") { W.paper.aside.push({ text: b.text, at: Date.now(), why: "deleted" }); W.paper.deleted.push(hashText(b.text)); W.paper.blocks = W.paper.blocks.filter(function (x) { return x !== b; }); save(); closeSheet(); render(); return; }
      if (k === "again") { if (b.by === "me") { b.by = "paste"; } closeSheet(); polish([b.id]); return; }
      if (k === "explain") {
        closeSheet();
        var prompt = context() + "\nRead this paragraph as an intelligent reader without specialist background. Rewrite it so it explains itself: add brief, clear explanations of the names, terms, works and events a reader needs, woven into the sentences, keeping the density high and the sentences well built. Keep facts, quotations and citations exact. Output only the paragraph.\n\n" + b.text;
        if (!aiKey()) return copyPrompt(prompt);
        setStatus("Asking Gemini…");
        gemini(prompt).then(function (r) { if (!b.src || !b.src.length) b.src = [b.text]; b.text = r.text.trim(); b.by = "ai"; b.ai = b.text; save(); render(); setStatus("✓ Saved"); }).catch(function (e) { toast("Gemini didn't answer: " + e.message); });
      }
    });
  }

  /* ================= 2 · TRANSLATE ================= */
  // quotations in Portuguese or English are kept as they are: replaced by [Q1]… for DeepL and put back after
  function segments(t) {
    var quotes = [], k = 0;
    var keep = function (m) { quotes.push(m); k++; return "[Q" + k + "]"; };
    var out = String(t)
      .replace(/[“"「『]([^”"」』]*[A-Za-zÀ-ÿ]{3,}[^”"」』]*)[”"」』]/g, function (m, inner) { return CJK.test(inner) ? m : keep(m); })
      .replace(/[（(]([^（）()]*[A-Za-zÀ-ÿ]{3,}[^（）()]*)[）)]/g, function (m, inner) { return CJK.test(inner) ? m : keep(m); })
      .replace(/\*[^*\n]*[A-Za-zÀ-ÿ]{3,}[^*\n]*\*/g, function (m) { return CJK.test(m) ? m : keep(m); })
      .replace(/《([^《》]*[A-Za-zÀ-ÿ]{3,}[^《》]*)》/g, function (m, inner) { return CJK.test(inner) ? m : keep(m); });
    return { text: out, quotes: quotes };
  }
  function restoreQuotes(en, quotes) {
    return String(en).replace(/\[\s*Q\s*(\d+)\s*\]/gi, function (m, n) {
      var q = quotes[+n - 1]; if (!q) return m;
      // Chinese brackets become English ones
      return q.replace(/^《([\s\S]*)》$/, "*$1*").replace(/^（/, "(").replace(/）$/, ")").replace(/^[「『]/, "“").replace(/[」』]$/, "”");
    });
  }
  function deeplURL(t) { return "https://www.deepl.com/translator#zh/en-us/" + encodeURIComponent(t).replace(/%2F/g, "%5C%2F"); }
  function stepTranslate(body) {
    var p = W.paper, bs = p.blocks.filter(function (b) { return !b.ref && !REF.test(b.text); });   // Works Cited stays as written
    var done = bs.filter(function (b) { return (p.english[b.id] || {}).en; }).length;
    body.innerHTML = '<div class="wr-tools"><span class="wr-key">' + done + " of " + bs.length + " paragraphs in English</span>" +
      '<button type="button" class="pill" data-t="paste">Paste DeepL\'s whole translation</button>' +
      '<button type="button" class="pill" data-t="copyzh">Copy Chinese for DeepL</button>' +
      '<button type="button" class="pill" data-t="copy">Copy all English</button>' +
      '<button type="button" class="pill" data-t="docx">Download English .docx</button></div>' +
      '<p class="j-hint">Click <b>DeepL ↗</b> beside a paragraph, copy DeepL\'s English and paste it into the box; or translate the whole text on deepl.com and use “Paste DeepL\'s whole translation”. Quotations in Portuguese or English are kept aside as [Q1], [Q2]… and put back automatically, so DeepL never translates them.</p>' +
      '<div class="wr-tr">' + bs.map(function (b) {
        var seg = segments(b.text), en = p.english[b.id] || {}, stale = en.en && en.zh && en.zh !== b.text;
        var zhShown = esc(b.text);
        seg.quotes.forEach(function (q) { zhShown = zhShown.split(esc(q)).join('<span class="wr-q">' + esc(q) + "</span>"); });
        return '<div class="desk-row"><div class="desk-zh">' + zhShown + "</div>" +
          '<div class="desk-en"><textarea data-b="' + b.id + '" rows="3" placeholder="English…">' + esc(en.en || "") + "</textarea>" +
          '<div class="desk-tools"><a class="mini-btn" href="' + esc(deeplURL(seg.text)) + '" target="_blank" rel="noopener">DeepL ↗</a>' +
          (stale ? '<span class="wr-stale">The Chinese changed after this was translated</span>' : "") + "</div></div></div>";
      }).join("") + "</div>";
    $$("textarea[data-b]", body).forEach(function (ta) {
      var grow = function () { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 2) + "px"; }; setTimeout(grow, 0);
      ta.addEventListener("input", function () {
        var b = p.blocks.filter(function (x) { return x.id === ta.getAttribute("data-b"); })[0];
        var seg = segments(b.text), v = restoreQuotes(ta.value, seg.quotes);
        if (v !== ta.value) { var pos = ta.selectionStart + (v.length - ta.value.length); ta.value = v; ta.setSelectionRange(pos, pos); }
        p.english[b.id] = { en: ta.value, zh: b.text, by: "me" };
        grow(); clearTimeout(W.timers.tr); W.timers.tr = setTimeout(save, 700);
      });
    });
    body.onclick = function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      var k = b.getAttribute("data-t");
      if (k === "copy") navigator.clipboard.writeText(englishText()).then(function () { toast("English copied."); });
      if (k === "copyzh") navigator.clipboard.writeText(bs.map(function (x) { return segments(x.text).text; }).join("\n\n")).then(function () { window.open("https://www.deepl.com/translator#zh/en-us/", "_blank", "noopener"); toast("Chinese copied with [Q] markers. Paste it into DeepL, then bring the English back with “Paste DeepL's whole translation”."); });
      if (k === "docx") docx(false, "en");
      if (k === "paste") {
        var w = sheet("DeepL's translation", '<p class="j-hint">Paste the whole English text. Paragraphs are matched in order.</p><textarea class="ed-input" rows="14" data-in></textarea>' +
          '<label class="ed-check"><input type="checkbox" data-over> Also replace paragraphs that already have English</label>');
        var foot = $(".ed-actions", w); foot.innerHTML = '<button type="button" class="pill solid" data-go>Match paragraphs</button>';
        $("[data-go]", w).addEventListener("click", function () {
          var ens = A().paragraphs($("[data-in]", w).value), over = $("[data-over]", w).checked, n = 0;
          if (ens.length !== bs.length && !window.confirm("DeepL's text has " + ens.length + " paragraphs and your draft has " + bs.length + ". Match them in order anyway?")) return;
          bs.forEach(function (x, i) {
            if (!ens[i]) return;
            if ((p.english[x.id] || {}).en && !over) return;
            p.english[x.id] = { en: restoreQuotes(ens[i], segments(x.text).quotes), zh: x.text, by: "deepl" }; n++;
          });
          save(); closeSheet(); render(); toast(n + " paragraphs filled. Read them through beside the Chinese.");
        });
      }
    };
  }
  function englishText() {
    var p = W.paper;
    return p.blocks.map(function (b) { return REF.test(b.text) || b.ref ? b.text : ((p.english[b.id] || {}).en || ""); }).filter(Boolean).join("\n\n");
  }

  /* ================= 3 · SOURCES ================= */
  function stepSources(body) {
    var p = W.paper, items = [];
    p.blocks.forEach(function (b) {
      if (b.ref || REF.test(b.text)) return;
      var en = (p.english[b.id] || {}).en;
      // look in the English (better for searching) and in the Chinese (where the claim was first written)
      [en, b.text].filter(Boolean).forEach(function (use) {
        var an = A().analyze(use).paragraphs[0]; if (!an) return;
        an.sentences.forEach(function (s) {
          var claim = s.needsCite || (A().years(s.text).length && /[A-ZÀ-Ý][a-zà-ÿ]{2,}/.test(s.text) && s.score >= 70);
          if (!claim) return;
          var id = hashText(s.text);
          if (!items.some(function (x) { return x.id === id; })) items.push({ id: id, s: s.text.trim(), cite: s.needsCite });
        });
      });
    });
    var q = function (s) {
      var quote = (s.match(/[“"]([^”"]{8,})[”"]/) || [])[1];
      var base = quote ? '"' + quote.slice(0, 140) + '"' : s.replace(/\([^)]*\)/g, "").slice(0, 220);
      return base + (p.keywords ? " " + p.keywords.split(/[,，]/)[0] : "");
    };
    body.innerHTML = '<p class="j-hint">Sentences that quote, attribute ("X argues…") or state specific facts without a citation. Search them to find who said it first — or to check that nothing you wrote is too close to a published text. ' +
      (p.english && Object.keys(p.english).length ? "English sentences are used where you have them." : "Translate first (step 2) for searches in English.") + "</p>" +
      (items.length ? '<ol class="wr-src">' + items.map(function (it, k) {
        var qq = encodeURIComponent(q(it.s));
        return '<li class="' + (p.sources[it.id] ? "done" : "") + '"><label class="ed-check"><input type="checkbox" data-done="' + it.id + '"' + (p.sources[it.id] ? " checked" : "") + "> done</label>" +
          '<p>' + esc(it.s) + (it.cite ? ' <span class="wr-need">needs a citation</span>' : "") + "</p>" +
          '<p class="desk-tools"><a class="mini-btn" target="_blank" rel="noopener" href="https://www.google.com/search?udm=50&q=' + qq + '">Google AI Mode ↗</a>' +
          '<a class="mini-btn" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=' + qq + '">Google Scholar ↗</a>' +
          '<a class="mini-btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + qq + '+filetype%3Apdf">PDFs ↗</a>' +
          (aiKey() ? '<button type="button" class="mini-btn" data-g="' + k + '">Ask Gemini (with search)</button>' : "") + "</p><div class=\"wr-gres\"></div></li>";
      }).join("") + "</ol>" : '<p class="empty">Nothing found that needs a source.</p>');
    body.onchange = function (e) { var id = e.target.getAttribute("data-done"); if (!id) return; p.sources[id] = e.target.checked; e.target.closest("li").classList.toggle("done", e.target.checked); save(); };
    body.onclick = function (e) {
      var g = e.target.closest("[data-g]"); if (!g) return;
      var it = items[+g.getAttribute("data-g")], box = $(".wr-gres", g.closest("li"));
      box.innerHTML = '<p class="j-hint">Searching…</p>';
      gemini(context() + "\nFind who made this claim or wrote this quotation: the scholar, the work and, if possible, the page. Prefer a link to a PDF of the work. Give the source with links, an MLA 9 in-text citation and an MLA 9 Works Cited entry. If you cannot verify it, say so plainly — never guess.\n\nSentence:\n" + it.s, { search: true })
        .then(function (r) {
          box.innerHTML = '<div class="wr-answer">' + esc(r.text).replace(/\n/g, "<br>") + "</div>" + (r.sources.length ? "<ul>" + r.sources.map(function (s) { return '<li><a href="' + esc(s.uri) + '" target="_blank" rel="noopener">' + esc(s.title || s.uri) + "</a></li>"; }).join("") + "</ul>" : "");
        }).catch(function (er) { box.innerHTML = '<p class="j-hint">Gemini didn\'t answer: ' + esc(er.message) + "</p>"; });
    };
  }

  /* ================= 4 · FORMAT ================= */
  function mlaDate() { var d = new Date(); return d.getDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()] + " " + d.getFullYear(); }
  function worksCited() {
    var p = W.paper, inText = [], at = p.blocks.findIndex(function (b) { return REF.test(b.text); });
    if (at > -1) inText = p.blocks.slice(at + 1).map(function (b) { return b.text; });
    var list = (p.worksCited || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return list.length ? list : inText;
  }
  function stepFormat(body) {
    var p = W.paper, m = p.mla, hasEn = englishText().trim().length > 0;
    var source = p.formatLang || (hasEn ? "en" : "zh");
    var full = source === "en" ? englishText() : text();
    var issues = A().mlaIssues(full + "\n\nWorks Cited\n" + worksCited().join("\n")).issues;
    body.innerHTML = '<div class="wr-setup">' +
      '<div class="ed-field"><span class="ed-label">Format which text</span><div class="ed-tabs">' +
        '<button type="button" class="chip' + (source === "en" ? " on" : "") + '" data-f="lang" data-v="en">English</button><button type="button" class="chip' + (source === "zh" ? " on" : "") + '" data-f="lang" data-v="zh">Chinese</button></div></div>' +
      (source === "en" ? '<label class="ed-field"><span class="ed-label">Title in English</span><input class="ed-input" data-t-en value="' + esc(p.title_en || "") + '" placeholder="' + esc(p.title) + '"></label>' : "") +
      '<div class="ed-row2"><label class="ed-field"><span class="ed-label">Your name</span><input class="ed-input" data-m="name" value="' + esc(m.name || "") + '"></label>' +
        '<label class="ed-field"><span class="ed-label">Instructor / editor</span><input class="ed-input" data-m="instructor" value="' + esc(m.instructor || "") + '"></label></div>' +
      '<div class="ed-row2"><label class="ed-field"><span class="ed-label">Course / journal</span><input class="ed-input" data-m="course" value="' + esc(m.course || "") + '"></label>' +
        '<label class="ed-field"><span class="ed-label">Date</span><input class="ed-input" data-m="date" value="' + esc(m.date || mlaDate()) + '"></label></div>' +
      '<label class="ed-field"><span class="ed-label">Works Cited — one entry per line (MLA 9)</span><textarea class="ed-input" data-wc rows="8">' + esc(worksCited().join("\n")) + "</textarea></label>" +
      '<p class="owner-tools"><button type="button" class="pill" data-f="sort">Sort A–Z</button>' + (aiKey() ? '<button type="button" class="pill" data-f="ai">Ask Gemini to check MLA 9</button>' : "") + "</p>" +
      '<h4 class="wr-sub">MLA 9 check</h4>' + (issues.length ? '<ol class="wr-olist">' + issues.map(function (x, k) {
        return "<li><code>" + esc(x.show || x.found) + "</code>" + (x.fix ? " → <code>" + esc(x.fix.length > 80 ? x.fix.slice(0, 76) + "…" : x.fix) + "</code>" : "") + ' <span class="j-hint">' + esc(x.why) + "</span></li>";
      }).join("") + '</ol><p class="owner-tools"><button type="button" class="pill" data-f="fix">Fix what can be fixed</button></p>' : '<p class="empty">No slips found.</p>') +
      '<h4 class="wr-sub">Portuguese spelling (quotations)</h4><p class="owner-tools"><select class="ed-input" data-f="pt" style="width:auto"><option value="pt-PT"' + (p.pt === "pt-PT" ? " selected" : "") + '>Portugal</option><option value="pt-BR"' + (p.pt === "pt-BR" ? " selected" : "") + '>Brazil</option></select>' +
        '<button type="button" class="pill" data-f="ptcheck">Check with LanguageTool</button></p><div class="wr-ptres"></div>' +
      '<h4 class="wr-sub">Take it out</h4><p class="owner-tools"><button type="button" class="pill solid" data-f="docx">Download MLA .docx</button><button type="button" class="pill" data-f="copy">Copy text</button></p>' +
      '<p class="j-hint">The Word file: Times New Roman 12, double spaced, 1-inch margins, your last name and page number top right, the heading block, a centred title, indented paragraphs, and Works Cited on a new page with hanging indents.</p></div>';
    body.oninput = function (e) {
      var k = e.target.getAttribute("data-m");
      if (k) { m[k] = e.target.value; save(); }
      if (e.target.hasAttribute("data-t-en")) { p.title_en = e.target.value; save(); }
      if (e.target.hasAttribute("data-wc")) { p.worksCited = e.target.value; clearTimeout(W.timers.wc); W.timers.wc = setTimeout(save, 600); }
    };
    body.onchange = function (e) { if (e.target.getAttribute("data-f") === "pt") { p.pt = e.target.value; save(); } };
    body.onclick = function (e) {
      var b = e.target.closest("[data-f]"); if (!b || b.tagName === "SELECT") return;
      var k = b.getAttribute("data-f");
      if (k === "lang") { p.formatLang = b.getAttribute("data-v"); save(); render(); }
      if (k === "sort") { p.worksCited = worksCited().sort(function (a, c) { return a.localeCompare(c, "en", { sensitivity: "base" }); }).join("\n"); save(); render(); }
      if (k === "fix") {
        var fixes = issues.filter(function (x) { return x.fix; });
        if (source === "en") p.blocks.forEach(function (bl) { var en = p.english[bl.id]; if (!en || !en.en) return; fixes.forEach(function (x) { en.en = en.en.split(x.found).join(x.fix); }); });
        else { remember(); p.blocks.forEach(function (bl) { fixes.forEach(function (x) { if (bl.text.indexOf(x.found) > -1) { bl.text = bl.text.split(x.found).join(x.fix); } }); }); }
        p.worksCited = worksCited().map(function (l) { fixes.forEach(function (x) { if (l === x.found) l = x.fix; }); return l; }).join("\n");
        save(); render(); toast(fixes.length + " fixed.");
      }
      if (k === "ptcheck") portuguese($(".wr-ptres", body));
      if (k === "copy") navigator.clipboard.writeText(full + "\n\nWorks Cited\n\n" + worksCited().join("\n")).then(function () { toast("Copied."); });
      if (k === "docx") docx(true, source);
      if (k === "ai") {
        var w = sheet("Gemini · MLA 9", '<p class="j-hint">Checking…</p>');
        gemini("Check these in-text citations and this Works Cited list against MLA 9 (MLA Handbook, 9th edition). List each problem and its correction; then give the corrected Works Cited list after a line '---WORKS CITED---'. Never invent missing information; mark it [missing].\n\nText:\n" + full + "\n\nWorks Cited:\n" + worksCited().join("\n"))
          .then(function (r) {
            var parts = r.text.split(/---WORKS CITED---/);
            $(".ed-body", w).innerHTML = '<div class="wr-answer">' + esc(parts[0]).replace(/\n/g, "<br>") + "</div>";
            if (parts[1]) { var f = $(".ed-actions", w); f.innerHTML = '<button type="button" class="pill solid" data-use>Use the corrected Works Cited</button>'; $("[data-use]", w).addEventListener("click", function () { p.worksCited = parts[1].trim(); save(); closeSheet(); render(); }); }
          }).catch(function (er) { $(".ed-body", w).innerHTML = '<p class="j-hint">Gemini didn\'t answer: ' + esc(er.message) + "</p>"; });
      }
    };
  }
  function portuguese(box) {
    var src = W.paper.blocks.map(function (b) { return b.text; }).join("\n") + "\n" + worksCited().join("\n");
    var list = A().portuguese(src);
    if (!list.length) { box.innerHTML = '<p class="empty">No Portuguese found.</p>'; return; }
    box.innerHTML = '<p class="j-hint">Checking…</p>';
    var t = list.join("\n");
    fetch("https://api.languagetool.org/v2/check", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "language=" + encodeURIComponent(W.paper.pt || "pt-PT") + "&text=" + encodeURIComponent(t) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var ms = (j.matches || []).filter(function (m) { return m.replacements && m.replacements.length; });
        box.innerHTML = ms.length ? '<ol class="wr-olist">' + ms.map(function (m, k) {
          return "<li><code>" + esc(t.substr(m.offset, m.length)) + "</code> → " + m.replacements.slice(0, 3).map(function (r, ri) { return '<button type="button" class="mini-btn" data-pt="' + k + '" data-r="' + ri + '">' + esc(r.value) + "</button>"; }).join("") + ' <span class="j-hint">' + esc(m.message) + "</span></li>";
        }).join("") + '</ol><p class="j-hint">Spelling from the 1820s may be flagged as old-fashioned — keep it in quotations.</p>' : '<p class="empty">No spelling problems found.</p>';
        box.onclick = function (e) {
          var b = e.target.closest("[data-pt]"); if (!b) return;
          var m = ms[+b.getAttribute("data-pt")], wrong = t.substr(m.offset, m.length), right = m.replacements[+b.getAttribute("data-r")].value;
          var line = t.slice(t.lastIndexOf("\n", m.offset) + 1, (t.indexOf("\n", m.offset) + 1 || t.length + 1) - 1), fixed = line.replace(wrong, right);
          remember();
          W.paper.blocks.forEach(function (bl) { if (bl.text.indexOf(line) > -1) bl.text = bl.text.split(line).join(fixed); });
          W.paper.worksCited = worksCited().map(function (l) { return l.split(line).join(fixed); }).join("\n");
          save(); b.closest("li").remove(); toast("“" + wrong + "” → “" + right + "”");
        };
      }).catch(function () { box.innerHTML = '<p class="j-hint">LanguageTool didn\'t answer. Try again in a minute.</p>'; });
  }

  /* ---------- Word file ---------- */
  function docx(mla, lang) {
    var p = W.paper;
    var paragraphs = p.blocks.filter(function (b) { return !b.ref && !REF.test(b.text) && !(worksCited().indexOf(b.text) > -1 && p.blocks.findIndex(function (x) { return REF.test(x.text); }) > -1 && p.blocks.indexOf(b) > p.blocks.findIndex(function (x) { return REF.test(x.text); })); })
      .map(function (b) { return lang === "en" ? ((p.english[b.id] || {}).en || "") : b.text; }).filter(Boolean);
    var go = function () {
      var name = (p.mla.name || "").trim();
      window.AlyxDocx.build({ title: lang === "en" && p.title_en ? p.title_en : p.title, paragraphs: paragraphs, mla: mla ? { name: name, lastName: name.split(/\s+/).pop(), instructor: p.mla.instructor, course: p.mla.course, date: p.mla.date || mlaDate() } : null,
        worksCited: mla ? worksCited() : null }).then(function (blob) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = (p.title || "article").replace(/[\\/:*?"<>|]+/g, " ") + (lang === "en" ? " (English)" : "") + (mla ? " MLA" : "") + ".docx";
        document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 800);
      });
    };
    var root = (W.ctx && W.ctx.root) || "../";
    var need = [];
    if (!window.JSZip) need.push(root + "assets/js/vendor/jszip.min.js");
    if (!window.AlyxDocx) need.push(root + "assets/js/docx.js?v=1");
    need.reduce(function (pr, src) { return pr.then(function () { return new Promise(function (res) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = res; document.head.appendChild(s); }); }); }, Promise.resolve()).then(go);
  }

  /* ---------- Thesis & style ---------- */
  function settings() {
    var p = W.paper, ai = W.ai || {};
    var w = sheet("Thesis & style",
      '<label class="ed-field"><span class="ed-label">Thesis — the argument everything serves</span><textarea class="ed-input" data-s="thesis" rows="3">' + esc(p.thesis) + "</textarea></label>" +
      '<label class="ed-field"><span class="ed-label">Key names and terms</span><input class="ed-input" data-s="keywords" value="' + esc(p.keywords) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Who reads it, and what they already know</span><input class="ed-input" data-s="readers" value="' + esc(p.readers) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Writing you like — passages whose style Gemini should keep (even if the content is old)</span><textarea class="ed-input" data-s="samples" rows="7">' + esc(p.samples) + "</textarea></label>" +
      '<div class="ed-row2"><label class="ed-field"><span class="ed-label">Gemini key (free at aistudio.google.com; kept privately)</span><input class="ed-input" type="password" data-a="gemini_key" value="' + esc(ai.gemini_key || "") + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Gemini model</span><select class="ed-input" data-a="ai_model"><option value="gemini-2.5-pro"' + (ai.ai_model === "gemini-2.5-pro" ? " selected" : "") + '>Gemini Pro — best writing</option><option value="gemini-flash-latest"' + (ai.ai_model !== "gemini-2.5-pro" ? " selected" : "") + ">Gemini Flash — faster</option></select></label></div>" +
      (p.aside.length ? '<h4 class="wr-sub">Kept aside (' + p.aside.length + ")</h4><p class=\"j-hint\">Paragraphs you deleted and earlier versions. Tap one to put it back into the draft.</p>" +
        p.aside.slice(-30).reverse().map(function (a, k) { return '<button type="button" class="wr-salt" data-back="' + (p.aside.length - 1 - k) + '">' + esc(a.text.slice(0, 140)) + (a.text.length > 140 ? "…" : "") + "</button>"; }).join("") : ""));
    w.addEventListener("input", function (e) {
      var s = e.target.getAttribute("data-s"), a = e.target.getAttribute("data-a");
      if (s) { p[s] = e.target.value; save(); }
      if (a) { W.ai[a] = e.target.value.trim(); clearTimeout(W.timers.ai); W.timers.ai = setTimeout(saveAI, 700); }
    });
    w.addEventListener("change", function (e) { var a = e.target.getAttribute("data-a"); if (a) { W.ai[a] = e.target.value.trim(); saveAI(); } });
    w.addEventListener("click", function (e) {
      var b = e.target.closest("[data-back]"); if (!b) return;
      var a = p.aside.splice(+b.getAttribute("data-back"), 1)[0];
      p.deleted = p.deleted.filter(function (h) { return h !== hashText(a.text); });
      remember(); addText([a.text]); save(); closeSheet(); W.step = 1; render(); toast("Put back.");
    });
  }

  /* ---------- sheet ---------- */
  function sheet(title, html) {
    closeSheet();
    var wrap = document.createElement("div");
    wrap.className = "ed-sheet wr-sheet"; wrap.setAttribute("role", "dialog");
    wrap.innerHTML = '<div class="ed-panel"><header class="ed-head"><h2>' + esc(title) + '</h2><button type="button" class="ed-x" aria-label="Close">×</button></header><div class="ed-body">' + html +
      '</div><footer class="ed-foot"><span class="ed-status"></span><span class="ed-actions"></span></footer></div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add("lb-open");
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.classList.contains("ed-x")) closeSheet(); });
    return wrap;
  }
  function closeSheet() {
    var s = $(".wr-sheet"); if (s) s.remove();
    if (!$(".ed-sheet") && !$(".ed-write")) document.documentElement.classList.remove("lb-open");
    if (W.needRender) { W.needRender = false; render(); }
  }

  window.addEventListener("beforeunload", function () { if (W.paper) { flush(); try { localStorage.setItem("alyx-paper:" + W.paper.id, JSON.stringify(W.paper)); } catch (e) {} } });
  window.AlyxWriter = { mount: mount, _W: W, _organize: organize, _segments: segments, _restore: restoreQuotes };
})();
