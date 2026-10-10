/* Live preview for the Alyx's Studio editor.
   The preview pane shows the real website, and every change you type is sent to it
   before you save. Nothing here changes the published site. */
(function () {
  "use strict";
  var CMS = window.CMS;
  if (!CMS || !CMS.React || !CMS.registerPreviewTemplate) return;

  var React = CMS.React;
  var h = React.createElement;
  var useEffect = React.useEffect, useRef = React.useRef, useState = React.useState;

  // Which page of the site to show for each file in the editor
  var PAGES = {
    design: "", settings: "",
    writing: "writing/", research: "research/", cv: "cv/", books: "books/", serial: "serial/",
    podcast: "podcast/", video: "video/", objects: "objects/", art: "art/", wardrobe: "wardrobe/",
    picks: "picks/", shop: "shop/"
  };
  var DESKTOP = 1280, PHONE = 390;
  var ORIGIN = window.location.origin;

  function plain(v) {
    if (v && typeof v.toJS === "function") return v.toJS();
    if (v == null) return {};
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return {}; }
  }
  // Pictures you just uploaded aren't on the website yet; show them from the editor's copy.
  function swapAssets(v, getAsset) {
    if (typeof v === "string") {
      if (getAsset && /^\/?assets\/uploads\//.test(v)) {
        try { var a = getAsset(v); if (a && a.url) return a.url; } catch (e) {}
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(function (x) { return swapAssets(x, getAsset); });
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = swapAssets(v[k], getAsset); });
      return o;
    }
    return v;
  }

  function makePreview(file) {
    return function SitePreview(props) {
      var frame = useRef(null);
      var box = useRef(null);
      var pid = useRef("p" + Math.random().toString(36).slice(2, 10));
      var latest = useRef("{}");
      var modeState = useState("desktop"), mode = modeState[0], setMode = modeState[1];
      var sizeState = useState({ w: 900, h: 760 }), size = sizeState[0], setSize = sizeState[1];

      var raw = props.entry && props.entry.getIn ? props.entry.getIn(["data"]) : null;
      var json = JSON.stringify(swapAssets(plain(raw), props.getAsset));
      latest.current = json;

      function send() {
        var f = frame.current;
        if (!f || !f.contentWindow) return;
        try {
          f.contentWindow.postMessage({ type: "alyx-preview", file: file, data: JSON.parse(latest.current) }, ORIGIN);
        } catch (e) {}
      }

      // send every change
      useEffect(send, [json]);

      // the site says "ready" when it has loaded; send the current draft then
      useEffect(function () {
        var win = props.window || window;
        function onMessage(e) { if (e.data && e.data.type === "alyx-preview-ready") send(); }
        win.addEventListener("message", onMessage);
        return function () { win.removeEventListener("message", onMessage); };
      }, []);

      // keep the scaled desktop view fitted to the pane
      useEffect(function () {
        var el = box.current;
        var win = props.window || window;
        if (!el) return;
        function measure() { setSize({ w: el.clientWidth || 900, h: el.clientHeight || 760 }); }
        measure();
        var RO = win.ResizeObserver || window.ResizeObserver;
        if (RO) {
          var ro = new RO(measure);
          ro.observe(el);
          return function () { ro.disconnect(); };
        }
        win.addEventListener("resize", measure);
        return function () { win.removeEventListener("resize", measure); };
      }, []);

      var src = "/" + PAGES[file] + "?preview=1&pid=" + pid.current;
      var desktop = mode === "desktop";
      var scale = desktop ? Math.min(1, size.w / DESKTOP) : 1;
      var frameW = desktop ? DESKTOP : PHONE;
      var frameH = desktop ? Math.ceil(size.h / scale) : size.h;

      function tab(label, value) {
        var on = mode === value;
        return h("button", {
          type: "button",
          onClick: function () { setMode(value); },
          "aria-pressed": on ? "true" : "false",
          style: {
            font: "500 12px/1 system-ui, sans-serif", padding: "7px 12px", borderRadius: "999px", cursor: "pointer",
            border: "1px solid #111", background: on ? "#111" : "#fff", color: on ? "#fff" : "#111"
          }
        }, label);
      }

      return h("div", {
        style: { display: "flex", flexDirection: "column", height: "100vh", minHeight: "480px", background: "#ecebe7" }
      },
        h("div", {
          style: {
            display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 12px",
            background: "#fff", borderBottom: "1px solid #ddd", font: "12px/1.4 system-ui, sans-serif", color: "#555"
          }
        },
          tab("电脑", "desktop"),
          tab("手机", "phone"),
          h("span", { style: { marginLeft: "6px" } }, "实时预览 · 点保存后网站才会更新"),
          h("a", {
            href: "/" + PAGES[file], target: "_blank", rel: "noopener",
            style: { marginLeft: "auto", color: "#111" }
          }, "查看已发布的网站 ↗")
        ),
        h("div", { ref: box, style: { position: "relative", flex: "1 1 auto", overflow: "hidden" } },
          h("iframe", {
            ref: frame,
            src: src,
            title: "Website preview",
            onLoad: send,
            style: {
              position: "absolute", top: 0, left: desktop ? 0 : "50%", border: 0, background: "#fff",
              width: frameW + "px", height: frameH + "px",
              transform: desktop ? "scale(" + scale + ")" : "translateX(-50%)",
              transformOrigin: "0 0",
              boxShadow: desktop ? "none" : "0 0 0 1px #d6d5d0"
            }
          })
        )
      );
    };
  }

  Object.keys(PAGES).forEach(function (file) {
    CMS.registerPreviewTemplate(file, makePreview(file));
  });
})();
