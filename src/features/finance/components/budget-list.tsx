import type { CSSProperties } from "react";

import { formatCurrency } from "../format";
import type { BudgetCategory } from "../types";
import styles from "./finance.module.css";

interface BudgetListProps {
  budgets: BudgetCategory[];
}

export function BudgetList({ budgets }: BudgetListProps) {
  return (
    <section aria-labelledby="budget-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>BUDGET</p>
          <h2 id="budget-title">本月预算</h2>
          <p>按类别观察预算使用情况</p>
        </div>
      </div>
      <div className={styles.budgetRows}>
        {budgets.map((budget) => {
          const utilization = Math.min(100, Math.round((budget.spent / budget.limit) * 100));
          const style = { "--budget-progress": `${utilization}%` } as CSSProperties;
          return (
            <article className={styles.budgetRow} key={budget.id}>
              <div className={styles.budgetMeta}>
                <div>
                  <strong>{budget.category}</strong>
                  <span>{formatCurrency(budget.spent)} / {formatCurrency(budget.limit)}</span>
                </div>
                <strong>{utilization}%</strong>
              </div>
              <div
                aria-label={`${budget.category}预算使用 ${utilization}%`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={utilization}
                className={styles.budgetTrack}
                role="progressbar"
                style={style}
              >
                <span />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
