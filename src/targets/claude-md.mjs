const STUB_NOTICE = 'Project rules are injected per task by the JEV dynamic-context hook; do not look for them here.';

/** Builds the CLAUDE.md text for one benchmark arm from the loaded rule sections. */
export function renderClaudeMd(variant, rules, note) {
  const base = renderVariant(variant, rules);
  return note ? `${base}\n## Orchestrator note (benchmark arm)\n\n${note.trim()}\n` : base;
}

function renderVariant(variant, rules) {
  const core = rules.find((r) => r.always);
  if (!core) throw new Error('renderClaudeMd: no always-on core section');
  const others = rules.filter((r) => !r.always);
  if (variant === 'native') return core.body;
  if (variant === 'stub') return `${core.body}\n${STUB_NOTICE}\n`;
  // Inlined, not `@` imports: an import is a budget hint Claude Code may defer, so the arm would
  // not actually be the "everything up front" baseline it is meant to measure.
  if (variant === 'full') return `${[core.body.trim(), ...others.map((r) => r.body.trim())].join('\n\n')}\n`;
  throw new Error(`renderClaudeMd: unknown variant ${variant}`);
}
