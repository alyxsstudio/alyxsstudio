/* Alyx's Studio — a Word (.docx) file made in the browser.
   Plain: paragraphs as they are. MLA 9: Times New Roman 12, double spaced, 1-inch margins,
   last name and page number top right, heading block, centred title, first lines indented,
   Works Cited on a new page with hanging indents. *Text in stars* becomes italic. */
(function () {
  "use strict";
  function x(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  // runs: *italic* and **bold**; a line break inside a paragraph (a poem) stays a line break
  function runs(text, base) {
    var out = "", re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g, last = 0, m;
    var run = function (t, i, b) {
      if (!t) return "";
      return "<w:r><w:rPr>" + (base || "") + (b ? "<w:b/>" : "") + (i ? "<w:i/>" : "") + '</w:rPr><w:t xml:space="preserve">' + x(t).split("\n").join('</w:t><w:br/><w:t xml:space="preserve">') + "</w:t></w:r>";
    };
    text = String(text || "");
    while ((m = re.exec(text))) {
      out += run(text.slice(last, m.index));
      var t = m[0];
      out += t.indexOf("**") === 0 ? run(t.slice(2, -2), false, true) : run(t.slice(1, -1), true, false);
      last = m.index + t.length;
    }
    return out + run(text.slice(last));
  }
  function para(text, ppr, base) { return "<w:p><w:pPr>" + (ppr || "") + "</w:pPr>" + runs(text, base) + "</w:p>"; }

  function build(o) {
    o = o || {};
    var mla = !!o.mla, font = o.font || (mla ? "Times New Roman" : "Times New Roman"), east = o.eastFont || "SimSun";
    var rpr = '<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:eastAsia="' + east + '"/><w:sz w:val="24"/>';
    var dbl = mla ? '<w:spacing w:line="480" w:lineRule="auto" w:after="0" w:before="0"/>' : '<w:spacing w:line="360" w:lineRule="auto" w:after="160"/>';
    var body = "";
    if (mla) {
      var h = o.mla || {};
      [h.name, h.instructor, h.course, h.date].filter(Boolean).forEach(function (l) { body += para(l, dbl); });
      body += para(o.title || "", dbl + '<w:jc w:val="center"/>');
    } else if (o.title) {
      body += para(o.title, '<w:spacing w:after="240"/>', '<w:b/><w:sz w:val="32"/>');
    }
    (o.paragraphs || []).forEach(function (p) {
      if (/^#+\s/.test(p)) { body += para(p.replace(/^#+\s*/, ""), dbl + (mla ? "" : '<w:keepNext/>'), "<w:b/>"); return; }
      body += para(p, dbl + (mla ? '<w:ind w:firstLine="720"/>' : ""));
    });
    if (o.worksCited && o.worksCited.length) {
      body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      body += para(o.worksCitedTitle || "Works Cited", dbl + '<w:jc w:val="center"/>');
      o.worksCited.forEach(function (e) { body += para(e, dbl + '<w:ind w:left="720" w:hanging="720"/>'); });
    }
    var sect = '<w:sectPr>' + (mla ? '<w:headerReference w:type="default" r:id="rIdH1"/>' : "") +
      '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + "><w:body>" + body + sect + "</w:body></w:document>";
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS + '><w:docDefaults><w:rPrDefault><w:rPr>' + rpr +
      '<w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' + dbl + "</w:pPr></w:pPrDefault></w:docDefaults></w:styles>";
    var header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ' + NS + '><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' +
      x(((o.mla || {}).lastName || "") + " ") + '</w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr>' + rpr + "</w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:hdr>";
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      (mla ? '<Relationship Id="rIdH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : "") + "</Relationships>";
    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      (mla ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : "") + "</Types>";
    var root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    var z = new window.JSZip();
    z.file("[Content_Types].xml", types); z.file("_rels/.rels", root);
    z.file("word/document.xml", doc); z.file("word/styles.xml", styles); z.file("word/_rels/document.xml.rels", rels);
    if (mla) z.file("word/header1.xml", header);
    return z.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  window.AlyxDocx = { build: build };
})();
