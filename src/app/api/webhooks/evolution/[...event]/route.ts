// Catch-all route for "Webhook by Events" mode
// When "Webhook by Events" is enabled, Evolution API sends events to:
// /api/webhooks/evolution/CHATS_DELETE
// /api/webhooks/evolution/CHATS_UPDATE
// etc.
// This route forwards all requests to the main webhook handler

import { NextRequest } from "next/server"
import { POST as mainPOST } from "../route"

export async function POST(req: NextRequest) {
  // Forward to main webhook handler
  return mainPOST(req)
}
