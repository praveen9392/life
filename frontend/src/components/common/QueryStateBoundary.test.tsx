import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryStateBoundary } from "./QueryStateBoundary";
import { ApiError } from "../../services/api/httpClient";

const noop = () => {};

function useQueryResult(overrides: Record<string, unknown>) {
  // Minimal UseQueryResult-shaped object - QueryStateBoundary only reads
  // isPending/isError/data/error/refetch.
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: noop,
    ...overrides,
  } as never;
}

describe("QueryStateBoundary", () => {
  it("renders the skeleton while pending", () => {
    const { container } = render(
      <QueryStateBoundary
        query={useQueryResult({ isPending: true })}
        skeleton={<div data-testid="skeleton" />}
        empty={<p>empty</p>}
      >
        {() => <p>data</p>}
      </QueryStateBoundary>,
    );
    expect(screen.getByTestId("skeleton")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("empty");
  });

  it("renders the empty state for null data", () => {
    render(
      <QueryStateBoundary
        query={useQueryResult({ data: null })}
        skeleton={<div />}
        empty={<p>nothing yet</p>}
      >
        {() => <p>data</p>}
      </QueryStateBoundary>,
    );
    expect(screen.getByText("nothing yet")).toBeInTheDocument();
  });

  it("renders the data via the render prop on success", () => {
    render(
      <QueryStateBoundary
        query={useQueryResult({ data: { name: "task" } })}
        skeleton={<div />}
        empty={<p>empty</p>}
      >
        {(data: { name: string }) => <p>loaded {data.name}</p>}
      </QueryStateBoundary>,
    );
    expect(screen.getByText("loaded task")).toBeInTheDocument();
  });

  it("renders a retryable error state with the API error message", async () => {
    const refetch = vi.fn().mockResolvedValue({});
    render(
      <QueryStateBoundary
        query={useQueryResult({
          isError: true,
          error: new ApiError(500, "BOOM", "Something broke"),
          refetch,
        })}
        skeleton={<div />}
        empty={<p>empty</p>}
      >
        {() => <p>data</p>}
      </QueryStateBoundary>,
    );
    expect(screen.getByText("Something broke")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct offline message for network errors", () => {
    render(
      <QueryStateBoundary
        query={useQueryResult({
          isError: true,
          error: new ApiError(0, "NETWORK_ERROR", "fetch failed"),
        })}
        skeleton={<div />}
        empty={<p>empty</p>}
      >
        {() => <p>data</p>}
      </QueryStateBoundary>,
    );
    expect(screen.getByText(/appear to be offline/i)).toBeInTheDocument();
  });
});
