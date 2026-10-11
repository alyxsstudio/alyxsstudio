/* Alyx's Studio — reading a draft closely, on the page, with no AI and nothing sent anywhere.
   Splits a draft into paragraphs and sentences and works out:
   - how much information each sentence carries (names, dates, quotations, citations, specific terms)
     and how much is filler or AI-style padding;
   - which paragraphs say the same thing (versions) and which belong to the same topic;
   - which years a paragraph is about (for a timeline order);
   - how close a paragraph stays to the thesis;
   - sentences that quote or attribute without a citation; MLA 9 slips; Portuguese words to check.
   Works for Chinese, English and Portuguese mixed together. */
(function (root) {
  "use strict";

  var CJK = /[㐀-鿿豈-﫿]/;
  var FUNC = "的了是在和与及而也就都又将把被让给向从对于之其所这那个们着过地得不没有为以及并或但如若则即乃此该等";
  var STOP_EN = {};
  ("the a an of and or to in on for with as by at from that this these those is are was were be been being it its into than then there their they he she his her him we our you your i not no but also which who whom whose what when where how about such can could may might will would should one two its more most other some any all each very much many only just even so if do does did has have had".split(" ")).forEach(function (w) { STOP_EN[w] = 1; });
  // padding that adds words but no information (Chinese, English, and common AI phrasing)
  var FILLER = [
    "总而言之", "总的来说", "综上所述", "值得注意的是", "值得一提的是", "不难看出", "可以说", "换句话说", "事实上", "实际上", "在某种程度上", "一定程度上", "某种意义上",
    "众所周知", "毋庸置疑", "显而易见", "不言而喻", "具有重要意义", "起到了重要作用", "发挥了重要作用", "深刻地", "极大地", "进一步", "更加", "非常", "十分", "进行了", "加以",
    "从而", "由此可见", "我们可以看到", "可以看出", "无疑", "不可否认", "意义深远", "独特的视角", "深入探讨", "多维度", "多层次", "丰富的内涵",
    "it is worth noting", "it should be noted", "in other words", "essentially", "basically", "arguably", "in a sense", "it can be said", "plays an important role",
    "plays a crucial role", "delve", "tapestry", "intricate", "multifaceted", "nuanced", "landscape of", "a testament to", "underscores", "highlights the importance",
    "in conclusion", "overall", "ultimately", "very", "quite", "rather", "in terms of", "serves as a", "not only", "rich tapestry", "shed light on", "pivotal"
  ];
  var ATTRIB = /(认为|指出|写道|提出|声称|主张|强调|论证|曾说|所说|称之为|argues?|notes?|claims?|writes?|suggests?|contends?|observes?|according to|as .{1,40} (?:puts|put) it|据)/i;
  var CITE = /\([^()]*\d+[^()]*\)|（[^（）]*\d+[^（）]*）|\[\d+(?:[-–,]\s*\d+)*\]|\(\s*[A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+(?:and|et al\.))?[^()]*\)/;
  var QUOTE = /[“"「『][^”"」』]{6,}[”"」』]/;
  var PT = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/;

  function paragraphs(text) {
    return String(text || "").replace(/\r/g, "").split(/\n\s*\n|\n/).map(function (p) { return p.trim(); }).filter(Boolean);
  }
  function sentences(p) {
    var out = [], re = /[^。！？!?；;…]+(?:[。！？!?；;…]+[”"」』）)]*|$)/g, m;
    var parts = String(p).match(re) || [p];
    // English sentences inside one Chinese-free run
    parts.forEach(function (s) {
      if (CJK.test(s)) { if (s.trim()) out.push(s); return; }
      var en = s.split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"(])/);
      en.forEach(function (x) { if (x.trim()) out.push(x); });
    });
    return out.length ? out : [p];
  }
  function count(text) {
    text = String(text || "");
    var cjk = (text.match(/[㐀-鿿豈-﫿]/g) || []).length;
    var words = (text.replace(/[㐀-鿿豈-﫿]/g, " ").match(/[A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*/g) || []).length;
    return { cjk: cjk, words: words, total: cjk + words };
  }
  function terms(text) {
    var t = String(text || "").toLowerCase(), out = {};
    var add = function (k) { out[k] = (out[k] || 0) + 1; };
    (t.match(/[㐀-鿿]+/g) || []).forEach(function (run) {
      if (run.length === 1) { if (FUNC.indexOf(run) < 0) add(run); return; }
      for (var i = 0; i < run.length - 1; i++) {
        var a = run.charAt(i), b = run.charAt(i + 1);
        if (FUNC.indexOf(a) > -1 || FUNC.indexOf(b) > -1) continue;
        add(run.substr(i, 2));
      }
    });
    (t.match(/[a-zà-ÿ0-9]+(?:['’-][a-zà-ÿ0-9]+)*/g) || []).forEach(function (w) { if (w.length > 2 && !STOP_EN[w] && !/^\d+$/.test(w)) add(w); });
    return out;
  }
  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0, k;
    for (k in a) { na += a[k] * a[k]; if (b[k]) dot += a[k] * b[k]; }
    for (k in b) nb += b[k] * b[k];
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  function weigh(vecs) {
    var df = {}, n = vecs.length;
    vecs.forEach(function (v) { for (var k in v) df[k] = (df[k] || 0) + 1; });
    return vecs.map(function (v) { var w = {}; for (var k in v) w[k] = v[k] * Math.log(1 + n / df[k]); return w; });
  }
  function fillerIn(s) {
    var low = String(s).toLowerCase(), hits = [];
    FILLER.forEach(function (f) { if (low.indexOf(f) > -1) hits.push(f); });
    return hits;
  }
  function years(text) {
    var ys = [];
    String(text).replace(/(?:^|[^\d])(1[0-9]{3}|20[0-9]{2})(?=[^\d]|$)/g, function (_, y) { ys.push(+y); return _; });
    String(text).replace(/([一二三四五六七八九十]{1,3}|\d{1,2})\s*世纪/g, function (_, c) {
      var n = /\d/.test(c) ? +c : "一二三四五六七八九".indexOf(c.charAt(c.length - 1)) + 1 + (c.length > 1 ? 10 : c === "十" ? 9 : 0);
      if (n > 0 && n < 22) ys.push((n - 1) * 100 + 50);
      return _;
    });
    String(text).replace(/(\d{1,2})(?:st|nd|rd|th) century/gi, function (_, c) { ys.push((+c - 1) * 100 + 50); return _; });
    return ys.filter(function (y) { return y >= 1000 && y <= 2100; });
  }
  function specifics(s) {
    var n = 0;
    n += years(s).length * 2;
    n += (s.match(/\d+/g) || []).length;
    n += (s.match(/[“"「『《][^”"」』》]{2,}[”"」』》]/g) || []).length * 2;
    n += (s.match(/\*[^*]{2,}\*/g) || []).length * 2;
    n += CITE.test(s) ? 2 : 0;
    n += (s.match(/(?:^|[^.!?]\s)([A-ZÀ-Ý][a-zà-ÿ]{2,})/g) || []).length;          // names in Latin script
    n += (s.match(/[A-Za-zÀ-ÿ]+/g) || []).filter(function (w) { return PT.test(w); }).length;
    return n;
  }

  /* the main reading. opts: { thesis, keywords, alternatives:[text] } */
  function analyze(text, opts) {
    opts = opts || {};
    var paras = paragraphs(text);
    var raw = paras.map(terms);
    var vec = weigh(raw);
    var info = paras.map(function (p, i) {
      var ss = sentences(p).map(function (s) {
        var c = count(s).total || 1, t = terms(s), distinct = Object.keys(t).length, fl = fillerIn(s), sp = specifics(s);
        var dens = (distinct + 2.2 * sp) / Math.sqrt(c) - 1.4 * fl.length;
        var needs = (QUOTE.test(s) || ATTRIB.test(s)) && !CITE.test(s);
        return { text: s, len: c, density: dens, filler: fl, needsCite: needs };
      });
      return { i: i, text: p, heading: /^#/.test(p), len: count(p).total, sentences: ss, years: years(p), vec: vec[i], cjk: CJK.test(p) };
    });
    // the Works Cited list is not part of the argument
    var refAt = -1;
    info.forEach(function (p) { if (refAt < 0 && /^\s*#*\s*(works cited|参考文献|引用文献|bibliography)\s*$/i.test(p.text)) refAt = p.i; });
    if (refAt > -1) info.forEach(function (p) { if (p.i >= refAt) { p.ref = true; p.heading = true; p.years = []; p.sentences.forEach(function (x) { x.needsCite = false; }); } });
    // percentile scores (0–100) across the whole draft
    var allS = [];
    info.forEach(function (p) { p.sentences.forEach(function (s) { allS.push(s); }); });
    var sorted = allS.map(function (s) { return s.density; }).sort(function (a, b) { return a - b; });
    var pct = function (v) { if (sorted.length < 2) return 60; var lo = 0; while (lo < sorted.length && sorted[lo] < v) lo++; return Math.round(lo / (sorted.length - 1) * 100); };
    allS.forEach(function (s) { s.score = pct(s.density); s.top = s.score >= 80 && s.len > 6; s.weak = s.score <= 15 || s.filler.length >= 2; });
    info.forEach(function (p) {
      var tot = 0, w = 0;
      p.sentences.forEach(function (s) { tot += s.score * s.len; w += s.len; });
      p.score = w ? Math.round(tot / w) : 0;
      p.filler = p.sentences.reduce(function (a, s) { return a.concat(s.filler); }, []);
      p.needsCite = p.sentences.filter(function (s) { return s.needsCite; }).length;
    });
    // versions: paragraphs that say the same thing
    var DUP = 0.5, TOPIC = 0.2, dupGroups = [], gOf = {};
    for (var a = 0; a < info.length; a++) {
      if (info[a].heading || info[a].len < 12) continue;
      for (var b = a + 1; b < info.length; b++) {
        if (info[b].heading || info[b].len < 12) continue;
        var sim = cosine(info[a].vec, info[b].vec);
        if (sim < DUP) continue;
        var ga = gOf[a], gb = gOf[b];
        if (ga == null && gb == null) { gOf[a] = gOf[b] = dupGroups.length; dupGroups.push([a, b]); }
        else if (ga != null && gb == null) { gOf[b] = ga; dupGroups[ga].push(b); }
        else if (ga == null && gb != null) { gOf[a] = gb; dupGroups[gb].push(a); }
        else if (ga !== gb) { dupGroups[gb].forEach(function (x) { gOf[x] = ga; dupGroups[ga].push(x); }); dupGroups[gb] = []; }
      }
    }
    dupGroups = dupGroups.filter(function (g) { return g.length > 1; }).map(function (g) {
      g.sort(function (x, y) { return x - y; });
      var best = g.slice().sort(function (x, y) { return info[y].score - info[x].score || info[y].len - info[x].len; })[0];
      return { members: g, best: best };
    });
    dupGroups.forEach(function (g, gi) { g.members.forEach(function (m) { info[m].dup = gi; info[m].isBest = m === g.best; }); });
    // topics: paragraphs about the same thing, in the order they first appear
    var topics = [];
    info.forEach(function (p) {
      if (p.heading) return;
      var best = -1, bs = 0;
      topics.forEach(function (t, ti) { var s = cosine(p.vec, t.centroid); if (s > bs) { bs = s; best = ti; } });
      if (best > -1 && bs >= TOPIC) {
        var t = topics[best]; t.members.push(p.i);
        for (var k in p.vec) t.centroid[k] = (t.centroid[k] || 0) + p.vec[k];
      } else topics.push({ members: [p.i], centroid: Object.assign({}, p.vec) });
    });
    topics.forEach(function (t, ti) {
      t.label = Object.keys(t.centroid).sort(function (x, y) { return t.centroid[y] - t.centroid[x]; }).slice(0, 3);
      t.members.forEach(function (m) { info[m].topic = ti; });
      t.years = [];
      t.members.forEach(function (m) { t.years = t.years.concat(info[m].years); });
      t.firstYear = t.years.length ? Math.min.apply(null, t.years) : null;
    });
    // closeness to the thesis (or to the whole draft when no thesis is written yet)
    var anchor = {};
    var thesisText = [opts.thesis || "", opts.keywords || "", opts.keywords || ""].join(" ");
    if (thesisText.trim()) anchor = terms(thesisText);
    else info.forEach(function (p) { for (var k in p.vec) anchor[k] = (anchor[k] || 0) + p.vec[k]; });
    var whole = {};
    info.forEach(function (p) { if (!p.heading) for (var k in p.vec) whole[k] = (whole[k] || 0) + p.vec[k]; });
    var thesisCJK = CJK.test(thesisText);
    info.forEach(function (p) {
      // a paragraph in another language than the thesis is compared with the rest of the draft instead
      var sameScript = !thesisText.trim() || p.cjk === thesisCJK;
      var rest = {}; for (var k in whole) rest[k] = whole[k] - (p.vec[k] || 0);
      p.relDraft = cosine(p.vec, rest);
      p.relevance = sameScript ? cosine(p.vec, anchor) : p.relDraft;
      p.relBasis = sameScript ? "thesis" : "draft";
    });
    // only a hint: far from the thesis words AND from everything else in the draft
    info.forEach(function (p) {
      p.drift = !p.heading && p.len > 15 && p.relBasis === "thesis" && p.relevance < 0.05 && p.relDraft < 0.06;
    });
    // versions kept aside (alternatives): attach each to the paragraph it resembles most
    var alts = (opts.alternatives || []).map(function (t, ai) {
      var v = terms(t), best = -1, bs = 0;
      info.forEach(function (p) { var s = cosine(v, raw[p.i]); if (s > bs) { bs = s; best = p.i; } });
      return { i: ai, text: t, to: bs >= 0.35 ? best : -1, sim: bs };
    });
    info.forEach(function (p) { p.versions = alts.filter(function (x) { return x.to === p.i; }).map(function (x) { return x.i; }); });
    var c = count(text);
    return { paragraphs: info, dupGroups: dupGroups, topics: topics, alternatives: alts, count: c };
  }

  /* where should a pasted paragraph go? */
  function place(newText, draftText) {
    var paras = paragraphs(draftText), v = terms(newText), best = -1, bs = 0, exact = -1;
    var norm = function (s) { return String(s).replace(/\s+/g, "").replace(/[，。,.;；:：!！?？“”"'‘’（）()]/g, ""); };
    paras.forEach(function (p, i) {
      if (norm(p) === norm(newText)) exact = i;
      var s = cosine(v, terms(p)); if (s > bs) { bs = s; best = i; }
    });
    return { exact: exact, best: best, sim: bs, kind: exact > -1 ? "repeat" : bs >= 0.5 ? "version" : bs >= 0.2 ? "related" : "new" };
  }

  /* MLA 9 slips in the text (not a full checker) */
  function mlaIssues(text) {
    var out = [], push = function (m, fix, why) { out.push({ found: m, fix: fix, why: why, show: m.length > 70 ? m.slice(0, 66) + "…" : m }); };
    String(text).replace(/\(([A-ZÀ-Ý][^(),]{1,60}),\s*(\d+(?:[-–]\d+)?)\)/g, function (m, a, p) { push(m, "(" + a + " " + p + ")", "MLA puts no comma between author and page"); return m; });
    String(text).replace(/\((?:p|pp)\.\s*(\d+(?:[-–]\d+)?)\)/g, function (m, p) { push(m, "(" + p + ")", "MLA doesn't use p. or pp. in citations"); return m; });
    String(text).replace(/\(([A-ZÀ-Ý][^()]{1,60}?)\s+(?:p|pp)\.\s*(\d+(?:[-–]\d+)?)\)/g, function (m, a, p) { push(m, "(" + a.replace(/,\s*$/, "") + " " + p + ")", "MLA doesn't use p. or pp."); return m; });
    String(text).replace(/\(([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+),\s*(1[5-9]\d\d|20\d\d),\s*(?:p\.\s*)?(\d+(?:[-–]\d+)?)\)/g, function (m, a, y, p) { push(m, "(" + a + " " + p + ")", "That is APA style (author, year, page); MLA uses author and page"); return m; });
    String(text).replace(/([.。,，])(["”])\s*(\([^)]{1,80}\))/g, function (m, punct, q, c) { push(m, q + " " + c + (punct === "，" ? "," : punct === "。" ? "." : punct), "In MLA the citation comes before the final punctuation"); return m; });
    String(text).replace(/（([A-ZÀ-Ý][A-Za-zÀ-ÿ'’ .-]+\s\d+(?:[-–]\d+)?)）/g, function (m, c) { push(m, "(" + c + ")", "Use ordinary parentheses for MLA citations"); return m; });
    // Works Cited list
    var lines = String(text).split(/\n/), at = -1;
    lines.forEach(function (l, i) { if (/^\s*#*\s*(works cited|参考文献|引用文献|bibliography)\s*$/i.test(l)) at = i; });
    var entries = at > -1 ? lines.slice(at + 1).map(function (l) { return l.trim(); }).filter(Boolean) : [];
    for (var i = 1; i < entries.length; i++) {
      if (entries[i].localeCompare(entries[i - 1], "en", { sensitivity: "base" }) < 0) push(entries[i], "", "Works Cited should be in alphabetical order");
    }
    entries.forEach(function (e) {
      if (!/[.]$/.test(e)) push(e, e + ".", "Each Works Cited entry ends with a period");
      if (/\b(1[5-9]\d\d|20\d\d)\b/.test(e) === false) push(e, "", "No year found in this entry");
    });
    return { issues: out, worksCited: entries };
  }

  /* Portuguese words and phrases to spell-check: words with Portuguese letters, and Latin-script text in brackets */
  function portuguese(text) {
    var found = {};
    String(text).replace(/[（(]([^（）()]{2,120})[）)]/g, function (m, inner) {
      if (/[A-Za-zÀ-ÿ]{3,}/.test(inner) && !CJK.test(inner) && !/^\s*[A-ZÀ-Ý][^\d]{0,60}?,?\s*\d/.test(inner) && !/^\s*\d/.test(inner) && !/^\s*(p|pp)\./.test(inner)) found[inner.trim()] = 1;
      return m;
    });
    String(text).replace(/\*([^*\n]{2,120})\*/g, function (m, inner) { if (PT.test(inner)) found[inner.trim()] = 1; return m; });
    (String(text).match(/[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3}/g) || []).forEach(function (w) { if (PT.test(w)) found[w.trim()] = 1; });
    return Object.keys(found);
  }

  var api = { analyze: analyze, paragraphs: paragraphs, sentences: sentences, count: count, terms: terms, cosine: cosine, place: place, mlaIssues: mlaIssues, portuguese: portuguese, fillerIn: fillerIn, years: years };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AlyxAnalyze = api;
})(typeof window !== "undefined" ? window : globalThis);
