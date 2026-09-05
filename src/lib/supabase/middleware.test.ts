// @vitest-environment node

import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateSession } from "./middleware";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

const mockedCreateServerClient = vi.mocked(createServerClient);

describe("updateSession", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    mockedCreateServerClient.mockReset();
  });

  it("verifies claims and redirects an unauthenticated protected request", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedCreateServerClient.mockReturnValue({ auth: { getClaims } } as never);

    const response = await updateSession(new NextRequest("http://localhost/finance/budget"));

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Ffinance%2Fbudget",
    );
  });

  it("keeps login public for an unauthenticated request", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedCreateServerClient.mockReturnValue({ auth: { getClaims } } as never);

    const response = await updateSession(new NextRequest("http://localhost/login"));

    expect(getClaims).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects an authenticated login request home and keeps refreshed cookies", async () => {
    const getClaims = vi.fn();
    mockedCreateServerClient.mockImplementation((url, key, options) => {
      getClaims.mockImplementation(async () => {
        const cookieMethods = options.cookies as {
          setAll?: (cookies: Array<{
            name: string;
            value: string;
            options?: { httpOnly?: boolean };
          }>) => void;
        };
        cookieMethods.setAll?.([
          { name: "sb-session", value: "refreshed", options: { httpOnly: true } },
        ]);
        return { data: { claims: { sub: "user-1" } }, error: null };
      });
      return { auth: { getClaims } } as never;
    });

    const response = await updateSession(new NextRequest("http://localhost/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });

  it("does not expose unused auth callback routes", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: null, error: null });
    mockedCreateServerClient.mockReturnValue({ auth: { getClaims } } as never);

    const response = await updateSession(new NextRequest("http://localhost/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fauth%2Fcallback",
    );
  });

  it("allows an authenticated request and propagates refreshed cookies", async () => {
    const getClaims = vi.fn();
    mockedCreateServerClient.mockImplementation((url, key, options) => {
      getClaims.mockImplementation(async () => {
        const cookieMethods = options.cookies as {
          setAll?: (cookies: Array<{
            name: string;
            value: string;
            options?: { httpOnly?: boolean };
          }>) => void;
        };
        cookieMethods.setAll?.([
          { name: "sb-session", value: "refreshed", options: { httpOnly: true } },
        ]);
        return { data: { claims: { sub: "user-1" } }, error: null };
      });
      return { auth: { getClaims } } as never;
    });

    const response = await updateSession(new NextRequest("http://localhost/"));

    expect(response.status).toBe(200);
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });
});
