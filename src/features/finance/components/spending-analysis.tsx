import type { FinanceAnalysisPageData } from "../types";
import { AnalysisBudgetSection } from "./analysis-budget-section";
import { AnalysisCategorySection } from "./analysis-category-section";
import { AnalysisInsights } from "./analysis-insights";
import { AnalysisSummary } from "./analysis-summary";
import { AnalysisTrendChart } from "./analysis-trend-chart";
import styles from "./finance.module.css";

export function SpendingAnalysis({ data }: { data: FinanceAnalysisPageData }) {
  return (
    <section aria-labelledby="analysis-title" className={styles.analysisDashboard}>
      <header className={styles.analysisHeader}>
        <div>
          <p className={styles.eyebrow}>ANALYSIS</p>
          <h2 id="analysis-title">财务分析</h2>
          <p>全部指标来自财务 View；建议仅基于可解释规则。</p>
        </div>
        {data.availableMonths.length > 0 ? (
          <form action="/finance/analysis" className={styles.analysisMonthForm} method="get">
            <label htmlFor="analysis-month">分析月份</label>
            <select defaultValue={data.selectedMonth ?? ""} id="analysis-month" name="month">
              {data.availableMonths.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <button type="submit">查看</button>
          </form>
        ) : null}
      </header>
      {!data.summary || !data.selectedMonth ? (
        <p className={styles.emptyState}>暂无可分析的月度财务数据</p>
      ) : (
        <>
          <AnalysisSummary snapshot={data.snapshot} summary={data.summary} />
          <AnalysisTrendChart points={data.trend} />
          <div className={styles.analysisTwoColumn}>
            <AnalysisBudgetSection sections={data.budgetSections} />
            <AnalysisCategorySection categories={data.categories} />
          </div>
          <AnalysisInsights insights={data.insights} />
        </>
      )}
    </section>
  );
}
