/* Alyx's Studio — renders every page from the files in /data.
   Content and design are edited at /admin. You normally don't need to edit this file. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  if (!app) return;

  var ROOT = app.getAttribute("data-root") || "";
  var PAGE = app.getAttribute("data-page") || "home";
  var SECTIONS = ["daily", "ongoing", "books", "visual", "design", "store", "traces", "follow"];
  var D = {};          // everything loaded: D.settings, D.theme, D.sections, D.daily …
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
  var OWNER = false;
  try {
    if (/[?&]me=0\b/.test(location.search)) localStorage.removeItem("alyx-me");
    else if (/[?&]me\b/.test(location.search)) localStorage.setItem("alyx-me", "1");
    OWNER = localStorage.getItem("alyx-me") === "1";
  } catch (e) {}
  if (PREVIEW) OWNER = true;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []; }
  function asset(p) {
    if (!p) return "";
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
  function sections() { return ((D.sections || {}).sections || []).filter(function (s) { return s && SECTIONS.indexOf(s.key) > -1; }); }
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
  function stack(name) { return '"' + name.replace(/"/g, "") + '", ' + FALLBACK[FONTS[name] || "sans"]; }
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
    var css = ":root{" +
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
    var owner = OWNER && !PREVIEW
      ? '<p class="owner-bar"><span class="pill tiny">Owner mode</span> ' +
        '<button type="button" class="linkish" data-act="export-all">Download everything</button> · ' +
        '<a href="' + esc(location.pathname) + '?me=0">Leave owner mode</a></p>'
      : "";
    return (
      '<footer class="site-foot">' +
        (links ? '<p class="foot-links">' + links + "</p>" : "") +
        '<div class="foot-row">' +
          "<p>© " + new Date().getFullYear() + " " + esc(s.name) + "</p>" +
          (s.email ? '<p class="mail">' + esc(s.email) + "</p>" : "") +
        "</div>" + owner +
      "</footer>"
    );
  }
  function pageHead(key, extra) {
    var s = sec(key);
    return '<div class="page-head"><h1>' + esc(s.title) + "</h1>" +
      (s.intro ? '<p class="intro">' + esc(s.intro) + "</p>" : "") + (extra || "") + "</div>";
  }
  function pic(img, alt, attrs) {
    return img
      ? '<img src="' + esc(asset(img)) + '" alt="' + esc(alt || "") + '" loading="lazy"' + (attrs || "") + ">"
      : '<span class="blank" aria-hidden="true"></span>';
  }
  /* tiles: list of {title, note, image, url, act, extra} */
  function tiles(items, ratio, n, extra) {
    var t = Math.min(n, 3);
    return '<ul class="tiles" style="--ratio:' + esc(ratio) + ";--cols:" + n + ";--cols-t:" + t + '">' +
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
  function chips(all, current, actName) {
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
      ? '<div class="post-images n' + Math.min(imgs.length, 4) + '">' + imgs.map(function (src, i) {
          return '<button type="button" class="post-img" data-act="lightbox" data-src="post:' + esc(p.id) + '" data-i="' + i + '">' + pic(src, "") + "</button>";
        }).join("") + "</div>"
      : "";
    var link = p.link && p.link.url
      ? '<a class="repost" href="' + esc(p.link.url) + '" target="_blank" rel="noopener">' +
          (p.link.quote ? '<span class="repost-quote">' + esc(p.link.quote) + "</span>" : "") +
          '<span class="repost-src">' + esc(p.link.title || hostOf(p.link.url)) + ' <span class="ext">↗</span></span></a>'
      : "";
    var audio = p.audio ? '<audio class="player" controls preload="none" src="' + esc(asset(p.audio)) + '"></audio>' : "";
    var tags = list(p.tags).length ? '<p class="post-tags">' + list(p.tags).map(function (t) { return "#" + esc(t); }).join(" ") + "</p>" : "";
    var meta = '<p class="post-meta"><a href="' + esc(href("daily", "p-" + p.id)) + '">' +
      (opts.showDay ? esc(fmtDay(p.day)) + " · " : "") + esc(timeOf(p.date)) + "</a></p>";
    return '<article class="post" id="p-' + esc(p.id) + '">' + meta +
      (p.text ? '<div class="prose post-text">' + md(p.text) + "</div>" : "") +
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
      if (ps) {
        var t = thumbFor(ps);
        cells += '<a class="' + cls + '" href="#' + key + '" aria-label="' + esc(fmtDay(key)) + ", " + ps.length + ' post' + (ps.length > 1 ? "s" : "") + '">' +
          '<span class="cal-num">' + d + "</span>" +
          (t.img ? '<span class="cal-thumb">' + pic(t.img, "") + "</span>" : '<span class="cal-text">' + esc(t.text) + "</span>") +
          (ps.length > 1 ? '<span class="cal-count">' + ps.length + "</span>" : "") + "</a>";
      } else {
        cells += '<span class="' + cls + '"><span class="cal-num">' + d + "</span></span>";
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
    hero: function (b, s) {
      return '<section class="hero">' +
        '<img class="hero-logo" src="' + esc(asset(s.logo_large || "assets/img/logo.png")) + '" alt="' + esc(s.name) + '">' +
        (b.show_tagline !== false && s.tagline ? '<p class="hero-line">' + esc(s.tagline) + "</p>" : "") +
      "</section>";
    },
    index: function (b) {
      var items = sections().filter(function (x) { return x.in_menu !== false; }).map(function (x) {
        return '<li><a href="' + esc(href(x.key)) + '"><span class="ix-name">' + esc(x.title) +
          '</span><span class="ix-note">' + esc(x.short || "") + "</span></a></li>";
      }).join("");
      return '<section class="block">' + blockHead(b.title) + '<ul class="index">' + items + "</ul></section>";
    },
    daily: function (b) {
      var ps = posts().slice(0, num(b.count, 6));
      if (!ps.length) return "";
      var cards = ps.map(function (p) {
        var img = list(p.images)[0];
        return '<li><a class="mini-post" href="' + esc(href("daily", "p-" + p.id)) + '">' +
          (img ? '<span class="mini-pic">' + pic(img, "") + "</span>" : '<span class="mini-text">' + esc(cut(plain(p.text) || (p.audio ? "♪ Voice note" : p.link && p.link.title) || "", 90)) + "</span>") +
          '<span class="mini-date">' + esc(fmtDay(p.day)) + "</span></a></li>";
      }).join("");
      return '<section class="block">' + blockHead(b.title || title("daily"), href("daily"), "Calendar") + '<ul class="mini-posts">' + cards + "</ul></section>";
    },
    ongoing: function (b) {
      var ps = ((D.ongoing || {}).projects || []).slice(0, num(b.count, 3));
      if (!ps.length) return "";
      return '<section class="block">' + blockHead(b.title || title("ongoing"), href("ongoing"), "See all") +
        tiles(ps.map(projectTile), "4 / 5", 3) + "</section>";
    },
    visual: function (b) {
      var imgs = [];
      ((D.visual || {}).series || []).forEach(function (s) {
        list(s.images).forEach(function (im) { imgs.push({ title: im.title, image: im.image, url: href("visual", "s-" + s.id) }); });
      });
      imgs = imgs.slice(0, num(b.count, 4));
      if (!imgs.length) return "";
      return '<section class="block">' + blockHead(b.title || title("visual"), href("visual"), "See all") +
        tiles(imgs, shape("visual", "3 / 4"), 4) + "</section>";
    },
    design: function (b) {
      var its = ((D.design || {}).items || []).slice(0, num(b.count, 3));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("design"), href("design"), "See all") +
        tiles(its.map(function (x) { return { title: x.title, note: fmtDay(x.date), image: list(x.images)[0], url: href("design", "d-" + x.id) }; }),
          shape("design", "4 / 5"), 4) + "</section>";
    },
    store: function (b) {
      var its = ((D.store || {}).items || []).slice(0, num(b.count, 4));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("store"), href("store"), "See all") +
        tiles(its, shape("store", "4 / 5"), 4, storeAction) + "</section>";
    },
    books: function (b) {
      var its = ((D.books || {}).items || []).slice(0, num(b.count, 4));
      if (!its.length) return "";
      return '<section class="block">' + blockHead(b.title || title("books"), href("books"), "See all") +
        tiles(its, shape("books", "2 / 3"), 4, function (it) { return linkPills(it.links); }) + "</section>";
    },
    follow: function (b) {
      var ls = followLinks();
      if (!ls.length) return "";
      return '<section class="block">' + blockHead(b.title || title("follow"), href("follow"), "All") +
        '<p class="links big">' + ls.map(function (l) { return a(l.url, esc(l.label) + arrow(l.url), "pill"); }).join("") + "</p></section>";
    },
    text: function (b) {
      if (!b.title && !b.body) return "";
      return '<section class="block text-block' + (b.align === "center" ? " center" : "") + '">' +
        (b.title ? '<h2 class="text-title">' + esc(b.title) + "</h2>" : "") +
        (b.body ? '<div class="prose">' + md(b.body) + "</div>" : "") + "</section>";
    },
    image: function (b) {
      if (!b.image) return "";
      var img = '<img src="' + esc(asset(b.image)) + '" alt="' + esc(b.caption || "") + '" loading="lazy">';
      return '<section class="block image-block ' + esc(b.size || "wide") + '"><figure>' +
        (b.url ? a(b.url, img, "image-link") : img) +
        (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") + "</figure></section>";
    },
    spacer: function (b) {
      var h = { small: 24, medium: 64, large: 128 }[b.size || "medium"] || 64;
      return '<div class="spacer" style="height:' + h + 'px" aria-hidden="true"></div>';
    }
  };
  function blockHead(t, moreHref, moreLabel) {
    if (!t && !moreHref) return "";
    return '<div class="block-head"><h2 class="block-title">' + esc(t || "") + "</h2>" +
      (moreHref ? '<a class="more" href="' + esc(moreHref) + '">' + esc(moreLabel) + "</a>" : "") + "</div>";
  }
  function projectTile(p) {
    var meta = p.count + (p.count === 1 ? " entry" : " entries") + (p.updated ? " · " + fmtDay(p.updated) : "");
    return { title: p.title, note: meta, image: p.cover, url: href("ongoing", p.id), badge: p.status === "finished" ? "Finished" : "" };
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
      return blocks.map(function (b) { var fn = b && BLOCK[b.type]; return fn ? fn(b, s) : ""; }).join("");
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
      if (!posts().length) return pageHead("daily", tools) + emptyNote("First post soon.");

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

      var sel = /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : (STATE.selDay || posts()[0].day);
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
        (dayPosts.length ? dayPosts.map(function (p) { return postCard(p); }).join("") : emptyNote("Nothing posted this day.")) + "</section>";
      return pageHead("daily", tools) + dl + '<div class="daily-wrap"><div class="cal-col">' + nav + calendar(month, byDay, sel) + "</div>" + panel + "</div>";
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
      return pageHead("ongoing") + all + (projects.length ? tiles(projects.map(projectTile), "4 / 5", 3) : emptyNote());
    },

    books: function () {
      var its = (D.books || {}).items || [];
      var cats = []; its.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
      var cur = STATE.bookCat || "All";
      var shown = its.filter(function (i) { return cur === "All" || i.category === cur; });
      return pageHead("books") + chips(cats, cur, "book-cat") +
        (shown.length ? tiles(shown, shape("books", "2 / 3"), cols("books", 4), function (it) { return linkPills(it.links); }) : emptyNote());
    },

    visual: function () {
      var series = (D.visual || {}).series || [];
      var kinds = []; series.forEach(function (s) { if (s.kind && kinds.indexOf(s.kind) < 0) kinds.push(s.kind); });
      var cur = STATE.visualKind || "All";
      var html = series.filter(function (s) { return cur === "All" || s.kind === cur; }).map(function (s) {
        var imgs = list(s.images);
        var can = s.download === "public" || OWNER;
        var dl = can && imgs.length ? downloadBar("visual:" + s.id, ["zip"], "Download series") : "";
        return '<section class="series" id="s-' + esc(s.id) + '">' +
          '<div class="series-head"><h2 class="series-title">' + esc(s.title) + "</h2>" +
          '<p class="series-meta">' + esc([s.kind, imgs.length + (imgs.length === 1 ? " image" : " images")].filter(Boolean).join(" · ")) + "</p>" +
          (s.note ? '<p class="intro">' + esc(s.note) + "</p>" : "") + dl + "</div>" +
          (imgs.length ? tiles(imgs.map(function (im, i) {
            return { title: im.title, image: im.image, act: 'data-act="lightbox" data-src="visual:' + esc(s.id) + '" data-i="' + i + '"' };
          }), shape("visual", "3 / 4"), cols("visual", 4)) : emptyNote()) + "</section>";
      }).join("");
      return pageHead("visual") + chips(kinds, cur, "visual-kind") + (html || emptyNote());
    },

    design: function () {
      var its = (D.design || {}).items || [];
      var dl = OWNER && its.length ? downloadBar("design", ["zip", "pdf"], "Download all") : "";
      return pageHead("design") + dl + (its.length ? tiles(its.map(function (x) {
        var n = list(x.images).length;
        return { title: x.title, note: [fmtDay(x.date), n > 1 ? n + " images" : ""].filter(Boolean).join(" · "), image: list(x.images)[0],
                 act: 'data-act="lightbox" data-src="design:' + esc(x.id) + '" data-i="0"' };
      }), shape("design", "4 / 5"), cols("design", 3)) : emptyNote());
    },

    store: function () {
      var its = (D.store || {}).items || [];
      var cats = []; its.forEach(function (i) { if (i.category && cats.indexOf(i.category) < 0) cats.push(i.category); });
      var cur = STATE.storeCat || "All";
      var shown = its.filter(function (i) { return cur === "All" || i.category === cur; });
      return pageHead("store") + chips(cats, cur, "store-cat") +
        (shown.length ? tiles(shown, shape("store", "4 / 5"), cols("store", 4), storeAction) : emptyNote());
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
            a(r.url, esc(r.title) + arrow(r.url), "row-title") + (r.where ? '<span class="row-note">' + esc(r.where) + "</span>" : "") + "</span></li>";
        }).join("") + "</ol></section>";
      }).join("");
      return pageHead("traces") + (t.note ? '<div class="prose trace-note">' + md(t.note) + "</div>" : "") + summary + (body || emptyNote());
    },

    follow: function () {
      var groups = ((D.follow || {}).groups || []).map(function (g) {
        var ls = (g.links || []).filter(function (l) { return l && l.label && l.url; });
        if (!ls.length) return "";
        return '<section class="follow-group"><h2 class="block-title">' + esc(g.name || "") + '</h2><ul class="follow-list">' +
          ls.map(function (l) {
            return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="f-name">' + esc(l.label) +
              '</span><span class="f-host">' + esc(l.handle || hostOf(l.url)) + ' ↗</span></a></li>';
          }).join("") + "</ul></section>";
      }).join("");
      var s = D.settings || {};
      return pageHead("follow") + (groups || emptyNote()) + (s.email ? '<p class="follow-mail">' + esc(s.email) + "</p>" : "");
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
      D.project = j || { project: { id: id }, entries: [] };
      mergeDraftsInto("project");
    });
  }
  function entryLabel(e, i) {
    return e.number !== "" && e.number != null ? "No. " + e.number : "No. " + (i + 1);
  }
  function projectView(data, entryId) {
    var p = data.project, es = data.entries || [];
    var can = p.download === "public" || OWNER;
    var kind = p.kind || "mixed";
    var formats = kind === "image" ? ["pdf", "epub", "zip"] : ["epub", "pdf", "zip"];
    var head = '<p class="reader-back"><a href="' + esc(href("ongoing")) + '">← ' + esc(title("ongoing")) + "</a></p>" +
      '<div class="page-head"><h1>' + esc(p.title) + "</h1>" + (p.note ? '<p class="intro">' + esc(p.note) + "</p>" : "") +
      '<p class="series-meta">' + esc([es.length + (es.length === 1 ? " entry" : " entries"), SORT_LABEL[p.sort] || "", p.status === "finished" ? "Finished" : "Ongoing"].filter(Boolean).join(" · ")) + "</p>" +
      (can && es.length ? downloadBar("project:" + p.id, formats, "Download") : "") + "</div>";

    if (entryId) {
      var idx = -1; es.forEach(function (e, i) { if (e.id === entryId) idx = i; });
      if (idx > -1) {
        var e = es[idx];
        var prev = es[idx - 1] ? '<a href="#' + esc(p.id + "/" + es[idx - 1].id) + '">← ' + esc(es[idx - 1].title || entryLabel(es[idx - 1], idx - 1)) + "</a>" : "<span></span>";
        var next = es[idx + 1] ? '<a href="#' + esc(p.id + "/" + es[idx + 1].id) + '">' + esc(es[idx + 1].title || entryLabel(es[idx + 1], idx + 1)) + " →</a>" : "<span></span>";
        return '<article class="reader"><p class="reader-back"><a href="#' + esc(p.id) + '">← ' + esc(p.title) + "</a></p>" +
          '<header class="reader-head"><p class="reader-kicker">' + esc(entryLabel(e, idx)) + "</p><h1>" + esc(e.title || "") + "</h1>" +
          '<p class="reader-meta">' + esc(fmtDay(e.date)) + "</p></header>" +
          list(e.images).map(function (src) { return '<figure class="reader-fig">' + pic(src, e.title) + "</figure>"; }).join("") +
          (e.audio ? '<audio class="player" controls preload="none" src="' + esc(asset(e.audio)) + '"></audio>' : "") +
          '<div class="prose">' + md(e.text) + "</div>" +
          '<nav class="pager" aria-label="Entries">' + prev + next + "</nav></article>";
      }
    }
    if (!es.length) return head + emptyNote("First entry soon.");
    if (kind === "text") {
      return head + '<ol class="rows">' + es.map(function (e, i) {
        return '<li class="row"><span class="row-date">' + esc(fmtDay(e.date)) + '</span><span class="row-main">' +
          '<a class="row-title" href="#' + esc(p.id + "/" + e.id) + '">' + esc(e.title || entryLabel(e, i)) + "</a></span>" +
          '<span class="row-end">' + esc(entryLabel(e, i)) + "</span></li>";
      }).join("") + "</ol>";
    }
    if (kind === "image") {
      return head + tiles(es.map(function (e, i) {
        return { title: e.title, note: cut(plain(e.text), 80), image: list(e.images)[0], act: 'data-act="lightbox" data-src="project:' + esc(p.id) + '" data-i="' + i + '"' };
      }), "1 / 1", cols("visual", 4));
    }
    return head + '<div class="entry-list">' + es.map(function (e, i) {
      return '<article class="post"><p class="post-meta"><a href="#' + esc(p.id + "/" + e.id) + '">' + esc(entryLabel(e, i)) + " · " + esc(fmtDay(e.date)) + "</a></p>" +
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
    loadScript(ROOT + "assets/js/export.js?v=3").then(go);
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
    var label = btn.textContent; btn.textContent = "Making…";
    var css = getComputedStyle(document.documentElement);
    var ink = css.getPropertyValue("--ink").trim() || "#111", paper = css.getPropertyValue("--paper").trim() || "#fff", mute = css.getPropertyValue("--mute").trim() || "#888";
    var font = '"' + (STATE.fontBody || "Geist") + '", ' + FALLBACK[FONTS[STATE.fontBody] || "sans"];
    Promise.all([loadImg(list(p.images)[0]), loadImg((D.settings || {}).logo || "assets/img/logo-sm.png"), document.fonts ? document.fonts.ready : null]).then(function (r) {
      var photo = r[0], logo = r[1];
      var c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
      var x = c.getContext("2d");
      x.fillStyle = paper; x.fillRect(0, 0, 1080, 1920);
      var y = 200;
      if (photo) {
        var maxW = 900, maxH = 980, s = Math.min(maxW / photo.width, maxH / photo.height);
        var w = photo.width * s, h = photo.height * s;
        x.drawImage(photo, (1080 - w) / 2, y, w, h); y += h + 80;
      } else { y = 420; }
      x.fillStyle = ink; x.font = (photo ? 46 : 64) + "px " + font; x.textBaseline = "top";
      wrapLines(x, plain(p.text) || (p.link && p.link.title) || "", 880, photo ? 6 : 12).forEach(function (l) { x.fillText(l, 100, y); y += photo ? 66 : 92; });
      x.fillStyle = mute; x.font = "34px " + font;
      x.fillText(fmtDay(p.day), 100, 1700);
      x.fillText(location.host || "alyxsstudio.com", 100, 1750);
      if (logo) { var lw = 150, lh = logo.height * (lw / logo.width); x.drawImage(logo, 1080 - 100 - lw, 1790 - lh, lw, lh); }
      c.toBlob(function (blob) {
        btn.textContent = label;
        if (!blob) return;
        var file = new File([blob], "story-" + p.id + ".png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: (D.settings || {}).name || "", url: url }).catch(function () {});
        } else {
          var aEl = document.createElement("a"); aEl.href = URL.createObjectURL(blob); aEl.download = file.name;
          document.body.appendChild(aEl); aEl.click(); setTimeout(function () { URL.revokeObjectURL(aEl.href); aEl.remove(); }, 1000);
        }
      }, "image/png");
    });
  }

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
    if (act === "export") {
      e.preventDefault();
      var col = collectionFor(t.getAttribute("data-col"));
      if (col) runExport(t.getAttribute("data-fmt"), col);
    }
    if (act === "export-all") { e.preventDefault(); runExport("all", null); }
  });

  /* ---------- drawing ---------- */
  function draw(keepScroll) {
    var y = window.scrollY;
    var page = render[PAGE] ? PAGE : "notfound";
    var s = D.settings || {}, bar = "";
    if (s.announcement && s.announcement.text) {
      bar = '<div class="notice">' + (s.announcement.url ? a(s.announcement.url, esc(s.announcement.text) + arrow(s.announcement.url), "") : esc(s.announcement.text)) + "</div>";
    }
    app.innerHTML = bar + header(page) + '<main id="main" class="page page-' + page + '">' + render[page]() + "</main>" + footer() +
      (PREVIEW ? '<p class="preview-badge">Preview · not saved yet</p>' : "");
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
  var GEN = ["daily", "ongoing", "visual", "design"];

  /* drafts from the editor's preview (unsaved changes) */
  var COLLECTION_TARGET = { daily: "daily", projects: "ongoing", visual: "visual", design: "design" };
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
      .concat([loadScript(ROOT + "assets/js/vendor/marked.min.js")])
  ).then(function () {
    mergeDraftsInto("all");
    applyTheme(D.theme);
    draw();
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
