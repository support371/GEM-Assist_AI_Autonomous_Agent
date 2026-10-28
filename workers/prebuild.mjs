#!/usr/bin/env node
/**
 * Prebuild · strips JSONC comments and emits agents/*.json (plain JSON)
 * so the Worker bundler can import them with `assert { type: 'json' }`.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'agents');
const outDir = srcDir; // emit alongside the .jsonc files

function stripJsonc(txt) {
  // Strip // line comments and /* block */ comments outside of strings
  let out = ''; let inStr = false; let strCh = '';
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i], n = txt[i+1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n || ''; i++; continue; }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; continue; }
    if (c === '/' && n === '/') { while (i < txt.length && txt[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < txt.length && !(txt[i] === '*' && txt[i+1] === '/')) i++; i++; continue; }
    out += c;
  }
  // Strip trailing commas
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const files = (await readdir(srcDir)).filter(f => f.endsWith('.jsonc'));
for (const f of files) {
  const txt = await readFile(join(srcDir, f), 'utf8');
  const stripped = stripJsonc(txt);
  const parsed = JSON.parse(stripped);
  const outFile = join(outDir, f.replace(/\.jsonc$/, '.json'));
  await writeFile(outFile, JSON.stringify(parsed, null, 2));
  console.log('✓', outFile);
}
