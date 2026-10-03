import type { AnalysisInsight } from "../types";
import styles from "./finance.module.css";

export function AnalysisInsights({ insights }: { insights: AnalysisInsight[] }) {
  return <section className={styles.analysisPanel}><div className={styles.analysisSectionTitle}><div><h3>提醒与建议</h3><p>仅展示由真实数据和固定阈值支持的判断</p></div></div>
    {insights.length === 0 ? <p className={styles.analysisEmpty}>本月暂无需要提醒的异常</p> : <div className={styles.analysisInsightGrid}>{insights.map((insight) => <article className={insight.severity === "warning" ? styles.analysisInsightWarning : styles.analysisInsightReminder} key={insight.id}><span>{insight.severity === "warning" ? "需要关注" : "提醒"}</span><h4>{insight.title}</h4><p>{insight.message}</p></article>)}</div>}
  </section>;
}
