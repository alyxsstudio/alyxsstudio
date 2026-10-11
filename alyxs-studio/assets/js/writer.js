/* Alyx's Studio — Thesis: a private place to write an article chapter by chapter, like a serial.
   1 Write      the article is a row of chapters (one topic each). The page shows every chapter with its
                full text; click one to write in it. What you paste in is remembered (not shown),
                so ✦ Gemini writes it in: the chapter written again with the new material worked in,
                every fact kept; your version stays one click away.
   2 Translate  the chapters put together as one article, paragraph by paragraph with DeepL.
   3 Sources    the whole article: sentences that need a citation, published matches, AI-sounding writing.
   4 Format     the whole article as an MLA 9 page and a Word file.
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
    p.checks = p.checks || {}; p.sugg = p.sugg || {};
    // articles from before chapters: each heading starts a chapter; without headings, it is one chapter
    if (!p.blocks.some(function (b) { return b.chap; })) {
      p.blocks.forEach(function (b) { if (!isRef(b) && (b.head || isHead(b.text))) { b.chap = true; b.head = true; b.text = chapTitle(b) ? "## " + chapTitle(b) : ""; } });
    }
    normalize(p);
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
    var ws = W.writer && $(".ew-status", W.writer); if (ws) ws.textContent = t;
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
    var words = A().count(text(p.blocks.filter(function (b) { return !isRef(b); }))).total;
    var nch = chapters(p).length;
    if (entry.title !== p.title || entry.words !== words || entry.chapters !== nch || Date.now() - (entry.updated || 0) > 6e4) { entry.title = p.title; entry.words = words; entry.chapters = nch; entry.updated = Date.now(); saveList(); }
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

  /* ---------- the article: chapters, one after another ---------- */
  var REF = /^\s*#*\s*(works cited|参考文献|引用文献|bibliography)\s*$/i;
  function isRef(b) { return b.ref || REF.test(b.text); }
  function isHead(t) { return /^#/.test(t); }
  /* A chapter starts with a heading block marked "chap" (its title, which may be empty) and runs until the
     next chapter or the Works Cited list. The article is simply all chapters in order, so steps 2–4 read
     it as one text, and whatever you change there is changed in the chapter too. */
  function nowLocal() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
  function fmtDate(s) { if (!s) return ""; var d = new Date(s); return isNaN(d) ? String(s).slice(0, 10) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  function newHead(title, date) { return { id: "c" + uid().slice(1), text: title ? "## " + title : "", head: true, chap: true, by: "me", date: date || nowLocal() }; }
  function chapTitle(h) { return String((h && h.text) || "").replace(/^#+\s*/, "").trim(); }
  function setTitle(h, t) { t = String(t || "").trim(); h.text = t ? "## " + t : ""; }
  // every paragraph belongs to a chapter; the Works Cited list stays at the end
  function normalize(p) {
    var refAt = p.blocks.findIndex(function (b) { return REF.test(b.text); });
    var body = [], refs = [];
    p.blocks.forEach(function (b, i) { if (b.ref || (refAt > -1 && i >= refAt)) { b.ref = true; refs.push(b); } else body.push(b); });
    if (body.length && !body[0].chap) body.unshift(newHead(""));
    p.blocks = body.concat(refs);
  }
  function chapters(p) {
    p = p || W.paper; var out = [], cur = null;
    p.blocks.forEach(function (b) {
      if (isRef(b)) { cur = null; return; }
      if (b.chap) { cur = { id: b.id, head: b, blocks: [] }; out.push(cur); return; }
      if (cur) cur.blocks.push(b);
    });
    return out;
  }
  function chapterById(id) { return chapters().filter(function (c) { return c.id === id; })[0] || null; }
  function chapName(c, i) { return chapTitle(c.head) || cut1(c.blocks.map(function (b) { return b.text; }).join(" "), 22) || "Untitled"; }
  function cut1(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; }
  // in steps 2–4 a chapter without a title just flows on; titles can also be left out of the article altogether
  function skip(b) { return !!b.chap && (!chapTitle(b) || W.paper.chapTitles === "hide"); }
  function putChapter(id, blocks) {
    var p = W.paper, start = p.blocks.findIndex(function (b) { return b.id === id; }); if (start < 0) return;
    var end = start + 1; while (end < p.blocks.length && !p.blocks[end].chap && !isRef(p.blocks[end])) end++;
    p.blocks.splice.apply(p.blocks, [start + 1, end - start - 1].concat(blocks));
  }
  function addChapter(title, texts, opts) {
    opts = opts || {};
    var p = W.paper, h = newHead(title, opts.date);
    var bs = (texts || []).map(function (t) { var b = { id: uid(), text: t, by: "paste", src: [] }; if (opts.isNew) b.added = Date.now(); return b; });
    var at = p.blocks.findIndex(isRef); if (at < 0) at = p.blocks.length;
    if (opts.first) { var c0 = chapters()[0]; if (c0) at = p.blocks.indexOf(c0.head); }
    if (opts.after) { var c = chapterById(opts.after); if (c) at = p.blocks.indexOf(c.blocks.length ? c.blocks[c.blocks.length - 1] : c.head) + 1; }
    p.blocks.splice.apply(p.blocks, [at, 0, h].concat(bs));
    return h;
  }
  function moveChapter(id, dir) {
    var cs = chapters(), i = cs.findIndex(function (c) { return c.id === id; }), j = i + dir;
    if (i < 0 || j < 0 || j >= cs.length) return;
    var segs = cs.map(function (c) { return [c.head].concat(c.blocks); }), t = segs[i];
    segs[i] = segs[j]; segs[j] = t;
    W.paper.blocks = [].concat.apply([], segs).concat(W.paper.blocks.filter(isRef));
  }
  function removeChapter(id) {
    var c = chapterById(id); if (!c) return;
    var p = W.paper, gone = [c.head].concat(c.blocks);
    if (c.blocks.length) p.aside.push({ text: c.blocks.map(function (b) { return b.text; }).join("\n\n"), title: chapTitle(c.head), at: Date.now(), why: "chapter" });
    p.blocks = p.blocks.filter(function (b) { return gone.indexOf(b) < 0; });
    if (p.sugg) delete p.sugg[id];
  }
  // pasted text → paragraphs. Blank lines always separate paragraphs; a run of short lines (a poem, a list)
  // stays together as one passage with its line breaks; long lines (Word, Google Docs) are paragraphs each.
  function splitPasted(t) {
    var out = [];
    String(t || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).forEach(function (chunk) {
      var lines = chunk.split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).filter(function (l) { return l.trim(); });
      var group = [];
      var flushG = function () { if (group.length) out.push(group.join("\n").trim()); group = []; };
      lines.forEach(function (l) {
        if (A().count(l).total >= 40 || l.length >= 80) { flushG(); out.push(l.trim()); }
        else group.push(l.trim());
      });
      flushG();
    });
    return out.filter(Boolean);
  }
  // text as it was written in Novel → paragraphs exactly as there (single line breaks stay inside the paragraph)
  function splitMarkdown(t) {
    return String(t || "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/).map(function (x) { return x.split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).join("\n").trim(); }).filter(Boolean);
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
    if (W.list == null) { ctx.el.innerHTML = '<p class="empty">Opening…</p>'; loadList().then(loadAI).then(function () { return moveFromNovel(); }).then(function () { mount(ctx); }); return; }
    if (id && (!W.paper || W.paper.id !== id)) return openPaper(id);
    if (!id) { closeWriter(true); W.paper = null; }
    render();
  }
  function render() {
    var el = W.ctx && W.ctx.el; if (!el) return;
    if (!W.paper) return renderList(el);
    if (W.writer && W.writer._ch && !chapterById(W.writer._ch)) closeWriter(true);
    var p = W.paper, c = A().count(text(p.blocks.filter(function (b) { return !isRef(b); })));
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
      (W.movedNote ? '<p class="wr-moved">' + esc(W.movedNote) + "</p>" : "") +
      missingMoved().map(function (m) { return '<p class="wr-moved">“' + esc(m.title) + '” from Novel isn\'t here yet' + (W.moveErr ? " (" + esc(W.moveErr) + ")" : "") + '. <button type="button" class="pill solid" data-l="move">Bring “' + esc(m.title) + '” here</button></p>'; }).join("") +
      '<p class="owner-tools"><button type="button" class="pill solid" data-l="new">+ New article</button></p>' +
      (list.length ? '<ul class="wr-list">' + list.map(function (x) {
        return '<li><a href="#p=' + esc(x.id) + '"><span class="wr-l-title">' + esc(x.title || "Untitled") + '</span><span class="wr-l-meta">' + (x.chapters ? x.chapters + (x.chapters === 1 ? " chapter · " : " chapters · ") : "") + fmtN(x.words || 0) + " 字 / words · " +
          (x.updated ? new Date(x.updated).toLocaleDateString() : "") + '</span></a><button type="button" class="mini-btn" data-l="del" data-id="' + esc(x.id) + '">Remove</button></li>';
      }).join("") + "</ul>" : "");
    el.onclick = function (e) {
      var b = e.target.closest("[data-l]"); if (!b) return;
      if (b.getAttribute("data-l") === "move") { b.disabled = true; b.textContent = "Bringing it…"; moveFromNovel(true).then(function () { renderList(el); }); return; }
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


  function flush() {
    if (!W.paper) return;
    if (W.writer && W.writer._flush) W.writer._flush();
    if ($(".wr-check")) readCheck($(".wr-check"));
    if ($(".mla-page")) readFormat($(".mla-page"), fmtLang());
  }

  /* ---------- files ---------- */
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
  function wireDrop(el, after) {
    el.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (t) { return t === "Files"; })) { e.preventDefault(); el.classList.add("wr-drop"); } });
    el.addEventListener("dragleave", function () { el.classList.remove("wr-drop"); });
    el.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); el.classList.remove("wr-drop");
      after(e.dataTransfer.files);
    });
  }

  var FILES = ".docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";


  /* ================= 1 · WRITE: the chapters, each with its full text ================= */
  function paraHTML(b) {
    if (isHead(b.text)) return '<h3 class="wc-sub" data-b="' + b.id + '">' + richHTML(b.text.replace(/^#+\s*/, "")) + "</h3>";
    return '<p data-b="' + b.id + '"' + ">" + richHTML(b.text) + "</p>";
  }
  function insertHere(after, label) {
    return '<div class="wc-ins"><button type="button" data-c="insert" data-after="' + esc(after) + '" title="' + esc(label) + '"><span>+</span> ' + esc(label) + "</button></div>";
  }
  // the paragraph and the place in it under the mouse, so the chapter opens right there
  function spotAt(e) {
    var r = null;
    if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(e.clientX, e.clientY);
    else if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(e.clientX, e.clientY); if (cp) { r = document.createRange(); r.setStart(cp.offsetNode, cp.offset); } }
    var el = e.target.closest("[data-b]");
    if (!el) return null;
    var off = 0;
    if (r && el.contains(r.startContainer)) { var pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset); off = pre.toString().length; }
    return { b: el.getAttribute("data-b"), off: off, y: el.getBoundingClientRect().top };
  }
  function chapCount(c) { return A().count(c.blocks.map(function (b) { return b.text; }).join("\n")).total; }
  function stepWrite(body) {
    var cs = chapters();
    body.innerHTML =
      '<div class="wr-tools">' +
        '<button type="button" class="pill solid" data-c="new">+ New chapter</button>' +
        '<label class="pill wr-file">Add a file as a chapter<input type="file" accept="' + FILES + '" multiple hidden data-c="file"></label>' +
        '<span class="wr-key">' + cs.length + (cs.length === 1 ? " chapter" : " chapters") + " · Translate, Sources and Format put them together as one article</span></div>" +
      (cs.length > 1 ? '<nav class="wc-toc" aria-label="Chapters">' + cs.map(function (c, i) {
        return '<a href="#ch-' + esc(c.id) + '" data-c="goto" data-id="' + esc(c.id) + '"><b>' + (i + 1) + "</b> " + esc(chapName(c, i)) + "</a>";
      }).join("") + "</nav>" : "") +
      (cs.length ? '<div class="wc-list">' + insertHere("", "Insert a chapter at the beginning") + cs.map(function (c, i) {
        var t = chapTitle(c.head);
        return '<article class="wc-ch" id="ch-' + esc(c.id) + '" data-id="' + esc(c.id) + '">' +
          '<header class="wc-head"><span class="wc-no">No. ' + (i + 1) + "</span>" +
            (t ? '<h2 class="wc-title">' + esc(t) + "</h2>" : "") +
            '<span class="wc-meta">' + esc(fmtDate(c.head.date)) + " · " + fmtN(chapCount(c)) + " 字" +
              "</span>" +
            '<span class="wc-btns"><button type="button" class="mini-btn" data-c="up" data-id="' + esc(c.id) + '" title="Move up"' + (i ? "" : " disabled") + ">↑</button>" +
              '<button type="button" class="mini-btn" data-c="down" data-id="' + esc(c.id) + '" title="Move down"' + (i < cs.length - 1 ? "" : " disabled") + ">↓</button>" +
              '<button type="button" class="pill" data-c="edit" data-id="' + esc(c.id) + '">Write</button></span></header>' +
          '<div class="wc-text" data-c="edit" data-id="' + esc(c.id) + '">' + (c.blocks.length ? c.blocks.map(paraHTML).join("") : '<p class="empty">Empty — click to write.</p>') + "</div></article>" +
          insertHere(c.id, i < cs.length - 1 ? "Insert a chapter between No. " + (i + 1) + " and No. " + (i + 2) : "Add a chapter at the end");
      }).join("") + "</div>" :
      '<div class="wr-empty"><p>Write the article one chapter at a time — one topic each, in any order; you can move them later.</p><p class="j-hint">You can also drop .docx, .pdf, .md or .txt files here: each becomes a chapter.</p></div>');
    wireDrop(body, function (files) { addFiles(files); });
    body.onchange = function (e) { if (e.target.matches("input[type=file][data-c=file]")) { addFiles(e.target.files); e.target.value = ""; } };
    body.onclick = function (e) {
      var b = e.target.closest("[data-c]"); if (!b || b.tagName === "INPUT") return;
      var k = b.getAttribute("data-c"), id = b.getAttribute("data-id");
      if (k === "goto") { e.preventDefault(); var el = document.getElementById("ch-" + id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
      if (k === "new") { remember(); var h = addChapter("", []); save(); writeChapter(h.id); }
      if (k === "insert") { remember(); var after = b.getAttribute("data-after"), h2 = addChapter("", [], after ? { after: after } : { first: true }); save(); writeChapter(h2.id); }
      if (k === "up" || k === "down") { remember(); moveChapter(id, k === "up" ? -1 : 1); save(); render(); var el2 = document.getElementById("ch-" + id); if (el2) el2.scrollIntoView({ block: "center" }); }
      if (k === "edit") { if (String(window.getSelection() || "").length > 1) return; writeChapter(id, b.classList.contains("wc-text") ? spotAt(e) : null); }   // selecting text to copy doesn't open it
    };
  }
  // each file becomes a chapter named after it
  function addFiles(files) {
    files = Array.prototype.slice.call(files || []); if (!files.length) return;
    setStatus("Reading " + files.length + (files.length === 1 ? " file…" : " files…"));
    files.reduce(function (pr, f) {
      return pr.then(function (n) {
        return readFile(f).then(function (t) {
          var ps = splitPasted(t); if (!ps.length) return n;
          if (!n) remember();
          addChapter(f.name.replace(/\.[^.]+$/, ""), ps); return n + 1;
        }, function (er) { toast(er.message); return n; });
      });
    }, Promise.resolve(0)).then(function (n) { if (n) { save(); render(); toast(n + (n === 1 ? " chapter added." : " chapters added.")); } else setStatus(""); });
  }

  /* ---------- writing one chapter: a quiet full page, saved as you type ---------- */
  function bodyHTML(c) {
    return c.blocks.map(function (b) {
      if (isHead(b.text)) return '<h3 data-id="' + b.id + '">' + richHTML(b.text.replace(/^#+\s*/, "")) + "</h3>";
      return '<p data-id="' + b.id + '">' + richHTML(b.text) + "</p>";
    }).join("");
  }
  function writeChapter(id, spot) {
    var c = chapterById(id); if (!c) return;
    closeWriter(true);
    var p = W.paper, cs = chapters(), idx = cs.findIndex(function (x) { return x.id === id; });
    var w = document.createElement("div");
    w.className = "ed-write wc-write"; w._ch = id;
    w.innerHTML =
      '<header class="ew-bar"><button type="button" class="pill" data-x="close">← ' + esc(cut1(p.title, 28)) + "</button>" +
        '<span class="ew-where">No. ' + (idx + 1) + " of " + cs.length + "</span>" +
        '<button type="button" class="mini-btn" data-x="prev"' + (idx ? "" : " disabled") + ">← Previous</button>" +
        '<button type="button" class="mini-btn" data-x="next"' + (idx < cs.length - 1 ? "" : " disabled") + ">Next →</button>" +
        '<span class="ew-status" aria-live="polite">' + esc(W.status) + "</span>" +
        '<button type="button" class="pill" data-x="sugg">✦ Gemini writes it in</button>' +
        '<button type="button" class="pill danger" data-x="del">Delete</button></header>' +
      '<div class="ew-tools" role="toolbar">' +
        '<button type="button" data-cmd="italic" title="Italic — titles of works (⌘I)"><i>I</i></button>' +
        '<button type="button" data-cmd="h" title="Subheading inside the chapter">H</button>' +
        '<span class="ew-hint">Paste anything anywhere. Shift+Enter keeps lines of a poem together.</span>' +
        '<span class="ew-count"></span></div>' +
      '<div class="wc-split"><div class="ew-page">' +
        '<div class="ew-meta"><input class="ew-date" type="datetime-local" value="' + esc(c.head.date || "") + '"></div>' +
        '<input class="ew-title" placeholder="Chapter title 章节名 (optional)" value="' + esc(chapTitle(c.head)) + '">' +
        '<div class="ew-body" contenteditable="true" spellcheck="true" data-placeholder="开始写… Start writing, or paste."></div></div>' +
        '<aside class="wc-side" hidden></aside></div>';
    document.body.appendChild(w);
    document.documentElement.classList.add("lb-open");
    W.writer = w;
    var body = $(".ew-body", w);
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    body.innerHTML = bodyHTML(c);
    var count = function () { $(".ew-count", w).textContent = fmtN(A().count(body.innerText).total) + " 字"; };
    var timer;
    var changed = function () { count(); clearTimeout(timer); setStatus("Typing…"); timer = setTimeout(function () { readChapter(w); }, 700); };
    w._flush = function () { clearTimeout(timer); readChapter(w); };
    body.addEventListener("input", changed);
    $(".ew-title", w).addEventListener("input", changed);
    $(".ew-date", w).addEventListener("change", changed);
    count();
    $(".ew-tools", w).addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cmd]"); if (!b) return;
      body.focus();
      if (b.getAttribute("data-cmd") === "italic") document.execCommand("italic");
      else document.execCommand("formatBlock", false, /^h/i.test(document.queryCommandValue("formatBlock")) ? "p" : "h3");
      changed();
    });
    // pasted text comes in as plain paragraphs; a passage (not just a few words) is remembered as new, for Gemini
    body.addEventListener("paste", function (ev) {
      var t = ev.clipboardData && ev.clipboardData.getData("text/plain"); if (t == null) return;
      ev.preventDefault();
      var ps = splitPasted(t);
      if (!ps.length) return;
      // a few words, or one passage dropped into the middle of a sentence, go into that sentence
      var at = caretPlace(body);
      if (ps.length === 1 && ps[0].indexOf("\n") < 0 && (A().count(ps[0]).total < 30 || at === "middle")) document.execCommand("insertText", false, ps[0]);
      else insertParas(body, ps);
      changed();
    });
    body.addEventListener("dragover", function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") > -1) e.preventDefault(); });
    body.addEventListener("drop", function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      readFiles(e.dataTransfer.files).then(function (t) {
        var ps = splitPasted(t); if (!ps.length) return;
        body.insertAdjacentHTML("beforeend", ps.map(function (x) { return '<p data-new="1">' + richHTML(x) + "</p>"; }).join(""));
        changed();
      });
    });
    w.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-x]"); if (!b) return;
      var k = b.getAttribute("data-x");
      if (k === "close") closeWriter();
      if (k === "prev" || k === "next") { readChapter(w); var cs2 = chapters(), i2 = cs2.findIndex(function (x) { return x.id === w._ch; }) + (k === "prev" ? -1 : 1); if (cs2[i2]) writeChapter(cs2[i2].id); }
      if (k === "sugg") { readChapter(w); var side = $(".wc-side", w); if (side.hidden) writePanel(w); else { side.hidden = true; w.classList.remove("with-side"); } }
      if (k === "del") {
        if (!window.confirm("Delete this chapter? Its text is kept aside (Thesis & style → Kept aside) in case you want it back.")) return;
        remember(); removeChapter(w._ch); save(); closeWriter(); toast("Chapter deleted — kept aside.");
      }
    });
    w.addEventListener("keydown", function (k) {
      if ((k.metaKey || k.ctrlKey) && k.key === "s") { k.preventDefault(); readChapter(w); saveNow(); }
      if (k.key === "Escape" && !$(".wr-pop")) closeWriter();
    });
    (chapTitle(c.head) || c.blocks.length ? body : $(".ew-title", w)).focus({ preventScroll: true });
    if (c.blocks.length) placeCaret(w, spot);
  }
  // where the cursor is in its paragraph: "start", "middle", "end" or "" (outside / empty paragraph)
  function caretPlace(body) {
    var sel = window.getSelection(); if (!sel.rangeCount) return "";
    var r = sel.getRangeAt(0), n = r.startContainer, cur = (n.nodeType === 1 ? n : n.parentElement).closest(".ew-body > *");
    if (!cur || !body.contains(cur) || !cur.textContent.trim()) return "";
    var before = document.createRange(); before.selectNodeContents(cur); before.setEnd(r.startContainer, r.startOffset);
    var after = document.createRange(); after.selectNodeContents(cur); after.setStart(r.endContainer, r.endOffset);
    var b = before.toString().trim(), a = after.toString().trim();
    return !b ? "start" : !a ? "end" : "middle";
  }
  // pasted passages become paragraphs of their own, between paragraphs (a paragraph is split where the cursor is)
  function insertParas(body, ps) {
    var sel = window.getSelection(), r = sel.rangeCount ? sel.getRangeAt(0) : null;
    var nodes = ps.map(function (x) { var el = document.createElement("p"); el.setAttribute("data-new", "1"); el.innerHTML = richHTML(x); return el; });
    var cur = r && body.contains(r.startContainer) ? (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest(".ew-body > *") : null;
    if (r && !r.collapsed && cur) r.deleteContents();
    if (!cur) nodes.forEach(function (el) { body.appendChild(el); });
    else {
      var tailR = document.createRange(); tailR.setStart(r.startContainer, r.startOffset); tailR.setEnd(cur, cur.childNodes.length);
      var tail = document.createElement(cur.nodeName === "H3" ? "h3" : "p"); tail.appendChild(tailR.extractContents());
      var ref = cur.nextSibling;
      nodes.forEach(function (el) { body.insertBefore(el, ref); });
      if (tail.textContent.trim()) {
        body.insertBefore(tail, ref);
        if (!cur.textContent.trim()) { if (cur.getAttribute("data-id")) tail.setAttribute("data-id", cur.getAttribute("data-id")); tail.className = cur.className; cur.remove(); }
      } else if (!cur.textContent.trim()) cur.remove();
    }
    var last = nodes[nodes.length - 1], rr = document.createRange(); rr.selectNodeContents(last); rr.collapse(false); sel.removeAllRanges(); sel.addRange(rr);
  }
  // the cursor goes where you clicked in the chapter (or at its end), and that place is shown
  function placeCaret(w, spot) {
    var body = $(".ew-body", w), sel = window.getSelection(), r = document.createRange();
    var el = spot && spot.b ? body.querySelector('[data-id="' + spot.b + '"]') : null;
    if (!el) { r.selectNodeContents(body); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); return; }
    var left = spot.off || 0, walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, done = false;
    while ((n = walker.nextNode())) { if (left <= n.nodeValue.length) { r.setStart(n, left); done = true; break; } left -= n.nodeValue.length; }
    if (!done) { r.selectNodeContents(el); r.collapse(false); } else r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    // the paragraph stays at the same height on the screen as where you clicked it
    var page = $(".ew-page", w), y = spot.y != null ? spot.y : page.getBoundingClientRect().top + 120;
    page.scrollTop += el.getBoundingClientRect().top - y;
  }
  function closeWriter(quiet) {
    var w = W.writer; if (!w) return;
    if (w._flush) w._flush();
    w._dead = true;
    saveNow();
    var id = w._ch;
    w.remove(); W.writer = null;
    if (!$(".ed-sheet")) document.documentElement.classList.remove("lb-open");
    if (quiet) return;
    if (W.step === 1) { render(); var el = document.getElementById("ch-" + id); if (el) el.scrollIntoView({ block: "start" }); }
  }
  // one passage, as typed: italics → *…*, line breaks kept
  function readLines(el) {
    var out = "";
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (/^(I|EM)$/.test(c.nodeName)) out += "*" + c.textContent + "*";
        else if (c.nodeName === "BR") out += "\n";
        else if (/^(P|DIV|LI|H\d|BLOCKQUOTE)$/.test(c.nodeName)) { out += "\n"; walk(c); out += "\n"; }
        else walk(c);
      });
    })(el);
    return out.replace(/ /g, " ").replace(/\*\*/g, "").split("\n").map(function (l) { return l.replace(/[ \t]+/g, " ").trim(); }).join("\n").replace(/\n{2,}/g, "\n").trim();
  }
  function readChapter(w) {
    if (w._dead) return;   // a page already replaced must not write its old text back
    var p = W.paper, id = w._ch, c = chapterById(id); if (!c) return;
    var body = $(".ew-body", w), by = {}, seen = {}, out = [], changed = false;
    c.blocks.forEach(function (b) { by[b.id] = b; });
    // loose text typed straight into the page becomes a paragraph (the cursor stays where it was)
    Array.prototype.slice.call(body.childNodes).forEach(function (n) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) return;
      var sel = window.getSelection(), inside = sel.anchorNode === n, off = sel.anchorOffset;
      var pe = document.createElement("p"); body.insertBefore(pe, n); pe.appendChild(n);
      if (inside) { var r = document.createRange(); r.setStart(n, Math.min(off, n.length)); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    });
    Array.prototype.forEach.call(body.children, function (n) {
      var t = readLines(n); if (!t) return;
      if (/^H\d$/.test(n.nodeName)) t = "### " + t.replace(/\n/g, " ");
      var bid = n.getAttribute("data-id");
      if (!bid || seen[bid]) { bid = uid(); n.setAttribute("data-id", bid); }
      seen[bid] = 1;
      var old = by[bid];
      if (old) { if (old.text !== t) { old.text = t; old.by = "me"; changed = true; } out.push(old); return; }
      var nb = { id: bid, text: t, by: "me", src: [] };
      if (n.hasAttribute("data-new")) { nb.by = "paste"; nb.added = Date.now(); n.removeAttribute("data-new"); }
      out.push(nb); changed = true;
    });
    // a paragraph that disappeared and whose words are not elsewhere in the chapter is kept aside
    c.blocks.forEach(function (b) {
      if (seen[b.id]) return;
      changed = true;
      var key = b.text.replace(/\s/g, "");
      if (key.length > 12 && !out.some(function (x) { return x.text.replace(/\s/g, "").indexOf(key) > -1; })) p.aside.push({ text: b.text, at: Date.now(), why: "deleted" });
    });
    if (!changed && out.some(function (b, i) { return c.blocks[i] !== b; })) changed = true;
    var tv = $(".ew-title", w).value, dv = $(".ew-date", w).value;
    if (chapTitle(c.head) !== tv.trim()) { setTitle(c.head, tv); changed = true; }
    if ((c.head.date || "") !== dv && dv) { c.head.date = dv; changed = true; }
    if (changed) { putChapter(id, out); save(); } else setStatus(W.status === "Typing…" ? "✓ Saved" : W.status);
    var st = $(".ew-status", w); if (st) st.textContent = W.status;
  }

  /* ---------- ✦ Gemini writes the new material into the chapter ---------- */
  // what must survive a rewrite: years and numbers, words in other languages, titles of works
  function mustKeep(t) {
    var out = {};
    (String(t).match(/\d{3,4}|[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]{3,}|《[^》]{1,30}》/g) || []).forEach(function (x) { out[x] = 1; });
    return Object.keys(out);
  }
  function writePrompt(c, extra, plain) {
    var cs = chapters(), no = cs.indexOf(c) + 1, total = 0;
    var others = cs.map(function (o, i) {
      if (o === c) return "";
      var t = o.blocks.map(function (b) { return b.text; }).join("\n"); total += t.length;
      return "No. " + (i + 1) + (chapTitle(o.head) ? " 《" + chapTitle(o.head) + "》" : "") + "\n" + t;
    }).filter(Boolean);
    if (total > 60000) others = cs.filter(function (o) { return o !== c; }).map(function (o) { return "No. " + (cs.indexOf(o) + 1) + (chapTitle(o.head) ? " 《" + chapTitle(o.head) + "》" : "") + "\n" + o.blocks.map(function (b) { return cut1(b.text, 120); }).join("\n"); });
    var hasNew = c.blocks.some(function (b) { return b.added; });
    return context() +
      "\nShe writes this article chapter by chapter, one topic per chapter. " + (hasNew ? "She has just pasted new material into the CURRENT chapter (marked [NEW]): new findings, sources, quotations she wants to keep, notes. It does not fit yet." : "The CURRENT chapter was written in pieces and does not read as one yet.") + "\n" +
      "Write the CURRENT chapter again as one finished piece of her article" + (hasNew ? ", with the new material worked in" : "") + ":\n" +
      "- Put every piece where it belongs in the line of the argument (how his life shows in the choices he made in the novel), and write the transitions so nothing clashes.\n" +
      "- Frame each quotation: who wrote it, in what work, when, and what exactly it shows. Copy quotations exactly, in their original language, with their line breaks.\n" +
      "- Explain, briefly and clearly inside the sentence, any name, term, institution or event a reader without background needs.\n" +
      "- Explain mechanisms (the law, institution, religion, economy behind a fact), not one phenomenon by another.\n" +
      "- Keep EVERY fact, name, date, number, quotation, citation, example and image from all paragraphs, old and new. Do not summarise and do not shorten: the result is at least as long as her text. Where two paragraphs say the same thing, merge them into one that keeps the details of both.\n" +
      "- Keep her wording wherever it already works; change only what is needed for the chapter to read as one.\n" +
      "- Speculation stays marked as speculation. Never add facts, sources or quotations that are not in the material.\n" +
      "- A note she wrote to herself or to an AI (an instruction, a to-do, a question) is not part of the article: leave it out of the text and list it under notes.\n" +
      "- Same language as her text (Chinese). Literary analysis, not history. Well-built, flowing sentences with high information density; no stock phrases.\n" +
      (extra ? "- Her instruction for this chapter: " + extra + "\n" : "") +
      (plain ? "Answer with the chapter only: paragraphs separated by a blank line (lines of a poem on their own lines inside the paragraph). Then, if there are notes, a line '---NOTES---' and the notes.\n"
             : 'Answer JSON only: {"paragraphs": ["paragraph", "…"], "notes": ["…"]} (inside a paragraph, \\n keeps lines of a poem apart).\n') +
      (others.length ? "\nThe other chapters, for context only (do not repeat what they already say; keep dates and names consistent with them):\n\n" + others.join("\n\n") + "\n" : "") +
      "\nCURRENT — No. " + no + (chapTitle(c.head) ? " 《" + chapTitle(c.head) + "》" : "") + ":\n" +
      c.blocks.map(function (b, i) { return "[" + (i + 1) + "]" + (b.added ? " [NEW]" : "") + " " + b.text; }).join("\n\n");
  }
  function writePanel(w, state) {
    var id = w._ch, c = chapterById(id), side = $(".wc-side", w); if (!c || !side) return;
    state = state || w._ws || {};
    w._ws = state;
    var nw = c.blocks.filter(function (b) { return b.added; }).length, last = c.head.prev;
    side.hidden = false; w.classList.add("with-side");
    side.innerHTML = '<div class="wc-side-head"><b>✦ Gemini writes it in</b><button type="button" class="ed-x" data-y="hide" aria-label="Close">×</button></div>' +
      '<p class="j-hint">' + (nw ? "Gemini writes this chapter again with what you pasted in worked in" : "Gemini writes this chapter again so it reads as one piece") +
        ": transitions, quotations framed, terms explained — keeping every fact, date and quotation. Your version is kept; one click brings it back.</p>" +
      '<label class="ed-field"><span class="ed-label">Anything to tell Gemini about this chapter (optional)</span><textarea class="ed-input" data-y="extra" rows="2" placeholder="例如：开头用 1794 年沙龙的画面；多解释血统纯洁制度">' + esc(state.extra || "") + "</textarea></label>" +
      '<p class="wc-side-btns"><button type="button" class="pill solid" data-y="write"' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Gemini is writing…" : "Write it") + "</button>" +
        '<button type="button" class="mini-btn" data-y="prompt" title="Copy the request to paste into gemini.google.com yourself">Copy for Gemini</button>' +
        '<button type="button" class="mini-btn" data-y="pastein">Paste Gemini\'s answer</button></p>' +
      (aiKey() ? "" : '<p class="j-hint">To let the site ask Gemini itself: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">get a free key</a> and paste it here <span class="wr-keyrow"><input class="ed-input" type="password" data-key placeholder="AIza…" autocomplete="off"><button type="button" class="mini-btn" data-y="savekey">Turn on</button></span></p>') +
      (state.paste ? '<label class="ed-field"><span class="ed-label">Gemini\'s chapter</span><textarea class="ed-input" data-y="answer" rows="8"></textarea></label><p><button type="button" class="pill solid" data-y="useanswer">Put it in the chapter</button></p>' : "") +
      (state.msg ? '<div class="wc-overall">' + state.msg + "</div>" : "") +
      (state.missing && state.missing.length ? '<p class="j-hint"><b>Not in Gemini\'s version</b> (check whether they should be): ' + state.missing.map(esc).join(" · ") + "</p>" : "") +
      (state.notes && state.notes.length ? '<h4 class="wr-sub">Your notes, left out of the text</h4><ul class="wc-notes">' + state.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "") +
      (last ? '<p class="wc-side-btns"><button type="button" class="mini-btn" data-y="back">↩ Back to my version (' + esc(fmtDate(last.at)) + ")</button>" + '<button type="button" class="mini-btn" data-y="showprev">See my version</button></p>' : "") +
      (state.showPrev && last ? '<div class="wc-prev">' + last.blocks.map(function (b) { return "<p>" + richHTML(b.text) + "</p>"; }).join("") + "</div>" : "") +
      "";
    side.oninput = function (e) { if (e.target.getAttribute("data-y") === "extra") state.extra = e.target.value; };
    side.onclick = function (e) {
      var b = e.target.closest("[data-y]"); if (!b || b.tagName === "TEXTAREA") return;
      var k = b.getAttribute("data-y");
      if (k === "hide") { side.hidden = true; w.classList.remove("with-side"); }
      if (k === "write") { if (!aiKey()) { state.msg = "Paste a Gemini key below first, or use “Copy for Gemini” and paste its answer back."; writePanel(w); return; } writeIn(w); }
      if (k === "prompt") { readChapter(w); copyPrompt(writePrompt(chapterById(id), state.extra, true), "Copied. Paste it into Gemini, then bring its chapter back with “Paste Gemini's answer”."); state.paste = true; writePanel(w); }
      if (k === "pastein") { state.paste = !state.paste; writePanel(w); }
      if (k === "useanswer") {
        var raw = $("[data-y=answer]", side).value; if (!raw.trim()) return;
        var parts = raw.split(/\n-{3}\s*NOTES\s*-{3}\n?/i);
        applyWritten(w, splitMarkdown(parts[0].replace(/^```\w*\n?|```$/g, "")), parts[1] ? splitMarkdown(parts[1]) : [], "Gemini (pasted)");
      }
      if (k === "savekey") { var v = $("[data-key]", side).value.trim(); if (!v) return; W.ai.gemini_key = v; W.skip = {}; saveAI(); writeIn(w); }
      if (k === "back") {
        var cc = chapterById(id); if (!cc || !cc.head.prev) return;
        remember();
        var mine = cc.head.prev; cc.head.prev = { at: Date.now(), blocks: cc.blocks.map(function (x) { return { id: x.id, text: x.text, by: x.by, added: x.added }; }) };
        putChapter(id, mine.blocks.map(function (x) { return { id: uid(), text: x.text, by: x.by || "me", src: [], added: x.added }; }));
        save(); state.msg = "Your version is back. (Gemini's is kept: the same button switches again.)"; state.missing = []; reopen(w);
      }
      if (k === "showprev") { state.showPrev = !state.showPrev; writePanel(w); }
    };
  }
  // show the chapter again in the page (after it was replaced), with the panel open
  function reopen(w) { var st = w._ws; w._flush = null; w._dead = true; writeChapter(w._ch); if (W.writer) { W.writer._ws = st; writePanel(W.writer); } }
  function applyWritten(w, paras, notes, model) {
    var id = w._ch, c = chapterById(id), st = w._ws || {};
    paras = (paras || []).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    if (!c || !paras.length) { st.msg = "Gemini's answer had no text."; writePanel(w); return; }
    remember();
    var before = c.blocks.map(function (b) { return b.text; }).join("\n"), after = paras.join("\n");
    c.head.prev = { at: Date.now(), blocks: c.blocks.map(function (b) { return { id: b.id, text: b.text, by: b.by, added: b.added }; }) };
    putChapter(id, paras.map(function (t) { return { id: uid(), text: t, by: "ai", src: [] }; }));
    save();
    var n0 = A().count(before).total, n1 = A().count(after).total;
    st.missing = mustKeep(before).filter(function (x) { return after.indexOf(x) < 0; }).slice(0, 40);
    st.notes = notes || [];
    st.msg = "<b>Written in.</b> " + paras.length + " paragraphs, " + fmtN(n1) + " 字 (yours: " + fmtN(n0) + ")" + (model ? " · " + esc(model) : "") + ". Read it through; ↩ brings your version back.";
    st.busy = false; st.paste = false; st.showPrev = false;
    reopen(w);
  }
  function writeIn(w) {
    readChapter(w);
    var id = w._ch, c = chapterById(id), st = w._ws = w._ws || {}; if (!c || !c.blocks.length) return;
    st.busy = true; st.msg = ""; writePanel(w);
    var n0 = A().count(c.blocks.map(function (b) { return b.text; }).join("\n")).total, prompt = writePrompt(c, st.extra);
    var ask = function (pr) { return gemini(pr, { json: true, temp: 0.5, max: 32768 }).then(function (r) { var j = parseJSON(r.text) || {}; j.model = r.model; j.cut = r.cut; return j; }); };
    ask(prompt).then(function (j) {
      var len = A().count((j.paragraphs || []).join("\n")).total;
      // shorter than her text: details were dropped, so once more, firmly
      if (len < n0 * 0.9) return ask(prompt + "\n\nYour previous answer was only " + Math.round(len / Math.max(1, n0) * 100) + "% as long as her text — details were lost. Write it again and keep every detail.").then(function (j2) { return A().count((j2.paragraphs || []).join("\n")).total > len ? j2 : j; });
      return j;
    }).then(function (j) {
      if (W.writer !== w) return;
      if (!Array.isArray(j.paragraphs) || !j.paragraphs.length) throw new Error(j.cut ? "the answer was cut off — try a shorter chapter" : "no text came back");
      applyWritten(w, j.paragraphs, Array.isArray(j.notes) ? j.notes.map(String) : [], j.model);
    }).catch(function (e) {
      st.busy = false; st.msg = "Gemini didn't answer: " + esc(e.message) + ". You can use “Copy for Gemini” instead.";
      if (W.writer === w) writePanel(w);
    });
  }

  /* ---------- a serial moved here from Novel: its chapters become this article's chapters ---------- */
  // where the chapters were when they left the public site (so no GitHub search is needed)
  var MOVED = [{ project: "brazil-oriental", id: "lucas", title: "Lucas", commit: "8de0f37f354103fc86d0b467d5f046d63d0ce0b7",
    files: ["015041", "015128", "015952", "020036", "020057", "020141", "020223", "020348", "020604", "020657", "021247", "023811"].map(function (t) { return "brazil-oriental-20261011-" + t; }) }];
  function missingMoved() { return MOVED.filter(function (m) { return !(W.list || []).some(function (x) { return x.id === m.id; }); }); }
  function moveFromNovel(force) {
    if (W.moving) return W.moving;
    var todo = missingMoved().filter(function (m) { return force || (W.removed || []).indexOf(m.id) < 0; });
    if (!todo.length) return Promise.resolve();
    W.moveErr = "";
    W.moving = todo.reduce(function (pr, m) {
      return pr.then(function () {
        return lget("paper:" + m.id).then(function (have) {
          // already on this device (or in your private repository): just list it again
          var known = have && have.blocks ? Promise.resolve(have) : W.failed ? Promise.resolve(null) : priv().read("papers/" + m.id + ".json").then(function (r) { return r && r.data; }).catch(function () { return null; });
          return known.then(function (paper) {
            if (paper && paper.blocks && paper.blocks.length) return paper;
            return fetchSerial(m).then(function (got) {
              if (!got || !got.entries.length) throw new Error("the chapters couldn't be found on GitHub");
              var p = upgrade({ id: m.id, title: got.title || m.title, blocks: [], created: Date.now(), from: "Novel · " + m.project });
              var keep = W.paper; W.paper = p;
              got.entries.forEach(function (e) { addChapter(e.title || "", splitMarkdown(e.text), { date: e.date }); });
              W.paper = keep;
              p.updated = 1;   // a copy already in your private repository (written elsewhere) always wins over this one
              W.movedNote = "“" + p.title + "” is here: " + got.entries.length + " chapters" + (got.drafts ? " (with your unpublished " + (got.drafts === 1 ? "draft" : got.drafts + " drafts") + ")" : "") + ". Click it to keep writing.";
              return lput("paper:" + m.id, p).then(function () {
                if (!W.failed) priv().write("papers/" + m.id + ".json", p).then(function (sha) { W.shas = W.shas || {}; W.shas[m.id] = sha; }).catch(cloudFail);
                return p;
              });
            });
          }).then(function (paper) {
            W.removed = (W.removed || []).filter(function (x) { return x !== m.id; });
            if (!(W.list || []).some(function (x) { return x.id === m.id; })) (W.list = W.list || []).unshift({ id: m.id, title: paper.title, words: A().count(text((paper.blocks || []).filter(function (b) { return !isRef(b); }))).total, chapters: chapters(paper).length, updated: Date.now() });
            saveList();
          });
        });
      });
    }, Promise.resolve()).catch(function (e) { console.error(e); W.moveErr = e.message || String(e); }).then(function () { W.moving = null; });
    return W.moving;
  }
  // the chapters as they were last published, with any newer unpublished drafts from the writing page
  function fetchSerial(m) {
    var project = m.project;
    var REPO = "alyxsstudio/alyxsstudio", API = "https://api.github.com/repos/" + REPO, BASE = "alyxs-studio/content/";
    var getJ = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("GitHub " + r.status); return r.json(); }); };
    var list = function (ref) { return getJ(API + "/contents/" + BASE + "entries?ref=" + ref).then(function (a) { return (a || []).filter(function (f) { return f.name.indexOf(project + "-") === 0; }); }); };
    var known = m.commit ? Promise.resolve({ ref: m.commit, files: m.files.map(function (n) { return { name: n + ".json", path: BASE + "entries/" + n + ".json" }; }) }) : null;
    return (known || list("main").then(function (files) {
      if (files.length) return { ref: "main", files: files };
      // already removed from the site: read them from the commit before
      return getJ(API + "/commits?path=" + BASE + "projects/" + project + ".json&per_page=1").then(function (cs) {
        var parent = cs && cs[0] && cs[0].parents && cs[0].parents[0] && cs[0].parents[0].sha; if (!parent) return { files: [] };
        return list(parent).then(function (f2) { return { ref: parent, files: f2 }; });
      });
    })).then(function (o) {
      if (!o.files.length) return null;
      var raw = "https://raw.githubusercontent.com/" + REPO + "/" + o.ref + "/";
      return Promise.all([getJ(raw + BASE + "projects/" + project + ".json").catch(function () { return {}; })].concat(o.files.map(function (f) {
        var eid = f.name.replace(/\.json$/, "");
        return getJ(raw + f.path).then(function (e) {
          e.id = eid;
          var local = null; try { local = JSON.parse(localStorage.getItem("alyx-draft:" + eid) || "null"); } catch (x) {}
          return priv().read("drafts/write_" + eid + ".json").catch(function () { return null; }).then(function (r) {
            var d = [local, r && r.data].filter(function (x) { return x && x.text != null; }).sort(function (a, b) { return (b.saved || 0) - (a.saved || 0); })[0];
            if (d && d.text !== e.text) { e.text = d.text; e.title = d.title != null ? d.title : e.title; e.draft = true; }
            return e;
          });
        });
      }))).then(function (all) {
        var proj = all.shift() || {};
        // a chapter started there but never published
        var nl = null; try { nl = JSON.parse(localStorage.getItem("alyx-draft:new:" + project) || "null"); } catch (x) {}
        return priv().read("drafts/write_new_" + project + ".json").catch(function () { return null; }).then(function (r) {
          var nd = [nl, r && r.data].filter(function (x) { return x && x.text; }).sort(function (a, b) { return (b.saved || 0) - (a.saved || 0); })[0];
          all.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || (+a.number || 0) - (+b.number || 0); });
          if (nd) all.push({ title: nd.title || "", text: nd.text, date: nowLocal(), draft: true });
          return { title: proj.title, entries: all, drafts: all.filter(function (e) { return e.draft; }).length };
        });
      });
    });
  }

  function remember() {
    var p = W.paper; if (!p) return;
    var snap = JSON.stringify({ blocks: p.blocks, aside: p.aside, deleted: p.deleted, sugg: p.sugg || {} });
    W.history.push(snap);
    while (W.history.length > 15) W.history.shift();
  }
  function undo() {
    var s = JSON.parse(W.history.pop()), p = W.paper;
    p.blocks = s.blocks; p.aside = s.aside; p.deleted = s.deleted; p.sugg = s.sugg;
    save(); render(); toast("Undone.");
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
    var p = W.paper, bs = p.blocks.filter(function (b) { return !b.ref && !REF.test(b.text) && !skip(b); });   // Works Cited stays as written
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
    return p.blocks.filter(function (b) { return !skip(b); }).map(function (b) { var en = (p.english[b.id] || {}).en || ""; return isRef(b) ? b.text : en && (b.head || isHead(b.text)) ? "## " + en.replace(/^#+\s*/, "") : en; }).filter(Boolean).join("\n\n");
  }

  /* ================= shared: a document you edit in place, with marks that are only on screen ================= */
  // *Title* in the text shows as italics; reading the page back turns italics into *Title* again
  function richHTML(t) { return esc(t).replace(/\*([^*\n]+)\*/g, "<i>$1</i>").replace(/\n/g, "<br>"); }
  function readRich(el) {
    var out = "";
    (function walk(n) {
      Array.prototype.forEach.call(n.childNodes, function (c) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (/^(I|EM)$/.test(c.nodeName)) out += "*" + c.textContent + "*";
        else if (c.nodeName === "BR") out += "\n";
        else walk(c);
      });
    })(el);
    // line breaks (lines of a poem) are kept; other runs of space become one
    return out.replace(/\u00a0/g, " ").replace(/\*\*/g, "").split("\n").map(function (l) { return l.replace(/\s+/g, " ").trim(); }).filter(Boolean).join("\n");
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
    var sents = [];
    A().analyze(t).paragraphs.forEach(function (an) { sents = sents.concat(an.sentences); });
    sents.forEach(function (s) {
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
    var bs = p.blocks.filter(function (b) { return !isRef(b) && !skip(b) && (lang === "zh" || (p.english[b.id] || {}).en); });
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
    if (!aiKey()) return toast("This needs your Gemini key (Thesis & style).");
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
    var bs = p.blocks.filter(function (b) { return !isRef(b) && !skip(b) && (lang === "zh" || (p.english[b.id] || {}).en); });
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
          '<button type="button" class="wr-mi" data-f="chapt">' + (p.chapTitles === "hide" ? "Show chapter titles as headings" : "Leave chapter titles out of the article") + "</button>" +
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
      if (k === "chapt") { p.chapTitles = p.chapTitles === "hide" ? "" : "hide"; save(); render(); toast(p.chapTitles === "hide" ? "Chapter titles are left out of the article (they stay in Write)." : "Chapter titles are headings in the article."); }
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
    var paragraphs = p.blocks.filter(function (b) { return !b.ref && !REF.test(b.text) && !skip(b) && !(worksCited().indexOf(b.text) > -1 && p.blocks.findIndex(function (x) { return REF.test(x.text); }) > -1 && p.blocks.indexOf(b) > p.blocks.findIndex(function (x) { return REF.test(x.text); })); })
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
    if (!window.AlyxDocx) need.push(root + "assets/js/docx.js?v=2");
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
      (p.aside.length ? '<h4 class="wr-sub">Kept aside (' + p.aside.length + ")</h4><p class=\"j-hint\">Chapters and paragraphs you deleted. Tap one to put it back.</p>" +
        p.aside.slice(-30).reverse().map(function (a, k) { return '<button type="button" class="wr-salt" data-back="' + (p.aside.length - 1 - k) + '">' + (a.why === "chapter" ? "<b>Chapter" + (a.title ? " · " + esc(a.title) : "") + "</b> " : "") + esc(a.text.slice(0, 140)) + (a.text.length > 140 ? "…" : "") + "</button>"; }).join("") : ""));
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
      remember();
      if (a.why === "chapter") addChapter(a.title || "", splitMarkdown(a.text));
      else { var cs = chapters(), last = cs[cs.length - 1]; if (!last) last = { id: addChapter("", []).id, blocks: [] }; putChapter(last.id, last.blocks.concat([{ id: uid(), text: a.text, by: "paste", src: [], added: Date.now() }])); }
      save(); closeSheet(); W.step = 1; render(); toast(a.why === "chapter" ? "Chapter put back at the end." : "Put back at the end of the last chapter.");
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
  window.AlyxWriter = { mount: mount, _W: W, _chapters: chapters, _split: splitPasted, _segments: segments, _restore: restoreQuotes };
})();
