import type { AffairsRpcReceiptRow, AffairsReceipt } from "./types";
import { adaptReceipt } from "./adapters";
export class AffairsDatabaseError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AffairsDatabaseError";
  }
}
export async function readAffairsReceipt(
  result: PromiseLike<{
    data: AffairsRpcReceiptRow[] | null;
    error: { code: string; message: string } | null;
  }>,
): Promise<AffairsReceipt> {
  const { data, error } = await result;
  if (error) throw new AffairsDatabaseError(error.code, error.message);
  if (!data || data.length !== 1) throw new Error("missing_receipt");
  return adaptReceipt(data[0]);
}
