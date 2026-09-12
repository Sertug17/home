import { createMoneyActionSessionAuthorizer } from "@/server/money-actions/composition";
import { createGetActionHandler } from "@/server/actions/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createGetActionHandler({
  authorize: createMoneyActionSessionAuthorizer(),
});
