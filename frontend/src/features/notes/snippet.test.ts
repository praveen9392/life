import { describe, expect, it } from "vitest";

import { snippetFromContent } from "./snippet";

describe("snippetFromContent", () => {
  it("keeps plain prose as-is", () => {
    expect(snippetFromContent("The whole day in one chain.")).toBe(
      "The whole day in one chain.",
    );
  });

  it("collapses note that is only code or a mermaid diagram to a fallback label", () => {
    expect(snippetFromContent("```mermaid\nflowchart TD\n  A --> B\n```")).toBe("Code snippet");
    expect(snippetFromContent("```python\nprint('hi')\n```")).toBe("Code snippet");
    expect(snippetFromContent("```mermaid\nflowchart TD\n  A --> B")).toBe("Code snippet");
  });

  it("strips fences and keeps only the prose around them", () => {
    const snippet = snippetFromContent(
      "# Status codes\n\nThe whole day in one chain.\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\n## Derive, don't memorize",
    );
    expect(snippet).toBe("Status codes The whole day in one chain. Derive, don't memorize");
  });

  it("removes emphasis markers, links, rules and task checkboxes", () => {
    const snippet = snippetFromContent(
      "**Bold** _italics_ ~~gone~~ [docs](https://x.y)\n\n---\n\n- [ ] buy milk",
    );
    expect(snippet).toBe("Bold italics gone docs buy milk");
  });

  it("truncates long prose with an ellipsis", () => {
    const snippet = snippetFromContent("word ".repeat(80));
    expect(snippet.length).toBeLessThanOrEqual(201);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("handles empty content", () => {
    expect(snippetFromContent("")).toBe("Code snippet");
    expect(snippetFromContent("   \n  ")).toBe("Code snippet");
  });
});
