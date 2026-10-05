import { getAffairsDashboardData } from "@/lib/affairs/service";
import { ProgressDashboard } from "@/features/affairs/components/progress-dashboard";
import { submitAffairsAction } from "./actions";
import {parseCalendarLocation} from '@/features/affairs/calendar-location';
export default async function Page({searchParams}: {searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  const [data,query]=await Promise.all([getAffairsDashboardData(),searchParams??Promise.resolve({})]);
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query))for(const v of Array.isArray(value)?value:value===undefined?[]:[value])params.append(key,v);
  return (
    <ProgressDashboard
      data={data}
      initialLocation={parseCalendarLocation(params,data.today)}
      action={submitAffairsAction}
    />
  );
}
