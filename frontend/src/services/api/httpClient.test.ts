import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, request } from "./httpClient";

function mockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("httpClient", () => {
  const assign = vi.fn();
  const originalLocation = window.location;

  function setPathname(pathname: string) {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname, assign },
    });
  }

  beforeEach(() => {
    assign.mockReset();
    setPathname("/app/tasks");
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.unstubAllGlobals();
  });

  it("maps the error envelope to an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(422, { error: { code: "VALIDATION", message: "Bad", fields: { title: "Required" } } }),
      ),
    );
    const error = await request("/api/v1/tasks").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "VALIDATION", message: "Bad", fields: { title: "Required" } });
  });

  it("maps network failures to NETWORK_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    await expect(request("/api/v1/tasks")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("redirects to /login on 401 from a non-auth endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(401, { error: { code: "UNAUTHORIZED" } })));
    await expect(request("/api/v1/tasks")).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("does not redirect on 401 from auth endpoints", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(401, { error: { code: "INVALID" } })));
    await expect(request("/api/v1/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not redirect when already on /login", async () => {
    setPathname("/login");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(401, null)));
    await expect(request("/api/v1/tasks")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });
});
