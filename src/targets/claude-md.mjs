const STUB_NOTICE = 'Project rules are injected per task by the JEV dynamic-context hook; do not look for them here.';

/** Builds the CLAUDE.md text for one benchmark arm from the loaded rule sections. */
export function renderClaudeMd(variant, rules) {
  const core = rules.find((r) => r.always);
  if (!core) throw new Error('renderClaudeMd: no always-on core section');
  const others = rules.filter((r) => !r.always);
  if (variant === 'native') return core.body;
  if (variant === 'stub') return `${core.body}\n${STUB_NOTICE}\n`;
  if (variant === 'full') return `${core.body}\n${others.map((r) => `@.claude/jev-rules/${r.file}`).join('\n')}\n`;
  throw new Error(`renderClaudeMd: unknown variant ${variant}`);
}
