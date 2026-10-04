"use client";
import Link from "next/link";
import styles from "@/features/affairs/components/affairs.module.css";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className={styles.notice}>
      <h2>数据暂不可用</h2>
      <p>
        请稍后重试。
      </p>
      <button className={styles.primaryButton} onClick={reset}>
        重新读取
      </button>{" "}
      <Link href="/affairs">返回工作台</Link>
    </section>
  );
}
