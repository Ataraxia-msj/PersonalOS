import type {ReactNode} from 'react';
import {QuickAdd} from './quick-add';
import {loadAffairsQuickAddAction,submitAffairsAction} from '@/app/affairs/actions';
import styles from './affairs.module.css';
export function AffairsShell({navigation,children}:{navigation:ReactNode;children:ReactNode}) {return <main className={styles.page}><header className={styles.shellHeader}>{navigation}<QuickAdd action={submitAffairsAction} optionsAction={loadAffairsQuickAddAction}/></header>{children}</main>;}
