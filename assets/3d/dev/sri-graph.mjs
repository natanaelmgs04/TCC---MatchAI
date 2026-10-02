// Walks the static ESM import graph of each entry URL, resolving relative
// specifiers, and prints a sha384 SRI hash for every file fetched. Bare
// specifiers (e.g. 'three') are left to the import map and not followed.
import { createHash } from 'node:crypto';

const entries = process.argv.slice(2);
const seen = new Map();
const IMPORT_RE = /(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

async function walk(url) {
  if (seen.has(url)) return;
  seen.set(url, null);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) { seen.set(url, `HTTP ${res.status}`); return; }
  const finalUrl = res.url;
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = 'sha384-' + createHash('sha384').update(buf).digest('base64');
  seen.set(url, { hash, finalUrl, bytes: buf.length });
  const text = buf.toString('utf8');
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    if (!spec || !(spec.startsWith('./') || spec.startsWith('../'))) continue;
    await walk(new URL(spec, finalUrl).href);
  }
}

for (const e of entries) await walk(e);
for (const [url, info] of seen) {
  if (typeof info === 'string') console.log(`FAIL ${url} ${info}`);
  else console.log(`${url}\t${info.hash}\t${info.bytes}B${info.finalUrl !== url ? `\tREDIRECT->${info.finalUrl}` : ''}`);
}
