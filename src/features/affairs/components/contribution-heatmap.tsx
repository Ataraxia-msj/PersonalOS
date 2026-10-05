"use client";
import { useState } from "react";
import type { DailyContributionRow } from "@/lib/affairs/types";
import type { AffairsProgress } from "../types";
import { buildContributionGrid, contributionIntensity } from "../contributions";
import { formatAffairsTime } from "../format";
import styles from "./affairs.module.css";
export function ContributionHeatmap({
  rows,
  today,
  progress,
}: {
  rows: DailyContributionRow[];
  today: string;
  progress: AffairsProgress[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const grid = buildContributionGrid(rows, today);
  const entries = selected
    ? progress.filter(
        (p) =>
          new Date(new Date(p.occurredAt).getTime() + 8 * 3600000)
            .toISOString()
            .slice(0, 10) === selected,
      )
    : [];
  return (
    <section>
      <div className={styles.heatmapScroll}>
        <div className={styles.heatmap}>
          <div className={styles.weekdays} aria-hidden="true">
            {["一", "二", "三", "四", "五", "六", "日"].map((v) => (
              <span key={v}>{v}</span>
            ))}
          </div>
          <div className={styles.heatmapWeeks}>
            {grid.map((week, i) => (
              <div className={styles.heatmapWeek} key={week.startDate}>
                <span className={styles.monthLabel}>
                  {i === 0 ||
                  week.startDate.slice(0, 7) !==
                    grid[i - 1].startDate.slice(0, 7)
                    ? Number(week.startDate.slice(5, 7)) + "月"
                    : ""}
                </span>
                {week.days.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    disabled={day.isFuture}
                    aria-label={day.date + " · " + day.count + " 次推进"}
                    aria-pressed={selected === day.date}
                    className={styles.heatmapDay}
                    data-level={contributionIntensity(day.count)}
                    data-today={day.isToday}
                    onClick={() => setSelected(day.date)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {selected ? (
        <div className={styles.dayDetails}>
          <h3>{selected} 的推进</h3>
          {entries.length ? (
            entries.map((p) => (
              <p key={p.id} className={p.voidedAt ? styles.voided : undefined}>
                {p.content}
                <small>
                  {" "}
                  · {formatAffairsTime(p.occurredAt)}
                  {p.voidedAt ? " · 已撤销：" + p.voidedReason : ""}
                </small>
              </p>
            ))
          ) : (
            <p className={styles.muted}>这一天没有推进记录。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
