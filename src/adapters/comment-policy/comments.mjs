const CODE_AFTER_LINES = 3;

/**
 * `covered` holds every 0-based line index that lies inside any comment.
 * `codeOnly` maps a trailing comment's line index to the code before the `//`.
 */
function codeAfterFrom(lines, startLineIdx, covered, codeOnly) {
  const out = [];
  for (let i = startLineIdx; i < lines.length && out.length < CODE_AFTER_LINES; i += 1) {
    if (covered.has(i)) {
      if (out.length) break;
      continue;
    }
    const text = codeOnly.get(i) ?? lines[i];
    if (!text.trim()) continue;
    out.push(text.trim());
  }
  return out.join('\n');
}

function coveredLines(found) {
  const covered = new Set();
  for (const c of found) {
    if (c.trailing) continue;
    for (let l = c.line; l <= c.endLine; l += 1) covered.add(l - 1);
  }
  return covered;
}

function codeOnlyLines(found) {
  const codeOnly = new Map();
  for (const c of found) {
    if (c.trailing) codeOnly.set(c.line - 1, c.sameLineCode);
  }
  return codeOnly;
}

function cleanBlock(body) {
  return body
    .split('\n')
    .map((l) => l.trim().replace(/^\*+\s?/, '').trim())
    .filter((l, idx, arr) => !(l === '' && (idx === 0 || idx === arr.length - 1)))
    .join('\n')
    .trim();
}

/** Scans Kotlin source and returns every comment with the code that follows it. */
export function extractComments(source) {
  const lines = source.split('\n');
  const found = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const n = source.length;

  const advance = (k = 1) => {
    for (let s = 0; s < k; s += 1) {
      if (source[i] === '\n') {
        line += 1;
        lineStart = i + 1;
      }
      i += 1;
    }
  };

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '"' && next === '"' && source[i + 2] === '"') {
      advance(3);
      while (i < n && !(source[i] === '"' && source[i + 1] === '"' && source[i + 2] === '"')) advance();
      advance(3);
      continue;
    }
    if (ch === '"') {
      advance();
      while (i < n && source[i] !== '"') advance(source[i] === '\\' ? 2 : 1);
      advance();
      continue;
    }
    if (ch === "'") {
      advance();
      while (i < n && source[i] !== "'") advance(source[i] === '\\' ? 2 : 1);
      advance();
      continue;
    }
    if (ch === '/' && next === '/') {
      const startLine = line;
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      const text = source.slice(i + 2, stop).trim();
      const prefix = source.slice(lineStart, i).trim();
      found.push({
        line: startLine,
        kind: 'line',
        text,
        endLine: startLine,
        trailing: prefix !== '',
        sameLineCode: prefix,
      });
      advance(stop - i);
      continue;
    }
    if (ch === '/' && next === '*') {
      const startLine = line;
      const kind = source[i + 2] === '*' && source[i + 3] !== '/' ? 'kdoc' : 'block';
      advance(2);
      let depth = 1;
      const bodyStart = i;
      while (i < n && depth > 0) {
        if (source[i] === '/' && source[i + 1] === '*') { depth += 1; advance(2); continue; }
        if (source[i] === '*' && source[i + 1] === '/') { depth -= 1; if (depth === 0) break; advance(2); continue; }
        advance();
      }
      const body = source.slice(bodyStart, i).replace(/^\*/, '');
      const endLine = line;
      advance(2);
      found.push({ line: startLine, kind, text: cleanBlock(body), endLine });
      continue;
    }
    advance();
  }

  const covered = coveredLines(found);
  const codeOnly = codeOnlyLines(found);
  return found.map((c, id) => ({
    id,
    line: c.line,
    kind: c.kind,
    text: c.text,
    codeAfter: c.trailing ? c.sameLineCode : codeAfterFrom(lines, c.endLine, covered, codeOnly),
  }));
}
