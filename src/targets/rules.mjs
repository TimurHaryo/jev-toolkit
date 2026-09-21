import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

/** Reads every rule section in a folder, in filename order. */
export async function loadRules(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  const rules = [];
  for (const file of files) {
    const { meta, body } = parseFrontmatter(await readFile(join(dir, file), 'utf8'));
    rules.push({ ...meta, body, file });
  }
  return rules;
}
