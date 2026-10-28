#!/usr/bin/env node
/**
 * ingest-knowledge · chunks text/markdown files, embeds via Worker /embed,
 * and inserts into Supabase knowledge_base for the rag_search skill.
 *
 * Usage:
 *   WORKER_URL=https://gem-bot.YOUR.workers.dev \
 *   ADMIN_SECRET=... \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   node scripts/ingest-knowledge.mjs path/to/doc.md [more files...]
 *
 * Options via env:
 *   SOURCE_NAME     logical source label stored on each chunk (default: filename)
 *   CHUNK_CHARS     chunk size (default 1800 chars ≈ ~450 tokens)
 *   OVERLAP_CHARS   chunk overlap (default 200)
 *   BATCH           chunks per /embed call (default 16, Workers AI accepts arrays)
 *   DRY_RUN=1       print what would be inserted, do nothing
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const must = (k) => { if (!process.env[k]) throw new Error(`Missing env ${k}`); return process.env[k]; };

const WORKER_URL = must('WORKER_URL').replace(/\/$/, '');
const ADMIN_SECRET = must('ADMIN_SECRET');
const SUPABASE_URL = must('SUPABASE_URL').replace(/\/$/, '');
const SUPABASE_SERVICE_KEY = must('SUPABASE_SERVICE_KEY');

const CHUNK_CHARS = Number(process.env.CHUNK_CHARS || 1800);
const OVERLAP_CHARS = Number(process.env.OVERLAP_CHARS || 200);
const BATCH = Number(process.env.BATCH || 16);
const DRY_RUN = process.env.DRY_RUN === '1';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node scripts/ingest-knowledge.mjs <file> [...]');
  process.exit(2);
}

function chunk(text) {
  const out = [];
  const clean = text.replace(/\r\n/g, '\n').trim();
  for (let i = 0; i < clean.length; i += CHUNK_CHARS - OVERLAP_CHARS) {
    const piece = clean.slice(i, i + CHUNK_CHARS).trim();
    if (piece.length > 50) out.push(piece);
    if (i + CHUNK_CHARS >= clean.length) break;
  }
  return out;
}

async function embed(texts) {
  const res = await fetch(`${WORKER_URL}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_SECRET}` },
    body: JSON.stringify({ text: texts }),
  });
  if (!res.ok) throw new Error(`/embed ${res.status}: ${await res.text()}`);
  const { data } = await res.json();
  return data.map(d => d.embedding);
}

async function insertChunks(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert ${res.status}: ${await res.text()}`);
}

for (const file of files) {
  const abs = path.resolve(file);
  await stat(abs);
  const source = process.env.SOURCE_NAME || path.basename(file);
  const text = await readFile(abs, 'utf8');
  const chunks = chunk(text);
  console.log(`[${source}] ${chunks.length} chunks`);
  if (DRY_RUN) continue;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vectors = await embed(batch);
    const rows = batch.map((c, j) => ({
      source,
      chunk: c,
      embedding: vectors[j],
      metadata: { file: path.basename(file), chunk_index: i + j, char_offset: (i + j) * (CHUNK_CHARS - OVERLAP_CHARS) },
    }));
    await insertChunks(rows);
    console.log(`  → inserted ${i + batch.length}/${chunks.length}`);
  }
}

console.log('done.');
