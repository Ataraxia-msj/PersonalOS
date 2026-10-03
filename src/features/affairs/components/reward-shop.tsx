"use client";
import { useState } from "react";
import Link from "next/link";
import { IconGift, IconCoin, IconPlus } from "@tabler/icons-react";
import type { AffairsShopData, AffairsReward } from "../types";
import { CoinBalance } from "./coin-balance";
import { ConfirmationPanel } from "./confirmation-panel";
import { RedemptionConfirmation } from "./redemption-confirmation";
import { RedemptionList } from "./redemption-list";
import type { AffairsAction } from "./action-form";
import styles from "./affairs.module.css";
export function RewardShop({
  data,
  action,
}: {
  data: AffairsShopData;
  action: AffairsAction;
}) {
  const [selected, setSelected] = useState<AffairsReward | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [version, setVersion] = useState(0);
  const rewards = data.rewards.filter((r) => showInactive || r.isActive);
  return (
    <>
      <header className={styles.sectionHeader}>
        <div>
          <h1>奖励商店</h1>
          <p className={styles.muted}>用积累兑换喜欢的奖励</p>
        </div>
        <div className={styles.rowActions}>
          <CoinBalance balance={data.balance} />
          <Link className={styles.primaryButton} href="/affairs/rewards/new">
            添加奖励
          </Link>
        </div>
      </header>
      <p className={styles.muted}>商品和金币价格由你自己设置。</p>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        显示下架商品
      </label>
      <div className={styles.cards}>
        {rewards.map((r) => (
          <article className={styles.card} key={r.id}>
            <header className={styles.cardHeader}>
              <IconGift
                className={styles.rewardIcon}
                aria-hidden="true"
                size={48}
                stroke={1.3}
              />
              <Link
                className={styles.textButton}
                href={"/affairs/rewards/" + r.id + "/edit"}
              >
                编辑
              </Link>
            </header>
            <h2>{r.name}</h2>
            <p className={styles.muted}>{r.description || "你添加的奖励"}</p>
            <p className={styles.rewardPrice}>
              <IconCoin aria-hidden="true" size={24} />
              {r.priceCoins} 金币
            </p>
            <button
              className={styles.shopButton}
              disabled={!r.isActive}
              onClick={() => {
                setSelected(r);
                setVersion((v) => v + 1);
              }}
            >
              {r.isActive ? "兑换" : "已下架"}
            </button>
          </article>
        ))}
      </div>
      <Link className={styles.addReward} href="/affairs/rewards/new">
        <IconPlus aria-hidden="true" size={30} />
        <span>
          添加奖励<small>名称、说明和金币价格都由你决定</small>
        </span>
      </Link>
      {rewards.length === 0 ? (
        <p className={styles.muted}>
          还没有上架奖励，不预设商品。先添加一份你真正期待的奖励。
        </p>
      ) : null}
      <RedemptionList redemptions={data.redemptions} action={action} />
      <p className={styles.muted}>
        金币是虚拟激励，不是人民币。兑换不会自动购买或写入财务交易。
      </p>
      <ConfirmationPanel
        open={selected !== null}
        title="确认兑换"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <RedemptionConfirmation
            key={version}
            reward={selected}
            balance={data.balance}
            action={action}
            onReconfirm={() => {
              const latest = data.rewards.find((r) => r.id === selected.id);
              if (latest) {
                setSelected(latest);
                setVersion((v) => v + 1);
              }
            }}
          />
        ) : null}
      </ConfirmationPanel>
    </>
  );
}
