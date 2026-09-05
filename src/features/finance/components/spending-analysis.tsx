import { formatCurrency } from "../format";
import type { CategorySpending } from "../types";
import styles from "./finance.module.css";

interface SpendingAnalysisProps {
  spending: CategorySpending[];
}

export function SpendingAnalysis({ spending }: SpendingAnalysisProps) {
  const maximum = Math.max(...spending.map((item) => item.amount), 1);
  const total = spending.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section aria-labelledby="analysis-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>ANALYSIS</p>
          <h2 id="analysis-title">月度资金分析</h2>
          <p>来自月度财务汇总 View 的实际执行结构</p>
        </div>
        <div className={styles.analysisTotal}>
          <span>实际安排</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      {spending.length === 0 ? (
        <p className={styles.emptyState}>暂无月度汇总数据</p>
      ) : null}
      <div className={styles.analysisRows}>
        {spending.map((item) => (
          <article className={styles.analysisRow} key={item.category}>
            <div>
              <strong>{item.category}</strong>
              <span>{total === 0 ? 0 : Math.round((item.amount / total) * 100)}%</span>
            </div>
            <div className={styles.analysisBar}>
              <span style={{ width: `${(item.amount / maximum) * 100}%` }} />
            </div>
            <strong>{formatCurrency(item.amount)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
