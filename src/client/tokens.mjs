const CHARS_PER_TOKEN = 4;

/** Rough token estimate used only for truncation decisions, never for billing. */
export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
