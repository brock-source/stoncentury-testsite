// Builds backend/data/knowledge-index.json from the markdown transcripts under
// scripts/source/<show>/<video-id>.md. Re-run this whenever fresh transcripts are
// pulled from the "StoneCentury Knowledge Base Brain" Shared Drive
// (knowledge_base/<show>/*.md) — only files with status: complete in their
// frontmatter are included.
//
// Usage: node build-knowledge-index.js

const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "source");
const OUT_FILE = path.join(__dirname, "..", "data", "knowledge-index.json");

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const [, fmBlock, body] = match;
  const meta = {};
  fmBlock.split(/\r?\n/).forEach((line) => {
    const kv = /^([\w_]+):\s*"?(.*?)"?\s*$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  });
  return { meta, body };
}

function extractTranscript(body) {
  const idx = body.indexOf("## Transcript");
  if (idx === -1) return body.trim();
  return body.slice(idx + "## Transcript".length).trim();
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

if (!fs.existsSync(SOURCE_DIR)) {
  console.error("No source/ directory found at", SOURCE_DIR);
  process.exit(1);
}

const files = walk(SOURCE_DIR);
const entries = [];
let skippedPending = 0;

for (const file of files) {
  const raw = fs.readFileSync(file, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  if (meta.status !== "complete") {
    skippedPending++;
    continue;
  }
  const transcript = extractTranscript(body);
  const show = path.basename(path.dirname(file));
  entries.push({
    id: meta.video_id || path.basename(file, ".md"),
    show: meta.person || show,
    title: meta.title || "",
    url: meta.url || "",
    published: meta.published || null,
    text: transcript,
  });
}

entries.sort((a, b) => (a.published || "").localeCompare(b.published || ""));

const index = {
  generated_at: new Date().toISOString(),
  source: "StoneCentury Knowledge Base Brain / knowledge_base",
  episode_count: entries.length,
  episodes: entries,
};

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(index, null, 2), "utf8");

console.log(`Wrote ${entries.length} complete episodes to ${OUT_FILE}`);
console.log(`Skipped ${skippedPending} pending/incomplete transcripts`);
