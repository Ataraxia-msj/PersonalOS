import { getAffairsProjectsData } from "@/lib/affairs/service";
import { ProjectList } from "@/features/affairs/components/project-list";
export default async function Page() {
  return <ProjectList projects={await getAffairsProjectsData()} />;
}
