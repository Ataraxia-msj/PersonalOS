import { getAffairsTaskListData } from "@/lib/affairs/service";
import { TaskList } from "@/features/affairs/components/task-list";
import { submitAffairsAction } from "../actions";
export default async function Page() {
  const data = await getAffairsTaskListData();
  return <TaskList {...data} action={submitAffairsAction} />;
}
