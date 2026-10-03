import type { FoundationCommand, AffairsReceipt } from "./types";
import type { AffairsQueryClient } from "./queries";
import { readAffairsReceipt } from "./mutation-result";
export async function executeFoundationCommand(
  client: AffairsQueryClient,
  command: FoundationCommand,
): Promise<AffairsReceipt> {
  switch (command.operation) {
    case "create_affairs_mainline":
      return readAffairsReceipt(
        client.rpc("create_affairs_mainline", command.args),
      );
    case "create_affairs_project":
      return readAffairsReceipt(
        client.rpc("create_affairs_project", command.args),
      );
    case "create_affairs_task":
      return readAffairsReceipt(
        client.rpc("create_affairs_task", command.args),
      );
    case "update_affairs_mainline":
      return readAffairsReceipt(
        client.rpc("update_affairs_mainline", command.args),
      );
    case "update_affairs_project":
      return readAffairsReceipt(
        client.rpc("update_affairs_project", command.args),
      );
    case "update_affairs_task":
      return readAffairsReceipt(
        client.rpc("update_affairs_task", command.args),
      );
    case "set_affairs_mainline_status":
      return readAffairsReceipt(
        client.rpc("set_affairs_mainline_status", command.args),
      );
    case "set_affairs_project_status":
      return readAffairsReceipt(
        client.rpc("set_affairs_project_status", command.args),
      );
    case "set_affairs_task_status":
      return readAffairsReceipt(
        client.rpc("set_affairs_task_status", command.args),
      );
    case "set_affairs_mainline_focus":
      return readAffairsReceipt(
        client.rpc("set_affairs_mainline_focus", command.args),
      );
    case "save_affairs_milestones":
      return readAffairsReceipt(
        client.rpc("save_affairs_milestones", command.args),
      );
    case "set_affairs_milestone_completed":
      return readAffairsReceipt(
        client.rpc("set_affairs_milestone_completed", command.args),
      );
    case "record_affairs_progress":
      return readAffairsReceipt(
        client.rpc("record_affairs_progress", command.args),
      );
  }
}
