import type { ReactNode } from "react";
import { AffairsTabs } from "@/features/affairs/components/affairs-tabs";
import styles from "@/features/affairs/components/affairs.module.css";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <AffairsTabs />
      {children}
    </main>
  );
}
