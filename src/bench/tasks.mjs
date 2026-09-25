import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from '../targets/frontmatter.mjs';

const ARMS = { 'dynamic-context': ['full', 'jev', 'native'], 'comment-policy': ['none', 'llm', 'jev'], handback: ['always', 'jev'] };

export function armFileFor(area, arm) {
  if (!ARMS[area]?.includes(arm)) throw new Error(`unknown area/arm: ${area}/${arm}`);
  return `${area}-${arm}.json`;
}

export async function loadTasks(dir, ids = 'all') {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const tasks = [];
  for (const file of files) {
    const { meta, body } = parseFrontmatter(await readFile(join(dir, file), 'utf8'));
    tasks.push({ id: meta.id, category: meta.category ?? '', gold_sections: Array.isArray(meta.gold_sections) ? meta.gold_sections : [], gold_tier: meta.gold_tier ?? null, expect_files: Array.isArray(meta.expect_files) ? meta.expect_files : [], needs_subagent: meta.needs_subagent === true, prompt: body, file });
  }
  if (ids === 'all') return tasks;
  return ids.map((id) => { const t = tasks.find((x) => x.id === id); if (!t) throw new Error(`unknown task ${id}`); return t; });
}
