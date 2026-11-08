const SNIPPET_MAX_CHARS = 200;
const SNIPPET_FALLBACK = "Code snippet";

/**
 * Strips markdown syntax down to plain prose for list-card previews.
 * Fenced code and mermaid blocks are removed entirely (raw syntax in a
 * snippet reads as clutter); if nothing prose-y remains, a short fallback
 * label is returned instead.
 */
export function snippetFromContent(content: string): string {
  const plain = content
    .replace(/```[\s\S]*?(```|$)/g, " ") // fenced blocks, even unterminated
    .replace(/`[^`\n]+`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> their text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}([-*_]\s?){3,}$/gm, " ") // horizontal rules
    .replace(/^\s*[-*+]\s+/gm, "") // list bullets
    .replace(/\[[ xX]\]/g, "") // task-list checkboxes
    .replace(/(\*\*|__|\*|_|~~)/g, "") // emphasis markers
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return SNIPPET_FALLBACK;
  return plain.length > SNIPPET_MAX_CHARS
    ? `${plain.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`
    : plain;
}
