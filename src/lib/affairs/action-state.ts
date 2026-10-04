import type { AffairsReceipt } from "./types";
import type {InboxResolveReceipt} from './inbox-types';
export interface AffairsActionState {
  status: "idle" | "success" | "error" | "uncertain";
  fieldErrors: Record<string, string>;
  message: string | null;
  receipt: AffairsReceipt | InboxResolveReceipt | null;
}
export const initialAffairsActionState: AffairsActionState = {
  status: "idle",
  fieldErrors: {},
  message: null,
  receipt: null,
};
