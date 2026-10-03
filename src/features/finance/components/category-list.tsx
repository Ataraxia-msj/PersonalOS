"use client";

import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import type { ManagedCategory } from "@/lib/finance/category-management-types";
import styles from "./finance.module.css";

export function CategoryList({ categories }: { categories: ManagedCategory[] }) {
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = categories.filter((item) => !item.isActive).length;
  const visible = showInactive ? categories : categories.filter((item) => item.isActive);
  const section = (type: "expense" | "income", title: string) => {
    const rows = visible.filter((item) => item.categoryType === type);
    return <section className={styles.categorySection} aria-labelledby={`category-${type}`}>
      <h3 id={`category-${type}`}>{title}</h3>
      {rows.length ? rows.map((category) => <article className={styles.categoryRow} key={category.id}>
        <div><span className={styles.accountNameLine}><strong>{category.name}</strong>{!category.isActive ? <small>已停用</small> : null}</span>
          <span>{type === "expense" ? category.defaultBudgetBucketName ? `默认预算 · ${category.defaultBudgetBucketName}` : "未设置默认预算" : "收入分类"}{category.note ? ` · ${category.note}` : ""}</span></div>
        <span>排序 {category.sortOrder}</span>
        <Link href={`/finance/categories/${category.id}/edit`} aria-label={`编辑${category.name}`}>编辑</Link>
      </article>) : <p className={styles.emptyState}>暂无{title}</p>}
    </section>;
  };
  return <section aria-labelledby="category-title" className={styles.moduleSection}>
    <div className={styles.moduleTitleRow}><div><p className={styles.eyebrow}>CATEGORIES</p><h2 id="category-title">分类</h2><p>管理支出与收入分类，以及未来交易使用的默认预算归属</p></div>
      <Link className={styles.accountPrimaryAction} href="/finance/categories/new"><IconPlus aria-hidden="true" size={16} />新增分类</Link></div>
    {inactiveCount ? <div className={styles.accountToolbar}><button type="button" onClick={() => setShowInactive((value) => !value)}>{showInactive ? "隐藏已停用分类" : "显示已停用分类"}<span>{inactiveCount}</span></button></div> : null}
    <div className={styles.categorySections}>{section("expense", "支出分类")}{section("income", "收入分类")}</div>
  </section>;
}
