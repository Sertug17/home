import { createMoneyActionSessionAuthorizer } from "@/server/money-actions/composition";
import { createConfirmActionHandler } from "@/server/actions/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createConfirmActionHandler({
  authorize: createMoneyActionSessionAuthorizer(),
});
