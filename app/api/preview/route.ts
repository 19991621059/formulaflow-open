import { previewContent } from "@/lib/server/content";
import { assertAccess, errorResponse } from "@/lib/server/guard";
import { contentInput } from "@/lib/server/input";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertAccess(request);
    const input = await contentInput(request);
    return Response.json(previewContent(input.content, input.mode), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
