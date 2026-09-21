const FENCE = '---';

function parseValue(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '[]') return [];
  return v.replace(/^"(.*)"$/, '$1');
}

/** Parses the small YAML subset used by rule files: scalars and a list of quoted strings. */
export function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== FENCE) throw new Error('frontmatter: document must start with ---');
  const end = lines.indexOf(FENCE, 1);
  if (end === -1) throw new Error('frontmatter: unterminated block');
  const meta = { id: undefined, summary: '', paths: [], always: false };
  let listKey = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) { meta[listKey].push(parseValue(item[1])); continue; }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw.trim() === '') { listKey = key; meta[key] = []; continue; }
    listKey = null;
    meta[key] = parseValue(raw);
  }
  if (!meta.id) throw new Error('frontmatter: missing id');
  return { meta: { id: meta.id, summary: meta.summary ?? '', paths: meta.paths ?? [], always: meta.always === true }, body: lines.slice(end + 1).join('\n') };
}
