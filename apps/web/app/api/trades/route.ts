import { isBaseAccountEnabled } from "@/shared/account/session-types";
import { getCdpAccessTokenValidator } from "@/server/cdp/provider";
import { createSessionHandler } from "@/server/cdp/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authorize = createSessionHandler({
  getValidator: getCdpAccessTokenValidator,
  baseAccountEnabled: isBaseAccountEnabled(process.env.NEXT_PUBLIC_ENABLE_BASE_ACCOUNT),
});

export async function POST(request: Request): Promise<Response> {
  const boundary = await authorize(request);
  if (!boundary.ok) return boundary;
  return Response.json({ error: { code: "HOSTED_SWAP_UNAVAILABLE", message: "Hosted swaps are unavailable." } }, {
    status: 503,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization, X-Home-Account-Provider" },
  });
}
