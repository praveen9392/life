import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoteReaderModal } from "./NoteReaderModal";
import type { Tag } from "../tags/api";

const tags: Tag[] = [{ id: "t1", name: "Learning" }];

describe("NoteReaderModal", () => {
  it("renders the title, tag chips and rendered GFM markdown when open", () => {
    render(
      <NoteReaderModal
        open
        onOpenChange={() => {}}
        title="Reading list"
        content={"# Heading\n\n- [ ] task item"}
        tags={tags}
      />,
    );

    expect(screen.getByText("Reading list")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Heading" })).toBeInTheDocument();
    expect(screen.getByText("Learning")).toBeInTheDocument();
  });

  it("shows the empty message when the content is blank", () => {
    render(<NoteReaderModal open onOpenChange={() => {}} title="Empty" content="   " tags={[]} />);

    expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  });
});
