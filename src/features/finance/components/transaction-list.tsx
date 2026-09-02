"use client";

import { IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { formatShortDate, formatSignedCurrency } from "../format";
import type { Account, Transaction } from "../types";
import styles from "./finance.module.css";

interface TransactionListProps {
  accounts: Account[];
  transactions: Transaction[];
}

export function TransactionList({ accounts, transactions }: TransactionListProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );
  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(transactions.map((transaction) => transaction.category)))],
    [transactions],
  );
  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return transactions.filter((transaction) => {
      const matchesCategory = category === "全部" || transaction.category === category;
      const matchesQuery = `${transaction.merchant}${transaction.category}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query, transactions]);

  return (
    <section aria-labelledby="transaction-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>TRANSACTIONS</p>
          <h2 id="transaction-title">交易记录</h2>
          <p>共 {transactions.length} 笔 mock 交易</p>
        </div>
        <div className={styles.filters}>
          <label className={styles.searchField}>
            <IconSearch aria-hidden="true" size={17} stroke={1.7} />
            <span className="sr-only">搜索交易</span>
            <input
              aria-label="搜索交易"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索商户或类别"
              type="search"
              value={query}
            />
          </label>
          <label className={styles.categoryFilter}>
            <span className="sr-only">交易类别</span>
            <select onChange={(event) => setCategory(event.target.value)} value={category}>
              {categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>交易</th>
              <th>类别</th>
              <th>账户</th>
              <th>日期</th>
              <th>金额</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <th data-label="交易">{transaction.merchant}</th>
                <td data-label="类别">{transaction.category}</td>
                <td data-label="账户">{accountNames.get(transaction.accountId) ?? "未知账户"}</td>
                <td data-label="日期">
                  <time dateTime={transaction.date}>{formatShortDate(transaction.date)}</time>
                </td>
                <td
                  className={transaction.amount > 0 ? styles.positiveAmount : styles.amount}
                  data-label="金额"
                >
                  {formatSignedCurrency(transaction.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredTransactions.length === 0 ? (
        <p className={styles.emptyState}>没有符合条件的交易</p>
      ) : null}
    </section>
  );
}
