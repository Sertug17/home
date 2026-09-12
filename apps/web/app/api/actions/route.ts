import { createMoneyActionSessionAuthorizer } from "@/server/money-actions/composition";
import { createListActionsHandler } from "@/server/actions/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createListActionsHandler({
  authorize: createMoneyActionSessionAuthorizer(),
});
