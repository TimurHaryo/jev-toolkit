const PER_M = 1_000_000;
const KINDS = [['input_tokens', 'input'], ['output_tokens', 'output'], ['cache_read_input_tokens', 'cache_read'], ['cache_creation_input_tokens', 'cache_write']];

/** USD for one model's usage from a per-million price table. Never guesses a missing price. */
export function costFromUsage(usage, model, pricing) {
  const price = pricing?.[model];
  if (!price) return { cost_usd: null, warning: `no price for ${model}` };
  const cost = KINDS.reduce((sum, [field, key]) => sum + ((usage?.[field] ?? 0) / PER_M) * (price[key] ?? 0), 0);
  return { cost_usd: cost };
}

export function costFromModelUsage(modelUsage, pricing) {
  const per_model = {};
  const warnings = [];
  let total = 0;
  let unpriced = false;
  for (const [model, usage] of Object.entries(modelUsage ?? {})) {
    const r = costFromUsage(usage, model, pricing);
    per_model[model] = r.cost_usd;
    if (r.cost_usd === null) { unpriced = true; warnings.push(r.warning); } else total += r.cost_usd;
  }
  return { cost_usd: unpriced ? null : total, per_model, warnings };
}
