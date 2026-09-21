import { noul, choice, score } from './schema.mjs';

export function buildSmokeRequest(model) {
  return {
    model,
    state: 'The sky is blue on a clear afternoon.',
    questions: {
      is_blue: noul('Is the sky described as blue?', { true: 'The text says the sky is blue', false: 'The text says another color or nothing about color' }),
      color: choice('Which color is the sky?', { blue: 'Blue', red: 'Red', other: null }),
      certainty: score('How certain is the statement?', ['Hedged or uncertain', 'Somewhat confident', 'Stated as plain fact']),
    },
  };
}

export function formatSmokeReport({ status, body, text, validation, latencyMs, mode, allowedRoots }) {
  const ok = status >= 200 && status < 300 && validation.ok;
  const lines = [
    `JEV smoke: ${ok ? 'PASS' : 'FAIL'}`,
    `status: ${status}`,
    `mode: ${mode}`,
    `allowedRoots: ${JSON.stringify(allowedRoots ?? [])}`,
    `latency: ${latencyMs} ms`,
  ];
  if (body?.usage) lines.push(`usage: ${JSON.stringify(body.usage)}`);
  if (ok) {
    lines.push(`answers: ${JSON.stringify(body.answers)}`);
  } else {
    lines.push('', 'PASTE THIS BACK', '----------------', `status: ${status}`, `validation: ${validation.ok ? 'ok' : validation.detail}`, `raw body: ${text.slice(0, 2000)}`, '----------------');
  }
  return { ok, text: lines.join('\n') };
}
