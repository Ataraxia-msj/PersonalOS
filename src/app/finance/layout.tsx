import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { FinanceTabs } from "@/features/finance/components/finance-tabs";
import styles from "@/features/finance/components/finance.module.css";

export default function FinanceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className={styles.financePage}>
      <header className={styles.financeHeader}>
        <div>
          <h1>财务总览</h1>
          <button aria-label="选择月份" className={styles.monthButton} type="button">
            2026年9月 <span aria-hidden="true">⌄</span>
          </button>
        </div>
        <Link className={styles.addTransaction} href="/finance/transactions">
          <kbd>N</kbd>
          <IconPlus aria-hidden="true" size={17} stroke={1.7} />
          新增交易
        </Link>
      </header>
      <FinanceTabs />
      {children}
    </main>
  );
}
