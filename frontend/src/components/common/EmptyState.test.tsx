import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="No tasks yet" description="Add your first task above." />);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first task above.")).toBeInTheDocument();
  });

  it("renders an optional action button", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No habits yet"
        action={
          <button type="button" onClick={onClick}>
            Create one
          </button>
        }
      />,
    );
    await user.click(screen.getByRole("button", { name: "Create one" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
