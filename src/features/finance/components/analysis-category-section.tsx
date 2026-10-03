import { formatCurrency } from "../format";
import type { AnalysisCategory } from "../types";
import styles from "./finance.module.css";

export function AnalysisCategorySection({ categories }: { categories: AnalysisCategory[] }) {
  return <section className={styles.analysisPanel}><div className={styles.analysisSectionTitle}><div><h3>消费分类</h3><p>包含明确标记为不计入预算的真实消费</p></div></div>
    {categories.length === 0 ? <p className={styles.analysisEmpty}>该月暂无分类消费</p> : <div>{categories.map((category) => <div className={styles.analysisCategoryRow} key={category.id}><span>{category.rank}</span><div><strong>{category.name}</strong><small>{category.transactionCount} 笔 · {category.share === null ? "占比 —" : `${category.share}%`}</small></div><b>{formatCurrency(category.amount)}</b></div>)}</div>}
  </section>;
}
