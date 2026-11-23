export function extractBalanced(str, start) {
  if (start < 0 || start >= str.length) return null;
  const open = str[start];
  if (open !== '[' && open !== '{') return null;
  const close = open === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      if (--depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

/** Concatena todos os chunks RSC do Next.js em uma string só. */
export function readRsc(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[\s*1\s*,\s*("(?:[^"\\]|\\.)*")/g;
  for (const m of html.matchAll(re)) {
    try { out.push(JSON.parse(m[1])); } catch {}
  }
  return out.join('');
}

/** Lê um valor JSON a partir de `"chave":` e devolve o objeto/array parseado. */
export function readJsonKey(rsc, key) {
  const marker = `"${key}":`;
  const idx = rsc.indexOf(marker);
  if (idx < 0) return null;
  const start = rsc.indexOf('[', idx) >= 0 && rsc.indexOf('[', idx) < rsc.indexOf('{', idx) + 1
    ? rsc.indexOf('[', idx)
    : rsc.indexOf('{', idx);
  const raw = extractBalanced(rsc, start);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}