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
      W.shas = W.shas || {}; W.shas[id] = r && r.sha;
      if (local && (!cloud || (local.updated || 0) > (cloud.updated || 0))) { W.paper = upgrade(local); setStatus("Restored changes not yet saved"); save(); }
      else W.paper = upgrade(cloud || { id: id, title: "Untitled" });
      W.paper.id = id;
      render();
    }).catch(function (e) { console.error(e); W.paper = null; toast("Couldn't open this paper. Check your sign-in."); render(); });
  }
  function setStatus(t) { W.status = t; var el = $(".wr-status"); if (el) el.textContent = t; }
  // each article is saved on its own, so leaving one never cancels its save
  function save(now) {
    var p = W.paper; if (!p) return;
    p.updated = Date.now();
    try { localStorage.setItem("alyx-paper:" + p.id, JSON.stringify(p)); } catch (e) {}
    setStatus("Saving…");
    var id = p.id, key = "save:" + id;
    W.shas = W.shas || {}; W.chain = W.chain || {}; W.pending = W.pending || {};
    clearTimeout(W.timers[key]);
    var run = function () {
      clearTimeout(W.timers[key]); delete W.pending[id];
      var stamp0 = p.updated;
      W.chain[id] = (W.chain[id] || Promise.resolve()).then(function () {
        return priv().write("papers/" + id + ".json", p, W.shas[id]).then(function (sha) {
          W.shas[id] = sha;
          if (W.paper === p) setStatus("✓ Saved");
          if (p.updated === stamp0) { try { localStorage.removeItem("alyx-paper:" + id); } catch (e) {} }
          var entry = (W.list || []).filter(function (x) { return x.id === id; })[0], words = A().count(text(p.blocks)).total;
          if (!entry) { entry = { id: id }; (W.list = W.list || []).unshift(entry); }
          if (entry.title !== p.title || entry.words !== words || Date.now() - (entry.updated || 0) > 6e4) { entry.title = p.title; entry.words = words; entry.updated = Date.now(); saveList(); }
        }).catch(function (e) { console.error(e); if (W.paper === p) setStatus("Not saved yet — kept on this device"); });
      });
    };
    W.pending[id] = run;
    W.timers[key] = setTimeout(run, now ? 0 : 2000);
  }
  function saveNow() { Object.keys(W.pending || {}).forEach(function (id) { W.pending[id](); }); }
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

  /* ===== turning the whole draft into one article: a plan, then each section written ===== */
  var PLAN = "You are the editor turning a messy draft into ONE finished, readable article. Below are numbered fragments of it: notes, several versions of the same passage, passages written earlier with AI. Many repeat each other and they are in no useful order.\n\n" +
    "Design the article:\n" +
    "1. Find the threads. A thread is one chain of cause and effect in the life and work of the person (or people) at the centre: an experience, a place, an encounter, a relationship, a reading, a historical event → how it shaped their character, beliefs, taste or way of seeing → the choices it led to (the works they made, the films, the decisions). Group fragments by these hidden connections — causes, influences, consequences, butterfly effects — NOT by shared keywords and NOT by date. Keep each chain whole and in one place; never break a chain into pieces scattered through the article.\n" +
    "2. Inside a thread, follow the chain in the order a reader needs it (usually the order in time).\n" +
    "3. Order the threads for the reader: open with a concrete, vivid scene or image from the material that raises a question; reveal things gradually — do not give away the conclusion or every answer in the first section; let each section raise something the next one answers; build toward the thesis; close by drawing the threads together.\n" +
    "4. Fragments that say the same as another fragment: list them as repeats of the best-written one. Fragments that do not belong in this article at all: list them as unrelated.\n" +
    "5. Usually 4–9 sections. Headings short, in the language of the draft.\n" +
    "Every fragment number must appear exactly once: in one section's \"use\", in \"repeats\", or in \"unrelated\".\n\n" +
    "Answer JSON only:\n{\"title\":\"…\",\"sections\":[{\"title\":\"…\",\"logic\":\"one sentence: what this section does and why it comes here\",\"use\":[3,17,5]}],\"repeats\":[{\"n\":9,\"of\":3}],\"unrelated\":[12]}";
  var WRITE = "Write this section as finished prose of the article, in the language of the material:\n" +
    "- Clear paragraphs; each paragraph is one complete step of the argument (the point, its evidence, what it means), joined to the next by a real transition.\n" +
    "- Choose the best-written sentences and the most vivid details from the material and keep their wording where it is good; merge the versions; leave out points that repeat.\n" +
    "- Repair gaps in logic and odd jumps or gaps in time: make the order of events and the cause and effect explicit. If fragments contradict each other, keep the better-supported one.\n" +
    "- No short, choppy sentences: dense, well-built longer sentences in which every clause carries information. No padding, no clichés.\n" +
    "- Briefly explain names, terms, works and events a reader without background needs.\n" +
    "- Keep every fact, name, date, quotation (exact wording, original language) and citation. Never add facts, quotations or sources.\n" +
    "- Don't reveal what later sections will show; end so that the next section follows naturally.\n" +
    "- Fragments marked [YOURS] were written by the author herself: keep each word for word as its own paragraph, as {\"keep\": n}, where it fits.\n" +
    "Answer JSON only: {\"paragraphs\":[{\"text\":\"…\",\"from\":[3,5]},{\"keep\":7}]}  (\"from\" = the fragment numbers the paragraph uses)";
  function buildable() { return W.paper.blocks.filter(function (b) { return !isRef(b) && !(b.head && b.by === "ai"); }); }
  function fragList(frs, limit) {
    return frs.map(function (b, i) {
      var t = b.text.replace(/\s*\n+\s*/g, " "), more = (b.src || []).filter(function (v) { return v !== b.text; }).length;
      if (limit && t.length > limit) t = t.slice(0, limit) + "…";
      return "[" + (i + 1) + "]" + (b.by === "me" ? " [YOURS]" : "") + (more ? " (+" + more + " other versions)" : "") + " " + t;
    }).join("\n\n");
  }
  function build() {
    var p = W.paper, frs = buildable();
    if (!frs.length) return;
    if (!aiKey()) return copyBuildPrompt();
    readDoc();
    remember();
    var total = frs.reduce(function (n, b) { return n + b.text.length; }, 0), limit = total > 160000 ? Math.max(80, Math.floor(160000 / frs.length)) : 0;
    var job = W.job = { total: 1, done: 0, stop: false, label: "Reading everything and planning the article…" };
    progress();
    var waitNote = function (s) { job.label = "Gemini asked to wait " + s + " s (free plan limit)…"; progress(); };
    gemini(context() + "\n" + PLAN + "\n\nFragments:\n\n" + fragList(frs, limit), { json: true, max: 32768, temp: 0.4, job: job, onWait: waitNote }).then(function (r) {
      var plan = parseJSON(r.text);
      if (!plan || !Array.isArray(plan.sections) || !plan.sections.length) throw new Error("Gemini's plan couldn't be read" + (r.cut ? " (it was cut off — try Flash, or fewer pages at a time)" : "") + ".");
      applyPlan(plan, frs);
      job.total = plan.sections.length + 1; job.done = 1; progress();
      return plan.sections.reduce(function (pr, sec, k) {
        return pr.then(function () {
          if (job.stop) return;
          job.label = "Writing section " + (k + 1) + " of " + plan.sections.length + ": " + sec.title; progress();
          return writeSection(k, job, waitNote).catch(function (e) { job.error = e.message; }).then(function () { job.done++; progress(); });
        });
      }, Promise.resolve());
    }).catch(function (e) { job.error = e.message; console.error(e); }).then(function () {
      W.job = null; progress(); save();
      if (document.activeElement && document.activeElement.classList.contains("wr-doc")) showDoc(); else if (W.step === 1) render();
      toast(job.error ? "Gemini stopped: " + job.error : job.stop ? "Stopped. What was written is kept." : "Your article is ready. Purple dots: written by Gemini — click one to compare with your fragments.");
    });
  }
  function applyPlan(plan, frs) {
    readDoc();   // what you typed while Gemini was planning
    var p = W.paper, used = {}, out = [], n = frs.length;
    var extra = p.blocks.filter(function (b) { return frs.indexOf(b) < 0 && !isRef(b) && !(b.head && b.by === "ai"); });
    var num = function (x) { x = parseInt(x, 10); return x >= 1 && x <= n ? x : 0; };
    plan.sections.forEach(function (sec, k) {
      out.push({ id: uid(), text: "## " + String(sec.title || "").trim(), by: "ai", head: true, sec: k, src: [] });
      (sec.use || []).forEach(function (x) { x = num(x); if (!x || used[x]) return; used[x] = 1; var b = frs[x - 1]; b.sec = k; b.num = x; out.push(b); });
    });
    (plan.repeats || []).forEach(function (r) {
      var x = num(r && r.n), of = num(r && r.of); if (!x || used[x]) return;
      var b = frs[x - 1];
      if (b.by === "me") return;                        // yours stays, placed below
      used[x] = 1;
      var t = of && used[of] ? frs[of - 1] : null;
      if (t) t.src = (t.src && t.src.length ? t.src : [t.text]).concat(b.src && b.src.length ? b.src : [b.text]);
      else p.aside.push({ text: b.text, at: Date.now(), why: "repeat" });
    });
    (plan.unrelated || []).forEach(function (x) {
      x = num(x); if (!x || used[x]) return;
      var b = frs[x - 1]; if (b.by === "me") return;
      used[x] = 1; p.aside.push({ text: b.text, at: Date.now(), why: "unrelated" });
    });
    // anything the plan forgot: yours goes into the last section, the rest is kept aside, never lost
    frs.forEach(function (b, i) {
      if (used[i + 1]) return;
      if (b.by === "me") { b.sec = plan.sections.length - 1; out.push(b); } else p.aside.push({ text: b.text, at: Date.now(), why: "unplaced" });
    });
    extra.forEach(function (b) { b.sec = plan.sections.length - 1; out.push(b); });
    p.plan = { title: plan.title || "", sections: plan.sections.map(function (s) { return { title: s.title, logic: s.logic }; }), at: Date.now() };
    if (plan.title && (!p.title || p.title === "Untitled")) p.title = String(plan.title);
    p.blocks = out.concat(p.blocks.filter(isRef));
    save(); showDoc();
  }
  function secBlocks(k) { return W.paper.blocks.filter(function (b) { return b.sec === k && !b.head; }); }
  function writeSection(k, job, waitNote) {
    var p = W.paper, plan = p.plan, bs = secBlocks(k);
    if (!bs.length || bs.every(function (b) { return b.by === "me"; })) return Promise.resolve();
    var before = W.paper.blocks.filter(function (b) { return b.sec === k - 1 && !b.head; }).slice(-1)[0];
    var mine = bs.filter(function (b) { return b.by === "me"; }).map(function (b) { return b.id; });
    var item = function (b, i) {
      var vs = (b.src || []).filter(function (v) { return v !== b.text; });
      return "[" + (i + 1) + "]" + (b.by === "me" ? " [YOURS]" : "") + " " + b.text + vs.map(function (v) { return "\n   (another version) " + v; }).join("");
    };
    // a long section is written in parts, each continuing the one before
    var parts = [], cur = [], size = 0;
    bs.forEach(function (b, i) { var len = item(b, i).length; if (cur.length && size + len > 14000) { parts.push(cur); cur = []; size = 0; } cur.push(b); size += len; });
    if (cur.length) parts.push(cur);
    var out = [], kept = {};
    var planText = plan.sections.map(function (s, i) { return (i === k ? "→ " : "  ") + (i + 1) + ". " + s.title + " — " + (s.logic || ""); }).join("\n");
    var run = parts.reduce(function (pr, part, pi) {
      return pr.then(function () {
        if (job.stop) throw new Error("stopped");
        var last = out.length ? out[out.length - 1] : before;
        var prompt = context() + "\nThe article: " + (plan.title || W.paper.title) + "\nThe plan:\n" + planText +
          (last ? "\n\nThe text before ends with:\n\"" + last.text.slice(-600) + "\"" : "\n\nThis is the opening of the article: begin with the most vivid, concrete scene or image in the material.") +
          "\n\nWrite section " + (k + 1) + ": \"" + plan.sections[k].title + "\" — " + (plan.sections[k].logic || "") +
          (parts.length > 1 ? "\nThis section is long, so it is written in " + parts.length + " parts; this is part " + (pi + 1) + (pi ? ": continue straight on from the text before, without repeating it" : "") + "." : "") +
          "\n\n" + WRITE + "\n\nMaterial for this " + (parts.length > 1 ? "part" : "section") + ":\n\n" + part.map(item).join("\n\n");
        if (job.label && parts.length > 1) { job.label = job.label.replace(/ \(part \d+ of \d+\)$/, "") + " (part " + (pi + 1) + " of " + parts.length + ")"; progress(); }
        return gemini(prompt, { json: true, max: 32768, job: job, onWait: waitNote }).then(function (r) {
          var j = parseJSON(r.text), paras = j && (j.paragraphs || (Array.isArray(j) ? j : null));
          if (!paras || !paras.length) throw new Error("section " + (k + 1) + " came back empty" + (r.cut ? " (cut off)" : ""));
          paras.forEach(function (x) {
            if (x && x.keep != null) { var kb = part[+x.keep - 1]; if (kb && kb.by === "me" && !kept[kb.id]) { kept[kb.id] = 1; out.push(kb); } return; }
            var t = typeof x === "string" ? x : x && x.text; if (!t || !String(t).trim()) return;
            var from = ((x && x.from) || []).map(function (n) { return part[+n - 1]; }).filter(Boolean), src = [];
            from.forEach(function (b) { (b.src && b.src.length ? b.src : [b.text]).forEach(function (v) { if (src.indexOf(v) < 0) src.push(v); }); });
            out.push({ id: uid(), text: String(t).trim(), by: "ai", ai: String(t).trim(), sec: k, src: src });
          });
          part.forEach(function (b) { if (b.by === "me" && !kept[b.id]) { kept[b.id] = 1; out.push(b); } });   // yours is never dropped
        });
      });
    }, Promise.resolve());
    return run.then(function () {
      readDoc();
      var now = secBlocks(k);
      // you edited this section while Gemini was writing it: your version stays
      if (now.some(function (b) { return b.by === "me" && mine.indexOf(b.id) < 0; }) || now.length !== bs.length) return;
      // fragments Gemini didn't use are kept aside, so nothing is lost
      var usedTxt = {}; out.forEach(function (b) { (b.src || []).forEach(function (v) { usedTxt[v] = 1; }); usedTxt[b.text] = 1; });
      bs.forEach(function (b) { if (b.by !== "me" && !usedTxt[b.text]) W.paper.aside.push({ text: b.text, at: Date.now(), why: "version" }); });
      var all = W.paper.blocks, first = all.indexOf(now[0]);
      W.paper.blocks = all.filter(function (b) { return now.indexOf(b) < 0; });
      var head = W.paper.blocks.findIndex(function (b) { return b.head && b.sec === k; });
      var at = head > -1 ? head + 1 : Math.min(first, W.paper.blocks.length);
      W.paper.blocks.splice.apply(W.paper.blocks, [at, 0].concat(out));
      save(); showDoc();
    }, function (e) { if (e.message !== "stopped") throw e; });
  }
  /* without a key: the same instructions as one prompt, and the answer pasted back */
  function copyBuildPrompt() {
    var frs = buildable();
    copyPrompt(context() + "\n" + PLAN.replace(/Answer JSON only:[\s\S]*$/, "") + "\nThen write the whole article following that plan.\n" + WRITE.replace(/- Fragments marked[\s\S]*$/, "") +
      "- Fragments marked [YOURS] were written by the author herself: keep them word for word.\nStart each section with its heading on its own line beginning with \"## \". Output only the article; after it, a line \"---LEFT OUT---\" and the numbers of the fragments you left out as repeats or unrelated.\n\nFragments:\n\n" + fragList(frs),
      "Prompt copied with your whole draft. Paste it into Gemini, then bring the article back with “Paste Gemini's article”.");
  }
  function pasteArticle(txt) {
    var main = String(txt).split(/---\s*LEFT OUT\s*---/i)[0];
    var ps = A().paragraphs(main); if (!ps.length) return;
    readDoc(); remember();
    var old = buildable(), vecs = old.map(function (b) { return A().terms(b.text); }), hit = {}, sec = -1;
    var blocks = ps.map(function (t) {
      if (isHead(t)) { sec++; return { id: uid(), text: "## " + t.replace(/^#+\s*/, ""), by: "ai", head: true, sec: sec, src: [] }; }
      var v = A().terms(t), sims = vecs.map(function (ov, i) { return [A().cosine(v, ov), i]; }).sort(function (a, b) { return b[0] - a[0]; });
      var src = [];
      sims.slice(0, 3).forEach(function (x) { if (x[0] >= 0.18) { hit[x[1]] = 1; (old[x[1]].src && old[x[1]].src.length ? old[x[1]].src : [old[x[1]].text]).forEach(function (s) { if (src.indexOf(s) < 0) src.push(s); }); } });
      var same = sims[0] && sims[0][0] > 0.97 ? old[sims[0][1]] : null;
      if (same && same.by === "me") return same;
      return { id: uid(), text: t, by: "ai", ai: t, sec: Math.max(0, sec), src: src };
    });
    old.forEach(function (b, i) { if (!hit[i] && blocks.indexOf(b) < 0) W.paper.aside.push({ text: b.text, at: Date.now(), why: "unrelated" }); });
    W.paper.plan = { title: "", sections: blocks.filter(function (b) { return b.head; }).map(function (b) { return { title: b.text.replace(/^#+\s*/, ""), logic: "" }; }), at: Date.now() };
    W.paper.blocks = blocks.concat(W.paper.blocks.filter(isRef));
    save(); render(); toast("Gemini's article is in. What it left out is under “Left out”, with a way to put it back.");
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
  function progress() {
    var el = $(".wr-job"); if (!el) return;
    var j = W.job;
    el.hidden = !j;
    if (j) el.innerHTML = '<span class="wr-job-bar"><span style="width:' + Math.round(j.done / Math.max(1, j.total) * 100) + '%"></span></span>' +
      "<span>" + esc(j.label || "Gemini is writing…") + "</span>" + '<button type="button" class="mini-btn" data-w="stop">Stop</button>';
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
    $(".wr-back", el).addEventListener("click", function (e) { e.preventDefault(); flush(); saveNow(); W.ctx.setHash(""); });
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
  // new material (pasted or from files) → into the draft; with a key, the whole article is rebuilt
  function take(raw) {
    var ps = A().paragraphs(raw); if (!ps.length) return;
    var p = W.paper, first = !buildable().length;
    readDoc(); remember();
    setStatus("Sorting " + fmtN(ps.length) + " paragraphs…");
    setTimeout(function () {   // let the page show the status first
      try {
        if (first) {
          var r = arrange(ps);
          p.blocks = r.blocks.concat(p.blocks.filter(isRef));
          toast(fmtN(r.blocks.length) + " paragraphs, related ones grouped together" + (r.merged ? "; " + r.merged + " repeats merged" : "") + "." + (aiKey() ? " Gemini is now turning it into one article…" : ""));
        } else {
          toast(addText(ps) + (aiKey() ? " — Gemini is rebuilding the article with it…" : ""));
        }
        save(); render();
        if (aiKey()) build();
      } catch (e) { console.error(e); toast("Something went wrong while sorting: " + e.message); setStatus(""); }
    }, 30);
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
      readFiles(e.dataTransfer.files).then(after);
    });
  }
  function stepWrite(body) {
    var p = W.paper;
    if (!p.blocks.length) {
      body.innerHTML = '<div class="wr-start"><p class="wr-lead">Paste your draft, or add files — a few pages or a few hundred, notes and Gemini versions all mixed together.</p>' +
        '<p class="j-hint">' + (aiKey() ? "Repeats are merged and Gemini turns everything into one article: chains of cause and effect kept together, a vivid opening, the story revealed step by step, the best writing kept and the gaps repaired. What it leaves out (repeats, unrelated notes) is listed below the article, never lost." :
          "Repeats are merged and related paragraphs are grouped together. To have it written into one article, add a free Gemini key in Thesis & style — or copy a prompt for Gemini and paste its article back.") + "</p>" +
        '<textarea class="ed-input wr-paste" rows="14" placeholder="粘贴草稿 · Paste here"></textarea>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-s="go">Make it an article</button>' +
        '<label class="pill wr-file">Add files (.docx .pdf .txt)<input type="file" accept=".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden></label></p></div>';
      var ta = $(".wr-paste", body), started = false;
      var go = function (t) { if (started) return; t = t == null ? ta.value : t; if (!A().paragraphs(t).length) { ta.focus(); return; } started = true; take(t); };
      ta.addEventListener("paste", function (e) {
        var fs = e.clipboardData && e.clipboardData.files;
        if (fs && fs.length) { e.preventDefault(); readFiles(fs).then(function (t) { if (t) go(t); }); return; }
        setTimeout(function () { if (A().paragraphs(ta.value).length > 2) go(); }, 60);
      });
      $(".wr-file input", body).addEventListener("change", function (e) { readFiles(e.target.files).then(function (t) { if (t) go(joinMaterial(ta.value, t)); }); });
      wireDrop(body, function (t) { if (t) go(joinMaterial(ta.value, t)); });
      body.onclick = function (e) { if (e.target.closest("[data-s=go]")) go(); };
      ta.focus();
      return;
    }
    var left = p.aside.filter(function (a) { return a.why === "repeat" || a.why === "unrelated" || a.why === "unplaced" || a.why === "deleted"; });
    body.innerHTML =
      '<div class="wr-tools">' +
        '<button type="button" class="pill" data-s="more">Add text or files</button>' +
        (aiKey() ? '<button type="button" class="pill" data-s="build">Rebuild the article</button>'
          : '<button type="button" class="pill" data-s="prompt">Copy prompt for Gemini</button><button type="button" class="pill" data-s="paste">Paste Gemini\'s article</button>') +
        '<button type="button" class="pill" data-s="group">Group related paragraphs again</button>' +
        '<button type="button" class="pill" data-s="copy">Copy all</button>' +
        '<button type="button" class="pill" data-s="docx">Download .docx</button>' +
        (W.history.length ? '<button type="button" class="pill" data-s="undo">Undo</button>' : "") +
        '<span class="wr-key"><i class="dot ai"></i> written by Gemini <i class="dot me"></i> changed by you</span></div>' +
      '<div class="wr-more" hidden><textarea class="ed-input wr-paste" rows="8" placeholder="Paste more: new versions, notes, pages…"></textarea>' +
        '<p class="owner-tools"><button type="button" class="pill solid" data-s="add">Add to the article</button>' +
        '<label class="pill wr-file">Add files<input type="file" accept=".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple hidden></label></p></div>' +
      (p.plan && p.plan.sections && p.plan.sections.length ? '<details class="wr-plan"><summary>How the article is built</summary><ol>' + p.plan.sections.map(function (s) { return "<li><b>" + esc(s.title) + "</b>" + (s.logic ? " — " + esc(s.logic) : "") + "</li>"; }).join("") + "</ol></details>" : "") +
      '<div class="wr-docwrap"><div class="wr-marks"></div><div class="wr-doc" contenteditable="true" spellcheck="true"></div></div>' +
      (left.length ? '<details class="wr-left"><summary>Left out of the article · ' + leftSummary(left) + '</summary><p class="j-hint">Not in the text, so the article copies cleanly. Put any of them back and it goes next to what it belongs with.</p>' +
        left.slice().reverse().slice(0, 300).map(function (a) {
          return '<div class="wr-lo"><span class="wr-why">' + ({ repeat: "repeat", unrelated: "not related", unplaced: "not placed", deleted: "you deleted" })[a.why] + "</span><p>" + esc(a.text.length > 400 ? a.text.slice(0, 400) + "…" : a.text) + '</p><button type="button" class="mini-btn" data-back="' + p.aside.indexOf(a) + '">Put back</button></div>';
        }).join("") + "</details>" : "");
    var doc = $(".wr-doc", body);
    fillDoc(doc);
    var timer;
    doc.addEventListener("input", function () { clearTimeout(timer); setStatus("Typing…"); timer = setTimeout(function () { readDoc(doc); marks(); }, 700); });
    doc.addEventListener("paste", function (e) {
      var cd = e.clipboardData; if (!cd) return;
      if (cd.files && cd.files.length) { e.preventDefault(); readFiles(cd.files).then(function (t) { if (t) take(t); }); return; }
      var t = cd.getData("text/plain"); if (t == null) return;
      e.preventDefault();
      if (A().paragraphs(t).length > 2) return take(t);
      document.execCommand("insertText", false, t.replace(/\s*\n+\s*/g, " "));
    });
    $(".wr-more .wr-file input", body).addEventListener("change", function (e) { readFiles(e.target.files).then(function (t) { if (t) take(t); }); });
    wireDrop(body, function (t) { if (t) take(t); });
    window.onresize = marks;
    body.onclick = function (e) {
      var b = e.target.closest("[data-s]"), m = e.target.closest("[data-mark]"), back = e.target.closest("[data-back]");
      if (m) return compare(m.getAttribute("data-mark"));
      if (back) { putBack(+back.getAttribute("data-back")); return; }
      if (!b) return;
      var k = b.getAttribute("data-s");
      if (k === "more") { var box = $(".wr-more", body); box.hidden = !box.hidden; if (!box.hidden) $("textarea", box).focus(); }
      if (k === "add") { var v = $(".wr-more textarea", body).value; if (A().paragraphs(v).length) take(v); }
      if (k === "build") { if (W.job) return toast("Gemini is still working."); build(); }
      if (k === "prompt") { readDoc(doc); copyBuildPrompt(); }
      if (k === "paste") {
        var w = sheet("Gemini's article", '<p class="j-hint">Paste the whole article from Gemini. Each paragraph keeps a link to the fragments it came from, for comparing; anything Gemini left out goes to “Left out”.</p><textarea class="ed-input" rows="16" data-in></textarea>');
        $(".ed-actions", w).innerHTML = '<button type="button" class="pill solid" data-go>Use this article</button>';
        $("[data-go]", w).addEventListener("click", function () { var t = $("[data-in]", w).value; closeSheet(); pasteArticle(t); });
      }
      if (k === "group") { readDoc(doc); remember(); W.paper.blocks = regroup(); W.paper.plan = null; save(); render(); toast("Related paragraphs grouped together; repeats merged. Your wording is untouched."); }
      if (k === "copy") { readDoc(doc); navigator.clipboard.writeText(cleanText()).then(function () { toast("Copied — plain paragraphs, nothing extra."); }); }
      if (k === "docx") { readDoc(doc); docx(false, "zh"); }
      if (k === "undo" && W.history.length) { undo(); }
    };
    setTimeout(marks, 30);
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
    W.history.push(JSON.stringify({ blocks: p.blocks, aside: p.aside, deleted: p.deleted, plan: p.plan || null }));
    if (W.history.length > 15) W.history.shift();
  }
  function undo() {
    var s = JSON.parse(W.history.pop()), p = W.paper;
    if (Array.isArray(s)) p.blocks = s; else { p.blocks = s.blocks; p.aside = s.aside; p.deleted = s.deleted; p.plan = s.plan; }
    save(); render(); toast("Undone.");
  }
  // keep the page in step with the draft after Gemini changes it (your cursor stays where it was)
  function showDoc() {
    var doc = $(".wr-doc"); if (!doc) return;
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
    doc.innerHTML = W.paper.blocks.map(function (b) { return '<p data-id="' + b.id + '"' + (b.head || isHead(b.text) ? ' class="head"' : isRef(b) ? ' class="ref"' : "") + ">" + esc(shown(b)) + "</p>"; }).join("");
  }
  function readDoc(doc) {
    doc = doc || $(".wr-doc"); if (!doc || !W.paper) return;
    var by = {}, seen = {}, out = [], dirty = false;
    W.paper.blocks.forEach(function (b) { by[b.id] = b; });
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
    if (changed) save(); else setStatus(W.status === "Typing…" ? "✓ Saved" : W.status);
    var c = $(".wr-count"); if (c) c.textContent = fmtN(A().count(text()).total) + " 字 / words";
  }
  function flush() { if (W.step === 1 && $(".wr-doc")) readDoc(); }
  function docMap(doc) { var m = {}; Array.prototype.forEach.call(doc.children, function (el) { var id = el.getAttribute("data-id"); if (id) m[id] = el; }); return m; }
  function refreshDoc() {
    var doc = $(".wr-doc"); if (!doc) return;
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
    var doc = $(".wr-doc"), box = $(".wr-marks"); if (!doc || !box) return;
    var map = docMap(doc), html = "";
    W.paper.blocks.forEach(function (b) {
      var el = map[b.id]; if (!el || b.head) return;
      var kind = b.by === "ai" ? "ai" : b.by === "me" ? "me" : "";
      var hasVersions = b.src && b.src.length > 1;
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

  /* ================= 3 · SOURCES ================= */
  function stepSources(body) {
    var p = W.paper, items = [];
    p.blocks.forEach(function (b) {
      if (isRef(b) || b.head || isHead(b.text)) return;
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
      if (k === "copy") navigator.clipboard.writeText(full.replace(/^#+\s*/gm, "") + "\n\nWorks Cited\n\n" + worksCited().join("\n")).then(function () { toast("Copied."); });
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

  window.addEventListener("beforeunload", function () { if (W.paper) { flush(); try { localStorage.setItem("alyx-paper:" + W.paper.id, JSON.stringify(W.paper)); } catch (e) {} } });
  window.AlyxWriter = { mount: mount, _W: W, _arrange: arrange, _threadOrder: threadOrder, _segments: segments, _restore: restoreQuotes };
})();
