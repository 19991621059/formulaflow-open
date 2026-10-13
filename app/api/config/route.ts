import { assertAccess, errorResponse } from "@/lib/server/guard";
import { serverSummary } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    assertAccess(request);
    return Response.json(serverSummary(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
