import {getAffairsNavigationData} from '@/lib/affairs/service';
import {AffairsTabs} from './affairs-tabs';
export async function AffairsNavigation(){const data=await getAffairsNavigationData();return <AffairsTabs pendingCount={data.pendingCount}/>;}
