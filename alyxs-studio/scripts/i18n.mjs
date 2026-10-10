// Shared by translate.mjs and build.mjs: which fields get an English version,
// how text is split into paragraphs, and how the translation cache is keyed.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";

// Field names whose Chinese text is shown in English on the website.
export const KEYS = new Set(["text", "title", "note", "quote", "intro", "short", "tagline", "where", "caption", "body", "tags"]);

export const hasCJK = (s) => /[぀-ヿ㐀-鿿가-힯]/.test(String(s || ""));
export const hash = (s) => createHash("sha1").update(String(s).trim()).digest("hex").slice(0, 16);

// Paragraph-by-paragraph, so a Chinese and an English version line up side by side.
export const paragraphs = (text) => String(text || "").split(/\n{2,}/);

// Calls fn(holder, key, value, path) for every string (or list of strings) that may need English.
export function walk(obj, fn, path = "") {
  if (Array.isArray(obj)) { obj.forEach((v, i) => walk(v, fn, path)); return; }
  if (!obj || typeof obj !== "object") return;
  for (const k of Object.keys(obj)) {
    if (k.endsWith("_zh") || k.endsWith("_en")) continue;
    const v = obj[k], p = path ? path + "." + k : k;
    if (KEYS.has(k)) {
      if (typeof v === "string" && hasCJK(v)) fn(obj, k, v, p);
      else if (Array.isArray(v) && v.some((x) => typeof x === "string" && hasCJK(x))) fn(obj, k, v, p);
      else walk(v, fn, p);
    } else {
      walk(v, fn, p);
    }
  }
}

export async function readCache(file) {
  try { const j = JSON.parse(await fs.readFile(file, "utf8")); return j.items || {}; } catch { return {}; }
}
export async function writeCache(file, items) {
  const sorted = {};
  for (const k of Object.keys(items).sort()) sorted[k] = items[k];
  await fs.writeFile(file, JSON.stringify({ about: "Automatic English versions of Chinese text, made when the site is published. You can correct any \"en\" here; it will be kept.", items: sorted }, null, 1) + "\n");
}

// Apply cached translations to an object in place: English goes into the field,
// the original Chinese is kept in <field>_zh. A hand-written <field>_en always wins.
// approvedOnly: show only English you wrote or approved (<field>_en); otherwise the Chinese stays.
export function applyTranslations(obj, cache, approvedOnly) {
  let missing = 0;
  walk(obj, (holder, key, value) => {
    const manual = holder[key + "_en"];
    if (Array.isArray(value)) {
      holder[key + "_zh"] = value.slice();
      if (Array.isArray(manual) && manual.length === value.length) { holder[key] = value.map((s, i) => manual[i] || s); return; }
      if (approvedOnly) return;
      holder[key] = value.map((s) => { if (!hasCJK(s)) return s; const c = cache[hash(s)]; if (!c) missing++; return c ? c.en : s; });
      return;
    }
    holder[key + "_zh"] = value;
    if (manual && typeof manual === "string") {
      // paragraph by paragraph, so a paragraph not translated yet keeps its Chinese
      const zh = paragraphs(value), en = paragraphs(manual);
      holder[key] = en.length === zh.length ? zh.map((p, i) => (en[i].trim() ? en[i] : p)).join("\n\n") : manual;
      return;
    }
    if (approvedOnly) return;
    holder[key] = paragraphs(value).map((p) => {
      if (!hasCJK(p)) return p;
      const c = cache[hash(p)];
      if (!c) missing++;
      return c ? c.en : p;
    }).join("\n\n");
  });
  return missing;
}

// English conventions for a translated paragraph: titles in 《》 become *italics*, Chinese punctuation
// becomes English punctuation. Also used by the translation desk on the page (assets/js/editor.js).
export function englishTypography(text) {
  return String(text || "")
    .replace(/[《〈]\s*([^》〉]+?)\s*[》〉]/g, "*$1*")
    .replace(/……|\.{6}/g, "…").replace(/——/g, "—")
    .replace(/，/g, ", ").replace(/。/g, ". ").replace(/；/g, "; ").replace(/：/g, ": ")
    .replace(/！/g, "! ").replace(/？/g, "? ").replace(/、/g, ", ")
    .replace(/（/g, " (").replace(/）/g, ") ")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[ \t]+([,.;:!?)])/g, "$1").replace(/\( +/g, "(")
    .replace(/([.!?,;:…]) (["'])(?=\s|$)/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\n +/g, "\n").trim();
}
