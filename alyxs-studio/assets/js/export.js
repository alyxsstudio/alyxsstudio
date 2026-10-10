/* Alyx's Studio — downloads.
   Turns a collection (daily posts, an ongoing project, a visual series, sketches)
   into a ZIP, an EPUB (Kindle / Apple Books) or a print-ready PDF, all in the browser.
   Loaded only when someone presses a download button. */
(function () {
  "use strict";
  var CTX = {};

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function slug(s, max) {
    var out = String(s || "").normalize ? String(s || "").normalize("NFKD") : String(s || "");
    out = out.replace(/[̀-ͯ]/g, "").replace(/[^\w　-鿿가-힯]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return (out || "untitled").slice(0, max || 48);
  }
  function pad(n, w) { n = String(n); while (n.length < (w || 3)) n = "0" + n; return n; }
  function today() { var t = new Date(); return t.getFullYear() + "-" + pad(t.getMonth() + 1, 2) + "-" + pad(t.getDate(), 2); }
  function md(text) {
    text = String(text || "");
    return window.marked && window.marked.parse ? window.marked.parse(text) : text.split(/\n{2,}/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
  }
  function hasCJK(s) { return /[぀-ヿ㐀-鿿가-힯]/.test(s); }
  function loadScript(src) {
    return new Promise(function (res) {
      if (/jszip/.test(src) && window.JSZip) return res();
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = res; document.head.appendChild(s);
    });
  }
  var toastEl = null;
  function toast(msg, keep) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toast.t);
    if (!keep) toast.t = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function save(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function fetchBlob(url) {
    if (!url) return Promise.resolve(null);
    return fetch(CTX.absUrl(url)).then(function (r) { return r.ok ? r.blob() : null; }).catch(function () { return null; });
  }
  function extOf(url, blob) {
    var m = String(url).split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase();
    var t = blob && blob.type || "";
    return t.split("/")[1] || "bin";
  }
  // EPUB readers (and Kindle) are happiest with JPEG; convert webp/png/gif on the fly.
  function toJpeg(blob) {
    return new Promise(function (res) {
      if (!blob) return res(null);
      if (blob.type === "image/jpeg") return res(blob);
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () {
        var max = 1800, s = Math.min(1, max / Math.max(im.width, im.height));
        var c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { res(b); }, "image/jpeg", 0.88);
      };
      im.onerror = function () { URL.revokeObjectURL(url); res(null); };
      im.src = url;
    });
  }
  function needZip() { return loadScript(CTX.root + "assets/js/vendor/jszip.min.js"); }

  /* ---------- ZIP: Markdown text + original files, easy to reuse anywhere ---------- */
  function addCollection(zip, folder, col, cache, progress) {
    var dir = folder ? zip.folder(folder) : zip;
    var jobs = [], manifest = { title: col.title, author: col.author, exported: today(), items: [] };
    col.items.forEach(function (it, i) {
      var base = pad(i + 1) + "-" + slug(it.title, 40);
      var files = [];
      (it.images || []).forEach(function (src, k) {
        jobs.push(function () {
          return getFile(src, cache).then(function (f) {
            if (!f) return;
            var name = "images/" + base + (it.images.length > 1 ? "-" + (k + 1) : "") + "." + f.ext;
            dir.file(name, f.blob); files.push(name);
          });
        });
      });
      if (it.audio) jobs.push(function () {
        return getFile(it.audio, cache).then(function (f) { if (f) { var n = "audio/" + base + "." + f.ext; dir.file(n, f.blob); files.push(n); } });
      });
      jobs.push(function () {
        var front = ["---", "title: " + JSON.stringify(it.title || ""), it.date ? "date: " + it.date : "", files.length ? "files:\n" + files.map(function (f) { return "  - " + f; }).join("\n") : "",
          it.link ? "link: " + it.link.url : "", "---", ""].filter(Boolean).join("\n");
        dir.file("text/" + base + ".md", front + "\n" + (it.text || "") + (it.link && it.link.quote ? "\n\n> " + it.link.quote : "") + "\n");
        manifest.items.push({ title: it.title, date: it.date || "", text: it.text || "", files: files.slice() });
        return Promise.resolve();
      });
    });
    var done = 0;
    return jobs.reduce(function (p, job) {
      return p.then(job).then(function () { done++; if (progress) progress(done, jobs.length); });
    }, Promise.resolve()).then(function () { dir.file("collection.json", JSON.stringify(manifest, null, 2)); });
  }
  function getFile(src, cache) {
    if (cache[src] !== undefined) return Promise.resolve(cache[src]);
    return fetchBlob(src).then(function (b) { cache[src] = b ? { blob: b, ext: extOf(src, b) } : null; return cache[src]; });
  }
  function zip(col) {
    return needZip().then(function () {
      var z = new window.JSZip();
      toast("Packing " + col.title + "…", true);
      return addCollection(z, "", col, {}, function (d, n) { toast("Packing " + col.title + " · " + d + " / " + n, true); })
        .then(function () { return z.generateAsync({ type: "blob" }); })
        .then(function (b) { save(b, slug(col.slug || col.title) + "-" + today() + ".zip"); toast("Downloaded " + col.title + ".zip"); });
    }).catch(function (e) { console.error(e); toast("Couldn't make the ZIP. Try again."); });
  }

  /* ---------- EPUB: for Kindle (Send to Kindle) and Apple Books ---------- */
  function toXhtml(html) {
    var doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
    var div = doc.body.firstChild;
    div.querySelectorAll("img, script, iframe").forEach(function (n) { n.remove(); });
    var s = new XMLSerializer();
    return Array.prototype.map.call(div.childNodes, function (n) { return s.serializeToString(n); }).join("")
      .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, "");
  }
  function page(lang, t, body) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="' + lang + '" xml:lang="' + lang + '">' +
      '<head><meta charset="UTF-8"/><title>' + esc(t) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>' + body + "</body></html>";
  }
  var EPUB_CSS = "body{font-family:serif;line-height:1.6;margin:0 5%}h1,h2{font-weight:normal;line-height:1.25}" +
    ".label{font-family:sans-serif;font-size:.8em;color:#777;letter-spacing:.05em;text-transform:uppercase;margin:2em 0 .3em}" +
    ".date{font-family:sans-serif;font-size:.85em;color:#777}figure{margin:1em 0;text-align:center}figure img{max-width:100%;max-height:90vh}" +
    ".title-page{text-align:center;margin-top:30%}.title-page h1{font-size:2em}.title-page p{color:#777}blockquote{margin-left:1em;padding-left:1em;border-left:1px solid #999}";
  function epub(col) {
    return needZip().then(function () {
      toast("Making the EPUB…", true);
      var allText = col.title + col.items.map(function (i) { return i.title + i.text; }).join("");
      var lang = hasCJK(allText) ? "zh" : "en";
      var z = new window.JSZip();
      z.file("mimetype", "application/epub+zip", { compression: "STORE" });
      z.folder("META-INF").file("container.xml",
        '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
      var o = z.folder("OEBPS"), manifest = [], spine = [], toc = [];
      o.file("style.css", EPUB_CSS);
      manifest.push('<item id="css" href="style.css" media-type="text/css"/>');
      var coverSrc = col.cover || (col.items.filter(function (i) { return (i.images || []).length; })[0] || { images: [] }).images[0];
      var jobs = [], imgN = 0;
      if (coverSrc) jobs.push(function () {
        return fetchBlob(coverSrc).then(toJpeg).then(function (b) {
          if (!b) return;
          o.file("images/cover.jpg", b);
          manifest.push('<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>');
          o.file("cover.xhtml", page(lang, col.title, '<figure><img src="images/cover.jpg" alt="' + esc(col.title) + '"/></figure>'));
          manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
          spine.unshift('<itemref idref="cover"/>');
        });
      });
      o.file("title.xhtml", page(lang, col.title, '<div class="title-page"><h1>' + esc(col.title) + "</h1><p>" + esc(col.author || "") + "</p>" +
        (col.note ? "<p>" + esc(col.note) + "</p>" : "") + "</div>"));
      manifest.push('<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>');
      spine.push('<itemref idref="title"/>');
      col.items.forEach(function (it, i) {
        var id = "c" + pad(i + 1), file = id + ".xhtml";
        jobs.push(function () {
          var imgs = [];
          return (it.images || []).reduce(function (p, src) {
            return p.then(function () {
              return fetchBlob(src).then(toJpeg).then(function (b) {
                if (!b) return;
                imgN++; var name = "images/i" + pad(imgN, 4) + ".jpg";
                o.file(name, b); imgs.push(name);
                manifest.push('<item id="img' + imgN + '" href="' + name + '" media-type="image/jpeg"/>');
              });
            });
          }, Promise.resolve()).then(function () {
            var body = (it.label && it.label !== it.title ? '<p class="label">' + esc(it.label) + "</p>" : "") +
              "<h2>" + esc(it.title || "") + "</h2>" + (it.date ? '<p class="date">' + esc(String(it.date).slice(0, 10)) + "</p>" : "") +
              imgs.map(function (n) { return '<figure><img src="' + n + '" alt=""/></figure>'; }).join("") +
              toXhtml(md(it.text)) +
              (it.link ? "<blockquote><p>" + esc(it.link.quote || it.link.title || it.link.url) + "</p><p>" + esc(it.link.url) + "</p></blockquote>" : "");
            o.file(file, page(lang, it.title || col.title, body));
            manifest.push('<item id="' + id + '" href="' + file + '" media-type="application/xhtml+xml"/>');
            spine.push('<itemref idref="' + id + '"/>');
            toc.push('<li><a href="' + file + '">' + esc(it.title || it.label || "Untitled") + "</a></li>");
            toast("Making the EPUB · " + (i + 1) + " / " + col.items.length, true);
          });
        });
      });
      return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve()).then(function () {
        o.file("nav.xhtml", page(lang, "Contents", '<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>' + toc.join("") + "</ol></nav>"));
        manifest.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
        var uid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
        o.file("content.opf",
          '<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="' + lang + '">' +
          '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:' + uid + "</dc:identifier>" +
          "<dc:title>" + esc(col.title) + "</dc:title><dc:creator>" + esc(col.author || "") + "</dc:creator><dc:language>" + lang + "</dc:language>" +
          '<meta property="dcterms:modified">' + new Date().toISOString().replace(/\.\d+Z$/, "Z") + "</meta>" +
          (manifest.some(function (m) { return /cover-image/.test(m); }) ? '<meta name="cover" content="cover-image"/>' : "") +
          "</metadata><manifest>" + manifest.join("") + '</manifest><spine>' + spine.join("") + "</spine></package>");
        return z.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
      }).then(function (b) { save(b, slug(col.slug || col.title) + "-" + today() + ".epub"); toast("Downloaded " + col.title + ".epub"); });
    }).catch(function (e) { console.error(e); toast("Couldn't make the EPUB. Try again."); });
  }

  /* ---------- PDF: a clean print layout, then the browser's "Save as PDF" ---------- */
  function pdf(col) {
    var old = document.getElementById("print-book"); if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = "print-book"; wrap.className = "print-book";
    wrap.innerHTML =
      '<section class="pb-title"><h1>' + esc(col.title) + "</h1><p>" + esc(col.author || "") + "</p>" + (col.note ? "<p>" + esc(col.note) + "</p>" : "") + "</section>" +
      col.items.map(function (it) {
        return '<section class="pb-item">' +
          (it.label && it.label !== it.title ? '<p class="pb-label">' + esc(it.label) + "</p>" : "") +
          (it.title ? "<h2>" + esc(it.title) + "</h2>" : "") + (it.date ? '<p class="pb-date">' + esc(String(it.date).slice(0, 10)) + "</p>" : "") +
          (it.images || []).map(function (src) { return '<figure><img src="' + esc(CTX.absUrl(src)) + '" alt=""></figure>'; }).join("") +
          '<div class="pb-text">' + md(it.text) + "</div></section>";
      }).join("");
    var style = document.createElement("style");
    style.id = "print-book-style";
    style.textContent =
      ".print-book{display:none}" +
      "@media print{body>*:not(.print-book){display:none!important}.print-book{display:block;color:#000;background:#fff;font-family:var(--sans);}" +
      ".pb-title{height:90vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;break-after:page}" +
      ".pb-title h1{font-size:32pt;font-weight:500;margin:0 0 12pt}.pb-title p{color:#666;margin:4pt 0}" +
      ".pb-item{break-before:page;padding-top:12pt}.pb-item:first-of-type{break-before:auto}" +
      ".pb-item h2{font-size:18pt;font-weight:500;margin:0 0 6pt}.pb-label,.pb-date{font-size:9pt;color:#666;margin:0 0 8pt}" +
      ".pb-item figure{margin:0 0 12pt;text-align:center}.pb-item img{max-width:100%;max-height:78vh;object-fit:contain}" +
      ".pb-text{font-size:11pt;line-height:1.6}@page{margin:18mm}}";
    document.head.appendChild(style);
    document.body.appendChild(wrap);
    toast("Getting pages ready…", true);
    var imgs = Array.prototype.slice.call(wrap.querySelectorAll("img"));
    Promise.all(imgs.map(function (im) {
      return im.complete ? null : new Promise(function (r) { im.onload = im.onerror = r; });
    })).then(function () {
      toast("Choose “Save as PDF” in the print window.");
      var clean = function () { setTimeout(function () { wrap.remove(); style.remove(); }, 500); window.removeEventListener("afterprint", clean); };
      window.addEventListener("afterprint", clean);
      window.print();
    });
  }

  /* ---------- Download everything (owner) ---------- */
  function all() {
    return needZip().then(function () {
      var z = new window.JSZip(), cache = {}, get = CTX.getJSON;
      var name = (CTX.settings.name || "alyxs-studio");
      toast("Collecting everything…", true);
      var files = ["settings", "theme", "sections", "follow", "books", "store", "traces"];
      var raw = {};
      return Promise.all(files.map(function (f) { return get("data/" + f + ".json").then(function (j) { raw[f] = j; }); }))
        .then(function () { return Promise.all(["daily", "ongoing", "visual", "design"].map(function (f) { return get("data/gen/" + f + ".json").then(function (j) { raw[f] = j || {}; }); })); })
        .then(function () {
          Object.keys(raw).forEach(function (k) { z.folder("data").file(k + ".json", JSON.stringify(raw[k], null, 2)); });
          var cols = [];
          cols.push(["daily", { title: "Daily", items: ((raw.daily || {}).posts || []).slice().reverse().map(function (p) {
            return { title: p.day + " " + String(p.date || "").slice(11, 16), date: p.date, text: p.text || "", images: p.images || [], audio: p.audio || "", link: p.link && p.link.url ? p.link : null };
          }) }]);
          cols.push(["design", { title: "Design", items: ((raw.design || {}).items || []).map(function (x) { return { title: x.title, date: x.date, text: x.note || "", images: x.images || [] }; }) }]);
          ((raw.visual || {}).series || []).forEach(function (s) {
            cols.push(["visual/" + s.id, { title: s.title, items: (s.images || []).map(function (im) { return { title: im.title || "", images: [im.image, im.phone, im.desktop].filter(Boolean) }; }) }]);
          });
          cols.push(["books", { title: "Books", items: ((raw.books || {}).items || []).map(function (b) { return { title: b.title, text: (b.note || "") + "\n\n" + (b.links || []).map(function (l) { return "- " + l.label + ": " + (l.url || ""); }).join("\n"), images: [b.image].filter(Boolean) }; }) }]);
          cols.push(["store", { title: "Store", items: ((raw.store || {}).items || []).map(function (b) { return { title: b.title, text: [b.category, b.price, b.note, b.url].filter(Boolean).join("\n\n"), images: [b.image].filter(Boolean) }; }) }]);
          var projects = (raw.ongoing || {}).projects || [];
          return projects.reduce(function (p, pr) {
            return p.then(function () {
              return get("data/gen/ongoing-" + pr.id + ".json").then(function (j) {
                z.folder("data").file("ongoing-" + pr.id + ".json", JSON.stringify(j, null, 2));
                cols.push(["ongoing/" + pr.id, { title: pr.title, items: ((j || {}).entries || []).map(function (e) { return { title: e.title || "", date: e.date, text: e.text || "", images: e.images || [], audio: e.audio || "" }; }) }]);
              });
            });
          }, Promise.resolve()).then(function () { return cols; });
        })
        .then(function (cols) {
          return cols.reduce(function (p, c, i) {
            return p.then(function () {
              return addCollection(z, c[0], c[1], cache, function (d, n) { toast("Packing " + c[1].title + " (" + (i + 1) + "/" + cols.length + ") · " + d + " / " + n, true); });
            });
          }, Promise.resolve());
        })
        .then(function () { return z.generateAsync({ type: "blob" }); })
        .then(function (b) { save(b, slug(name) + "-archive-" + today() + ".zip"); toast("Downloaded the whole studio."); });
    }).catch(function (e) { console.error(e); toast("Couldn't pack everything. Try again."); });
  }

  function wrap(fn) { return function (col, ctx) { CTX = ctx || CTX; return fn(col); }; }
  window.AlyxExport = { zip: wrap(zip), epub: wrap(epub), pdf: wrap(pdf), all: wrap(all) };
})();
