import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const push = vi.fn();
const refresh = vi.fn();
const signInWithPassword = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    signInWithPassword.mockReset();
  });

  it("signs in an existing user and returns to a safe local path", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm nextPath="/finance/budget" />);

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery-staple");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct-horse-battery-staple",
    });
    expect(push).toHaveBeenCalledWith("/finance/budget");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows the authentication error without navigating", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({ data: {}, error: { message: "Invalid credentials" } });
    render(<LoginForm nextPath="https://attacker.example" />);

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确");
    expect(push).not.toHaveBeenCalled();
  });

  it("rejects a backslash-based external return path", async () => {
    const user = userEvent.setup();
    signInWithPassword.mockResolvedValue({ data: {}, error: null });
    render(<LoginForm nextPath="/\\attacker.example" />);

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "登录" }));

    expect(push).toHaveBeenCalledWith("/");
  });

  it("renders only the password login controls", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText("Email")).toBeVisible();
    expect(screen.getByLabelText("Password")).toBeVisible();
    expect(screen.getByRole("button", { name: "登录" })).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/Magic Link|OTP|注册/i)).not.toBeInTheDocument();
  });
});
