"use client";

import type { AnalysisTrendPoint } from "../types";
import styles from "./finance.module.css";

export function AnalysisTrendChart({ points }: { points: AnalysisTrendPoint[] }) {
  if (points.length === 0) return <section className={styles.analysisPanel}><h3>12 个月趋势</h3><p className={styles.analysisEmpty}>暂无趋势数据</p></section>;
  const maximum = Math.max(1, ...points.flatMap((point) => [point.income, point.expense, Math.abs(point.balance)]));
  return (
    <section className={styles.analysisPanel}>
      <div className={styles.analysisSectionTitle}><div><h3>12 个月趋势</h3><p>收入、支出与现金结余</p></div><div className={styles.analysisLegend}><span>收入</span><span>支出</span><span>结余</span></div></div>
      <div aria-label="近 12 个月收入、支出与结余趋势" className={styles.analysisChart} role="img">
        {points.map((point) => (
          <div className={styles.analysisChartMonth} key={point.month} title={`${point.label}：收入 ${point.income}，支出 ${point.expense}，结余 ${point.balance}`}>
            <div className={styles.analysisChartBars}>
              <i className={styles.analysisIncomeBar} style={{ height: `${point.income / maximum * 100}%` }} />
              <i className={styles.analysisExpenseBar} style={{ height: `${point.expense / maximum * 100}%` }} />
              <i className={point.balance < 0 ? styles.analysisNegativeBar : styles.analysisBalanceBar} style={{ height: `${Math.abs(point.balance) / maximum * 100}%` }} />
            </div>
            <span>{point.month.slice(5, 7)}月</span>
          </div>
        ))}
      </div>
    </section>
  );
}
