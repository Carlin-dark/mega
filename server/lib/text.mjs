const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decodeEntities = (s = '') =>
  String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });

export const stripTags = (s = '') => String(s || '').replace(/<[^>]*>/g, ' ');
export const cleanText = (s = '') => decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();

export const titleFromSlug = (slug = '') =>
  decodeURIComponent(String(slug || '')).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function absUrl(u, base) {
  if (!u) return null;
  try { return new URL(decodeEntities(String(u).trim()), base).toString(); } catch { return null; }
}

export const uniqueBy = (arr, key) => {
  const seen = new Set();
  return (arr || []).filter((x) => {
    const k = key(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));