#!/usr/bin/env node

/**
 * Scrape the public TikTok Shop Partner documentation catalog.
 * The output is metadata only; credentials and API response data never leave
 * the local workspace. Runtime success is still determined by api_data.
 */
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.TIKTOK_DOCS_BASE_URL || "https://partner.tiktokshop.com";
const WORKSPACE_ID = process.env.TIKTOK_DOCS_WORKSPACE_ID || "3";
const AID = process.env.TIKTOK_DOCS_AID || "359713";
const LOCALE = process.env.TIKTOK_DOCS_LOCALE || "en-US";
const query = `?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&aid=${encodeURIComponent(AID)}&locale=${encodeURIComponent(LOCALE)}`;

async function request(path, init) {
  const response = await fetch(`${BASE}${path}${path.includes("?") ? "&" : ""}${query}`, {
    ...init,
    headers: { info: "true", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`${path}: ${payload.message || payload.code}`);
  return payload.data;
}

function parsePath(content) {
  return content.match(/^# Path:\s*(.+)$/m)?.[1]?.trim() || null;
}

function parseMethod(content) {
  return content.match(/^# Method:\s*\[?([A-Z]+)\]?/m)?.[1] || null;
}

function parseDescription(content) {
  const match = content.match(/^# Function Description\s*\n([\s\S]*?)(?=\n(?:Target partner:|Target seller:|---))/m);
  return match?.[1]?.trim().replaceAll(/\n+/g, " ") || null;
}

function parseResponseFields(content) {
  const start = content.indexOf("# Response Parameters");
  if (start < 0) return [];
  const bodyStart = content.indexOf("\n", start) + 1;
  const nextHeading = [content.indexOf("\n# Response Sample", bodyStart), content.indexOf("\n# Error Code", bodyStart)]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? content.length;
  const section = content.slice(bodyStart, nextHeading);
  return section.split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3 && !/^\s*Properties(?:\s|<|$)/i.test(cells[0]) && !/^[-\s]+$/.test(cells[0]))
    .map((cells) => ({ field: cells[0], type: cells[1], sample: cells[2] }));
}

function parseOutputSample(content) {
  const match = content.match(/# Response Sample[\s\S]*?```(?:json)?\s*([\s\S]*?)```/m);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return match[1].trim(); }
}

const tree = await request("/api/v1/document/tree", { method: "GET" });
const leaves = (tree.document_tree || []).filter((doc) => doc.is_api_doc && !doc.is_dir && doc.document_path);
const details = [];
for (let index = 0; index < leaves.length; index += 8) {
  const batch = leaves.slice(index, index + 8);
  const results = await Promise.all(batch.map(async (doc) => {
    try {
      const result = await request(`/api/v1/document/detail?document_id=${encodeURIComponent(doc.document_id)}&workspace_id=${encodeURIComponent(WORKSPACE_ID)}`, { method: "GET" });
      return result;
    } catch (error) {
      console.warn(`Skipped ${doc.document_path}: ${error.message}`);
      return null;
    }
  }));
  details.push(...results.filter(Boolean));
  process.stdout.write(`\rFetched ${Math.min(index + batch.length, leaves.length)}/${leaves.length}`);
}
process.stdout.write("\n");

const detailById = new Map(details.map((detail) => [detail.document_id, detail]));
const output = leaves.map((doc) => {
  const detail = detailById.get(doc.document_id);
  const content = detail?.content || "";
  return {
    document_id: doc.document_id,
    title: detail?.title || doc.name,
    document_path: doc.document_path,
    url: `${BASE}/docv2/page/${doc.document_path}`,
    method: parseMethod(content),
    api_path: parsePath(content),
    description_en: parseDescription(content),
    response_fields: parseResponseFields(content),
    response_sample: parseOutputSample(content),
    updated_at: detail?.update_time || doc.update_time,
  };
}).filter((doc) => doc.api_path || doc.title);

await mkdir("data", { recursive: true });
await writeFile("data/tiktok-api-catalog.json", `${JSON.stringify({ source: BASE, scraped_at: new Date().toISOString(), total: output.length, apis: output }, null, 2)}\n`);
console.log(`Scraped ${output.length} TikTok API docs into data/tiktok-api-catalog.json`);
