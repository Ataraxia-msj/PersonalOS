"use client";

import { IconEdit, IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { formatShortDate, formatTransactionAmount, formatTransferMoney } from "../format";
import type { Transaction } from "../types";
import styles from "./finance.module.css";

interface TransactionListProps {
  transactions: Transaction[];
}

export function TransactionList({ transactions }: TransactionListProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [accountId, setAccountId] = useState("");
  const accounts = useMemo(() => Array.from(new Map(transactions.flatMap((transaction) =>
    (transaction.accounts ?? [{ id: transaction.accountId, name: transaction.accountName }]).map((account) => [account.id, account] as const),
  )).values()), [transactions]);

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(transactions.map((transaction) => transaction.category)))],
    [transactions],
  );
  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return transactions.filter((transaction) => {
      const matchesCategory = category === "全部" || transaction.category === category;
      const matchesAccount = !accountId || (transaction.accounts ?? [{ id: transaction.accountId }]).some((account) => account.id === accountId);
      const matchesQuery = `${transaction.merchant}${transaction.category}${transaction.accountName}`
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery);
      return matchesCategory && matchesQuery && matchesAccount;
    });
  }, [category, query, accountId, transactions]);

  return (
    <section aria-labelledby="transaction-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>TRANSACTIONS</p>
          <h2 id="transaction-title">交易记录</h2>
          <p>共 {transactions.length} 笔交易</p>
        </div>
        <div className={styles.filters}>
          <label className={styles.categoryFilter}>
            <span className="sr-only">交易账户</span>
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">全部账户</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
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
              <th>预算</th>
              <th>账户</th>
              <th>日期</th>
              <th>金额</th>
              <th><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => (
              <tr key={transaction.id}>
                <th data-label="交易">
                  <span className={styles.transactionName}>{transaction.merchant}</span>
                  {transaction.transfer?.legacy ? <details className={styles.transactionDetails}>
                    <summary>原始明细</summary>
                    <p>历史格式：以下为原始账本金额，不推断转账方向或合计金额。</p>
                    <ul>{transaction.transfer.lines?.map((line) => <li key={line.id}>
                      {line.accountName} · {line.amount > 0 ? "+" : line.amount < 0 ? "-" : ""}{formatTransferMoney(line.amount, line.currency)}
                      {line.memo ? ` · ${line.memo}` : ""}
                    </li>)}</ul>
                  </details> : null}
                </th>
                <td data-label="类别">{transaction.category}</td>
                <td data-label="预算">{transaction.budgetLabel}</td>
                <td data-label="账户">{transaction.accountName}</td>
                <td data-label="日期">
                  <time dateTime={transaction.date}>{formatShortDate(transaction.date)}</time>
                </td>
                <td
                  className={!transaction.transfer && transaction.amount !== null && transaction.amount > 0 ? styles.positiveAmount : styles.amount}
                  data-label="金额"
                >
                  {formatTransactionAmount(transaction)}
                </td>
                <td className={styles.transactionActions} data-label="操作">
                  {transaction.editable ? (
                    <Link
                      aria-label={`修改${transaction.merchant}`}
                      className={styles.transactionEditLink}
                      href={`/finance/transactions/${transaction.id}/edit`}
                    >
                      <IconEdit aria-hidden="true" size={16} stroke={1.7} />
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredTransactions.length === 0 ? (
        <p className={styles.emptyState}>
          {transactions.length === 0 ? "暂无真实交易数据" : "没有符合条件的交易"}
        </p>
      ) : null}
    </section>
  );
}
