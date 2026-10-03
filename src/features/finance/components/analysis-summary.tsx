import { formatCurrency, formatSignedCurrency } from "../format";
import type { AnalysisComparison, FinanceAnalysisPageData } from "../types";
import styles from "./finance.module.css";

function Comparison({ label, comparison }: { label: string; comparison: AnalysisComparison }) {
  return <span className={styles[`analysisTone_${comparison.tone}`]}>{label} {comparison.rate === null ? "—" : `${comparison.rate > 0 ? "+" : ""}${comparison.rate}%`}</span>;
}

export function AnalysisSummary({ summary }: { summary: NonNullable<FinanceAnalysisPageData["summary"]> }) {
  const metrics = [
    { label: "实际收入", metric: summary.income },
    { label: "实际支出", metric: summary.expense },
    { label: "现金结余", metric: summary.balance },
  ];
  return (
    <section aria-label="月度核心指标" className={styles.analysisSummaryGrid}>
      {metrics.map(({ label, metric }) => (
        <article className={styles.analysisMetricCard} key={label}>
          <span>{label}</span><strong>{metric.value === null ? "—" : formatCurrency(metric.value)}</strong>
          <div><Comparison comparison={metric.mom} label="环比" /><Comparison comparison={metric.yoy} label="同比" /></div>
        </article>
      ))}
      <article className={styles.analysisMetricCard}><span>储蓄率</span><strong>{summary.savingRate === null ? "—" : `${summary.savingRate}%`}</strong><small>较上月 {summary.savingRateMom === null ? "—" : `${summary.savingRateMom > 0 ? "+" : ""}${summary.savingRateMom} 个百分点`}</small></article>
      <article className={styles.analysisMetricCard}><span>预算执行率</span><strong className={(summary.executionRate ?? 0) > 100 ? styles.analysisWarningValue : undefined}>{summary.executionRate === null ? "—" : `${summary.executionRate}%`}</strong><small>较上月 {summary.executionRateMom === null ? "—" : `${summary.executionRateMom > 0 ? "+" : ""}${summary.executionRateMom} 个百分点`}</small></article>
      <article className={styles.analysisMetricCard}><span>月末净资产</span><strong>{summary.netWorth === null ? "—" : formatCurrency(summary.netWorth)}</strong><small>本月变化 {summary.netWorthChange === null ? "—" : formatSignedCurrency(summary.netWorthChange)}</small></article>
    </section>
  );
}
