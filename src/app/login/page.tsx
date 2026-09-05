import { LoginForm } from "./login-form";
import styles from "./login.module.css";

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;

  return (
    <main className={styles.page}>
      <section aria-label="登录" className={styles.panel}>
        <LoginForm nextPath={next} />
      </section>
    </main>
  );
}
