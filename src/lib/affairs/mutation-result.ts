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
export async function readAffairsRpcRow<T>(
  result: PromiseLike<{
    data: T[] | null;
    error: { code: string; message: string } | null;
    status?: number;
  }>,
): Promise<T> {
  const { data, error, status } = await result;
  if (error) {
    // Postgrest-js resolves fetch failures with code="", status=0. A lost
    // response/proxy failure cannot prove the atomic RPC did not commit.
    const definiteRejection =
      /^(P0001|22[A-Z0-9]{3}|23[A-Z0-9]{3}|40[A-Z0-9]{3}|42[A-Z0-9]{3}|PGRST[123][0-9]{2})$/.test(
        error.code,
      );
    if (
      status === 0 ||
      (status !== undefined && status >= 500) ||
      !definiteRejection
    )
      throw new Error("unconfirmed_rpc_result");
    throw new AffairsDatabaseError(error.code, error.message);
  }
  if (!data || data.length !== 1) throw new Error("missing_receipt");
  return data[0];
}
export async function readAffairsReceipt(result:PromiseLike<{data:AffairsRpcReceiptRow[]|null;error:{code:string;message:string}|null;status?:number}>):Promise<AffairsReceipt> {return adaptReceipt(await readAffairsRpcRow(result));}
