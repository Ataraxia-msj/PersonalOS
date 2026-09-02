"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonthlyCashflow } from "../types";
import styles from "./finance.module.css";

interface TrendChartProps {
  data: MonthlyCashflow[];
}

export function TrendChart({ data }: TrendChartProps) {
  const first = data[0];
  const last = data.at(-1);
  const summary =
    first && last
      ? `${first.month.replace("月", "")}月至${last.month}收入由 ¥${first.income.toLocaleString("zh-CN")} 变化为 ¥${last.income.toLocaleString("zh-CN")}，支出由 ¥${first.expense.toLocaleString("zh-CN")} 变化为 ¥${last.expense.toLocaleString("zh-CN")}。`
      : "暂无收支趋势数据。";

  return (
    <div className={styles.chartFrame}>
      <p className="sr-only">{summary}</p>
      <div aria-hidden="true" className={styles.chartCanvas}>
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ top: 20, right: 14, bottom: 2, left: 0 }}>
            <CartesianGrid stroke="rgba(236, 231, 223, 0.09)" strokeDasharray="4 5" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="month"
              tick={{ fill: "#9d978e", fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "#746e66", fontSize: 11 }}
              tickFormatter={(value: number) => `${value / 1000}k`}
              tickLine={false}
              width={42}
            />
            <Tooltip
              contentStyle={{
                background: "#292622",
                border: "1px solid rgba(236, 231, 223, 0.14)",
                borderRadius: "10px",
                color: "#ece7df",
              }}
              formatter={(value) => [`¥${Number(value).toLocaleString("zh-CN")}`, ""]}
              labelStyle={{ color: "#9d978e" }}
            />
            <Line
              dataKey="income"
              dot={{ fill: "#d97757", r: 4, strokeWidth: 0 }}
              name="收入"
              stroke="#d97757"
              strokeWidth={2.2}
              type="monotone"
            />
            <Line
              dataKey="expense"
              dot={{ fill: "#b7a18b", r: 3.5, strokeWidth: 0 }}
              name="支出"
              stroke="#b7a18b"
              strokeWidth={1.8}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>逐月收支趋势</caption>
        <thead>
          <tr>
            <th>月份</th>
            <th>收入</th>
            <th>支出</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.month}>
              <th>{point.month}</th>
              <td>{point.income}</td>
              <td>{point.expense}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
