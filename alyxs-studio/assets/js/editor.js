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
  function commit(files, deletes, message, retry) {
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
  function saveFlow(wrap, run) {
    busy(wrap, true, "Saving…");
    return run().then(function () {
      close();
      toast("Saved. The site updates in about a minute; Chinese gets its English version then too.");
    }).catch(function (e) {
      console.error(e);
      busy(wrap, false, explain(e));
    });
  }

  /* ---------- sign in ---------- */
  function signIn(next) {
    var wrap = sheet("Sign in to edit",
      '<p class="ed-text">Editing here uses the same sign-in as the editor. Open <a href="' + CTX.root + 'admin/" target="_blank">/admin</a> in this browser and sign in there once, then come back and press Continue.</p>' +
      '<details class="ed-more"><summary>Or paste a GitHub token</summary>' + field("Token", input("tok", "", "password", ' autocomplete="off"')) + "</details>");
    actions(wrap, [{ label: "Continue", solid: true, run: function () {
      var t = $("[name=tok]", wrap).value.trim();
      if (t) try { localStorage.setItem("alyx-gh-token", t); } catch (e) {}
      if (!token()) { $(".ed-status", wrap).textContent = "Not signed in yet."; return; }
      close(); next();
    } }]);
  }

  /* ---------- Daily ---------- */
  function editDaily(id) {
    var path = id ? BASE + "content/daily/" + id + ".json" : "";
    (id ? readJSON(path) : Promise.resolve(null)).then(function (raw) {
      var p = raw || { date: nowLocal(), text: "", images: [], audio: "", link: { url: "", title: "", quote: "" }, tags: [] };
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
    if (startText !== e) { $(".ew-title", w).value = local.title || ""; status.textContent = "Restored your unpublished draft from this device"; }
    var count = function () { var t = body.innerText.replace(/\s/g, ""); $(".ew-count", w).textContent = t.length + " characters"; };
    var keep = function () {
      try { localStorage.setItem(key, JSON.stringify({ text: toMarkdown(body), title: $(".ew-title", w).value, saved: Date.now() })); } catch (x) {}
      status.textContent = "Saved on this device · " + new Date().toTimeString().slice(0, 5);
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
          id = newId; key = "alyx-draft:" + id;
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

  /* ---------- entry point ---------- */
  function open(spec, ctx) {
    CTX = ctx || CTX;
    if (!token()) return signIn(function () { open(spec, ctx); });
    var k = spec.kind;
    if (k === "daily") return editDaily(spec.mode === "edit" ? spec.id : null);
    if (k === "entry") return editEntry(spec.mode === "edit" ? spec.id : null, spec.project);
    if (k === "project") return editProject();
    if (k === "design") return editDesign(spec.mode === "edit" ? spec.id : null);
    if (k === "visual") return addVisual(spec.id);
    if (k === "media") return editMedia(spec.mode === "edit" ? spec.id : null, spec.shelf);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $(".ed-sheet")) close(); });
  window.AlyxEditor = { open: open, toMarkdown: toMarkdown };
})();
