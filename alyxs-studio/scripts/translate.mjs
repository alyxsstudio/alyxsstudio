// Alyx's Studio — makes English versions of Chinese text before each publish.
//
//   node scripts/translate.mjs <site folder>
//
// Which translator is used depends on which key is saved in the repository's
// Settings → Secrets and variables → Actions (the first one found wins):
//   ANTHROPIC_API_KEY  Claude — the most natural, literary English (paid, a few cents a month)
//   GEMINI_API_KEY     Google Gemini — free key from aistudio.google.com, good English
//   DEEPL_API_KEY      DeepL — free plan, good English
//   (no key)           MyMemory — free, no setup, plainer English and about 5,000 characters a day
// Only new or changed paragraphs are translated; results are kept in data/translations.json,
// so each paragraph is translated once. Corrections made by hand in that file are always kept.
// Text translated by the no-key fallback is redone automatically once a key is added.
import { promises as fs } from "node:fs";
import path from "node:path";
import { walk, hasCJK, hash, paragraphs, readCache, writeCache } from "./i18n.mjs";

const SITE = path.resolve(process.argv[2] || ".");
const CACHE = path.join(SITE, "data", "translations.json");
const STATUS = path.join(SITE, "data", "translate-status.json");   // published, so problems are easy to see
const MAX_REQUESTS = Number(process.env.MAX_TRANSLATE_REQUESTS || 60);
const env = process.env;
const status = { checked: new Date().toISOString(), translator: "", paragraphs: 0, waiting: 0, translated: 0, requests: 0, problems: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problem = (s) => { console.warn("  " + s); status.problems.push(String(s).slice(0, 400)); };

const SYSTEM = [
  "You translate a writer's Chinese into natural, literary English for her personal website.",
  "Keep her voice, rhythm and line breaks. Keep Markdown (**bold**, *italics*, headings, lists, links) exactly where it is.",
  "Keep names, brand names, URLs, emoji and any English words as they are. If a string is partly English, translate only the Chinese.",
  "Short strings are titles, captions or single dictionary words: translate them as titles or words, not sentences.",
  "The input is a JSON object of numbered strings. Answer with a JSON object only, with exactly the same keys, each holding the English for that string."
].join(" ");

// ---------- what needs English ----------
async function collect() {
  const sources = [];
  const addFile = async (file) => {
    try { sources.push(JSON.parse(await fs.readFile(file, "utf8"))); } catch {}
  };
  for (const dir of ["daily", "entries", "projects", "visual", "design"]) {
    const d = path.join(SITE, "content", dir);
    let files = [];
    try { files = (await fs.readdir(d)).filter((f) => f.endsWith(".json")); } catch {}
    for (const f of files) await addFile(path.join(d, f));
  }
  for (const f of ["books", "store", "traces", "sections", "settings", "follow"]) await addFile(path.join(SITE, "data", f + ".json"));
  const needed = new Map();
  for (const obj of sources) {
    walk(obj, (holder, key, value) => {
      if (holder[key + "_en"]) return; // written by hand
      const parts = Array.isArray(value) ? value : paragraphs(value);
      for (const p of parts) if (hasCJK(p)) needed.set(hash(p), p.trim());
    });
  }
  return needed;
}

// ---------- reading a language model's answer ----------
// {"1": "...", "2": "..."} (asked for), or a plain list, or — for a single item — just the text.
function parseAnswer(raw, n) {
  const text = String(raw || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let v = null;
  try { v = JSON.parse(text); } catch {
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    if (m) try { v = JSON.parse(m[0]); } catch {}
  }
  if (v && !Array.isArray(v) && typeof v === "object") {
    const inner = Object.values(v).find(Array.isArray);
    if (inner && Object.keys(v).length === 1) v = inner;
  }
  if (Array.isArray(v)) return v.length === n ? v.map(String) : null;
  if (v && typeof v === "object") {
    const out = [];
    for (let i = 1; i <= n; i++) { const x = v[String(i)]; if (typeof x !== "string") return null; out.push(x); }
    return out;
  }
  if (n === 1 && text && !/^[\[{]/.test(text)) return [text];
  return null;
}
const numbered = (texts) => { const o = {}; texts.forEach((t, i) => { o[String(i + 1)] = t; }); return JSON.stringify(o); };

async function call(url, options) {
  const res = await fetch(url, options).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  const body = await res.text();
  let json = null; try { json = JSON.parse(body); } catch {}
  return { ok: res.ok, status: res.status, body, json };
}

// A model-based translator: tries each model in turn; stops early on sign-in problems.
function llm(name, models, request, read, pause) {
  return {
    name, rank: 3, chunkChars: 2400, chunkItems: 40, pause,
    async run(texts) {
      for (const model of models) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await call(...request(model, texts));
          if (r.ok) {
            const out = parseAnswer(read(r.json), texts.length);
            if (out) return out;
            problem(`${name} ${model}: answer did not match: ${(read(r.json) || r.body).slice(0, 200)}`);
            continue;
          }
          problem(`${name} ${model}: HTTP ${r.status} ${r.body.slice(0, 240)}`);
          if (r.status === 401 || r.status === 403) return null;  // key not accepted
          if (r.status === 404 || r.status === 400) break;        // try the next model
          await sleep(r.status === 429 ? 15000 : 3000);
        }
      }
      return null;
    }
  };
}

const TRANSLATORS = {
  claude: () => env.ANTHROPIC_API_KEY && llm("Claude", ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-sonnet-4-5"],
    (model, texts) => ["https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 8000, temperature: 0.3, system: SYSTEM, messages: [{ role: "user", content: numbered(texts) }] })
    }],
    (j) => (j && Array.isArray(j.content) ? j.content.filter((c) => c.type === "text").map((c) => c.text).join("") : ""), 1000),

  gemini: () => env.GEMINI_API_KEY && llm("Gemini", ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"],
    (model, texts) => [`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: numbered(texts) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
      })
    }],
    (j) => { try { return j.candidates[0].content.parts.map((p) => p.text || "").join(""); } catch { return ""; } }, 7000), // free plan: ~10 a minute

  deepl: () => env.DEEPL_API_KEY && {
    name: "DeepL", rank: 2, chunkChars: 20000, chunkItems: 50, pause: 500,
    async run(texts) {
      const host = env.DEEPL_API_KEY.trim().endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
      const r = await call(`https://${host}/v2/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "DeepL-Auth-Key " + env.DEEPL_API_KEY.trim() },
        body: JSON.stringify({ text: texts, source_lang: "ZH", target_lang: "EN-US", preserve_formatting: true })
      });
      if (r.ok && r.json && Array.isArray(r.json.translations) && r.json.translations.length === texts.length)
        return r.json.translations.map((t) => t.text);
      problem(`DeepL: HTTP ${r.status} ${r.body.slice(0, 240)}`);
      return null;
    }
  },

  // Free, no key. Pieces of at most ~450 characters; stops for the day when the quota is used up.
  mymemory: () => env.TRANSLATE_FREE !== "0" && {
    name: "MyMemory (free, no key)", rank: 1, chunkChars: 1, chunkItems: 1, pause: 300,
    async run(texts) {
      const pieces = splitForFree(texts[0]);
      const out = [];
      for (const piece of pieces) {
        if (!hasCJK(piece)) { out.push(piece); continue; }
        const url = "https://api.mymemory.translated.net/get?langpair=zh-CN%7Cen&q=" + encodeURIComponent(piece);
        const r = await call(url, { headers: { Accept: "application/json" } });
        const d = r.json || {};
        const code = Number(d.responseStatus);
        const t = d.responseData && d.responseData.translatedText;
        if (!r.ok || code !== 200 || !t || d.quotaFinished) {
          problem(`MyMemory: HTTP ${r.status} ${code || ""} ${(t || r.body || "").slice(0, 200)}`);
          return null;
        }
        out.push(decode(t));
        await sleep(300);
      }
      return [out.join("")];
    }
  }
};

function splitForFree(text) {
  const parts = String(text).match(/[^。！？!?；;\n]+[。！？!?；;\n]*|[。！？!?；;\n]+/g) || [text];
  const pieces = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + p.length > 450) { pieces.push(cur); cur = ""; }
    if (p.length > 450) { for (let i = 0; i < p.length; i += 450) pieces.push(p.slice(i, i + 450)); continue; }
    cur += p;
  }
  if (cur) pieces.push(cur);
  // keep a space between translated sentences
  return pieces.map((s, i) => (i < pieces.length - 1 && !/\n$/.test(s) ? s + " " : s));
}
const decode = (s) => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Only for tests: an OpenAI-style endpoint on this computer.
if (env.TRANSLATE_ENDPOINT) TRANSLATORS.claude = () => llm("Test", ["test"],
  (model, texts) => [env.TRANSLATE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: numbered(texts) }] }) }],
  (j) => { try { return j.choices[0].message.content; } catch { return ""; } }, 0);

// ---------- main ----------
async function main() {
  const tr = ["claude", "gemini", "deepl", "mymemory"].map((k) => TRANSLATORS[k]()).find(Boolean);
  status.translator = tr ? tr.name : "none";
  const cache = await readCache(CACHE);
  const needed = await collect();
  // forget translations nobody uses any more, so the file stays small
  for (const h of Object.keys(cache)) if (!needed.has(h)) delete cache[h];
  // new paragraphs, plus ones a weaker translator did that nobody has corrected by hand
  const RANK = { "MyMemory (free, no key)": 1, DeepL: 2 };
  const weaker = (c) => tr && c.by && (RANK[c.by] || 3) < tr.rank && c.en === c.auto;
  const todo = [...needed.entries()].filter(([h]) => !cache[h] || weaker(cache[h]));
  console.log(`${needed.size} Chinese paragraphs, ${todo.length} need English. Translator: ${status.translator}.`);

  let requests = 0;
  if (todo.length && tr) {
    const batches = [];
    let cur = [], size = 0;
    for (const item of todo) {
      if (cur.length && (size + item[1].length > tr.chunkChars || cur.length >= tr.chunkItems)) { batches.push(cur); cur = []; size = 0; }
      cur.push(item); size += item[1].length;
    }
    if (cur.length) batches.push(cur);
    for (const batch of batches) {
      if (requests >= MAX_REQUESTS) { console.log("Enough for this run; the rest will be translated next time."); break; }
      requests++;
      const out = await tr.run(batch.map((b) => b[1]));
      if (!out) { console.warn("Translation unavailable right now; showing the Chinese until next time."); break; }
      batch.forEach(([h, zh], i) => { cache[h] = { zh, en: out[i], auto: out[i], by: tr.name }; });
      status.translated += batch.length;
      await writeCache(CACHE, cache);
      await sleep(tr.pause);
    }
  }
  await writeCache(CACHE, cache);
  status.paragraphs = needed.size; status.requests = requests;
  status.waiting = [...needed.keys()].filter((h) => !cache[h]).length;
  await fs.writeFile(STATUS, JSON.stringify(status, null, 1) + "\n");
  if (env.GITHUB_ACTIONS) {
    // shows up as a note on the publish run
    const clean = (s) => String(s).replace(/[\r\n%]/g, " ").slice(0, 900);
    console.log(`::notice title=Translation::${status.translator}: ${status.paragraphs} Chinese paragraphs, ${status.translated} translated now, ${status.waiting} waiting, ${requests} request(s)`);
    for (const p of status.problems.slice(0, 5)) console.log(`::warning title=Translation problem::${clean(p)}`);
  }
  console.log(`Done. ${requests} request(s).`);
}

main().catch((e) => {
  console.error(e);
  if (env.GITHUB_ACTIONS) console.log(`::warning title=Translation stopped::${String(e && e.stack || e).replace(/[\r\n%]/g, " ").slice(0, 900)}`);
  process.exit(0); // never block publishing
});
