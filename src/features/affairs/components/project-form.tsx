"use client";
import { ActionForm, type AffairsBaseFormProps } from "./action-form";
import styles from "./affairs.module.css";
import {ProjectFields} from "./entity-fields";
export function ProjectForm({
  data,
  mode,
  action,
  defaultMainlineId=null,
}: AffairsBaseFormProps<"project"> & {defaultMainlineId?:string|null}) {
  const v = data.initialValues;
  const blocked = v?.status === "archived" || v?.status === "completed";
  return (
    <section className={styles.formPage}>
      <h1>{mode === "create" ? "新建项目" : "编辑项目"}</h1>
      {blocked ? <p>请先恢复项目，再编辑内容。</p> : null}
      <ActionForm
        action={action}
        operation={
          mode === "create"
            ? "create_affairs_project"
            : "update_affairs_project"
        }
        identity={v ?? undefined}
        submitLabel="保存项目"
        disabled={blocked}
      >
        <ProjectFields initialValues={v??{mainlineId:defaultMainlineId}} mainlines={data.mainlines}/>
      </ActionForm>
    </section>
  );
}
