/* Alyx's Studio — renders every page from the files in /data.
   Content and design are edited at /admin. You normally don't need to edit this file. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  if (!app) return;

  var ROOT = app.getAttribute("data-root") || "";
  var HASH_MODE = !app.getAttribute("data-page");   // single-file preview: pages switch by #hash

  var SECTIONS = ["writing", "research", "books", "serial", "cv", "objects", "art",
                  "wardrobe", "video", "podcast", "shop", "picks"];
  var NAV = [
    { group: "Read", items: ["writing", "research", "books", "serial", "cv"] },
    { group: "Make", items: ["objects", "art", "wardrobe"] },
    { group: "Watch & Listen", items: ["video", "podcast"] },
    { group: "Shop", items: ["shop", "picks", "instagram"] }
  ];
  var PAGES = ["home", "notfound"].concat(SECTIONS);
  var D = {};   // loaded data: D.settings, D.design, D.writing …

  /* Live preview inside /admin: the editor loads pages with ?preview=1 and sends unsaved changes. */
  var PREVIEW = /[?&]preview=1/.test(location.search);
  var Q = PREVIEW ? location.search : "";   // keep ?preview=1&pid=… when clicking around inside the preview
  var DRAFTS = "alyx-preview-" + ((location.search.match(/[?&]pid=([\w-]+)/) || [])[1] || "x");
  function readDrafts() { try { return JSON.parse(sessionStorage.getItem(DRAFTS) || "{}"); } catch (e) { return {}; } }
  function saveDraft(file, data) {
    try { var d = readDrafts(); d[file] = data; sessionStorage.setItem(DRAFTS, JSON.stringify(d)); } catch (e) {}
  }

  function menu() {
    var m = D.settings && D.settings.menu;
    if (!m || !m.length) return NAV;
    return m.map(function (g) {
      return { group: g.label || "", items: (g.items || []).filter(function (k) {
        return k === "instagram" || SECTIONS.indexOf(k) > -1;
      }) };
    }).filter(function (g) { return g.items.length; });
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function label(key) {
    if (key === "instagram") return "Instagram";
    return (D[key] && D[key].title) || key;
  }
  function href(key) {
    if (key === "instagram") return D.settings.instagram_url || "#";
    if (HASH_MODE) return key === "home" ? "#" : "#" + key;
    return key === "home" ? (ROOT || "./") + Q : ROOT + key + "/" + Q;
  }
  function asset(p) {
    if (!p) return "";
    if (/^(https?:)?\/\//.test(p) || p.charAt(0) === "/") return p;
    return ROOT + p;
  }
  function isExternal(u) { return /^https?:/.test(u || ""); }
  function a(url, inner, cls) {
    if (!url) return '<span class="' + (cls || "") + ' nolink">' + inner + "</span>";
    var ext = isExternal(url) ? ' target="_blank" rel="noopener"' : "";
    return '<a class="' + (cls || "") + '" href="' + esc(url) + '"' + ext + ">" + inner + "</a>";
  }
  function arrow(url) { return url && isExternal(url) ? ' <span class="ext" aria-hidden="true">↗</span>' : ""; }
  function youtubeId(u) {
    var m = String(u || "").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : "";
  }

  /* ---------- design settings → CSS ---------- */
  var FONTS = {
    "Geist": "sans", "Instrument Sans": "sans", "DM Sans": "sans", "Work Sans": "sans",
    "IBM Plex Sans": "sans", "Manrope": "sans", "Karla": "sans", "Libre Franklin": "sans",
    "Space Grotesk": "sans", "Figtree": "sans", "Outfit": "sans", "Albert Sans": "sans",
    "Newsreader": "serif", "EB Garamond": "serif", "Cormorant Garamond": "serif", "Fraunces": "serif",
    "Libre Caslon Text": "serif", "Instrument Serif": "serif", "Spectral": "serif",
    "Gaegu": "hand", "Patrick Hand": "hand", "Caveat": "hand",
    "Geist Mono": "mono", "IBM Plex Mono": "mono", "DM Mono": "mono", "Space Mono": "mono",
    "JetBrains Mono": "mono", "Courier Prime": "mono"
  };
  var FALLBACK = {
    sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    hand: '"Comic Sans MS", "Marker Felt", cursive',
    mono: 'ui-monospace, "SFMono-Regular", Menlo, monospace'
  };
  function stack(name) {
    return '"' + name.replace(/"/g, "") + '", ' + FALLBACK[FONTS[name] || "sans"];
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
  function num(v, d) { v = parseFloat(v); return isNaN(v) ? d : v; }
  function applyDesign(g) {
    g = g || {};
    var body = (g.font_custom || "").trim() || g.font_body || "Geist";
    var head = !g.font_heading || g.font_heading === "Same as body" ? body : g.font_heading;
    var small = !g.font_small || g.font_small === "Same as body" ? body : g.font_small;
    [body, head, small].forEach(loadFont);
    var css = ":root{" +
      "--ink:" + (g.color_text || "#111111") + ";" +
      "--paper:" + (g.color_background || "#ffffff") + ";" +
      "--mute:" + (g.color_muted || "#8a8984") + ";" +
      "--line:" + (g.color_line || "#e7e6e1") + ";" +
      "--tile:" + (g.color_tile || "#f4f3ef") + ";" +
      "--sun:" + (g.color_highlight || "#f5e47c") + ";" +
      "--sans:" + stack(body) + ";" +
      "--head:" + stack(head) + ";" +
      "--mono:" + stack(small) + ";" +
      "--size-body:" + num(g.size_body, 15) + "px;" +
      "--size-h1:" + num(g.size_heading, 46) + "px;" +
      "--size-nav:" + num(g.size_nav, 13) + "px;" +
      "--logo-home:" + num(g.logo_home_width, 300) + "px;" +
      "--logo-head:" + num(g.logo_header_width, 64) + "px;" +
      "--max:" + num(g.page_width, 1240) + "px;" +
      "--radius:" + num(g.image_corners, 0) + "px;" +
      "--cols-m:" + Math.max(1, Math.min(3, num(g.cols_mobile, 2))) + ";" +
      "}";
    var el = document.getElementById("design-vars");
    if (!el) { el = document.createElement("style"); el.id = "design-vars"; document.head.appendChild(el); }
    el.textContent = css;
    document.documentElement.classList.toggle("no-caps", g.uppercase_labels === false);
  }
  function cols(key, d) { return Math.max(1, Math.min(6, num(D.design["cols_" + key], d))); }
  function shape(key, d) { return D.design["shape_" + key] || d; }

  /* ---------- shared pieces ---------- */
  function header(current) {
    var s = D.settings;
    var groups = menu().map(function (g) {
      var links = g.items.map(function (key) {
        var cur = key === current ? ' aria-current="page"' : "";
        var ext = key === "instagram" ? ' target="_blank" rel="noopener"' : "";
        var mark = key === "instagram" ? ' <span class="ext" aria-hidden="true">↗</span>' : "";
        return '<li><a href="' + esc(href(key)) + '"' + cur + ext + ">" + esc(label(key)) + mark + "</a></li>";
      }).join("");
      return '<div class="nav-group"><p class="nav-label">' + esc(g.group) + "</p><ul>" + links + "</ul></div>";
    }).join("");
    return (
      '<header class="site-head">' +
        '<a class="brand" href="' + esc(href("home")) + '" aria-label="' + esc(s.name) + ', home">' +
          '<img src="' + asset(s.logo || "assets/img/logo-sm.png") + '" alt="' + esc(s.name) + '">' +
        "</a>" +
        '<button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-nav">Menu</button>' +
        '<nav class="site-nav" id="site-nav" aria-label="Main">' + groups + "</nav>" +
      "</header>"
    );
  }
  function footer() {
    var s = D.settings;
    return (
      '<footer class="site-foot">' +
        "<p>© " + new Date().getFullYear() + " " + esc(s.name) + "</p>" +
        (s.instagram_url ? '<p><a href="' + esc(s.instagram_url) + '" target="_blank" rel="noopener">Instagram @' + esc(s.instagram_handle) + "</a></p>" : "") +
        (s.social_links || []).filter(function (l) { return l && l.label && l.url; }).map(function (l) {
          return '<p><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a></p>";
        }).join("") +
        (s.email ? '<p class="mail">' + esc(s.email) + "</p>" : "") +
      "</footer>"
    );
  }
  function pageHead(title, intro, extra) {
    return '<div class="page-head"><h1>' + esc(title) + "</h1>" +
      (intro ? '<p class="intro">' + esc(intro) + "</p>" : "") + (extra || "") + "</div>";
  }
  function rows(list) {
    return '<ol class="rows">' + (list || []).map(function (r) {
      return (
        '<li class="row">' +
          '<span class="row-date">' + esc(r.date || "") + "</span>" +
          '<span class="row-main">' +
            a(r.url, esc(r.title) + arrow(r.url), "row-title") +
            (r.note ? '<span class="row-note">' + esc(r.note) + "</span>" : "") +
            (r.extra || "") +
          "</span>" +
          (r.end ? '<span class="row-end">' + esc(r.end) + "</span>" : "") +
        "</li>"
      );
    }).join("") + "</ol>";
  }
  function pic(img, alt) {
    return img
      ? '<img src="' + esc(asset(img)) + '" alt="' + esc(alt) + '" loading="lazy">'
      : '<span class="blank" aria-hidden="true"></span>';
  }
  function tiles(list, ratio, n, extra) {
    var t = Math.min(n, 3);
    return '<ul class="tiles" style="--ratio:' + esc(ratio) + ";--cols:" + n + ";--cols-t:" + t + '">' +
      (list || []).map(function (it) {
        var media = '<div class="tile-pic">' + pic(it.image, it.title) + "</div>";
        var body =
          '<div class="tile-cap">' +
            '<p class="tile-title">' + esc(it.title) + "</p>" +
            (it.note ? '<p class="tile-note">' + esc(it.note) + "</p>" : "") +
            (extra ? extra(it) : "") +
          "</div>";
        return '<li class="tile">' + (it.url ? a(it.url, media, "tile-link") : media) + body + "</li>";
      }).join("") + "</ul>";
  }
  function linkList(list) {
    list = (list || []).filter(function (l) { return l && l.label; });
    if (!list.length) return "";
    return '<p class="links">' + list.map(function (l) {
      return a(l.url, esc(l.label) + arrow(l.url), "pill");
    }).join("") + "</p>";
  }
  function shopAction(it) {
    var st = (it.status || "available").toLowerCase();
    var price = it.price ? '<span class="price">' + esc(it.price) + "</span>" : "";
    if (st === "sold out") return '<p class="buy">' + price + '<span class="state">Sold out</span></p>';
    if (st === "soon") return '<p class="buy">' + price + '<span class="state">Coming soon</span></p>';
    return '<p class="buy">' + price +
      (it.url ? a(it.url, "Buy" + arrow(it.url), "buy-btn") : '<span class="state">Available</span>') + "</p>";
  }

  /* ---------- reading view for articles and chapters ---------- */
  var markedReady = null;
  function loadMarked() {
    if (window.marked) return Promise.resolve();
    if (!markedReady) {
      markedReady = new Promise(function (res) {
        var s = document.createElement("script");
        s.src = ROOT + "assets/js/vendor/marked.min.js";
        s.onload = res; s.onerror = res;
        document.head.appendChild(s);
      });
    }
    return markedReady;
  }
  function md(text) {
    if (window.marked && window.marked.parse) return window.marked.parse(String(text || ""));
    return String(text || "").split(/\n{2,}/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
  }
  function reader(opts) {
    return (
      '<article class="reader">' +
        '<p class="reader-back"><a href="' + esc(opts.back) + '">← ' + esc(opts.backLabel) + "</a></p>" +
        '<header class="reader-head">' +
          (opts.kicker ? '<p class="reader-kicker">' + esc(opts.kicker) + "</p>" : "") +
          "<h1>" + esc(opts.title) + "</h1>" +
          (opts.meta ? '<p class="reader-meta">' + esc(opts.meta) + "</p>" : "") +
        "</header>" +
        (opts.image ? '<figure class="reader-fig">' + pic(opts.image, opts.title) + "</figure>" : "") +
        '<div class="prose">' + md(opts.body) + "</div>" +
        (opts.pager || "") +
      "</article>"
    );
  }
  function anchor() { return (location.hash || "").replace("#", ""); }

  /* ---------- home page blocks (order and content set in /admin) ---------- */
  function blockHead(title, moreHref, moreLabel, external) {
    if (!title && !moreHref) return "";
    var ext = external ? ' target="_blank" rel="noopener"' : "";
    return '<div class="block-head"><h2 class="block-title">' + esc(title || "") + "</h2>" +
      (moreHref ? '<a class="more" href="' + esc(moreHref) + '"' + ext + ">" + moreLabel + "</a>" : "") + "</div>";
  }
  var TILE_SECTIONS = { objects: ["4 / 5", 4], art: ["4 / 5", 4], wardrobe: ["3 / 4", 4], books: ["2 / 3", 4],
                        picks: ["1 / 1", 4], shop: ["4 / 5", 4], video: ["16 / 9", 3] };
  var BLOCK = {
    hero: function (b, s) {
      return '<section class="hero">' +
        '<img class="hero-logo" src="' + asset(s.logo_large || "assets/img/logo.png") + '" alt="' + esc(s.name) + '">' +
        (b.show_tagline !== false && s.tagline ? '<p class="hero-line">' + esc(s.tagline) + "</p>" : "") +
      "</section>";
    },
    index: function (b) {
      var items = menu().map(function (g) {
        return g.items.filter(function (k) { return k !== "instagram"; }).map(function (k) {
          var sec = D[k] || {};
          return '<li><a href="' + esc(href(k)) + '"><span class="ix-name">' + esc(label(k)) +
            '</span><span class="ix-note">' + esc(sec.short || sec.intro || "") + "</span></a></li>";
        }).join("");
      }).join("");
      return '<section class="block">' + blockHead(b.title) + '<ul class="index">' + items + "</ul></section>";
    },
    shop: function (b) {
      return BLOCK.section({ section: "shop", title: b.title, count: b.count });
    },
    section: function (b) {
      var key = b.section;
      if (!TILE_SECTIONS[key] || !D[key]) return "";
      var list = (D[key].items || []).slice(0, num(b.count, 4));
      if (!list.length) return "";
      if (key === "video") {
        list = list.map(function (i) {
          var id = youtubeId(i.url);
          return { title: i.title, note: i.note, url: i.url, image: i.image || (id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : "") };
        });
      }
      var n = Math.min(TILE_SECTIONS[key][1], Math.max(2, list.length));
      return '<section class="block">' + blockHead(b.title || label(key), href(key), "See all") +
        tiles(list, key === "video" ? "16 / 9" : shape(key, TILE_SECTIONS[key][0]), n, key === "shop" ? shopAction : null) +
      "</section>";
    },
    latest: function (b) {
      var key = b.section, p = D[key];
      if (!p) return "";
      var list = [];
      if (key === "writing") list = (p.items || []).map(function (i) {
        return { date: i.date, title: i.title, note: i.note, url: i.body ? href("writing") + "#" + slug(i.title) : i.url };
      });
      if (key === "research") list = (p.items || []).map(function (i) { return { date: i.date, title: i.title, note: i.note, url: i.url }; });
      if (key === "serial") list = (p.chapters || []).slice().reverse().map(function (c) {
        return { date: c.date, title: c.title, end: "Chapter " + c.number, url: c.body ? href("serial") + "#chapter-" + c.number : c.url };
      });
      if (key === "podcast") list = (p.episodes || []).map(function (e) {
        return { date: e.date, title: e.title, note: e.length, end: "No. " + e.number, url: href("podcast") };
      });
      list = list.slice(0, num(b.count, 3));
      if (!list.length) return "";
      return '<section class="block">' + blockHead(b.title || label(key), href(key), "See all") + rows(list) + "</section>";
    },
    instagram: function (b, s) {
      var ig = (s.instagram_tiles || []).map(function (t) {
        var u = t.url || s.instagram_url;
        return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener" aria-label="Instagram post">' + pic(t.image, "") + "</a></li>";
      }).join("");
      if (!ig) return "";
      return '<section class="block">' +
        blockHead(b.title, s.instagram_url, "@" + esc(s.instagram_handle) + ' <span class="ext" aria-hidden="true">↗</span>', true) +
        '<ul class="ig">' + ig + "</ul></section>";
    },
    text: function (b) {
      if (!b.title && !b.body) return "";
      var align = b.align === "center" ? " center" : "";
      return '<section class="block text-block' + align + '">' +
        (b.title ? '<h2 class="text-title">' + esc(b.title) + "</h2>" : "") +
        (b.body ? '<div class="prose">' + md(b.body) + "</div>" : "") +
      "</section>";
    },
    image: function (b) {
      if (!b.image) return "";
      var size = b.size || "wide";
      var img = '<img src="' + esc(asset(b.image)) + '" alt="' + esc(b.caption || "") + '" loading="lazy">';
      return '<section class="block image-block ' + esc(size) + '"><figure>' +
        (b.url ? a(b.url, img, "image-link") : img) +
        (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") +
      "</figure></section>";
    },
    spacer: function (b) {
      var h = { small: 24, medium: 64, large: 128 }[b.size || "medium"] || 64;
      return '<div class="spacer" style="height:' + h + 'px" aria-hidden="true"></div>';
    }
  };

  /* ---------- pages ---------- */
  var render = {
    home: function () {
      var s = D.settings;
      var blocks = s.home_blocks && s.home_blocks.length ? s.home_blocks : [
        { type: "hero", show_tagline: true },
        { type: "index", title: "Index" },
        { type: "shop", title: "New in the shop", count: num(s.home_shop_count, 4) },
        { type: "instagram", title: "Instagram" }
      ];
      return blocks.map(function (b) {
        var fn = BLOCK[b && b.type];
        return fn ? fn(b, s) : "";
      }).join("");
    },

    writing: function () {
      var p = D.writing, items = p.items || [];
      var hit = items.filter(function (i) { return i.body && slug(i.title) === anchor(); })[0];
      if (hit && !HASH_MODE) {
        return reader({ back: href("writing"), backLabel: p.title, title: hit.title, meta: hit.date, image: hit.image, body: hit.body });
      }
      return pageHead(p.title, p.intro) + rows(items.map(function (i) {
        var url = i.body && !HASH_MODE ? "#" + slug(i.title) : i.url;
        return { date: i.date, title: i.title, note: i.note, url: url };
      }));
    },

    research: function () {
      var p = D.research;
      return pageHead(p.title, p.intro) + rows((p.items || []).map(function (i) {
        return { date: i.date, title: i.title, note: i.note, url: i.url,
                 extra: i.pdf ? '<span class="row-extra">' + a(asset(i.pdf), "PDF", "pill") + "</span>" : "" };
      }));
    },

    cv: function () {
      var p = D.cv;
      var dl = p.pdf ? '<p class="links">' + a(asset(p.pdf), "Download PDF", "pill") + "</p>" : "";
      return pageHead(p.title, p.intro, dl) + (p.sections || []).map(function (sec) {
        return '<section class="cv-sec"><h2 class="block-title">' + esc(sec.heading) + "</h2>" + rows(sec.rows) + "</section>";
      }).join("");
    },

    books: function () {
      var p = D.books;
      return pageHead(p.title, p.intro) +
        tiles(p.items, shape("books", "2 / 3"), cols("books", 4), function (it) { return linkList(it.links); });
    },

    serial: function () {
      var p = D.serial, ch = p.chapters || [];
      var m = anchor().match(/^chapter-(\d+)$/);
      if (m && !HASH_MODE) {
        var idx = -1;
        ch.forEach(function (c, i) { if (String(c.number) === m[1] && c.body) idx = i; });
        if (idx > -1) {
          var c = ch[idx];
          var readable = function (i) { return ch[i] && ch[i].body; };
          var prev = readable(idx - 1) ? '<a href="#chapter-' + esc(ch[idx - 1].number) + '">← Chapter ' + esc(ch[idx - 1].number) + "</a>" : "<span></span>";
          var next = readable(idx + 1) ? '<a href="#chapter-' + esc(ch[idx + 1].number) + '">Chapter ' + esc(ch[idx + 1].number) + " →</a>" : "<span></span>";
          return reader({ back: href("serial"), backLabel: p.novel || p.title, kicker: (p.novel || "") + " · Chapter " + c.number,
                          title: c.title, meta: c.date, body: c.body,
                          pager: '<nav class="pager" aria-label="Chapters">' + prev + next + "</nav>" });
        }
      }
      var read = p.read_on_label ? '<p class="links">' + a(p.read_on_url, esc(p.read_on_label) + arrow(p.read_on_url), "pill") + "</p>" : "";
      var list = ch.map(function (c) {
        var url = c.body && !HASH_MODE ? "#chapter-" + c.number : c.url;
        return { date: c.date, title: c.title, url: url, end: "Chapter " + c.number };
      });
      return pageHead(p.title, "") +
        '<div class="novel">' +
          (p.cover ? '<div class="novel-cover">' + pic(p.cover, p.novel) + "</div>" : "") +
          '<div class="novel-text"><p class="novel-title">' + esc(p.novel) + '</p><p class="intro">' + esc(p.intro) + "</p>" + read + "</div>" +
        "</div>" + rows(list);
    },

    podcast: function () {
      var p = D.podcast;
      var eps = (p.episodes || []).map(function (e) {
        var player = e.audio ? '<audio class="player" controls preload="none" src="' + esc(asset(e.audio)) + '"></audio>' : "";
        return { date: e.date, title: e.title, url: e.url, note: [e.length, e.note].filter(Boolean).join(" · "),
                 end: "No. " + e.number, extra: player };
      });
      return pageHead(p.title, "") +
        '<div class="novel">' +
          (p.cover ? '<div class="novel-cover square">' + pic(p.cover, p.show) + "</div>" : "") +
          '<div class="novel-text"><p class="novel-title">' + esc(p.show) + '</p><p class="intro">' + esc(p.intro) + "</p>" + linkList(p.listen) + "</div>" +
        "</div>" + rows(eps);
    },

    video: function () {
      var p = D.video;
      var ch = p.channel_label ? '<p class="links">' + a(p.channel_url, esc(p.channel_label) + arrow(p.channel_url), "pill") + "</p>" : "";
      var items = (p.items || []).map(function (i) {
        var id = youtubeId(i.url);
        return { title: i.title, note: i.note, url: i.url,
                 image: i.image || (id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : "") };
      });
      return pageHead(p.title, p.intro, ch) + tiles(items, "16 / 9", cols("video", 3));
    },

    objects: function () {
      var p = D.objects;
      return pageHead(p.title, p.intro) + tiles(p.items, shape("objects", "4 / 5"), cols("objects", 4), function (it) {
        return it.in_shop ? '<p class="tile-more"><a href="' + esc(href("shop")) + '">In the shop</a></p>' : "";
      });
    },
    art: function () { var p = D.art; return pageHead(p.title, p.intro) + tiles(p.items, shape("art", "4 / 5"), cols("art", 4)); },
    wardrobe: function () { var p = D.wardrobe; return pageHead(p.title, p.intro) + tiles(p.items, shape("wardrobe", "3 / 4"), cols("wardrobe", 4)); },
    picks: function () {
      var p = D.picks;
      return pageHead(p.title, p.intro) + tiles(p.items, shape("picks", "1 / 1"), cols("picks", 4)) +
        (p.disclosure ? '<p class="fine">' + esc(p.disclosure) + "</p>" : "");
    },
    shop: function () {
      var p = D.shop;
      return pageHead(p.title, p.intro) + tiles(p.items, shape("shop", "4 / 5"), cols("shop", 3), shopAction);
    },
    notfound: function () {
      return pageHead("Not here", "This page doesn't exist.") +
        '<p class="links"><a class="pill" href="' + esc(href("home")) + '">Back to the studio</a></p>';
    }
  };

  function needsMarked(page) {
    if (page === "home") return (D.settings.home_blocks || []).some(function (b) { return b && b.type === "text" && b.body; });
    if (page === "writing") return (D.writing.items || []).some(function (i) { return i.body; });
    if (page === "serial") return (D.serial.chapters || []).some(function (c) { return c.body; });
    return false;
  }

  function draw(page) {
    if (PAGES.indexOf(page) < 0) page = "home";
    var s = D.settings, bar = "";
    if (s.announcement && s.announcement.text) {
      bar = '<div class="notice">' + (s.announcement.url
        ? a(s.announcement.url, esc(s.announcement.text) + arrow(s.announcement.url), "")
        : esc(s.announcement.text)) + "</div>";
    }
    app.innerHTML = bar + header(page) + '<main id="main" class="page page-' + page + '">' + render[page]() + "</main>" + footer() +
      (PREVIEW ? '<p class="preview-badge">Preview · not saved yet</p>' : "");
    var name = D.settings.name;
    var reading = app.querySelector(".reader h1");
    document.title = page === "home" ? name
      : (reading ? reading.textContent + " — " : "") + (page === "notfound" ? "Not found" : label(page)) + " — " + name;
    var btn = document.getElementById("menu-btn");
    var nav = document.getElementById("site-nav");
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      btn.textContent = open ? "Menu" : "Close";
      nav.classList.toggle("open", !open);
    });
  }

  function load(name) {
    return fetch(ROOT + "data/" + name + ".json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(name); return r.json(); })
      .then(function (j) { D[name] = j || {}; })
      .catch(function () { D[name] = { title: name, items: [] }; });
  }

  Promise.all(["settings", "design"].concat(SECTIONS).map(load)).then(function () {
    if (PREVIEW) {
      var drafts = readDrafts();
      Object.keys(drafts).forEach(function (k) { D[k] = drafts[k]; });
    }
    D.settings = D.settings || {};
    applyDesign(D.design);
    var page = HASH_MODE ? (anchor() || "home") : app.getAttribute("data-page");
    var current = function () { return HASH_MODE ? (anchor() || "home") : page; };
    var go = function () {
      if (anchor() === "main") return;   // "Skip to content" link, not a page change
      draw(current());
      window.scrollTo(0, 0);
    };
    var start = function () {
      go();
      window.addEventListener("hashchange", go);
    };

    if (PREVIEW) {
      // Unsaved changes arrive from the editor; redraw in place without jumping to the top.
      window.addEventListener("message", function (e) {
        if (e.origin !== location.origin) return;
        var m = e.data;
        if (!m || m.type !== "alyx-preview" || !m.file) return;
        D[m.file] = m.data || {};
        if (m.file === "settings") D.settings = D.settings || {};
        saveDraft(m.file, D[m.file]);
        if (m.file === "design") applyDesign(D.design);
        var y = window.scrollY;
        var redraw = function () { draw(current()); window.scrollTo(0, y); };
        if (needsMarked(current())) loadMarked().then(redraw); else redraw();
      });
      try { window.parent.postMessage({ type: "alyx-preview-ready" }, location.origin); } catch (e) {}
    }

    if (!HASH_MODE && needsMarked(page)) loadMarked().then(start); else start();
  });
})();
