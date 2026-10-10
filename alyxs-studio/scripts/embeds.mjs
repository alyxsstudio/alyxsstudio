// Alyx's Studio — finds the title and cover of every pasted link (Watch, Listen, Daily reposts).
//
//   node scripts/embeds.mjs <site folder>
//
// Runs before each publish. Each link is looked up once and remembered in data/embeds.json;
// covers are saved into assets/uploads/covers/ so they keep working even if the platform
// changes or removes its picture. Short links (vm.tiktok.com, b23.tv, on.soundcloud.com …)
// are followed to the full address. Never stops the site from publishing.
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const SITE = path.resolve(process.argv[2] || ".");
const CACHE = path.join(SITE, "data", "embeds.json");
const COVERS = path.join(SITE, "assets", "uploads", "covers");
const MAX_LOOKUPS = 40;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const notes = [];
const sha = (s) => createHash("sha1").update(String(s)).digest("hex").slice(0, 12);

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
  try {
    return await fetch(url, {
      redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en,zh;q=0.8", Accept: opts.accept || "text/html,application/json;q=0.9,*/*;q=0.8", ...(opts.headers || {}) }
    });
  } finally { clearTimeout(timer); }
}
async function json(url, opts) {
  const r = await get(url, { ...opts, accept: "application/json" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// ---------- which links are used ----------
async function readDir(dir) {
  const d = path.join(SITE, "content", dir);
  let files = [];
  try { files = (await fs.readdir(d)).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) { try { out.push(JSON.parse(await fs.readFile(path.join(d, f), "utf8"))); } catch {} }
  return out;
}
async function usedLinks() {
  const set = new Set();
  for (const m of await readDir("media")) if (m.url) set.add(String(m.url).trim());
  for (const p of await readDir("daily")) if (p.link && p.link.url) set.add(String(p.link.url).trim());
  return [...set].filter((u) => /^https?:\/\//.test(u));
}

// ---------- reading pages ----------
const decode = (s) => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function metaTags(html) {
  const out = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (key && val != null && !(key.toLowerCase() in out)) out[key.toLowerCase()] = decode(val);
  }
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) out.__title = decode(t[1]).trim();
  return out;
}
async function fromPage(url) {
  const r = await get(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const html = (await r.text()).slice(0, 600000);
  const m = metaTags(html);
  const video = m["og:video:secure_url"] || m["og:video:url"] || m["og:video"] || "";
  const audio = m["og:audio:secure_url"] || m["og:audio:url"] || m["og:audio"] || "";
  return {
    url: r.url !== url ? r.url : undefined,
    title: m["og:title"] || m["twitter:title"] || m.__title || "",
    author: m["og:site_name"] || "",
    cover: m["og:image:secure_url"] || m["og:image"] || m["twitter:image"] || "",
    embed: /EmbeddedPlayer|\/embed\//.test(video) ? video : "",
    video: /\.(mp4|m4v|mov|webm)(\?|$)/i.test(video) ? video : "",
    audio: /^https?:/.test(audio) ? audio : ""
  };
}

// ---------- each platform ----------
const SHORT = /^(vm|vt)\.tiktok\.com$|^(www\.)?tiktok\.com$|^b23\.tv$|^on\.soundcloud\.com$|^xhslink\.com$|^spotify\.link$|^youtu\.be$|^v\.douyin\.com$/;
async function resolve(url) {
  const u = new URL(url);
  if (!SHORT.test(u.hostname) || (/tiktok\.com$/.test(u.hostname) && /\/video\//.test(u.pathname)) || u.hostname === "youtu.be") return url;
  const r = await get(url);
  return r.url || url;
}
async function lookup(original) {
  const url = await resolve(original);
  const u = new URL(url), h = u.hostname.replace(/^(www|m)\./, "");
  const enc = encodeURIComponent(url);
  let m = {};
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(h)) {
    const j = await json("https://www.youtube.com/oembed?format=json&url=" + enc);
    m = { title: j.title, author: j.author_name, cover: j.thumbnail_url };
  } else if (/vimeo\.com$/.test(h)) {
    const j = await json("https://vimeo.com/api/oembed.json?url=" + enc);
    m = { title: j.title, author: j.author_name, cover: j.thumbnail_url };
  } else if (/tiktok\.com$/.test(h)) {
    const j = await json("https://www.tiktok.com/oembed?url=" + enc);
    m = { title: j.title, author: j.author_name, cover: j.thumbnail_url, id: j.embed_product_id };
  } else if (/spotify\.com$/.test(h)) {
    const j = await json("https://open.spotify.com/oembed?url=" + enc);
    m = { title: j.title, cover: j.thumbnail_url };
  } else if (/soundcloud\.com$/.test(h)) {
    const j = await json("https://soundcloud.com/oembed?format=json&url=" + enc);
    m = { title: j.title, author: j.author_name, cover: j.thumbnail_url };
  } else if (/bilibili\.com$/.test(h) && /\/video\/(BV\w+)/i.test(u.pathname)) {
    const bv = u.pathname.match(/\/video\/(BV\w+)/i)[1];
    const j = await json("https://api.bilibili.com/x/web-interface/view?bvid=" + bv, { headers: { Referer: "https://www.bilibili.com/" } });
    if (j.code !== 0) throw new Error("Bilibili " + j.code + " " + (j.message || ""));
    m = { title: j.data.title, author: j.data.owner && j.data.owner.name, cover: j.data.pic };
  } else {
    m = await fromPage(url);
  }
  if (url !== original) m.url = m.url || url;
  if (m.cover && m.cover.startsWith("//")) m.cover = "https:" + m.cover;
  if (m.cover && m.cover.startsWith("http:")) m.cover = "https:" + m.cover.slice(5);
  return m;
}

// covers are kept in the site, so they never expire
async function saveCover(link, remote) {
  if (!remote || !/^https?:/.test(remote)) return remote || "";
  try {
    const r = await get(remote, { accept: "image/*", headers: { Referer: new URL(link).origin + "/" } });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\//.test(type)) throw new Error("HTTP " + r.status + " " + type);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200 || buf.length > 8 * 1048576) throw new Error("odd size " + buf.length);
    const ext = /png/.test(type) ? "png" : /webp/.test(type) ? "webp" : /gif/.test(type) ? "gif" : "jpg";
    await fs.mkdir(COVERS, { recursive: true });
    const name = sha(link) + "." + ext;
    await fs.writeFile(path.join(COVERS, name), buf);
    return "/assets/uploads/covers/" + name;
  } catch (e) {
    notes.push("cover for " + link + ": " + e.message);
    return remote;
  }
}

async function main() {
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(CACHE, "utf8")).items || {}; } catch {}
  const links = await usedLinks();
  // forget links that are no longer used, and their saved covers
  for (const k of Object.keys(cache)) {
    if (links.includes(k)) continue;
    const c = cache[k].cover || "";
    if (c.startsWith("/assets/uploads/covers/")) await fs.rm(path.join(SITE, c), { force: true }).catch(() => {});
    delete cache[k];
  }
  const todo = links.filter((l) => !cache[l] || (!cache[l].ok && (cache[l].tries || 0) < 4));
  let done = 0, failed = 0;
  for (const link of todo.slice(0, MAX_LOOKUPS)) {
    const before = cache[link] || {};
    try {
      const m = await lookup(link);
      const clean = {};
      for (const [k, v] of Object.entries(m)) if (v) clean[k] = typeof v === "string" ? v.trim().slice(0, 600) : v;
      clean.cover = await saveCover(link, clean.cover);
      if (!clean.cover) delete clean.cover;
      cache[link] = { ok: true, ...clean, checked: new Date().toISOString().slice(0, 10) };
      done++;
    } catch (e) {
      cache[link] = { ok: false, tries: (before.tries || 0) + 1, error: String(e.message || e).slice(0, 200), checked: new Date().toISOString().slice(0, 10) };
      notes.push(link + ": " + cache[link].error);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  const sorted = {};
  for (const k of Object.keys(cache).sort()) sorted[k] = cache[k];
  await fs.writeFile(CACHE, JSON.stringify({ about: "Titles and covers of pasted links, looked up when the site is published. You can change a title here; it is kept.", items: sorted }, null, 1) + "\n");
  const msg = `${links.length} links, ${done} looked up now, ${failed} not reachable`;
  console.log(msg);
  if (process.env.GITHUB_ACTIONS) {
    const clean = (s) => String(s).replace(/[\r\n%]/g, " ").slice(0, 900);
    console.log(`::notice title=Links::${msg}`);
    for (const n of notes.slice(0, 6)) console.log(`::warning title=Link problem::${clean(n)}`);
  } else notes.forEach((n) => console.warn("  " + n));
}

main().catch((e) => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Links stopped::${String(e && e.stack || e).replace(/[\r\n%]/g, " ").slice(0, 900)}`);
  process.exit(0);
});
