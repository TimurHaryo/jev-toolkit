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
const VAL_HEAD = /^(val|var)\s+\w+\s*[:=]/;
const FUN_HEAD = /^fun\s+[\w<>.]+\s*\(/;
const IMPORT_HEAD = /^(import|package)\s+[\w.]+(\.\*)?\s*$/;
const TYPE_HEAD = /^(class|object|interface|enum class|data class|sealed class)\s+\w+\s*[:({<]/;
const MODIFIER_HEAD = /^(private|public|internal|protected|override|open|abstract|lateinit|suspend)\s+(val|var|fun|class|object|interface|lateinit|override|suspend)\b/;
const ANNOTATION_HEAD = /^@\w+(\(.*\))?\s+(val|var|fun|class|object|lateinit|private|public|internal|override)\b/;
const CONTROL_HEAD = /^(if|when|for|while)\s*\(/;
const RETURN_HEAD = /^return(\s+[\w.()[\]"']+)?\s*$/;

const HEADS = [VAL_HEAD, FUN_HEAD, IMPORT_HEAD, TYPE_HEAD, MODIFIER_HEAD, CONTROL_HEAD, RETURN_HEAD];

/** Code shape, not vocabulary: prose that opens with a declaration word must stay prose. */
function isCommentedOutCode(text, kind) {
  const first = text.split('\n')[0].trim();
  if (CODE_TAIL.test(first)) return true;
  if (kind !== 'kdoc' && ANNOTATION_HEAD.test(first)) return true;
  return HEADS.some((head) => head.test(first));
}

function ruleFor(text, kind) {
  if (BANNER.test(text)) return RULES.BANNER;
  if (STEP.test(text)) return RULES.STEP;
  if (isCommentedOutCode(text, kind)) return RULES.COMMENTED_OUT;
  return null;
}

/** Splits comments into deterministic violations and those that need a judgment call. */
export function applyFilters(comments) {
  const deterministic = [];
  const remaining = [];
  for (const comment of comments) {
    const text = comment.text.trim();
    if (!text || text.includes(ALLOW_MARKER) || SKIP_PREFIX.test(text)) continue;
    const rule = ruleFor(text, comment.kind);
    if (rule) deterministic.push({ comment, rule });
    else remaining.push(comment);
  }
  return { deterministic, remaining };
}
