/* Alyx's Studio — Inspiration: a private board in the Gallery, only for you.
   Paste a picture, a picture link or a page link (Pinterest, Instagram, a shop, an article…), or drop files.
   Each one is saved at once as a JPG in your private repository (studio-drafts → inspiration/),
   sorted by theme (Gemini looks at the picture, if you have a key), by colour and by where it came from.
   Every picture downloads as a JPG; a whole group downloads as a .zip of JPGs. */
(function () {
  "use strict";
  var E = function () { return window.AlyxEditor; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function toast(m) { if (E() && E().toast) E().toast(m); }
  function uid() { return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  var S = { ctx: null, data: null, sha: null, view: "theme", urls: {}, busy: 0, ai: null, timer: null, failed: false };
  var INDEX = "inspiration/index.json";

  /* ---------- storage ---------- */
  function priv() { return E().priv; }
  function load() {
    return Promise.all([
      priv().read(INDEX).then(function (r) { S.data = (r && r.data) || { items: [] }; S.sha = r && r.sha; }),
      priv().read("journal/settings.json").then(function (r) { S.ai = (r && r.data) || {}; }).catch(function () { S.ai = {}; })
    ]).catch(function (e) { console.error(e); S.data = { items: [] }; S.failed = true; });
  }
  var saving = Promise.resolve();
  function save() {
    clearTimeout(S.timer);
    status("Saving…");
    S.timer = setTimeout(function () {
      saving = saving.then(function () {
        return priv().write(INDEX, S.data, S.sha).then(function (sha) { S.sha = sha; status("✓ Saved"); });
      }).catch(function (e) { console.error(e); status("Not saved — check your sign-in"); });
    }, 800);
  }
  function status(t) { var el = $(".in-status"); if (el) el.textContent = t; }
  function key() { return (S.ai || {}).gemini_key; }

  /* ---------- pictures ---------- */
  function loadImg(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res({ im: im, url: u }); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("not a picture")); };
      im.src = u;
    });
  }
  function jpg(im, max, q) {
    var s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(function (b) { res({ blob: b, canvas: c }); }, "image/jpeg", q); });
  }
  // the colour family of a picture: most of its coloured pixels, or neutral
  var HUES = [["Red", 0], ["Orange", 25], ["Yellow", 50], ["Green", 110], ["Teal", 170], ["Blue", 215], ["Purple", 275], ["Pink", 325], ["Red", 360]];
  function colour(canvas) {
    var c = document.createElement("canvas"), n = 40; c.width = n; c.height = n;
    var g = c.getContext("2d"); g.drawImage(canvas, 0, 0, n, n);
    var px = g.getImageData(0, 0, n, n).data, buckets = {}, neutral = { light: 0, dark: 0, grey: 0 }, sr = 0, sg = 0, sb = 0;
    for (var i = 0; i < px.length; i += 4) {
      var r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
      sr += px[i]; sg += px[i + 1]; sb += px[i + 2];
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, d = mx - mn;
      var sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (sat < 0.18 || l < 0.08 || l > 0.94) { if (l > 0.75) neutral.light++; else if (l < 0.25) neutral.dark++; else neutral.grey++; continue; }
      var h = mx === r ? 60 * (((gg - b) / d) % 6) : mx === gg ? 60 * ((b - r) / d + 2) : 60 * ((r - gg) / d + 4);
      if (h < 0) h += 360;
      var best = HUES.reduce(function (a, x) { return Math.abs(x[1] - h) < Math.abs(a[1] - h) ? x : a; });
      var name = best[0];
      if (name === "Orange" && l < 0.45 && sat < 0.6) name = "Brown";
      buckets[name] = (buckets[name] || 0) + sat;
    }
    var total = n * n, top = Object.keys(buckets).sort(function (a, b) { return buckets[b] - buckets[a]; })[0];
    var colourful = top && buckets[top] > total * 0.08;
    var fam = colourful ? top : neutral.dark > neutral.light && neutral.dark > neutral.grey ? "Black" : neutral.light >= neutral.grey ? "White & cream" : "Grey";
    var hex = "#" + [sr, sg, sb].map(function (v) { return ("0" + Math.round(v / total).toString(16)).slice(-2); }).join("");
    return { family: fam, hex: hex };
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
  function weserv(u, w) { return "https://images.weserv.nl/?url=" + encodeURIComponent(u) + "&output=jpg&we" + (w ? "&w=" + w : ""); }
  function fetchImage(u) {
    return fetch(weserv(u, 2400)).then(function (r) {
      if (!r.ok || !/^image\//.test(r.headers.get("content-type") || "")) throw new Error("no picture");
      return r.blob();
    });
  }
  // a link: a picture itself, or a page whose preview picture we take
  function fromLink(u) {
    return fetchImage(u).then(function (b) { return { blob: b, link: u, source: host(u) }; }, function () {
      return fetch("https://api.microlink.io/?url=" + encodeURIComponent(u)).then(function (r) { return r.json(); }).then(function (j) {
        var d = (j && j.data) || {}, img = (d.image && d.image.url) || (d.logo && d.logo.url);
        if (!img) throw new Error("This link has no picture we can reach.");
        return fetchImage(img).then(function (b) { return { blob: b, link: u, source: d.publisher || host(u), title: d.title || "" }; });
      });
    });
  }

  /* add one picture: saved at once, then sorted */
  function add(blob, meta) {
    meta = meta || {};
    S.busy++; drawBusy();
    var id = uid(), item;
    return loadImg(blob).then(function (o) {
      return Promise.all([jpg(o.im, 2400, 0.9), jpg(o.im, 520, 0.8)]).then(function (r) {
        URL.revokeObjectURL(o.url);
        var col = colour(r[1].canvas);
        item = { id: id, at: Date.now(), file: "inspiration/" + id + ".jpg", thumb: "inspiration/" + id + "-t.jpg",
          w: r[0].canvas.width, h: r[0].canvas.height, color: col.hex, family: col.family,
          source: meta.source || (meta.link ? host(meta.link) : "Your files"), link: meta.link || "", title: meta.title || "", theme: "", tags: [] };
        S.urls[item.thumb] = URL.createObjectURL(r[1].blob);
        S.urls[item.file] = URL.createObjectURL(r[0].blob);
        S.data.items.unshift(item); render();
        return Promise.all([priv().writeBlob(item.file, r[0].blob), priv().writeBlob(item.thumb, r[1].blob)]).then(function () {
          save();
          return key() ? classify([item]) : null;
        });
      });
    }).catch(function (e) {
      console.error(e);
      if (item) { S.data.items = S.data.items.filter(function (x) { return x !== item; }); }
      toast(e.message === "not a picture" ? "That file isn't a picture." : "Couldn't save this picture: " + e.message);
    }).then(function () { S.busy--; drawBusy(); render(); });
  }
  function addLinks(text) {
    var links = String(text).match(/https?:\/\/[^\s"'<>]+/g) || [];
    if (!links.length) return false;
    links.forEach(function (u) {
      S.busy++; drawBusy();
      fromLink(u).then(function (r) { S.busy--; return add(r.blob, r); }, function (e) { S.busy--; drawBusy(); toast(host(u) + ": " + e.message); });
    });
    return true;
  }
  function addFiles(files) {
    var n = 0;
    Array.prototype.forEach.call(files || [], function (f) { if (/^image\//.test(f.type)) { n++; add(f, { source: "Your files" }); } });
    return n;
  }

  /* Gemini looks at the pictures and names a theme */
  function b64(blob) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.readAsDataURL(blob); }); }
  function thumbBlob(it) { return S.urls[it.thumb] ? fetch(S.urls[it.thumb]).then(function (r) { return r.blob(); }) : priv().readBlob(it.thumb); }
  function themes() { var t = []; S.data.items.forEach(function (x) { if (x.theme && t.indexOf(x.theme) < 0) t.push(x.theme); }); return t; }
  function classify(items) {
    var k = key(); if (!k || !items.length) return Promise.resolve();
    return Promise.all(items.map(thumbBlob)).then(function (blobs) { return Promise.all(blobs.map(b64)); }).then(function (datas) {
      var parts = [{ text: "These are pictures saved on an artist's inspiration board (she works in illustration, design, fashion, writing). " +
        "For each picture give a theme — reuse one of these existing themes when it fits: " + JSON.stringify(themes()) + "; otherwise a new theme of 1–3 English words in Title Case (e.g. \"Botanical Prints\", \"Street Style\", \"Packaging\", \"Interiors\", \"Typography\"). " +
        "Also up to 5 short lowercase English tags, and a title of a few words describing the picture. " +
        "Answer JSON only: [{\"n\":1,\"theme\":\"…\",\"tags\":[\"…\"],\"title\":\"…\"}, …] in the same order." }];
      datas.forEach(function (d, i) { parts.push({ text: "Picture " + (i + 1) + ":" }); parts.push({ inline_data: { mime_type: "image/jpeg", data: d } }); });
      return fetch("https://generativelanguage.googleapis.com/v1beta/models/" + ((S.ai || {}).vision_model || "gemini-flash-latest") + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": k },
        body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error(j.error.message);
        var t = (((j.candidates || [])[0] || {}).content || {}).parts || [], out = t.map(function (p) { return p.text || ""; }).join("");
        var arr = []; try { arr = JSON.parse((out.match(/\[[\s\S]*\]/) || ["[]"])[0]); } catch (e) {}
        items.forEach(function (it, i) {
          var a = arr.filter(function (x) { return +x.n === i + 1; })[0] || arr[i]; if (!a) return;
          if (!it.themeByMe && a.theme) it.theme = String(a.theme).slice(0, 40);
          if (Array.isArray(a.tags)) it.tags = a.tags.slice(0, 5).map(String);
          if (!it.title && a.title) it.title = String(a.title).slice(0, 80);
        });
        save(); render();
      });
    }).catch(function (e) { console.error(e); toast("Gemini couldn't sort the pictures: " + e.message); });
  }

  /* ---------- the board ---------- */
  function mount(ctx) {
    S.ctx = ctx;
    if (!S.data) { ctx.el.innerHTML = '<p class="empty">Opening your board…</p>'; load().then(function () { mount(ctx); }); return; }
    ctx.el.innerHTML =
      '<div class="in-add"><input class="ed-input in-link" type="url" placeholder="Paste a picture or a link here — or anywhere on this page (⌘V)">' +
        '<button type="button" class="pill solid" data-in="link">Add</button>' +
        '<label class="pill in-file">Choose pictures<input type="file" accept="image/*" multiple hidden></label>' +
        '<span class="in-status"></span></div>' +
      (S.failed ? '<p class="j-hint">Private storage couldn\'t open. Open /admin once in this browser to sign in, then reload.</p>' : "") +
      '<div class="in-bar"><div class="chips" role="tablist">' + [["theme", "By theme"], ["family", "By colour"], ["source", "By source"], ["new", "Newest"]].map(function (v) {
        return '<button type="button" class="chip' + (S.view === v[0] ? " on" : "") + '" data-in="view" data-v="' + v[0] + '">' + v[1] + "</button>";
      }).join("") + '</div><span class="in-busy" hidden></span></div>' +
      '<div class="in-board"></div>';
    var root = ctx.el;
    root.onclick = click;
    $(".in-link", root).addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); linkBox(); } });
    $(".in-file input", root).addEventListener("change", function (e) { addFiles(e.target.files); e.target.value = ""; });
    root.addEventListener("dragover", function (e) { e.preventDefault(); root.classList.add("in-drop"); });
    root.addEventListener("dragleave", function (e) { if (e.target === root) root.classList.remove("in-drop"); });
    root.addEventListener("drop", function (e) {
      e.preventDefault(); root.classList.remove("in-drop");
      if (addFiles(e.dataTransfer.files)) return;
      addLinks(e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"));
    });
    if (!S.pasteWired) {
      S.pasteWired = true;
      document.addEventListener("paste", function (e) {
        if (!S.ctx || !document.body.contains(S.ctx.el)) return;
        var t = e.target, inField = t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !t.classList.contains("in-link")) || t.isContentEditable);
        if (inField) return;
        var cd = e.clipboardData; if (!cd) return;
        var files = Array.prototype.slice.call(cd.files || []);
        if (!files.length && cd.items) Array.prototype.forEach.call(cd.items, function (it) { if (it.kind === "file") { var f = it.getAsFile(); if (f) files.push(f); } });
        if (files.length && addFiles(files)) { e.preventDefault(); return; }
        if (addLinks(cd.getData("text/plain") || "")) { e.preventDefault(); var box = $(".in-link"); if (box) box.value = ""; }
      });
    }
    render(); drawBusy();
  }
  function linkBox() {
    var box = $(".in-link"); if (!box) return;
    if (addLinks(box.value)) box.value = ""; else { toast("Paste a link that starts with http."); box.focus(); }
  }
  function drawBusy() {
    var el = $(".in-busy"); if (!el) return;
    el.hidden = !S.busy; el.textContent = S.busy ? "Saving " + S.busy + (S.busy === 1 ? " picture…" : " pictures…") : "";
  }
  function groups() {
    var its = S.data.items.slice().sort(function (a, b) { return b.at - a.at; });
    if (S.view === "new") return [{ name: "", items: its }];
    var g = {}, order = [];
    its.forEach(function (it) {
      var k = S.view === "theme" ? (it.theme || "Not sorted yet") : S.view === "family" ? (it.family || "Other") : (it.source || "Other");
      if (!g[k]) { g[k] = []; order.push(k); }
      g[k].push(it);
    });
    order.sort(function (a, b) { return a === "Not sorted yet" ? 1 : b === "Not sorted yet" ? -1 : g[b].length - g[a].length || a.localeCompare(b); });
    return order.map(function (k) { return { name: k, items: g[k] }; });
  }
  function render() {
    var board = $(".in-board"); if (!board) return;
    var its = S.data.items;
    if (!its.length) { board.innerHTML = '<p class="empty">Nothing here yet. Paste a picture or a link — it is saved straight away, privately.</p>'; return; }
    var unsorted = its.filter(function (x) { return !x.theme; }).length;
    board.innerHTML = (S.view === "theme" && unsorted ? '<p class="j-hint">' + unsorted + (unsorted === 1 ? " picture has" : " pictures have") + " no theme yet. " +
        (key() ? '<button type="button" class="mini-btn" data-in="sort">Sort with Gemini</button>' : "Add a Gemini key in the Thesis page (Thesis & style) to sort them automatically, or give each a theme yourself.") + "</p>" : "") +
      groups().map(function (gr, gi) {
        return '<section class="in-group">' + (gr.name ? '<div class="in-ghead"><h2>' + (S.view === "family" ? '<i class="in-sw" style="background:' + esc(gr.items[0].color) + '"></i>' : "") + esc(gr.name) +
          ' <span>' + gr.items.length + '</span></h2><button type="button" class="mini-btn" data-in="zip" data-g="' + gi + '">Download all (JPG)</button></div>' : "") +
          '<div class="in-grid">' + gr.items.map(function (it) {
            return '<button type="button" class="in-tile" data-in="open" data-id="' + it.id + '" style="aspect-ratio:' + (it.w || 4) + " / " + (it.h || 5) + ";background:" + esc(it.color || "#eee") + '">' +
              '<img alt="' + esc(it.title || it.theme || "") + '" data-thumb="' + esc(it.thumb) + '"' + (S.urls[it.thumb] ? ' src="' + S.urls[it.thumb] + '"' : "") + "></button>";
          }).join("") + "</div></section>";
      }).join("");
    lazy(board);
  }
  var queue = [], running = 0;
  function pump() {
    while (running < 6 && queue.length) {
      (function (img) {
        running++;
        var p = img.getAttribute("data-thumb");
        priv().readBlob(p).then(function (b) { S.urls[p] = S.urls[p] || URL.createObjectURL(b); }).catch(function () {}).then(function () {
          running--;
          document.querySelectorAll('img[data-thumb="' + p + '"]').forEach(function (x) { if (S.urls[p]) x.src = S.urls[p]; });
          pump();
        });
      })(queue.shift());
    }
  }
  function lazy(board) {
    var imgs = Array.prototype.filter.call(board.querySelectorAll("img[data-thumb]"), function (x) { return !x.getAttribute("src"); });
    if (!("IntersectionObserver" in window)) { queue = queue.concat(imgs); return pump(); }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target); } });
      pump();
    }, { rootMargin: "600px" });
    imgs.forEach(function (x) { io.observe(x); });
  }
  function full(it) {
    if (S.urls[it.file]) return Promise.resolve(S.urls[it.file]);
    return priv().readBlob(it.file).then(function (b) { return (S.urls[it.file] = URL.createObjectURL(b)); });
  }
  function fileName(it) { return ((it.title || it.theme || "inspiration").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "inspiration") + "-" + it.id.slice(-4) + ".jpg"; }
  function download(url, name) { var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500); }
  function click(e) {
    var b = e.target.closest("[data-in]"); if (!b) return;
    var k = b.getAttribute("data-in");
    if (k === "link") linkBox();
    if (k === "view") { S.view = b.getAttribute("data-v"); mount(S.ctx); }
    if (k === "sort") {
      var todo = S.data.items.filter(function (x) { return !x.theme; });
      b.disabled = true; b.textContent = "Sorting…";
      var chunks = []; for (var i = 0; i < todo.length; i += 8) chunks.push(todo.slice(i, i + 8));
      chunks.reduce(function (p, c) { return p.then(function () { return classify(c); }); }, Promise.resolve()).then(function () { toast("Sorted."); });
    }
    if (k === "open") openItem(b.getAttribute("data-id"));
    if (k === "zip") zip(groups()[+b.getAttribute("data-g")]);
  }
  function zip(gr) {
    var go = function () {
      toast("Preparing " + gr.items.length + " JPGs…");
      var z = new window.JSZip(), used = {};
      Promise.all(gr.items.map(function (it) {
        return full(it).then(function (u) { return fetch(u); }).then(function (r) { return r.blob(); }).then(function (bl) {
          var n = fileName(it); while (used[n]) n = n.replace(/\.jpg$/, "-2.jpg"); used[n] = 1; z.file(n, bl);
        }).catch(function () {});
      })).then(function () { return z.generateAsync({ type: "blob" }); }).then(function (bl) {
        download(URL.createObjectURL(bl), (gr.name || "inspiration").replace(/[\\/:*?"<>|]+/g, " ") + ".zip");
      });
    };
    if (window.JSZip) return go();
    var s = document.createElement("script"); s.src = ((S.ctx && S.ctx.root) || "../") + "assets/js/vendor/jszip.min.js"; s.onload = go; document.head.appendChild(s);
  }
  function openItem(id) {
    var it = S.data.items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    var ts = themes();
    var wrap = document.createElement("div");
    wrap.className = "ed-sheet in-sheet"; wrap.setAttribute("role", "dialog");
    wrap.innerHTML = '<div class="ed-panel in-panel"><header class="ed-head"><h2>' + esc(it.title || "Inspiration") + '</h2><button type="button" class="ed-x" aria-label="Close">×</button></header>' +
      '<div class="ed-body"><div class="in-big" style="background:' + esc(it.color) + '"><img alt="" src="' + (S.urls[it.file] || S.urls[it.thumb] || "") + '"></div>' +
      '<div class="ed-row2"><label class="ed-field"><span class="ed-label">Theme</span><input class="ed-input" data-f="theme" list="in-themes" value="' + esc(it.theme) + '"><datalist id="in-themes">' + ts.map(function (t) { return '<option value="' + esc(t) + '">'; }).join("") + "</datalist></label>" +
      '<label class="ed-field"><span class="ed-label">Title</span><input class="ed-input" data-f="title" value="' + esc(it.title) + '"></label></div>' +
      '<label class="ed-field"><span class="ed-label">Tags</span><input class="ed-input" data-f="tags" value="' + esc((it.tags || []).join(", ")) + '"></label>' +
      '<p class="j-hint"><i class="in-sw" style="background:' + esc(it.color) + '"></i>' + esc(it.family || "") + " · " + esc(it.source || "") + (it.link ? ' · <a href="' + esc(it.link) + '" target="_blank" rel="noopener">Open the original ↗</a>' : "") + " · " + new Date(it.at).toLocaleDateString() + "</p></div>" +
      '<footer class="ed-foot"><span class="ed-status"></span><span class="ed-actions"><button type="button" class="pill danger" data-x="del">Delete</button><button type="button" class="pill solid" data-x="dl">Download JPG</button></span></footer></div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add("lb-open");
    full(it).then(function (u) { var im = $(".in-big img", wrap); if (im) im.src = u; }).catch(function () {});
    var close = function () { wrap.remove(); if (!document.querySelector(".ed-sheet")) document.documentElement.classList.remove("lb-open"); render(); };
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap || e.target.classList.contains("ed-x")) return close();
      var x = e.target.closest("[data-x]"); if (!x) return;
      if (x.getAttribute("data-x") === "dl") full(it).then(function (u) { download(u, fileName(it)); });
      if (x.getAttribute("data-x") === "del") {
        if (!window.confirm("Delete this picture from your board?")) return;
        S.data.items = S.data.items.filter(function (y) { return y !== it; }); save();
        priv().remove(it.file).catch(function () {}); priv().remove(it.thumb).catch(function () {});
        close();
      }
    });
    wrap.addEventListener("input", function (e) {
      var f = e.target.getAttribute("data-f"); if (!f) return;
      if (f === "tags") it.tags = e.target.value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
      else it[f] = e.target.value.trim();
      if (f === "theme") it.themeByMe = true;
      save();
    });
  }

  window.AlyxInspo = { mount: mount, _S: S, _colour: colour };
})();
