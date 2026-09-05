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
import type { FinanceOverviewData, TransactionIcon } from "../types";
import styles from "./finance.module.css";
import { TrendChart } from "./trend-chart";

interface FinanceOverviewProps {
  data: FinanceOverviewData;
}

const transactionIcons: Record<TransactionIcon, Icon> = {
  home: IconHome,
  briefcase: IconBriefcase,
  bank: IconBuildingBank,
  train: IconTrain,
  coffee: IconCoffee,
  "shopping-bag": IconShoppingBag,
  utensils: IconToolsKitchen2,
  phone: IconPhone,
  heart: IconHeart,
};

export function FinanceOverview({ data }: FinanceOverviewProps) {
  const recentTransactions = data.transactions.slice(0, 4);
  const trendPeriod = data.cashflow.length > 0
    ? `${data.cashflow[0]?.month}至${data.cashflow.at(-1)?.month}`
    : "暂无月度数据";
  const formatNullableCurrency = (value: number | null, fractionDigits = 0) =>
    value === null ? "—" : formatCurrency(value, fractionDigits);

  return (
    <div className={styles.overviewGrid}>
      <div className={styles.overviewMain}>
        <section aria-labelledby="asset-heading" className={styles.assetSummary}>
          <p id="asset-heading">净资产</p>
          <strong>{formatNullableCurrency(data.netWorth, 2)}</strong>
          <div className={styles.netWorthDetails}>
            <div>
              <span>总资产</span>
              <strong>{formatNullableCurrency(data.totalAssets, 2)}</strong>
            </div>
            <div>
              <span>总负债</span>
              <strong>{formatNullableCurrency(data.totalLiabilities, 2)}</strong>
            </div>
          </div>
          <div className={styles.monthSummary}>
            <div>
              <span className={styles.incomeDot} />
              <p>本月收入</p>
              <strong>{formatNullableCurrency(data.monthlyIncome)}</strong>
            </div>
            <div>
              <span className={styles.expenseDot} />
              <p>本月支出</p>
              <strong>{formatNullableCurrency(data.monthlyExpense)}</strong>
            </div>
          </div>
        </section>

        <section aria-labelledby="trend-heading" className={styles.trendSection}>
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="trend-heading">收支趋势</h2>
              <p>{trendPeriod}</p>
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
          {recentTransactions.length === 0 ? (
            <p className={styles.emptyState}>暂无真实交易数据</p>
          ) : null}
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
