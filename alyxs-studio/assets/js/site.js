/* Alyx's Studio — renders every page from the files in /data.
   Content and design are edited at /admin. You normally don't need to edit this file. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  if (!app) return;

  var ROOT = app.getAttribute("data-root") || "";
  var PAGE = app.getAttribute("data-page") || "home";
  var SECTIONS = ["daily", "ongoing", "write", "watch", "listen", "books", "visual", "design", "store", "traces", "follow"];
  var PRIVATE_SECTIONS = { write: 1 };   // only the owner sees these in the menu
  var D = {};          // everything loaded: D.settings, D.theme, D.sections, D.daily …
  var RAW = {};        // owner mode: the same, as loaded (before the language swap)
  var STATE = {};      // per-page view state (calendar month, filters …)

  /* ---------- live preview inside /admin ---------- */
  var PREVIEW = /[?&]preview=1/.test(location.search);
  var Q = PREVIEW ? location.search : "";
  var DRAFTS = "alyx-preview-" + ((location.search.match(/[?&]pid=([\w-]+)/) || [])[1] || "x");
  function readDrafts() { try { return JSON.parse(sessionStorage.getItem(DRAFTS) || "{}"); } catch (e) { return {}; } }
  function saveDraft(key, msg) {
    try { var d = readDrafts(); d[key] = msg; sessionStorage.setItem(DRAFTS, JSON.stringify(d)); } catch (e) {}
  }

  /* ---------- owner mode: open any page with ?me once to see download tools ---------- */
  /* Owner mode needs your GitHub sign-in (the same as /admin). Without it, ?me shows the sign-in,
     never the editing tools — visitors can't change anything. ?visitor shows the site as visitors see it. */
  var OWNER = false, WANTS_OWNER = false, VISITOR = false, NEEDS_SIGNIN = false, NEEDS_CHECK = false;
  function ghToken() {
    try { var u = JSON.parse(localStorage.getItem("sveltia-cms.user") || "null"); if (u && u.token) return u.token; } catch (e) {}
    try { return localStorage.getItem("alyx-gh-token") || ""; } catch (e) { return ""; }
  }
  function tokenMark(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return String(h); }
  try {
    if (/[?&]me=0\b/.test(location.search)) localStorage.removeItem("alyx-me");
    else if (/[?&]me\b/.test(location.search)) localStorage.setItem("alyx-me", "1");
    if (/[?&]visitor=0\b/.test(location.search)) sessionStorage.removeItem("alyx-visitor");
    else if (/[?&]visitor\b/.test(location.search)) sessionStorage.setItem("alyx-visitor", "1");
    VISITOR = sessionStorage.getItem("alyx-visitor") === "1";
    WANTS_OWNER = localStorage.getItem("alyx-me") === "1" && !VISITOR;
    var tok = ghToken(), ok = JSON.parse(localStorage.getItem("alyx-ok") || "null");
    if (WANTS_OWNER && !tok) NEEDS_SIGNIN = true;
    else if (WANTS_OWNER && ok && ok.m === tokenMark(tok) && Date.now() - ok.t < 7 * 864e5) OWNER = true;
    else if (WANTS_OWNER) NEEDS_CHECK = true;
  } catch (e) {}
  if (PREVIEW) OWNER = true;

  /* ---------- language: Chinese is written, English is shown (the build makes the English) ---------- */
  var EDIT = OWNER && !PREVIEW;   // owner mode: everything on the page can be changed
  var LANG = "en";
  try {
    var savedLang = localStorage.getItem("alyx-lang");
    LANG = savedLang ? (savedLang === "zh" ? "zh" : "en") : (EDIT ? "zh" : "en");
  } catch (e) {}
  function localize(o) {
    if (LANG !== "zh" || !o || typeof o !== "object") return o;
    if (Array.isArray(o)) { o.forEach(localize); return o; }
    Object.keys(o).forEach(function (k) {
      if (k === "text_zh") o.__en = o.text;
      if (/_zh$/.test(k)) o[k.slice(0, -3)] = o[k];
      else localize(o[k]);
    });
    return o;
  }

  // the text was written in Chinese and an English version exists
  function hasEnglish(o) { return !!(o && o.text_zh && (LANG === "zh" ? o.__en : o.text) && (LANG === "zh" ? o.__en : o.text) !== o.text_zh); }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }
  /* owner mode: marks text that can be changed by clicking on it.
     path = file#field; when the page shows an automatic English version, the change is kept as the English one. */
  function ed(path, holder, key, ph, multi) {
    if (!EDIT) return "";
    var tr = holder && key && LANG === "en" && holder[key + "_zh"] && holder[key + "_zh"] !== holder[key] ? ' data-tr="1"' : "";
    return ' data-edit="' + esc(path) + '"' + tr + (ph ? ' data-ph="' + esc(ph) + '"' : "") + (multi ? ' data-multi="1"' : "");
  }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []; }
  function asset(p) {
    if (!p) return "";
    // just uploaded from this page: show it from this device until the site has it
    if (window.AlyxUploads && window.AlyxUploads[p]) return window.AlyxUploads[p];
    if (/^(https?:|blob:|data:)/.test(p) || p.charAt(0) === "/") return p;
    return ROOT + p;
  }
  function absUrl(p) { try { return new URL(asset(p), location.href).href; } catch (e) { return p; } }
  function isExternal(u) { return /^https?:/.test(u || ""); }
  function a(url, inner, cls, extra) {
    if (!url) return '<span class="' + (cls || "") + ' nolink">' + inner + "</span>";
    var ext = isExternal(url) ? ' target="_blank" rel="noopener"' : "";
    return '<a class="' + (cls || "") + '" href="' + esc(url) + '"' + ext + (extra || "") + ">" + inner + "</a>";
  }
  function arrow(url) { return url && isExternal(url) ? ' <span class="ext" aria-hidden="true">↗</span>' : ""; }
  function md(text) {
    text = String(text || "");
    if (window.marked && window.marked.parse) return window.marked.parse(text);
    return text.split(/\n{2,}/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
  }
  function plain(text) { return String(text || "").replace(/[#*_>`\[\]]/g, "").replace(/\(https?:[^)]+\)/g, "").replace(/\s+/g, " ").trim(); }
  function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function fmtDay(day) {
    var m = String(day || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? MONTHS[+m[2] - 1].slice(0, 3) + " " + (+m[3]) + ", " + m[1] : String(day || "");
  }
  function fmtMonth(ym) { var m = ym.split("-"); return MONTHS[+m[1] - 1] + " " + m[0]; }
  function timeOf(d) { var m = String(d || "").match(/T(\d{2}:\d{2})/); return m ? m[1] : ""; }
  function today() { var t = new Date(); return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hash() { try { return decodeURIComponent((location.hash || "").replace(/^#/, "")); } catch (e) { return ""; } }

  /* ---------- sections: one place for names, notes and menu order ---------- */
  function sections() { return ((D.sections || {}).sections || []).filter(function (s) { return s && SECTIONS.indexOf(s.key) > -1 && (OWNER || !PRIVATE_SECTIONS[s.key]); }); }
  function sec(key) {
    var s = sections().filter(function (x) { return x.key === key; })[0];
    return s || { key: key, title: key.charAt(0).toUpperCase() + key.slice(1), short: "", intro: "" };
  }
  function title(key) { return sec(key).title || key; }
  function href(key, frag) {
    var base = key === "home" ? (ROOT || "./") : ROOT + key + "/";
    return base + Q + (frag ? "#" + frag : "");
  }

  /* ---------- look: fonts, colours, sizes ---------- */
  var FONTS = {
    "Geist": "sans", "Instrument Sans": "sans", "DM Sans": "sans", "Work Sans": "sans", "IBM Plex Sans": "sans",
    "Manrope": "sans", "Karla": "sans", "Libre Franklin": "sans", "Space Grotesk": "sans", "Figtree": "sans",
    "Outfit": "sans", "Albert Sans": "sans", "Newsreader": "serif", "EB Garamond": "serif", "Cormorant Garamond": "serif",
    "Fraunces": "serif", "Libre Caslon Text": "serif", "Instrument Serif": "serif", "Spectral": "serif",
    "Gaegu": "hand", "Patrick Hand": "hand", "Caveat": "hand", "Geist Mono": "mono", "IBM Plex Mono": "mono",
    "DM Mono": "mono", "Space Mono": "mono", "JetBrains Mono": "mono", "Courier Prime": "mono"
  };
  var FALLBACK = {
    sans: '"Helvetica Neue", Helvetica, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif',
    hand: '"Comic Sans MS", "Marker Felt", cursive', mono: 'ui-monospace, "SFMono-Regular", Menlo, monospace'
  };
  function stack(name) { return '"AlyxCJK", "' + name.replace(/"/g, "") + '", ' + FALLBACK[FONTS[name] || "sans"]; }
  var CJK_LOCAL = {
    sans: ["PingFang SC", "PingFangSC-Regular", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK TC"],
    serif: ["Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", "Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK TC"],
    kai: ["Kaiti SC", "STKaiti", "KaiTi", "BiauKai", "Kai", "Noto Serif CJK SC", "Noto Serif CJK TC"]
  };
  function cjkFace(g) {
    var names = CJK_LOCAL[g.font_cjk] || CJK_LOCAL.sans;
    var scale = Math.max(60, Math.min(120, num(g.cjk_scale, 85)));
    return '@font-face{font-family:"AlyxCJK";src:' + names.map(function (n) { return 'local("' + n + '")'; }).join(",") +
      ";size-adjust:" + scale + "%;unicode-range:U+2E80-2FDF,U+3000-303F,U+3100-312F,U+31A0-31EF,U+3200-9FFF,U+F900-FAFF,U+FE30-FE4F,U+FF00-FFEF,U+20000-2FA1F;}";
  }
  function loadFont(name) {
    if (!name || document.querySelector('link[data-font="' + name + '"]')) return;
    var base = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(name).replace(/%20/g, "+");
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("data-font", name);
    link.href = base + ":wght@400;500;700&display=swap";
    link.onerror = function () { link.onerror = null; link.href = base + "&display=swap"; };
    document.head.appendChild(link);
  }
  function applyTheme(g) {
    g = g || {};
    var body = (g.font_custom || "").trim() || g.font_body || "Geist";
    var head = !g.font_heading || g.font_heading === "Same as body" ? body : g.font_heading;
    var small = !g.font_small || g.font_small === "Same as body" ? body : g.font_small;
    [body, head, small].forEach(loadFont);
    STATE.fontBody = body;
    var css = cjkFace(g) + ":root{" +
      "--ink:" + (g.color_text || "#111111") + ";--paper:" + (g.color_background || "#ffffff") + ";" +
      "--mute:" + (g.color_muted || "#8a8984") + ";--line:" + (g.color_line || "#e7e6e1") + ";" +
      "--tile:" + (g.color_tile || "#f4f3ef") + ";--sun:" + (g.color_highlight || "#f5e47c") + ";" +
      "--sans:" + stack(body) + ";--head:" + stack(head) + ";--mono:" + stack(small) + ";" +
      "--size-body:" + num(g.size_body, 15) + "px;--size-h1:" + num(g.size_heading, 46) + "px;" +
      "--size-nav:" + num(g.size_nav, 13) + "px;--logo-home:" + num(g.logo_home_width, 300) + "px;" +
      "--logo-head:" + num(g.logo_header_width, 64) + "px;--max:" + num(g.page_width, 1240) + "px;" +
      "--radius:" + num(g.image_corners, 0) + "px;--cols-m:" + Math.max(1, Math.min(3, num(g.cols_mobile, 2))) + ";}";
    var el = document.getElementById("design-vars");
    if (!el) { el = document.createElement("style"); el.id = "design-vars"; document.head.appendChild(el); }
    el.textContent = css;
    document.documentElement.classList.toggle("no-caps", g.uppercase_labels === false);
  }
  function cols(key, d) { return Math.max(1, Math.min(6, num((D.theme || {})["cols_" + key], d))); }
  function shape(key, d) { return (D.theme || {})["shape_" + key] || d; }

  /* ---------- shared pieces ---------- */
  function header(current) {
    var s = D.settings || {};
    var items = sections().filter(function (x) { return x.in_menu !== false; }).map(function (x) {
      var cur = x.key === current ? ' aria-current="page"' : "";
      return '<li><a href="' + esc(href(x.key)) + '"' + cur + ">" + esc(x.title || x.key) + "</a></li>";
    }).join("");
    return (
      '<header class="site-head">' +
        '<a class="brand" href="' + esc(href("home")) + '" aria-label="' + esc(s.name) + ', home">' +
          '<img src="' + esc(asset(s.logo || "assets/img/logo-sm.png")) + '" alt="' + esc(s.name) + '">' +
        "</a>" +
        '<button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-nav">Menu</button>' +
        '<nav class="site-nav flat" id="site-nav" aria-label="Main"><ul>' + items + "</ul></nav>" +
      "</header>"
    );
  }
  function followLinks() {
    var out = [];
    ((D.follow || {}).groups || []).forEach(function (g) {
      (g.links || []).forEach(function (l) { if (l && l.label && l.url) out.push(l); });
    });
    return out;
  }
  function footer() {
    var s = D.settings || {};
    var links = followLinks().map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a>";
    }).join("");
    var owner = "";
    return (
      '<footer class="site-foot">' +
        (links ? '<p class="foot-links">' + links + "</p>" : "") +
        '<div class="foot-row">' +
          "<p>© " + new Date().getFullYear() + " " + esc(s.name) + "</p>" +
          (s.email || EDIT ? '<p class="mail"' + ed("data/settings.json#email", s, "email", "Email or a short line") + ">" + esc(s.email || "") + "</p>" : "") +
        "</div>" + owner +
        (!EDIT && s.language_switch ? '<p class="lang-switch">' +
          '<button type="button" class="linkish' + (LANG === "en" ? " on" : "") + '" data-act="lang" data-val="en">English</button>' +
          '<button type="button" class="linkish' + (LANG === "zh" ? " on" : "") + '" data-act="lang" data-val="zh">中文</button></p>' : "") +
      "</footer>"
    );
  }
  function secPath(key, field) { return "data/sections.json#sections[key=" + key + "]." + field; }
  function pageHead(key, extra) {
    var s = sec(key);
    return '<div class="page-head"><h1' + ed(secPath(key, "title"), s, "title", "Page name") + ">" + esc(s.title) + "</h1>" +
      (s.intro || EDIT ? '<p class="intro"' + ed(secPath(key, "intro"), s, "intro", "Add a line about this page…", true) + ">" + esc(s.intro || "") + "</p>" : "") +
      (EDIT ? '<p class="owner-tools"><button type="button" class="mini-btn" data-act="sheet" data-sheet="menu">Menu & page names</button></p>' : "") +
      (extra || "") + "</div>";
  }
  function pic(img, alt, attrs) {
    return img
      ? '<img src="' + esc(asset(img)) + '" alt="' + esc(alt || "") + '" loading="lazy"' + (attrs || "") + ">"
      : '<span class="blank" aria-hidden="true"></span>';
  }
  /* tiles: list of {title, note, image, url, act, extra} */
  // pictures are shown whole (A4 pages, book covers…) unless "crop to the same shape" is chosen in Look
  function natural() { return (D.theme || {}).image_fit !== "crop"; }
  function tiles(items, ratio, n, extra) {
    var t = Math.min(n, 3);
    return '<ul class="tiles' + (natural() ? " natural" : "") + '" style="--ratio:' + esc(ratio) + ";--cols:" + n + ";--cols-t:" + t + '">' +
      items.map(function (it) {
        var media = '<div class="tile-pic">' + pic(it.image, it.title) + (it.badge ? '<span class="badge">' + esc(it.badge) + "</span>" : "") + "</div>";
        var wrapped = it.act
          ? '<button type="button" class="tile-link" ' + it.act + ' aria-label="' + esc(it.title || "Open") + '">' + media + "</button>"
          : it.url ? a(it.url, media, "tile-link") : media;
        return '<li class="tile">' + wrapped +
          '<div class="tile-cap">' +
            (it.title ? '<p class="tile-title">' + esc(it.title) + "</p>" : "") +
            (it.note ? '<p class="tile-note">' + esc(it.note) + "</p>" : "") +
            (extra ? extra(it) : "") +
          "</div></li>";
      }).join("") + "</ul>";
  }
  function chips(all, current, actName, renameFile) {
    if (EDIT && renameFile && all.length) {
      return '<div class="chips" role="tablist">' + ["All"].concat(all).map(function (c) {
        var on = (current || "All") === c;
        return '<span class="chip-wrap"><button type="button" role="tab" aria-selected="' + on + '" class="chip' + (on ? " on" : "") +
          '" data-act="' + actName + '" data-val="' + esc(c) + '">' + esc(c) + "</button>" +
          (c !== "All" ? '<button type="button" class="chip-ed" data-act="rename-cat" data-file="' + renameFile + '" data-val="' + esc(c) + '" aria-label="Rename ' + esc(c) + '">✎</button>' : "") + "</span>";
      }).join("") + "</div>";
    }
    if (all.length < 2) return "";
    return '<div class="chips" role="tablist">' + ["All"].concat(all).map(function (c) {
      var on = (current || "All") === c;
      return '<button type="button" role="tab" aria-selected="' + on + '" class="chip' + (on ? " on" : "") +
        '" data-act="' + actName + '" data-val="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("") + "</div>";
  }
  function linkPills(links) {
    links = list(links).filter(function (l) { return l && l.label; });
    if (!links.length) return "";
    return '<p class="links">' + links.map(function (l) { return a(l.url, esc(l.label) + arrow(l.url), "pill"); }).join("") + "</p>";
  }
  function ownerEdit(kind) {
    if (!EDIT) return null;
    return function (it) {
      return it.id ? '<p class="tile-more"><button type="button" class="mini-btn" data-act="edit" data-kind="' + kind + '" data-id="' + esc(it.id) + '">Edit</button>' +
        (it.src ? deskBtn("content/" + (kind === "entry" ? "entries" : kind) + "/" + it.id + ".json", it.src) + hiddenBtn("content/" + (kind === "entry" ? "entries" : kind) + "/" + it.id + ".json", it.src) : "") + "</p>" : "";
    };
  }
  /* Edit / ← / → under items kept in one list file (books, store) */
  function listTools(file, i, n) {
    if (!EDIT) return "";
    return '<p class="tile-more owner-row"><button type="button" class="mini-btn" data-act="item" data-file="' + file + '" data-i="' + i + '">Edit</button>' +
      (i > 0 ? '<button type="button" class="mini-btn" data-act="item-move" data-file="' + file + '" data-i="' + i + '" data-dir="-1" aria-label="Move earlier">←</button>' : "") +
      (i < n - 1 ? '<button type="button" class="mini-btn" data-act="item-move" data-file="' + file + '" data-i="' + i + '" data-dir="1" aria-label="Move later">→</button>' : "") + "</p>";
  }
  /* owner: open the translation desk for something written in Chinese */
  var DESK_KEYS = ["title", "text", "note", "intro", "caption", "quote"], CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
  function deskBtn(file, it, label) {
    if (!EDIT || !it) return "";
    var zh = DESK_KEYS.filter(function (k) { return it[k + "_zh"] && CJK_RE.test(it[k + "_zh"]); });
    if (!zh.length) return "";
    var done = zh.every(function (k) { return it[k + "_en"]; });
    return ' <button type="button" class="mini-btn ' + (done ? "en-ok" : "en-todo") + '" data-act="desk" data-file="' + esc(file) + '" data-val="' + esc(label || "") + '">' + (done ? "English ✓" : "English") + "</button>";
  }
  /* things marked "hidden" are kept: visitors never see them, the owner sees them with a way back */
  function dropHidden() {
    var keep = function (x) { return x && !x.hidden; };
    if (D.daily && D.daily.posts) D.daily.posts = D.daily.posts.filter(keep);
    if (D.media && D.media.items) D.media.items = D.media.items.filter(keep);
    if (D.design && D.design.items) D.design.items = D.design.items.filter(keep);
    if (D.visual && D.visual.series) D.visual.series = D.visual.series.filter(keep);
    if (D.ongoing && D.ongoing.projects) {
      var gone = {}; D.ongoing.projects.forEach(function (p) { if (p.hidden) gone[p.id] = 1; });
      D.ongoing.projects = D.ongoing.projects.filter(keep);
      D.ongoing.recent = (D.ongoing.recent || []).filter(function (e) { return !gone[e.project]; });
    }
  }
  function hiddenBtn(file, it) {
    if (!EDIT || !it || !it.hidden) return "";
    return ' <button type="button" class="mini-btn hid" data-act="unhide" data-file="' + esc(file) + '" title="Only you can see this. Click to show it to everyone.">Hidden · show it</button>';
  }
  function addButton(label, attrs) {
    return EDIT ? '<p class="owner-tools"><button type="button" class="pill solid" ' + attrs + ">" + esc(label) + "</button></p>" : "";
  }
  /* the round + button: what it makes depends on the page */
  function fab() {
    if (!OWNER || PREVIEW) return "";
    var spec = null;
    if (PAGE === "home" || PAGE === "daily") spec = 'data-kind="daily"';
    if (PAGE === "design") spec = 'data-kind="design"';
    if (PAGE === "visual") spec = 'data-kind="visual"';
    if (PAGE === "watch" || PAGE === "listen") spec = 'data-kind="media" data-shelf="' + PAGE + '"';
    if (PAGE === "ongoing") {
      var pid = hash().split("/")[0];
      spec = pid && D.project && D.project.project.id === pid ? 'data-kind="entry" data-project="' + esc(pid) + '"' : 'data-kind="project"';
    }
    return spec ? '<button type="button" class="fab" data-act="new" ' + spec + ' aria-label="New">+</button>' : "";
  }
  function emptyNote(text) { return '<p class="empty">' + esc(text || "More soon.") + "</p>"; }

  /* ---------- download buttons (formats depend on the collection) ---------- */
  function downloadBar(collectionKey, formats, label) {
    return '<div class="dl-bar"><span class="dl-label">' + esc(label || "Download") + "</span>" +
      formats.map(function (f) {
        var name = { zip: "ZIP", epub: "EPUB · Kindle", pdf: "PDF" }[f];
        return '<button type="button" class="pill" data-act="export" data-col="' + esc(collectionKey) + '" data-fmt="' + f + '">' + name + "</button>";
      }).join("") + "</div>";
  }

  /* ---------- daily posts ---------- */
  function posts() { return ((D.daily || {}).posts || []); }
  function postsByDay() {
    var m = {};
    posts().forEach(function (p) { (m[p.day] = m[p.day] || []).push(p); });
    Object.keys(m).forEach(function (k) { m[k].sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }); });
    return m;
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  function postCard(p, opts) {
    opts = opts || {};
    var imgs = list(p.images);
    var gallery = imgs.length
      ? '<div class="post-images n' + Math.min(imgs.length, 4) + (natural() ? " natural" : "") + '">' + imgs.map(function (src, i) {
          return '<button type="button" class="post-img" data-act="lightbox" data-src="post:' + esc(p.id) + '" data-i="' + i + '">' + pic(src, "") + "</button>";
        }).join("") + "</div>"
      : "";
    var li = p.link && p.link.url ? mediaInfo({ id: "", url: p.link.url, meta: p.link.meta }) : null;
    var link = li && li.type !== "card"
      ? (p.link.quote ? '<p class="repost-quote solo">' + esc(p.link.quote) + "</p>" : "") + '<div class="post-media">' + player(li, { queue: "post-" + p.id }) + "</div>"
      : p.link && p.link.url
      ? '<a class="repost" href="' + esc(p.link.url) + '" target="_blank" rel="noopener">' +
          (p.link.quote ? '<span class="repost-quote">' + esc(p.link.quote) + "</span>" : "") +
          '<span class="repost-src">' + esc(p.link.title || hostOf(p.link.url)) + ' <span class="ext">↗</span></span></a>'
      : "";
    var audio = p.audio ? '<audio class="player" controls preload="none" src="' + esc(asset(p.audio)) + '"></audio>' : "";
    var tags = list(p.tags).length ? '<p class="post-tags">' + list(p.tags).map(function (t) { return "#" + esc(t); }).join(" ") + "</p>" : "";
    var meta = '<p class="post-meta"><a href="' + esc(href("daily", "p-" + p.id)) + '">' +
      (opts.showDay ? esc(fmtDay(p.day)) + " · " : "") + esc(timeOf(p.date)) + "</a>" +
      (hasEnglish(p) && (OWNER || (D.settings || {}).language_switch) ? ' <button type="button" class="mini-btn" data-act="orig" data-id="' + esc(p.id) + '">' + (LANG === "zh" ? "English" : "原文") + "</button>" : "") +
      (OWNER && !PREVIEW ? ' <button type="button" class="mini-btn" data-act="edit" data-kind="daily" data-id="' + esc(p.id) + '">Edit</button>' : "") +
      deskBtn("content/daily/" + p.id + ".json", p, cut(plain(p.text_zh || p.text), 30)) + hiddenBtn("content/daily/" + p.id + ".json", p) + "</p>";
    return '<article class="post" id="p-' + esc(p.id) + '">' + meta +
      (p.text ? '<div class="prose post-text"' + (EDIT ? ' data-act="edit" data-kind="daily" data-id="' + esc(p.id) + '" title="Click to edit"' : "") + ">" + md(p.text) + "</div>" : "") +
      gallery + audio + link + tags + shareRow(p) + "</article>";
  }
  function shareRow(p) {
    return '<div class="share">' +
      '<button type="button" class="share-btn" data-act="share" data-to="x" data-id="' + esc(p.id) + '">X</button>' +
      '<button type="button" class="share-btn" data-act="share" data-to="threads" data-id="' + esc(p.id) + '">Threads</button>' +
      '<button type="button" class="share-btn" data-act="share" data-to="story" data-id="' + esc(p.id) + '">Story image</button>' +
      '<button type="button" class="share-btn" data-act="share" data-to="copy" data-id="' + esc(p.id) + '">Copy link</button>' +
    "</div>";
  }
  function thumbFor(dayPosts) {
    for (var i = 0; i < dayPosts.length; i++) if (list(dayPosts[i].images).length) return { img: list(dayPosts[i].images)[0] };
    for (var j = 0; j < dayPosts.length; j++) {
      var l = dayPosts[j].link;
      if (l && l.url) { var mi = mediaInfo({ url: l.url, meta: l.meta }); if (mi.cover) return { img: mi.cover }; }
    }
    var p = dayPosts[0];
    if (p.text) return { text: cut(plain(p.text), 28) };
    if (p.audio) return { text: "♪" };
    if (p.link && p.link.url) return { text: "↗" };
    return { text: "·" };
  }
  function calendar(month, byDay, selected) {
    var parts = month.split("-"), y = +parts[0], m = +parts[1];
    var first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
    var lead = (first.getDay() + 6) % 7; // weeks start on Monday
    var cells = "";
    for (var i = 0; i < lead; i++) cells += '<span class="cal-cell empty" aria-hidden="true"></span>';
    for (var d = 1; d <= days; d++) {
      var key = month + "-" + pad(d), ps = byDay[key];
      var cls = "cal-cell" + (ps ? " has" : "") + (key === selected ? " sel" : "") + (key === today() ? " today" : "");
      // owner: the private journal's marks (mood, period, food, money, notes) sit on every day
      var jm = EDIT && window.AlyxJournal ? window.AlyxJournal.marks(key) : "";
      if (ps) {
        var t = thumbFor(ps);
        cells += '<a class="' + cls + '" href="#' + key + '" aria-label="' + esc(fmtDay(key)) + ", " + ps.length + ' post' + (ps.length > 1 ? "s" : "") + '">' +
          '<span class="cal-num">' + d + "</span>" +
          (t.img ? '<span class="cal-thumb">' + pic(t.img, "") + "</span>" : '<span class="cal-text">' + esc(t.text) + "</span>") +
          (ps.length > 1 ? '<span class="cal-count">' + ps.length + "</span>" : "") + jm + "</a>";
      } else {
        cells += EDIT
          ? '<a class="' + cls + (jm ? " jhas" : "") + '" href="#' + key + '" aria-label="' + esc(fmtDay(key)) + '"><span class="cal-num">' + d + "</span>" + jm + "</a>"
          : '<span class="' + cls + '"><span class="cal-num">' + d + "</span></span>";
      }
    }
    return '<div class="cal" role="grid">' +
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (w) { return '<span class="cal-wd">' + w + "</span>"; }).join("") +
      cells + "</div>";
  }
  function monthsWithPosts() {
    var set = {};
    posts().forEach(function (p) { if (p.day) set[p.day.slice(0, 7)] = 1; });
    set[today().slice(0, 7)] = 1;
    return Object.keys(set).sort();
  }


  /* ---------- Watch & Listen: a pasted link becomes a player ---------- */
  function mediaItems() { return ((D.media || {}).items || []); }
  function mediaInfo(it) {
    var M = window.AlyxMedia;
    var meta = it.meta || {};
    var info = M ? M.parse(it.file || it.url, meta) : { type: "card", shelf: "watch", category: "Video", platform: "", ratio: "16 / 9" };
    if (it.file && !/^https?:/.test(it.file)) info.file = it.file;
    if (it.shelf && it.shelf !== "auto") info.shelf = it.shelf;
    if (it.category && it.category !== "auto") info.category = it.category;
    info.cover = it.cover || meta.cover || info.thumb || "";
    info.title = it.title || meta.title || "";
    info.author = meta.author || "";
    info.link = it.url || "";
    info.id = it.id;
    return info;
  }
  function mediaOn(shelf) { return mediaItems().map(function (it) { var i = mediaInfo(it); i.item = it; return i; }).filter(function (i) { return i.shelf === shelf; }); }
  var AUTOPLAY_OK = true;
  try { AUTOPLAY_OK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !(navigator.connection && navigator.connection.saveData); } catch (e) {}
  /* the player itself: a cover you tap (videos), the platform's own player (music), or a card */
  function player(info, opts) {
    opts = opts || {};
    var M = window.AlyxMedia || { ALLOW: "autoplay; encrypted-media; fullscreen; picture-in-picture" };
    var tag = info.platform ? '<span class="m-tag">' + esc(info.platform) + "</span>" : "";
    if ((info.type === "video" || info.type === "short") && (info.src || info.file)) {
      var auto = opts.auto !== false && AUTOPLAY_OK && (D.settings || {}).media_autoplay !== false && (info.auto || info.file) ? ' data-auto="' + esc(info.file ? "file" : info.auto) + '"' : "";
      var cover = info.cover ? '<img src="' + esc(asset(info.cover)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '<span class="m-blank">' + esc(info.platform || "Video") + "</span>";
      return '<div class="mplay' + (info.type === "short" ? " tall" : "") + '" style="--r:' + esc(info.ratio) + '" data-act="mplay"' +
        (info.file ? ' data-file="' + esc(asset(info.file)) + '"' : ' data-src="' + esc(info.src) + '"') + auto +
        ' role="button" tabindex="0" aria-label="Play ' + esc(info.title || info.platform || "video") + '">' + cover +
        '<span class="m-play" aria-hidden="true"></span>' + tag + "</div>";
    }
    if (info.type === "audio" && info.src) {
      return '<iframe class="m-audio" src="' + esc(info.src) + '" height="' + (info.height || 152) + '" loading="lazy" allow="' + M.ALLOW + '" title="' + esc(info.title || info.platform) + '" frameborder="0"></iframe>';
    }
    if (info.type === "audio" && info.file) return trackRow(info, opts.queue || "one", opts.index || 0);
    // anything else: a picture card that opens the original
    return '<a class="m-card" href="' + esc(info.link) + '" target="_blank" rel="noopener">' +
      (info.cover ? '<span class="m-card-pic">' + pic(info.cover, "") + "</span>" : "") +
      '<span class="m-card-text"><span class="m-card-title">' + esc(info.title || hostOf(info.link)) + "</span>" +
      '<span class="m-card-src">' + esc(info.platform || hostOf(info.link)) + ' <span class="ext">↗</span></span></span></a>';
  }
  /* songs and recordings uploaded to the site: a row with a play button, played by the bar at the bottom */
  var QUEUES = {};
  function trackRow(info, q, i) {
    (QUEUES[q] = QUEUES[q] || [])[i] = { src: asset(info.file), title: info.title || "Untitled", cover: info.cover ? asset(info.cover) : "", by: info.author || (D.settings || {}).name || "" };
    var on = PLAYER.q === q && PLAYER.i === i;
    return '<div class="track' + (on ? " on" : "") + '" data-q="' + esc(q) + '" data-i="' + i + '">' +
      '<button type="button" class="t-play" data-act="track" data-q="' + esc(q) + '" data-i="' + i + '" aria-label="Play ' + esc(info.title) + '">' +
        (info.cover ? pic(info.cover, "") : '<span class="t-blank">♪</span>') + '<span class="t-btn" aria-hidden="true"></span></button>' +
      '<span class="t-text"><span class="t-title">' + esc(info.title || "Untitled") + "</span>" +
      '<span class="t-by">' + esc([info.author || (info.platform !== "File" && info.platform) || (D.settings || {}).name || "", info.item && info.item.date ? fmtDay(info.item.date) : ""].filter(Boolean).join(" · ")) + "</span></span></div>";
  }
  function mediaCaption(info, withEdit) {
    var it = info.item || {};
    var bits = it.date ? fmtDay(it.date) : "";
    return '<div class="m-cap">' +
      (info.title && info.type !== "card" ? '<p class="m-title">' + esc(info.title) + "</p>" : "") +
      (it.note ? '<p class="m-note">' + esc(it.note) + "</p>" : "") +
      '<p class="m-meta">' + esc(bits) + (info.link && info.type !== "card" ? (bits ? " · " : "") + '<a href="' + esc(info.link) + '" target="_blank" rel="noopener">' + esc(info.platform || "Open") + " ↗</a>" : "") +
      (withEdit && OWNER && !PREVIEW && it.id ? ' <button type="button" class="mini-btn" data-act="edit" data-kind="media" data-id="' + esc(it.id) + '">Edit</button>' + deskBtn("content/media/" + it.id + ".json", it) + hiddenBtn("content/media/" + it.id + ".json", it) : "") + "</p></div>";
  }
  function mediaFigure(info, cls, opts) {
    return '<figure class="m-item ' + (cls || "") + '" id="m-' + esc(info.id || "") + '">' + player(info, opts) + mediaCaption(info, true) + "</figure>";
  }
  function watchGrid(list, opts) {
    opts = opts || {};
    var wide = list.filter(function (i) { return i.type !== "short"; }), tall = list.filter(function (i) { return i.type === "short"; });
    var html = "";
    if (opts.feature && wide.length) html += mediaFigure(wide.shift(), "feature");
    if (wide.length) html += '<div class="mgrid">' + wide.map(function (i) { return mediaFigure(i, ""); }).join("") + "</div>";
    if (tall.length) html += (opts.label !== false && wide.length + (opts.feature ? 1 : 0) ? '<h2 class="block-title m-sub">Shorts</h2>' : "") +
      '<div class="mshorts">' + tall.map(function (i) { return mediaFigure(i, ""); }).join("") + "</div>";
    return html;
  }
  function listenList(list, q) {
    var files = list.filter(function (i) { return i.type === "audio" && i.file && !i.src; });
    var others = list.filter(function (i) { return files.indexOf(i) < 0; });
    var html = "";
    if (files.length) {
      html += '<div class="tracks">' + (files.length > 1 ? '<p class="t-all"><button type="button" class="pill solid" data-act="track" data-q="' + esc(q) + '" data-i="0">▶ Play all</button></p>' : "") +
        files.map(function (i, k) {
          var it = i.item || {}, edit = OWNER && !PREVIEW && it.id ? ' <button type="button" class="mini-btn" data-act="edit" data-kind="media" data-id="' + esc(it.id) + '">Edit</button>' : "";
          return '<div class="t-wrap">' + trackRow(i, q, k) + (it.note || edit ? '<p class="m-note t-note">' + esc(it.note || "") + edit + "</p>" : "") + "</div>";
        }).join("") + "</div>";
    }
    if (others.length) html += '<div class="mlisten">' + others.map(function (i) { return mediaFigure(i, i.type === "card" ? "is-card" : ""); }).join("") + "</div>";
    return html;
  }

  /* the bar at the bottom that plays uploaded songs, one after another */
  var PLAYER = { q: "", i: -1, el: null, audio: null };
  function playTrack(q, i) {
    var list = QUEUES[q] || [], t = list[i];
    if (!t) return;
    if (!PLAYER.el) {
      PLAYER.el = document.createElement("div");
      PLAYER.el.className = "mbar"; PLAYER.el.hidden = true;
      PLAYER.el.innerHTML = '<span class="mb-pic"></span><span class="mb-text"><span class="mb-title"></span><span class="mb-by"></span></span>' +
        '<span class="mb-btns"><button type="button" data-mb="prev" aria-label="Previous">⏮</button><button type="button" data-mb="toggle" class="mb-main" aria-label="Pause">❚❚</button><button type="button" data-mb="next" aria-label="Next">⏭</button></span>' +
        '<input class="mb-seek" type="range" min="0" max="1000" value="0" aria-label="Position"><button type="button" class="mb-x" data-mb="close" aria-label="Close">×</button>';
      document.body.appendChild(PLAYER.el);
      PLAYER.audio = new Audio();
      PLAYER.audio.preload = "metadata";
      var seek = PLAYER.el.querySelector(".mb-seek"), main = PLAYER.el.querySelector(".mb-main");
      PLAYER.audio.addEventListener("timeupdate", function () { if (PLAYER.audio.duration) seek.value = Math.round(PLAYER.audio.currentTime / PLAYER.audio.duration * 1000); });
      PLAYER.audio.addEventListener("play", function () { main.textContent = "❚❚"; main.setAttribute("aria-label", "Pause"); markTracks(); });
      PLAYER.audio.addEventListener("pause", function () { main.textContent = "▶"; main.setAttribute("aria-label", "Play"); markTracks(); });
      PLAYER.audio.addEventListener("ended", function () { if ((QUEUES[PLAYER.q] || [])[PLAYER.i + 1]) playTrack(PLAYER.q, PLAYER.i + 1); });
      seek.addEventListener("input", function () { if (PLAYER.audio.duration) PLAYER.audio.currentTime = seek.value / 1000 * PLAYER.audio.duration; });
      PLAYER.el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-mb]"); if (!b) return;
        var k = b.getAttribute("data-mb");
        if (k === "toggle") { if (PLAYER.audio.paused) PLAYER.audio.play(); else PLAYER.audio.pause(); }
        if (k === "next" && (QUEUES[PLAYER.q] || [])[PLAYER.i + 1]) playTrack(PLAYER.q, PLAYER.i + 1);
        if (k === "prev") { if (PLAYER.audio.currentTime > 3 || PLAYER.i === 0) PLAYER.audio.currentTime = 0; else playTrack(PLAYER.q, PLAYER.i - 1); }
        if (k === "close") { PLAYER.audio.pause(); PLAYER.el.hidden = true; document.documentElement.classList.remove("has-mbar"); PLAYER.q = ""; PLAYER.i = -1; markTracks(); }
      });
    }
    if (PLAYER.q === q && PLAYER.i === i && PLAYER.audio.src) { if (PLAYER.audio.paused) PLAYER.audio.play(); else PLAYER.audio.pause(); return; }
    PLAYER.q = q; PLAYER.i = i;
    stopAutoVideo();
    PLAYER.audio.src = t.src;
    PLAYER.audio.play().catch(function () {});
    PLAYER.el.querySelector(".mb-pic").innerHTML = t.cover ? '<img src="' + esc(t.cover) + '" alt="">' : "♪";
    PLAYER.el.querySelector(".mb-title").textContent = t.title;
    PLAYER.el.querySelector(".mb-by").textContent = t.by;
    PLAYER.el.hidden = false;
    document.documentElement.classList.add("has-mbar");
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.by, artwork: t.cover ? [{ src: t.cover }] : [] });
        navigator.mediaSession.setActionHandler("nexttrack", function () { playTrack(PLAYER.q, PLAYER.i + 1); });
        navigator.mediaSession.setActionHandler("previoustrack", function () { if (PLAYER.i > 0) playTrack(PLAYER.q, PLAYER.i - 1); }); } catch (e) {}
    }
  }
  function markTracks() {
    var playing = PLAYER.audio && !PLAYER.audio.paused;
    app.querySelectorAll(".track").forEach(function (el) {
      var on = el.getAttribute("data-q") === PLAYER.q && +el.getAttribute("data-i") === PLAYER.i;
      el.classList.toggle("on", on); el.classList.toggle("playing", on && playing);
    });
  }

  /* videos: tap to play with sound; the one in the middle of the screen plays by itself, silently */
  var AUTO = { el: null, io: null };
  function frameHTML(src) {
    return '<iframe src="' + esc(src) + '" allow="' + ((window.AlyxMedia || {}).ALLOW || "autoplay; fullscreen") + '" allowfullscreen frameborder="0" title="Video"></iframe>';
  }
  function startVideo(el, muted) {
    if (el.getAttribute("data-live") === (muted ? "auto" : "user")) return;
    stopVideoIn(el);
    var file = el.getAttribute("data-file"), layer = document.createElement("div");
    layer.className = "m-live";
    if (file) layer.innerHTML = '<video src="' + esc(file) + '" playsinline ' + (muted ? "muted loop autoplay" : "controls autoplay") + "></video>";
    else layer.innerHTML = frameHTML(muted ? el.getAttribute("data-auto") : el.getAttribute("data-src"));
    el.appendChild(layer);
    el.setAttribute("data-live", muted ? "auto" : "user");
    if (!muted && PLAYER.audio && !PLAYER.audio.paused) PLAYER.audio.pause();
  }
  function stopVideoIn(el) { var l = el.querySelector(".m-live"); if (l) l.remove(); el.removeAttribute("data-live"); }
  function stopAutoVideo() { if (AUTO.el && AUTO.el.getAttribute("data-live") === "auto") stopVideoIn(AUTO.el); AUTO.el = null; }
  function wireMedia() {
    if (AUTO.io) AUTO.io.disconnect();
    AUTO.el = null;
    var els = app.querySelectorAll(".mplay[data-auto]");
    if (!els.length || !("IntersectionObserver" in window)) return;
    AUTO.io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var el = en.target;
        if (el.getAttribute("data-live") === "user") return;
        if (en.intersectionRatio >= 0.7) {
          if (PLAYER.audio && !PLAYER.audio.paused) return; // a song is playing: don't start videos
          if (AUTO.el && AUTO.el !== el) stopAutoVideo();
          AUTO.el = el; startVideo(el, true);
        } else if (en.intersectionRatio < 0.3 && AUTO.el === el) stopAutoVideo();
      });
    }, { threshold: [0, 0.3, 0.7, 1] });
    els.forEach(function (el) { AUTO.io.observe(el); });
  }

  /* ---------- lightbox ---------- */
  var LB = { items: [], i: 0 };
  function openLightbox(items, i) {
    LB.items = items; LB.i = i || 0;
    var box = document.getElementById("lightbox");
    if (!box) {
      box = document.createElement("div");
      box.id = "lightbox";
      box.className = "lightbox";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      document.body.appendChild(box);
      box.addEventListener("click", function (e) {
        var t = e.target.closest("[data-lb]");
        if (t) { e.preventDefault(); var k = t.getAttribute("data-lb"); if (k === "close") closeLightbox(); else stepLightbox(k === "next" ? 1 : -1); return; }
        if (e.target === box) closeLightbox();
      });
      document.addEventListener("keydown", function (e) {
        if (!document.getElementById("lightbox") || box.hidden) return;
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowRight") stepLightbox(1);
        if (e.key === "ArrowLeft") stepLightbox(-1);
      });
    }
    box.hidden = false;
    document.documentElement.classList.add("lb-open");
    drawLightbox();
  }
  function stepLightbox(d) { LB.i = (LB.i + d + LB.items.length) % LB.items.length; drawLightbox(); }
  function closeLightbox() { var b = document.getElementById("lightbox"); if (b) b.hidden = true; document.documentElement.classList.remove("lb-open"); }
  function drawLightbox() {
    var it = LB.items[LB.i] || {}, box = document.getElementById("lightbox");
    var dls = (it.downloads || []).filter(function (x) { return x.url; }).map(function (x) {
      return '<a class="pill light" href="' + esc(asset(x.url)) + '" download>' + esc(x.label) + "</a>";
    }).join("");
    box.innerHTML =
      '<button type="button" class="lb-close" data-lb="close" aria-label="Close">×</button>' +
      (LB.items.length > 1 ? '<button type="button" class="lb-nav prev" data-lb="prev" aria-label="Previous">‹</button><button type="button" class="lb-nav next" data-lb="next" aria-label="Next">›</button>' : "") +
      '<figure class="lb-fig">' + (it.src ? '<img src="' + esc(asset(it.src)) + '" alt="' + esc(it.title || "") + '">' : '<span class="blank lb-blank"></span>') +
        '<figcaption>' +
          (it.title ? '<span class="lb-title">' + esc(it.title) + "</span>" : "") +
          (it.text ? '<span class="lb-text">' + esc(it.text) + "</span>" : "") +
          (LB.items.length > 1 ? '<span class="lb-count">' + (LB.i + 1) + " / " + LB.items.length + "</span>" : "") +
          (dls ? '<span class="lb-dl">' + dls + "</span>" : "") +
          (it.link ? '<span class="lb-dl">' + a(it.link, "Open ↗", "pill light") + "</span>" : "") +
        "</figcaption></figure>";
  }

  /* ---------- pages ---------- */
  var TILE_LIMIT = 4;
  var BLOCK = {
    updates: function (b, s, i) {
      var by = activity(), days = Object.keys(by).sort();
      var months = {}; days.forEach(function (d) { months[d.slice(0, 7)] = 1; }); months[today().slice(0, 7)] = 1;
      months = Object.keys(months).sort();
      var month = STATE.uMonth && months.indexOf(STATE.uMonth) > -1 ? STATE.uMonth : months[months.length - 1];
      var mi = months.indexOf(month);
      var inMonth = days.filter(function (d) { return d.slice(0, 7) === month; });
      var sel = STATE.uDay && STATE.uDay.slice(0, 7) === month ? STATE.uDay : inMonth[inMonth.length - 1] || "";
      var parts = month.split("-"), y = +parts[0], m = +parts[1];
      var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, n = new Date(y, m, 0).getDate(), cells = "";
      for (var k = 0; k < lead; k++) cells += '<span class="u-cell empty" aria-hidden="true"></span>';
      var used = {};
      for (var d = 1; d <= n; d++) {
        var key = month + "-" + pad(d), ups = by[key] || [];
        var secs = []; ups.forEach(function (u) { if (secs.indexOf(u.key) < 0) secs.push(u.key); used[u.key] = 1; });
        var cls = "u-cell" + (ups.length ? " has" : "") + (key === sel ? " sel" : "") + (key === today() ? " today" : "");
        cells += ups.length
          ? '<button type="button" class="' + cls + '" data-act="u-day" data-day="' + key + '" aria-label="' + esc(fmtDay(key) + ": " + secs.map(title).join(", ")) + '">' +
              '<span class="u-num">' + d + '</span><span class="u-marks">' + secs.map(function (x) { return '<span class="u-mark" title="' + esc(title(x)) + '">' + esc(mark(x)) + "</span>"; }).join("") + "</span></button>"
          : '<span class="' + cls + '"><span class="u-num">' + d + "</span></span>";
      }
      var legend = Object.keys(used).map(function (x) { return '<span><b class="u-mark">' + esc(mark(x)) + "</b> " + esc(title(x)) + "</span>"; }).join("");
      var list = sel ? (by[sel] || []).map(function (u) {
        return '<li><a href="' + esc(u.url) + '"><span class="u-sec">' + esc(title(u.key)) + '</span><span class="u-what">' + esc(u.what) + "</span></a></li>";
      }).join("") : "";
      return '<section class="block updates">' + blockHead(b.title || "Updates", null, null, bt(b, i)) +
        '<div class="u-wrap"><div class="u-cal-col"><div class="cal-head">' +
          '<button type="button" class="cal-arrow" data-act="u-month" data-dir="-1" aria-label="Previous month"' + (mi <= 0 ? " disabled" : "") + ">‹</button>" +
          '<h3 class="cal-title">' + esc(fmtMonth(month)) + "</h3>" +
          '<button type="button" class="cal-arrow" data-act="u-month" data-dir="1" aria-label="Next month"' + (mi >= months.length - 1 ? " disabled" : "") + ">›</button></div>" +
          '<div class="u-cal">' + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (w) { return '<span class="cal-wd">' + w + "</span>"; }).join("") + cells + "</div>" +
          (legend ? '<p class="u-legend">' + legend + "</p>" : "") + "</div>" +
          '<div class="u-day" aria-live="polite">' + (sel ? '<h3 class="day-head">' + esc(fmtDay(sel)) + '</h3><ul class="u-list">' + list + "</ul>" : '<p class="empty">Nothing new this month yet.</p>') + "</div>" +
        "</div></section>";
    },
    hero: function (b, s, i) {
      var line = b.show_tagline !== false && (s.tagline || EDIT) ? '<p class="hero-line"' + ed("data/settings.json#tagline", s, "tagline", "A line under the logo (optional)") + ">" + esc(s.tagline || "") + "</p>" : "";
      if (b.show_logo === false && !line) return "";
      return '<section class="hero' + (b.show_logo === false ? " no-logo" : "") + '">' +
        (b.show_logo === false ? "" : '<img class="hero-logo" src="' + esc(asset(s.logo_large || "assets/img/logo.png")) + '" alt="' + esc(s.name) + '">') +
        line + "</section>";
    },
    index: function (b, s, i) {
      var items = sections().filter(function (x) { return x.in_menu !== false; }).map(function (x) {
        return '<li><a href="' + esc(href(x.key)) + '"><span class="ix-name">' + esc(x.title) +
          '</span><span class="ix-note">' + esc(x.short || "") + "</span></a></li>";
      }).join("");
      return '<section class="block">' + blockHead(b.title || (EDIT ? "" : ""), null, null, bt(b, i)) + '<ul class="index">' + items + "</ul></section>";
    },
    daily: function (b, s, i) {
      var ps = posts().slice(0, num(b.count, 6));
      if (!ps.length) return "";
      var cards = ps.map(function (p) {
        var img = list(p.images)[0] || (p.link && p.link.url ? mediaInfo({ url: p.link.url, meta: p.link.meta }).cover : "");
        return '<li><a class="mini-post" href="' + esc(href("daily", "p-" + p.id)) + '">' +
          (img ? '<span class="mini-pic">' + pic(img, "") + "</span>" : '<span class="mini-text">' + esc(cut(plain(p.text) || (p.audio ? "♪ Voice note" : p.link && p.link.title) || "", 90)) + "</span>") +
          '<span class="mini-date">' + esc(fmtDay(p.day)) + "</span></a></li>";
      }).join("");
      return '<section class="block">' + blockHead(b.title || title("daily"), href("daily"), "Calendar", bt(b, i)) + '<ul class="mini-posts">' + cards + "</ul></section>";
    },
    ongoing: function (b, s, i) {
      var ps = ((D.ongoing || {}).projects || []).slice(0, num(b.count, 3));
      if (!ps.length) return "";
      return '<section class="block">' + blockHead(b.title || title("ongoing"), href("ongoing"), "See all", bt(b, i)) +
        tiles(ps.map(projectTile), "4 / 5", 3) + "</section>";
    },
    visual: function (b, s, i) {
      var imgs = [];
      ((D.visual || {}).series || []).forEach(function (s) {
        list(s.images).forEach(function (im) { imgs.push({ title: im.title, image: im.image, url: href("visual", "s-" + s.id) }); });
      });
      imgs = imgs.slice(0, num(b.count, 4));
      if (!imgs.length) return "";
      return '<section class="block">' + blockHead(b.title || title("visual"), href("visual"), "See all", bt(b, i)) +
        tiles(imgs, shape("visual", "3 / 4"), 4) + "</section>";
    },
    design: function (b, s, i) {
      var its = ((D.design || {}).items || []).slice(0, num(b.count, 3));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("design"), href("design"), "See all", bt(b, i)) +
        tiles(its.map(function (x) { return { title: x.title, note: fmtDay(x.date), image: list(x.images)[0], url: href("design", "d-" + x.id) }; }),
          shape("design", "4 / 5"), 4) + "</section>";
    },
    store: function (b, s, i) {
      var its = ((D.store || {}).items || []).slice(0, num(b.count, 4));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("store"), href("store"), "See all", bt(b, i)) +
        tiles(its, shape("store", "4 / 5"), 4, storeAction) + "</section>";
    },
    books: function (b, s, i) {
      var its = ((D.books || {}).items || []).slice(0, num(b.count, 4));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("books"), href("books"), "See all", bt(b, i)) +
        tiles(its, shape("books", "2 / 3"), 4, function (it) { return linkPills(it.links); }) + "</section>";
    },
    watch: function (b, s, i) {
      var its = mediaOn("watch").slice(0, num(b.count, 3));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("watch"), href("watch"), "See all", bt(b, i)) + watchGrid(its, { label: false }) + "</section>";
    },
    listen: function (b, s, i) {
      var its = mediaOn("listen").slice(0, num(b.count, 4));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("listen"), href("listen"), "See all", bt(b, i)) + listenList(its, "home-listen") + "</section>";
    },
    follow: function (b, s, i) {
      var ls = followLinks();
      if (!ls.length) return "";
      return '<section class="block">' + blockHead(b.title || title("follow"), href("follow"), "All", bt(b, i)) +
        '<p class="links big">' + ls.map(function (l) { return a(l.url, esc(l.label) + arrow(l.url), "pill"); }).join("") + "</p></section>";
    },
    text: function (b, s, i) {
      if (!b.title && !b.body && !EDIT) return "";
      return '<section class="block text-block' + (b.align === "center" ? " center" : "") + '">' +
        (b.title || EDIT ? '<h2 class="text-title"' + ed("data/settings.json#home_blocks[" + i + "].title", b, "title", "Title (optional)") + ">" + esc(b.title || "") + "</h2>" : "") +
        (b.body ? '<div class="prose"' + (EDIT ? ' data-act="block" data-i="' + i + '" title="Click to edit"' : "") + ">" + md(b.body) + "</div>"
          : EDIT ? '<p class="blk-hint" data-act="block" data-i="' + i + '">Click to write…</p>' : "") + "</section>";
    },
    image: function (b, s, i) {
      if (!b.image) return EDIT ? '<section class="block"><p class="blk-hint" data-act="block" data-i="' + i + '">Click to add a picture</p></section>' : "";
      var img = '<img src="' + esc(asset(b.image)) + '" alt="' + esc(b.caption || "") + '" loading="lazy">';
      return '<section class="block image-block ' + esc(b.size || "wide") + '"><figure>' +
        (b.url ? a(b.url, img, "image-link") : img) +
        (b.caption || EDIT ? "<figcaption" + ed("data/settings.json#home_blocks[" + i + "].caption", b, "caption", "Caption (optional)") + ">" + esc(b.caption || "") + "</figcaption>" : "") + "</figure></section>";
    },
    spacer: function (b, s, i) {
      var h = { small: 24, medium: 64, large: 128 }[b.size || "medium"] || 64;
      return '<div class="spacer" style="height:' + h + 'px" aria-hidden="true"></div>';
    }
  };
  function bt(b, i) { return ed("data/settings.json#home_blocks[" + i + "].title", b, "title", "Title"); }
  function blockHead(t, moreHref, moreLabel, attrs) {
    if (!t && !moreHref && !attrs) return "";
    return '<div class="block-head"><h2 class="block-title"' + (attrs || "") + ">" + esc(t || "") + "</h2>" +
      (moreHref ? '<a class="more" href="' + esc(moreHref) + '">' + esc(moreLabel) + "</a>" : "") + "</div>";
  }
  /* ---------- what was updated on which day (home calendar) ---------- */
  function activity() {
    var by = {};
    var add = function (day, key, what, url) { day = String(day || "").slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return; (by[day] = by[day] || []).push({ key: key, what: what, url: url }); };
    posts().forEach(function (p) { add(p.day, "daily", cut(plain(p.text) || (p.link && p.link.title) || (list(p.images).length ? "Photos" : p.audio ? "Voice note" : "Post"), 70), href("daily", "p-" + p.id)); });
    var projects = {}; ((D.ongoing || {}).projects || []).forEach(function (p) { projects[p.id] = p; });
    // several entries in one collection on the same day: one line, "6 new"
    var perDay = {};
    ((D.ongoing || {}).recent || []).forEach(function (e) {
      var pr = projects[e.project]; if (!pr) return;
      var k = String(e.date || "").slice(0, 10) + "|" + e.project;
      (perDay[k] = perDay[k] || { day: e.date, pr: pr, list: [] }).list.push(e);
    });
    Object.keys(perDay).forEach(function (k) {
      var g = perDay[k], e = g.list[0];
      add(g.day, "ongoing", g.pr.title + " · " + (g.list.length > 1 ? g.list.length + " new" : e.title || "No. " + (e.number || "")),
        href("ongoing", g.list.length > 1 ? g.pr.id : g.pr.id + "/" + e.id));
    });
    mediaItems().forEach(function (m) { var i = mediaInfo(m); add(m.date, i.shelf, i.title || i.platform || "New", href(i.shelf, "m-" + m.id)); });
    ((D.design || {}).items || []).forEach(function (x) { add(x.date, "design", x.title, href("design", "d-" + x.id)); });
    ((D.visual || {}).series || []).forEach(function (x) { add(x.date, "visual", x.title, href("visual", "s-" + x.id)); });
    return by;
  }
  function mark(key) { var t = title(key) || key; return t.charAt(0).toUpperCase(); }

  var BLOCK_NAMES = { updates: "Updates calendar", hero: "Logo + line", index: "List of sections", daily: "Latest daily", ongoing: "Ongoing", watch: "Watch", listen: "Listen",
    visual: "Visual", design: "Design", store: "Store", books: "Books", follow: "Links to everywhere", text: "Text", image: "Picture", spacer: "Space" };
  function projectTile(p) {
    var meta = p.count + (p.count === 1 ? " entry" : " entries") + (p.updated ? " · " + fmtDay(p.updated) : "");
    return { pid: p.id, title: p.title, note: meta, image: p.cover, url: href("ongoing", p.id), badge: p.hidden ? "Hidden" : p.status === "finished" ? "Finished" : "" };
  }
  function storeAction(it) {
    var st = (it.status || "available").toLowerCase();
    var price = it.price ? '<span class="price">' + esc(it.price) + "</span>" : "";
    if (st === "sold out") return '<p class="buy">' + price + '<span class="state">Sold out</span></p>';
    if (st === "soon") return '<p class="buy">' + price + '<span class="state">Coming soon</span></p>';
    return '<p class="buy">' + price + (it.url ? a(it.url, (it.category === "Picks" ? "View" : "Buy") + arrow(it.url), "buy-btn") : '<span class="state">Available</span>') + "</p>";
  }

  var render = {
    home: function () {
      var s = D.settings || {};
      var blocks = s.home_blocks && s.home_blocks.length ? s.home_blocks : [{ type: "hero" }, { type: "daily" }, { type: "ongoing" }, { type: "visual" }, { type: "store" }, { type: "follow" }];
      return blocks.map(function (b, i) {
        var fn = b && BLOCK[b.type], html = fn ? fn(b, s, i) : "";
        if (!EDIT) return html;
        return '<div class="blk" data-blk="' + i + '" data-type="' + esc(b.type) + '">' +
          (html || '<p class="blk-empty">' + esc(BLOCK_NAMES[b.type] || b.type) + " · nothing to show yet</p>") + "</div>";
      }).join("") + (EDIT ? '<div class="blk-add-end"></div>' : "");
    },

    daily: function () {
      var h = hash(), byDay = postsByDay();
      var single = h.indexOf("p-") === 0 ? posts().filter(function (p) { return "p-" + p.id === h; })[0] : null;
      if (single) {
        return '<p class="reader-back"><a href="#' + esc(single.day) + '">← ' + esc(fmtDay(single.day)) + "</a></p>" +
          '<div class="single-post">' + postCard(single, { showDay: true }) + "</div>";
      }
      var view = h === "list" ? "list" : "calendar";
      var tools = '<div class="view-switch">' +
        '<a class="pill' + (view === "calendar" ? " on" : "") + '" href="#">Calendar</a>' +
        '<a class="pill' + (view === "list" ? " on" : "") + '" href="#list">All posts</a></div>';
      var dl = OWNER ? downloadBar("daily", ["zip", "epub", "pdf"], "Download all posts") : "";
      if (!posts().length && !EDIT) return pageHead("daily", tools) + emptyNote("First post soon.");

      if (view === "list") {
        var limit = STATE.dailyLimit || 30, shown = posts().slice(0, limit), lastDay = "";
        var html = shown.map(function (p) {
          var head = p.day !== lastDay ? '<h2 class="day-head">' + esc(fmtDay(p.day)) + "</h2>" : "";
          lastDay = p.day;
          return head + postCard(p);
        }).join("");
        var more = posts().length > limit ? '<p class="center"><button type="button" class="pill" data-act="more-posts">Show more</button></p>' : "";
        return pageHead("daily", tools) + dl + '<div class="timeline">' + html + "</div>" + more;
      }

      var sel = /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : (STATE.selDay || (posts()[0] || {}).day || today());
      STATE.selDay = sel;
      var month = STATE.month && !/^\d{4}-\d{2}-\d{2}$/.test(h) ? STATE.month : sel.slice(0, 7);
      STATE.month = month;
      var ms = monthsWithPosts(), mi = ms.indexOf(month);
      var nav = '<div class="cal-head">' +
        '<button type="button" class="cal-arrow" data-act="month" data-dir="-1" aria-label="Previous month"' + (mi <= 0 ? " disabled" : "") + ">‹</button>" +
        '<h2 class="cal-title">' + esc(fmtMonth(month)) + "</h2>" +
        '<button type="button" class="cal-arrow" data-act="month" data-dir="1" aria-label="Next month"' + (mi === -1 || mi >= ms.length - 1 ? " disabled" : "") + ">›</button></div>";
      var dayPosts = byDay[sel] || [];
      var panel = '<section class="day-panel" aria-live="polite"><h2 class="day-head">' + esc(fmtDay(sel)) + "</h2>" +
        (EDIT ? '<div id="journal-day"></div><h3 class="block-title j-pub">Public posts · everyone can see</h3>' : "") +
        (dayPosts.length ? dayPosts.map(function (p) { return postCard(p); }).join("") : emptyNote(EDIT ? "No public post this day." : "Nothing posted this day.")) +
        (EDIT ? '<p class="owner-tools"><button type="button" class="pill" data-act="new" data-kind="daily" data-day="' + sel + '">+ Public post for this day</button></p>' : "") + "</section>";
      return pageHead("daily", tools) + dl + (EDIT ? '<div id="journal-month"></div>' : "") +
        '<div class="daily-wrap"><div class="cal-col">' + nav + calendar(month, byDay, sel) + "</div>" + panel + "</div>";
    },

    ongoing: function () {
      var h = hash(), parts = h.split("/"), pid = parts[0];
      var projects = (D.ongoing || {}).projects || [];
      if (pid && projects.some(function (p) { return p.id === pid; })) {
        if (!D.project || D.project.project.id !== pid) {
          loadProject(pid).then(function () { draw(); });
          return pageHead("ongoing") + '<p class="empty">Loading…</p>';
        }
        return projectView(D.project, parts[1]);
      }
      var all = OWNER ? '<div class="dl-bar"><span class="dl-label">Owner</span><button type="button" class="pill" data-act="export-all">Download everything</button></div>' : "";
      return pageHead("ongoing") + all + addButton("+ New collection", 'data-act="new" data-kind="project"') +
        (projects.length ? tiles(projects.map(projectTile), "4 / 5", 3, EDIT ? function (it) {
          var pr = ((D.ongoing || {}).projects || []).filter(function (x) { return x.id === it.pid; })[0];
          return '<p class="tile-more"><button type="button" class="mini-btn" data-act="sheet" data-sheet="project" data-id="' + esc(it.pid) + '">Settings</button>' + hiddenBtn("content/projects/" + it.pid + ".json", pr) + "</p>";
        } : null) : emptyNote());
    },

    watch: function () {
      var all = mediaOn("watch"), plats = [];
      all.forEach(function (i) { if (i.platform && plats.indexOf(i.platform) < 0) plats.push(i.platform); });
      var cur = plats.indexOf(STATE.watchPlat) > -1 ? STATE.watchPlat : "All";
      var shown = all.filter(function (i) { return cur === "All" || i.platform === cur; });
      return pageHead("watch") + chips(plats, cur, "watch-plat") + addButton("+ Add a video", 'data-act="new" data-kind="media" data-shelf="watch"') + (shown.length ? watchGrid(shown, { feature: true }) : emptyNote());
    },

    listen: function () {
      var all = mediaOn("listen"), cats = [];
      all.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
      var cur = cats.indexOf(STATE.listenCat) > -1 ? STATE.listenCat : "All";
      var shown = all.filter(function (i) { return cur === "All" || i.category === cur; });
      return pageHead("listen") + chips(cats, cur, "listen-cat") + addButton("+ Add music or a podcast", 'data-act="new" data-kind="media" data-shelf="listen"') + (shown.length ? listenList(shown, "listen:" + cur) : emptyNote());
    },

    books: function () {
      var its = (D.books || {}).items || [];
      // one book: cover, about, links and the PDF
      var bm = hash().match(/^b-(\d+)$/), book = bm ? its[+bm[1]] : null;
      if (book) {
        var bi = +bm[1], canPdf = book.pdf && (book.pdf_access !== "private" || OWNER);
        return '<p class="reader-back"><a href="' + esc(href("books")) + '">← ' + esc(title("books")) + "</a></p>" +
          '<article class="book-page"><div class="book-cover">' + (book.image ? '<img src="' + esc(asset(book.image)) + '" alt="' + esc(book.title) + '">' : '<span class="blank"></span>') + "</div>" +
          '<div class="book-info"><p class="series-meta">' + esc(book.category || "") + "</p><h1>" + esc(book.title || "") + "</h1>" +
            (book.note ? '<p class="intro">' + esc(book.note) + "</p>" : "") +
            (book.about ? '<div class="prose">' + md(book.about) + "</div>" : "") +
            (canPdf ? '<p class="links"><a class="pill solid" href="' + esc(asset(book.pdf)) + '" target="_blank" rel="noopener">Read the PDF</a><a class="pill" href="' + esc(asset(book.pdf)) + '" download>Download PDF</a>' +
              (book.pdf_access === "private" ? ' <span class="mini-btn hid">only you</span>' : "") + "</p>" : "") +
            linkPills(book.links) + listTools("books", bi, its.length) + "</div></article>";
      }
      var cats = []; its.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
      var cur = STATE.bookCat || "All";
      var shown = its.filter(function (i) { return cur === "All" || i.category === cur; });
      return pageHead("books") + chips(cats, cur, "book-cat", "books") + addButton("+ New book", 'data-act="item" data-file="books"') +
        (shown.length ? tiles(shown.map(function (it) { return Object.assign({}, it, { url: href("books", "b-" + its.indexOf(it)), _i: its.indexOf(it) }); }), shape("books", "2 / 3"), cols("books", 4), function (it) {
          var pdf = it.pdf && (it.pdf_access !== "private" || OWNER) ? '<a class="pill" href="' + esc(asset(it.pdf)) + '" target="_blank" rel="noopener">PDF</a>' : "";
          return (pdf ? '<p class="links">' + pdf + "</p>" : "") + linkPills(it.links) + listTools("books", it._i, its.length);
        }) : emptyNote());
    },

    visual: function () {
      // the inspiration board: only for you, saved privately (assets/js/inspo.js)
      var insp = EDIT && hash() === "inspiration";
      var tabs = EDIT ? '<div class="chips in-tabs"><a class="chip' + (insp ? "" : " on") + '" href="#">Series</a><a class="chip' + (insp ? " on" : "") + '" href="#inspiration">Inspiration · only you</a></div>' : "";
      if (insp) return pageHead("visual") + tabs + '<div id="inspo" class="inspo"></div>';
      var series = (D.visual || {}).series || [];
      var kinds = []; series.forEach(function (s) { if (s.kind && kinds.indexOf(s.kind) < 0) kinds.push(s.kind); });
      var cur = STATE.visualKind || "All";
      var html = series.filter(function (s) { return cur === "All" || s.kind === cur; }).map(function (s) {
        var imgs = list(s.images);
        var can = s.download === "public" || OWNER;
        var dl = can && imgs.length ? downloadBar("visual:" + s.id, ["zip"], "Download series") : "";
        var vp = "content/visual/" + s.id + ".json#";
        return '<section class="series" id="s-' + esc(s.id) + '">' +
          '<div class="series-head"><h2 class="series-title"' + ed(vp + "title", s, "title", "Series name") + ">" + esc(s.title) + "</h2>" +
          '<p class="series-meta">' + esc([s.kind, imgs.length + (imgs.length === 1 ? " image" : " images")].filter(Boolean).join(" · ")) + "</p>" +
          (s.note || EDIT ? '<p class="intro"' + ed(vp + "note", s, "note", "A line about this series (optional)", true) + ">" + esc(s.note || "") + "</p>" : "") + dl +
          (EDIT ? '<p class="owner-tools"><button type="button" class="pill solid" data-act="new" data-kind="visual" data-id="' + esc(s.id) + '">+ Add images</button> ' +
            '<button type="button" class="mini-btn" data-act="sheet" data-sheet="series" data-id="' + esc(s.id) + '">Series settings</button>' + deskBtn("content/visual/" + s.id + ".json", s) + hiddenBtn("content/visual/" + s.id + ".json", s) + "</p>" : "") + "</div>" +
          (imgs.length ? tiles(imgs.map(function (im, i) {
            return { title: im.title, image: im.image, i: i, act: 'data-act="lightbox" data-src="visual:' + esc(s.id) + '" data-i="' + i + '"' };
          }), shape("visual", "3 / 4"), cols("visual", 4), EDIT ? function (it) {
            return '<p class="tile-more owner-row"><button type="button" class="mini-btn" data-act="sheet" data-sheet="vimage" data-id="' + esc(s.id) + '" data-i="' + it.i + '">Edit</button>' +
              (it.i > 0 ? '<button type="button" class="mini-btn" data-act="vimage-move" data-id="' + esc(s.id) + '" data-i="' + it.i + '" data-dir="-1" aria-label="Move earlier">←</button>' : "") +
              (it.i < imgs.length - 1 ? '<button type="button" class="mini-btn" data-act="vimage-move" data-id="' + esc(s.id) + '" data-i="' + it.i + '" data-dir="1" aria-label="Move later">→</button>' : "") + "</p>";
          } : null) : emptyNote()) + "</section>";
      }).join("");
      return pageHead("visual") + tabs + chips(kinds, cur, "visual-kind") + addButton("+ New series", 'data-act="new" data-kind="visual" data-id="__new"') + (html || emptyNote());
    },

    design: function () {
      var its = (D.design || {}).items || [];
      var dl = OWNER && its.length ? downloadBar("design", ["zip", "pdf"], "Download all") : "";
      return pageHead("design") + dl + addButton("+ New sketch", 'data-act="new" data-kind="design"') + (its.length ? tiles(its.map(function (x) {
        var n = list(x.images).length;
        return { id: x.id, src: x, title: x.title, note: [fmtDay(x.date), n > 1 ? n + " images" : ""].filter(Boolean).join(" · "), image: list(x.images)[0],
                 act: 'data-act="lightbox" data-src="design:' + esc(x.id) + '" data-i="0"' };
      }), shape("design", "4 / 5"), cols("design", 3), ownerEdit("design")) : emptyNote());
    },

    store: function () {
      var its = (D.store || {}).items || [];
      var cats = []; its.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
      var cur = STATE.storeCat || "All";
      var shown = its.filter(function (i) { return cur === "All" || i.category === cur; });
      return pageHead("store") + chips(cats, cur, "store-cat", "store") + addButton("+ New item", 'data-act="item" data-file="store"') +
        (shown.length ? tiles(shown, shape("store", "4 / 5"), cols("store", 4), function (it) { return storeAction(it) + listTools("store", its.indexOf(it), its.length); }) : emptyNote());
    },

    traces: function () {
      var t = D.traces || {}, its = t.items || [];
      var ORDER = ["Published", "Shown", "Talks", "Collaborations", "Memberships", "Mentions"];
      var groups = {};
      its.forEach(function (i) { var k = i.kind || "Mentions"; (groups[k] = groups[k] || []).push(i); });
      var kinds = ORDER.filter(function (k) { return groups[k]; }).concat(Object.keys(groups).filter(function (k) { return ORDER.indexOf(k) < 0; }));
      var summary = kinds.length ? '<p class="trace-sum">' + kinds.map(function (k) { return esc(k) + " " + groups[k].length; }).join(" · ") + "</p>" : "";
      var body = kinds.map(function (k) {
        var rows = groups[k].slice().sort(function (a, b) { return String(b.year || "").localeCompare(String(a.year || "")); });
        return '<section class="trace-group"><h2 class="block-title">' + esc(k) + '</h2><ol class="rows">' + rows.map(function (r) {
          return '<li class="row"><span class="row-date">' + esc(r.year || "") + '</span><span class="row-main">' +
            a(r.url, esc(r.title) + arrow(r.url), "row-title") + (r.where ? '<span class="row-note">' + esc(r.where) + "</span>" : "") + "</span>" +
            (EDIT ? '<span class="row-end"><button type="button" class="mini-btn" data-act="item" data-file="traces" data-i="' + its.indexOf(r) + '">Edit</button></span>' : "") + "</li>";
        }).join("") + "</ol></section>";
      }).join("");
      return pageHead("traces") +
        (t.note ? '<div class="prose trace-note"' + (EDIT ? ' data-act="sheet" data-sheet="traces-note" title="Click to edit"' : "") + ">" + md(t.note) + "</div>"
          : EDIT ? '<p class="blk-hint" data-act="sheet" data-sheet="traces-note">Click to write a few lines at the top (optional)</p>' : "") +
        addButton("+ Add a trace", 'data-act="item" data-file="traces"') + summary + (body || emptyNote());
    },

    follow: function () {
      var groups = ((D.follow || {}).groups || []).map(function (g, gi) {
        var ls = (g.links || []).filter(function (l) { return l && l.label && (l.url || EDIT); });
        if (!ls.length && !EDIT) return "";
        return '<section class="follow-group"><h2 class="block-title"' + ed("data/follow.json#groups[" + gi + "].name", g, "name", "Group name") + ">" + esc(g.name || "") + "</h2>" +
          (EDIT ? '<p class="owner-tools"><button type="button" class="mini-btn" data-act="item" data-file="follow" data-i="' + gi + '">Edit links</button></p>' : "") + '<ul class="follow-list">' +
          ls.map(function (l) {
            if (!l.url) return '<li class="f-off"><span class="f-name">' + esc(l.label) + '</span><span class="f-host">no link yet · not shown to visitors</span></li>';
            return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="f-name">' + esc(l.label) +
              '</span><span class="f-host">' + esc(l.handle || hostOf(l.url)) + ' ↗</span></a></li>';
          }).join("") + "</ul></section>";
      }).join("");
      var s = D.settings || {};
      return pageHead("follow") + (groups || emptyNote()) + addButton("+ New group", 'data-act="item" data-file="follow"') + (s.email ? '<p class="follow-mail">' + esc(s.email) + "</p>" : "");
    },

    write: function () {
      if (!EDIT) return '<div class="page-head"><h1>Private</h1><p class="intro">This page is only for the studio\'s owner.</p></div>';
      return '<div id="writer" class="writer"></div>';
    },

    locked: function () {
      var s = D.settings || {};
      return '<section class="curtain"><img class="curtain-logo" src="' + esc(asset(s.logo_large || "assets/img/logo.png")) + '" alt="' + esc(s.name) + '">' +
        '<p class="curtain-line">' + esc(s.locked_note || "Private for now. Back soon.") + "</p>" +
        (s.email ? '<p class="curtain-mail">' + esc(s.email) + "</p>" : "") + "</section>";
    },

    notfound: function () {
      return '<div class="page-head"><h1>Not here</h1><p class="intro">This page doesn\'t exist.</p></div>' +
        '<p class="links"><a class="pill" href="' + esc(href("home")) + '">Back to the studio</a></p>';
    }
  };

  /* ---------- ongoing projects ---------- */
  var SORT_LABEL = { "date-asc": "Oldest first", "date-desc": "Newest first", title: "A–Z", number: "By number" };
  function loadProject(id) {
    return getJSON("data/gen/ongoing-" + id + ".json").then(function (j) {
      D.project = localize(j || { project: { id: id }, entries: [] });
      mergeDraftsInto("project");
    });
  }
  function entryLabel(e, i) {
    return e.number !== "" && e.number != null ? "No. " + e.number : "No. " + (i + 1);
  }
  /* English / 中文 / side by side, for text written in Chinese */
  function readerTools(e) {
    var tools = "";
    if (hasEnglish(e) && (OWNER || (D.settings || {}).language_switch)) {
      var m = STATE.readMode || "main";
      tools += '<div class="read-modes" role="tablist">' +
        [["main", LANG === "zh" ? "中文" : "English"], ["other", LANG === "zh" ? "English" : "中文"], ["both", "对照 · Side by side"]].map(function (x) {
          return '<button type="button" role="tab" aria-selected="' + (m === x[0]) + '" class="chip' + (m === x[0] ? " on" : "") + '" data-act="readmode" data-val="' + x[0] + '">' + x[1] + "</button>";
        }).join("") + "</div>";
    }
    if (OWNER && !PREVIEW) tools += '<p class="owner-tools"><button type="button" class="pill" data-act="edit" data-kind="entry" data-id="' + esc(e.id) + '">Edit</button>' +
      deskBtn("content/entries/" + e.id + ".json", e, e.title_zh || e.title) + "</p>";
    return tools;
  }
  function readerBody(e) {
    var m = STATE.readMode || "main";
    var other = LANG === "zh" ? (e.text_en || null) : e.text_zh;
    // when the page shows Chinese, the English is the field the build wrote before localize() swapped it
    if (LANG === "zh" && e.text_zh) other = e.__en || null;
    if (m === "other" && other) return '<div class="prose">' + md(other) + "</div>";
    if (m === "both" && other) {
      var a = String(e.text || "").split(/\n{2,}/), b = String(other).split(/\n{2,}/);
      if (a.length === b.length) {
        return '<div class="bilingual">' + a.map(function (pa, i) {
          return '<div class="bi-row"><div class="prose">' + md(pa) + '</div><div class="prose alt">' + md(b[i]) + "</div></div>";
        }).join("") + "</div>";
      }
      return '<div class="bilingual cols"><div class="prose">' + md(e.text) + '</div><div class="prose alt">' + md(other) + "</div></div>";
    }
    return '<div class="prose">' + md(e.text) + "</div>";
  }
  function projectView(data, entryId) {
    var p = data.project, es = data.entries || [];
    var can = p.download === "public" || OWNER;
    var kind = p.kind || "mixed";
    var formats = kind === "image" ? ["pdf", "epub", "zip"] : ["epub", "pdf", "zip"];
    var head = '<p class="reader-back"><a href="' + esc(href("ongoing")) + '">← ' + esc(title("ongoing")) + "</a></p>" +
      '<div class="page-head"><h1' + ed("content/projects/" + p.id + ".json#title", p, "title", "Collection name") + ">" + esc(p.title) + "</h1>" +
      (p.note || EDIT ? '<p class="intro"' + ed("content/projects/" + p.id + ".json#note", p, "note", "A line about this collection (optional)", true) + ">" + esc(p.note || "") + "</p>" : "") +
      '<p class="series-meta">' + esc([es.length + (es.length === 1 ? " entry" : " entries"), SORT_LABEL[p.sort] || "", p.status === "finished" ? "Finished" : "Ongoing"].filter(Boolean).join(" · ")) + "</p>" +
      (can && es.length ? downloadBar("project:" + p.id, formats, "Download") : "") +
      (EDIT ? '<p class="owner-tools"><button type="button" class="pill solid" data-act="new" data-kind="entry" data-project="' + esc(p.id) + '">+ New entry</button> ' +
        '<button type="button" class="mini-btn" data-act="sheet" data-sheet="project" data-id="' + esc(p.id) + '">Collection settings</button>' + deskBtn("content/projects/" + p.id + ".json", p) + hiddenBtn("content/projects/" + p.id + ".json", p) + "</p>" : "") + "</div>";

    if (entryId) {
      var idx = -1; es.forEach(function (e, i) { if (e.id === entryId) idx = i; });
      if (idx > -1) {
        var e = es[idx];
        var prev = es[idx - 1] ? '<a href="#' + esc(p.id + "/" + es[idx - 1].id) + '">← ' + esc(es[idx - 1].title || entryLabel(es[idx - 1], idx - 1)) + "</a>" : "<span></span>";
        var next = es[idx + 1] ? '<a href="#' + esc(p.id + "/" + es[idx + 1].id) + '">' + esc(es[idx + 1].title || entryLabel(es[idx + 1], idx + 1)) + " →</a>" : "<span></span>";
        return '<article class="reader"><p class="reader-back"><a href="#' + esc(p.id) + '">← ' + esc(p.title) + "</a></p>" +
          '<header class="reader-head"><p class="reader-kicker">' + esc(entryLabel(e, idx)) + "</p><h1>" + esc(e.title || "") + "</h1>" +
          (STATE.readMode === "both" && e.title_zh && e.title_zh !== e.title ? '<p class="reader-alt">' + esc(LANG === "zh" ? e.title_en || "" : e.title_zh) + "</p>" : "") +
          '<p class="reader-meta">' + esc(fmtDay(e.date)) + "</p>" + readerTools(e) + "</header>" +
          list(e.images).map(function (src) { return '<figure class="reader-fig">' + pic(src, e.title) + "</figure>"; }).join("") +
          (e.audio ? '<audio class="player" controls preload="none" src="' + esc(asset(e.audio)) + '"></audio>' : "") +
          readerBody(e) +
          '<nav class="pager" aria-label="Entries">' + prev + next + "</nav></article>";
      }
    }
    if (!es.length) return head + emptyNote("First entry soon.");
    if (kind === "text") {
      return head + '<ol class="rows">' + es.map(function (e, i) {
        return '<li class="row"><span class="row-date">' + esc(fmtDay(e.date)) + '</span><span class="row-main">' +
          '<a class="row-title" href="#' + esc(p.id + "/" + e.id) + '">' + esc(e.title || entryLabel(e, i)) + "</a></span>" +
          '<span class="row-end">' + esc(entryLabel(e, i)) +
          (OWNER && !PREVIEW ? ' <button type="button" class="mini-btn" data-act="edit" data-kind="entry" data-id="' + esc(e.id) + '">Edit</button>' : "") + "</span></li>";
      }).join("") + "</ol>";
    }
    if (kind === "image") {
      return head + tiles(es.map(function (e, i) {
        return { id: e.id, src: e, title: e.title, note: cut(plain(e.text), 80), image: list(e.images)[0], act: 'data-act="lightbox" data-src="project:' + esc(p.id) + '" data-i="' + i + '"' };
      }), "1 / 1", cols("visual", 4), ownerEdit("entry"));
    }
    return head + '<div class="entry-list">' + es.map(function (e, i) {
      return '<article class="post"><p class="post-meta"><a href="#' + esc(p.id + "/" + e.id) + '">' + esc(entryLabel(e, i)) + " · " + esc(fmtDay(e.date)) + "</a>" +
        (OWNER && !PREVIEW ? ' <button type="button" class="mini-btn" data-act="edit" data-kind="entry" data-id="' + esc(e.id) + '">Edit</button>' : "") + "</p>" +
        (e.title ? '<h2 class="text-title">' + esc(e.title) + "</h2>" : "") +
        (list(e.images).length ? '<div class="post-images n' + Math.min(list(e.images).length, 4) + '">' + list(e.images).map(function (src, k) {
          return '<button type="button" class="post-img" data-act="lightbox" data-src="entry:' + esc(e.id) + '" data-i="' + k + '">' + pic(src, "") + "</button>";
        }).join("") + "</div>" : "") +
        (e.text ? '<div class="prose">' + md(e.text) + "</div>" : "") +
        (e.audio ? '<audio class="player" controls preload="none" src="' + esc(asset(e.audio)) + '"></audio>' : "") + "</article>";
    }).join("") + "</div>";
  }

  /* ---------- collections for downloads ---------- */
  function collectionFor(key) {
    var s = D.settings || {}, author = s.name || "Alyx's Studio";
    if (key === "daily") {
      return { slug: "daily", title: title("daily"), author: author, items: posts().slice().reverse().map(function (p) {
        return { title: fmtDay(p.day) + (timeOf(p.date) ? " · " + timeOf(p.date) : ""), date: p.date, text: p.text || "", images: list(p.images), audio: p.audio || "",
                 link: p.link && p.link.url ? p.link : null };
      }) };
    }
    if (key === "design") {
      return { slug: "design", title: title("design"), author: author, items: ((D.design || {}).items || []).map(function (x) {
        return { title: x.title, date: x.date, text: x.note || "", images: list(x.images) };
      }) };
    }
    if (key.indexOf("project:") === 0 && D.project) {
      var p = D.project.project;
      return { slug: p.id, title: p.title, author: author, note: p.note || "", kind: p.kind, cover: p.cover, items: (D.project.entries || []).map(function (e, i) {
        return { title: e.title || entryLabel(e, i), label: entryLabel(e, i), date: e.date, text: e.text || "", images: list(e.images), audio: e.audio || "" };
      }) };
    }
    if (key.indexOf("visual:") === 0) {
      var id = key.slice(7), ser = ((D.visual || {}).series || []).filter(function (x) { return x.id === id; })[0] || {};
      return { slug: id, title: ser.title || id, author: author, items: list(ser.images).map(function (im) {
        return { title: im.title || "", images: [im.image, im.phone, im.desktop].filter(Boolean), text: "" };
      }) };
    }
    return null;
  }
  function runExport(fn, arg) {
    var go = function () { window.AlyxExport[fn](arg, { root: ROOT, getJSON: getJSON, absUrl: absUrl, settings: D.settings || {} }); };
    if (window.AlyxExport) return go();
    loadScript(ROOT + "assets/js/export.js?v=5").then(go);
  }

  /* ---------- sharing ---------- */
  function postById(id) { return posts().filter(function (p) { return p.id === id; })[0]; }
  function share(to, id, btn) {
    var p = postById(id); if (!p) return;
    var url = new URL(ROOT + "daily/#p-" + p.id, location.href).href;
    var text = cut(plain(p.text) || (p.link && p.link.title) || title("daily"), 200);
    if (to === "x") window.open("https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
    if (to === "threads") window.open("https://www.threads.net/intent/post?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
    if (to === "copy") {
      var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy link"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy this link", url); });
      else window.prompt("Copy this link", url);
    }
    if (to === "story") storyImage(p, url, btn);
  }
  function loadImg(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () { res(im); }; im.onerror = function () { res(null); };
      im.src = asset(src);
    });
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    var out = [], line = "", chars = Array.from ? Array.from(text) : text.split("");
    var words = /[　-鿿가-힯]/.test(text) ? chars : text.split(/(\s+)/);
    words.forEach(function (w) {
      var t = line + w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line.trim()); line = w.trim() ? w : ""; } else line = t;
    });
    if (line.trim()) out.push(line.trim());
    if (out.length > maxLines) { out = out.slice(0, maxLines); out[maxLines - 1] = out[maxLines - 1].replace(/.{1,2}$/, "…"); }
    return out;
  }
  function storyImage(p, url, btn) {
    storyCard({ image: list(p.images)[0], text: plain(p.text) || (p.link && p.link.title) || "", meta: fmtDay(p.day), name: "story-" + p.id, url: url }, btn);
  }
  /* A 1080×1920 card for Instagram Story / Threads: a post, or a quote picked from any text */
  function storyCard(o, btn) {
    var label = btn ? btn.textContent : "";
    if (btn) btn.textContent = "Making…";
    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue("--ink").trim() || "#111", paper = css.getPropertyValue("--paper").trim() || "#fff",
        mute = css.getPropertyValue("--mute").trim() || "#888", sun = css.getPropertyValue("--sun").trim() || "#f5e47c";
    var font = '"' + (STATE.fontBody || "Geist") + '", ' + FALLBACK[FONTS[STATE.fontBody] || "sans"];
    Promise.all([loadImg(o.image), loadImg((D.settings || {}).logo || "assets/img/logo-sm.png"), document.fonts ? document.fonts.ready : null]).then(function (r) {
      var photo = r[0], logo = r[1];
      var c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
      var x = c.getContext("2d");
      x.fillStyle = paper; x.fillRect(0, 0, 1080, 1920);
      x.textBaseline = "top";
      if (o.quote) {
        // big quotation mark, the selected words, and where they come from
        var size = o.text.length > 160 ? 52 : o.text.length > 70 ? 64 : 78;
        x.font = size + "px " + font;
        var lines = wrapLines(x, o.text, 860, 14);
        var lh = Math.round(size * 1.42), block = lines.length * lh;
        var y0 = Math.max(330, (1920 - block) / 2 - 80);
        x.fillStyle = sun; x.font = "260px Georgia, serif"; x.fillText("\u201C", 92, y0 - 210);
        x.fillStyle = ink; x.font = size + "px " + font;
        lines.forEach(function (l, i) { x.fillText(l, 110, y0 + i * lh); });
        x.fillStyle = mute; x.font = "36px " + font;
        if (o.source) wrapLines(x, "— " + o.source, 860, 2).forEach(function (l, i) { x.fillText(l, 110, y0 + block + 60 + i * 50); });
      } else {
        var y = 200;
        if (photo) {
          var s2 = Math.min(900 / photo.width, 980 / photo.height), w = photo.width * s2, h = photo.height * s2;
          x.drawImage(photo, (1080 - w) / 2, y, w, h); y += h + 80;
        } else { y = 420; }
        x.fillStyle = ink; x.font = (photo ? 46 : 64) + "px " + font;
        wrapLines(x, o.text || "", 880, photo ? 6 : 12).forEach(function (l) { x.fillText(l, 100, y); y += photo ? 66 : 92; });
      }
      x.fillStyle = mute; x.font = "34px " + font;
      if (o.meta) x.fillText(o.meta, 100, 1700);
      x.fillText(location.host || "alyxsstudio.com", 100, 1750);
      if (logo) { var lw = 150, lhh = logo.height * (lw / logo.width); x.drawImage(logo, 1080 - 100 - lw, 1790 - lhh, lw, lhh); }
      c.toBlob(function (blob) {
        if (btn) btn.textContent = label;
        if (!blob) return;
        var file = new File([blob], (o.name || "story") + ".png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: (D.settings || {}).name || "", url: o.url }).catch(function () {});
        } else {
          var aEl = document.createElement("a"); aEl.href = URL.createObjectURL(blob); aEl.download = file.name;
          document.body.appendChild(aEl); aEl.click(); setTimeout(function () { URL.revokeObjectURL(aEl.href); aEl.remove(); }, 1000);
        }
      }, "image/png");
    });
  }

  /* ---------- select any words in a post or chapter → quote card ---------- */
  var quoteBtn = null;
  function hideQuoteBtn() { if (quoteBtn) quoteBtn.hidden = true; }
  function onSelect() {
    var sel = window.getSelection && window.getSelection();
    var text = sel && !sel.isCollapsed ? String(sel).replace(/\s+/g, " ").trim() : "";
    if (!text || text.length < 4) return hideQuoteBtn();
    var node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    var prose = node && node.closest && node.closest("main .prose, main .lb-text");
    if (!prose) return hideQuoteBtn();
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!quoteBtn) {
      quoteBtn = document.createElement("button");
      quoteBtn.type = "button"; quoteBtn.className = "quote-btn"; quoteBtn.textContent = "Quote card";
      quoteBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
      quoteBtn.addEventListener("click", function () {
        var src = quoteBtn.getAttribute("data-source") || "";
        storyCard({ quote: true, text: cut(quoteBtn.getAttribute("data-text"), 420), source: src, meta: "", name: "quote" }, quoteBtn);
      });
      document.body.appendChild(quoteBtn);
    }
    var article = prose.closest("article, .reader, .post");
    var h = article && article.querySelector("h1, h2");
    var src = (h ? h.textContent + " · " : "") + ((D.settings || {}).name || "");
    quoteBtn.setAttribute("data-text", text);
    quoteBtn.setAttribute("data-source", src);
    quoteBtn.style.left = Math.max(8, Math.min(window.innerWidth - 130, rect.left + rect.width / 2 - 60)) + "px";
    quoteBtn.style.top = Math.max(8, rect.top - 44) + "px";
    quoteBtn.hidden = false;
  }
  document.addEventListener("selectionchange", function () { clearTimeout(onSelect.t); onSelect.t = setTimeout(onSelect, 250); });
  window.addEventListener("scroll", hideQuoteBtn, { passive: true });

  /* ---------- clicks ---------- */
  function lightboxItems(src) {
    var kind = src.split(":")[0], id = src.slice(kind.length + 1);
    if (kind === "post") { var p = postById(id); return list(p && p.images).map(function (s) { return { src: s, text: cut(plain(p.text), 140) }; }); }
    if (kind === "visual") {
      var ser = ((D.visual || {}).series || []).filter(function (x) { return x.id === id; })[0] || {};
      var can = ser.download === "public" || OWNER;
      return list(ser.images).map(function (im) {
        return { src: im.image, title: im.title, downloads: can ? [{ label: "Download", url: im.image }, { label: "Phone", url: im.phone }, { label: "Desktop", url: im.desktop }] : [] };
      });
    }
    if (kind === "design") {
      var x = ((D.design || {}).items || []).filter(function (i) { return i.id === id; })[0] || {};
      var imgs = list(x.images);
      return (imgs.length ? imgs : [""]).map(function (s) { return { src: s, title: x.title, text: [fmtDay(x.date), x.note].filter(Boolean).join(" · "), link: x.link }; });
    }
    if (kind === "project" && D.project) {
      return (D.project.entries || []).map(function (e) { return { src: list(e.images)[0], title: e.title, text: cut(plain(e.text), 200) }; });
    }
    if (kind === "entry" && D.project) {
      var en = (D.project.entries || []).filter(function (e) { return e.id === id; })[0] || {};
      return list(en.images).map(function (s) { return { src: s, title: en.title }; });
    }
    return [];
  }
  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.getAttribute("data-act");
    if (act === "lightbox") { e.preventDefault(); var items = lightboxItems(t.getAttribute("data-src")); if (items.length) openLightbox(items, +t.getAttribute("data-i") || 0); }
    if (act === "share") { e.preventDefault(); share(t.getAttribute("data-to"), t.getAttribute("data-id"), t); }
    if (act === "month") {
      var ms = monthsWithPosts(), i = ms.indexOf(STATE.month) + (+t.getAttribute("data-dir"));
      if (ms[i]) { STATE.month = ms[i]; history.replaceState(null, "", location.pathname + location.search); draw(true); }
    }
    if (act === "more-posts") { STATE.dailyLimit = (STATE.dailyLimit || 30) + 30; draw(true); }
    if (act === "book-cat") { STATE.bookCat = t.getAttribute("data-val"); draw(true); }
    if (act === "store-cat") { STATE.storeCat = t.getAttribute("data-val"); draw(true); }
    if (act === "visual-kind") { STATE.visualKind = t.getAttribute("data-val"); draw(true); }
    if (act === "u-day") { STATE.uDay = t.getAttribute("data-day"); draw(true); }
    if (act === "u-month") {
      var bym = activity(), ms2 = {}; Object.keys(bym).forEach(function (d) { ms2[d.slice(0, 7)] = 1; }); ms2[today().slice(0, 7)] = 1;
      var ml = Object.keys(ms2).sort(), cur2 = STATE.uMonth && ml.indexOf(STATE.uMonth) > -1 ? STATE.uMonth : ml[ml.length - 1];
      var nx = ml[ml.indexOf(cur2) + (+t.getAttribute("data-dir"))];
      if (nx) { STATE.uMonth = nx; STATE.uDay = ""; draw(true); }
    }
    if (act === "watch-plat") { STATE.watchPlat = t.getAttribute("data-val"); draw(true); }
    if (act === "listen-cat") { STATE.listenCat = t.getAttribute("data-val"); draw(true); }
    if (act === "mplay") { e.preventDefault(); if (AUTO.el === t) AUTO.el = null; startVideo(t, false); }
    if (act === "track") { e.preventDefault(); playTrack(t.getAttribute("data-q"), +t.getAttribute("data-i") || 0); }
    if (act === "export") {
      e.preventDefault();
      var col = collectionFor(t.getAttribute("data-col"));
      if (col) runExport(t.getAttribute("data-fmt"), col);
    }
    if (act === "export-all") { e.preventDefault(); runExport("all", null); }
    if (act === "lang") { try { localStorage.setItem("alyx-lang", t.getAttribute("data-val")); } catch (x) {} location.reload(); }
    if (act === "readmode") { STATE.readMode = t.getAttribute("data-val"); draw(true); }
    if (act === "orig") {
      var post = postById(t.getAttribute("data-id")), box = t.closest(".post").querySelector(".post-text");
      if (post && box) {
        var showing = t.getAttribute("data-on") === "1";
        var alt = LANG === "zh" ? post.__en : post.text_zh;
        box.innerHTML = md(showing ? post.text : alt);
        t.setAttribute("data-on", showing ? "0" : "1");
        t.textContent = showing ? (LANG === "zh" ? "English" : "原文") : (LANG === "zh" ? "中文" : "English");
      }
    }
    if (["sheet", "item", "item-move", "vimage-move", "rename-cat", "block", "desk", "unhide"].indexOf(act) > -1) {
      e.preventDefault();
      openEditor({ mode: act, sheet: t.getAttribute("data-sheet"), file: t.getAttribute("data-file"), i: t.getAttribute("data-i"),
                   dir: +t.getAttribute("data-dir") || 0, id: t.getAttribute("data-id"), val: t.getAttribute("data-val") });
      return;
    }
    if (act === "edit" || act === "new") {
      e.preventDefault();
      openEditor({ mode: act, kind: t.getAttribute("data-kind"), id: t.getAttribute("data-id"), project: t.getAttribute("data-project"), shelf: t.getAttribute("data-shelf"), day: t.getAttribute("data-day") });
    }
  });
  app.addEventListener("keydown", function (e) {
    var t = e.target.closest && e.target.closest('.mplay[data-act="mplay"]');
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); startVideo(t, false); }
  });

  /* ---------- editing on the page (owner) ---------- */
  function sortEntries(arr, how) {
    arr.sort(function (a, b) {
      if (how === "date-desc") return String(b.date).localeCompare(String(a.date));
      if (how === "title") return String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true, sensitivity: "base" });
      if (how === "number") return (+a.number || 0) - (+b.number || 0);
      return String(a.date).localeCompare(String(b.date));
    });
  }
  function onSaved(kind, item, removed) {
    var drop = function (arr) { return (arr || []).filter(function (x) { return x.id !== item.id; }); };
    item.images = list(item.images);
    if (kind === "daily") {
      D.daily = D.daily || { posts: [] };
      D.daily.posts = drop(D.daily.posts);
      if (!removed) { item.day = String(item.date || "").slice(0, 10); D.daily.posts.push(item); STATE.selDay = item.day; STATE.month = item.day.slice(0, 7); }
      D.daily.posts.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
    }
    if (kind === "entry" && D.project && D.project.project.id === item.project) {
      D.project.entries = drop(D.project.entries);
      if (!removed) D.project.entries.push(item);
      sortEntries(D.project.entries, D.project.project.sort || "date-asc");
    }
    if (kind === "project") {
      D.ongoing = D.ongoing || { projects: [] };
      D.ongoing.projects = drop(D.ongoing.projects);
      if (!removed) D.ongoing.projects.unshift(Object.assign({ count: 0, updated: item.date }, item));
    }
    if (kind === "design") {
      D.design = D.design || { items: [] };
      D.design.items = drop(D.design.items);
      if (!removed) D.design.items.unshift(item);
    }
    if (kind === "media") {
      D.media = D.media || { items: [] };
      D.media.items = drop(D.media.items);
      if (!removed) { D.media.items.push(item); D.media.items.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); }); }
    }
    if (kind === "visual") {
      D.visual = D.visual || { series: [] };
      var i = -1; D.visual.series.forEach(function (x, k) { if (x.id === item.id) i = k; });
      if (removed) D.visual.series = drop(D.visual.series); else if (i > -1) D.visual.series[i] = item; else D.visual.series.unshift(item);
    }
    draw(true);
  }
  function editorCtx() {
    return {
      root: ROOT, D: D, RAW: RAW, asset: asset, md: md, onSaved: onSaved, page: PAGE, lang: LANG,
      project: D.project ? D.project.project : null, sections: sections, blockNames: BLOCK_NAMES, fonts: Object.keys(FONTS),
      posts: posts, fmtDay: fmtDay, player: player, mediaInfo: mediaInfo, applyTheme: applyTheme,
      redraw: function () { draw(true); },
      setLang: function (l) { try { localStorage.setItem("alyx-lang", l); } catch (x) {} location.reload(); }
    };
  }
  function withEditor(fn) {
    if (window.AlyxEditor) return fn();
    loadScript(ROOT + "assets/js/editor.js?v=10").then(function () { if (window.AlyxEditor) fn(); });
  }
  function withJournal(fn) {
    withEditor(function () {
      if (window.AlyxJournal) return fn();
      loadScript(ROOT + "assets/js/journal.js?v=1").then(function () { if (window.AlyxJournal) fn(); });
    });
  }
  function withWriter(fn) {
    withEditor(function () {
      if (window.AlyxWriter && window.AlyxAnalyze) return fn();
      Promise.all([loadScript(ROOT + "assets/js/analyze.js?v=6"), loadScript(ROOT + "assets/js/writer.js?v=6")]).then(function () { if (window.AlyxWriter) fn(); });
    });
  }
  function withInspo(fn) {
    withEditor(function () {
      if (window.AlyxInspo) return fn();
      loadScript(ROOT + "assets/js/inspo.js?v=1").then(function () { if (window.AlyxInspo) fn(); });
    });
  }
  function openEditor(spec) { withEditor(function () { window.AlyxEditor.open(spec, editorCtx()); }); }

  /* ---------- drawing ---------- */
  function draw(keepScroll) {
    var y = window.scrollY;
    var page = render[PAGE] ? PAGE : "notfound";
    var s = D.settings || {}, bar = "";
    // the lock: while the studio is private, visitors only see a closed page
    if (s.locked && !OWNER) {
      QUEUES = {};
      app.innerHTML = '<main id="main" class="page page-locked">' + render.locked() + "</main>";
      document.title = s.name || "Alyx's Studio";
      if (!document.querySelector('meta[name="robots"]')) { var mr = document.createElement("meta"); mr.name = "robots"; mr.content = "noindex"; document.head.appendChild(mr); }
      return;
    }
    if (s.announcement && s.announcement.text) {
      bar = '<div class="notice">' + (s.announcement.url ? a(s.announcement.url, esc(s.announcement.text) + arrow(s.announcement.url), "") : esc(s.announcement.text)) + "</div>";
    }
    QUEUES = {};
    app.innerHTML = bar + header(page) + '<main id="main" class="page page-' + page + '">' + render[page]() + "</main>" + footer() +
      (PREVIEW ? '<p class="preview-badge">Preview · not saved yet</p>' : "") + fab();
    var name = s.name || "Alyx's Studio";
    var h1 = app.querySelector("main h1");
    document.title = page === "home" ? name : (h1 ? h1.textContent : title(page)) + " — " + name;
    var btn = document.getElementById("menu-btn"), nav = document.getElementById("site-nav");
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      btn.textContent = open ? "Menu" : "Close";
      nav.classList.toggle("open", !open);
    });
    wireMedia(); markTracks();
    if (EDIT) withEditor(function () { window.AlyxEditor.decorate(editorCtx()); });
    if (EDIT && page === "write") withWriter(function () {
      window.AlyxWriter.mount({ el: app.querySelector("#writer"), hash: hash(), title: title("write"), root: ROOT, setHash: function (h) { location.hash = h; } });
    });
    if (EDIT && page === "visual" && app.querySelector("#inspo")) withInspo(function () {
      window.AlyxInspo.mount({ el: app.querySelector("#inspo"), root: ROOT });
    });
    if (EDIT && page === "daily" && app.querySelector("#journal-day")) withJournal(function () {
      window.AlyxJournal.mount({ app: app, day: STATE.selDay, month: STATE.month, redraw: function () { draw(true); } });
    });
    if (keepScroll) window.scrollTo(0, y);
    else {
      var h = hash(), target = h && document.getElementById(h);
      if (target && PAGE !== "daily") target.scrollIntoView(); else window.scrollTo(0, 0);
    }
  }

  /* ---------- loading ---------- */
  function getJSON(path) {
    return fetch(ROOT + path, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }).catch(function () { return null; });
  }
  function loadScript(src) {
    return new Promise(function (res) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = res; document.head.appendChild(s);
    });
  }
  var FILES = ["settings", "theme", "sections", "follow", "books", "store", "traces"];
  var GEN = ["daily", "ongoing", "visual", "design", "media"];

  /* drafts from the editor's preview (unsaved changes) */
  var COLLECTION_TARGET = { daily: "daily", projects: "ongoing", visual: "visual", design: "design", media: "watch" };
  function upsert(arr, item) {
    var i = -1; arr.forEach(function (x, k) { if (x.id === item.id) i = k; });
    if (i > -1) arr[i] = item; else arr.unshift(item);
  }
  function applyDraft(m) {
    if (!m.collection) { D[m.file] = m.data || {}; if (m.file === "theme") applyTheme(D.theme); return; }
    var item = Object.assign({}, m.data || {}, { id: m.id || "draft" });
    item.images = list(item.images);
    if (m.collection === "daily") {
      item.day = String(item.date || "").slice(0, 10);
      D.daily = D.daily || { posts: [] }; upsert(D.daily.posts, item);
      D.daily.posts.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
      if (item.day) { STATE.selDay = item.day; STATE.month = item.day.slice(0, 7); }
    } else if (m.collection === "projects") {
      D.ongoing = D.ongoing || { projects: [] }; upsert(D.ongoing.projects, Object.assign({ count: 0, updated: item.date }, item));
      if (D.project && D.project.project.id === item.id) D.project.project = Object.assign({}, D.project.project, item);
    } else if (m.collection === "entries") {
      if (D.project && D.project.project.id === item.project) {
        upsert(D.project.entries, item);
        var how = D.project.project.sort || "date-asc";
        D.project.entries.sort(function (a, b) {
          if (how === "date-desc") return String(b.date).localeCompare(String(a.date));
          if (how === "title") return String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true, sensitivity: "base" });
          if (how === "number") return (+a.number || 0) - (+b.number || 0);
          return String(a.date).localeCompare(String(b.date));
        });
      }
    } else if (m.collection === "visual") {
      D.visual = D.visual || { series: [] }; upsert(D.visual.series, item);
    } else if (m.collection === "design") {
      D.design = D.design || { items: [] }; upsert(D.design.items, item);
    } else if (m.collection === "media") {
      D.media = D.media || { items: [] }; upsert(D.media.items, item);
      D.media.items.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
    }
  }
  function mergeDraftsInto(which) {
    if (!PREVIEW) return;
    var d = readDrafts();
    Object.keys(d).forEach(function (k) {
      var m = d[k];
      if (which === "project" ? m.collection === "entries" || m.collection === "projects" : true) applyDraft(m);
    });
  }

  Promise.all(
    FILES.map(function (f) { return getJSON("data/" + f + ".json").then(function (j) { D[f] = j || {}; }); })
      .concat(GEN.map(function (f) { return getJSON("data/gen/" + f + ".json").then(function (j) { D[f] = j || {}; }); }))
      .concat([loadScript(ROOT + "assets/js/vendor/marked.min.js"), loadScript(ROOT + "assets/js/media.js?v=5")])
  ).then(function () {
    mergeDraftsInto("all");
    if (!OWNER) dropHidden();
    if (EDIT) { try { RAW = JSON.parse(JSON.stringify(D)); } catch (e) { RAW = {}; } }
    localize(D);
    applyTheme(D.theme);
    draw();
    if (VISITOR && localStorage.getItem("alyx-me") === "1") {
      var vb = document.createElement("a");
      vb.className = "visitor-badge"; vb.href = location.pathname + "?visitor=0" + location.hash;
      vb.textContent = "Seeing it as a visitor · back to editing";
      document.body.appendChild(vb);
    }
    if (NEEDS_SIGNIN) withEditor(function () { window.AlyxEditor.signIn(function () { location.reload(); }, editorCtx()); });
    if (NEEDS_CHECK) {
      // make sure this sign-in can really change the site before showing the editing tools
      var tk = ghToken();
      fetch("https://api.github.com/repos/alyxsstudio/alyxsstudio", { headers: { Authorization: "Bearer " + tk, Accept: "application/vnd.github+json" }, cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : { status: r.status }; })
        .then(function (j) {
          if (j && j.permissions && j.permissions.push) {
            try { localStorage.setItem("alyx-ok", JSON.stringify({ m: tokenMark(tk), t: Date.now() })); } catch (e) {}
            location.reload();
          } else if (j && (j.status === 401 || j.status === 403 || j.permissions)) {
            withEditor(function () { window.AlyxEditor.signIn(function () { location.reload(); }, editorCtx(), "Your sign-in has expired or can't change this site. Sign in again to edit."); });
          }
        }).catch(function () {});
    }
    window.addEventListener("hashchange", function () {
      if (hash() === "main") return;
      draw(PAGE === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(hash()));
    });
    if (PREVIEW) {
      window.addEventListener("message", function (e) {
        if (e.origin !== location.origin) return;
        var m = e.data;
        if (!m || m.type !== "alyx-preview") return;
        applyDraft(m);
        saveDraft((m.collection || "file") + ":" + (m.id || m.file), m);
        draw(true);
      });
      try { window.parent.postMessage({ type: "alyx-preview-ready" }, location.origin); } catch (e) {}
    }
  });
})();
