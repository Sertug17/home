import { createMoneyActionSessionAuthorizer } from "@/server/money-actions/composition";
import { createHandleActionHandler } from "@/server/actions/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createHandleActionHandler({
  authorize: createMoneyActionSessionAuthorizer(),
});
