import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommentPolicyLlm } from '../src/adapters/comment-policy/llm-hook.mjs';
import { DEFAULTS } from '../src/client/config.mjs';

function fakeSpawn(resultText) {
  return () => {
    const p = new EventEmitter(); p.stdout = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {};
    setTimeout(() => { p.stdout.emit('data', Buffer.from(JSON.stringify({ result: resultText, usage: { input_tokens: 10, output_tokens: 5 } }))); p.emit('close', 0); }, 0);
    return p;
  };
}
async function cfg() {
  const dir = await mkdtemp(join(tmpdir(), 'jevllm-'));
  return { ...DEFAULTS, logDir: join(dir, 'logs'), recordingsDir: join(dir, 'rec'), allowedRoots: ['/proj'], apiKey: undefined, disabled: false, configMissing: false, configInvalid: false };
}
const input = (text) => ({ session_id: 's', cwd: '/proj', hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/proj/A.kt', new_string: text } });

test('the llm hook denies narration using the judge instead of Jev, with no API key needed', async () => {
  const r = await runCommentPolicyLlm(input('// increment counter\ncounter++\n'), { config: await cfg(), model: 'v3', spawnImpl: fakeSpawn('{"narrates_0": 0.95, "kind_0": {"choice": "narration", "confidence": 0.9}}'), env: {} });
  assert.equal(r.output.hookSpecificOutput.permissionDecision, 'deny');
});

test('judge failure fails open', async () => {
  const r = await runCommentPolicyLlm(input('// increment counter\ncounter++\n'), { config: await cfg(), model: 'v3', spawnImpl: fakeSpawn('not json'), env: {} });
  assert.deepEqual(r, { output: null, exitCode: 0 });
});
