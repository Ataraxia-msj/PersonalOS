'use client';import Link from 'next/link';import styles from '@/features/affairs/components/affairs.module.css';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className={styles.notice}><h1>事务数据暂不可用</h1><p>请确认事务模块的两个 SQL migration 已执行。查询异常不会回退示例数据。</p><button className={styles.primaryButton} onClick={reset}>重新读取</button> <Link href="/affairs">返回推进</Link></section>;}
