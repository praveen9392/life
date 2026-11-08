import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownView } from "./MarkdownView";

const mermaidRender = vi.hoisted(() => vi.fn());
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: mermaidRender,
  },
}));

describe("MarkdownView", () => {
  it("renders GFM markdown (headings, task lists, tables)", () => {
    render(
      <MarkdownView>{"# Title\n\n- [ ] done later\n\n| a | b |\n| - | - |\n| 1 | 2 |"}</MarkdownView>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders a fenced mermaid block as a diagram instead of code", async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>',
    });
    const { container } = render(
      <MarkdownView>{"```mermaid\nflowchart TD\n  A --> B\n```"}</MarkdownView>,
    );

    await waitFor(() => expect(container.querySelector("svg")).toBeInTheDocument());
    expect(mermaidRender).toHaveBeenCalledWith(expect.any(String), "flowchart TD\n  A --> B");
    // The diagram must not be wrapped in the code-block <pre>.
    expect(container.querySelector("svg")?.closest("pre")).toBeNull();
  });

  it("shows an inline error with the raw source when the diagram is invalid", async () => {
    mermaidRender.mockRejectedValue(new Error("Syntax error in graph"));
    render(<MarkdownView>{"```mermaid\nflowchart broken\n```"}</MarkdownView>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Syntax error in graph");
    expect(screen.getByText(/flowchart broken/)).toBeInTheDocument();
  });

  it("keeps normal fenced code blocks inside <pre><code>", () => {
    const { container } = render(<MarkdownView>{"```python\nprint('hi')\n```"}</MarkdownView>);

    expect(container.querySelector("pre code")).toBeInTheDocument();
    expect(container.querySelector("pre code")?.textContent?.trim()).toBe("print('hi')");
    expect(mermaidRender).not.toHaveBeenCalled();
  });
});
