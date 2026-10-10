// Alyx's Studio — makes English versions of Chinese text before each publish.
//
//   node scripts/translate.mjs <site folder>
//
// Uses GitHub Models with the workflow's own GITHUB_TOKEN (free, no key to set up).
// Only new or changed paragraphs are translated; results are kept in data/translations.json,
// so each paragraph is translated once. Corrections made by hand in that file are kept.
import { promises as fs } from "node:fs";
import path from "node:path";
import { walk, hasCJK, hash, paragraphs, readCache, writeCache } from "./i18n.mjs";

const SITE = path.resolve(process.argv[2] || ".");
const CACHE = path.join(SITE, "data", "translations.json");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_MODELS_TOKEN;
const ENDPOINT = process.env.TRANSLATE_ENDPOINT || "https://models.github.ai/inference/chat/completions";
const MODELS = ["openai/gpt-4.1", "openai/gpt-4.1-mini", "openai/gpt-4o-mini"];
const MAX_REQUESTS = Number(process.env.MAX_TRANSLATE_REQUESTS || 40); // stay well inside the free daily limit
const CHUNK_CHARS = 2400;
const STATUS = path.join(SITE, "data", "translate-status.json");   // published, so problems are easy to see
const status = { checked: new Date().toISOString(), paragraphs: 0, waiting: 0, translated: 0, requests: 0, problems: [] };

const SYSTEM = [
  "You translate a writer's Chinese into natural, literary English for her personal website.",
  "Keep her voice, rhythm and line breaks. Keep Markdown (**bold**, *italics*, headings, lists, links) exactly where it is.",
  "Keep names, brand names, URLs, emoji and any English words as they are. If a string is partly English, translate only the Chinese.",
  "Short strings are titles, captions or single dictionary words: translate them as titles or words, not sentences.",
  "Answer with a JSON array of strings only: the same number of items, in the same order as the input."
].join(" ");

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(batch) {
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
        body: JSON.stringify({
          model, temperature: 0.3,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(batch) }]
        })
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
      if (res.ok) {
        const j = await res.json();
        const raw = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
        const m = raw.match(/\[[\s\S]*\]/);
        try {
          const arr = JSON.parse(m ? m[0] : raw);
          if (Array.isArray(arr) && arr.length === batch.length) return arr.map(String);
        } catch {}
        console.warn(`  ${model}: answer was not a matching JSON array, retrying`);
        status.problems.push(model + ": answer was not a matching list");
        continue;
      }
      const body = await res.text();
      console.warn(`  ${model}: HTTP ${res.status} ${body.slice(0, 160)}`);
      status.problems.push(model + ": HTTP " + res.status + " " + body.slice(0, 200));
      if (res.status === 429) { await sleep(8000); break; } // rate limited: try the next model
      if (res.status === 401 || res.status === 403) return null;
      await sleep(3000);
    }
  }
  return null;
}

async function main() {
  const cache = await readCache(CACHE);
  const needed = await collect();
  const todo = [...needed.entries()].filter(([h]) => !cache[h]);
  // forget translations nobody uses any more, so the file stays small
  for (const h of Object.keys(cache)) if (!needed.has(h)) delete cache[h];

  console.log(`${needed.size} Chinese paragraphs, ${todo.length} need English.`);
  if (todo.length && !TOKEN) console.warn("No GITHUB_TOKEN: skipping translation.");
  let requests = 0;
  if (todo.length && TOKEN) {
    // group into batches that stay well inside the model's limits
    const batches = [];
    let cur = [], size = 0;
    for (const item of todo) {
      if (cur.length && (size + item[1].length > CHUNK_CHARS || cur.length >= 40)) { batches.push(cur); cur = []; size = 0; }
      cur.push(item); size += item[1].length;
    }
    if (cur.length) batches.push(cur);
    for (const batch of batches) {
      if (requests >= MAX_REQUESTS) { console.log("Request limit for this run reached; the rest will be translated next time."); break; }
      requests++;
      const out = await ask(batch.map((b) => b[1]));
      if (!out) { console.warn("Translation unavailable right now; showing the Chinese until next time."); break; }
      batch.forEach(([h, zh], i) => { cache[h] = { zh, en: out[i] }; });
      status.translated += batch.length;
      await writeCache(CACHE, cache);
      await sleep(process.env.TRANSLATE_ENDPOINT ? 0 : 4500); // free tier: keep under 15 requests a minute
    }
  }
  await writeCache(CACHE, cache);
  status.paragraphs = needed.size; status.requests = requests;
  status.waiting = [...needed.keys()].filter((h) => !cache[h]).length;
  if (!TOKEN && todo.length) status.problems.push("No GITHUB_TOKEN");
  await fs.writeFile(STATUS, JSON.stringify(status, null, 1) + "\n");
  if (process.env.GITHUB_ACTIONS) {
    // shows up as a note on the run, readable from the GitHub API
    const clean = (s) => String(s).replace(/[\r\n%]/g, " ").slice(0, 900);
    console.log(`::notice title=Translation::${status.paragraphs} Chinese paragraphs, ${status.translated} translated now, ${status.waiting} waiting, ${requests} request(s)`);
    for (const p of status.problems.slice(0, 5)) console.log(`::warning title=Translation problem::${clean(p)}`);
  }
  console.log(`Done. ${requests} request(s).`);
}

main().catch((e) => { console.error(e); process.exit(0); }); // never block publishing
