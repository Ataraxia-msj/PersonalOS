import { formatCurrency } from "../format";
import type { CategorySpending } from "../types";
import styles from "./finance.module.css";

interface SpendingAnalysisProps {
  spending: CategorySpending[];
}

export function SpendingAnalysis({ spending }: SpendingAnalysisProps) {
  const maximum = spending[0]?.amount ?? 1;
  const total = spending.reduce((sum, item) => sum + item.amount, 0);

  return (
    <section aria-labelledby="analysis-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>ANALYSIS</p>
          <h2 id="analysis-title">消费分析</h2>
          <p>基于当前 mock 交易的类别分布</p>
        </div>
        <div className={styles.analysisTotal}>
          <span>样本支出</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      <div className={styles.analysisRows}>
        {spending.map((item) => (
          <article className={styles.analysisRow} key={item.category}>
            <div>
              <strong>{item.category}</strong>
              <span>{Math.round((item.amount / total) * 100)}%</span>
            </div>
            <div className={styles.analysisBar}>
              <span style={{ width: `${(item.amount / maximum) * 100}%` }} />
            </div>
            <strong>{formatCurrency(item.amount)}</strong>
          </article>
        ))}
      </div>
      <aside className={styles.insightNote}>
        <strong>Agent 观察</strong>
        <p>居住是样本中的最大支出项；日常消费金额较分散，适合继续通过交易分类完善分析。</p>
      </aside>
    </section>
  );
}
