import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { FinanceTabs } from "@/features/finance/components/finance-tabs";
import styles from "@/features/finance/components/finance.module.css";

export const dynamic = "force-dynamic";

export default function FinanceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className={styles.financePage}>
      <header className={styles.financeHeader}>
        <h1>财务总览</h1>
        <Link className={styles.addTransaction} href="/finance/transactions/new">
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
