import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHooks, installArm } from '../src/targets/install.mjs';
import { toolkitRoot } from '../src/client/config.mjs';

const RULES = join(toolkitRoot(), 'targets', 'websocket-inspector', 'rules');
const ARMS = join(toolkitRoot(), 'targets', 'websocket-inspector', 'arms');

test('renderHooks builds the Claude Code shape and quotes the toolkit path', () => {
  const out = renderHooks({ PreToolUse: [{ matcher: 'Edit|Write', bin: 'x.mjs', timeout: 5, statusMessage: 's' }], UserPromptSubmit: [{ bin: 'y.mjs', timeout: 7 }] }, '/tk');
  assert.deepEqual(out, {
    PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node "/tk/bin/x.mjs"', timeout: 5, statusMessage: 's' }] }],
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "/tk/bin/y.mjs"', timeout: 7 }] }],
  });
});

test('installArm writes CLAUDE.md, settings.json, and jev-rules for a jev arm, preserving other settings keys', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await mkdir(join(target, '.claude'));
  await writeFile(join(target, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Read'] }, hooks: { Stop: [] } }));
  const r = await installArm({ targetDir: target, armFile: join(ARMS, 'comment-policy-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const settings = JSON.parse(await readFile(join(target, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.permissions, { allow: ['Read'] });
  assert.equal(settings.hooks.Stop, undefined);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'node "/tk/bin/jev-hook-comment-policy.mjs"');
  const claude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /# Compose/);
  const files = await readdir(join(target, '.claude', 'jev-rules'));
  assert.equal(files.includes('.jev-managed'), true);
  assert.equal(files.filter((f) => f.endsWith('.md')).length, 10);
  assert.ok(r.written.some((p) => p.endsWith('CLAUDE.md')));
});

test('switching to the native arm removes jev-rules and writes .claude/rules with paths-only frontmatter, skipping empty-paths sections', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const r = await installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-native.json'), rulesDir: RULES, toolkitPath: '/tk' });
  await assert.rejects(stat(join(target, '.claude', 'jev-rules')));
  assert.ok(r.removed.some((p) => p.endsWith('jev-rules')));
  const files = (await readdir(join(target, '.claude', 'rules'))).filter((f) => f.endsWith('.md'));
  assert.equal(files.includes('10-git.md'), false);
  assert.equal(files.length, 9);
  const compose = await readFile(join(target, '.claude', 'rules', '02-compose.md'), 'utf8');
  assert.match(compose, /^---\npaths:\n  - "\*\*\/ui\/\*\*\/\*\.kt"\n---\n# Compose/);
  assert.doesNotMatch(compose, /summary:/);
  const claude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(claude, /@\.claude/);
  const settings = JSON.parse(await readFile(join(target, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.hooks, {});
});

test('installArm is idempotent', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  const a = await installArm({ targetDir: target, armFile: join(ARMS, 'all-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  const b = await installArm({ targetDir: target, armFile: join(ARMS, 'all-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  assert.deepEqual(a.written.sort(), b.written.sort());
  assert.deepEqual(b.removed, []);
});

test('every shipped arm file is valid', async () => {
  for (const f of (await readdir(ARMS)).filter((x) => x.endsWith('.json'))) {
    const text = await readFile(join(ARMS, f), 'utf8');
    const arm = JSON.parse(text);
    assert.ok(['full', 'stub', 'native'].includes(arm.claudeMd), f);
    assert.ok(['jev', 'native', 'none'].includes(arm.rules), f);
    // The hand-back check runs on the parent's side; the SubagentStart/SubagentStop events are gone.
    assert.doesNotMatch(text, /SubagentStart|SubagentStop/, f);
    for (const entries of Object.values(arm.hooks)) for (const e of entries) assert.match(e.bin, /^jev-hook-[a-z-]+\.mjs$/, f);
  }
});

test('refuses to overwrite an unmanaged rules folder and writes nothing at all', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await mkdir(join(target, '.claude', 'rules'), { recursive: true });
  await writeFile(join(target, '.claude', 'rules', 'user-owned.md'), 'mine');
  await assert.rejects(installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-native.json'), rulesDir: RULES, toolkitPath: '/tk' }), /unmanaged/);
  assert.equal(await readFile(join(target, '.claude', 'rules', 'user-owned.md'), 'utf8'), 'mine');
  await assert.rejects(stat(join(target, 'CLAUDE.md')));
});

test('a refused switch to the native arm leaves the managed jev-rules folder intact', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-jev.json'), rulesDir: RULES, toolkitPath: '/tk' });
  await mkdir(join(target, '.claude', 'rules'), { recursive: true });
  await writeFile(join(target, '.claude', 'rules', 'user-owned.md'), 'mine');
  await assert.rejects(installArm({ targetDir: target, armFile: join(ARMS, 'dynamic-context-native.json'), rulesDir: RULES, toolkitPath: '/tk' }), /unmanaged/);
  assert.equal(await readFile(join(target, '.claude', 'rules', 'user-owned.md'), 'utf8'), 'mine');
  const kept = await readdir(join(target, '.claude', 'jev-rules'));
  assert.equal(kept.includes('.jev-managed'), true);
  assert.equal(kept.filter((f) => f.endsWith('.md')).length, 10);
});

test('refuses a target directory that does not exist', async () => {
  const target = join(await mkdtemp(join(tmpdir(), 'jevtarget-')), 'nope');
  await assert.rejects(installArm({ targetDir: target, armFile: join(ARMS, 'base-full.json'), rulesDir: RULES, toolkitPath: '/tk' }), /does not exist/);
});

test('refuses an arm with an unknown rules mode', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  const armFile = join(target, 'bogus.json');
  await writeFile(armFile, JSON.stringify({ claudeMd: 'native', rules: 'bogus' }));
  await assert.rejects(installArm({ targetDir: target, armFile, rulesDir: RULES, toolkitPath: '/tk' }), /unknown rules mode bogus/);
  await assert.rejects(stat(join(target, 'CLAUDE.md')));
});

test('refuses a malformed settings.json and leaves it intact', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  await mkdir(join(target, '.claude'), { recursive: true });
  await writeFile(join(target, '.claude', 'settings.json'), '{ nope');
  await assert.rejects(installArm({ targetDir: target, armFile: join(ARMS, 'base-full.json'), rulesDir: RULES, toolkitPath: '/tk' }), /not valid JSON/);
  assert.equal(await readFile(join(target, '.claude', 'settings.json'), 'utf8'), '{ nope');
  await assert.rejects(stat(join(target, 'CLAUDE.md')));
});

test('an arm without a hooks key installs with empty hooks', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jevtarget-'));
  const armFile = join(target, 'no-hooks.json');
  await writeFile(armFile, JSON.stringify({ claudeMd: 'native', rules: 'none' }));
  await installArm({ targetDir: target, armFile, rulesDir: RULES, toolkitPath: '/tk' });
  const settings = JSON.parse(await readFile(join(target, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.hooks, {});
});
