"use client";
import Link from "next/link";
import styles from "@/features/finance/components/finance.module.css";
export default function ReconciliationPageError({ reset }: { reset: () => void }) {
  return <section className={styles.expenseWorkspace}>
    <h2>暂时无法读取账户校准数据</h2>
    <p role="alert">请检查网络和登录状态；这里不会用空数据替代读取错误。</p>
    <button className={styles.expenseSubmit} onClick={reset}>重新读取</button>{" "}
    <Link href="/finance/accounts">返回账户</Link>
  </section>;
}
