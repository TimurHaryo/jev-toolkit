export const RULES = Object.freeze({
  BANNER: 'banner',
  COMMENTED_OUT: 'commented_out_code',
  STEP: 'step_numbering',
  NARRATION: 'narration',
  RESTATES_SIGNATURE: 'restates_signature',
});

const ALLOW_MARKER = 'jev:allow';
const SKIP_PREFIX = /^(TODO|FIXME)\b/i;
const BANNER = /^[\s=\-*_#]*([=\-*_#])\1{2,}[\s=\-*_#A-Za-z]*$/;
const STEP = /^(step\s*\d+\s*[:.)-]|\d+\s*[.)]\s)/i;
const CODE_TAIL = /[{};]\s*$/;
const DECL_HEAD = /^(val|var|fun|import|package|class|object|private|public|internal|override|@\w+)\b/;
const CONTROL_HEAD = /^(if|when|for|while)\s*\(/;
const RETURN_HEAD = /^return(\s+[\w.()[\]"']+)?\s*$/;

function isCommentedOutCode(text) {
  const first = text.split('\n')[0].trim();
  return CODE_TAIL.test(first) || DECL_HEAD.test(first) || CONTROL_HEAD.test(first) || RETURN_HEAD.test(first);
}

function ruleFor(text) {
  if (BANNER.test(text)) return RULES.BANNER;
  if (STEP.test(text)) return RULES.STEP;
  if (isCommentedOutCode(text)) return RULES.COMMENTED_OUT;
  return null;
}

/** Splits comments into deterministic violations and those that need a judgment call. */
export function applyFilters(comments) {
  const deterministic = [];
  const remaining = [];
  for (const comment of comments) {
    const text = comment.text.trim();
    if (text.includes(ALLOW_MARKER) || SKIP_PREFIX.test(text)) continue;
    const rule = ruleFor(text);
    if (rule) deterministic.push({ comment, rule });
    else remaining.push(comment);
  }
  return { deterministic, remaining };
}
