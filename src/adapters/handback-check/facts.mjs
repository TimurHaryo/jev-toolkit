import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, isGitRepo } from './git.mjs';
import { takeSnapshot, diffSnapshots, dirtyPaths } from './snapshot.mjs';

const TEST_PATH = /(\/test\/|\/androidTest\/|Test\.kt$)/;
// An optional leading "…/" is captured so it can be stripped like ".../".
const PATH_IN_TEXT = /(?:…\/)?[\w./-]+\.(?:kt|kts|gradle|xml|md|mjs|json)\b/g;
const RELATIVE_PREFIX = /^(?:\.\.\.\/|…\/|\.\.?\/)+/;

/** NUL-separated for the same reason as dirtyPaths: a space in a path would otherwise be quoted. */
function untrackedPaths(cwd) {
  const out = runGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
  return out ? out.split('\0').filter(Boolean) : [];
}

function lineCounts(cwd, files, untracked) {
  let insertions = 0;
  let deletions = 0;
  const tracked = files.filter((f) => !untracked.has(f));
  if (tracked.length) {
    const out = runGit(cwd, ['diff', '--numstat', 'HEAD', '--', ...tracked]) ?? '';
    for (const line of out.split('\n').filter(Boolean)) {
      const [ins, del] = line.split('\t');
      insertions += Number(ins) || 0;
      deletions += Number(del) || 0;
    }
  }
  for (const f of files.filter((f) => untracked.has(f))) {
    const full = join(cwd, f);
    if (existsSync(full)) insertions += readFileSync(full, 'utf8').split('\n').filter(Boolean).length;
  }
  return { insertions, deletions };
}

/** Deterministic facts about what changed. Jev never sees these; code combines them with its answers. */
export function collectFacts(cwd, { before } = {}) {
  if (!isGitRepo(cwd)) return { isGitRepo: false, filesChanged: [], testFilesChanged: false, insertions: 0, deletions: 0, untracked: 0, attribution: 'none' };
  const filesChanged = before ? diffSnapshots(before, takeSnapshot(cwd)) : dirtyPaths(cwd);
  const untracked = new Set(untrackedPaths(cwd));
  const { insertions, deletions } = lineCounts(cwd, filesChanged, untracked);
  return {
    isGitRepo: true,
    filesChanged,
    testFilesChanged: filesChanged.some((f) => TEST_PATH.test(f)),
    insertions,
    deletions,
    untracked: filesChanged.filter((f) => untracked.has(f)).length,
    attribution: before ? 'snapshot' : 'head',
  };
}

/** Repo-relative form of a mention: drops a leading cwd and any ./, ../, .../ or …/ prefixes. */
function normaliseMention(mention, cwd) {
  const root = cwd ? cwd.replace(/\/+$/, '') : '';
  const local = root && mention.startsWith(`${root}/`) ? mention.slice(root.length + 1) : mention;
  return local.replace(RELATIVE_PREFIX, '');
}

const matchesChanged = (m, f) => f === m || f.endsWith(`/${m}`) || m.endsWith(`/${f}`);

/** File paths the summary names that match no changed path. Information for the card, not a flag. */
export function mentionedNotInDiff(summary, facts, { cwd } = {}) {
  const mentioned = [...new Set((summary.match(PATH_IN_TEXT) ?? []).map((m) => normaliseMention(m, cwd)))];
  return mentioned.filter((m) => !facts.filesChanged.some((f) => matchesChanged(m, f)));
}
