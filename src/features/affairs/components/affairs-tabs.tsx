"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./affairs.module.css";
const tabs = [
  ["/affairs", "工作台"],
  ["/affairs/inbox", "收集箱"],
  ["/affairs/projects", "项目"],
  ["/affairs/shop", "奖励商店"],
  ["/affairs/coins", "金币记录"],
] as const;
export function AffairsTabs({pendingCount=null}:{pendingCount?:number|null}) {
  const path = usePathname();
  return (
    <nav className={styles.tabs} aria-label="事务导航">
      {tabs.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={
            (href === "/affairs" ? path === href : path.startsWith(href))
              ? "page"
              : undefined
          }
        >
          {label}
          {href === '/affairs/inbox' ? <span className={styles.badge}>{pendingCount??'—'}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
