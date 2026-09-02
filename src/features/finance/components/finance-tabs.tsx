"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./finance.module.css";

const tabs = [
  { href: "/finance", label: "概览" },
  { href: "/finance/transactions", label: "交易" },
  { href: "/finance/budget", label: "预算" },
  { href: "/finance/accounts", label: "账户" },
  { href: "/finance/analysis", label: "分析" },
] as const;

export function FinanceTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="财务模块" className={styles.tabs}>
      {tabs.map((tab) => {
        const active = tab.href === "/finance" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? styles.tabActive : styles.tab}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
