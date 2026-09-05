"use client";

import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCreditCard,
  IconHome,
  IconLock,
  IconPencil,
  IconPigMoney,
  IconShoppingBag,
  IconToolsKitchen2,
  IconTrendingUp,
} from "@tabler/icons-react";
import { useState, type CSSProperties, type ComponentType } from "react";

import { formatCurrency } from "../format";
import type { BudgetMonth } from "../types";
import { BudgetSparkline } from "./budget-sparkline";
import styles from "./finance.module.css";

interface BudgetListProps {
  months: BudgetMonth[];
}

const categoryIcons: Record<string, ComponentType<{ size?: number; stroke?: number }>> = {
  固定必要开销: IconHome,
  变动必要开销: IconToolsKitchen2,
  自由消费: IconShoppingBag,
  储蓄: IconPigMoney,
  投资: IconTrendingUp,
  还款: IconCreditCard,
};

function getMonthSummary(month: BudgetMonth) {
  return {
    planned: month.plannedTotal,
    spent: month.actualTotal,
    remaining: month.remainingTotal,
    utilization: month.executionRate,
  };
}

function formatExecutionRate(rate: number | null) {
  if (rate === null) return null;
  return Math.round(rate * 100) / 100;
}

function formatRemainingAmount(value: number) {
  return value < 0 ? `-${formatCurrency(value)}` : formatCurrency(value);
}

export function BudgetList({ months }: BudgetListProps) {
  const [selectedId, setSelectedId] = useState(months[0]?.id ?? "");
  const selectedMonth = months.find((month) => month.id === selectedId) ?? months[0];

  if (!selectedMonth) {
    return <p className={styles.emptyState}>暂无预算数据</p>;
  }

  const summary = getMonthSummary(selectedMonth);

  return (
    <section aria-label="预算管理" className={styles.budgetWorkspace}>
      <aside className={styles.budgetMonthRail}>
        <div className={styles.budgetRailHeading}>
          <h2>预算月份</h2>
        </div>
        <div className={styles.budgetMonthList}>
          {months.map((month) => {
            const monthSummary = getMonthSummary(month);
            const monthRate = formatExecutionRate(monthSummary.utilization);
            const active = month.id === selectedMonth.id;
            return (
              <button
                aria-pressed={active}
                className={active ? styles.budgetMonthActive : styles.budgetMonthButton}
                key={month.id}
                onClick={() => setSelectedId(month.id)}
                type="button"
              >
                <span className={styles.budgetMonthTopline}>
                  <strong>{month.label}</strong>
                  {month.editable ? (
                    <span className={styles.editableLabel}>可编辑</span>
                  ) : (
                    <span className={styles.readOnlyLabel}><IconLock size={12} stroke={1.7} />只读</span>
                  )}
                </span>
                <span className={styles.budgetMonthRate}>执行率 {monthRate === null ? "—" : `${monthRate}%`}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className={styles.budgetDetail}>
        <header className={styles.budgetDetailHeader}>
          <div>
            <h2 id="budget-title">{selectedMonth.editable ? "本月预算" : `${selectedMonth.label}预算`}</h2>
            <p>{selectedMonth.editable ? `${selectedMonth.label} · 按分类追踪预算执行` : "历史预算记录，仅供查看"}</p>
          </div>
          {selectedMonth.editable ? (
            <button aria-label="调整预算" className={styles.adjustBudgetButton} type="button">
              <IconPencil size={15} stroke={1.7} />
              调整预算
            </button>
          ) : (
            <span className={styles.historicalNotice}><IconLock size={14} stroke={1.7} />历史预算 · 只读</span>
          )}
        </header>

        <div className={styles.budgetSummaryGrid}>
          <div><span>预算总额</span><strong>{formatCurrency(summary.planned)}</strong></div>
          <div><span>实际执行</span><strong>{formatCurrency(summary.spent)}</strong></div>
          <div><span>剩余</span><strong>{formatRemainingAmount(summary.remaining)}</strong></div>
          <div><span>执行率</span><strong data-testid="overall-execution-rate">{formatExecutionRate(summary.utilization) === null ? "—" : `${formatExecutionRate(summary.utilization)}%`}</strong></div>
        </div>

        <div className={styles.budgetTableWrap}>
          <div aria-hidden="true" className={styles.budgetTableHeader}>
            <span>分类</span><span>预算 / 实际</span><span>执行率</span><span>较上月</span>
          </div>
          <div className={styles.budgetCategoryRows}>
            {selectedMonth.sections.map((section) => (
              <section aria-labelledby={`budget-section-${section.id}`} className={styles.budgetSection} key={section.id}>
                <h3 className={styles.budgetSectionHeading} id={`budget-section-${section.id}`}>{section.title}</h3>
                {section.categories.map((category) => {
                  const utilization = formatExecutionRate(category.executionRate);
                  const change = category.changeFromPrevious;
                  const increased = change !== null && change > 0;
                  const Icon = categoryIcons[category.category] ?? IconShoppingBag;
                  const progressStyle = {
                    "--budget-progress": `${Math.min(100, Math.max(0, utilization ?? 0))}%`,
                  } as CSSProperties;
                  return (
                    <article className={styles.budgetCategoryRow} key={category.id}>
                      <div className={styles.budgetCategoryIdentity}>
                        <span className={styles.budgetCategoryIcon}><Icon size={18} stroke={1.55} /></span>
                        <strong>{category.category}</strong>
                      </div>
                      <div className={styles.budgetAmounts}>
                        <strong>{formatCurrency(category.limit)} <span>/ {formatCurrency(category.spent)}</span></strong>
                      </div>
                      <div className={styles.budgetUtilization}>
                        <div><span>{utilization === null ? "—" : `${utilization}%`}</span><small>{formatRemainingAmount(category.remaining)} 剩余</small></div>
                        <div
                          aria-label={`${category.category}预算执行率${utilization === null ? "暂无数据" : ` ${utilization}%`}`}
                          aria-valuemax={100}
                          aria-valuemin={0}
                          aria-valuenow={utilization ?? undefined}
                          className={styles.budgetTrack}
                          role="progressbar"
                          style={progressStyle}
                        ><span /></div>
                      </div>
                      <div className={styles.budgetComparison}>
                        <BudgetSparkline values={category.trend} />
                        {change === null ? (
                          <span className={styles.favorableChange}>—</span>
                        ) : (
                          <span className={increased ? styles.increasedChange : styles.favorableChange}>
                            {increased ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
                            {formatCurrency(Math.abs(change))}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
        <p className={styles.budgetFootnote}>预算执行数据来自财务汇总 View；总体执行率待后端补充。</p>
      </div>
    </section>
  );
}
