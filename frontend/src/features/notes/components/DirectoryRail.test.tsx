import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DirectoryRail } from "./DirectoryRail";
import type { NoteDirectory } from "../api";

function makeDirectory(id: string, name: string, noteCount: number): NoteDirectory {
  return { id, name, note_count: noteCount, created_at: "", updated_at: "" };
}

const baseProps = {
  directories: [makeDirectory("f1", "Reading", 2)],
  unfiledCount: 1,
  totalCount: 3,
  selectedFilter: "all" as const,
  onSelectFilter: vi.fn(),
  onCreateFolder: vi.fn(),
  onRenameFolder: vi.fn(),
  onDeleteFolder: vi.fn(),
  onDropNoteToFolder: vi.fn(),
  onDropNoteToUnfiled: vi.fn(),
  onCreateFolderWithNote: vi.fn(),
  draggingNoteId: null,
};

describe("DirectoryRail", () => {
  it("renders All notes, Unfiled and each folder with its count", () => {
    render(<DirectoryRail {...baseProps} />);

    expect(screen.getByText("All notes")).toBeInTheDocument();
    expect(screen.getByText("Unfiled")).toBeInTheDocument();
    expect(screen.getByText("Reading")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("selects a folder on click", async () => {
    const user = userEvent.setup();
    render(<DirectoryRail {...baseProps} />);

    await user.click(screen.getByText("Reading"));

    expect(baseProps.onSelectFilter).toHaveBeenCalledWith("f1");
  });

  it("creates a folder from the inline input and closes it on success", async () => {
    const onCreateFolder = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();
    render(<DirectoryRail {...baseProps} onCreateFolder={onCreateFolder} />);

    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.type(screen.getByLabelText("New folder name"), "Work");
    await user.keyboard("{Enter}");

    expect(onCreateFolder).toHaveBeenCalledWith("Work");
    expect(await screen.findByRole("button", { name: /new folder/i })).toBeInTheDocument();
  });

  it("surfaces a failed creation inline instead of closing the input", async () => {
    const user = userEvent.setup();
    render(
      <DirectoryRail
        {...baseProps}
        onCreateFolder={vi.fn().mockResolvedValue("A folder with this name already exists")}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new folder/i }));
    await user.type(screen.getByLabelText("New folder name"), "Reading");
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A folder with this name already exists",
    );
  });
});
