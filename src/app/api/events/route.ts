import { NextRequest } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { sseBroadcaster } from "@/lib/sse-broadcaster"

// GET /api/events - SSE endpoint for real-time updates
export async function GET(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(`: connected\n\n`)
      )

      // Subscribe to SSE broadcaster
      const unsubscribe = sseBroadcaster.subscribe(
        context.workspaceId,
        (data: string) => {
          controller.enqueue(encoder.encode(data))
        }
      )

      // Handle client disconnect
      req.signal.addEventListener("abort", () => {
        unsubscribe()
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  })
}

