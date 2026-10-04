import type { ReactNode } from "react";
import {Suspense} from 'react';
import {AffairsNavigation} from '@/features/affairs/components/affairs-navigation';
import {AffairsShell} from '@/features/affairs/components/affairs-shell';
import { AffairsTabs } from "@/features/affairs/components/affairs-tabs";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AffairsShell navigation={<Suspense fallback={<AffairsTabs/>}><AffairsNavigation/></Suspense>}>{children}</AffairsShell>
  );
}
