import {
  IconBuildingBank,
  IconCreditCard,
  IconPigMoney,
  IconTrendingUp,
  type Icon,
} from "@tabler/icons-react";

import { formatCurrency } from "../format";
import type { Account, AccountType } from "../types";
import styles from "./finance.module.css";

interface AccountListProps {
  accounts: Account[];
}

const accountIcons: Record<AccountType, Icon> = {
  cash: IconBuildingBank,
  savings: IconPigMoney,
  investment: IconTrendingUp,
  credit: IconCreditCard,
};

const accountTypeLabels: Record<AccountType, string> = {
  cash: "现金",
  savings: "储蓄",
  investment: "投资",
  credit: "负债",
};

export function AccountList({ accounts }: AccountListProps) {
  return (
    <section aria-labelledby="account-title" className={styles.moduleSection}>
      <div className={styles.moduleTitleRow}>
        <div>
          <p className={styles.eyebrow}>ACCOUNTS</p>
          <h2 id="account-title">账户</h2>
          <p>资产与负债的统一视图</p>
        </div>
      </div>
      <div className={styles.accountRows}>
        {accounts.map((account) => {
          const AccountIcon = accountIcons[account.type];
          return (
            <article className={styles.accountRow} key={account.id}>
              <span className={styles.accountIcon}>
                <AccountIcon aria-hidden="true" size={21} stroke={1.6} />
              </span>
              <div>
                <strong>{account.name}</strong>
                <span>{account.institution} · {accountTypeLabels[account.type]}</span>
              </div>
              <strong className={account.balance < 0 ? styles.negativeBalance : styles.accountBalance}>
                {account.balance < 0 ? "-" : ""}{formatCurrency(account.balance, 2)}
              </strong>
            </article>
          );
        })}
      </div>
      {accounts.length === 0 ? <p className={styles.emptyState}>暂无账户数据</p> : null}
    </section>
  );
}
