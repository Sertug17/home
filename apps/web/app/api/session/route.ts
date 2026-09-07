import { getCdpAccessTokenValidator } from "@/server/cdp/provider";
import { createSessionHandler } from "@/server/cdp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createSessionHandler({
  getValidator: getCdpAccessTokenValidator,
});
