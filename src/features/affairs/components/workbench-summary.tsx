import type {summarizeWorkbench} from '@/lib/affairs/workbench';
import styles from './affairs.module.css';
export function WorkbenchSummary({summary}:{summary:ReturnType<typeof summarizeWorkbench>}) {
 return <section className={styles.summaryGrid} aria-label="事务数据总览">{[['待办行动',summary.pendingTaskCount],['进行中项目',summary.activeProjectCount],['近 7 天完成',summary.completedLastSevenDays],['金币余额',summary.balance]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>;
}
