import { formatCurrency } from "../format";
import type { BudgetSection } from "../types";
import styles from "./finance.module.css";

export function AnalysisBudgetSection({ sections }: { sections: BudgetSection[] }) {
  return <section className={styles.analysisPanel}><div className={styles.analysisSectionTitle}><div><h3>预算执行</h3><p>消费预算与资金安排</p></div></div>
    {sections.length === 0 ? <p className={styles.analysisEmpty}>该月暂无预算数据</p> : sections.map((section) => <div className={styles.analysisBudgetGroup} key={section.id}><h4>{section.title}</h4>{section.categories.map((category) => <div className={styles.analysisBudgetRow} key={category.id}><div><strong>{category.category}</strong><span>{formatCurrency(category.spent)} / {formatCurrency(category.limit)}</span></div><b className={(category.executionRate ?? 0) > 100 ? styles.analysisWarningValue : undefined}>{category.executionRate === null ? "—" : `${category.executionRate}%`}</b></div>)}</div>)}
  </section>;
}
