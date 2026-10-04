"use client";
import styles from '@/features/affairs/components/affairs.module.css';
export default function ErrorPage({reset}:{reset:()=>void}) {return <section className={styles.notice} role="alert"><h2>收集箱暂不可用</h2><p>请稍后重试。</p><button type="button" className={styles.secondaryButton} onClick={reset}>重新读取</button></section>;}
