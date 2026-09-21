export const EXIT = Object.freeze({ OK: 0, BLOCK: 2 });

export async function readStdinJson(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeHookOutput(obj, out = process.stdout) {
  if (obj === null || obj === undefined) return;
  out.write(`${JSON.stringify(obj)}\n`);
}
