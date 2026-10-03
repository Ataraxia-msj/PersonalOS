import Link from "next/link";
import { IconCoin, IconArrowRight } from "@tabler/icons-react";
import styles from "./affairs.module.css";
export function CoinBalance({
  balance,
  shopLink = false,
}: {
  balance: number;
  shopLink?: boolean;
}) {
  return (
    <div className={styles.balance}>
      <IconCoin aria-hidden="true" size={25} stroke={1.6} />
      <strong>{balance.toLocaleString("zh-CN")} 金币</strong>
      {shopLink ? (
        <Link href="/affairs/shop">
          奖励商店 <IconArrowRight aria-hidden="true" size={16} />
        </Link>
      ) : null}
    </div>
  );
}
