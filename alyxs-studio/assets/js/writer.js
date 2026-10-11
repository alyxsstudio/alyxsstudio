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

  var W = { ctx: null, list: null, listSha: null, paper: null, step: 1, history: [], status: "", ai: null, aiSha: null, timers: {}, job: null, cloudErr: "" };

  /* ---------- storage: on this device first (instant, survives refresh), then your private repository ---------- */
  var DB = null;
  function db() {
    if (DB) return DB;
    DB = new Promise(function (res) {
      try {
        var r = indexedDB.open("alyx-thesis", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return DB;
  }
  function lget(k) {
    return db().then(function (d) {
      if (!d) { try { return JSON.parse(localStorage.getItem("alyx-thesis:" + k) || "null"); } catch (e) { return null; } }
      return new Promise(function (res) { try { var q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); }; } catch (e) { res(null); } });
    });
  }
  function lput(k, v) {
    return db().then(function (d) {
      var copy = JSON.parse(JSON.stringify(v));
      if (!d) { try { localStorage.setItem("alyx-thesis:" + k, JSON.stringify(copy)); return true; } catch (e) { return false; } }
      return new Promise(function (res) { try { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(copy, k); t.oncomplete = function () { res(true); }; t.onerror = function () { res(false); }; } catch (e) { res(false); } });
    });
  }
  function priv() { return E().priv; }
  function cloudFail(e) {
    var m = (e && e.message) || String(e);
    W.cloudErr = /unavailable/.test(m) ? "private storage isn't reachable — open /admin once to sign in" : /401|403/.test(m) ? "your sign-in has expired — open /admin and sign in again" : m.slice(0, 120);
  }
  function mergeLists(a, b) {
    var by = {};
    (a || []).concat(b || []).forEach(function (x) { if (!x || !x.id) return; if (!by[x.id] || (x.updated || 0) > (by[x.id].updated || 0)) by[x.id] = x; });
    return Object.keys(by).map(function (k) { return by[k]; }).filter(function (x) { return !x.removed; });
  }
  function loadList() {
    return Promise.all([
      lget("list").catch(function () { return null; }),
      priv().read("papers/index.json").then(function (r) { W.listSha = r && r.sha; W.cloudErr = ""; return (r && r.data && r.data.papers) || []; }).catch(function (e) { cloudFail(e); W.failed = true; return null; })
    ]).then(function (r) { W.removed = ((r[0] || {}).removed) || []; W.list = mergeLists((r[0] || {}).papers, r[1]).filter(function (x) { return W.removed.indexOf(x.id) < 0; }); });
  }
  function saveList() {
    lput("list", { papers: W.list, removed: W.removed || [] });
    clearTimeout(W.timers.list);
    W.timers.list = setTimeout(function () { priv().write("papers/index.json", { papers: W.list }, W.listSha).then(function (sha) { W.listSha = sha; }).catch(cloudFail); }, 1500);
  }
  function loadAI() {
    if (W.ai) return Promise.resolve(W.ai);
    return Promise.all([lget("ai"), priv().read("journal/settings.json").then(function (r) { W.aiSha = r && r.sha; return (r && r.data) || {}; }).catch(function () { return null; })]).then(function (r) {
      W.ai = Object.assign({}, r[0] || {}, r[1] || {});
      if (!W.ai.gemini_key && r[0] && r[0].gemini_key) W.ai.gemini_key = r[0].gemini_key;
      return W.ai;
    });
  }
  function saveAI() {
    lput("ai", { gemini_key: W.ai.gemini_key || "", ai_model: W.ai.ai_model || "" });
    priv().read("journal/settings.json").then(function (r) {   // the journal keeps its own settings in the same file
      var cur = (r && r.data) || {}; cur.gemini_key = W.ai.gemini_key || ""; cur.ai_model = W.ai.ai_model || "";
      return priv().write("journal/settings.json", cur, r && r.sha);
    }).then(function (sha) { W.aiSha = sha; }).catch(function () {});
  }
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
    p.checks = p.checks || {};
    return p;
  }
  function openPaper(id) {
    W.paper = null; W.history = []; W.step = W.step || 1;
    render();
    var old = null; try { old = JSON.parse(localStorage.getItem("alyx-paper:" + id) || "null"); } catch (e) {}   // from the earlier version
    return Promise.all([
      lget("paper:" + id),
      priv().read("papers/" + id + ".json").then(function (r) { W.shas = W.shas || {}; W.shas[id] = r && r.sha; W.cloudErr = ""; return r && r.data; }).catch(function (e) { cloudFail(e); return null; })
    ]).then(function (r) {
      var cands = [r[1], r[0], old].filter(Boolean).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
      W.paper = upgrade(cands[0] || { id: id, title: "Untitled", blocks: [] });
      W.paper.id = id;
      if (cands[0] && cands[0] !== r[1]) save();   // the newest copy was on this device: send it up
      else setStatus(W.cloudErr ? "Saved on this device" : "✓ Saved");
      render();
    });
  }
  function setStatus(t) {
    W.status = t;
    var el = $(".wr-status"); if (!el) return;
    el.textContent = t;
    el.title = W.cloudErr ? "Not yet in your private repository: " + W.cloudErr + ". It is kept safely in this browser meanwhile." : "";
    el.classList.toggle("warn", !!W.cloudErr && /device/.test(t));
  }
  // every change is kept in this browser at once, and sent to your private repository a moment later
  function save(now) {
    var p = W.paper; if (!p) return;
    p.updated = Date.now();
    var id = p.id, key = "save:" + id;
    W.shas = W.shas || {}; W.chain = W.chain || {}; W.pending = W.pending || {};
    clearTimeout(W.timers["local:" + id]);
    W.timers["local:" + id] = setTimeout(function () { lput("paper:" + id, p).then(function (ok) { if (W.paper === p && W.status !== "✓ Saved") setStatus(ok ? "Saved on this device" : "Not saved — this browser blocks storage"); }); }, now ? 0 : 250);
    setStatus("Saving…");
    var entry = (W.list || []).filter(function (x) { return x.id === id; })[0];
    if (!entry) { entry = { id: id }; (W.list = W.list || []).unshift(entry); }
    var words = A().count(text(p.blocks)).total;
    if (entry.title !== p.title || entry.words !== words || Date.now() - (entry.updated || 0) > 6e4) { entry.title = p.title; entry.words = words; entry.updated = Date.now(); saveList(); }
    clearTimeout(W.timers[key]);
    var run = function () {
      clearTimeout(W.timers[key]); delete W.pending[id];
      W.chain[id] = (W.chain[id] || Promise.resolve()).then(function () {
        return priv().write("papers/" + id + ".json", p, W.shas[id]).then(function (sha) {
          W.shas[id] = sha; W.cloudErr = "";
          if (W.paper === p) setStatus("✓ Saved");
          try { localStorage.removeItem("alyx-paper:" + id); } catch (e) {}
        }).catch(function (e) { console.error(e); cloudFail(e); if (W.paper === p) setStatus("Saved on this device"); });
      });
    };
    W.pending[id] = run;
    // a very long article is sent up less often while you type (it is always kept in this browser at once)
    var big = (p.units || []).length > 400 || (p.blocks || []).length > 400;
    W.timers[key] = setTimeout(run, now ? 0 : big ? 9000 : 2500);
  }
  function saveNow() {
    if (W.paper) lput("paper:" + W.paper.id, W.paper);
    Object.keys(W.pending || {}).forEach(function (id) { W.pending[id](); });
  }
  function text(blocks) { return (blocks || W.paper.blocks).map(function (b) { return b.text; }).join("\n\n"); }

  /* ---------- organizing (in the background, nothing shown in the text) ---------- */
  var REF = /^\s*#*\s*(works cited|参考文献|引用文献|bibliography)\s*$/i;
  function isRef(b) { return b.ref || REF.test(b.text); }
  function isHead(t) { return /^#/.test(t); }
  /* Threads, not dates. Paragraphs that belong to the same chain (the same experience, influence,
     relationship or work, as far as the words show it) stay together; the chains follow the order
     you first wrote them in, and inside a chain the paragraphs go in time order.
     items: [{text, ...}] → the same items, reordered, each with .thread */
  function threadOrder(items) {
    if (items.length < 3) return items.slice();
    var raw = items.map(function (it) { return A().terms(it.text); }), vec = A().weigh(raw);
    // a heading goes with the paragraph after it
    var units = [], pend = [];
    items.forEach(function (it, i) {
      if (isHead(it.text)) { pend.push(i); return; }
      units.push({ heads: pend, members: [i] }); pend = [];
    });
    if (pend.length) units.push({ heads: pend, members: [] });
    var top = function (v) { return Object.keys(v).sort(function (a, b) { return v[b] - v[a]; }).slice(0, 16); };
    var threads = [], index = {};   // index: word → threads whose centre has it
    var unitVec = function (u) { var v = {}; u.members.forEach(function (m) { for (var k in vec[m]) v[k] = (v[k] || 0) + vec[m][k]; }); return v; };
    var addTo = function (t, u, uv) {
      t.units.push(u);
      var n = A().norm(uv) || 1;
      for (var k in uv) t.c[k] = (t.c[k] || 0) + uv[k] / n;
      var keys = Object.keys(t.c);
      if (keys.length > 500) { keys.sort(function (a, b) { return t.c[b] - t.c[a]; }).slice(500).forEach(function (k) { delete t.c[k]; }); }
      t.n = A().norm(t.c);
      top(t.c).forEach(function (k) { var l = index[k] = index[k] || []; if (l.indexOf(t) < 0) l.push(t); });
    };
    var simTo = function (t, uv, un) { var d = 0; for (var k in uv) if (t.c[k]) d += uv[k] * t.c[k]; return un && t.n ? d / (un * t.n) : 0; };
    units.forEach(function (u) {
      var uv = unitVec(u), un = A().norm(uv);
      if (!u.members.length) { threads.push({ units: [u], c: {}, n: 0 }); return; }
      var cand = [];
      top(uv).forEach(function (k) { (index[k] || []).forEach(function (t) { if (cand.indexOf(t) < 0) cand.push(t); }); });
      var best = null, bs = 0;
      cand.forEach(function (t) { var s = simTo(t, uv, un); if (s > bs) { bs = s; best = t; } });
      if (best && bs >= 0.14) addTo(best, u, uv);
      else { var t = { units: [], c: {}, n: 0 }; threads.push(t); addTo(t, u, uv); }
    });
    // single paragraphs join the closest chain if there is one; the rest go to the end
    var loose = { units: [], c: {}, n: 0, loose: true };
    threads.slice().forEach(function (t) {
      if (t.units.length !== 1 || !t.units[0].members.length) return;
      var u = t.units[0], uv = unitVec(u), un = A().norm(uv), best = null, bs = 0;
      threads.forEach(function (o) { if (o === t || o.units.length < 2) return; var s = simTo(o, uv, un); if (s > bs) { bs = s; best = o; } });
      threads.splice(threads.indexOf(t), 1);
      if (best && bs >= 0.07) best.units.push(u); else loose.units.push(u);
    });
    if (loose.units.length) threads.push(loose);
    var first = function (u) { return u.members.length ? u.members[0] : u.heads[0]; };
    var out = [];
    threads.forEach(function (t, ti) {
      var us = t.units.slice().sort(function (a, b) { return first(a) - first(b); }), last = -Infinity;
      // (kept in the order you wrote them: a chain is not cut up by dates)
      us.forEach(function (u) { u.heads.concat(u.members).forEach(function (i) { items[i].thread = ti; out.push(items[i]); }); });
    });
    return out;
  }
  // paragraphs that say the same thing → one item, the best wording first, the others kept as its versions
  function mergeRepeats(items) {
    // star groups, not chains: a paragraph joins a group only if it is close to the group's first paragraph,
    // so paragraphs that merely touch the same subject are never swallowed together
    var vec = A().weigh(items.map(function (it) { return A().terms(it.text); }));
    var skip = function (i) { return isHead(items[i].text) || A().count(items[i].text).total < 12; };
    var raw = items.map(function (it) { return A().terms(it.text); });
    var contain = function (i, j) { var a = raw[i], b = raw[j], ka = Object.keys(a), kb = Object.keys(b), n = 0; if (ka.length > kb.length) { var t = ka; ka = kb; kb = t; b = a; } ka.forEach(function (k) { if (b[k]) n++; }); return ka.length ? n / ka.length : 0; };
    var pairs = A().near(vec, 0.45, skip).filter(function (pr) { return contain(pr[0], pr[1]) >= 0.55; }).sort(function (x, y) { return y[2] - x[2]; });
    var seedOf = {}, groups = {};
    pairs.forEach(function (pr) {
      var i = pr[0], j = pr[1];
      if (seedOf[i] == null && seedOf[j] == null) { seedOf[i] = i; seedOf[j] = i; groups[i] = [i, j]; }
      else if (seedOf[i] === i && seedOf[j] == null) { seedOf[j] = i; groups[i].push(j); }
      else if (seedOf[j] === j && seedOf[i] == null) { seedOf[i] = j; groups[j].push(i); }
    });
    var score = function (i) { var t = items[i].text, c = A().count(t).total || 1; return Object.keys(A().terms(t)).length / Math.sqrt(c) - A().fillerIn(t).length; };
    var drop = {}, merged = 0;
    Object.keys(groups).forEach(function (g) {
      var ms = groups[g].sort(function (x, y) { return x - y; });
      var keep = ms.filter(function (m) { return items[m].by === "me"; })[0];
      if (keep == null) keep = ms.slice().sort(function (x, y) { return score(y) - score(x); })[0];
      var k = items[keep];
      ms.forEach(function (m) {
        if (m === keep) return;
        var o = items[m];
        k.src = (k.src && k.src.length ? k.src : [k.text]).concat(o.src && o.src.length ? o.src : [o.text]);
        drop[m] = 1; merged++;
      });
      // the kept paragraph takes the place of the earliest one
      if (ms[0] !== keep) { drop[ms[0]] = 0; drop[keep] = 1; var first = items[ms[0]]; items[ms[0]] = k; items[keep] = first; drop[ms[0]] = 0; }
    });
    return { items: items.filter(function (it, i) { return !drop[i]; }), merged: merged };
  }
  function arrange(paragraphs) {
    var refs = [], body = [], inRefs = false;
    paragraphs.forEach(function (t) { if (REF.test(t)) inRefs = true; (inRefs ? refs : body).push(t); });
    var items = body.map(function (t) { return { id: uid(), text: t, by: "paste", src: [] }; });
    var m = mergeRepeats(items);
    var blocks = threadOrder(m.items);
    refs.forEach(function (t) { blocks.push({ id: uid(), text: t, by: "paste", src: [], ref: true }); });
    return { blocks: blocks, merged: m.merged };
  }
  // regroup the draft you have: repeats merged, chains together; your wording is never changed
  function regroup() {
    var bs = W.paper.blocks.filter(function (b) { return !isRef(b) && !b.head; }), refs = W.paper.blocks.filter(isRef);
    var m = mergeRepeats(bs);
    return threadOrder(m.items).concat(refs);
  }
  // more text added to a draft you have
  function addText(paragraphs) {
    var bs = W.paper.blocks, n = { skipped: 0, versions: 0, placed: 0, gone: 0 };
    var vecs = bs.map(function (b) { return isRef(b) ? {} : A().terms(b.text); });
    paragraphs.forEach(function (t) {
      if (REF.test(t)) return;
      var h = hashText(t);
      var v = A().terms(t);
      var wasDeleted = W.paper.deleted.indexOf(h) > -1 || W.paper.aside.some(function (a) { return a.why === "deleted" && A().cosine(A().terms(a.text), v) > 0.8; });
      if (wasDeleted) { n.gone++; return; }
      var exact = bs.some(function (b) { return hashText(b.text) === h || (b.src || []).some(function (x) { return hashText(x) === h; }); });
      if (exact) { n.skipped++; return; }
      var best = -1, bsim = 0;
      vecs.forEach(function (bv, i) { var s = A().cosine(v, bv); if (s > bsim) { bsim = s; best = i; } });
      if (bsim >= 0.5) {   // another wording of a paragraph you have
        var b = bs[best];
        b.src = b.src && b.src.length ? b.src : [b.text];
        b.src.push(t); b.fresh = true; n.versions++; return;
      }
      // new: next to the paragraph it belongs with
      var nb = { id: uid(), text: t, by: "paste", src: [], fresh: true };
      var refAt = bs.findIndex(isRef), at = bsim >= 0.12 ? best + 1 : (refAt > -1 ? refAt : bs.length);
      bs.splice(at, 0, nb); vecs.splice(at, 0, v);
      n.placed++;
    });
    var bits = [];
    if (n.placed) bits.push(n.placed + " new paragraphs put next to what they belong with");
    if (n.versions) bits.push(n.versions + " new wordings added to paragraphs you have");
    if (n.skipped) bits.push(n.skipped + " repeats skipped");
    if (n.gone) bits.push(n.gone + " you had deleted before, left out");
    return bits.join(" · ") || "Nothing new.";
  }

  /* ---------- Gemini ---------- */
  function aiKey() { return (W.ai || {}).gemini_key; }
  function context() {
    var p = W.paper, c = "You are helping a scholar of literature and film (her field: how knowledge of the East is produced and how East and West are written, in the Lusophone world — Brazil, Portugal, Portuguese Asia) finish an academic article. Treat it as literary and film analysis, not as history.\n";
    if (p.brief) c += "\nAbout this article (from the author):\n" + p.brief.slice(0, 8000) + "\n";
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
  /* models: the first one your key may use is taken; Pro falls back to Flash */
  var MODELS = {
    pro: ["gemini-3.1-pro-preview", "gemini-pro-latest", "gemini-2.5-pro", "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"],
    flash: ["gemini-flash-latest", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-2.5-flash"]
  };
  function pref() { var m = (W.ai || {}).ai_model || "flash"; return /pro/.test(m) ? "pro" : "flash"; }
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function gemini(prompt, opts) {
    opts = opts || {};
    var key = aiKey(), chain = MODELS[opts.tier || pref()].slice();
    W.skip = W.skip || {};
    chain = chain.filter(function (m) { return !W.skip[m]; });
    if (!chain.length) chain = MODELS.flash.slice();
    var body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: Object.assign({ temperature: opts.temp == null ? 0.6 : opts.temp, maxOutputTokens: opts.max || 16384 }, opts.json ? { responseMimeType: "application/json" } : {}),
      tools: opts.search ? [{ google_search: {} }] : undefined });
    var call = function (i, tries) {
      var m = chain[i];
      if (!m) return Promise.reject(new Error(W.lastErr || "Gemini didn't answer"));
      return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: body })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error((j.error && j.error.message) || ("Error " + r.status)); e.status = r.status; e.details = (j.error && j.error.details) || []; throw e; } j.model = m; return j; }); })
        .catch(function (e) {
          W.lastErr = e.message;
          if (opts.job && opts.job.stop) throw e;
          if (e.status === 401 || (e.status === 400 && /api key/i.test(e.message))) throw new Error("The Gemini key isn't valid. Check it in Thesis & style.");
          if (e.status === 404 || e.status === 403 || (e.status === 400 && /model|not found|not supported/i.test(e.message))) { W.skip[m] = 1; return call(i + 1, 0); }
          if (e.status === 429) {
            if (/limit:\s*0\b/.test(e.message) || /free.?tier.*not|not available/i.test(e.message)) { W.skip[m] = 1; note(m); return call(i + 1, 0); }
            var d = (e.details || []).map(function (x) { return x.retryDelay; }).filter(Boolean)[0], ms = d ? Math.min(65, parseFloat(d) + 1) * 1000 : 20000;
            if (tries < 2) { if (opts.onWait) opts.onWait(Math.round(ms / 1000)); return wait(ms).then(function () { return call(i, tries + 1); }); }
            return call(i + 1, 0);
          }
          if ((e.status >= 500 || !e.status) && tries < 2) return wait(4000 * (tries + 1)).then(function () { return call(i, tries + 1); });
          if (e.status >= 500) return call(i + 1, 0);
          throw e;
        });
    };
    return call(0, 0).then(function (j) {
      var cand = (j.candidates || [])[0] || {}, out = ((cand.content || {}).parts || []).filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ""; }).join("");
      var src = (((cand.groundingMetadata || {}).groundingChunks) || []).map(function (g) { return g.web; }).filter(Boolean);
      return { text: out, sources: src, model: j.model, cut: cand.finishReason === "MAX_TOKENS" };
    });
  }
  function note(m) { if (/pro/.test(m) && !W.notedPro) { W.notedPro = true; toast("Gemini Pro isn't open to your key's free plan, so Flash is writing instead."); } }
  function parseJSON(t) { try { return JSON.parse(t); } catch (e) {} try { return JSON.parse((String(t).match(/[\[{][\s\S]*[\]}]/) || [t])[0]); } catch (e) { return null; } }
  function copyPrompt(prompt, after) {
    var go = function () { window.open("https://gemini.google.com/app", "_blank", "noopener"); toast(after || "Prompt copied. Paste it into Gemini, then paste the answer back here."); };
    var manual = function () { window.prompt("Copy this prompt, then paste it into Gemini", prompt); window.open("https://gemini.google.com/app", "_blank", "noopener"); };
    if (navigator.clipboard) navigator.clipboard.writeText(prompt).then(go, manual); else manual();
  }

  /* =====================================================================================
     ORGANIZE — how a human editor would do it, step by step:
     1 Break every text into idea units (one point with its evidence), and tell apart finished
       prose, rough versions, sketches, notes-to-self and scraps.
     2 Put together the units that say the same thing (versions of one idea), choose the most
       mature one, and list contradictions between versions (dates, numbers, names).
     3 Find the hidden chains — experience → effect on his character and choices → the novel —
       and arrange them for a reader: a vivid way in, a gradual reveal, the thesis at the end.
     4 Fuse the versions of each idea into one passage that keeps every detail.
     5 Assemble a rough draft from that map. Rewriting with Gemini comes after, on request.
     Every stage is saved, so a long run can be continued after a refresh or a Gemini limit.
     ===================================================================================== */
  var NOTE_RE = /^(我希望|我觉得|我们现在|我们其实|我突然意识到|我需要|我是希望|你(之前|这里|上一|需要|要|不能|从|说|抓到|对|们的|的这个|这个)|请你|这个版本|这一版|解决方案|根据我们|如果你需要|这里要强调|可以这样写|下面是|以下是推测)/;
  function joinSents(ss) { return ss.reduce(function (t, s) { return t + (t && /[A-Za-zÀ-ÿ0-9.,;:!?”"’)]$/.test(t) && /^[A-Za-zÀ-ÿ“"(]/.test(s) ? " " : "") + s; }, ""); }
  function localKind(t) {
    var s = t.trim(), core = s.replace(/[\s\d\p{P}\p{S}_]/gu, "");
    if (core.length < 5) return "fragment";
    if (/^(#{1,6}\s|第[一二三四五六七八九十\d]+(部分|章|节))/.test(s) && s.length < 60) return "heading";
    if (NOTE_RE.test(s)) return "note";
    if (!/[。！？.!?”"」』)）:：]$/.test(s) && A().count(s).total < 30) return "fragment";
    return "text";
  }
  function localMat(t) {
    var c = A().count(t).total, spec = (t.match(/1[5-9]\d\d|20\d\d|[一二三四五六七八九〇]{4}年|[“"「《][^”"」》]{2,}[”"」》]|[A-ZÀ-Ý][a-zà-ÿ]{2,}/g) || []).length;
    var ends = /[。！？.!?”"」』)）]$/.test(t.trim());
    if (c < 40 || !ends) return 1;
    return c > 140 && spec >= 2 ? 3 : 2;
  }
  function firstYear(t) { var y = A().years(t); return y.length ? String(Math.min.apply(null, y)) : null; }
  function ideaById(id) { return (W.paper.map && W.paper.map.ideas || []).filter(function (x) { return x.id === id; })[0]; }
  function unitById(id) { return (W.paper.units || []).filter(function (x) { return x.id === id; })[0]; }
  function srcName(id) { var s = (W.paper.texts || []).filter(function (x) { return x.id === id; })[0]; return s ? s.name : ""; }
  var MATW = { 3: "mature", 2: "developing", 1: "sketch" };

  /* 1 · break: paragraphs → units; exact and near repeats are recognised here, without Gemini */
  function addMaterial(raw, name) {
    var p = W.paper;
    p.texts = p.texts || []; p.units = p.units || [];
    var src = { id: "s" + Date.now().toString(36), name: name || ("Pasted " + new Date().toLocaleString()), at: Date.now() };
    var ps = A().paragraphs(raw), units = [], tbl = null;
    ps.forEach(function (t) {
      if (/^\|.*\|$/.test(t)) { if (tbl) { tbl.text += "\n" + t; return; } tbl = { text: t }; units.push(tbl); return; }   // a table stays together
      tbl = null; units.push({ text: t });
    });
    var known = {}; p.units.forEach(function (u) { known[hashText(u.text)] = u; });
    var vecOld = null, added = 0, same = 0;
    units.forEach(function (u) {
      if (REF.test(u.text)) return;
      var h = hashText(u.text);
      var nu = { id: "u" + (++p.unitSeq || (p.unitSeq = 1)), src: src.id, text: u.text, kind: localKind(u.text), mat: localMat(u.text), when: firstYear(u.text), fresh: true };
      if (known[h]) { nu.dup = known[h].id; same++; } else known[h] = nu;
      p.units.push(nu); added++;
    });
    // near repeats (almost the same wording) are versions of the same unit
    var live = p.units.filter(function (u) { return !u.dup && u.kind !== "note"; });
    var vec = A().weigh(live.map(function (u) { return A().terms(u.text); }));
    A().near(vec, 0.9, function (i) { return A().count(live[i].text).total < 15; }).forEach(function (pr) {
      var a = live[pr[0]], b = live[pr[1]];
      if (a.dup || b.dup) return;
      var keep = A().count(a.text).total >= A().count(b.text).total ? a : b, drop = keep === a ? b : a;
      if (drop.fresh || keep.fresh) { drop.dup = keep.id; same++; }
    });
    p.texts.push(Object.assign(src, { units: added }));
    return { added: added, same: same, src: src };
  }

  /* Gemini helpers for the stages */
  function stageGemini(prompt, job, opts) {
    return gemini(prompt, Object.assign({ json: true, max: 32768, temp: 0.3, job: job, onWait: function (s) { job.label = "Gemini asked to wait " + s + " s (free plan limit)…"; progress(); } }, opts || {}));
  }
  function setJob(job, label) { job.label = label; progress(); }

  var CARD_RULES = "You are reading raw material for a literary-studies article (mostly Chinese, with Portuguese, French and English quotations). It mixes finished paragraphs, rough drafts, several versions of the same passage, explanations written by AI tools (often bullet points), the author's own instructions or comments to an AI, outline lines and scraps.\n\n" +
    "Split each numbered paragraph into IDEA UNITS. An idea unit is one point with its evidence: one scene or event, one fact or document, one argument or interpretation. Most paragraphs are one unit; split only where the paragraph moves to a different point. Use the sentence numbers ①②③….\n\n" +
    "For each unit give:\n" +
    "- \"s\": the sentence range, e.g. \"1-3\"\n" +
    "- \"kind\": \"text\" (content for the article in any form — including AI explanations and bullet notes that contain facts or arguments) | \"note\" (the author's instructions, questions, plans or judgments addressed to a writer or an AI, to-dos, research tasks) | \"fragment\" (an unfinished sentence or a scrap without a complete point) | \"heading\" (a title or outline line)\n" +
    "- \"mat\": 3 = mature (complete, specific, explained and well written; every claim carries its evidence), 2 = developing (the point is there but vague, unsupported, unexplained or rough), 1 = sketch (keywords, a slogan-like claim, an outline of an idea)\n" +
    "- \"when\": the time the content is ABOUT (not when it was written): a year or range such as \"1794\" or \"1768-1789\"; null for timeless analysis\n" +
    "- \"point\": ONE sentence in Chinese saying exactly what the unit says — specific names, dates and the claim — so that two units saying the same thing get nearly the same point\n" +
    "- \"who\": up to 5 key people, places or works (original spelling)\n" +
    "Answer JSON only: {\"P1\":[{\"s\":\"1-2\",\"kind\":\"text\",\"mat\":3,\"when\":\"1794\",\"point\":\"…\",\"who\":[\"…\"]}],\"P2\":[…]}";
  function cardBatches(units) {
    var out = [], cur = [], size = 0;
    units.forEach(function (u) { var n = u.text.length; if (cur.length && (size + n > 9000 || cur.length >= 45)) { out.push(cur); cur = []; size = 0; } cur.push(u); size += n; });
    if (cur.length) out.push(cur);
    return out;
  }
  var CIRC = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  function numbered(u) { var ss = A().sentences(u.text); u._ss = ss; return ss.map(function (s, i) { return (CIRC[i] || "(" + (i + 1) + ")") + s; }).join(""); }
  // stage 1 with Gemini: cards (and splits) for every unit not yet read
  function readCards(job) {
    var p = W.paper, todo = p.units.filter(function (u) { return !u.dup && !u.carded && !u.parent; });
    var batches = cardBatches(todo);
    job.total = batches.length + 3; job.done = 0;
    return batches.reduce(function (pr, batch, bi) {
      return pr.then(function () {
        if (job.stop) throw new Error("stopped");
        setJob(job, "Reading your texts and breaking them into ideas… part " + (bi + 1) + " of " + batches.length);
        var prompt = context() + "\n" + CARD_RULES + "\n\nParagraphs:\n\n" + batch.map(function (u, i) { return "[P" + (i + 1) + "] " + numbered(u); }).join("\n\n");
        return stageGemini(prompt, job).then(function (r) {
          var j = parseJSON(r.text) || {};
          batch.forEach(function (u, i) {
            var cards = j["P" + (i + 1)]; u.carded = true;
            if (!Array.isArray(cards) || !cards.length) return;
            var apply = function (t, c) { t.kind = /^(text|note|fragment|heading)$/.test(c.kind) ? c.kind : t.kind; t.mat = [1, 2, 3].indexOf(+c.mat) > -1 ? +c.mat : t.mat; t.when = c.when || t.when; t.pt = String(c.point || "").slice(0, 200); t.who = (c.who || []).slice(0, 5); };
            if (cards.length === 1) { apply(u, cards[0]); return; }
            // several ideas in one paragraph: it becomes several units (its text is kept whole as their parent)
            var ss = u._ss || A().sentences(u.text), made = 0;
            cards.forEach(function (c) {
              var m = String(c.s || "").match(/(\d+)\s*[-–~]\s*(\d+)|(\d+)/); if (!m) return;
              var a = +(m[1] || m[3]) - 1, b = +(m[2] || m[3]) - 1; if (a < 0 || b < a || a >= ss.length) return;
              var t = joinSents(ss.slice(a, Math.min(b, ss.length - 1) + 1)).trim(); if (!t) return;
              var nu = { id: "u" + (++p.unitSeq), src: u.src, text: t, parent: u.id, carded: true, kind: "text", mat: 2, when: null, fresh: u.fresh };
              apply(nu, c); p.units.push(nu); made++;
            });
            if (made) u.split = true; else apply(u, cards[0]);
          });
          job.done++; progress(); save();
        });
      });
    }, Promise.resolve());
  }
  // the units that take part in the map (a split paragraph is represented by its parts)
  function mapUnits() { return (W.paper.units || []).filter(function (u) { return !u.dup && !u.split; }); }

  var GROUP_RULES = "Below are cards: each is one idea unit from the author's material (id, time it is about, maturity, kind, and its point). Many cards say the same thing in different words, in different texts, or one is a fuller version of another.\n" +
    "1. Put together the cards that make THE SAME POINT (versions of one idea). Do not group cards that are merely on the same topic: two different facts about the same person are two ideas. For each group choose the best card — the most complete, specific and best-written (prefer maturity 3; if equal, prefer the later text) — and write a short gist in Chinese.\n" +
    "2. List contradictions: cards that state different facts about the same thing (dates, numbers, durations, names, who did what).\n" +
    "Answer JSON only: {\"groups\":[{\"cards\":[\"c12\",\"c40\"],\"best\":\"c40\",\"gist\":\"…\"}],\"conflicts\":[{\"cards\":[\"c3\",\"c9\"],\"note\":\"in Chinese: what differs\"}]}\nCards that have no other version need not be listed.";
  function cardLine(u) { return "[" + u.id + "] (" + (u.when || "—") + " · " + MATW[u.mat || 2] + (u.kind !== "text" ? " · " + u.kind : "") + ") " + (u.pt || u.text.slice(0, 120)); }
  function groupIdeas(job) {
    var p = W.paper, us = mapUnits().filter(function (u) { return u.kind === "text" || u.kind === "fragment"; });
    setJob(job, "Finding the passages that say the same thing… (" + fmtN(us.length) + " ideas)");
    return stageGemini(context() + "\n" + GROUP_RULES + "\n\nTexts in the order they were added: " + (p.texts || []).map(function (s, i) { return (i + 1) + ". " + s.name; }).join("; ") + "\n\nCards:\n" + us.map(function (u) { return cardLine(u) + " {text " + ((p.texts || []).findIndex(function (s) { return s.id === u.src; }) + 1) + "}"; }).join("\n"), job, { temp: 0.2 })
      .then(function (r) {
        var j = parseJSON(r.text) || {}, byId = {}, taken = {};
        us.forEach(function (u) { byId[u.id] = u; });
        var ideas = [];
        (j.groups || []).forEach(function (g) {
          var ids = (g.cards || []).filter(function (id) { return byId[id] && !taken[id]; }); if (ids.length < 1) return;
          ids.forEach(function (id) { taken[id] = 1; });
          var best = ids.indexOf(g.best) > -1 ? g.best : ids.slice().sort(function (a, b) { return (byId[b].mat || 0) - (byId[a].mat || 0) || byId[b].text.length - byId[a].text.length; })[0];
          ideas.push({ units: ids, best: best, gist: String(g.gist || byId[best].pt || "").slice(0, 160) });
        });
        us.forEach(function (u) { if (!taken[u.id]) ideas.push({ units: [u.id], best: u.id, gist: u.pt || u.text.slice(0, 80) }); });
        p.conflicts = (j.conflicts || []).map(function (c) { return { units: (c.cards || []).filter(function (id) { return byId[id]; }), note: String(c.note || "") }; }).filter(function (c) { return c.units.length > 1; });
        return ideas;
      });
  }
  // local version of the same step, for working without a key
  function groupIdeasLocal() {
    var us = mapUnits().filter(function (u) { return u.kind === "text" || u.kind === "fragment"; });
    var items = us.map(function (u) { return { id: u.id, text: u.text, by: "paste", src: [] }; });
    var vec = A().weigh(items.map(function (it) { return A().terms(it.text); }));
    // anchors: the rare, specific things a passage mentions (numbers, years, names, quoted words)
    var anc = items.map(function (it) { var o = {}; (it.text.match(/\d[\d,.]*|[一二三四五六七八九十百千万〇零]{3,}|[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s[A-ZÀ-Ý][a-zà-ÿ]+)*|[“"「《（(][^”"」》）)]{2,24}[”"」》）)]/g) || []).forEach(function (a) { o[a.toLowerCase()] = 1; }); return o; });
    var df = {}; anc.forEach(function (o) { for (var a in o) df[a] = (df[a] || 0) + 1; });
    var shared = function (i, j) { var n = 0; for (var a in anc[i]) if (anc[j][a] && df[a] <= 12) n++; return n; };
    var seed = {}, groups = {};
    A().near(vec, 0.28, function (i) { return A().count(items[i].text).total < 15; }).filter(function (pr) { return pr[2] >= 0.5 || shared(pr[0], pr[1]) >= 2; }).sort(function (a, b) { return b[2] - a[2]; }).forEach(function (pr) {
      var i = pr[0], j = pr[1];
      if (seed[i] == null && seed[j] == null) { seed[i] = i; seed[j] = i; groups[i] = [i, j]; }
      else if (seed[i] === i && seed[j] == null) { seed[j] = i; groups[i].push(j); }
      else if (seed[j] === j && seed[i] == null) { seed[i] = j; groups[j].push(i); }
    });
    var ideas = [], used = {};
    Object.keys(groups).forEach(function (g) {
      var ms = groups[g].map(function (k) { used[k] = 1; return us[k]; });
      var best = ms.slice().sort(function (a, b) { return (b.mat || 0) - (a.mat || 0) || b.text.length - a.text.length; })[0];
      ideas.push({ units: ms.map(function (u) { return u.id; }), best: best.id, gist: best.text.slice(0, 80) });
    });
    us.forEach(function (u, k) { if (!used[k]) ideas.push({ units: [u.id], best: u.id, gist: u.text.slice(0, 80) }); });
    // keep them in the order they first appear
    var pos = {}; us.forEach(function (u, k) { pos[u.id] = k; });
    ideas.sort(function (a, b) { return Math.min.apply(null, a.units.map(function (id) { return pos[id]; })) - Math.min.apply(null, b.units.map(function (id) { return pos[id]; })); });
    return ideas;
  }

  var OUTLINE_RULES = "You are the editor of this article. Below are its ideas (id, the time each is about, maturity, number of versions, gist), and the author's own notes found in the material — follow them, they say what she wants.\n\n" +
    "Design the article the way a fine human editor would:\n" +
    "1. Find the CHAINS. A chain is one line of cause and effect through the life and work of the person at the centre: an experience, institution, place, encounter, relationship or reading → how it shaped his fears, desires, character or way of seeing → the choices it led to → what it became in the novel. Group ideas by these hidden connections, NOT by shared keywords and NOT by date. Ideas that are scattered across different texts but belong to one chain must end up together. Keep every chain whole.\n" +
    "2. Inside a chain, order the ideas so that each one prepares the next (usually the order in time).\n" +
    "3. Order the chains for a reader: open with a concrete, vivid scene or document that raises a question; reveal gradually — do not give away the conclusion in the first section; let each section answer something and raise the next question; explain mechanisms (institutions, laws, social structures) before the phenomena they produce; build toward the thesis; close by drawing the chains together.\n" +
    "4. Every idea id must be placed in exactly one section, except ideas that are plainly outside this article (list them as \"outside\"). Keep everything else — even sketches belong where their point fits.\n" +
    "5. Note gaps: places where a link in a chain is asserted but not supported, or where readers would need a missing explanation.\n" +
    "Section titles short, in Chinese.\n" +
    "Answer JSON only: {\"title\":\"…\",\"sections\":[{\"title\":\"…\",\"does\":\"what this section does for the reader and why it comes here\",\"chain\":\"the cause-and-effect line, e.g. A → B → C\",\"ideas\":[\"i3\",\"i17\"]}],\"gaps\":[{\"idea\":\"i17\",\"note\":\"…\"}],\"outside\":[\"i40\"]}";
  function outline(ideas, job) {
    var p = W.paper, notes = mapUnits().filter(function (u) { return u.kind === "note"; });
    setJob(job, "Finding the chains of cause and effect and the order for a reader… (" + fmtN(ideas.length) + " ideas)");
    var lines = ideas.map(function (d) {
      var b = unitById(d.best) || {};
      return "[" + d.id + "] (" + (b.when || "—") + " · " + MATW[b.mat || 2] + (d.units.length > 1 ? " · " + d.units.length + " versions" : "") + ") " + d.gist;
    });
    var noteText = notes.slice(0, 60).map(function (u) { return "- " + u.text.slice(0, 600); }).join("\n");
    return stageGemini(context() + "\n" + OUTLINE_RULES + (noteText ? "\n\nThe author's notes:\n" + noteText : "") + "\n\nIdeas:\n" + lines.join("\n"), job, { temp: 0.4 }).then(function (r) {
      var j = parseJSON(r.text);
      if (!j || !Array.isArray(j.sections) || !j.sections.length) throw new Error("Gemini's outline couldn't be read" + (r.cut ? " (it was cut off)" : "") + ".");
      return j;
    });
  }
  function outlineLocal(ideas) {
    // without Gemini: related ideas grouped by their words; each group named after its main names
    var items = ideas.map(function (d) { var b = unitById(d.best); return { id: d.id, text: (b && b.text) || d.gist }; });
    var ordered = threadOrder(items), secs = [], cur = null;
    ordered.forEach(function (it) {
      if (!cur || cur.t !== it.thread) { cur = { t: it.thread, ideas: [] }; secs.push(cur); }
      cur.ideas.push(it.id);
    });
    // small groups join the group they are closest to, until the article has a readable number of sections
    var textOf = {}; items.forEach(function (it) { textOf[it.id] = it.text; });
    var vecOf = function (s) { var v = {}; s.ideas.forEach(function (id) { var t = A().terms(textOf[id]); for (var w in t) v[w] = (v[w] || 0) + t[w]; }); return v; };
    var guard = 0;
    while (secs.length > 1 && guard++ < 500) {
      var small = secs.slice().sort(function (a, b) { return a.ideas.length - b.ideas.length; })[0];
      if (small.ideas.length >= 5 && secs.length <= 16) break;
      var sv = vecOf(small), best = null, bs = -1;
      secs.forEach(function (o) { if (o === small) return; var c = A().cosine(sv, vecOf(o)); if (c > bs) { bs = c; best = o; } });
      best.ideas = best.ideas.concat(small.ideas); secs.splice(secs.indexOf(small), 1);
    }
    return { title: "", sections: secs.map(function (s, k) {
      var t = {}; s.ideas.forEach(function (id) { var d = ideas.filter(function (x) { return x.id === id; })[0], b = unitById(d.best); var tm = A().terms(b ? b.text : d.gist); for (var w in tm) t[w] = (t[w] || 0) + tm[w]; });
      var top = [];
      Object.keys(t).filter(function (w) { return w.length > 1; }).sort(function (a, b) { return t[b] - t[a]; }).forEach(function (w) { if (top.length < 2 && !top.some(function (x) { return w.split("").some(function (ch) { return x.indexOf(ch) > -1; }); })) top.push(w); });
      return { title: "Group " + (k + 1) + (top.length ? " · " + top.join(" ") : ""), does: "", chain: "", ideas: s.ideas };
    }), gaps: [], outside: [] };
  }

  var FUSE_RULES = "For each idea below you get its versions (★ = the best one). Write ONE passage that contains every piece of information from all versions: every fact, name, date, number, quotation, source reference, and every distinct argument, image or nuance. Start from the ★ version and keep its sentences wherever possible; insert the details that appear only in other versions where they belong; join them smoothly. Remove only what is exactly repeated. Do not summarize, do not shorten, do not add anything that is not in the versions, do not change any claim. If versions contradict each other on a fact, keep the ★ version's and report the difference in \"conflicts\". Same language as the material (Chinese).\n" +
    "Answer JSON only: {\"i5\":{\"text\":\"…\",\"conflicts\":[\"…\"]},\"i9\":{…}}";
  function fuseBatches(ideas) {
    var out = [], cur = [], size = 0;
    ideas.forEach(function (d) { var n = d.units.reduce(function (s, id) { var u = unitById(id); return s + (u ? u.text.length : 0); }, 0); if (cur.length && (size + n > 10000 || cur.length >= 12)) { out.push(cur); cur = []; size = 0; } cur.push(d); size += n; });
    if (cur.length) out.push(cur);
    return out;
  }
  function uniqueLen(d) {   // the length of what the versions say, counting each sentence once
    var seen = {}, n = 0;
    d.units.forEach(function (id) { var u = unitById(id); if (!u) return; A().sentences(u.text).forEach(function (s) { var k = s.replace(/[\s，。,.、；;：:“”"'‘’（）()]/g, ""); if (k.length > 3 && !seen[k]) { seen[k] = 1; n += k.length; } }); });
    return n;
  }
  function fuse(ideas, job) {
    var todo = ideas.filter(function (d) { return d.units.length > 1 && !d.me && !d.fusedOk; });
    var batches = fuseBatches(todo);
    job.total = job.done + batches.length + 1;
    return batches.reduce(function (pr, batch, bi) {
      return pr.then(function () {
        if (job.stop) throw new Error("stopped");
        setJob(job, "Fusing the versions of each idea into one passage, keeping every detail… part " + (bi + 1) + " of " + batches.length);
        var prompt = context() + "\n" + FUSE_RULES + "\n\n" + batch.map(function (d) {
          return "[" + d.id + "]\n" + d.units.map(function (id) { var u = unitById(id); return u ? (id === d.best ? "★ " : "• ") + u.text : ""; }).filter(Boolean).join("\n");
        }).join("\n\n");
        var run = function (extra) { return stageGemini(prompt + (extra || ""), job).then(function (r) { return parseJSON(r.text) || {}; }); };
        return run().then(function (j) {
          // anything that came back much shorter than its versions is asked for again once
          var short = batch.filter(function (d) { var o = j[d.id], t = o && (o.text || (typeof o === "string" ? o : "")); return !t || t.replace(/\s/g, "").length < uniqueLen(d) * 0.75; });
          if (!short.length) return j;
          return run("\n\nIMPORTANT: an earlier answer lost details in " + short.map(function (d) { return d.id; }).join(", ") + ". Keep every sentence's information.").then(function (j2) {
            short.forEach(function (d) { var a = j[d.id], b = j2[d.id], ta = a && (a.text || a), tb = b && (b.text || b); if (tb && (!ta || String(tb).length > String(ta).length)) j[d.id] = b; });
            return j;
          }, function () { return j; });
        }).then(function (j) {
          batch.forEach(function (d) {
            var o = j[d.id]; if (!o) return;
            var t = typeof o === "string" ? o : o.text; if (!t || !String(t).trim()) return;
            var live = ideaById(d.id) || d; if (live.me) return;
            live.text = String(t).trim(); live.fused = true; live.fusedOk = true;
            live.conflicts = (o.conflicts || []).map(String).filter(Boolean);
          });
          job.done++; progress(); save();
        });
      });
    }, Promise.resolve());
  }

  /* the whole run; with a key every stage uses Gemini, without one the same map is made locally */
  function organize(opts) {
    opts = opts || {};
    var p = W.paper;
    if (W.job) return toast("Still organizing — wait for it to finish, or press Stop.");
    readDoc(); remember();
    var job = W.job = { total: 4, done: 0, stop: false, label: "Organizing…", run: Date.now() };
    W.note = null; progress();
    var useAI = !!aiKey(), oldMap = p.map;
    var step1 = useAI ? readCards(job) : Promise.resolve();
    step1.then(function () {
      return useAI ? groupIdeas(job) : groupIdeasLocal();
    }).then(function (ideas) {
      // ideas keep their id (and your edits) when they contain the same main unit as before
      var prev = (oldMap && oldMap.ideas) || [], seq = p.ideaSeq || 0, usedOld = {};
      ideas.forEach(function (d) {
        var old = prev.filter(function (o) { return !usedOld[o.id] && (o.units.indexOf(d.best) > -1 || d.units.indexOf(o.best) > -1); })[0];
        if (old) usedOld[old.id] = 1;
        d.id = old ? old.id : "i" + (++seq);
        if (old) {
          if (old.me) { d.me = true; d.text = old.text; d.newVersions = d.units.some(function (id) { return old.units.indexOf(id) < 0; }); }
          else if (old.fusedOk && old.units.length === d.units.length && old.units.every(function (id) { return d.units.indexOf(id) > -1; })) { d.text = old.text; d.fused = old.fused; d.fusedOk = true; d.conflicts = old.conflicts; }
          if (old.out) d.out = old.out;
        }
        if (!d.text) d.text = (unitById(d.best) || {}).text || d.gist;
      });
      p.ideaSeq = seq;
      // scraps on their own (an unfinished sentence with no other version) stay in the map, not in the draft
      ideas.forEach(function (d) { if (!d.out && !d.me && d.units.every(function (id) { return (unitById(id) || {}).kind === "fragment"; })) d.out = "fragment"; });
      job.done++; progress();
      var forOutline = ideas.filter(function (d) { return !d.out; });
      return (useAI ? outline(forOutline, job) : Promise.resolve(outlineLocal(forOutline))).then(function (o) { return { ideas: ideas, o: o }; });
    }).then(function (r) {
      var ideas = r.ideas, o = r.o, byId = {}, placed = {};
      ideas.forEach(function (d) { byId[d.id] = d; });
      var sections = (o.sections || []).map(function (s, k) {
        var ids = (s.ideas || []).filter(function (id) { return byId[id] && !placed[id]; });
        ids.forEach(function (id) { placed[id] = 1; });
        return { id: "sec" + k + "-" + Date.now().toString(36), title: String(s.title || "Section " + (k + 1)), does: String(s.does || ""), chain: String(s.chain || ""), ideas: ids };
      }).filter(function (s) { return s.ideas.length; });
      (o.outside || []).forEach(function (id) { if (byId[id] && !placed[id]) { placed[id] = 1; byId[id].out = byId[id].out || "outside"; } });
      // anything the outline forgot goes into the section closest to it
      ideas.forEach(function (d) {
        if (placed[d.id] || d.out) return;
        var dv = A().terms(d.text), best = sections.length - 1, bs = -1;
        sections.forEach(function (s, k) { var v = {}; s.ideas.slice(0, 30).forEach(function (id) { var t = A().terms(byId[id].text); for (var w in t) v[w] = (v[w] || 0) + t[w]; }); var c = A().cosine(dv, v); if (c > bs) { bs = c; best = k; } });
        if (best < 0) { sections.push({ id: "sec-x", title: "Other", does: "", chain: "", ideas: [] }); best = 0; }
        sections[best].ideas.push(d.id); placed[d.id] = 1;
      });
      p.map = { title: o.title || "", sections: sections, ideas: ideas, gaps: (o.gaps || []).filter(function (g) { return byId[g.idea]; }), at: Date.now(), ai: useAI };
      if (o.title && (!p.title || p.title === "Untitled")) p.title = String(o.title);
      job.done++; progress(); save();
      return useAI ? fuse(ideas, job) : null;
    }).then(function () {
      p.units.forEach(function (u) { delete u.fresh; });
      assemble(); job.done = job.total; save();
    }).catch(function (e) {
      if (e.message !== "stopped") { job.error = e.message; console.error(e); }
    }).then(function () {
      W.job = null;
      var m = p.map;
      if (job.error && !m) W.note = { warn: true, html: "Organizing stopped: " + esc(job.error) + ". Everything read so far is saved — press <b>Organize again</b> to continue." };
      else if (job.stop) W.note = { html: "Stopped. What was done is kept; <b>Organize again</b> continues from here." };
      else {
        var ideas = m.ideas.filter(function (d) { return !d.out; }), folded = m.ideas.reduce(function (n, d) { return n + d.units.length - 1; }, 0);
        var notes = mapUnits().filter(function (u) { return u.kind === "note"; }).length;
        W.note = { html: (job.error ? "<b>Done, with a problem in the last step</b> (" + esc(job.error) + ") — the map is ready; <b>Organize again</b> finishes it. " : "<b>Organized.</b> ") +
          fmtN(mapUnits().length) + " passages → " + fmtN(ideas.length) + " ideas in " + m.sections.length + " sections" +
          (folded ? "; " + fmtN(folded) + " versions folded into the idea they repeat" : "") +
          ((p.conflicts || []).length ? "; " + p.conflicts.length + " contradictions to check" : "") +
          (notes ? "; " + notes + " notes to yourself set aside" : "") +
          ". Nothing was deleted." + (m.ai ? "" : " (Without a Gemini key the grouping is by shared words only.)") };
        p.view = "map";
      }
      save(); if (W.step === 1) render();
    });
  }

  /* the rough draft, assembled from the map; paragraphs you edited stay exactly as you wrote them */
  function assemble() {
    var p = W.paper, m = p.map; if (!m) return;
    var old = {}; p.blocks.forEach(function (b) { if (b.idea) old[b.idea] = b; });
    var blocks = [];
    m.sections.forEach(function (s) {
      blocks.push({ id: "h-" + s.id, text: "## " + s.title, by: "ai", head: true, sec: s.id });
      s.ideas.forEach(function (id) {
        var d = ideaById(id); if (!d || d.out) return;
        var b = old[id];
        if (b && b.by === "me") { d.text = b.text; d.me = true; b.sec = s.id; blocks.push(b); return; }
        blocks.push({ id: b ? b.id : "b-" + id, text: d.text, by: d.me ? "me" : d.fused ? "ai" : "paste", idea: id, sec: s.id, made: Date.now() });
      });
    });
    p.blocks = blocks.concat(p.blocks.filter(isRef));
  }
  // after editing the draft: the map follows (your text becomes the idea's text; new paragraphs become ideas)
  function syncFromDraft() {
    var p = W.paper, m = p.map; if (!m) return;
    var sec = m.sections[0] && m.sections[0].id, seen = {};
    p.blocks.forEach(function (b) {
      if (isRef(b)) return;
      if (b.head) { var s0 = m.sections.filter(function (s) { return "h-" + s.id === b.id; })[0]; if (s0) { sec = s0.id; s0.title = b.text.replace(/^#+\s*/, ""); } return; }
      var d = b.idea && ideaById(b.idea);
      if (!d) {   // a paragraph you added
        d = { id: "i" + (++p.ideaSeq), units: [], best: null, gist: b.text.slice(0, 80), text: b.text, me: true };
        m.ideas.push(d); b.idea = d.id;
        var s1 = m.sections.filter(function (s) { return s.id === sec; })[0];
        if (s1) { var prevIdea = null; p.blocks.slice(0, p.blocks.indexOf(b)).forEach(function (x) { if (x.idea && x.sec === sec) prevIdea = x.idea; }); var at = prevIdea ? s1.ideas.indexOf(prevIdea) + 1 : 0; s1.ideas.splice(at, 0, d.id); }
      }
      b.sec = sec; seen[d.id] = 1;
      if (b.by === "me" && d.text !== b.text) { d.text = b.text; d.me = true; }
    });
    // ideas whose paragraph you deleted are kept in the map as "you deleted"
    m.ideas.forEach(function (d) { if (!d.out && !seen[d.id] && m.sections.some(function (s) { return s.ideas.indexOf(d.id) > -1; })) d.out = "deleted"; });
  }

  /* ---------- improving the draft with Gemini, on request, with a preview ---------- */
  var IMPROVE = {
    read: ["Make it read well", "Make this read as finished, fluent prose: well-built, connected sentences (no short choppy ones), dense with information. Keep every fact, example, quotation, image and nuance, and the author's best sentences and voice."],
    explain: ["Explain for readers", "Explain for intelligent readers without background: at the first mention of each person, place, institution, term, work or event, add a brief clear explanation woven into the sentence (who, what, when, why it matters). Say what each piece of evidence shows. Keep everything already there."],
    connect: ["Show the connections", "Make the connections explicit: how each paragraph follows from the one before and leads to the next — causes and consequences, how an experience shaped his fears, desires and character, the choices it led to, and what it became in the novel. Add real transitions and backward or forward references. Keep everything."],
    mechanism: ["Explain the mechanisms", "Do not let phenomena explain phenomena: for each phenomenon described, explain the mechanism behind it — the institutions, laws, religious rules, economic interests and social structures that produced it — and then how it bears on his life and on the novel. Keep everything."],
    evidence: ["Mark what is inferred", "Make the level of evidence visible: separate what documents show (naming the source) from what is inferred, and phrase inferences as inferences (e.g. 很可能 / 这只是推测), without weakening documented facts. Keep everything."],
    scene: ["Open with a scene", "Rewrite the opening of this part as a vivid scene grounded only in the documented details in the text, then turn it into the question the part answers. Keep everything else."]
  };
  function styleSamples() {
    var us = mapUnits().filter(function (u) { return u.kind === "text" && u.mat === 3; }).sort(function (a, b) { return b.text.length - a.text.length; });
    var out = "", n = 0; us.forEach(function (u) { if (n < 3500) { out += u.text + "\n"; n += u.text.length; } });
    return out;
  }
  function sectionOfCaret() {
    var sel = window.getSelection(), n = sel && sel.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement), pe = el && el.closest && el.closest(".wr-write p[data-id]");
    var blocks = W.paper.blocks, i = pe ? blocks.findIndex(function (b) { return b.id === pe.getAttribute("data-id"); }) : -1;
    for (; i >= 0; i--) if (blocks[i].head) return blocks[i].sec || blocks[i].id;
    return null;
  }
  function improve(kind, scope, custom) {
    var p = W.paper; readDoc(); syncFromDraft();
    var secs = p.blocks.filter(function (b) { return b.head; }).map(function (b) { return b.sec || b.id; });
    var target = scope === "all" ? secs : [scope || sectionOfCaret() || secs[0]].filter(Boolean);
    if (!target.length) { target = [null]; }
    var instr = kind === "custom" ? custom : IMPROVE[kind][1];
    if (!aiKey()) {
      var txt = target.map(function (s) { return p.blocks.filter(function (b) { return !isRef(b) && (s == null || b.sec === s); }).map(function (b) { return b.text; }).join("\n\n"); }).join("\n\n");
      return copyPrompt(context() + "\n" + instr + "\nKeep the paragraph structure; output only the rewritten text.\n\n" + txt, "Prompt copied. Paste Gemini's answer back with More → Paste an article from the Gemini website.");
    }
    var job = W.job = { total: target.length, done: 0, stop: false, label: "Gemini is improving the draft…" }; W.note = null; progress();
    var proposals = [];
    target.reduce(function (pr, sid, k) {
      return pr.then(function () {
        if (job.stop) return;
        var bs = p.blocks.filter(function (b) { return !isRef(b) && !b.head && (sid == null || b.sec === sid); }); if (!bs.length) return;
        var head = p.blocks.filter(function (b) { return b.head && (b.sec || b.id) === sid; })[0], s = p.map && p.map.sections.filter(function (x) { return x.id === sid; })[0];
        var before = p.blocks[p.blocks.indexOf(bs[0]) - 1]; while (before && before.head) before = p.blocks[p.blocks.indexOf(before) - 1];
        job.label = "Gemini is improving " + (head ? "“" + head.text.replace(/^#+\s*/, "") + "”" : "the draft") + (target.length > 1 ? " (" + (k + 1) + " of " + target.length + ")" : "") + "…"; progress();
        var samples = styleSamples();
        var prompt = context() + (samples ? "\nPassages from the author's own most finished writing — match this voice:\n\"\"\"\n" + samples + "\"\"\"\n" : "") +
          (s ? "\nThis part: " + s.title + (s.does ? " — " + s.does : "") + (s.chain ? "\nIts chain: " + s.chain : "") : "") +
          (before ? "\nThe text before it ends with: \"" + before.text.slice(-400) + "\"" : "") +
          "\n\nTask: " + instr + "\nRules that always apply: keep every fact, name, date, number, quotation and source; never add facts, quotations or sources; same language as the text; paragraphs stay the units of argument.\n" +
          "Answer JSON only: {\"paragraphs\":[\"…\",\"…\"]}\n\nText:\n\n" + bs.map(function (b) { return b.text; }).join("\n\n");
        return gemini(prompt, { json: true, max: 32768, job: job }).then(function (r) {
          var j = parseJSON(r.text), ps = j && (j.paragraphs || (Array.isArray(j) ? j : null));
          if (ps && ps.length) proposals.push({ sec: sid, title: head ? head.text.replace(/^#+\s*/, "") : "", old: bs, neu: ps.map(function (x) { return String(x.text || x).trim(); }).filter(Boolean) });
        }).catch(function (e) { job.error = e.message; }).then(function () { job.done++; progress(); });
      });
    }, Promise.resolve()).then(function () {
      W.job = null; progress();
      if (!proposals.length) { W.note = { warn: true, html: "Gemini didn't return a version" + (job.error ? ": " + esc(job.error) : "") + "." }; progress(); return; }
      showProposal(proposals, kind === "custom" ? "Your instruction" : IMPROVE[kind][0]);
    });
  }
  function showProposal(props, label) {
    var w = sheet(label + " — proposal", '<p class="j-hint">Left: now. Right: Gemini\'s version. Nothing changes until you choose.</p>' + props.map(function (pr, k) {
      return '<div class="wr-prop">' + (pr.title ? "<h4 class=\"wr-sub\">" + esc(pr.title) + "</h4>" : "") + '<div class="wr-prop-cols"><div>' + pr.old.map(function (b) { return "<p>" + esc(b.text) + "</p>"; }).join("") + '</div><div class="wr-prop-new">' + pr.neu.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div></div>" +
        '<p class="owner-tools"><label class="ed-check"><input type="checkbox" data-pk="' + k + '" checked> use this part</label></p></div>';
    }).join(""));
    w.querySelector(".ed-panel").classList.add("wide");
    $(".ed-actions", w).innerHTML = '<button type="button" class="pill" data-x="no">Keep mine</button><button type="button" class="pill solid" data-x="yes">Use the checked parts</button>';
    w.addEventListener("click", function (e) {
      var x = e.target.closest("[data-x]"); if (!x) return;
      if (x.getAttribute("data-x") === "no") return closeSheet();
      remember();
      var p = W.paper;
      props.forEach(function (pr, k) {
        var cb = w.querySelector('[data-pk="' + k + '"]'); if (cb && !cb.checked) return;
        var at = p.blocks.indexOf(pr.old[0]); if (at < 0) return;
        var src = pr.old.map(function (b) { return b.text; });
        var neu = pr.neu.map(function (t, i) { return { id: uid(), text: t, by: "ai", ai: t, sec: pr.sec, src: src, idea: (pr.old[i] || pr.old[pr.old.length - 1]).idea, made: Date.now() }; });
        // the ideas of this part now carry Gemini's text; extra paragraphs become new ideas in the map
        p.blocks = p.blocks.filter(function (b) { return pr.old.indexOf(b) < 0; });
        p.blocks.splice.apply(p.blocks, [at, 0].concat(neu));
        if (p.map) {
          var used = {};
          neu.forEach(function (b) { if (b.idea && !used[b.idea]) { used[b.idea] = 1; var d = ideaById(b.idea); if (d) { d.text = b.text; d.me = false; d.fused = true; } } else { b.idea = null; } });
          pr.old.forEach(function (b) { if (b.idea && !used[b.idea]) { var d = ideaById(b.idea); if (d) d.out = "merged"; } });
          syncFromDraft();
        }
      });
      save(); closeSheet(); p.view = "draft"; render(); W.note = { html: "Used. Purple dots mark Gemini's paragraphs — click one to compare with what was there." }; progress();
    });
  }

  /* without a key: one prompt with the same method, and the answer pasted back */
  function copyBuildPrompt() {
    var p = W.paper, us = mapUnits().length ? mapUnits().filter(function (u) { return u.kind !== "note"; }) : buildable().map(function (b) { return { text: b.text }; });
    var notes = mapUnits().filter(function (u) { return u.kind === "note"; });
    copyPrompt(context() + "\nBelow is the raw material of an article: several texts with repeated versions, sketches, notes and AI explanations mixed together. Turn it into ONE article the way a fine editor would:\n" +
      "1. Break everything into idea units and put together the versions of each idea; from each group keep the most mature wording and add every detail that appears only in other versions. Never summarize; keep every fact, date, quotation and source.\n" +
      "2. Find the chains of cause and effect (experience → effect on his character and choices → the novel) and keep each chain together, even when its pieces are scattered across the texts.\n" +
      "3. Order the chains for a reader: a vivid way in, a gradual reveal, mechanisms before phenomena, the thesis at the end.\n" +
      "4. Start each section with its heading on a line beginning with \"## \". Output only the article. If it is too long for one answer, stop at a section break and write [CONTINUE]; I will ask for the rest." +
      (notes.length ? "\n\nThe author's own notes — follow them:\n" + notes.slice(0, 40).map(function (u) { return "- " + u.text.slice(0, 500); }).join("\n") : "") +
      "\n\nMaterial:\n\n" + us.map(function (u) { return u.text; }).join("\n\n"),
      "Prompt copied with all your material. Paste it into Gemini, then bring the article back with More → Paste an article from the Gemini website.");
  }
  function buildable() { return W.paper.blocks.filter(function (b) { return !isRef(b) && !(b.head && b.by === "ai"); }); }
  function pasteArticle(txt) {
    var main = String(txt).split(/---\s*LEFT OUT\s*---/i)[0].replace(/\[CONTINUE\]/g, "");
    var ps = A().paragraphs(main); if (!ps.length) return;
    readDoc(); remember();
    var old = buildable(), vecs = old.map(function (b) { return A().terms(b.text); }), sec = -1;
    var blocks = ps.map(function (t) {
      if (isHead(t)) { sec++; return { id: uid(), text: "## " + t.replace(/^#+\s*/, ""), by: "ai", head: true, sec: "g" + sec, src: [] }; }
      var v = A().terms(t), sims = vecs.map(function (ov, i) { return [A().cosine(v, ov), i]; }).sort(function (a, b) { return b[0] - a[0]; });
      var src = [];
      sims.slice(0, 3).forEach(function (x) { if (x[0] >= 0.18) src.push(old[x[1]].text); });
      return { id: uid(), text: t, by: "ai", ai: t, sec: "g" + Math.max(0, sec), src: src };
    });
    W.paper.blocks = blocks.concat(W.paper.blocks.filter(isRef));
    W.paper.map = null; W.paper.view = "draft";
    save(); render(); toast("Gemini's article is in. Click a purple dot to compare a paragraph with your material.");
  }

  /* one or a few paragraphs rewritten again (from the compare drawer); never touches a paragraph you edited */
  function polish(ids) {
    var p = W.paper;
    var todo = p.blocks.filter(function (b) { return !isRef(b) && b.by !== "me" && ids.indexOf(b.id) > -1 && !isHead(b.text); });
    if (!todo.length) return;
    var job = W.job = { total: 1, done: 0, stop: false, label: "Gemini is rewriting…" };
    progress();
    var items = todo.map(function (b, k) {
      var vs = b.src && b.src.length > 1 ? b.src : null;
      return "[" + (k + 1) + "] " + (vs ? vs.map(function (v, vi) { return "(version " + (vi + 1) + ") " + v; }).join("\n") : b.text);
    }).join("\n\n");
    gemini(context() + "\n" + RULES + "\nAnswer JSON only: {\"1\": \"paragraph\", \"2\": \"…\"} with exactly these keys.\n\nItems:\n" + items, { json: true, job: job }).then(function (r) {
      var j = parseJSON(r.text) || {};
      todo.forEach(function (b, k) {
        var out = j[String(k + 1)]; if (!out || typeof out !== "string") return;
        if (b.by === "me") return;
        if (!b.src || !b.src.length) b.src = [b.text];
        b.text = out.trim(); b.by = "ai"; b.ai = b.text; b.fresh = false;
      });
      save(); refreshDoc();
    }).catch(function (e) { toast("Gemini didn't answer: " + e.message); }).then(function () { W.job = null; progress(); });
  }
  // what is happening now, or what just happened
  function progress() {
    var el = $(".wr-job"); if (!el) return;
    var j = W.job, n = W.note;
    el.hidden = !j && !n;
    el.classList.toggle("note", !j && !!n); el.classList.toggle("warn", !j && !!(n && n.warn));
    if (j) el.innerHTML = '<span class="wr-spin" aria-hidden="true"></span><span class="wr-job-bar"><span style="width:' + Math.round(j.done / Math.max(1, j.total) * 100) + '%"></span></span>' +
      '<span class="wr-job-label">' + esc(j.label || "Gemini is writing…") + "</span>" + '<button type="button" class="mini-btn" data-w="stop">Stop</button>';
    else if (n) el.innerHTML = '<span class="wr-job-label">' + n.html + "</span>" + (W.history.length && !n.noUndo ? '<button type="button" class="mini-btn" data-w="undo">Undo</button>' : "") + '<button type="button" class="mini-btn" data-w="close" aria-label="Close">×</button>';
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
    var steps = [[1, "Write"], [2, "Translate"], [3, "Sources & checks"], [4, "Format"]];
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
    $(".wr-back", el).addEventListener("click", function (e) { e.preventDefault(); flush(); saveNow(); W.ctx.setHash(""); });
    el.onclick = function (e) {
      var b = e.target.closest("[data-w]"); if (!b) return;
      var k = b.getAttribute("data-w");
      if (k === "step") { flush(); closePop(); if (!W.job) W.note = null; W.step = +b.getAttribute("data-v"); render(); }
      if (k === "settings") settings();
      if (k === "stop" && W.job) { W.job.stop = true; W.job.label = "Stopping after this part…"; progress(); }
      if (k === "close") { W.note = null; progress(); }
      if (k === "undo" && W.history.length) { W.note = null; undo(); }
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
        W.list = W.list.filter(function (x) { return x.id !== did; }); (W.removed = W.removed || []).push(did); saveList(); renderList(el);
      }
    };
  }

  /* ================= 1 · WRITE ================= */
  function root() { return (W.ctx && W.ctx.root) || "../"; }
  function loadJS(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("couldn't load " + src)); }; document.head.appendChild(s); }); }
  /* files: .txt .md .docx .pdf → text */
  function readFile(f) {
    var name = (f.name || "").toLowerCase();
    if (/\.(txt|md|markdown|text)$/.test(name) || /^text\//.test(f.type)) return f.text();
    if (/\.docx$/.test(name)) {
      return (window.JSZip ? Promise.resolve() : loadJS(root() + "assets/js/vendor/jszip.min.js")).then(function () { return window.JSZip.loadAsync(f); })
        .then(function (z) { return z.file("word/document.xml").async("string"); }).then(function (xml) {
          var d = new DOMParser().parseFromString(xml, "application/xml"), W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
          return Array.prototype.map.call(d.getElementsByTagNameNS(W_NS, "p"), function (p) {
            var t = "";
            Array.prototype.forEach.call(p.getElementsByTagNameNS(W_NS, "*"), function (n) { if (n.localName === "t") t += n.textContent; else if (n.localName === "tab") t += " "; else if (n.localName === "br") t += "\n"; });
            return t.trim();
          }).filter(Boolean).join("\n\n");
        });
    }
    if (/\.pdf$/.test(name) || f.type === "application/pdf") {
      var V = "3.11.174", base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/" + V + "/";
      return (window.pdfjsLib ? Promise.resolve() : loadJS(base + "pdf.min.js")).then(function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
        return f.arrayBuffer();
      }).then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; }).then(function (pdf) {
        var pages = [];
        for (var i = 1; i <= pdf.numPages; i++) pages.push(i);
        return pages.reduce(function (pr, i) {
          return pr.then(function (acc) {
            return pdf.getPage(i).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
              // lines from positions; a paragraph ends after a short line that closes a sentence, or a wide gap
              var lines = [], cur = null;
              tc.items.forEach(function (it) {
                var y = Math.round(it.transform[5]), x = it.transform[4];
                if (!cur || Math.abs(cur.y - y) > 2) { cur = { y: y, x: x, s: "", w: 0, h: Math.abs(it.transform[3]) || 10 }; lines.push(cur); }
                cur.s += it.str; cur.w = Math.max(cur.w, x + (it.width || 0) - cur.x);
              });
              var maxW = Math.max.apply(null, lines.map(function (l) { return l.w; }).concat([1]));
              var out = "", prev = null;
              lines.forEach(function (l) {
                var t = l.s.trim(); if (!t) return;
                if (/^\d{1,4}$/.test(t)) return;   // page numbers
                if (prev) {
                  var gap = prev.y - l.y, ends = /[。！？.!?”"』」:：]$/.test(prev.s.trim());
                  out += (gap > prev.h * 1.9 || (ends && prev.w < maxW * 0.85)) ? "\n\n" : (/[A-Za-zÀ-ÿ,;]$/.test(prev.s.trim()) ? " " : "");
                }
                out += t; prev = l;
              });
              return acc.concat(out);
            });
          });
        }, Promise.resolve([])).then(function (ps) { return ps.join("\n\n"); });
      });
    }
    return Promise.reject(new Error((f.name || "This file") + ": use .docx, .pdf, .txt or .md (save .doc and .pages as .docx)."));
  }
  function readFiles(files) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return Promise.resolve("");
    setStatus("Reading " + files.length + (files.length === 1 ? " file…" : " files…"));
    return files.reduce(function (pr, f) {
      return pr.then(function (acc) { return readFile(f).then(function (t) { return acc.concat(t); }, function (e) { toast(e.message); return acc; }); });
    }, Promise.resolve([])).then(function (ts) { setStatus(""); return ts.join("\n\n"); });
  }
  // new material, pasted or from files: it is added to everything you have, and everything is organized again as one text
  function take(raw, name) {
    var p = W.paper;
    if (!A().paragraphs(raw).length) return;
    readDoc(); syncFromDraft();
    // material that is already in the draft but not yet in the map (an article from before) joins first
    if (!(p.units || []).length && buildable().length) addMaterial(buildable().map(function (b) { return b.text; }).join("\n\n"), "The draft so far");
    var r = addMaterial(raw, name);
    save();
    W.note = { html: "Added " + fmtN(r.added) + " passages" + (r.same ? " (" + fmtN(r.same) + " already there, word for word)" : "") + ". Organizing everything together…", noUndo: true };
    progress();
    setTimeout(function () { organize(); }, 30);
  }
  // new text goes before a Works Cited list, never into it
  function joinMaterial(a, b) {
    if (!a) return b; if (!b) return a;
    var lines = a.split(/\n/), at = lines.findIndex(function (l) { return REF.test(l); });
    if (at < 0) return a + "\n\n" + b;
    return lines.slice(0, at).join("\n") + "\n\n" + b + "\n\n" + lines.slice(at).join("\n");
  }
  function wireDrop(el, after) {
    el.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (t) { return t === "Files"; })) { e.preventDefault(); el.classList.add("wr-drop"); } });
    el.addEventListener("dragleave", function () { el.classList.remove("wr-drop"); });
    el.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); el.classList.remove("wr-drop");
      var names = Array.prototype.map.call(e.dataTransfer.files, function (f) { return f.name; }).join(", ");
      readFiles(e.dataTransfer.files).then(function (t) { after(t, names); });
    });
  }
  var FILES = ".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  function keyCard() {
    return '<div class="wr-keycard"><p><b>Turn on Gemini.</b> Without it, passages are only grouped by shared words. With a free key, your texts are broken into ideas, versions are recognised and fused, and the chains of cause and effect are found.</p>' +
      '<ol><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with your Google account.</li><li>Click <b>Create API key</b> and copy it.</li><li>Paste it here:</li></ol>' +
      '<p class="wr-keyrow"><input class="ed-input" type="password" data-key placeholder="AIza…" autocomplete="off"><button type="button" class="pill solid" data-s="savekey">Turn on</button></p></div>';
  }
  function stepWrite(body) {
    var p = W.paper, m = p.map, view = m && p.view === "map" ? "map" : "draft";
    var left = p.aside.filter(function (a) { return a.why === "repeat" || a.why === "unrelated" || a.why === "unplaced" || a.why === "deleted"; });
    body.innerHTML =
      '<div class="wr-tools">' +
        (m ? '<span class="ed-tabs"><button type="button" class="chip' + (view === "map" ? " on" : "") + '" data-s="view" data-v="map">Map</button><button type="button" class="chip' + (view === "draft" ? " on" : "") + '" data-s="view" data-v="draft">Draft</button></span>' : "") +
        '<button type="button" class="pill" data-s="build">' + (m ? "Organize again" : "Organize") + "</button>" +
        (view === "draft" ? '<details class="wr-menu"><summary class="pill">Improve with Gemini</summary><div class="wr-menu-list">' +
          Object.keys(IMPROVE).map(function (k) { return '<button type="button" class="wr-mi" data-s="improve" data-v="' + k + '"><b>' + IMPROVE[k][0] + '</b><span>' + esc(IMPROVE[k][1].split(":")[0].split(".")[0]) + "</span></button>"; }).join("") +
          '<button type="button" class="wr-mi" data-s="improve" data-v="custom"><b>Your own instruction…</b></button>' +
          '<label class="wr-mi wr-scope"><input type="checkbox" data-scope> the whole article (otherwise: the section where your cursor is)</label></div></details>' : "") +
        '<button type="button" class="pill" data-s="copy">Copy all</button><button type="button" class="pill" data-s="docx">Download .docx</button>' +
        '<details class="wr-menu"><summary class="pill">More</summary><div class="wr-menu-list">' +
          '<label class="wr-mi">Add a file (.docx .pdf .txt)<input type="file" accept="' + FILES + '" multiple hidden></label>' +
          '<button type="button" class="wr-mi" data-s="prompt">Copy a prompt for the Gemini website</button><button type="button" class="wr-mi" data-s="paste">Paste an article from the Gemini website</button>' +
        "</div></details>" +
        (view === "draft" ? '<span class="wr-key"><i class="dot ai"></i> written by Gemini <i class="dot me"></i> changed by you</span>' : "") + "</div>" +
      (aiKey() ? "" : keyCard()) +
      (view === "map" ? mapHTML() :
        '<div class="wr-docwrap"><div class="wr-marks"></div><div class="wr-doc wr-write" contenteditable="true" spellcheck="true" data-ph="Paste or type here. Paste whole drafts — several texts, notes, versions, all mixed — or drop .docx / .pdf files: they are broken into ideas, repeats are fused and everything is arranged into one article."></div></div>' +
        (left.length ? '<details class="wr-left"><summary>Set aside earlier · ' + leftSummary(left) + '</summary>' + left.slice().reverse().slice(0, 200).map(function (a) {
          return '<div class="wr-lo"><span class="wr-why">' + ({ repeat: "repeat", unrelated: "not related", unplaced: "not placed", deleted: "you deleted" })[a.why] + "</span><p>" + esc(a.text.length > 400 ? a.text.slice(0, 400) + "…" : a.text) + '</p><button type="button" class="mini-btn" data-back="' + p.aside.indexOf(a) + '">Put back</button></div>';
        }).join("") + "</details>" : ""));
    var fileIn = $(".wr-menu input[type=file]", body);
    fileIn.addEventListener("change", function (e) { var names = Array.prototype.map.call(e.target.files, function (f) { return f.name; }).join(", "); $$(".wr-menu", body).forEach(function (d) { d.open = false; }); readFiles(e.target.files).then(function (t) { if (t) take(t, names); }); });
    wireDrop(body, function (t, names) { if (t) take(t, names); });
    body.onclick = function (e) {
      var b = e.target.closest("[data-s]"), mk = e.target.closest("[data-mark]"), back = e.target.closest("[data-back]"), mp = e.target.closest("[data-mp]");
      if (mk) return compare(mk.getAttribute("data-mark"));
      if (back) { putBack(+back.getAttribute("data-back")); return; }
      if (mp) return mapAction(mp, e);
      if (!b) return;
      var k = b.getAttribute("data-s");
      if (k !== "improve" || !b.closest(".wr-menu")) $$(".wr-menu", body).forEach(function (d) { d.open = false; });
      if (k === "view") { flush(); p.view = b.getAttribute("data-v"); save(); render(); }
      if (k === "savekey") {
        var v = ($("[data-key]", body).value || "").trim(); if (!v) return $("[data-key]", body).focus();
        b.disabled = true; b.textContent = "Checking…";
        W.ai = W.ai || {}; W.ai.gemini_key = v; W.skip = {};
        gemini("Reply with the single word OK.", { max: 20, temp: 0 }).then(function () {
          saveAI(); render();
          if ((p.units || []).length || buildable().length) { W.note = { html: "<b>Gemini is on.</b> Organizing what you have…", noUndo: true }; progress(); if (!(p.units || []).length) addMaterial(buildable().map(function (x) { return x.text; }).join("\n\n"), "The draft so far"); organize(); }
          else { W.note = { html: "<b>Gemini is on.</b> Paste your texts.", noUndo: true }; progress(); }
        }, function (er) { W.ai.gemini_key = ""; b.disabled = false; b.textContent = "Turn on"; toast("That key didn't work: " + er.message); });
      }
      if (k === "build") {
        if (W.job) return toast("Still working — or press Stop.");
        readDoc(); syncFromDraft();
        if (!(p.units || []).length) { if (!buildable().length) return toast("Paste your texts first."); addMaterial(buildable().map(function (x) { return x.text; }).join("\n\n"), "The draft so far"); }
        organize();
      }
      if (k === "improve") {
        var all = $("[data-scope]", body) && $("[data-scope]", body).checked, kind = b.getAttribute("data-v");
        var scope = all ? "all" : sectionOfCaret();
        $$(".wr-menu", body).forEach(function (d) { d.open = false; });
        if (kind === "custom") {
          var w = sheet("Your instruction to Gemini", '<p class="j-hint">' + (all ? "For the whole article, section by section." : "For the section where your cursor is.") + ' Gemini will still keep every fact, date, quotation and source. You see a preview before anything changes.</p><textarea class="ed-input" rows="5" data-in placeholder="e.g. 把这一节改成以1794年的沙龙场景开头，再解释freiratismo的制度原因"></textarea>');
          $(".ed-actions", w).innerHTML = '<button type="button" class="pill solid" data-go>Ask Gemini</button>';
          $("[data-go]", w).addEventListener("click", function () { var t = $("[data-in]", w).value.trim(); if (!t) return; closeSheet(); improve("custom", scope, t); });
          return;
        }
        improve(kind, scope);
      }
      if (k === "prompt") { readDoc(); copyBuildPrompt(); }
      if (k === "paste") {
        var w2 = sheet("Article from the Gemini website", '<p class="j-hint">Paste the whole article from Gemini. Each paragraph keeps a link to the passages it came from, for comparing.</p><textarea class="ed-input" rows="16" data-in></textarea>');
        $(".ed-actions", w2).innerHTML = '<button type="button" class="pill solid" data-go>Use this article</button>';
        $("[data-go]", w2).addEventListener("click", function () { var t = $("[data-in]", w2).value; closeSheet(); pasteArticle(t); });
      }
      if (k === "copy") { readDoc(); navigator.clipboard.writeText(cleanText()).then(function () { toast("Copied — plain paragraphs, nothing extra."); }); }
      if (k === "docx") { readDoc(); docx(false, "zh"); }
    };
    body.onchange = function (e) {
      var sel = e.target.closest && e.target.closest('[data-mp="move"]'); if (!sel || !sel.value) return;
      remember(); var id = sel.getAttribute("data-id"), from = secOf(id), to = W.paper.map.sections.filter(function (x) { return x.id === sel.value; })[0];
      from.ideas.splice(from.ideas.indexOf(id), 1); to.ideas.push(id); mapChanged();
    };
    if (view === "map") return;
    var doc = $(".wr-doc", body);
    fillDoc(doc);
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    var empty = function () { doc.classList.toggle("empty", !doc.textContent.trim()); };
    empty(); doc.addEventListener("input", empty);
    var timer;
    doc.addEventListener("input", function () { clearTimeout(timer); setStatus("Typing…"); timer = setTimeout(function () { readDoc(doc); syncFromDraft(); marks(); }, 600); });
    doc.addEventListener("paste", function (e) {
      var cd = e.clipboardData; if (!cd) return;
      if (cd.files && cd.files.length) { e.preventDefault(); var names = Array.prototype.map.call(cd.files, function (f) { return f.name; }).join(", "); readFiles(cd.files).then(function (t) { if (t) take(t, names); }); return; }
      var t = cd.getData("text/plain"); if (t == null) return;
      e.preventDefault();
      if (A().paragraphs(t).length > 2 || t.length > 600) return take(t);
      document.execCommand("insertText", false, t.replace(/\s*\n+\s*/g, " "));
    });
    window.onresize = marks;
    if (!p.blocks.length) setTimeout(function () { doc.focus(); }, 0);
    setTimeout(marks, 30);
  }

  /* ---------- the map: what the organizing found, and where you decide ---------- */
  var MATS = { 3: ["●", "mature"], 2: ["◐", "developing"], 1: ["○", "sketch"] };
  function mapHTML() {
    var p = W.paper, m = p.map, open = W.mapOpen || {};
    var out = m.ideas.filter(function (d) { return d.out; }), notes = mapUnits().filter(function (u) { return u.kind === "note" || u.kind === "heading"; });
    var srcCount = {}; (p.texts || []).forEach(function (s, i) { srcCount[s.id] = i + 1; });
    var card = function (d, sid) {
      var b = unitById(d.best) || {}, mat = MATS[b.mat || 2], vs = d.units.map(unitById).filter(Boolean);
      var srcs = {}; vs.forEach(function (u) { srcs[u.src] = 1; });
      var conf = (p.conflicts || []).filter(function (c) { return c.units.some(function (id) { return d.units.indexOf(id) > -1; }); }).length + ((d.conflicts || []).length);
      var gap = (m.gaps || []).filter(function (g) { return g.idea === d.id; });
      var isOpen = open[d.id];
      return '<div class="mp-card mat' + (b.mat || 2) + (isOpen ? " open" : "") + (d.me ? " mine" : "") + '" data-idea="' + d.id + '">' +
        '<button type="button" class="mp-ch" data-mp="toggle" data-id="' + d.id + '"><span class="mp-mat" title="' + mat[1] + '">' + mat[0] + "</span>" +
          (b.when ? '<span class="mp-when">' + esc(b.when) + "</span>" : "") + '<span class="mp-gist">' + esc(d.gist) + "</span>" +
          '<span class="mp-meta">' + (vs.length > 1 ? vs.length + " versions" : "") + (Object.keys(srcs).length > 1 ? " · " + Object.keys(srcs).length + " texts" : "") +
          (conf ? ' · <i class="mp-flag">contradiction</i>' : "") + (gap.length ? ' · <i class="mp-flag gap">gap</i>' : "") + (d.me ? " · yours" : "") + (d.newVersions ? ' · <i class="mp-flag">new material</i>' : "") + "</span></button>" +
        (isOpen ? '<div class="mp-body">' +
          '<p class="mp-text">' + esc(d.text) + "</p>" +
          (d.conflicts && d.conflicts.length ? '<p class="mp-warn">Versions disagree: ' + d.conflicts.map(esc).join("; ") + "</p>" : "") +
          gap.map(function (g) { return '<p class="mp-warn gap">Gap: ' + esc(g.note) + "</p>"; }).join("") +
          (vs.length > 1 || d.me ? '<h5 class="wr-sub">' + (vs.length > 1 ? "The versions it was made from" : "Your material") + "</h5>" + vs.map(function (u) {
            var um = MATS[u.mat || 2];
            return '<div class="mp-ver' + (u.id === d.best ? " best" : "") + '"><p class="mp-vh"><span title="' + um[1] + '">' + um[0] + " " + um[1] + "</span> · text " + (srcCount[u.src] || "?") + " <i>" + esc(srcName(u.src)) + "</i>" + (u.id === d.best ? " · ★ main" : ' <button type="button" class="mini-btn" data-mp="best" data-id="' + d.id + '" data-u="' + u.id + '">Use as main</button>') +
              (vs.length > 1 ? ' <button type="button" class="mini-btn" data-mp="detach" data-id="' + d.id + '" data-u="' + u.id + '">Not the same idea</button>' : "") + "</p><p>" + esc(u.text) + "</p></div>";
          }).join("") : "") +
          '<p class="owner-tools mp-acts"><button type="button" class="mini-btn" data-mp="up" data-id="' + d.id + '">↑</button><button type="button" class="mini-btn" data-mp="down" data-id="' + d.id + '">↓</button>' +
            '<select class="ed-input mp-move" data-mp="move" data-id="' + d.id + '"><option value="">Move to…</option>' + m.sections.map(function (s) { return '<option value="' + s.id + '"' + (s.id === sid ? " disabled" : "") + ">" + esc(s.title) + "</option>"; }).join("") + "</select>" +
            (d.newVersions && d.me ? '<button type="button" class="mini-btn" data-mp="refuse" data-id="' + d.id + '">Fuse the new material into my text</button>' : "") +
            '<button type="button" class="mini-btn" data-mp="out" data-id="' + d.id + '">Leave out of the draft</button></p></div>' : "") + "</div>";
    };
    var mats = { 3: 0, 2: 0, 1: 0 }; m.ideas.forEach(function (d) { if (!d.out) { var b = unitById(d.best) || {}; mats[b.mat || 2]++; } });
    return '<div class="mp">' +
      '<aside class="mp-side"><p class="mp-sum">' + fmtN(mapUnits().length) + " passages from " + (p.texts || []).length + " texts → <b>" + fmtN(m.ideas.length - out.length) + " ideas</b> in " + m.sections.length + " sections</p>" +
        '<p class="mp-legend"><span>● mature ' + mats[3] + "</span><span>◐ developing " + mats[2] + "</span><span>○ sketch " + mats[1] + "</span></p>" +
        '<ol class="mp-toc">' + m.sections.map(function (s) { return '<li><a href="#" data-mp="jump" data-id="' + s.id + '">' + esc(s.title) + "</a> <span>" + s.ideas.filter(function (id) { var d = ideaById(id); return d && !d.out; }).length + "</span></li>"; }).join("") + "</ol>" +
        '<p><button type="button" class="pill solid" data-s="view" data-v="draft">Read the draft →</button></p>' +
        ((p.conflicts || []).length ? '<details class="mp-list"><summary>Contradictions to check · ' + p.conflicts.length + "</summary>" + p.conflicts.map(function (c) {
          return '<div class="mp-li"><p>' + esc(c.note) + "</p>" + c.units.map(function (id) { var u = unitById(id); return u ? '<p class="mp-q">text ' + (srcCount[u.src] || "?") + ": " + esc(u.text.slice(0, 160)) + (u.text.length > 160 ? "…" : "") + "</p>" : ""; }).join("") + "</div>";
        }).join("") + "</details>" : "") +
        ((m.gaps || []).length ? '<details class="mp-list"><summary>Gaps · ' + m.gaps.length + "</summary>" + m.gaps.map(function (g) { var d = ideaById(g.idea); return '<div class="mp-li"><p>' + esc(g.note) + '</p><p class="mp-q"><a href="#" data-mp="find" data-id="' + g.idea + '">' + esc(d ? d.gist : "") + "</a></p></div>"; }).join("") + "</details>" : "") +
        (notes.length ? '<details class="mp-list"><summary>Your notes &amp; to-dos · ' + notes.length + '</summary><p class="j-hint">Instructions and comments you wrote to yourself or to an AI, and outline lines. They guide the organizing but are not put in the text.</p>' + notes.map(function (u) { return '<div class="mp-li"><p>' + esc(u.text.length > 500 ? u.text.slice(0, 500) + "…" : u.text) + '</p><p class="mp-q">text ' + (srcCount[u.src] || "?") + ' <button type="button" class="mini-btn" data-mp="notnote" data-u="' + u.id + '">This is content, not a note</button></p></div>'; }).join("") + "</details>" : "") +
        (out.length ? '<details class="mp-list"><summary>Not in the draft · ' + out.length + "</summary>" + out.map(function (d) {
          return '<div class="mp-li"><p class="mp-q">' + ({ fragment: "scrap", outside: "outside this article", deleted: "you deleted", merged: "merged by Gemini", user: "you left out" })[d.out] + "</p><p>" + esc(d.text.slice(0, 300)) + (d.text.length > 300 ? "…" : "") + '</p><p><button type="button" class="mini-btn" data-mp="in" data-id="' + d.id + '">Put in the draft</button></p></div>';
        }).join("") + "</details>" : "") +
        '<details class="mp-list"><summary>Texts · ' + (p.texts || []).length + "</summary>" + (p.texts || []).map(function (s, i) { return '<div class="mp-li"><p>' + (i + 1) + ". " + esc(s.name) + ' <span class="mp-q">' + fmtN(s.units || 0) + " passages · " + new Date(s.at).toLocaleDateString() + "</span></p></div>"; }).join("") + "</details>" +
      "</aside>" +
      '<div class="mp-main">' + m.sections.map(function (s, k) {
        return '<section class="mp-sec" id="mp-' + s.id + '"><div class="mp-sh"><h3><span>' + (k + 1) + "</span> " + esc(s.title) + '</h3><button type="button" class="mini-btn" data-mp="rename" data-id="' + s.id + '">Rename</button>' +
          (k > 0 ? '<button type="button" class="mini-btn" data-mp="secup" data-id="' + s.id + '">↑</button>' : "") + (k < m.sections.length - 1 ? '<button type="button" class="mini-btn" data-mp="secdown" data-id="' + s.id + '">↓</button>' : "") + "</div>" +
          (s.does ? '<p class="mp-does">' + esc(s.does) + "</p>" : "") + (s.chain ? '<p class="mp-chain">' + esc(s.chain) + "</p>" : "") +
          s.ideas.map(function (id) { var d = ideaById(id); return d && !d.out ? card(d, s.id) : ""; }).join("") + "</section>";
      }).join("") + "</div></div>";
  }
  function secOf(id) { return W.paper.map.sections.filter(function (s) { return s.ideas.indexOf(id) > -1; })[0]; }
  function closestSection(d) {
    var m = W.paper.map, dv = A().terms(d.text), best = m.sections[0], bs = -1;
    m.sections.forEach(function (s) { var v = {}; s.ideas.slice(0, 30).forEach(function (id) { var x = ideaById(id); if (x && !x.out) { var t = A().terms(x.text); for (var w in t) v[w] = (v[w] || 0) + t[w]; } }); var c = A().cosine(dv, v); if (c > bs) { bs = c; best = s; } });
    return best;
  }
  function mapChanged(keepOpen) { assemble(); save(); var y = window.scrollY; render(); window.scrollTo(0, y); }
  function mapAction(el, e) {
    var p = W.paper, m = p.map, k = el.getAttribute("data-mp"), id = el.getAttribute("data-id"), d = id && ideaById(id);
    if (k === "move" && e.type === "click") return;   // the select reacts on change
    if (k === "toggle") { W.mapOpen = W.mapOpen || {}; W.mapOpen[id] = !W.mapOpen[id]; var y = window.scrollY; render(); window.scrollTo(0, y); return; }
    if (k === "jump" || k === "find") { e.preventDefault(); var t = document.getElementById("mp-" + (k === "find" ? (secOf(id) || {}).id : id)); if (k === "find") { W.mapOpen = W.mapOpen || {}; W.mapOpen[id] = true; render(); t = document.querySelector('[data-idea="' + id + '"]'); } if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    remember();
    if (k === "up" || k === "down") { var s = secOf(id), i = s.ideas.indexOf(id), j = i + (k === "up" ? -1 : 1); while (j >= 0 && j < s.ideas.length && (ideaById(s.ideas[j]) || {}).out) j += k === "up" ? -1 : 1; if (j < 0 || j >= s.ideas.length) return; s.ideas.splice(i, 1); s.ideas.splice(j, 0, id); }
    if (k === "secup" || k === "secdown") { var si = m.sections.findIndex(function (x) { return x.id === id; }), sj = si + (k === "secup" ? -1 : 1); var sx = m.sections.splice(si, 1)[0]; m.sections.splice(sj, 0, sx); }
    if (k === "rename") { var s2 = m.sections.filter(function (x) { return x.id === id; })[0]; var nt = window.prompt("Section title", s2.title); if (!nt) return; s2.title = nt.trim(); }
    if (k === "out") { d.out = "user"; }
    if (k === "in") { delete d.out; if (!secOf(id)) closestSection(d).ideas.push(id); }
    if (k === "best") { d.best = el.getAttribute("data-u"); if (!d.me) { d.text = (unitById(d.best) || {}).text || d.text; d.fused = false; d.fusedOk = false; } W.note = { html: "Main version changed." + (aiKey() ? " Press <b>Organize again</b> to fuse the other versions into it." : ""), noUndo: true }; }
    if (k === "detach") {   // this version is a different idea: it becomes its own idea, next to this one
      var uid0 = el.getAttribute("data-u"); d.units = d.units.filter(function (x) { return x !== uid0; }); d.fusedOk = false;
      if (!d.me) { d.text = (unitById(d.best) || {}).text; d.fused = false; }
      var u0 = unitById(uid0), nd = { id: "i" + (++p.ideaSeq), units: [uid0], best: uid0, gist: u0.pt || u0.text.slice(0, 80), text: u0.text };
      m.ideas.push(nd); var s3 = secOf(id); s3.ideas.splice(s3.ideas.indexOf(id) + 1, 0, nd.id);
    }
    if (k === "notnote") { var u1 = unitById(el.getAttribute("data-u")); u1.kind = "text"; var nd2 = { id: "i" + (++p.ideaSeq), units: [u1.id], best: u1.id, gist: u1.pt || u1.text.slice(0, 80), text: u1.text }; m.ideas.push(nd2); closestSection(nd2).ideas.push(nd2.id); }
    if (k === "refuse") {
      if (!aiKey()) return toast("This needs Gemini.");
      var job = W.job = { total: 1, done: 0, stop: false, label: "Fusing the new material into your text…" }; progress();
      var vs = d.units.map(unitById).filter(Boolean);
      stageGemini(context() + "\n" + FUSE_RULES.replace("(★ = the best one)", "(★ = the author's own text — keep it word for word and only insert what is new)") + "\n\n[" + d.id + "]\n★ " + d.text + "\n" + vs.map(function (u) { return "• " + u.text; }).join("\n"), job).then(function (r) {
        var j = parseJSON(r.text) || {}, o = j[d.id]; if (o) { d.text = String(o.text || o).trim(); d.newVersions = false; d.me = false; d.fused = true; var b = p.blocks.filter(function (x) { return x.idea === d.id; })[0]; if (b) { b.by = "ai"; b.text = d.text; } }
      }).catch(function (er) { toast("Gemini didn't answer: " + er.message); }).then(function () { W.job = null; mapChanged(); });
      return;
    }
    mapChanged();
  }
  function leftSummary(left) {
    var n = {}; left.forEach(function (a) { n[a.why] = (n[a.why] || 0) + 1; });
    return [[n.repeat, "repeats"], [n.unrelated, "not related"], [n.unplaced, "not placed"], [n.deleted, "deleted by you"]].filter(function (x) { return x[0]; }).map(function (x) { return x[0] + " " + x[1]; }).join(" · ");
  }
  function putBack(i) {
    var p = W.paper, a = p.aside[i]; if (!a) return;
    readDoc(); remember();
    p.aside.splice(i, 1);
    p.deleted = p.deleted.filter(function (h) { return h !== hashText(a.text); });
    addText([a.text]);
    var nb = p.blocks.filter(function (b) { return b.text === a.text; })[0];
    if (nb) { nb.by = "me"; delete nb.fresh; }   // you chose it: Gemini keeps it as it is
    save(); render(); toast("Put back next to what it belongs with.");
  }
  function cleanText() { return W.paper.blocks.map(function (b) { return b.text.replace(/^#+\s*/, ""); }).join("\n\n"); }
  function remember() {
    var p = W.paper; if (!p) return;
    var snap = JSON.stringify({ blocks: p.blocks, aside: p.aside, deleted: p.deleted, plan: p.plan || null, map: p.map || null, units: p.units || [], texts: p.texts || [], conflicts: p.conflicts || [], unitSeq: p.unitSeq || 0, ideaSeq: p.ideaSeq || 0 });
    W.history.push(snap);
    while (W.history.length > (snap.length > 400000 ? 6 : 15)) W.history.shift();
  }
  function undo() {
    var s = JSON.parse(W.history.pop()), p = W.paper;
    if (Array.isArray(s)) p.blocks = s; else { p.blocks = s.blocks; p.aside = s.aside; p.deleted = s.deleted; p.plan = s.plan; if ("map" in s) { p.map = s.map; p.units = s.units; p.texts = s.texts; p.conflicts = s.conflicts; p.unitSeq = s.unitSeq; p.ideaSeq = s.ideaSeq; } }
    save(); render(); toast("Undone.");
  }
  // keep the page in step with the draft after Gemini changes it (your cursor stays where it was)
  function showDoc() {
    var doc = $(".wr-write"); if (!doc) return;
    var sel = window.getSelection(), activeId = null;
    if (document.activeElement === doc && sel.anchorNode) { var n = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement; var pe = n && n.closest && n.closest("p[data-id]"); activeId = pe && pe.getAttribute("data-id"); }
    var same = doc.children.length === W.paper.blocks.length && W.paper.blocks.every(function (b, i) { return doc.children[i].getAttribute("data-id") === b.id; });
    if (same) { refreshDoc(); return; }
    fillDoc(doc);
    if (activeId) { var el = doc.querySelector('p[data-id="' + activeId + '"]'); if (el) { var r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); } }
    var c = $(".wr-count"); if (c) c.textContent = fmtN(A().count(text()).total) + " 字 / words";
    marks();
  }
  // headings are shown without their "##"
  function shown(b) { return b.head || isHead(b.text) ? b.text.replace(/^#+\s*/, "") : b.text; }
  function fillDoc(doc) {
    var fr = W.fresh || {};
    doc.innerHTML = W.paper.blocks.map(function (b) { return '<p data-id="' + b.id + '"' + (b.head || isHead(b.text) ? ' class="head"' : isRef(b) ? ' class="ref"' : fr[b.id] ? ' class="new"' : "") + ">" + esc(shown(b)) + "</p>"; }).join("");
    W.fresh = {};
  }
  function readDoc(doc) {
    doc = doc || $(".wr-write"); if (!doc || !W.paper) return;
    var by = {}, seen = {}, out = [], dirty = false;
    W.paper.blocks.forEach(function (b) { by[b.id] = b; });
    // loose text typed straight into the page is put into a paragraph, keeping the cursor where it was
    Array.prototype.slice.call(doc.childNodes).forEach(function (n) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) return;
      var sel = window.getSelection(), inside = sel.anchorNode === n, off = sel.anchorOffset;
      var pe = document.createElement("p"); doc.insertBefore(pe, n); pe.appendChild(n);
      if (inside) { var r = document.createRange(); r.setStart(n, Math.min(off, n.length)); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    });
    Array.prototype.forEach.call(doc.childNodes, function (n) {
      var t = (n.nodeType === 3 ? n.nodeValue : (n.querySelector && n.querySelector("br,div,p") ? n.innerText : n.textContent) || "").replace(/\u00a0/g, " ");
      var lines = t.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
      lines.forEach(function (line, li) {
        var id = li === 0 && n.nodeType === 1 ? n.getAttribute("data-id") : null;
        if (!id || seen[id]) { id = uid(); if (li === 0 && n.nodeType === 1) n.setAttribute("data-id", id); }
        seen[id] = 1;
        var old = by[id];
        if (old) {
          if (shown(old) !== line) { dirty = true; old.text = old.head || isHead(old.text) ? (old.text.match(/^#+\s*/) || ["## "])[0] + line : line; old.by = "me"; }
          out.push(old);
        }
        else out.push({ id: id, text: line, by: "me", src: [] });
      });
    });
    // paragraphs you removed: remembered, so they don't come back, and kept aside in case
    W.paper.blocks.forEach(function (b) {
      if (seen[b.id]) return;
      W.paper.deleted.push(hashText(b.text));
      W.paper.aside.push({ text: b.text, at: Date.now(), why: "deleted" });
    });
    var changed = dirty || out.length !== W.paper.blocks.length || out.some(function (b, i) { return W.paper.blocks[i] !== b; });
    W.paper.blocks = out;
    if (changed && W.paper.worksCited) { var at = out.findIndex(function (b) { return REF.test(b.text); }); if (at > -1) W.paper.worksCited = out.slice(at + 1).map(function (b) { return b.text; }).join("\n"); }
    if (changed) save(); else setStatus(W.status === "Typing…" ? "✓ Saved" : W.status);
    var c = $(".wr-count"); if (c) c.textContent = fmtN(A().count(text()).total) + " 字 / words";
  }
  function flush() {
    if (!W.paper) return;
    if ($(".wr-write")) { readDoc(); syncFromDraft(); }
    if ($(".wr-check")) readCheck($(".wr-check"));
    if ($(".mla-page")) readFormat($(".mla-page"), fmtLang());
  }
  function docMap(doc) { var m = {}; Array.prototype.forEach.call(doc.children, function (el) { var id = el.getAttribute("data-id"); if (id) m[id] = el; }); return m; }
  function refreshDoc() {
    var doc = $(".wr-write"); if (!doc) return;
    // put Gemini's new text into paragraphs you are not typing in
    var active = document.activeElement === doc ? (window.getSelection().anchorNode || {}).parentElement : null, map = docMap(doc);
    W.paper.blocks.forEach(function (b, i) {
      var el = map[b.id];
      if (!el) {
        var np = document.createElement("p"); np.setAttribute("data-id", b.id); np.textContent = shown(b); if (b.head || isHead(b.text)) np.className = "head";
        var next = W.paper.blocks[i + 1] && map[W.paper.blocks[i + 1].id];
        if (i === 0) doc.insertBefore(np, doc.firstChild); else if (next) doc.insertBefore(np, next); else doc.appendChild(np);
        map[b.id] = np;
      } else if (el !== active && el.textContent.trim() !== shown(b)) el.textContent = shown(b);
    });
    marks();
  }
  function marks() {
    var doc = $(".wr-write"), box = $(".wr-marks"); if (!doc || !box) return;
    var map = docMap(doc), html = "";
    W.paper.blocks.forEach(function (b) {
      var el = map[b.id]; if (!el || b.head) return;
      var kind = b.by === "ai" ? "ai" : b.by === "me" ? "me" : "";
      var hasVersions = blockSources(b).length > 1;
      if (!kind && !hasVersions) return;
      html += '<button type="button" class="wr-mark' + (kind ? " " + kind : "") + (hasVersions ? " v" : "") + '" style="top:' + (el.offsetTop + 6) + 'px" data-mark="' + b.id + '" title="' +
        (kind === "ai" ? "Written by Gemini" : kind === "me" ? "Changed by you" : "Your wording") + (hasVersions ? " · other versions available" : "") + ' — click to compare"></button>';
    });
    box.innerHTML = html;
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
  function blockSources(b) {
    var d = b.idea && W.paper.map && ideaById(b.idea);
    if (d && d.units.length) { var vs = d.units.map(unitById).filter(Boolean); vs.sort(function (x, y) { return (x.id === d.best ? -1 : 0) - (y.id === d.best ? -1 : 0); }); var t = vs.map(function (u) { return u.text; }); (b.src || []).forEach(function (x) { if (t.indexOf(x) < 0) t.unshift(x); }); return t; }
    return b.src || [];
  }
  function compare(id) {
    readDoc();
    var b = W.paper.blocks.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    var srcs = blockSources(b), versions = srcs.filter(function (v) { return v !== b.text; });
    var al = sentenceAlign(b.text, versions);
    var who = b.by === "ai" ? (b.src && b.src.length > 1 ? "Gemini wrote this from " + b.src.length + " versions of yours." : "Gemini rewrote this from your wording.") : b.by === "me" ? "You changed this paragraph." : "Your own wording" + (versions.length ? ", with other versions you wrote." : ".");
    var html = '<p class="j-hint">' + esc(who) + (b.hook ? " It opens the article." : "") + "</p>" +
      (versions.length ? '<h4 class="wr-sub">What changed, compared with your original</h4><p class="wr-diff">' + diffHTML(versions[0], b.text) + "</p>" : "") +
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
      if (k === "orig") { b.text = versions[0]; b.by = "paste"; var dd = b.idea && ideaById(b.idea); if (dd) { dd.text = b.text; dd.me = false; dd.fused = false; } save(); closeSheet(); render(); return; }
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
      var grow = function () { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 2) + "px"; };
      ta.addEventListener("input", function () {
        var b = p.blocks.filter(function (x) { return x.id === ta.getAttribute("data-b"); })[0];
        var seg = segments(b.text), v = restoreQuotes(ta.value, seg.quotes);
        if (v !== ta.value) { var pos = ta.selectionStart + (v.length - ta.value.length); ta.value = v; ta.setSelectionRange(pos, pos); }
        p.english[b.id] = { en: ta.value, zh: b.text, by: "me" };
        grow(); clearTimeout(W.timers.tr); W.timers.tr = setTimeout(save, 700);
      });
    });
    // size all boxes at once (one layout, not one per box)
    setTimeout(function () {
      var tas = $$("textarea[data-b]", body);
      tas.forEach(function (ta) { ta.style.height = "auto"; });
      var hs = tas.map(function (ta) { return ta.scrollHeight; });
      tas.forEach(function (ta, i) { ta.style.height = (hs[i] + 2) + "px"; });
    }, 0);
    body.onclick = function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      var k = b.getAttribute("data-t");
      if (k === "copy") navigator.clipboard.writeText(englishText().replace(/^#+\s*/gm, "")).then(function () { toast("English copied."); });
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
    return p.blocks.map(function (b) { var en = (p.english[b.id] || {}).en || ""; return isRef(b) ? b.text : en && (b.head || isHead(b.text)) ? "## " + en.replace(/^#+\s*/, "") : en; }).filter(Boolean).join("\n\n");
  }

  /* ================= shared: a document you edit in place, with marks that are only on screen ================= */
  // *Title* in the text shows as italics; reading the page back turns italics into *Title* again
  function richHTML(t) { return esc(t).replace(/\*([^*\n]+)\*/g, "<i>$1</i>"); }
  function readRich(el) {
    var out = "";
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (/^(I|EM)$/.test(c.nodeName)) out += "*" + c.textContent + "*";
        else if (c.nodeName === "BR") out += " ";
        else walk(c);
      });
    })(el);
    return out.replace(/ /g, " ").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  }
  // wrap the given sentences in marks; the text itself is unchanged
  function markHTML(t, marks) {
    var spans = [];
    marks.forEach(function (m) {
      if (!m.s) return;
      var from = 0, at;
      while ((at = t.indexOf(m.s, from)) > -1) {
        var end = at + m.s.length;
        if (!spans.some(function (x) { return at < x.end && end > x.at; })) { spans.push({ at: at, end: end, m: m }); break; }
        from = at + 1;
      }
    });
    spans.sort(function (a, b) { return a.at - b.at; });
    var html = "", pos = 0;
    spans.forEach(function (x) {
      html += richHTML(t.slice(pos, x.at)) + '<mark class="ck ck-' + x.m.kind + '" data-ck="' + x.m.kind + '" data-h="' + esc(x.m.h) + '">' + richHTML(t.slice(x.at, x.end)) + "</mark>";
      pos = x.end;
    });
    return html + richHTML(t.slice(pos));
  }
  // a little box next to a mark, with what it means and what to do
  function pop(target, html) {
    closePop();
    var r = target.getBoundingClientRect(), d = document.createElement("div");
    d.className = "wr-pop"; d.innerHTML = html + '<button type="button" class="wr-pop-x" aria-label="Close">×</button>';
    document.body.appendChild(d);
    var top = window.scrollY + r.bottom + 8, left = Math.max(12, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - d.offsetWidth - 12));
    d.style.top = top + "px"; d.style.left = left + "px";
    setTimeout(function () { document.addEventListener("mousedown", outside); document.addEventListener("keydown", escKey); }, 0);
    d.querySelector(".wr-pop-x").onclick = closePop;
    return d;
  }
  function outside(e) { var d = $(".wr-pop"); if (d && !d.contains(e.target) && !e.target.closest("mark.ck")) closePop(); }
  function escKey(e) { if (e.key === "Escape") closePop(); }
  function closePop() { var d = $(".wr-pop"); if (d) d.remove(); document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escKey); }

  /* ================= 3 · SOURCES & CHECKS ================= */
  var AITELLS = ["值得注意的是", "总而言之", "综上所述", "总的来说", "不难看出", "由此可见", "在某种程度上", "具有重要意义", "丰富的内涵", "深刻地反映", "独特的视角", "不可忽视", "起到了重要作用", "发挥着重要作用", "毋庸置疑", "众所周知", "让我们", "无疑是", "可以说是", "彰显了", "深远的影响", "宝贵的", "这不仅", "更是", "不仅仅是", "旨在", "交相辉映", "引人深思",
    "delve", "tapestry", "intricate", "underscore", "pivotal", "multifaceted", "testament to", "in the realm of", "it is worth noting", "it is important to note", "navigate the", "serves as a", "a rich", "plays a crucial role", "in conclusion", "furthermore", "moreover", "nuanced", "shed light on", "landscape of"];
  function aiTell(s) {
    var low = s.toLowerCase(), hits = AITELLS.filter(function (w) { return low.indexOf(w) > -1; });
    var fill = A().fillerIn(s);
    hits = hits.concat(fill.filter(function (f) { return hits.indexOf(f) < 0; }));
    return hits.length >= 2 || (hits.length === 1 && A().count(s).total < 40) ? hits : null;
  }
  function checkLang() { var p = W.paper; return p.checkLang === "en" && hasEnglish() ? "en" : "zh"; }
  function hasEnglish() { var p = W.paper; return p.blocks.some(function (b) { return !isRef(b) && ((p.english[b.id] || {}).en || "").trim(); }); }
  function fmtLang() { var p = W.paper; return p.formatLang === "zh" || !hasEnglish() ? "zh" : "en"; }
  function checkText(b) { return checkLang() === "en" ? ((W.paper.english[b.id] || {}).en || "") : b.text; }
  function marksFor(t) {
    var p = W.paper, ck = p.checks, ig = ck.ignore || {}, out = [];
    var an = A().analyze(t).paragraphs[0];
    (an ? an.sentences : []).forEach(function (s) {
      var st = s.text.trim(), h = hashText(st); if (!st || ig[h]) return;
      if ((ck.match || {})[h]) out.push({ s: st, kind: "match", h: h });
      else if (s.needsCite || (A().years(st).length && /[A-ZÀ-Ý][a-zà-ÿ]{2,}/.test(st) && s.score >= 70 && !/\(\s*[A-ZÀ-Ý][^()]*\d+[^()]*\)/.test(st))) out.push({ s: st, kind: "cite", h: h });
      else if ((ck.ai || {})[h] || aiTell(st)) out.push({ s: st, kind: "ai", h: h });
    });
    // matches Gemini found that are not whole sentences
    Object.keys(ck.match || {}).forEach(function (h) { var m = ck.match[h]; if (!ig[h] && t.indexOf(m.sentence) > -1 && !out.some(function (x) { return x.h === h; })) out.push({ s: m.sentence, kind: "match", h: h }); });
    return out;
  }
  function stepSources(body) {
    var p = W.paper, lang = checkLang(), hasEn = hasEnglish();
    var bs = p.blocks.filter(function (b) { return !isRef(b) && (lang === "zh" || (p.english[b.id] || {}).en); });
    var counts = { cite: 0, match: 0, ai: 0 };
    var paras = bs.map(function (b) {
      var t = checkText(b), head = b.head || isHead(b.text);
      var ms = head ? [] : marksFor(t.replace(/^#+\s*/, ""));
      ms.forEach(function (m) { counts[m.kind]++; });
      return '<p data-id="' + b.id + '"' + (head ? ' class="head"' : "") + ">" + (head ? esc(t.replace(/^#+\s*/, "")) : markHTML(t, ms)) + "</p>";
    }).join("");
    body.innerHTML = '<div class="wr-tools">' +
        (hasEn ? '<span class="ed-tabs"><button type="button" class="chip' + (lang === "zh" ? " on" : "") + '" data-c="lang" data-v="zh">中文</button><button type="button" class="chip' + (lang === "en" ? " on" : "") + '" data-c="lang" data-v="en">English</button></span>' : "") +
        '<button type="button" class="pill" data-c="web">Compare with published texts</button>' +
        '<button type="button" class="pill" data-c="aicheck">Look for AI-sounding writing</button>' +
        '<span class="wr-key"><i class="ln cite"></i> needs a citation <i class="ln match"></i> close to a published text <i class="ln ai"></i> reads like AI</span></div>' +
      '<p class="wr-sum">' + [counts.cite + (counts.cite === 1 ? " sentence needs" : " sentences need") + " a citation", counts.match + " close to published texts" + (p.checks.matchAt ? "" : " (not checked yet)"), counts.ai + " read like AI"].join(" · ") +
        ". Click a marked passage for what to do. The marks are only on screen — copying gives plain text.</p>" +
      '<div class="wr-docwrap"><div class="wr-doc wr-check" contenteditable="true" spellcheck="true">' + paras + "</div></div>";
    var doc = $(".wr-doc", body), timer;
    doc.addEventListener("input", function () { clearTimeout(timer); setStatus("Typing…"); timer = setTimeout(function () { readCheck(doc); }, 600); });
    doc.addEventListener("focusout", function () {   // when you click away, edited paragraphs get their marks again
      clearTimeout(timer); readCheck(doc);
      Array.prototype.forEach.call(doc.children, function (el) { if (el.dataset.edited) remark(el); });
    });
    doc.addEventListener("paste", function (e) { var t = e.clipboardData && e.clipboardData.getData("text/plain"); if (t == null) return; e.preventDefault(); document.execCommand("insertText", false, t.replace(/\s*\n+\s*/g, " ")); });
    body.onclick = function (e) {
      var mk = e.target.closest("mark.ck"); if (mk) return markPop(mk);
      var b = e.target.closest("[data-c]"); if (!b) return;
      var k = b.getAttribute("data-c");
      if (k === "lang") { p.checkLang = b.getAttribute("data-v"); save(); render(); }
      if (k === "web") webCheck();
      if (k === "aicheck") aiCheck();
    };
  }
  function readCheck(doc) {
    var p = W.paper, lang = checkLang(), changed = false;
    Array.prototype.forEach.call(doc.children, function (el) {
      var b = p.blocks.filter(function (x) { return x.id === el.getAttribute("data-id"); })[0]; if (!b) return;
      var head = b.head || isHead(b.text), t = readRich(el);
      if (head) t = (b.text.match(/^#+\s*/) || ["## "])[0] + t;
      if (lang === "en") { var en = p.english[b.id] || {}; if ((en.en || "") !== t) { p.english[b.id] = { en: t, zh: b.text, by: "me" }; changed = true; el.dataset.edited = 1; } }
      else if (b.text !== t) { b.text = t; b.by = "me"; changed = true; el.dataset.edited = 1; }
    });
    if (changed) save(); else setStatus(W.status === "Typing…" ? "✓ Saved" : W.status);
  }
  function remark(el) {
    var b = W.paper.blocks.filter(function (x) { return x.id === el.getAttribute("data-id"); })[0]; if (!b || b.head) return;
    var t = checkText(b); el.innerHTML = markHTML(t, marksFor(t)); delete el.dataset.edited;
  }
  function searchLinks(s) {
    var p = W.paper, quote = (s.match(/[“"]([^”"]{8,})[”"]/) || [])[1];
    var q = encodeURIComponent((quote ? '"' + quote.slice(0, 140) + '"' : s.replace(/\([^)]*\)/g, "").slice(0, 220)) + (p.keywords ? " " + p.keywords.split(/[,，]/)[0] : ""));
    return '<p class="desk-tools"><a class="mini-btn" target="_blank" rel="noopener" href="https://www.google.com/search?udm=50&q=' + q + '">Google AI Mode ↗</a>' +
      '<a class="mini-btn" target="_blank" rel="noopener" href="https://scholar.google.com/scholar?q=' + q + '">Google Scholar ↗</a>' +
      '<a class="mini-btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + q + '+filetype%3Apdf">PDFs ↗</a></p>';
  }
  function markPop(mk) {
    var p = W.paper, kind = mk.getAttribute("data-ck"), h = mk.getAttribute("data-h"), s = mk.textContent, el = mk.closest("p[data-id]");
    var b = p.blocks.filter(function (x) { return x.id === el.getAttribute("data-id"); })[0];
    var html = "";
    if (kind === "cite") html = "<p><b>Needs a citation.</b> It quotes, attributes an idea or states a specific fact without a source.</p>" + searchLinks(s) +
      (aiKey() ? '<p><button type="button" class="pill" data-p="find">Find the source with Gemini</button></p>' : "") + '<div class="wr-pop-res"></div>';
    if (kind === "match") { var m = (p.checks.match || {})[h] || {}; html = "<p><b>Close to a published text.</b> " + esc(m.why || "") + "</p><ul>" + (m.items || []).map(function (x) { return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.source || x.url) + "</a>" + (x.why ? " — " + esc(x.why) : "") + "</li>"; }).join("") + "</ul>" +
      '<p class="j-hint">Quote it with a citation, or say it in your own words.</p>' + (aiKey() ? '<p><button type="button" class="pill" data-p="own">Say it in my own words</button></p>' : "") + searchLinks(s); }
    if (kind === "ai") { var a = (p.checks.ai || {})[h], tells = aiTell(s) || []; html = "<p><b>Reads like AI.</b> " + esc(a && a.why ? a.why : "Stock phrases readers and detectors notice: " + tells.join(", ")) + "</p>" +
      (a && a.rewrite ? '<p class="wr-pop-sug">' + esc(a.rewrite) + '</p><p><button type="button" class="pill" data-p="use">Use this</button></p>' : aiKey() ? '<p><button type="button" class="pill" data-p="own">Rewrite in my voice</button></p>' : "") +
      '<p class="j-hint">No tool can tell for sure whether a text was written by AI; this only marks the patterns people and detectors notice.</p>'; }
    html += '<p><button type="button" class="mini-btn" data-p="ignore">Ignore</button></p>';
    var d = pop(mk, html);
    var replaceSentence = function (nt) {
      remember();
      if (checkLang() === "en") { var en = p.english[b.id]; en.en = en.en.replace(s, nt); en.by = "ai"; }
      else { if (!b.src || !b.src.length) b.src = [b.text]; b.text = b.text.replace(s, nt); b.by = "ai"; b.ai = b.text; }
      save(); closePop(); remark(el);
    };
    d.onclick = function (e) {
      var x = e.target.closest("[data-p]"); if (!x) return;
      var k = x.getAttribute("data-p"), res = $(".wr-pop-res", d);
      if (k === "ignore") { (p.checks.ignore = p.checks.ignore || {})[h] = 1; save(); closePop(); remark(el); }
      if (k === "use") replaceSentence(((p.checks.ai || {})[h] || {}).rewrite || s);
      if (k === "own") {
        x.disabled = true; x.textContent = "Writing…";
        gemini(context() + "\nRewrite this sentence so it says exactly the same thing in the author's own natural voice — not close to any published wording, no stock phrases, no AI-sounding words. Same language. Keep facts, names, quotations and citations. Output only the sentence.\n\nParagraph (context):\n" + checkText(b) + "\n\nSentence:\n" + s)
          .then(function (r) { replaceSentence(r.text.trim().replace(/^["“]|["”]$/g, "")); }, function (er) { x.textContent = er.message; });
      }
      if (k === "find") {
        x.disabled = true; x.textContent = "Searching…";
        gemini(context() + "\nUsing Google Search, find who made this claim or wrote this quotation: the scholar, the work and, if possible, the page. Prefer a PDF of the work. If you cannot verify it, say so — never guess.\nAnswer with JSON only (no other text): {\"found\":true|false,\"note\":\"one or two sentences\",\"cite\":\"MLA 9 in-text citation like (Author page)\",\"entry\":\"MLA 9 Works Cited entry, *italics* for titles\",\"url\":\"…\"}\n\nSentence:\n" + s + "\n\nParagraph:\n" + checkText(b), { search: true, temp: 0.2 })
          .then(function (r) {
            var j = parseJSON(r.text) || { note: r.text };
            res.innerHTML = '<p>' + esc(j.note || "") + "</p>" + (j.url ? '<p><a href="' + esc(j.url) + '" target="_blank" rel="noopener">' + esc(j.url) + "</a></p>" : "") +
              (r.sources || []).slice(0, 4).map(function (w) { return '<p><a href="' + esc(w.uri) + '" target="_blank" rel="noopener">' + esc(w.title || w.uri) + "</a></p>"; }).join("") +
              (j.found && j.cite ? '<p><code>' + esc(j.cite) + "</code><br><code>" + esc(j.entry || "") + '</code></p><p><button type="button" class="pill solid" data-p="insert">Insert the citation</button></p>' : "");
            d._cite = j; x.remove();
          }, function (er) { res.innerHTML = '<p class="j-hint">Gemini didn\'t answer: ' + esc(er.message) + "</p>"; });
      }
      if (k === "insert" && d._cite) {
        var j = d._cite, withCite = s.replace(/([。．.!?！？”"]*)$/, " " + j.cite + "$1");
        if (j.entry) { var wc = worksCited(); if (!wc.some(function (x) { return wcKey(x) === wcKey(j.entry); })) { wc.push(j.entry); p.worksCited = sortWC(wc).join("\n"); syncRefs(); } }
        (p.checks.ignore = p.checks.ignore || {})[hashText(withCite.trim())] = 1;
        replaceSentence(withCite); toast("Citation added; the entry is in Works Cited (step 4).");
      }
    };
  }
  // compare every paragraph with what is published (Gemini searching Google)
  function webCheck() {
    if (!aiKey()) return toast("This needs your Gemini key (Write → Turn on automatic organizing).");
    var p = W.paper, bs = p.blocks.filter(function (b) { return !isRef(b) && !b.head && !isHead(b.text) && checkText(b).length > 30; });
    var batches = [], cur = [], size = 0;
    bs.forEach(function (b) { var t = checkText(b); if (cur.length && (size + t.length > 3500 || cur.length >= 5)) { batches.push(cur); cur = []; size = 0; } cur.push(b); size += t.length; });
    if (cur.length) batches.push(cur);
    var job = W.job = { total: batches.length, done: 0, stop: false, label: "Comparing with published texts (Gemini is searching Google)…" }; W.note = null; progress();
    p.checks.match = {}; var found = 0;
    batches.reduce(function (pr, batch, bi) {
      return pr.then(function () {
        if (job.stop) return;
        job.label = "Comparing with published texts… part " + (bi + 1) + " of " + batches.length; progress();
        var prompt = "Using Google Search, check whether any of these passages closely matches published writing: the same or nearly the same wording (also translated from another language), or a distinctive argument or formulation taken from a specific published source. Search for their most distinctive phrases. Report only matches you actually found in the search results, with the real URL; never invent sources. Ordinary facts and common phrases are not matches.\n" +
          "Answer with JSON only (no other text): [{\"p\":passage number,\"sentence\":\"the exact sentence from the passage, copied character for character\",\"source\":\"title and author\",\"url\":\"…\",\"why\":\"same wording / close paraphrase / same distinctive idea\"}] — or [] if nothing matches.\n\n" +
          batch.map(function (b, i) { return "[" + (i + 1) + "] " + checkText(b); }).join("\n\n");
        return gemini(prompt, { search: true, temp: 0.1, job: job }).then(function (r) {
          var arr = parseJSON(r.text); if (!Array.isArray(arr)) arr = [];
          arr.forEach(function (m) {
            var b = batch[+m.p - 1]; if (!b || !m.sentence || !m.url) return;
            var t = checkText(b); if (t.indexOf(m.sentence) < 0) return;
            var h = hashText(m.sentence.trim()), e = p.checks.match[h] = p.checks.match[h] || { sentence: m.sentence.trim(), why: m.why, items: [] };
            e.items.push({ source: m.source, url: m.url, why: m.why }); found++;
          });
        }).catch(function (e) { job.error = e.message; }).then(function () { job.done++; progress(); });
      });
    }, Promise.resolve()).then(function () {
      p.checks.matchAt = Date.now(); W.job = null; save();
      W.note = job.error ? { warn: true, html: "The comparison stopped part way: " + esc(job.error) } : { html: "<b>Compared with published texts:</b> " + (found ? found + " passages are close to something published — marked in orange." : "nothing close to a published text was found.") + " This uses Google Search through Gemini; it is not a full plagiarism database such as Turnitin.", noUndo: true };
      render();
    });
  }
  function aiCheck() {
    var p = W.paper;
    if (!aiKey()) { W.note = { html: "Sentences with stock phrases are already marked in purple. With your Gemini key, a closer reading also suggests rewrites in your voice.", noUndo: true }; progress(); return; }
    var bs = p.blocks.filter(function (b) { return !isRef(b) && !b.head && !isHead(b.text) && checkText(b).length > 30; });
    var batches = [], cur = [], size = 0;
    bs.forEach(function (b) { var t = checkText(b); if (cur.length && size + t.length > 6000) { batches.push(cur); cur = []; size = 0; } cur.push(b); size += t.length; });
    if (cur.length) batches.push(cur);
    var job = W.job = { total: batches.length, done: 0, stop: false, label: "Reading for AI-sounding writing…" }; W.note = null; progress();
    p.checks.ai = {}; var n = 0;
    batches.reduce(function (pr, batch) {
      return pr.then(function () {
        if (job.stop) return;
        return gemini(context() + "\nRead these paragraphs the way an experienced editor and an AI detector would. Mark sentences that read as machine-written: stock phrases, empty intensifiers, formulaic transitions, generic abstractions, rhythm that is too even, 'not only… but also' patterns, vague grand claims. Do not mark sentences that are specific and natural.\nAnswer JSON only: [{\"sentence\":\"exact sentence copied character for character\",\"why\":\"short reason\",\"rewrite\":\"the same meaning in the author's own natural voice, same language, keeping facts, quotations and citations\"}]\n\n" +
          batch.map(function (b) { return checkText(b); }).join("\n\n"), { json: true, temp: 0.3, job: job }).then(function (r) {
          var arr = parseJSON(r.text); if (!Array.isArray(arr)) arr = [];
          arr.forEach(function (a) { if (!a.sentence) return; p.checks.ai[hashText(a.sentence.trim())] = { why: a.why, rewrite: a.rewrite }; n++; });
        }).catch(function (e) { job.error = e.message; }).then(function () { job.done++; progress(); });
      });
    }, Promise.resolve()).then(function () {
      W.job = null; save();
      W.note = { html: "<b>Read for AI-sounding writing:</b> " + n + " sentences marked in purple, each with a rewrite in your voice. No tool can say for certain whether text was written by AI — this marks what readers and detectors notice.", noUndo: true };
      render();
    });
  }

  /* ================= 4 · FORMAT: the page as it will print ================= */
  function mlaDate() { var d = new Date(); return d.getDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()] + " " + d.getFullYear(); }
  function worksCited() {
    var p = W.paper, inText = [], at = p.blocks.findIndex(function (b) { return REF.test(b.text); });
    if (at > -1) inText = p.blocks.slice(at + 1).map(function (b) { return b.text; });
    var list = (p.worksCited || "").split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return list.length ? list : inText;
  }
  // the Works Cited list lives in one place: the end of the article and step 4 always show the same entries
  function syncRefs() {
    var p = W.paper, list = sortWC(worksCited()), old = p.blocks.filter(isRef), byText = {};
    old.forEach(function (b) { byText[b.text] = b; });
    var refs = list.length ? [byText["Works Cited"] || { id: uid(), text: "Works Cited", by: "paste", ref: true }].concat(list.map(function (t) { return byText[t] || { id: uid(), text: t, by: "paste", ref: true }; })) : [];
    refs.forEach(function (b) { b.ref = true; });
    p.blocks = p.blocks.filter(function (b) { return !isRef(b); }).concat(refs);
  }
  function wcKey(t) { return String(t).replace(/[*"“”]/g, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function sortWC(list) { return list.slice().sort(function (a, c) { return a.replace(/^[*"“]/, "").localeCompare(c.replace(/^[*"“]/, ""), "en", { sensitivity: "base" }); }); }
  function stepFormat(body) {
    var p = W.paper, m = p.mla, hasEn = hasEnglish();
    var lang = fmtLang();
    var bs = p.blocks.filter(function (b) { return !isRef(b) && (lang === "zh" || (p.english[b.id] || {}).en); });
    var tx = function (b) { return lang === "en" ? p.english[b.id].en : b.text; };
    var full = bs.map(tx).join("\n\n");
    var issues = A().mlaIssues(full + "\n\nWorks Cited\n" + worksCited().join("\n")).issues.filter(function (x) { return x.fix; });
    var ig = (p.checks.mlaIgnore = p.checks.mlaIgnore || {});
    issues = issues.filter(function (x) { return !ig[hashText(x.found)]; });
    var mk = function (t) { var ms = issues.filter(function (x) { return t.indexOf(x.found) > -1; }).map(function (x) { return { s: x.found, kind: "mla", h: hashText(x.found) }; }); return markHTML(t, ms); };
    var name = (m.name || "").trim(), title = lang === "en" ? (p.title_en || "") : p.title;
    var line = function (k, ph, v) { return '<div class="mla-line" contenteditable="true" data-m="' + k + '" data-ph="' + ph + '">' + esc(v || "") + "</div>"; };
    body.innerHTML = '<div class="wr-tools">' +
        '<span class="ed-tabs"><button type="button" class="chip' + (lang === "en" ? " on" : "") + '" data-f="lang" data-v="en"' + (hasEn ? "" : " disabled") + '>English</button><button type="button" class="chip' + (lang === "zh" ? " on" : "") + '" data-f="lang" data-v="zh">中文</button></span>' +
        '<button type="button" class="pill solid" data-f="docx">Download .docx</button><button type="button" class="pill" data-f="copy">Copy</button>' +
        '<details class="wr-menu"><summary class="pill">More</summary><div class="wr-menu-list">' +
          (aiKey() ? '<button type="button" class="wr-mi" data-f="ai">Ask Gemini to check the citations (MLA 9)</button>' : "") +
          '<button type="button" class="wr-mi" data-f="pt">Check Portuguese spelling (Portugal)</button><button type="button" class="wr-mi" data-f="ptbr">Check Portuguese spelling (Brazil)</button></div></details>' +
        (issues.length ? '<span class="wr-key">' + issues.length + " MLA " + (issues.length === 1 ? "slip" : "slips") + ' marked in yellow <button type="button" class="mini-btn" data-f="fixall">Fix all</button></span>' : '<span class="wr-key">MLA 9 · no slips found</span>') + "</div>" +
      '<div class="mla-page" lang="' + (lang === "en" ? "en" : "zh") + '">' +
        '<div class="mla-runhead">' + esc(name.split(/\s+/).pop() || "") + " 1</div>" +
        line("name", "Your name", m.name) + line("instructor", "Instructor", m.instructor) + line("course", "Course", m.course) + line("date", "Date", m.date || mlaDate()) +
        '<div class="mla-title" contenteditable="true" data-t data-ph="' + (lang === "en" ? "Title in English" : "标题") + '">' + esc(title || "") + "</div>" +
        '<div class="mla-body" contenteditable="true" spellcheck="true">' + bs.map(function (b) { var t = tx(b), head = b.head || isHead(b.text); return '<p data-id="' + b.id + '"' + (head ? ' class="head"' : "") + ">" + (head ? esc(t.replace(/^#+\s*/, "")) : mk(t)) + "</p>"; }).join("") + "</div>" +
        '<div class="mla-wc-title">Works Cited</div>' +
        '<div class="mla-wc" contenteditable="true" spellcheck="false" data-ph="Type one source per line; they are put in A–Z order for you.">' + sortWC(worksCited()).map(function (e) { return "<p>" + mk(e) + "</p>"; }).join("") + "</div>" +
      "</div>" +
      '<p class="j-hint">This is the page as it will print: Times New Roman 12, double spaced, 1-inch margins, your last name and the page number at the top right, the heading, a centred title, indented paragraphs, Works Cited on a new page with hanging indents. Type anywhere; *stars* or italics become italics.</p>';
    var page = $(".mla-page", body), t1;
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    page.addEventListener("input", function (e) {
      clearTimeout(t1); setStatus("Typing…");
      t1 = setTimeout(function () { readFormat(page, lang); }, 600);
    });
    page.addEventListener("focusout", function (e) {
      readFormat(page, lang);
      if (e.target.classList && e.target.classList.contains("mla-wc")) { var wc = $(".mla-wc", page); var sorted = sortWC(worksCited()); p.worksCited = sorted.join("\n"); syncRefs(); wc.innerHTML = sorted.map(function (x) { return "<p>" + richHTML(x) + "</p>"; }).join(""); save(); }
    });
    page.addEventListener("paste", function (e) { var t = e.clipboardData && e.clipboardData.getData("text/plain"); if (t == null) return; e.preventDefault(); document.execCommand("insertText", false, e.target.closest(".mla-wc") ? t : t.replace(/\s*\n+\s*/g, " ")); });
    body.onclick = function (e) {
      var mkd = e.target.closest("mark.ck-mla");
      if (mkd) {
        var x = issues.filter(function (i) { return hashText(i.found) === mkd.getAttribute("data-h"); })[0]; if (!x) return;
        var d = pop(mkd, "<p><b>MLA 9:</b> " + esc(x.why) + "</p><p><code>" + esc(x.found) + "</code> → <code>" + esc(x.fix) + '</code></p><p><button type="button" class="pill solid" data-x="fix">Fix</button> <button type="button" class="mini-btn" data-x="ig">Ignore</button></p>');
        d.onclick = function (ev) { var bt = ev.target.closest("[data-x]"); if (!bt) return; if (bt.getAttribute("data-x") === "fix") applyFixes([x], lang); else { ig[hashText(x.found)] = 1; save(); } closePop(); render(); };
        return;
      }
      var b = e.target.closest("[data-f]"); if (!b) return;
      var k = b.getAttribute("data-f"), menu = $(".wr-menu", body); if (menu) menu.open = false;
      readFormat(page, lang);
      if (k === "lang") { p.formatLang = b.getAttribute("data-v"); save(); render(); }
      if (k === "fixall") { applyFixes(issues, lang); render(); toast(issues.length + " fixed."); }
      if (k === "docx") docx(true, lang);
      if (k === "copy") navigator.clipboard.writeText(bs.map(tx).join("\n\n").replace(/^#+\s*/gm, "") + "\n\nWorks Cited\n\n" + sortWC(worksCited()).join("\n")).then(function () { toast("Copied."); });
      if (k === "pt" || k === "ptbr") { p.pt = k === "pt" ? "pt-PT" : "pt-BR"; save(); var w = sheet("Portuguese spelling", '<div class="wr-ptres"></div>'); portuguese($(".wr-ptres", w)); }
      if (k === "ai") {
        var w2 = sheet("Gemini · MLA 9", '<p class="j-hint">Checking…</p>');
        gemini("Check these in-text citations and this Works Cited list against MLA 9 (MLA Handbook, 9th edition). List each problem and its correction; then give the corrected Works Cited list after a line '---WORKS CITED---', one entry per line, *italics* for titles. Never invent missing information; mark it [missing].\n\nText:\n" + full + "\n\nWorks Cited:\n" + worksCited().join("\n"))
          .then(function (r) {
            var parts = r.text.split(/---WORKS CITED---/);
            $(".ed-body", w2).innerHTML = '<div class="wr-answer">' + esc(parts[0]).replace(/\n/g, "<br>") + "</div>";
            if (parts[1]) { var f = $(".ed-actions", w2); f.innerHTML = '<button type="button" class="pill solid" data-use>Use the corrected Works Cited</button>'; $("[data-use]", w2).addEventListener("click", function () { p.worksCited = sortWC(parts[1].split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean)).join("\n"); syncRefs(); save(); closeSheet(); render(); }); }
          }).catch(function (er) { $(".ed-body", w2).innerHTML = '<p class="j-hint">Gemini didn\'t answer: ' + esc(er.message) + "</p>"; });
      }
    };
  }
  function readFormat(page, lang) {
    var p = W.paper, changed = false;
    $$(".mla-line", page).forEach(function (el) { var k = el.getAttribute("data-m"), v = el.textContent.trim(); if ((p.mla[k] || "") !== v) { p.mla[k] = v; changed = true; } });
    var rh = $(".mla-runhead", page); if (rh) rh.textContent = ((p.mla.name || "").trim().split(/\s+/).pop() || "") + " 1";
    var tt = $(".mla-title", page), tv = tt.textContent.trim();
    if (lang === "en") { if ((p.title_en || "") !== tv) { p.title_en = tv; changed = true; } } else if (tv && p.title !== tv) { p.title = tv; changed = true; var ti = $(".wr-title"); if (ti) ti.value = tv; }
    $$(".mla-body p[data-id]", page).forEach(function (el) {
      var b = p.blocks.filter(function (x) { return x.id === el.getAttribute("data-id"); })[0]; if (!b) return;
      var head = b.head || isHead(b.text), t = readRich(el); if (head) t = (b.text.match(/^#+\s*/) || ["## "])[0] + t;
      if (lang === "en") { var en = p.english[b.id] || {}; if (en.en !== t) { p.english[b.id] = { en: t, zh: b.text, by: "me" }; changed = true; } }
      else if (b.text !== t) { b.text = t; b.by = "me"; changed = true; }
    });
    var wc = $$(".mla-wc p", page).map(readRich).filter(Boolean);
    if (!wc.length) { var raw = $(".mla-wc", page).innerText || ""; wc = raw.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
    if (wc.join("\n") !== (p.worksCited || worksCited().join("\n"))) { p.worksCited = wc.join("\n"); syncRefs(); changed = true; }
    if (changed) save(); else setStatus(W.status === "Typing…" ? "✓ Saved" : W.status);
  }
  function applyFixes(fixes, lang) {
    var p = W.paper; remember();
    p.blocks.forEach(function (bl) {
      fixes.forEach(function (x) {
        if (lang === "en") { var en = p.english[bl.id]; if (en && en.en && en.en.indexOf(x.found) > -1) en.en = en.en.split(x.found).join(x.fix); }
        else if (bl.text.indexOf(x.found) > -1) bl.text = bl.text.split(x.found).join(x.fix);
      });
    });
    p.worksCited = worksCited().map(function (l) { fixes.forEach(function (x) { if (l === x.found) l = x.fix; else if (l.indexOf(x.found) > -1) l = l.split(x.found).join(x.fix); }); return l; }).join("\n");
    syncRefs(); save();
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
      '<label class="ed-field"><span class="ed-label">About this article — what it argues, who the people are, the key terms and what is new. Gemini reads this before every step.</span><textarea class="ed-input" data-s="brief" rows="9">' + esc(p.brief || "") + "</textarea></label>" +
      '<label class="ed-field"><span class="ed-label">Thesis — the argument everything serves</span><textarea class="ed-input" data-s="thesis" rows="3">' + esc(p.thesis) + "</textarea></label>" +
      '<label class="ed-field"><span class="ed-label">Key names and terms</span><input class="ed-input" data-s="keywords" value="' + esc(p.keywords) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Who reads it, and what they already know</span><input class="ed-input" data-s="readers" value="' + esc(p.readers) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Writing you like — passages whose style Gemini should keep (even if the content is old)</span><textarea class="ed-input" data-s="samples" rows="7">' + esc(p.samples) + "</textarea></label>" +
      '<div class="ed-row2"><label class="ed-field"><span class="ed-label">Gemini key (free at aistudio.google.com; kept privately)</span><input class="ed-input" type="password" data-a="gemini_key" value="' + esc(ai.gemini_key || "") + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Gemini model</span><select class="ed-input" data-a="ai_model"><option value="pro"' + (pref() === "pro" ? " selected" : "") + '>Gemini Pro — best writing (falls back to Flash if your key can\'t use it)</option><option value="flash"' + (pref() !== "pro" ? " selected" : "") + ">Gemini Flash — faster</option></select></label></div>" +
      (p.aside.length ? '<h4 class="wr-sub">Kept aside (' + p.aside.length + ")</h4><p class=\"j-hint\">Paragraphs you deleted and earlier versions. Tap one to put it back into the draft.</p>" +
        p.aside.slice(-30).reverse().map(function (a, k) { return '<button type="button" class="wr-salt" data-back="' + (p.aside.length - 1 - k) + '">' + esc(a.text.slice(0, 140)) + (a.text.length > 140 ? "…" : "") + "</button>"; }).join("") : ""));
    w.addEventListener("input", function (e) {
      var s = e.target.getAttribute("data-s"), a = e.target.getAttribute("data-a");
      if (s) { p[s] = e.target.value; save(); }
      if (a) { W.ai[a] = e.target.value.trim(); W.skip = {}; W.notedPro = false; clearTimeout(W.timers.ai); W.timers.ai = setTimeout(saveAI, 700); }
    });
    w.addEventListener("change", function (e) { var a = e.target.getAttribute("data-a"); if (a) { W.ai[a] = e.target.value.trim(); W.skip = {}; W.notedPro = false; saveAI(); } });
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

  // leaving or hiding the page: everything is written down at once
  window.addEventListener("beforeunload", function () { if (W.paper) { flush(); W.paper.updated = Date.now(); saveNow(); try { localStorage.setItem("alyx-paper:" + W.paper.id, JSON.stringify(W.paper)); } catch (e) {} } });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && W.paper) { flush(); saveNow(); } });
  window.AlyxWriter = { mount: mount, _W: W, _arrange: arrange, _threadOrder: threadOrder, _segments: segments, _restore: restoreQuotes };
})();
