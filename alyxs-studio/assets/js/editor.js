/* Alyx's Studio — edit on the page.
   Only loads for the owner (alyxsstudio.com/?me). Writes straight to the GitHub repository
   with the same sign-in as /admin; GitHub then publishes the site in about a minute. */
(function () {
  "use strict";
  var REPO = "alyxsstudio/alyxsstudio";   // owner/repository on GitHub
  var BRANCH = "main";
  var BASE = "alyxs-studio/";             // the website's folder inside the repository
  var API = "https://api.github.com";
  var CTX = {};

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function nowLocal() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function stamp() { var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }
  function slugify(s) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []; }
  var toastEl;
  function toast(msg, keep) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(toast.t);
    if (!keep) toast.t = setTimeout(function () { toastEl.hidden = true; }, 4200);
  }

  /* ---------- GitHub ---------- */
  function token() {
    try {
      var u = JSON.parse(localStorage.getItem("sveltia-cms.user") || "null");
      if (u && u.token) return u.token;
    } catch (e) {}
    try { return localStorage.getItem("alyx-gh-token") || ""; } catch (e) { return ""; }
  }
  function gh(path, opts) {
    opts = opts || {};
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      if (r.status === 404 && opts.allow404) return null;
      if (!r.ok) return r.text().then(function (t) { var e = new Error(r.status + " " + t.slice(0, 200)); e.status = r.status; throw e; });
      return r.status === 204 ? null : r.json();
    });
  }
  function b64FromText(text) {
    var bytes = new TextEncoder().encode(text), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function textFromB64(b64) {
    var bin = atob(String(b64).replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function b64FromBlob(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function readJSON(path) {
    return gh("/repos/" + REPO + "/contents/" + encodeURI(path) + "?ref=" + BRANCH, { allow404: true }).then(function (j) {
      return j ? JSON.parse(textFromB64(j.content)) : null;
    });
  }
  /* One commit with every changed file: text, pictures and audio together. */
  function remember(files) {
    window.AlyxUploads = window.AlyxUploads || {};
    (files || []).forEach(function (f) { if (f.blob) try { window.AlyxUploads[f.path.slice(BASE.length - 1)] = URL.createObjectURL(f.blob); } catch (e) {} });
  }
  function commit(files, deletes, message, retry) {
    if (!retry) remember(files);
    var ref, base;
    return gh("/repos/" + REPO + "/git/ref/heads/" + BRANCH).then(function (r) {
      ref = r.object.sha;
      return gh("/repos/" + REPO + "/git/commits/" + ref);
    }).then(function (c) {
      base = c.tree.sha;
      return Promise.all(files.map(function (f) {
        var content = f.blob ? b64FromBlob(f.blob) : Promise.resolve(b64FromText(f.text));
        return content.then(function (b64) {
          return gh("/repos/" + REPO + "/git/blobs", { method: "POST", body: { content: b64, encoding: "base64" } });
        }).then(function (blob) { return { path: f.path, mode: "100644", type: "blob", sha: blob.sha }; });
      }));
    }).then(function (tree) {
      (deletes || []).forEach(function (p) { tree.push({ path: p, mode: "100644", type: "blob", sha: null }); });
      return gh("/repos/" + REPO + "/git/trees", { method: "POST", body: { base_tree: base, tree: tree } });
    }).then(function (t) {
      return gh("/repos/" + REPO + "/git/commits", { method: "POST", body: { message: message, tree: t.sha, parents: [ref] } });
    }).then(function (c) {
      return gh("/repos/" + REPO + "/git/refs/heads/" + BRANCH, { method: "PATCH", body: { sha: c.sha } });
    }).catch(function (e) {
      // someone saved at the same moment (for example in /admin): try once more on top of it
      if (!retry && (e.status === 422 || e.status === 409)) return commit(files, deletes, message, true);
      throw e;
    });
  }
  /* ---------- private drafts in your GitHub account ----------
     Unfinished writing is copied to a private repository (alyxsstudio/studio-drafts) that only you can see,
     so a draft started on the laptop opens on the phone. Nothing there is published. */
  var DREPO = REPO.split("/")[0] + "/studio-drafts";
  var cloud = { ok: null, ready: null, sha: {}, timers: {} };
  function cloudReady() {
    if (cloud.ready) return cloud.ready;
    cloud.ready = gh("/repos/" + DREPO, { allow404: true }).then(function (r) {
      if (r && r.private) return true;
      if (r && !r.private) return false; // never keep drafts somewhere public
      return gh("/user/repos", { method: "POST", body: { name: DREPO.split("/")[1], private: true, auto_init: true, description: "Private drafts for the website. Not published." } })
        .then(function () { return new Promise(function (res) { setTimeout(function () { res(true); }, 1500); }); });
    }).catch(function () { return false; }).then(function (ok) { cloud.ok = ok; return ok; });
    return cloud.ready;
  }
  function draftPath(key) { return "/repos/" + DREPO + "/contents/drafts/" + encodeURIComponent(String(key).replace(/[^\w.-]+/g, "_")) + ".json"; }
  function cloudGet(key) {
    if (!token()) return Promise.resolve(null);
    return cloudReady().then(function (ok) {
      if (!ok) return null;
      return gh(draftPath(key), { allow404: true }).then(function (j) {
        if (!j) { cloud.sha[key] = null; return null; }
        cloud.sha[key] = j.sha;
        try { return JSON.parse(textFromB64(j.content)); } catch (e) { return null; }
      });
    }).catch(function () { return null; });
  }
  function cloudPut(key, data) {
    if (!token()) return;
    clearTimeout(cloud.timers[key]);
    cloud.timers[key] = setTimeout(function () {
      cloudReady().then(function (ok) {
        if (!ok) return;
        var send = function (retry) {
          return gh(draftPath(key), { method: "PUT", body: { message: "Draft", content: b64FromText(JSON.stringify(data)), sha: cloud.sha[key] || undefined } })
            .then(function (r) { cloud.sha[key] = r && r.content && r.content.sha; })
            .catch(function (e) {
              if (retry || (e.status !== 409 && e.status !== 422)) return;
              return gh(draftPath(key), { allow404: true }).then(function (j) { cloud.sha[key] = j && j.sha; return send(true); });
            });
        };
        return send(false);
      });
    }, 2500);
  }
  function cloudDel(key) {
    clearTimeout(cloud.timers[key]);
    if (!token() || cloud.ok === false) return;
    cloudReady().then(function (ok) {
      if (!ok) return;
      var go = function (sha) { if (sha) return gh(draftPath(key), { method: "DELETE", body: { message: "Draft done", sha: sha } }).catch(function () {}); };
      if (cloud.sha[key]) return go(cloud.sha[key]);
      return gh(draftPath(key), { allow404: true }).then(function (j) { return j && go(j.sha); });
    }).then(function () { cloud.sha[key] = null; });
  }

  function explain(e) {
    if (e && (e.status === 401 || e.status === 403)) return "Your sign-in has expired. Open /admin, sign in again, then try once more.";
    if (e && e.status === 404) return "The repository wasn't found with this sign-in. Check that /admin works.";
    return "Couldn't save just now. Your text is kept on this device; try again in a moment.";
  }

  /* ---------- pictures and sound ---------- */
  // Pictures are resized (longest side 2880px) and saved as WebP, like uploads in /admin.
  function prepareImage(file) {
    return new Promise(function (res) {
      if (!/^image\//.test(file.type) || /svg|gif/.test(file.type)) return res({ blob: file, ext: (file.name.split(".").pop() || "png").toLowerCase() });
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var max = 2880, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === "image/webp") return res({ blob: b, ext: "webp" });
          c.toBlob(function (j) { res({ blob: j || file, ext: j ? "jpg" : "png" }); }, "image/jpeg", 0.88);
        }, "image/webp", 0.86);
      };
      im.onerror = function () { URL.revokeObjectURL(url); res({ blob: file, ext: (file.name.split(".").pop() || "jpg").toLowerCase() }); };
      im.src = url;
    });
  }
  function audioExt(blob) {
    var t = blob.type || "";
    if (/mp4|m4a|aac/.test(t)) return "m4a";
    if (/mpeg|mp3/.test(t)) return "mp3";
    if (/ogg/.test(t)) return "ogg";
    if (/wav/.test(t)) return "wav";
    return "webm";
  }
  // Turns the form's pictures/audio into files to upload and paths to save in the entry.
  function collectMedia(slot, prefix) {
    var files = [], paths = [];
    return (slot.items || []).reduce(function (p, it, i) {
      return p.then(function () {
        if (typeof it === "string") { paths.push(it); return; }
        return prepareImage(it.file).then(function (r) {
          var name = prefix + "-" + (i + 1) + "-" + Math.random().toString(36).slice(2, 6) + "." + r.ext;
          files.push({ path: BASE + "assets/uploads/" + name, blob: r.blob });
          paths.push("/assets/uploads/" + name);
        });
      });
    }, Promise.resolve()).then(function () { return { files: files, paths: paths }; });
  }

  /* ---------- form pieces ---------- */
  function imagePicker(existing, label) {
    var slot = { items: list(existing).slice() };
    var el = document.createElement("div");
    el.className = "ed-field";
    el.innerHTML = '<span class="ed-label">' + esc(label || "Pictures") + '</span><div class="ed-thumbs"></div>' +
      '<div class="ed-drop"><label class="pill">+ Add pictures<input type="file" accept="image/*" multiple hidden></label>' +
      '<span class="ed-hint">or drop / paste them here</span></div>';
    var thumbs = $(".ed-thumbs", el);
    function render() {
      thumbs.innerHTML = slot.items.map(function (it, i) {
        var src = typeof it === "string" ? CTX.asset(it) : it.preview;
        return '<figure class="ed-thumb"><img src="' + esc(src) + '" alt="">' +
          '<span class="ed-thumb-tools">' +
          (i > 0 ? '<button type="button" data-move="' + i + '" aria-label="Move earlier">←</button>' : "") +
          '<button type="button" data-del="' + i + '" aria-label="Remove">×</button></span></figure>';
      }).join("");
    }
    function add(files) {
      Array.prototype.forEach.call(files || [], function (f) {
        if (/^image\//.test(f.type)) slot.items.push({ file: f, preview: URL.createObjectURL(f) });
      });
      render();
    }
    el.addEventListener("click", function (e) {
      var d = e.target.getAttribute("data-del"), m = e.target.getAttribute("data-move");
      if (d != null) { slot.items.splice(+d, 1); render(); }
      if (m != null) { var i = +m, t = slot.items[i]; slot.items[i] = slot.items[i - 1]; slot.items[i - 1] = t; render(); }
    });
    $("input", el).addEventListener("change", function (e) { add(e.target.files); e.target.value = ""; });
    el.addEventListener("dragover", function (e) { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragleave", function () { el.classList.remove("drag"); });
    el.addEventListener("drop", function (e) { e.preventDefault(); el.classList.remove("drag"); add(e.dataTransfer.files); });
    slot.onPaste = function (e) {
      var files = Array.prototype.map.call((e.clipboardData && e.clipboardData.items) || [], function (x) { return x.kind === "file" ? x.getAsFile() : null; }).filter(Boolean);
      if (files.length) { e.preventDefault(); add(files); }
    };
    render();
    slot.el = el;
    return slot;
  }
  function audioPicker(existing) {
    var slot = { path: existing || "", blob: null };
    var el = document.createElement("div");
    el.className = "ed-field";
    el.innerHTML = '<span class="ed-label">Voice / audio</span><div class="ed-audio"></div>' +
      '<div class="ed-row"><button type="button" class="pill" data-rec>● Record</button>' +
      '<label class="pill">Upload audio<input type="file" accept="audio/*" hidden></label>' +
      '<button type="button" class="pill" data-clear>Remove</button></div>';
    var box = $(".ed-audio", el), recBtn = $("[data-rec]", el), rec = null, chunks = [];
    function render() {
      var src = slot.blob ? URL.createObjectURL(slot.blob) : slot.path ? CTX.asset(slot.path) : "";
      box.innerHTML = src ? '<audio controls src="' + esc(src) + '"></audio>' : '<span class="ed-hint">No audio</span>';
      $("[data-clear]", el).hidden = !src;
    }
    recBtn.addEventListener("click", function () {
      if (rec && rec.state === "recording") { rec.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) { toast("This browser can't record. Upload an audio file instead."); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        chunks = [];
        rec = new MediaRecorder(stream);
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          slot.blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          recBtn.textContent = "● Record"; recBtn.classList.remove("rec");
          render();
        };
        rec.start();
        recBtn.textContent = "■ Stop"; recBtn.classList.add("rec");
      }).catch(function () { toast("Microphone not allowed. You can upload an audio file instead."); });
    });
    $("input", el).addEventListener("change", function (e) { if (e.target.files[0]) { slot.blob = e.target.files[0]; render(); } });
    $("[data-clear]", el).addEventListener("click", function () { slot.blob = null; slot.path = ""; render(); });
    render();
    slot.el = el;
    slot.collect = function (prefix) {
      if (!slot.blob) return Promise.resolve({ files: [], path: slot.path });
      var name = prefix + "-audio-" + Math.random().toString(36).slice(2, 6) + "." + audioExt(slot.blob);
      return Promise.resolve({ files: [{ path: BASE + "assets/uploads/" + name, blob: slot.blob }], path: "/assets/uploads/" + name });
    };
    return slot;
  }
  function field(label, html) { return '<label class="ed-field"><span class="ed-label">' + esc(label) + "</span>" + html + "</label>"; }
  function input(name, value, type, extra) { return '<input class="ed-input" name="' + name + '" type="' + (type || "text") + '" value="' + esc(value || "") + '"' + (extra || "") + ">"; }
  function select(name, value, options) {
    return '<select class="ed-input" name="' + name + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select>";
  }

  /* ---------- the sheet ---------- */
  function sheet(titleText, bodyHTML) {
    close();
    var wrap = document.createElement("div");
    wrap.className = "ed-sheet";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML = '<form class="ed-panel" novalidate><header class="ed-head"><h2>' + esc(titleText) + '</h2>' +
      '<button type="button" class="ed-x" data-close aria-label="Close">×</button></header><div class="ed-body">' + bodyHTML + '</div>' +
      '<footer class="ed-foot"><span class="ed-status" aria-live="polite"></span><span class="ed-actions"></span></footer></form>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add("lb-open");
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.hasAttribute("data-close")) close(); });
    return wrap;
  }
  function close() {
    var old = $(".ed-sheet") || $(".ed-write");
    if (old) old.remove();
    document.documentElement.classList.remove("lb-open");
  }
  function actions(wrap, buttons) {
    var box = $(".ed-actions", wrap);
    buttons.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = b.submit ? "submit" : "button";
      btn.className = "pill" + (b.solid ? " solid" : "") + (b.danger ? " danger" : "");
      btn.textContent = b.label;
      if (!b.submit) btn.addEventListener("click", b.run);
      box.appendChild(btn);
    });
  }
  function busy(wrap, on, msg) {
    wrap.querySelectorAll("button, input, select, textarea").forEach(function (x) { x.disabled = on; });
    $(".ed-status", wrap).textContent = msg || "";
  }
  /* Every form keeps what you type on this device until it is saved, like a draft in Google Docs.
     Close it, reload, come back tomorrow: it opens where you left off. */
  function autosave(wrap, key) {
    var f = $("form", wrap), k = "alyx-form:" + key;
    wrap.draftKey = k; wrap.cloudKey = key;
    var fields = function () { return Array.prototype.filter.call(f.elements, function (el) { return el.name && el.type !== "file" && el.type !== "button"; }); };
    var read = function () { var o = {}; fields().forEach(function (el) { o[el.name] = el.type === "checkbox" ? el.checked : el.value; }); return o; };
    var write = function (o) { fields().forEach(function (el) { if (!(el.name in o)) return; if (el.type === "checkbox") el.checked = !!o[el.name]; else el.value = o[el.name]; el.dispatchEvent(new Event("input", { bubbles: true })); }); };
    var original = read(), saved = null, shownAt = 0;
    try { saved = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) {}
    var restore = function (d, where) {
      if (!d || !d.v || JSON.stringify(d.v) === JSON.stringify(original) || d.t <= shownAt) return;
      shownAt = d.t;
      write(d.v);
      var old = $(".ed-restored", wrap); if (old) old.remove();
      var note = document.createElement("p");
      note.className = "ed-restored";
      note.innerHTML = "Restored your draft" + (where ? " " + where : "") + " (" + esc(new Date(d.t).toLocaleString()) + ") · <button type=\"button\" class=\"linkish\">Start over</button>";
      $(".ed-body", wrap).insertBefore(note, $(".ed-body", wrap).firstChild);
      $("button", note).addEventListener("click", function () { write(original); try { localStorage.removeItem(k); } catch (e) {} cloudDel(key); note.remove(); shownAt = Infinity; });
    };
    restore(saved, "");
    // a newer draft from another device? (only if nothing has been typed here yet)
    var opened = JSON.stringify(read());
    cloudGet(key).then(function (c) {
      if (!c || !document.body.contains(wrap) || JSON.stringify(read()) !== opened) return;
      if (!saved || c.t > saved.t) restore(c, "from your other device");
    });
    var timer;
    var keep = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var v = read();
        var same = JSON.stringify(v) === JSON.stringify(original), d = { v: v, t: Date.now() };
        try { if (same) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(d)); } catch (e) {}
        if (same) cloudDel(key); else cloudPut(key, d);
        var st = $(".ed-status", wrap);
        if (st && !st.textContent.match(/Saving|Couldn/)) st.textContent = same ? "" : "Draft saved";
      }, 500);
    };
    f.addEventListener("input", keep); f.addEventListener("change", keep);
  }
  function dropDraft(wrap) {
    if (wrap && wrap.draftKey) try { localStorage.removeItem(wrap.draftKey); } catch (e) {}
    if (wrap && wrap.cloudKey) cloudDel(wrap.cloudKey);
  }
  function saveFlow(wrap, run) {
    busy(wrap, true, "Saving…");
    return run().then(function () {
      dropDraft(wrap);
      close();
      toast("Saved. The site updates in about a minute; Chinese gets its English version then too.");
    }).catch(function (e) {
      console.error(e);
      busy(wrap, false, explain(e));
    });
  }

  /* ---------- sign in ---------- */
  function signIn(next, ctx, msg) {
    if (ctx) CTX = ctx;
    var wrap = sheet("Sign in to edit",
      (msg ? '<p class="ed-restored">' + esc(msg) + "</p>" : "") +
      '<p class="ed-text">Only you can edit this site. Editing uses the same sign-in as the editor: open <a href="' + CTX.root + 'admin/" target="_blank">/admin</a> in this browser, sign in there once, then come back and press Continue.</p>' +
      '<details class="ed-more"><summary>Or paste a GitHub token</summary>' + field("Token", input("tok", "", "password", ' autocomplete="off"')) + "</details>");
    actions(wrap, [{ label: "Just look around", run: function () { try { localStorage.removeItem("alyx-me"); } catch (e) {} close(); location.href = location.pathname + location.hash; } },
                   { label: "Continue", solid: true, run: function () {
      var t = $("[name=tok]", wrap).value.trim();
      if (t) try { localStorage.setItem("alyx-gh-token", t); } catch (e) {}
      if (!token()) { $(".ed-status", wrap).textContent = "Not signed in yet."; return; }
      close(); next();
    } }]);
  }

  /* ---------- Daily ---------- */
  function editDaily(id, day) {
    var path = id ? BASE + "content/daily/" + id + ".json" : "";
    (id ? readJSON(path) : Promise.resolve(null)).then(function (raw) {
      var when = day ? day + "T" + nowLocal().slice(11) : nowLocal();
      var p = raw || { date: when, text: "", images: [], audio: "", link: { url: "", title: "", quote: "" }, tags: [] };
      var wrap = sheet(id ? "Edit post" : "New post",
        field("When", input("date", p.date, "datetime-local")) +
        '<label class="ed-field"><span class="ed-label">Text</span><textarea class="ed-input ed-text-area" name="text" rows="6" placeholder="写点什么… Write in Chinese or English.">' + esc(p.text) + "</textarea></label>" +
        '<div data-slot="images"></div><div data-slot="audio"></div>' +
        '<details class="ed-more"' + (p.link && p.link.url ? " open" : "") + '><summary>Repost / link</summary>' +
          field("Link (a YouTube, TikTok, Instagram, Spotify… link shows as a player)", input("lurl", p.link && p.link.url, "url")) + '<p class="ed-found" data-lfound></p><div class="ed-preview" data-lprev></div>' +
          field("Source name", input("ltitle", p.link && p.link.title)) +
          '<label class="ed-field"><span class="ed-label">Quote</span><textarea class="ed-input" name="lquote" rows="2">' + esc(p.link && p.link.quote) + "</textarea></label></details>" +
        field("Tags (comma separated)", input("tags", list(p.tags).join(", "))) +
        '<label class="ed-check"><input type="checkbox" name="hidden"' + (p.hidden ? " checked" : "") + "> Keep as a draft (not shown on the site)</label>");
      var imgs = imagePicker(p.images), aud = audioPicker(p.audio);
      $("[data-slot=images]", wrap).appendChild(imgs.el);
      $("[data-slot=audio]", wrap).appendChild(aud.el);
      wrap.addEventListener("paste", function (e) { if (e.target.name !== "lurl") imgs.onPaste(e); });
      autoGrow($("textarea[name=text]", wrap));
      var f = $("form", wrap);
      var lprev = function () {
        var u = f.lurl.value.trim(), box = $("[data-lprev]", wrap), note = $("[data-lfound]", wrap);
        if (!u || !window.AlyxMedia || !window.AlyxMedia.looksLikeLink(u) || !CTX.mediaInfo) { box.innerHTML = ""; note.textContent = ""; return; }
        var info = CTX.mediaInfo({ url: u, meta: p.link && p.link.url === u ? p.link.meta : null });
        note.textContent = info.type === "card" ? "Shows as a link card" : (info.platform || "") + " · shows as a player";
        box.innerHTML = info.type === "card" ? "" : CTX.player(info, { auto: false, queue: "editor" });
      };
      f.lurl.addEventListener("input", lprev); lprev();
      autosave(wrap, "daily:" + (id || "new"));
      var save = function () {
        return saveFlow(wrap, function () {
          var date = f.date.value || nowLocal();
          var newId = id || (date.replace(/[-:]/g, "").replace("T", "-").replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") + new Date().getSeconds().toString().padStart(2, "0"));
          return Promise.all([imgs.items ? collectMedia(imgs, "daily-" + newId) : null, aud.collect("daily-" + newId)]).then(function (r) {
            var out = {
              date: date, text: f.text.value, images: r[0].paths, audio: r[1].path,
              link: { url: f.lurl.value.trim(), title: f.ltitle.value.trim(), quote: f.lquote.value },
              tags: f.tags.value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean)
            };
            if (f.hidden.checked) out.hidden = true;
            var p2 = BASE + "content/daily/" + newId + ".json";
            return commit(r[0].files.concat(r[1].files).concat([{ path: p2, text: JSON.stringify(out, null, 2) + "\n" }]), [],
              (id ? "Update" : "Add") + " daily “" + newId + "”").then(function () {
              CTX.onSaved("daily", Object.assign({ id: newId }, out), !!out.hidden);
            });
          });
        });
      };
      f.addEventListener("submit", function (e) { e.preventDefault(); save(); });
      var btns = [{ label: "Cancel", run: close }, { label: id ? "Save" : "Post", solid: true, submit: true }];
      if (id) btns.unshift({ label: "Delete", danger: true, run: function () { remove(wrap, path, "daily", id); } });
      actions(wrap, btns);
      $("textarea[name=text]", wrap).focus();
    }).catch(function (e) { toast(explain(e)); });
  }
  function remove(wrap, path, kind, id, extra) {
    if (!window.confirm("Delete this for good? (Pictures already uploaded stay in the library.)")) return;
    saveFlow(wrap, function () {
      return commit([], [path], "Delete " + kind + " “" + id + "”").then(function () { CTX.onSaved(kind, Object.assign({ id: id }, extra || {}), true); });
    });
  }
  function autoGrow(t) {
    if (!t) return;
    var fit = function () { t.style.height = "auto"; t.style.height = Math.min(window.innerHeight * 0.5, t.scrollHeight + 2) + "px"; };
    t.addEventListener("input", fit); setTimeout(fit, 0);
  }

  /* ---------- Ongoing: entries (writing mode for text collections) ---------- */
  function nextNumber(pid) {
    var P = CTX.D.project;
    if (!P || !P.project || P.project.id !== pid) return "";
    var nums = (P.entries || []).map(function (x) { return +x.number; }).filter(function (n) { return !isNaN(n) && n > 0; });
    return nums.length ? Math.max.apply(null, nums) + 1 : (P.entries || []).length + 1;
  }
  function projectsList() { return ((CTX.D.ongoing || {}).projects || []).map(function (p) { return [p.id, p.title_zh || p.title]; }); }
  function projectById(pid) { return ((CTX.D.ongoing || {}).projects || []).filter(function (p) { return p.id === pid; })[0] || (CTX.project && CTX.project.id === pid ? CTX.project : null); }
  function editEntry(id, pid) {
    var path = id ? BASE + "content/entries/" + id + ".json" : "";
    (id ? readJSON(path) : Promise.resolve(null)).then(function (raw) {
      var e = raw || { project: pid || (projectsList()[0] || [""])[0], date: nowLocal(), title: "", number: nextNumber(pid), images: [], text: "", audio: "" };
      var proj = projectById(e.project) || {};
      if ((proj.kind || "mixed") === "text") return writingMode(id, e, proj);
      var wrap = sheet(id ? "Edit entry" : "New entry",
        field("Collection", select("project", e.project, projectsList())) +
        field("Title / word", input("title", e.title)) +
        '<div class="ed-row2">' + field("Number (optional)", input("number", e.number, "number")) + field("When", input("date", e.date, "datetime-local")) + "</div>" +
        '<div data-slot="images"></div>' +
        '<label class="ed-field"><span class="ed-label">Text</span><textarea class="ed-input" name="text" rows="4">' + esc(e.text) + "</textarea></label>" +
        '<div data-slot="audio"></div>');
      var imgs = imagePicker(e.images), aud = audioPicker(e.audio);
      $("[data-slot=images]", wrap).appendChild(imgs.el);
      $("[data-slot=audio]", wrap).appendChild(aud.el);
      wrap.addEventListener("paste", imgs.onPaste);
      autoGrow($("textarea[name=text]", wrap));
      autosave(wrap, "entry:" + (id || "new:" + (pid || "")));
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          var project = f.project.value, newId = id || project + "-" + stamp();
          return Promise.all([collectMedia(imgs, newId), aud.collect(newId)]).then(function (r) {
            var out = { project: project, date: f.date.value || nowLocal(), title: f.title.value.trim(), number: f.number.value === "" ? "" : +f.number.value,
                        images: r[0].paths, text: f.text.value, audio: r[1].path };
            return commit(r[0].files.concat(r[1].files).concat([{ path: BASE + "content/entries/" + newId + ".json", text: JSON.stringify(out, null, 2) + "\n" }]), [],
              (id ? "Update" : "Add") + " entry “" + newId + "”").then(function () { CTX.onSaved("entry", Object.assign({ id: newId }, out)); });
          });
        });
      });
      var btns = [{ label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }];
      if (id) btns.unshift({ label: "Delete", danger: true, run: function () { remove(wrap, path, "entry", id, { project: e.project }); } });
      actions(wrap, btns);
      wrap.addEventListener("keydown", function (k) { if ((k.metaKey || k.ctrlKey) && k.key === "s") { k.preventDefault(); f.requestSubmit(); } });
      $("[name=title]", wrap).focus();
    }).catch(function (err) { toast(explain(err)); });
  }

  /* A quiet, full-screen place to write a chapter: autosaves on this device, Publish sends it to the site. */
  function writingMode(id, e, proj) {
    close();
    var key = "alyx-draft:" + (id || "new:" + e.project);
    var local = null;
    try { local = JSON.parse(localStorage.getItem(key) || "null"); } catch (x) {}
    var w = document.createElement("div");
    w.className = "ed-write";
    w.innerHTML =
      '<header class="ew-bar"><button type="button" class="pill" data-close>← Close</button>' +
        '<span class="ew-where">' + esc(proj.title_zh || proj.title || e.project) + '</span>' +
        '<span class="ew-status" aria-live="polite"></span>' +
        (id ? '<button type="button" class="pill danger" data-del>Delete</button>' : "") +
        '<button type="button" class="pill solid" data-pub>Publish</button></header>' +
      '<div class="ew-tools" role="toolbar">' +
        '<button type="button" data-cmd="bold" title="Bold (⌘B)"><b>B</b></button>' +
        '<button type="button" data-cmd="italic" title="Italic (⌘I)"><i>I</i></button>' +
        '<button type="button" data-cmd="h2" title="Heading">H</button>' +
        '<button type="button" data-cmd="quote" title="Quote">❝</button>' +
        '<button type="button" data-cmd="ul" title="List">•</button>' +
        '<button type="button" data-cmd="hr" title="Scene break">⁂</button>' +
        '<span class="ew-count"></span></div>' +
      '<div class="ew-page">' +
        '<div class="ew-meta"><input class="ew-num" name="number" type="number" placeholder="No." value="' + esc(e.number) + '">' +
        '<input class="ew-date" name="date" type="datetime-local" value="' + esc(e.date) + '"></div>' +
        '<input class="ew-title" name="title" placeholder="Chapter title 章节名" value="' + esc(e.title) + '">' +
        '<div class="ew-body" contenteditable="true" spellcheck="true" data-placeholder="开始写… Start writing."></div>' +
      "</div>";
    document.body.appendChild(w);
    document.documentElement.classList.add("lb-open");
    var body = $(".ew-body", w), status = $(".ew-status", w);
    var startText = local && local.text != null && local.saved > Date.now() - 1000 * 60 * 60 * 24 * 30 ? local : e;
    body.innerHTML = CTX.md(startText.text || "");
    if (startText !== e) { $(".ew-title", w).value = local.title || ""; status.textContent = "Restored your unpublished draft"; }
    var ckey = "write:" + (id || "new:" + e.project), baseText = toMarkdown(body), baseTitle = $(".ew-title", w).value;
    var publishedText = e.text || "", publishedTitle = e.title || "";
    // a newer draft written on another device?
    cloudGet(ckey).then(function (c) {
      if (!c || !document.body.contains(w)) return;
      if (toMarkdown(body) !== baseText || $(".ew-title", w).value !== baseTitle) return; // already typing here
      if (local && local.saved >= c.saved) return;
      body.innerHTML = CTX.md(c.text || ""); $(".ew-title", w).value = c.title || "";
      status.textContent = "Restored your draft from your other device";
      try { localStorage.setItem(key, JSON.stringify(c)); } catch (x) {}
      count();
    });
    var count = function () { var t = body.innerText.replace(/\s/g, ""); $(".ew-count", w).textContent = t.length + " characters"; };
    var keep = function () {
      var d = { text: toMarkdown(body), title: $(".ew-title", w).value, saved: Date.now() };
      if (d.text === publishedText && d.title === publishedTitle) { try { localStorage.removeItem(key); } catch (x) {} return; }
      try { localStorage.setItem(key, JSON.stringify(d)); } catch (x) {}
      cloudPut(ckey, d);
      status.textContent = "Draft saved · " + new Date().toTimeString().slice(0, 5);
    };
    var timer;
    var changed = function () { count(); clearTimeout(timer); timer = setTimeout(keep, 1200); status.textContent = "Typing…"; };
    body.addEventListener("input", changed);
    $(".ew-title", w).addEventListener("input", changed);
    count();
    w.querySelector(".ew-tools").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cmd]"); if (!b) return;
      var c = b.getAttribute("data-cmd");
      body.focus();
      if (c === "bold" || c === "italic") document.execCommand(c);
      if (c === "h2") document.execCommand("formatBlock", false, document.queryCommandValue("formatBlock") === "h2" ? "p" : "h2");
      if (c === "quote") document.execCommand("formatBlock", false, document.queryCommandValue("formatBlock") === "blockquote" ? "p" : "blockquote");
      if (c === "ul") document.execCommand("insertUnorderedList");
      if (c === "hr") document.execCommand("insertHorizontalRule");
      changed();
    });
    // paste as plain text, so text from Word / Docs doesn't bring its styling along
    body.addEventListener("paste", function (ev) {
      var t = ev.clipboardData && ev.clipboardData.getData("text/plain");
      if (t == null) return;
      ev.preventDefault();
      document.execCommand("insertHTML", false, t.split(/\n{2,}|\r\n\r\n/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join(""));
    });
    var closeIt = function () { clearTimeout(timer); keep(); close(); };
    $("[data-close]", w).addEventListener("click", closeIt);
    var publish = function () {
      clearTimeout(timer); keep();
      var btn = $("[data-pub]", w); btn.disabled = true; status.textContent = "Publishing…";
      var newId = id || e.project + "-" + stamp();
      var out = { project: e.project, date: $(".ew-date", w).value || nowLocal(), title: $(".ew-title", w).value.trim(),
                  number: $(".ew-num", w).value === "" ? "" : +$(".ew-num", w).value, images: list(e.images), text: toMarkdown(body), audio: e.audio || "" };
      commit([{ path: BASE + "content/entries/" + newId + ".json", text: JSON.stringify(out, null, 2) + "\n" }], [], (id ? "Update" : "Add") + " chapter “" + newId + "”")
        .then(function () {
          try { localStorage.removeItem(key); } catch (x) {}
          cloudDel(ckey);
          id = newId; key = "alyx-draft:" + id; ckey = "write:" + id;
          publishedText = out.text; publishedTitle = out.title;
          status.textContent = "Published · the site updates in about a minute";
          btn.disabled = false;
          CTX.onSaved("entry", Object.assign({ id: newId }, out));
        })
        .catch(function (err) { console.error(err); status.textContent = explain(err); btn.disabled = false; });
    };
    $("[data-pub]", w).addEventListener("click", publish);
    if (id) $("[data-del]", w).addEventListener("click", function () {
      if (!window.confirm("Delete this chapter for good?")) return;
      commit([], [BASE + "content/entries/" + id + ".json"], "Delete chapter “" + id + "”").then(function () {
        try { localStorage.removeItem(key); } catch (x) {}
        cloudDel(ckey);
        CTX.onSaved("entry", { id: id, project: e.project }, true); close(); toast("Deleted.");
      }).catch(function (err) { status.textContent = explain(err); });
    });
    w.addEventListener("keydown", function (k) { if ((k.metaKey || k.ctrlKey) && k.key === "s") { k.preventDefault(); publish(); } });
    (e.title ? body : $(".ew-title", w)).focus();
  }
  /* The writing page → Markdown (what /admin and the site use) */
  // **bold** only works when the stars touch the words, so keep spaces outside
  function wrapMark(text, mark) {
    var m = String(text).match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : text;
  }
  function toMarkdown(root) {
    function inline(node) {
      return Array.prototype.map.call(node.childNodes, function (n) {
        if (n.nodeType === 3) return n.nodeValue.replace(/ /g, " ");
        if (n.nodeType !== 1) return "";
        var t = n.tagName.toLowerCase(), inner = inline(n);
        if (t === "b" || t === "strong") return wrapMark(inner, "**");
        if (t === "i" || t === "em") return wrapMark(inner, "*");
        if (t === "a") return "[" + inner + "](" + n.getAttribute("href") + ")";
        if (t === "br") return "\n";
        return inner;
      }).join("");
    }
    var out = [];
    Array.prototype.forEach.call(root.childNodes, function (n) {
      if (n.nodeType === 3) { if (n.nodeValue.trim()) out.push(n.nodeValue.trim()); return; }
      if (n.nodeType !== 1) return;
      var t = n.tagName.toLowerCase();
      if (t === "h1" || t === "h2" || t === "h3") out.push("## " + inline(n).trim());
      else if (t === "blockquote") out.push(inline(n).trim().split("\n").map(function (l) { return "> " + l; }).join("\n"));
      else if (t === "ul" || t === "ol") out.push(Array.prototype.map.call(n.children, function (li, i) { return (t === "ol" ? (i + 1) + ". " : "- ") + inline(li).trim(); }).join("\n"));
      else if (t === "hr") out.push("* * *");
      else { var s = inline(n).trim(); if (s) out.push(s); }
    });
    return out.join("\n\n");
  }

  /* ---------- Ongoing: a new collection ---------- */
  function editProject() {
    var wrap = sheet("New collection",
      field("Name", input("title", "")) +
      '<label class="ed-field"><span class="ed-label">One line about it</span><textarea class="ed-input" name="note" rows="2"></textarea></label>' +
      field("What's inside", select("kind", "mixed", [["text", "Mostly writing (novel, essays)"], ["image", "Mostly pictures (dictionary, image serial)"], ["mixed", "Both"]])) +
      field("Order", select("sort", "date-asc", [["date-asc", "Oldest first"], ["date-desc", "Newest first"], ["title", "A–Z by title"], ["number", "By number"]])) +
      field("Who can download it", select("download", "private", [["private", "Only me"], ["public", "Everyone"]])));
    autosave(wrap, "project:new");
    var f = $("form", wrap);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = f.title.value.trim();
      if (!t) { $(".ed-status", wrap).textContent = "Give it a name first."; return; }
      var taken = ((CTX.D.ongoing || {}).projects || []).map(function (p) { return p.id; });
      var pid = slugify(t) || "collection-" + stamp();
      while (taken.indexOf(pid) > -1) pid += "-2";
      saveFlow(wrap, function () {
        var out = { title: t, note: f.note.value, kind: f.kind.value, sort: f.sort.value, cover: "", status: "ongoing", download: f.download.value, date: nowLocal().slice(0, 10) };
        return commit([{ path: BASE + "content/projects/" + pid + ".json", text: JSON.stringify(out, null, 2) + "\n" }], [], "Add collection “" + pid + "”")
          .then(function () { CTX.onSaved("project", Object.assign({ id: pid }, out)); });
      });
    });
    actions(wrap, [{ label: "Cancel", run: close }, { label: "Create", solid: true, submit: true }]);
    $("[name=title]", wrap).focus();
  }

  /* ---------- Design sketches ---------- */
  function editDesign(id) {
    var path = id ? BASE + "content/design/" + id + ".json" : "";
    (id ? readJSON(path) : Promise.resolve(null)).then(function (raw) {
      var x = raw || { title: "", date: nowLocal().slice(0, 10), images: [], note: "", link: "" };
      var wrap = sheet(id ? "Edit sketch" : "New sketch",
        field("Name", input("title", x.title)) + field("Date", input("date", x.date, "date")) +
        '<div data-slot="images"></div>' +
        '<label class="ed-field"><span class="ed-label">One line about it</span><textarea class="ed-input" name="note" rows="2">' + esc(x.note) + "</textarea></label>" +
        field("Related link (optional)", input("link", x.link, "url")));
      var imgs = imagePicker(x.images, "Sketches");
      $("[data-slot=images]", wrap).appendChild(imgs.el);
      wrap.addEventListener("paste", imgs.onPaste);
      autosave(wrap, "design:" + (id || "new"));
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var t = f.title.value.trim();
        if (!t) { $(".ed-status", wrap).textContent = "Give it a name first."; return; }
        var did = id || (slugify(t) || "sketch") + "-" + stamp().slice(0, 8);
        saveFlow(wrap, function () {
          return collectMedia(imgs, "design-" + did).then(function (r) {
            var out = { title: t, date: f.date.value, images: r.paths, note: f.note.value, link: f.link.value.trim() };
            return commit(r.files.concat([{ path: BASE + "content/design/" + did + ".json", text: JSON.stringify(out, null, 2) + "\n" }]), [],
              (id ? "Update" : "Add") + " sketch “" + did + "”").then(function () { CTX.onSaved("design", Object.assign({ id: did }, out)); });
          });
        });
      });
      var btns = [{ label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }];
      if (id) btns.unshift({ label: "Delete", danger: true, run: function () { remove(wrap, path, "design", id); } });
      actions(wrap, btns);
    }).catch(function (err) { toast(explain(err)); });
  }

  /* ---------- Visual: add pictures to a series ---------- */
  function addVisual(seriesId) {
    var series = ((CTX.D.visual || {}).series || []);
    var opts = series.map(function (s) { return [s.id, s.title_zh || s.title]; }).concat([["__new", "+ New series…"]]);
    var wrap = sheet("Add pictures",
      field("Series", select("series", seriesId || (opts[0] || [""])[0], opts)) +
      '<div class="ed-new-series" hidden>' + field("New series name", input("newtitle", "")) +
        field("Type", select("kind", "Wallpaper", [["Wallpaper", "Wallpaper"], ["Avatar", "Avatar"], ["Cover", "Cover"], ["Drawing", "Drawing"], ["Other", "Other"]])) + "</div>" +
      '<div data-slot="images"></div>' +
      '<p class="ed-hint">Each picture is added with its file name as the title; you can rename them in /admin.</p>');
    var imgs = imagePicker([], "Pictures");
    $("[data-slot=images]", wrap).appendChild(imgs.el);
    wrap.addEventListener("paste", imgs.onPaste);
    var f = $("form", wrap);
    var toggle = function () { $(".ed-new-series", wrap).hidden = f.series.value !== "__new"; };
    f.series.addEventListener("change", toggle); toggle();
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!imgs.items.length) { $(".ed-status", wrap).textContent = "Add at least one picture."; return; }
      saveFlow(wrap, function () {
        var isNew = f.series.value === "__new";
        var sid = isNew ? (slugify(f.newtitle.value) || "series-" + stamp()) : f.series.value;
        var path = BASE + "content/visual/" + sid + ".json";
        return (isNew ? Promise.resolve(null) : readJSON(path)).then(function (raw) {
          var s = raw || { title: f.newtitle.value.trim() || "New series", date: nowLocal().slice(0, 10), kind: f.kind.value, note: "", download: "public", images: [] };
          var names = imgs.items.map(function (it) { return typeof it === "string" ? "" : it.file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); });
          return collectMedia(imgs, "visual-" + sid).then(function (r) {
            s.images = list(s.images).concat(r.paths.map(function (pth, i) { return { image: pth, title: names[i] || "", phone: "", desktop: "" }; }));
            return commit(r.files.concat([{ path: path, text: JSON.stringify(s, null, 2) + "\n" }]), [], "Add pictures to “" + sid + "”")
              .then(function () { CTX.onSaved("visual", Object.assign({ id: sid }, s)); });
          });
        });
      });
    });
    actions(wrap, [{ label: "Cancel", run: close }, { label: "Add", solid: true, submit: true }]);
  }


  /* ---------- Watch & Listen: paste a link, or upload a song / video ---------- */
  function mediaExt(file) {
    var n = (file.name.split(".").pop() || "").toLowerCase();
    if (/^(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|mp4|m4v|mov)$/.test(n)) return n;
    return /video/.test(file.type) ? "mp4" : audioExt(file);
  }
  function editMedia(id, shelf) {
    var path = id ? BASE + "content/media/" + id + ".json" : "";
    (id ? readJSON(path) : Promise.resolve(null)).then(function (raw) {
      var x = raw || { date: nowLocal(), url: "", file: "", title: "", note: "", cover: "", shelf: "auto", category: "auto" };
      var known = ((CTX.D.media || {}).items || []).filter(function (m) { return m.id === id; })[0] || {};
      var mode = x.file && !x.url ? "file" : "link";
      var wrap = sheet(id ? "Edit" : (shelf === "listen" ? "Add music or a podcast" : "Add a video"),
        '<div class="ed-tabs" role="tablist"><button type="button" class="pill" data-mode="link">Paste a link</button><button type="button" class="pill" data-mode="file">Upload a file</button></div>' +
        '<div data-part="link">' + field("Link", input("url", x.url, "url", ' placeholder="YouTube, TikTok, Instagram, Bilibili, Spotify, Apple Music, SoundCloud…" autocomplete="off"')) +
          '<p class="ed-found"></p><div class="ed-preview"></div></div>' +
        '<div data-part="file" hidden><div class="ed-field"><span class="ed-label">Song, recording or video</span><div class="ed-file-box"></div>' +
          '<div class="ed-row"><label class="pill">Choose a file<input type="file" name="upload" accept="audio/*,video/*" hidden></label></div>' +
          '<span class="ed-hint">MP3, M4A, WAV, MP4… up to 95 MB. Longer videos: upload them to YouTube and paste the link instead.</span></div></div>' +
        field("Title (optional for links: the platform's title is used)", input("title", x.title)) +
        '<label class="ed-field"><span class="ed-label">A line about it (optional)</span><textarea class="ed-input" name="note" rows="2">' + esc(x.note) + "</textarea></label>" +
        '<div data-slot="cover"></div>' +
        '<div class="ed-row2">' + field("When", input("date", x.date, "datetime-local")) +
          field("Show it in", select("shelf", x.shelf || "auto", [["auto", "Automatic"], ["watch", "Watch"], ["listen", "Listen"]])) + "</div>" +
        field("Kind (for Listen)", select("category", x.category || "auto", [["auto", "Automatic"], ["Music", "Music"], ["Podcasts", "Podcasts"], ["Video", "Video"]])) +
        '<label class="ed-check"><input type="checkbox" name="hidden"' + (x.hidden ? " checked" : "") + "> Keep as a draft (not shown on the site)</label>");
      var cover = imagePicker(x.cover ? [x.cover] : [], "Cover picture (optional — links get one automatically)");
      $("[data-slot=cover]", wrap).appendChild(cover.el);
      wrap.addEventListener("paste", function (e) { if (e.target.name !== "url") cover.onPaste(e); });
      var f = $("form", wrap), upload = { blob: null };
      function setMode(m) {
        mode = m;
        wrap.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-mode") === m); });
        $("[data-part=link]", wrap).hidden = m !== "link";
        $("[data-part=file]", wrap).hidden = m !== "file";
      }
      wrap.querySelectorAll("[data-mode]").forEach(function (b) { b.addEventListener("click", function () { setMode(b.getAttribute("data-mode")); }); });
      setMode(mode);
      // live preview: what the link will look like on the site
      var preview = $(".ed-preview", wrap), found = $(".ed-found", wrap);
      function showLink() {
        var u = f.url.value.trim();
        if (!u || !window.AlyxMedia || !window.AlyxMedia.looksLikeLink(u)) { preview.innerHTML = ""; found.textContent = u ? "Paste the whole link, starting with https://" : ""; return; }
        var info = CTX.mediaInfo({ url: u, meta: u === known.url ? known.meta : null, shelf: f.shelf.value, category: f.category.value });
        var what = { video: "video", short: "vertical video", audio: "player", card: "link card" }[info.type];
        found.textContent = (info.platform || "Link") + " · " + what + " · shows in " + (info.shelf === "listen" ? "Listen" : "Watch") +
          (info.type === "card" ? " · the cover and title are fetched when the site updates" : "");
        preview.innerHTML = CTX.player(info, { auto: false, queue: "editor" });
      }
      f.url.addEventListener("input", showLink);
      f.shelf.addEventListener("change", showLink);
      preview.addEventListener("click", function (e) {
        var m = e.target.closest(".mplay"); if (!m || m.querySelector("iframe, video")) return;
        var src = m.getAttribute("data-src"), file = m.getAttribute("data-file");
        m.insertAdjacentHTML("beforeend", '<div class="m-live">' + (file ? '<video src="' + esc(file) + '" controls autoplay playsinline></video>' :
          '<iframe src="' + esc(src) + '" allow="' + window.AlyxMedia.ALLOW + '" allowfullscreen frameborder="0"></iframe>') + "</div>");
        m.setAttribute("data-live", "user");
      });
      showLink();
      // uploaded file
      var box = $(".ed-file-box", wrap);
      function showFile() {
        var src = upload.blob ? URL.createObjectURL(upload.blob) : x.file ? CTX.asset(x.file) : "";
        var isVideo = upload.blob ? /video/.test(upload.blob.type) : /\.(mp4|m4v|mov)$/i.test(x.file || "");
        box.innerHTML = src ? (isVideo ? '<video controls playsinline src="' + esc(src) + '" style="width:100%;max-height:320px"></video>' : '<audio controls src="' + esc(src) + '"></audio>') +
          (upload.blob ? '<span class="ed-hint">' + esc(upload.blob.name) + " · " + (upload.blob.size / 1048576).toFixed(1) + " MB</span>" : "") : '<span class="ed-hint">No file yet</span>';
      }
      f.upload.addEventListener("change", function (e) {
        var file = e.target.files[0]; if (!file) return;
        if (file.size > 95 * 1048576) { toast("That file is over 95 MB. Upload it to YouTube or SoundCloud and paste the link instead."); e.target.value = ""; return; }
        upload.blob = file;
        if (!f.title.value) f.title.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        showFile();
      });
      showFile();
      autosave(wrap, "media:" + (id || "new:" + (shelf || "")));
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var url = f.url.value.trim();
        if (mode === "link" && !url) { $(".ed-status", wrap).textContent = "Paste a link first."; return; }
        if (mode === "file" && !upload.blob && !x.file) { $(".ed-status", wrap).textContent = "Choose a file first."; return; }
        var info = mode === "link" ? CTX.mediaInfo({ url: url }) : null;
        var mid = id || (slugify(f.title.value) || slugify(info && info.platform) || "media") + "-" + stamp();
        saveFlow(wrap, function () {
          return collectMedia(cover, "cover-" + mid).then(function (c) {
            var files = c.files, filePath = mode === "file" ? x.file : "";
            if (mode === "file" && upload.blob) {
              var name = "media-" + mid + "-" + Math.random().toString(36).slice(2, 6) + "." + mediaExt(upload.blob);
              files = files.concat([{ path: BASE + "assets/uploads/" + name, blob: upload.blob }]);
              filePath = "/assets/uploads/" + name;
            }
            var out = { date: f.date.value || nowLocal(), url: mode === "link" ? url : "", file: filePath, title: f.title.value.trim(), note: f.note.value,
                        cover: c.paths[0] || "", shelf: f.shelf.value, category: f.category.value };
            if (f.hidden.checked) out.hidden = true;
            return commit(files.concat([{ path: BASE + "content/media/" + mid + ".json", text: JSON.stringify(out, null, 2) + "\n" }]), [],
              (id ? "Update" : "Add") + " media “" + mid + "”").then(function () {
              CTX.onSaved("media", Object.assign({ id: mid, meta: out.url && out.url === known.url ? known.meta : null }, out), !!out.hidden);
            });
          });
        });
      });
      var btns = [{ label: "Cancel", run: close }, { label: id ? "Save" : "Add", solid: true, submit: true }];
      if (id) btns.unshift({ label: "Delete", danger: true, run: function () { remove(wrap, path, "media", id); } });
      actions(wrap, btns);
      (mode === "link" ? f.url : f.title).focus();
    }).catch(function (err) { toast(explain(err)); });
  }


  /* =====================================================================
     Owner mode: change anything on the page
     ===================================================================== */

  /* ---------- small form helpers ---------- */
  function area(name, value, rows, ph) { return '<textarea class="ed-input" name="' + name + '" rows="' + (rows || 3) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">" + esc(value || "") + "</textarea>"; }
  function check(name, on, label) { return '<label class="ed-check"><input type="checkbox" name="' + name + '"' + (on ? " checked" : "") + "> " + esc(label) + "</label>"; }
  function datalist(id, values) { return '<datalist id="' + id + '">' + values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + "</datalist>"; }
  function clone(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
  // the site's files carry the automatic English next to the original (<field>_zh); give back the original
  function original(o) {
    if (Array.isArray(o)) return o.map(original);
    if (!o || typeof o !== "object") return o;
    var out = {};
    Object.keys(o).forEach(function (k) {
      if (/_zh$/.test(k) || k === "__en") return;
      out[k] = original(o[k + "_zh"] !== undefined && typeof o[k + "_zh"] === typeof o[k] ? o[k + "_zh"] : o[k]);
    });
    return out;
  }
  /* rows of small inputs (links, platforms): add, remove, reorder */
  function rowsEditor(rows, cols, addLabel) {
    var el = document.createElement("div");
    el.className = "ed-rows";
    var data = (rows || []).map(function (r) { return Object.assign({}, r); });
    function render() {
      el.innerHTML = data.map(function (r, i) {
        return '<div class="ed-rowline">' + cols.map(function (c) {
          return '<input class="ed-input" data-r="' + i + '" data-c="' + c.key + '" placeholder="' + esc(c.label) + '" value="' + esc(r[c.key] || "") + '"' + (c.wide ? ' style="flex:2"' : "") + ">";
        }).join("") +
        (i > 0 ? '<button type="button" class="ed-ic" data-up="' + i + '" aria-label="Move up">↑</button>' : '<span class="ed-ic"></span>') +
        '<button type="button" class="ed-ic" data-rm="' + i + '" aria-label="Remove">×</button></div>';
      }).join("") + '<button type="button" class="pill" data-add>' + esc(addLabel || "+ Add") + "</button>";
    }
    el.addEventListener("input", function (e) { var t = e.target; if (t.hasAttribute("data-r")) data[+t.getAttribute("data-r")][t.getAttribute("data-c")] = t.value; });
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t.hasAttribute("data-add")) { var o = {}; cols.forEach(function (c) { o[c.key] = ""; }); data.push(o); render(); var ins = el.querySelectorAll("input"); if (ins.length) ins[ins.length - cols.length].focus(); }
      if (t.hasAttribute("data-rm")) { data.splice(+t.getAttribute("data-rm"), 1); render(); }
      if (t.hasAttribute("data-up")) { var i = +t.getAttribute("data-up"), x = data[i]; data[i] = data[i - 1]; data[i - 1] = x; render(); }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    render();
    return { el: el, value: function () { return data.filter(function (r) { return cols.some(function (c) { return String(r[c.key] || "").trim(); }); }); } };
  }
  /* commit one JSON file after changing a fresh copy of it */
  function changeFile(file, change, message, extraFiles) {
    return readJSON(BASE + file).then(function (obj) {
      obj = obj || {};
      var out = change(obj) || obj;
      return commit((extraFiles || []).concat([{ path: BASE + file, text: JSON.stringify(out, null, 2) + "\n" }]), [], message).then(function () { return out; });
    });
  }
  function once(fn) { var running = false; return function () { if (running) return; running = true; var args = arguments; Promise.resolve(fn.apply(null, args)).then(function () { running = false; }, function () { running = false; }); }; }

  /* ---------- text changed by clicking on it: kept on this device until Publish ---------- */
  var PKEY = "alyx-pending";
  function pending() { try { return JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch (e) { return []; } }
  function savePending(list) { try { if (list.length) localStorage.setItem(PKEY, JSON.stringify(list)); else localStorage.removeItem(PKEY); } catch (e) {} }
  function splitPath(p) { var i = p.indexOf("#"); return { file: p.slice(0, i), field: p.slice(i + 1) }; }
  function segs(field) {
    var out = [], re = /([^.[\]]+)|\[(\d+)\]|\[(\w+)=([^\]]+)\]/g, m;
    while ((m = re.exec(field))) out.push(m[1] ? { k: m[1] } : m[2] ? { i: +m[2] } : { by: m[3], val: m[4] });
    return out;
  }
  function setAt(obj, field, value) {
    var s = segs(field), o = obj;
    for (var n = 0; n < s.length; n++) {
      var g = s[n], last = n === s.length - 1, key;
      if (g.by) { var arr = Array.isArray(o) ? o : []; key = -1; arr.forEach(function (x, j) { if (x && String(x[g.by]) === g.val) key = j; }); if (key < 0) return false; }
      else key = g.k != null ? g.k : g.i;
      if (last) { o[key] = value; return true; }
      if (o[key] == null || typeof o[key] !== "object") o[key] = s[n + 1].k != null ? {} : [];
      o = o[key];
    }
    return false;
  }
  function getAt(obj, field) {
    var o = obj;
    segs(field).forEach(function (g) {
      if (o == null) return;
      if (g.by) { o = (Array.isArray(o) ? o : []).filter(function (x) { return x && String(x[g.by]) === g.val; })[0]; return; }
      o = o[g.k != null ? g.k : g.i];
    });
    return o;
  }
  function viewTargets(file) {
    // where the same text lives in what the page is showing now (and in the untranslated copy)
    var D = CTX.D, R = rawData(), m, out = [];
    if ((m = file.match(/^data\/(\w+)\.json$/))) { out.push(D[m[1]] = D[m[1]] || {}); if (R[m[1]]) out.push(R[m[1]]); return out; }
    if ((m = file.match(/^content\/visual\/(.+)\.json$/))) {
      [D, R].forEach(function (src) { ((src.visual || {}).series || []).forEach(function (x) { if (x.id === m[1]) out.push(x); }); });
      return out;
    }
    if ((m = file.match(/^content\/projects\/(.+)\.json$/))) {
      [D, R].forEach(function (src) { ((src.ongoing || {}).projects || []).forEach(function (x) { if (x.id === m[1]) out.push(x); }); });
      if (D.project && D.project.project && D.project.project.id === m[1]) out.push(D.project.project);
      return out;
    }
    return out;
  }
  function applyToView(op) {
    var sp = splitPath(op.path);
    viewTargets(sp.file).forEach(function (t) {
      setAt(t, sp.field, op.value);
      // drop the stale translation so the page shows what was typed
      if (typeof op.value === "string" && getAt(t, sp.field + "_zh") !== undefined) setAt(t, sp.field + "_zh", op.value);
    });
  }
  function addPending(path, value, translated) {
    var list = pending(), sp = splitPath(path);
    var real = translated ? sp.file + "#" + sp.field + "_en" : path;
    if (!PUBLISHING && list.length && list[list.length - 1].path === real) list[list.length - 1].value = value;
    else list.push({ path: real, value: value });
    savePending(list);
    applyToView({ path: path, value: value });
    schedulePublish();
  }
  /* changes made on the page are saved to GitHub a moment after you stop typing — no Publish button,
     nothing that only lives on one device. If the internet drops, they wait here and go up next time. */
  var PUBLISHING = false, pubTimer = null;
  function schedulePublish() {
    setBar("Saving…");
    clearTimeout(pubTimer);
    pubTimer = setTimeout(publishPending, 1800);
  }
  function publishPending() {
    clearTimeout(pubTimer); pubTimer = null;
    var list = pending();
    if (!list.length) { pendingBar(); return Promise.resolve(); }
    if (PUBLISHING) { pubTimer = setTimeout(publishPending, 1500); setBar("Saving…"); return Promise.resolve(); }
    if (!token()) { signIn(publishPending); return Promise.resolve(); }
    PUBLISHING = true;
    var n = list.length, files = {};
    list.forEach(function (op) { var f = splitPath(op.path).file; (files[f] = files[f] || []).push(op); });
    var names = Object.keys(files);
    setBar("Saving…");
    return Promise.all(names.map(function (f) { return readJSON(BASE + f).then(function (o) { return { f: f, o: o || {} }; }); })).then(function (got) {
      var out = [];
      got.forEach(function (g) {
        files[g.f].forEach(function (op) { setAt(g.o, splitPath(op.path).field, clone(op.value)); });
        out.push({ path: BASE + g.f, text: JSON.stringify(g.o, null, 2) + "\n" });
      });
      return commit(out, [], "Edit on the page: " + names.map(function (x) { return x.split("/").pop().replace(".json", ""); }).join(", "));
    }).then(function () {
      PUBLISHING = false;
      savePending(pending().slice(n));
      if (pending().length) return publishPending();
      setBar("✓ Saved · live on the site in about a minute", "ok");
      clearTimeout(setBar.t); setBar.t = setTimeout(pendingBar, 4000);
    }).catch(function (e) {
      PUBLISHING = false; console.error(e);
      setBar("Not saved yet — " + explain(e).replace(/^Couldn't save just now\. ?/, ""), "err");
    });
  }

  /* ---------- the owner bar (bottom left) ---------- */
  function ownerBar() {
    var bar = $(".own-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "own-bar";
      bar.innerHTML = '<button type="button" class="own-btn" data-own="menu" aria-label="Owner tools">✎ <span>Owner</span></button><span class="own-pending" hidden></span>';
      document.body.appendChild(bar);
      bar.addEventListener("click", function (e) {
        var t = e.target.closest("[data-own]"); if (!t) return;
        var k = t.getAttribute("data-own");
        if (k === "menu") ownerMenu();
        if (k === "publish") publishPending();
        if (k === "visitor") window.open(location.pathname + "?visitor" + location.hash, "_blank");
      });
    }
    pendingBar();
  }
  function setBar(msg, kind) {
    var p = $(".own-pending"); if (!p) return;
    p.hidden = false; p.className = "own-pending" + (kind ? " " + kind : "");
    p.innerHTML = '<span class="own-msg">' + esc(msg) + "</span>" + (kind === "err" ? '<button type="button" class="own-pub" data-own="publish">Try again</button>' : "");
  }
  function pendingBar() {
    var p = $(".own-pending"); if (!p) return;
    if (pending().length) { if (pubTimer || PUBLISHING) setBar("Saving…"); else setBar("Not saved yet", "err"); return; }
    p.hidden = true; p.className = "own-pending";
  }
  function ownerMenu() {
    var zh = CTX.lang === "zh";
    var wrap = sheet("Owner tools",
      '<p class="ed-text">Click any text with a dotted line under it to change it — it saves to the site by itself. Use the buttons on each section to add, edit and move things. Unfinished writing is kept as a private draft in your GitHub account, so it follows you to any device.</p>' +
      '<p class="ed-text">Only you can change things: editing needs your GitHub sign-in. Here you see what you wrote (Chinese stays Chinese); visitors see the English version.</p>' +
      '<div class="ed-menu">' +
        '<button type="button" class="pill solid" data-go="visitor">See it as a visitor ↗</button>' +
        '<button type="button" class="pill" data-go="menu">Menu & page names</button>' +
        '<button type="button" class="pill" data-go="site">Name, logo, email</button>' +
        '<button type="button" class="pill" data-go="look">Fonts, colours, sizes</button>' +
        '<button type="button" class="pill" data-go="export">Download everything</button>' +
        '<a class="pill" href="' + esc(location.pathname) + '?me=0">Leave owner mode</a></div>');
    wrap.addEventListener("click", function (e) {
      var l = e.target.closest("[data-lang]"); if (l) { CTX.setLang(l.getAttribute("data-lang")); return; }
      var g = e.target.closest("[data-go]"); if (!g) return;
      var k = g.getAttribute("data-go");
      if (k === "visitor") { window.open(location.pathname + "?visitor" + location.hash, "_blank"); return; }
      if (k === "menu") menuSheet();
      if (k === "site") siteSheet();
      if (k === "look") lookSheet();
      if (k === "export") { close(); var b = document.querySelector('[data-act="export-all"]'); if (b) b.click(); else { var x = document.createElement("button"); x.setAttribute("data-act", "export-all"); x.hidden = true; document.getElementById("app").appendChild(x); x.click(); x.remove(); } }
    });
    actions(wrap, [{ label: "Close", run: close }]);
  }

  /* ---------- decorate the page after each drawing ---------- */
  var RAWV = null;   // the loaded files with the original (untranslated) text
  function rawData() { if (!RAWV) RAWV = original(CTX.RAW || {}); return RAWV; }
  var started = false;
  function decorate(ctx) {
    CTX = ctx;
    if (!started) {
      started = true;
      rawData();
      var list = pending();
      if (list.length) { list.forEach(function (op) { var sp = splitPath(op.path); applyToView({ path: sp.file + "#" + sp.field.replace(/_en$/, ""), value: op.value }); }); ownerBar(); schedulePublish(); CTX.redraw(); return; }
    }
    ownerBar();
    var app = document.getElementById("app");
    app.querySelectorAll("[data-edit]").forEach(function (el) {
      if (el.getAttribute("data-wired")) return;
      el.setAttribute("data-wired", "1");
      el.classList.add("editable");
      try { el.contentEditable = "plaintext-only"; } catch (e) {}
      if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
      el.spellcheck = true;
      var before = el.textContent;
      el.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !(el.getAttribute("data-multi") && e.shiftKey)) { e.preventDefault(); el.blur(); }
        if (e.key === "Escape") { el.textContent = before; el.blur(); }
      });
      el.addEventListener("paste", function (e) {
        var t = e.clipboardData && e.clipboardData.getData("text/plain");
        if (t == null) return;
        e.preventDefault();
        document.execCommand("insertText", false, el.getAttribute("data-multi") ? t : t.replace(/\s*\n\s*/g, " "));
      });
      el.addEventListener("blur", function () {
        var v = el.innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
        if (v === before.trim()) return;
        before = v;
        addPending(el.getAttribute("data-edit"), v, el.getAttribute("data-tr") === "1");
        CTX.redraw();
      });
    });
    if (CTX.page === "home") homeTools(app);
  }

  /* ---------- home: move, add, change and remove blocks ---------- */
  function blocksRaw() {
    var RD = rawData(), R = RD.settings = RD.settings || {};
    if (!Array.isArray(R.home_blocks)) R.home_blocks = clone(((CTX.D.settings || {}).home_blocks) || []);
    return R.home_blocks;
  }
  function blocksView() { var s = CTX.D.settings = CTX.D.settings || {}; if (!Array.isArray(s.home_blocks)) s.home_blocks = []; return s.home_blocks; }
  function setBlocks(fn) {
    var r = blocksRaw(), v = blocksView();
    fn(r); fn(v);
    var list = pending();
    list.push({ path: "data/settings.json#home_blocks", value: clone(r) });
    savePending(list);
    schedulePublish();
    CTX.redraw();
  }
  function homeTools(app) {
    var blks = app.querySelectorAll(".blk[data-blk]"), n = blks.length;
    blks.forEach(function (el) {
      if (el.querySelector(".blk-bar")) return;
      var i = +el.getAttribute("data-blk"), type = el.getAttribute("data-type");
      var bar = document.createElement("div");
      bar.className = "blk-bar";
      bar.innerHTML = '<span class="blk-name">' + esc((CTX.blockNames || {})[type] || type) + "</span>" +
        (i > 0 ? '<button type="button" data-b="up" aria-label="Move up">↑</button>' : "") +
        (i < n - 1 ? '<button type="button" data-b="down" aria-label="Move down">↓</button>' : "") +
        '<button type="button" data-b="edit">Edit</button><button type="button" data-b="remove" aria-label="Remove">×</button>';
      el.insertBefore(bar, el.firstChild);
      var add = document.createElement("button");
      add.type = "button"; add.className = "blk-add"; add.textContent = "+ Add a block here";
      add.addEventListener("click", function () { addBlockMenu(i); });
      el.parentNode.insertBefore(add, el);
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("[data-b]"); if (!b) return;
        var k = b.getAttribute("data-b");
        if (k === "up" || k === "down") setBlocks(function (arr) { var j = k === "up" ? i - 1 : i + 1, x = arr[i]; arr[i] = arr[j]; arr[j] = x; });
        if (k === "remove" && window.confirm("Remove this block from the home page?")) setBlocks(function (arr) { arr.splice(i, 1); });
        if (k === "edit") blockSheet(i);
      });
    });
    var end = app.querySelector(".blk-add-end");
    if (end && !end.firstChild) {
      var add = document.createElement("button");
      add.type = "button"; add.className = "blk-add"; add.textContent = "+ Add a block";
      add.addEventListener("click", function () { addBlockMenu(n); });
      end.appendChild(add);
    }
  }
  var BLOCK_HELP = {
    text: "A title and a few paragraphs", image: "One large picture, with a caption and link", hero: "Your logo and a line under it",
    daily: "The latest Daily posts", watch: "The latest videos", listen: "Songs and podcasts", ongoing: "Ongoing collections",
    visual: "Pictures from Visual", design: "Latest sketches", store: "Things from the Store", books: "Your books",
    follow: "Links to every platform", index: "A list of all sections", spacer: "Some empty space"
  };
  function addBlockMenu(at) {
    var names = CTX.blockNames || {};
    var wrap = sheet("Add a block", '<div class="ed-blocks">' + Object.keys(BLOCK_HELP).map(function (t) {
      return '<button type="button" class="ed-blockpick" data-t="' + t + '"><b>' + esc(names[t] || t) + "</b><span>" + esc(BLOCK_HELP[t]) + "</span></button>";
    }).join("") + "</div>");
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      var t = b.getAttribute("data-t"), blk = { type: t };
      if (/daily|watch|listen|ongoing|visual|design|store|books/.test(t)) { blk.title = ""; blk.count = t === "daily" ? 6 : t === "ongoing" || t === "watch" ? 3 : 4; }
      if (t === "text") { blk.title = ""; blk.body = ""; blk.align = "left"; }
      if (t === "image") { blk.image = ""; blk.caption = ""; blk.url = ""; blk.size = "wide"; }
      if (t === "spacer") blk.size = "medium";
      if (t === "hero") { blk.show_logo = true; blk.show_tagline = true; }
      close();
      setBlocks(function (arr) { arr.splice(at, 0, clone(blk)); });
      if (t === "text" || t === "image") blockSheet(at);
    });
    actions(wrap, [{ label: "Cancel", run: close }]);
  }
  function blockSheet(i) {
    var b = clone(blocksRaw()[i] || {}), t = b.type, body = "";
    var name = (CTX.blockNames || {})[t] || t;
    if (/daily|watch|listen|ongoing|visual|design|store|books|follow|index/.test(t))
      body += field("Title (empty: the section's name)", input("title", b.title));
    if (/daily|watch|listen|ongoing|visual|design|store|books/.test(t))
      body += field("How many to show", input("count", b.count || 4, "number", ' min="1" max="24"'));
    if (t === "text") body += field("Title (optional)", input("title", b.title)) + field("Text (Markdown: **bold**, *italic*, [link](https://…))", area("body", b.body, 8)) +
      field("Align", select("align", b.align || "left", [["left", "Left"], ["center", "Centre"]]));
    if (t === "image") body += '<div data-slot="img"></div>' + field("Caption (optional)", input("caption", b.caption)) +
      field("Opens this link when clicked (optional)", input("url", b.url, "url")) + field("Width", select("size", b.size || "wide", [["full", "Full width"], ["wide", "Wide"], ["narrow", "Narrow"]]));
    if (t === "hero") body += check("show_logo", b.show_logo !== false, "Show the big logo") + check("show_tagline", b.show_tagline !== false, "Show the line under it") +
      '<p class="ed-hint">The logo picture and the line are changed in Owner → Name, logo, email.</p>';
    if (t === "spacer") body += field("Size", select("size", b.size || "medium", [["small", "Small"], ["medium", "Medium"], ["large", "Large"]]));
    var wrap = sheet(name, body || '<p class="ed-text">Nothing to set for this block.</p>');
    var pic = null;
    if (t === "image") { pic = imagePicker(b.image ? [b.image] : [], "Picture"); $("[data-slot=img]", wrap).appendChild(pic.el); wrap.addEventListener("paste", pic.onPaste); }
    autosave(wrap, "block:" + i + ":" + t);
    var f = $("form", wrap);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var apply = function (imgPath) {
        Array.prototype.forEach.call(f.elements, function (el) {
          if (!el.name || el.type === "file") return;
          b[el.name] = el.type === "checkbox" ? el.checked : el.name === "count" ? Math.max(1, Math.min(24, +el.value || 1)) : el.value;
        });
        if (imgPath !== undefined) b.image = imgPath;
        dropDraft(wrap); close();
        setBlocks(function (arr) { arr[i] = clone(b); });
      };
      if (!pic) return apply();
      if (!pic.items.length) return apply("");
      if (typeof pic.items[0] === "string") return apply(pic.items[0]);
      // a new picture is uploaded right away; the block itself waits for Publish
      busy(wrap, true, "Uploading the picture…");
      collectMedia(pic, "home").then(function (r) { return commit(r.files, [], "Upload a picture for the home page").then(function () { apply(r.paths[0]); }); })
        .catch(function (e) { busy(wrap, false, explain(e)); });
    });
    actions(wrap, [{ label: "Cancel", run: close }, { label: "Done", solid: true, submit: true }]);
  }

  /* ---------- Menu & page names ---------- */
  function menuSheet() {
    readJSON(BASE + "data/sections.json").then(function (raw) {
      var list = ((raw || {}).sections || []).slice();
      var wrap = sheet("Menu & page names",
        '<p class="ed-text">The names are used in the menu, on the home page and as page titles. Use ↑ to change the menu order.</p><div class="ed-secs"></div>');
      var box = $(".ed-secs", wrap);
      function render() {
        box.innerHTML = list.map(function (s, i) {
          return '<div class="ed-sec"><div class="ed-sec-top"><span class="ed-sec-key">' + esc(s.key) + "</span>" +
            (i > 0 ? '<button type="button" class="ed-ic" data-up="' + i + '" aria-label="Move up">↑</button>' : "") +
            '<label class="ed-check"><input type="checkbox" data-i="' + i + '" data-f="in_menu"' + (s.in_menu !== false ? " checked" : "") + "> In the menu</label></div>" +
            '<input class="ed-input" data-i="' + i + '" data-f="title" value="' + esc(s.title || "") + '" placeholder="Name">' +
            '<input class="ed-input" data-i="' + i + '" data-f="short" value="' + esc(s.short || "") + '" placeholder="One line (shown in the list of sections)"></div>';
        }).join("");
      }
      box.addEventListener("input", function (e) { var t = e.target, i = t.getAttribute("data-i"); if (i == null) return; list[+i][t.getAttribute("data-f")] = t.type === "checkbox" ? t.checked : t.value; });
      box.addEventListener("click", function (e) { var u = e.target.getAttribute("data-up"); if (u == null) return; var i = +u, x = list[i]; list[i] = list[i - 1]; list[i - 1] = x; render(); });
      render();
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          return changeFile("data/sections.json", function (o) { o.sections = list; return o; }, "Menu and page names").then(function (o) {
            CTX.D.sections = clone(o); rawData().sections = clone(o); CTX.redraw();
          });
        });
      });
      actions(wrap, [{ label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }

  /* ---------- Name, logo, email ---------- */
  function siteSheet() {
    readJSON(BASE + "data/settings.json").then(function (s) {
      s = s || {};
      var ann = s.announcement || {};
      var wrap = sheet("Name, logo, email",
        field("Site name", input("name", s.name)) +
        field("Line under the big logo (optional)", input("tagline", s.tagline)) +
        field("Email or contact line (bottom of every page)", input("email", s.email)) +
        '<div data-slot="logo"></div><div data-slot="logo_large"></div>' +
        field("Notice at the very top (optional)", input("ann_text", ann.text)) + field("Notice link (optional)", input("ann_url", ann.url, "url")) +
        check("media_autoplay", s.media_autoplay !== false, "Videos play silently when they reach the middle of the screen") +
        check("language_switch", !!s.language_switch, "Let visitors switch to Chinese too (otherwise they only see English)"));
      var small = imagePicker(s.logo ? [s.logo] : [], "Small logo (top left of every page; empty = the smiley)");
      var big = imagePicker(s.logo_large ? [s.logo_large] : [], "Big logo (home page; empty = the smiley)");
      $("[data-slot=logo]", wrap).appendChild(small.el); $("[data-slot=logo_large]", wrap).appendChild(big.el);
      autosave(wrap, "site");
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          return Promise.all([collectMedia(small, "logo"), collectMedia(big, "logo-large")]).then(function (r) {
            return changeFile("data/settings.json", function (o) {
              o.name = f.name.value.trim() || "Alyx's Studio"; o.tagline = f.tagline.value; o.email = f.email.value;
              o.logo = r[0].paths[0] || ""; o.logo_large = r[1].paths[0] || "";
              o.announcement = { text: f.ann_text.value, url: f.ann_url.value.trim() };
              o.media_autoplay = f.media_autoplay.checked; o.language_switch = f.language_switch.checked;
              return o;
            }, "Site name, logo and contact", r[0].files.concat(r[1].files));
          }).then(function (o) {
            ["name", "tagline", "email", "logo", "logo_large", "announcement", "media_autoplay", "language_switch"].forEach(function (k) { CTX.D.settings[k] = clone(o[k]); });
            CTX.redraw();
          });
        });
      });
      actions(wrap, [{ label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }

  /* ---------- Fonts, colours, sizes (changes show at once) ---------- */
  function lookSheet() {
    readJSON(BASE + "data/theme.json").then(function (g) {
      g = g || {};
      var before = clone(CTX.D.theme || g);
      var fonts = CTX.fonts || [];
      var fopts = fonts.map(function (x) { return [x, x]; }), same = [["Same as body", "Same as main text"]].concat(fopts);
      var color = function (k, label, d) { return '<label class="ed-color"><input type="color" name="' + k + '" value="' + esc(g[k] || d) + '"> ' + esc(label) + "</label>"; };
      var range = function (k, label, min, max, d, unit) {
        return '<label class="ed-field"><span class="ed-label">' + esc(label) + ' · <output data-for="' + k + '">' + esc(g[k] != null ? g[k] : d) + "</output>" + (unit || "") + "</span>" +
          '<input type="range" name="' + k + '" min="' + min + '" max="' + max + '" value="' + esc(g[k] != null ? g[k] : d) + '"></label>';
      };
      var wrap = sheet("Fonts, colours, sizes",
        '<p class="ed-text">Changes show on the page right away. Save to publish them.</p>' +
        '<div class="ed-row2">' + field("Main font", select("font_body", g.font_body || "Geist", fopts)) + field("Titles", select("font_heading", g.font_heading || "Same as body", same)) + "</div>" +
        '<div class="ed-row2">' + field("Small text (dates, prices)", select("font_small", g.font_small || "Same as body", same)) +
          field("Chinese characters", select("font_cjk", g.font_cjk || "sans", [["sans", "黑体 · Sans"], ["serif", "宋体 · Serif"], ["kai", "楷体 · Handwritten"]])) + "</div>" +
        range("cjk_scale", "Chinese size next to English", 60, 120, 85, "%") +
        field("Any Google font instead (optional, e.g. Noto Serif SC)", input("font_custom", g.font_custom)) +
        range("size_body", "Main text size", 12, 28, 15, "px") + range("size_heading", "Page title size", 24, 110, 46, "px") + range("size_nav", "Menu size", 11, 26, 13, "px") +
        '<div class="ed-colors">' + color("color_background", "Background", "#ffffff") + color("color_text", "Text", "#111111") + color("color_muted", "Grey text", "#8a8984") +
          color("color_line", "Lines", "#e7e6e1") + color("color_tile", "Empty pictures, calendar", "#f4f3ef") + color("color_highlight", "Highlight (today, selected text)", "#f5e47c") + "</div>" +
        range("page_width", "Page width", 860, 1800, 1240, "px") + range("image_corners", "Picture corners", 0, 32, 0, "px") +
        range("logo_header_width", "Small logo width", 36, 140, 64, "px") + range("logo_home_width", "Big logo width", 120, 520, 300, "px") +
        '<div class="ed-row2">' + range("cols_visual", "Per row: Visual", 1, 6, 4) + range("cols_store", "Per row: Store", 1, 6, 4) + "</div>" +
        '<div class="ed-row2">' + range("cols_books", "Per row: Books", 1, 6, 4) + range("cols_design", "Per row: Design", 1, 6, 3) + "</div>" +
        range("cols_mobile", "Per row on phones", 1, 3, 2) +
        check("uppercase_labels", g.uppercase_labels !== false, "Small labels in CAPITALS"));
      var f = $("form", wrap);
      var read = function () {
        var o = clone(g);
        Array.prototype.forEach.call(f.elements, function (el) {
          if (!el.name) return;
          o[el.name] = el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
        });
        return o;
      };
      f.addEventListener("input", function (e) {
        var out = wrap.querySelector('output[data-for="' + e.target.name + '"]'); if (out) out.textContent = e.target.value;
        CTX.applyTheme(read());
      });
      autosave(wrap, "look");
      var cancel = function () { CTX.applyTheme(before); close(); };
      $("[data-close]", wrap).addEventListener("click", function () { CTX.applyTheme(before); });
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var o = read();
        saveFlow(wrap, function () {
          return changeFile("data/theme.json", function (cur) { return Object.assign(cur, o); }, "Fonts, colours and sizes").then(function (x) { CTX.D.theme = x; CTX.applyTheme(x); CTX.redraw(); });
        });
      });
      actions(wrap, [{ label: "Cancel", run: cancel }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }

  /* ---------- Books, Store, Traces, Follow: one item at a time ---------- */
  var LISTS = {
    books: { key: "items", name: "book", first: true },
    store: { key: "items", name: "item", first: true },
    traces: { key: "items", name: "trace", first: false },
    follow: { key: "groups", name: "group", first: false }
  };
  var TRACE_KINDS = ["Published", "Shown", "Talks", "Collaborations", "Memberships", "Mentions"];
  function viewList(file) { var d = CTX.D[file] = CTX.D[file] || {}; var k = LISTS[file].key; if (!Array.isArray(d[k])) d[k] = []; return d[k]; }
  function categoriesOf(file, field) {
    var seen = [];
    viewList(file).forEach(function (x) { var c = x[field + "_zh"] || x[field]; if (c && seen.indexOf(c) < 0) seen.push(c); });
    if (file === "traces") TRACE_KINDS.forEach(function (k) { if (seen.indexOf(k) < 0) seen.push(k); });
    return seen;
  }
  function editItem(file, index) {
    var L = LISTS[file]; if (!L) return;
    readJSON(BASE + "data/" + file + ".json").then(function (obj) {
      obj = obj || {};
      var arr = obj[L.key] || [], isNew = index == null || index === "" || isNaN(+index), i = +index;
      var it = isNew ? {} : clone(arr[i] || {});
      var body = "", pic = null, rows = null;
      if (file === "books") {
        if (isNew) it.links = [{ label: "Kindle", url: "" }, { label: "Apple Books", url: "" }, { label: "Amazon", url: "" }];
        body = field("Title", input("title", it.title)) +
          field("Category (pick one or type a new one)", input("category", it.category, "text", ' list="cats-books"')) + datalist("cats-books", categoriesOf("books", "category")) +
          field("One line (optional)", input("note", it.note)) + '<div data-slot="img"></div><div class="ed-field"><span class="ed-label">Where to buy or read</span><div data-slot="rows"></div></div>';
      }
      if (file === "store") {
        body = field("Name", input("title", it.title)) +
          '<div class="ed-row2">' + field("Category (pick or type a new one)", input("category", it.category, "text", ' list="cats-store"')) + field("Price", input("price", it.price, "text", ' placeholder="$38"')) + "</div>" +
          datalist("cats-store", categoriesOf("store", "category")) +
          field("Status", select("status", it.status || "available", [["available", "Available"], ["soon", "Coming soon"], ["sold out", "Sold out"]])) +
          field("Link to buy (Shopify, Etsy, Taobao…)", input("url", it.url, "url")) + '<div data-slot="img"></div>' + field("One line (optional)", input("note", it.note));
      }
      if (file === "traces") {
        body = '<div class="ed-row2">' + field("Kind (pick or type)", input("kind", it.kind || "Published", "text", ' list="cats-traces"')) + field("Year", input("year", it.year, "text", ' placeholder="2026"')) + "</div>" +
          datalist("cats-traces", categoriesOf("traces", "kind")) +
          field("What", input("title", it.title)) + field("Where (journal, gallery, event…)", input("where", it.where)) + field("Link (optional)", input("url", it.url, "url"));
      }
      if (file === "follow") {
        body = field("Group name (Social, Watch, Listen, Read…)", input("name", it.name)) + '<div class="ed-field"><span class="ed-label">Platforms (empty link = hidden from visitors)</span><div data-slot="rows"></div></div>';
      }
      var wrap = sheet((isNew ? "New " : "Edit ") + L.name, body);
      if (file === "books" || file === "store") { pic = imagePicker(it.image ? [it.image] : [], file === "books" ? "Cover" : "Picture"); $("[data-slot=img]", wrap).appendChild(pic.el); wrap.addEventListener("paste", pic.onPaste); }
      if (file === "books") { rows = rowsEditor(it.links, [{ key: "label", label: "Kindle" }, { key: "url", label: "https://…", wide: true }], "+ Add a link"); $("[data-slot=rows]", wrap).appendChild(rows.el); }
      if (file === "follow") { rows = rowsEditor(it.links, [{ key: "label", label: "Platform" }, { key: "url", label: "https://…", wide: true }, { key: "handle", label: "@name (optional)" }], "+ Add a platform"); $("[data-slot=rows]", wrap).appendChild(rows.el); }
      autosave(wrap, "item:" + file + ":" + (isNew ? "new" : i));
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          return (pic ? collectMedia(pic, file) : Promise.resolve({ files: [], paths: [] })).then(function (m) {
            Array.prototype.forEach.call(f.elements, function (el) { if (el.name && el.type !== "file" && !el.hasAttribute("data-r")) it[el.name] = el.value.trim ? el.value.trim() : el.value; });
            if (pic) it.image = m.paths[0] || "";
            if (rows) it.links = rows.value();
            return changeFile("data/" + file + ".json", function (o) {
              var a = o[L.key] = o[L.key] || [];
              if (isNew) { if (L.first) a.unshift(it); else a.push(it); } else a[i] = it;
              return o;
            }, (isNew ? "Add " : "Update ") + L.name + " “" + (it.title || it.name || "") + "”", m.files);
          }).then(function (o) { CTX.D[file] = clone(o); rawData()[file] = clone(o); CTX.redraw(); });
        });
      });
      var btns = [{ label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }];
      if (!isNew) btns.unshift({ label: "Delete", danger: true, run: function () {
        if (!window.confirm("Delete this " + L.name + "?")) return;
        saveFlow(wrap, function () {
          return changeFile("data/" + file + ".json", function (o) { (o[L.key] || []).splice(i, 1); return o; }, "Delete " + L.name)
            .then(function (o) { CTX.D[file] = clone(o); rawData()[file] = clone(o); CTX.redraw(); });
        });
      } });
      actions(wrap, btns);
    }).catch(function (e) { toast(explain(e)); });
  }
  var moveItem = once(function (file, i, dir) {
    var L = LISTS[file], j = i + dir, view = viewList(file);
    if (j < 0 || j >= view.length) return;
    var x = view[i]; view[i] = view[j]; view[j] = x; CTX.redraw();
    toast("Moving…", true);
    return changeFile("data/" + file + ".json", function (o) { var a = o[L.key] || []; var y = a[i]; a[i] = a[j]; a[j] = y; return o; }, "Move a " + L.name)
      .then(function () { toast("Moved. The site updates in about a minute."); })
      .catch(function (e) { toast(explain(e)); });
  });
  function renameCategory(file, oldName) {
    var field_ = file === "traces" ? "kind" : "category";
    var wrap = sheet("Rename “" + oldName + "”", field("New name", input("name", oldName)) +
      '<p class="ed-hint">Every ' + (file === "books" ? "book" : "item") + " in “" + esc(oldName) + "” moves to the new name. To add a new category, type it when you add or edit an item.</p>");
    var f = $("form", wrap);
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var nn = f.name.value.trim(); if (!nn || nn === oldName) { close(); return; }
      saveFlow(wrap, function () {
        return changeFile("data/" + file + ".json", function (o) {
          (o.items || []).forEach(function (x) { if (x[field_] === oldName) x[field_] = nn; });
          return o;
        }, "Rename category “" + oldName + "” to “" + nn + "”").then(function (o) {
          viewList(file).forEach(function (x) { if (x[field_] === oldName || x[field_ + "_zh"] === oldName) { x[field_] = nn; delete x[field_ + "_zh"]; } });
          CTX.redraw();
        });
      });
    });
    actions(wrap, [{ label: "Cancel", run: close }, { label: "Rename", solid: true, submit: true }]);
    $("[name=name]", wrap).select();
  }
  function tracesNote() {
    readJSON(BASE + "data/traces.json").then(function (o) {
      o = o || {};
      var wrap = sheet("Lines at the top of Traces", field("Text (Markdown; optional)", area("note", o.note, 8)));
      autosave(wrap, "traces-note");
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          return changeFile("data/traces.json", function (x) { x.note = f.note.value; return x; }, "Traces note").then(function (x) { CTX.D.traces = clone(x); CTX.redraw(); });
        });
      });
      actions(wrap, [{ label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }

  /* ---------- Visual series and their pictures ---------- */
  function seriesSheet(id) {
    var file = "content/visual/" + id + ".json";
    readJSON(BASE + file).then(function (s) {
      s = s || {};
      var wrap = sheet("Series settings",
        field("Name", input("title", s.title)) + field("One line (optional)", area("note", s.note, 2)) +
        '<div class="ed-row2">' + field("Type (pick or type)", input("kind", s.kind, "text", ' list="vkinds"')) + field("Date", input("date", s.date, "date")) + "</div>" +
        datalist("vkinds", ["Wallpaper", "Avatar", "Cover", "Drawing", "Other"]) +
        field("Who can download", select("download", s.download || "public", [["public", "Everyone"], ["private", "Only me"]])) +
        check("hidden", !!s.hidden, "Hide this series (draft)"));
      autosave(wrap, "series:" + id);
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          return changeFile(file, function (o) {
            o.title = f.title.value.trim(); o.note = f.note.value; o.kind = f.kind.value.trim(); o.date = f.date.value; o.download = f.download.value;
            if (f.hidden.checked) o.hidden = true; else delete o.hidden;
            return o;
          }, "Update series “" + id + "”").then(function (o) { CTX.onSaved("visual", Object.assign({ id: id }, o), !!o.hidden); });
        });
      });
      actions(wrap, [{ label: "Delete series", danger: true, run: function () { remove(wrap, BASE + file, "visual", id); } }, { label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }
  function vImageSheet(id, i) {
    var file = "content/visual/" + id + ".json";
    readJSON(BASE + file).then(function (s) {
      s = s || {}; var im = clone((s.images || [])[i] || {});
      var wrap = sheet("Picture", field("Name (optional)", input("title", im.title)) + '<div data-slot="img"></div><div data-slot="phone"></div><div data-slot="desktop"></div>');
      var main = imagePicker(im.image ? [im.image] : [], "Picture"), phone = imagePicker(im.phone ? [im.phone] : [], "Phone size (optional download)"), desk = imagePicker(im.desktop ? [im.desktop] : [], "Computer size (optional download)");
      $("[data-slot=img]", wrap).appendChild(main.el); $("[data-slot=phone]", wrap).appendChild(phone.el); $("[data-slot=desktop]", wrap).appendChild(desk.el);
      autosave(wrap, "vimage:" + id + ":" + i);
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          var pre = "visual-" + id;
          return Promise.all([collectMedia(main, pre), collectMedia(phone, pre + "-phone"), collectMedia(desk, pre + "-desktop")]).then(function (r) {
            return changeFile(file, function (o) {
              o.images = o.images || [];
              o.images[i] = { image: r[0].paths[0] || "", title: f.title.value.trim(), phone: r[1].paths[0] || "", desktop: r[2].paths[0] || "" };
              return o;
            }, "Update a picture in “" + id + "”", r[0].files.concat(r[1].files, r[2].files));
          }).then(function (o) { CTX.onSaved("visual", Object.assign({ id: id }, o)); });
        });
      });
      actions(wrap, [{ label: "Delete", danger: true, run: function () {
        if (!window.confirm("Remove this picture from the series?")) return;
        saveFlow(wrap, function () {
          return changeFile(file, function (o) { (o.images || []).splice(i, 1); return o; }, "Remove a picture from “" + id + "”").then(function (o) { CTX.onSaved("visual", Object.assign({ id: id }, o)); });
        });
      } }, { label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }
  var moveVImage = once(function (id, i, dir) {
    var j = i + dir, ser = ((CTX.D.visual || {}).series || []).filter(function (x) { return x.id === id; })[0];
    if (!ser || j < 0 || j >= (ser.images || []).length) return;
    var x = ser.images[i]; ser.images[i] = ser.images[j]; ser.images[j] = x; CTX.redraw();
    toast("Moving…", true);
    return changeFile("content/visual/" + id + ".json", function (o) { var a = o.images || []; var y = a[i]; a[i] = a[j]; a[j] = y; return o; }, "Reorder pictures in “" + id + "”")
      .then(function () { toast("Moved. The site updates in about a minute."); }).catch(function (e) { toast(explain(e)); });
  });

  /* ---------- Ongoing collection settings ---------- */
  function projectSheet(id) {
    var file = "content/projects/" + id + ".json";
    readJSON(BASE + file).then(function (p) {
      p = p || {};
      var wrap = sheet("Collection settings",
        field("Name", input("title", p.title)) + field("One line about it", area("note", p.note, 3)) +
        '<div class="ed-row2">' + field("What's inside", select("kind", p.kind || "mixed", [["text", "Mostly writing"], ["image", "Mostly pictures"], ["mixed", "Both"]])) +
          field("Order", select("sort", p.sort || "date-asc", [["date-asc", "Oldest first"], ["date-desc", "Newest first"], ["title", "A–Z"], ["number", "By number"]])) + "</div>" +
        '<div class="ed-row2">' + field("Status", select("status", p.status || "ongoing", [["ongoing", "Ongoing"], ["finished", "Finished"]])) +
          field("Who can download", select("download", p.download || "private", [["private", "Only me"], ["public", "Everyone"]])) + "</div>" +
        '<div data-slot="cover"></div>' + check("hidden", !!p.hidden, "Hide this collection (draft)"));
      var cover = imagePicker(p.cover ? [p.cover] : [], "Cover (optional; otherwise the first picture)");
      $("[data-slot=cover]", wrap).appendChild(cover.el);
      autosave(wrap, "project:" + id);
      var f = $("form", wrap);
      f.addEventListener("submit", function (ev) {
        ev.preventDefault();
        saveFlow(wrap, function () {
          return collectMedia(cover, "cover-" + id).then(function (m) {
            return changeFile(file, function (o) {
              ["title", "note", "kind", "sort", "status", "download"].forEach(function (k) { o[k] = f[k].value; });
              o.cover = m.paths[0] || "";
              if (f.hidden.checked) o.hidden = true; else delete o.hidden;
              return o;
            }, "Update collection “" + id + "”", m.files);
          }).then(function (o) { CTX.onSaved("project", Object.assign({ id: id }, o), !!o.hidden); });
        });
      });
      actions(wrap, [{ label: "Delete", danger: true, run: function () {
        if (!window.confirm("Delete this collection? Its entries stay saved, but they won't show until you make a collection with the same name again.")) return;
        saveFlow(wrap, function () { return commit([], [BASE + file], "Delete collection “" + id + "”").then(function () { CTX.onSaved("project", { id: id }, true); }); });
      } }, { label: "Cancel", run: close }, { label: "Save", solid: true, submit: true }]);
    }).catch(function (e) { toast(explain(e)); });
  }

  function ownerAction(spec) {
    var m = spec.mode;
    if (m === "item") return editItem(spec.file, spec.i);
    if (m === "item-move") return moveItem(spec.file, +spec.i, spec.dir);
    if (m === "rename-cat") return renameCategory(spec.file, spec.val);
    if (m === "block") return blockSheet(+spec.i);
    if (m === "vimage-move") return moveVImage(spec.id, +spec.i, spec.dir);
    if (m === "sheet") {
      if (spec.sheet === "menu") return menuSheet();
      if (spec.sheet === "site") return siteSheet();
      if (spec.sheet === "look") return lookSheet();
      if (spec.sheet === "traces-note") return tracesNote();
      if (spec.sheet === "series") return seriesSheet(spec.id);
      if (spec.sheet === "vimage") return vImageSheet(spec.id, +spec.i);
      if (spec.sheet === "project") return projectSheet(spec.id);
    }
  }

  /* ---------- entry point ---------- */
  function open(spec, ctx) {
    CTX = ctx || CTX;
    if (["sheet", "item", "item-move", "rename-cat", "block", "vimage-move"].indexOf(spec.mode) > -1) {
      // home blocks change on the page first and wait for Publish; no sign-in needed yet
      if (spec.mode === "block") return ownerAction(spec);
      if (!token()) return signIn(function () { open(spec, ctx); });
      return ownerAction(spec);
    }
    if (!token()) return signIn(function () { open(spec, ctx); });
    var k = spec.kind;
    if (k === "daily") return editDaily(spec.mode === "edit" ? spec.id : null, spec.day);
    if (k === "entry") return editEntry(spec.mode === "edit" ? spec.id : null, spec.project);
    if (k === "project") return editProject();
    if (k === "design") return editDesign(spec.mode === "edit" ? spec.id : null);
    if (k === "visual") return addVisual(spec.id);
    if (k === "media") return editMedia(spec.mode === "edit" ? spec.id : null, spec.shelf);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $(".ed-sheet")) close(); });
  window.AlyxEditor = { open: open, toMarkdown: toMarkdown, decorate: decorate, signIn: signIn };
})();
