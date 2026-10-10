// Alyx's Studio — build step.
// Copies the site to an output folder and compiles the one-file-per-entry content
// (daily posts, ongoing projects, visual series, design sketches) into data/gen/*.json.
//
//   node scripts/build.mjs <site folder> <output folder>
//
// No dependencies; runs on GitHub Actions and on any computer with Node 18+.
import { promises as fs } from "node:fs";
import path from "node:path";

const SITE = path.resolve(process.argv[2] || ".");
const OUT = path.resolve(process.argv[3] || "_site");
const SKIP = new Set(["scripts", "content", "netlify.toml", "README.md", "node_modules", ".DS_Store"]);

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (src === SITE && SKIP.has(entry.name)) continue;
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
  const write = (name, data) => fs.writeFile(path.join(gen, name), JSON.stringify(data));

  // Daily
  const daily = (await readFolder("daily"))
    .filter((p) => p.date && !p.hidden)
    .map((p) => ({ ...p, day: dayOf(p.date), images: asList(p.images) }))
    .sort(byDateDesc);
  await write("daily.json", { posts: daily });

  // Ongoing: projects + entries
  const projects = (await readFolder("projects")).filter((p) => !p.hidden);
  const entries = (await readFolder("entries")).map((e) => ({ ...e, images: asList(e.images) }));
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
  const visual = (await readFolder("visual")).filter((s) => !s.hidden)
    .map((s) => ({ ...s, images: asList(s.images) })).sort(byDateDesc);
  await write("visual.json", { series: visual });

  // Design sketches
  const design = (await readFolder("design")).filter((s) => !s.hidden)
    .map((s) => ({ ...s, images: asList(s.images) })).sort(byDateDesc);
  await write("design.json", { items: design });

  await write("build.json", { built: new Date().toISOString() });
  console.log(`Built ${OUT}: ${daily.length} posts, ${projects.length} projects, ${entries.length} entries, ${visual.length} series, ${design.length} sketches.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
