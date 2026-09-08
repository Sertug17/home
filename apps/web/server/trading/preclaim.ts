import { getCdpAccessTokenValidator } from "@/server/cdp/provider";
import type { ValidateBeforeMoneyActionClaim } from "@/server/money-actions/handlers";
import { getTradeBalance } from "./balance";
import { createTradePreclaimValidator } from "./finalize";
import { getTradeIntentStore } from "./runtime-intent-store";
import {
  createPermit2StateReader,
  createTradeSignerResolver,
} from "./signer";

const resolveSigner = createTradeSignerResolver({
  getValidator: getCdpAccessTokenValidator,
});
const readPermit2State = createPermit2StateReader();
let validatorPromise: Promise<ValidateBeforeMoneyActionClaim> | null = null;

export const validateTradeBeforeClaim: ValidateBeforeMoneyActionClaim = async (input) => {
  validatorPromise ??= getTradeIntentStore().then((intentStore) =>
    createTradePreclaimValidator({
      intentStore,
      resolveSigner,
      readBalance: getTradeBalance,
      readPermit2State,
    }),
  );
  return (await validatorPromise)(input);
};
