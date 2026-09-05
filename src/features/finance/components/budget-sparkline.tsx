"use client";

import { Line, LineChart } from "recharts";

import styles from "./finance.module.css";

interface BudgetSparklineProps {
  values: number[];
}

export function BudgetSparkline({ values }: BudgetSparklineProps) {
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div aria-hidden="true" className={styles.budgetSparkline}>
      <LineChart data={data} height={34} margin={{ bottom: 2, left: 2, right: 2, top: 2 }} width={108}>
        <Line
          dataKey="value"
          dot={false}
          isAnimationActive={false}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={1.6}
          type="monotone"
        />
      </LineChart>
    </div>
  );
}
