import {notFound} from 'next/navigation';
import {getAffairsFormData} from '@/lib/affairs/service';
import {ProjectForm} from '@/features/affairs/components/project-form';
import {submitAffairsAction} from '../../../actions';
export default async function Page({params}:{params:Promise<{projectId:string}>}){
 const {projectId}=await params;
 const data=await getAffairsFormData('project',projectId);
 if(!data||data.resource!=='project')notFound();
 return <ProjectForm data={data} mode="edit" action={submitAffairsAction}/>;
}
