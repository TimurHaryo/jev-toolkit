export function noul(instructions, criteria) {
  return criteria ? { type: 'noul', instructions, criteria } : { type: 'noul', instructions };
}

export function choice(instructions, criteria) {
  return { type: 'choice', instructions, criteria };
}

export function score(instructions, levels) {
  return { type: 'score', instructions, criteria: levels };
}

export function buildRequest({ model, state, questions }) {
  return { model, state, questions };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const inUnit = (v) => isNum(v) && v >= 0 && v <= 1;

function problem(id, q, a) {
  if (!a || typeof a !== 'object') return `${id}: missing answer`;
  if (q.type === 'noul') return inUnit(a.noul) ? null : `${id}: noul must be a number in [0,1]`;
  if (q.type === 'choice') {
    if (!Object.prototype.hasOwnProperty.call(q.criteria, a.choice)) return `${id}: choice "${a.choice}" not in options`;
    if (!a.probabilities || typeof a.probabilities !== 'object') return `${id}: probabilities missing`;
    return inUnit(a.confidence) ? null : `${id}: confidence must be in [0,1]`;
  }
  if (q.type === 'score') {
    if (!isNum(a.score)) return `${id}: score must be a number`;
    if (!a.probabilities) return `${id}: probabilities missing`;
    return inUnit(a.confidence) ? null : `${id}: confidence must be in [0,1]`;
  }
  return `${id}: unknown question type ${q.type}`;
}

/** Structural check only. A valid shape says nothing about whether the answer is right. */
export function validateAnswers(questions, body) {
  if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object') {
    return { ok: false, reason: 'schema', detail: 'body.answers is not an object' };
  }
  const problems = Object.entries(questions)
    .map(([id, q]) => problem(id, q, body.answers[id]))
    .filter(Boolean);
  if (problems.length) return { ok: false, reason: 'schema', detail: problems.join('; ') };
  return { ok: true, answers: body.answers };
}
