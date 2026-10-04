import {getAffairsInboxData} from '@/lib/affairs/service';
import type {InboxStatus} from '@/lib/affairs/inbox-types';
import {InboxWorkspace} from '@/features/affairs/components/inbox-workspace';
import {submitAffairsAction} from '../actions';
export default async function Page({searchParams}:{searchParams:Promise<{status?:string;entryId?:string}>}) {const params=await searchParams;const status:InboxStatus=params.status==='resolved'||params.status==='discarded'?params.status:'pending';return <InboxWorkspace data={await getAffairsInboxData(status)} status={status} entryId={params.entryId} action={submitAffairsAction}/>;}
