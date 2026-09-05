"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

import styles from "./login.module.css";

interface LoginFormProps {
  nextPath?: string;
}

function getSafeNextPath(nextPath?: string) {
  if (!nextPath?.startsWith("/")) return "/";

  const baseUrl = new URL("http://personal-os.local");
  const destination = new URL(nextPath, baseUrl);
  if (destination.origin !== baseUrl.origin) return "/";

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMessage("邮箱或密码不正确");
      setIsSubmitting(false);
      return;
    }

    router.push(getSafeNextPath(nextPath));
    router.refresh();
  }

  return (
    <form aria-label="登录" className={styles.form} onSubmit={handleSubmit}>
      <label>
        <span>Email</span>
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        <span>Password</span>
        <input autoComplete="current-password" name="password" required type="password" />
      </label>
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <button disabled={isSubmitting} type="submit">
        {isSubmitting ? "正在登录" : "登录"}
      </button>
    </form>
  );
}
