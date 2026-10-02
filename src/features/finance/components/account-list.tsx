"use client";

import {
  IconBuildingBank,
  IconCreditCard,
  IconPigMoney,
  IconPlus,
  IconTrendingUp,
  type Icon,
} from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";

import type { ManagedAccount } from "@/lib/finance/account-management-types";

import { formatCurrency } from "../format";
import styles from "./finance.module.css";
import calibration from "./reconciliation.module.css";

interface AccountListProps {
  accounts: ManagedAccount[];
}

const accountIcons: Record<ManagedAccount["accountType"], Icon> = {
  bank: IconBuildingBank,
  cash: IconBuildingBank,
  consumer_credit: IconCreditCard,
  credit_card: IconCreditCard,
  ewallet: IconBuildingBank,
  investment: IconTrendingUp,
  loan: IconCreditCard,
  money_market: IconPigMoney,
  other: IconBuildingBank,
  payable: IconCreditCard,
  receivable: IconBuildingBank,
  time_deposit: IconPigMoney,
  wallet_pocket: IconPigMoney,
};

const accountTypeLabels: Record<ManagedAccount["accountType"], string> = {
  bank: "银行账户", cash: "现金", consumer_credit: "消费信贷", credit_card: "信用卡",
  ewallet: "电子钱包", investment: "投资账户", loan: "贷款", money_market: "货币基金",
  other: "其他", payable: "应付款", receivable: "应收款", time_deposit: "定期存款",
  wallet_pocket: "钱包子账户",
};

export function AccountList({ accounts }: AccountListProps) {
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = accounts.filter((account) => !account.isActive).length;
  const visibleAccounts = showInactive ? accounts : accounts.filter((account) => account.isActive);

  return (
    <section aria-labelledby="account-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>ACCOUNTS</p>
          <h2 id="account-title">账户</h2>
          <p>资产与负债的统一视图</p>
        </div>
        <Link className={styles.accountPrimaryAction} href="/finance/accounts/new">
          <IconPlus aria-hidden="true" size={16} stroke={1.7} />
          新增账户
        </Link>
      </div>

      {inactiveCount > 0 ? (
        <div className={styles.accountToolbar}>
          <button aria-label={showInactive ? "隐藏已停用账户" : "显示已停用账户"}
            type="button" onClick={() => setShowInactive((value) => !value)}>
            {showInactive ? "隐藏已停用账户" : "显示已停用账户"}
            <span>{inactiveCount}</span>
          </button>
        </div>
      ) : null}

      <div className={styles.accountRows}>
        {visibleAccounts.map((account) => {
          const AccountIcon = accountIcons[account.accountType];
          return (
            <article className={`${styles.accountRow} ${!account.isActive ? styles.accountRowInactive : ""}`} key={account.id}>
              <span className={styles.accountIcon}>
                <AccountIcon aria-hidden="true" size={21} stroke={1.6} />
              </span>
              <div>
                <span className={styles.accountNameLine}>
                  <strong>{account.name}</strong>
                  {!account.isActive ? <small>已停用</small> : null}
                </span>
                <span>{account.institution || "未设置机构"} · {accountTypeLabels[account.accountType]} · {account.currency}</span>
              </div>
              <div className={calibration.accountActions}>
                {account.estimatedBalance === null ? (
                  <strong className={styles.accountBalanceMissing}>暂无余额数据</strong>
                ) : (
                  <strong className={account.estimatedBalance < 0 ? styles.negativeBalance : styles.accountBalance}>
                    {account.estimatedBalance < 0 ? "-" : ""}{formatCurrency(account.estimatedBalance, 2)}
                  </strong>
                )}
                <span className={styles.accountLinks}>
                  <Link className={calibration.accountLink} href={`/finance/accounts/${account.id}/edit`} aria-label={`编辑${account.name}`}>编辑</Link>
                  <Link className={calibration.accountLink} href={`/finance/accounts/${account.id}/reconcile`} aria-label={`校准${account.name}余额`}>校准 / 历史</Link>
                </span>
              </div>
            </article>
          );
        })}
      </div>
      {visibleAccounts.length === 0 ? <p className={styles.emptyState}>暂无账户数据</p> : null}
    </section>
  );
}
