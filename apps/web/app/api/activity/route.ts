import { isBaseAccountEnabled } from "@/shared/account/session-types";
import { getCdpAccessTokenValidator } from "@/server/cdp/provider";
import { createSessionHandler } from "@/server/cdp/session";
import { createActivityHandler } from "@/server/activity/handler";
import { getRecentBaseActivity } from "@/server/activity/reader";
import type { RecordedOperationsReader } from "@/server/activity/types";
import { getActionsStore, type ActionsStore } from "@/server/actions/store";
import { writeObservabilityEvent } from "@/server/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const authorizeSession = createSessionHandler({
  getValidator: getCdpAccessTokenValidator,
  baseAccountEnabled: isBaseAccountEnabled(process.env.NEXT_PUBLIC_ENABLE_BASE_ACCOUNT),
});

export function createRecordedOperationsReader(store?: Pick<ActionsStore, "list">): RecordedOperationsReader {
  return async (owner, signal) => {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    return (store ?? getActionsStore()).list(owner);
  };
}

export const GET = createActivityHandler({
  authorize: authorizeSession,
  readActivity: getRecentBaseActivity,
  readRecordedOperations: createRecordedOperationsReader(),
  observe: writeObservabilityEvent,
});
