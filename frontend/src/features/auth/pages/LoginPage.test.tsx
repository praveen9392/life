import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import LoginPage from "./LoginPage";
import { ApiError } from "../../../services/api/httpClient";

const mutateAsync = vi.fn();

vi.mock("../hooks", () => ({
  useLogin: () => ({ mutateAsync, isPending: false }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({});
});

describe("LoginPage", () => {
  it("submits typed credentials and navigates to the app", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter22-boom");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ email: "me@example.com", password: "hunter22-boom" }));
  });

  it("blocks submission with a validation message for a bad email", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "whatever");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeInTheDocument());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces the API error message on failed login", async () => {
    mutateAsync.mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Invalid email or password"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password"),
    );
  });
});
