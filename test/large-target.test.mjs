import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadRules } from '../src/targets/rules.mjs';
import { loadTasks } from '../src/bench/tasks.mjs';
import { renderClaudeMd } from '../src/targets/claude-md.mjs';
import { installArm, verifyInstall } from '../src/targets/install.mjs';
import { toolkitRoot } from '../src/client/config.mjs';
import { findBanned } from './helpers/banned-terms.mjs';

const ORIGINAL = join(toolkitRoot(), 'targets', 'websocket-inspector');
const LARGE = join(toolkitRoot(), 'targets', 'websocket-inspector-large');
const RULES = join(LARGE, 'rules');
const ARMS = join(LARGE, 'arms');
const LARGE_ARMS = ['dynamic-context-full.json', 'dynamic-context-jev.json', 'dynamic-context-native.json'];

test('large rules load with unique ids, one always-on core, and summaries and paths on every other section', async () => {
  const rules = await loadRules(RULES);
  assert.equal(rules.length, 36);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  assert.deepEqual(rules.filter((r) => r.always).map((r) => r.id), ['core']);
  for (const r of rules.filter((x) => !x.always)) {
    assert.ok(r.summary.length >= 20, `${r.id} needs a summary of at least 20 chars`);
    // The copied original git section applies everywhere and has no paths by design.
    if (r.id !== 'git') assert.ok(r.paths.length >= 1, `${r.id} needs at least one paths glob`);
  }
});

test('the first eleven large rules are byte-identical to the original target', async () => {
  const originals = (await readdir(join(ORIGINAL, 'rules'))).filter((f) => f.endsWith('.md')).sort();
  const large = (await readdir(RULES)).filter((f) => f.endsWith('.md')).sort();
  assert.equal(originals.length, 11);
  assert.deepEqual(large.slice(0, 11), originals);
  for (const f of originals) {
    assert.ok((await readFile(join(RULES, f))).equals(await readFile(join(ORIGINAL, 'rules', f))), f);
  }
});

test('total rule bytes are within [32000, 42000], and each new section body is 1000 to 1800 bytes', async () => {
  let total = 0;
  for (const f of (await readdir(RULES)).filter((x) => x.endsWith('.md'))) total += (await stat(join(RULES, f))).size;
  assert.ok(total >= 32000 && total <= 42000, `total ${total}`);
  for (const r of (await loadRules(RULES)).slice(11)) {
    const bytes = Buffer.byteLength(r.body);
    assert.ok(bytes >= 1000 && bytes <= 1800, `${r.id} body is ${bytes} bytes`);
    assert.equal(r.always, false, r.id);
  }
});

test('no banned term in any large rule body, summary, or task prompt', async () => {
  for (const r of await loadRules(RULES)) assert.equal(findBanned(r.body + r.summary), null, r.id);
  for (const t of await loadTasks(join(LARGE, 'tasks'))) assert.equal(findBanned(t.prompt), null, t.id);
});

test('the five tasks are copied verbatim and their gold sections exist in the large rules', async () => {
  const ids = new Set((await loadRules(RULES)).map((r) => r.id));
  const files = (await readdir(join(LARGE, 'tasks'))).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(files, ['01-theme-color.md', '05-db-version.md', '06-clean-decorator-comments.md', '11-suspend-create-session.md', '15-compile-check.md']);
  for (const f of files) assert.ok((await readFile(join(LARGE, 'tasks', f))).equals(await readFile(join(ORIGINAL, 'tasks', f))), f);
  const tasks = await loadTasks(join(LARGE, 'tasks'));
  assert.equal(tasks.length, 5);
  for (const t of tasks) for (const s of t.gold_sections) assert.ok(ids.has(s), `${t.id}: ${s}`);
});

test('the three large arm files are verbatim copies and valid', async () => {
  assert.deepEqual((await readdir(ARMS)).filter((f) => f.endsWith('.json')).sort(), LARGE_ARMS);
  for (const f of LARGE_ARMS) {
    const text = await readFile(join(ARMS, f), 'utf8');
    assert.equal(text, await readFile(join(ORIGINAL, 'arms', f), 'utf8'), f);
    const arm = JSON.parse(text);
    assert.ok(['full', 'stub', 'native'].includes(arm.claudeMd), f);
    assert.ok(['jev', 'native', 'none'].includes(arm.rules), f);
    assert.doesNotMatch(text, /SubagentStart|SubagentStop/, f);
    for (const entries of Object.values(arm.hooks)) for (const e of entries) assert.match(e.bin, /^jev-hook-[a-z-]+\.mjs$/, f);
  }
});

test('the full CLAUDE.md for the large target is over 30,000 characters', async () => {
  assert.ok(renderClaudeMd('full', await loadRules(RULES)).length > 30000);
});

test('installArm then verifyInstall round-trips for each large arm', async () => {
  for (const f of LARGE_ARMS) {
    const target = await mkdtemp(join(tmpdir(), 'jevlarge-'));
    const armFile = join(ARMS, f);
    await installArm({ targetDir: target, armFile, rulesDir: RULES, toolkitPath: '/tk' });
    assert.deepEqual(await verifyInstall({ targetDir: target, armFile, rulesDir: RULES, toolkitPath: '/tk' }), { ok: true }, f);
  }
});

test('jev-bench refuses an unknown --target-name with exit 3 before doing anything else', () => {
  const r = spawnSync(process.execPath, [join(toolkitRoot(), 'bin', 'jev-bench.mjs'), '--area', 'dynamic-context', '--arm', 'full', '--target', tmpdir(), '--run-id', 'x', '--target-name', 'no-such-target', '--yes-reset'], { encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /refused: unknown target no-such-target/);
});
