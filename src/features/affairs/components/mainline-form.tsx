"use client";
import { ActionForm, type AffairsBaseFormProps } from "./action-form";
import styles from "./affairs.module.css";
export function MainlineForm({
  data,
  mode,
  action,
  embedded=false,
}: AffairsBaseFormProps<"mainline"> & {embedded?:boolean}) {
  const v = data.initialValues;
  return (
    <section className={styles.formPage}>
      {!embedded?<h1>{mode === "create" ? "新建主线" : "编辑主线"}</h1>:null}
      <ActionForm
        action={action}
        operation={
          mode === "create"
            ? "create_affairs_mainline"
            : "update_affairs_mainline"
        }
        identity={v ?? undefined}
        submitLabel="保存主线"
        resetOnSuccess={embedded}
        receiptDisplay={embedded?'none':'full'}
      >
        <label>
          主线名称
          <input name="name" required defaultValue={v?.name ?? ""} />
        </label>
        <label>
          说明
          <textarea name="description" defaultValue={v?.description ?? ""} />
        </label>
        <label>
          显示顺序
          <input
            name="sort_order"
            type="number"
            min="0"
            step="1"
            defaultValue={v?.sortOrder ?? 0}
          />
        </label>
      </ActionForm>
      {v ? (
        <div className={styles.section}>
          <h2>主线状态</h2>
          {(["active", "paused", "archived"] as const)
            .filter((status) => status !== v.status)
            .map((status) => (
              <ActionForm
                key={status}
                action={action}
                operation="set_affairs_mainline_status"
                identity={v}
                submitLabel={
                  status === "active"
                    ? "恢复主线"
                    : status === "paused"
                      ? "暂停主线"
                      : "归档主线"
                }
              >
                <input type="hidden" name="status" value={status} />
              </ActionForm>
            ))}
        </div>
      ) : null}
    </section>
  );
}
