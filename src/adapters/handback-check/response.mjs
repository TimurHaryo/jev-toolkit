const MAX_CHARS = 12000;

/**
 * Pure: the subagent's hand-back text out of a PostToolUse `tool_response`, whose shape depends on
 * how the transcript recorded the result (plain string, content blocks, or a wrapper object).
 */
export function summaryFromResponse(toolResponse) {
  if (toolResponse === null || toolResponse === undefined) return '';
  if (typeof toolResponse === 'string') return toolResponse;
  if (Array.isArray(toolResponse)) {
    return toolResponse
      .filter((part) => typeof part === 'string' || part?.type === 'text')
      .map((part) => (typeof part === 'string' ? part : String(part.text ?? '')))
      .join('\n');
  }
  if (typeof toolResponse === 'object') {
    if (toolResponse.content !== undefined) return summaryFromResponse(toolResponse.content);
    if (typeof toolResponse.result === 'string') return toolResponse.result;
    if (typeof toolResponse.text === 'string') return toolResponse.text;
  }
  // Anything else is still worth showing to Jev; cap it so a huge payload cannot blow the state up.
  return String(JSON.stringify(toolResponse) ?? '').slice(0, MAX_CHARS);
}
