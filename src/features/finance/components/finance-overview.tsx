import {
  IconBriefcase,
  IconBuildingBank,
  IconCoffee,
  IconHeart,
  IconHome,
  IconPhone,
  IconShoppingBag,
  IconTrain,
  IconToolsKitchen2,
  type Icon,
} from "@tabler/icons-react";
import Link from "next/link";

import { formatCurrency, formatShortDate, formatSignedCurrency } from "../format";
import { getFinanceSummary, getRecentTransactions } from "../selectors";
import type { FinanceDataset, TransactionIcon } from "../types";
import styles from "./finance.module.css";
import { TrendChart } from "./trend-chart";

interface FinanceOverviewProps {
  data: FinanceDataset;
}

const transactionIcons: Record<TransactionIcon, Icon> = {
  home: IconHome,
  briefcase: IconBriefcase,
  train: IconTrain,
  coffee: IconCoffee,
  "shopping-bag": IconShoppingBag,
  utensils: IconToolsKitchen2,
  phone: IconPhone,
  heart: IconHeart,
};

export function FinanceOverview({ data }: FinanceOverviewProps) {
  const summary = getFinanceSummary(data);
  const recentTransactions = getRecentTransactions(data, 4);

  return (
    <div className={styles.overviewGrid}>
      <div className={styles.overviewMain}>
        <section aria-labelledby="asset-heading" className={styles.assetSummary}>
          <p id="asset-heading">总资产</p>
          <strong>{formatCurrency(summary.totalAssets, 2)}</strong>
          <div className={styles.monthSummary}>
            <div>
              <span className={styles.incomeDot} />
              <p>本月收入</p>
              <strong>{formatCurrency(summary.monthlyIncome)}</strong>
            </div>
            <div>
              <span className={styles.expenseDot} />
              <p>本月支出</p>
              <strong>{formatCurrency(summary.monthlyExpense)}</strong>
            </div>
          </div>
        </section>

        <section aria-labelledby="trend-heading" className={styles.trendSection}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="trend-heading">收支趋势</h2>
              <p>2026 年 3 月至 9 月</p>
            </div>
            <div aria-label="图例" className={styles.legend}>
              <span><i className={styles.legendIncome} />收入</span>
              <span><i className={styles.legendExpense} />支出</span>
            </div>
          </div>
          <TrendChart data={data.cashflow} />
        </section>
      </div>

      <aside aria-labelledby="recent-heading" className={styles.recentPanel}>
        <h2 id="recent-heading">近期交易</h2>
        <div className={styles.recentList}>
          {recentTransactions.map((transaction) => {
            const TransactionIcon = transactionIcons[transaction.icon] ?? IconBuildingBank;
            return (
              <article className={styles.recentRow} key={transaction.id}>
                <span className={styles.transactionIcon}>
                  <TransactionIcon aria-hidden="true" size={21} stroke={1.5} />
                </span>
                <div>
                  <strong>{transaction.merchant}</strong>
                  <time dateTime={transaction.date}>{formatShortDate(transaction.date)}</time>
                </div>
                <span className={transaction.amount > 0 ? styles.positiveAmount : styles.amount}>
                  {formatSignedCurrency(transaction.amount)}
                </span>
              </article>
            );
          })}
        </div>
        <Link className={styles.viewAll} href="/finance/transactions">
          查看全部交易 <span aria-hidden="true">→</span>
        </Link>
      </aside>
    </div>
  );
}
