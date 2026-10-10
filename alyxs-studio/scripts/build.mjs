// Alyx's Studio — build step.
// Copies the site to an output folder and compiles the one-file-per-entry content
// (daily posts, ongoing projects, visual series, design sketches) into data/gen/*.json.
//
//   node scripts/build.mjs <site folder> <output folder>
//
// No dependencies; runs on GitHub Actions and on any computer with Node 18+.
import { promises as fs } from "node:fs";
import path from "node:path";
import { readCache, applyTranslations } from "./i18n.mjs";

const SITE = path.resolve(process.argv[2] || ".");
const OUT = path.resolve(process.argv[3] || "_site");
const SKIP = new Set(["scripts", "content", "netlify.toml", "README.md", "node_modules", ".DS_Store"]);
const SKIP_DATA = new Set(["translations.json", "embeds.json"]);

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (src === SITE && SKIP.has(entry.name)) continue;
    if (src === path.join(SITE, "data") && SKIP_DATA.has(entry.name)) continue;
    if (entry.name === ".DS_Store") continue;
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function readFolder(name) {
  const dir = path.join(SITE, "content", name);
  let files = [];
  try { files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")); } catch { return []; }
  const items = [];
  for (const f of files) {
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
      items.push({ id: f.replace(/\.json$/, ""), ...data });
    } catch (e) {
      console.warn(`Skipped ${name}/${f}: ${e.message}`);
    }
  }
  return items;
}

// Dates are written by the editor as local time, e.g. 2026-10-10T14:00.
// Keep the author's own calendar day; never shift it through UTC.
const dayOf = (d) => String(d || "").slice(0, 10);
const byDateDesc = (a, b) => String(b.date || "").localeCompare(String(a.date || ""));
const byDateAsc = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? Infinity : Number(v));

function sortEntries(list, how) {
  const l = list.slice();
  if (how === "date-desc") l.sort(byDateDesc);
  else if (how === "title") l.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base", numeric: true }) || byDateAsc(a, b));
  else if (how === "number") l.sort((a, b) => num(a.number) - num(b.number) || byDateAsc(a, b));
  else l.sort(byDateAsc); // "date-asc" (default): reading order
  return l;
}

const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [v] : []);

async function main() {
  await fs.rm(OUT, { recursive: true, force: true });
  await copyDir(SITE, OUT);
  const gen = path.join(OUT, "data", "gen");
  await fs.mkdir(gen, { recursive: true });
  // English versions of Chinese text (made by translate.mjs); the original stays in <field>_zh
  const cache = await readCache(path.join(SITE, "data", "translations.json"));
  let untranslated = 0;
  const tr = (data) => { untranslated += applyTranslations(data, cache); return data; };
  const write = (name, data) => fs.writeFile(path.join(gen, name), JSON.stringify(data));
  // translate as content is read, so sorting by title uses the English the site shows
  const read = async (name) => tr(await readFolder(name));
  for (const f of ["books", "store", "traces", "sections", "settings", "follow"]) {
    const file = path.join(OUT, "data", f + ".json");
    try { await fs.writeFile(file, JSON.stringify(tr(JSON.parse(await fs.readFile(file, "utf8"))))); } catch {}
  }

  // titles and covers of pasted links, fetched by scripts/embeds.mjs
  let embeds = {};
  try { embeds = JSON.parse(await fs.readFile(path.join(SITE, "data", "embeds.json"), "utf8")).items || {}; } catch {}
  const metaFor = (url) => {
    const m = url && embeds[String(url).trim()];
    if (!m || !m.ok) return undefined;
    const { ok, checked, tries, ...rest } = m;
    return rest;
  };

  // Daily
  const daily = (await read("daily"))
    .filter((p) => p.date && !p.hidden)
    .map((p) => {
      const out = { ...p, day: dayOf(p.date), images: asList(p.images) };
      if (p.link && p.link.url && metaFor(p.link.url)) out.link = { ...p.link, meta: metaFor(p.link.url) };
      return out;
    })
    .sort(byDateDesc);
  await write("daily.json", { posts: daily });

  // Ongoing: projects + entries
  const projects = (await read("projects")).filter((p) => !p.hidden);
  const entries = (await read("entries")).map((e) => ({ ...e, images: asList(e.images) }));
  const summary = [];
  for (const p of projects) {
    const mine = sortEntries(entries.filter((e) => e.project === p.id), p.sort || "date-asc");
    const latest = mine.reduce((m, e) => (String(e.date || "") > m ? String(e.date) : m), String(p.date || ""));
    const cover = p.cover || (mine.find((e) => e.images.length) || { images: [] }).images[0] || "";
    await write(`ongoing-${p.id}.json`, { project: { ...p, cover }, entries: mine });
    summary.push({ ...p, cover, count: mine.length, updated: latest });
  }
  summary.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  // latest updates across all projects, for the home page
  const recent = entries.slice().sort(byDateDesc).slice(0, 24)
    .map((e) => ({ project: e.project, id: e.id, date: e.date, title: e.title, number: e.number, image: e.images[0] || "" }));
  await write("ongoing.json", { projects: summary, recent });

  // Visual series
  const visual = (await read("visual")).filter((s) => !s.hidden)
    .map((s) => ({ ...s, images: asList(s.images) })).sort(byDateDesc);
  await write("visual.json", { series: visual });

  // Design sketches
  const design = (await read("design")).filter((s) => !s.hidden)
    .map((s) => ({ ...s, images: asList(s.images) })).sort(byDateDesc);
  await write("design.json", { items: design });

  // Watch & Listen
  const media = (await read("media")).filter((m) => !m.hidden && (m.url || m.file))
    .map((m) => ({ ...m, meta: metaFor(m.url) })).sort(byDateDesc);
  await write("media.json", { items: media });

  await write("build.json", { built: new Date().toISOString() });
  if (untranslated) console.log(`${untranslated} paragraph(s) still waiting for English; they show in Chinese for now.`);
  console.log(`Built ${OUT}: ${daily.length} posts, ${projects.length} projects, ${entries.length} entries, ${visual.length} series, ${design.length} sketches, ${media.length} videos and songs.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
