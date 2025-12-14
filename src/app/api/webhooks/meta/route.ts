import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { generateDedupeKey, processInboundEvent } from "@/lib/webhook-processor"
import { metaProvider } from "@/providers/meta"
import { sseBroadcaster } from "@/lib/sse-broadcaster"
import type { MetaWebhookPayload } from "@/providers/meta/types"

// Webhook verification (GET request)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const verifyToken = process.env.META_VERIFY_TOKEN

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

// Webhook handler (POST request)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // Meta webhook structure
    if (body.object !== "page" && body.object !== "instagram") {
      return NextResponse.json(
        { error: "Invalid webhook object" },
        { status: 400 }
      )
    }

    const payload = body as MetaWebhookPayload
    const channelType = body.object === "instagram" ? "instagram_business" : "facebook_page"

    // Process each entry
    for (const entry of payload.entry) {
      // Determine page/account ID from entry
      const pageId = entry.id

      // Find channel account
      const channelAccount = await prisma.channelAccount.findFirst({
        where: {
          type: channelType,
          externalId: pageId,
        },
      })

      if (!channelAccount) {
        // Skip if channel not found
        continue
      }

      // Normalize webhook
      const normalizedEvents = metaProvider.normalizeWebhook(
        payload,
        pageId,
        channelType
      )

      // Process each normalized event
      for (const event of normalizedEvents) {
        // Generate dedupe key
        const dedupeKey = generateDedupeKey(
          "meta",
          event.message.externalMessageId,
          event.message.timestamp
        )

        // Insert webhook event with deduplication
        try {
          await prisma.webhookEvent.create({
            data: {
              workspaceId: channelAccount.workspaceId,
              provider: "meta",
              dedupeKey,
              rawPayload: entry,
            },
          })
        } catch (error: unknown) {
          // Deduplication conflict - skip
          if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
            continue
          }
          throw error
        }

        // Process the event
        try {
          await processInboundEvent(channelAccount.workspaceId, event)

          // Mark as processed
          await prisma.webhookEvent.updateMany({
            where: { dedupeKey },
            data: { processedAt: new Date() },
          })

          // Get conversation ID for SSE broadcast
          // Find contact by searching all contacts (since handles is JSON)
          const allContacts = await prisma.contact.findMany({
            where: { workspaceId: channelAccount.workspaceId },
          })
          
          const contact = allContacts.find((c) => {
            const handles = c.handles as { fb_psid?: string; ig_id?: string }
            if (channelType === "facebook_page") {
              return handles.fb_psid === event.contactExternalId
            } else if (channelType === "instagram_business") {
              return handles.ig_id === event.contactExternalId
            }
            return false
          })

          if (contact) {
            const conversation = await prisma.conversation.findFirst({
              where: {
                workspaceId: channelAccount.workspaceId,
                channelAccountId: channelAccount.id,
                contactId: contact.id,
              },
            })

            if (conversation) {
              // Broadcast via SSE
              sseBroadcaster.broadcast(channelAccount.workspaceId, "message", {
                type: "new_message",
                conversationId: conversation.id,
                channelAccountId: channelAccount.id,
              })
            }
          }
        } catch (error) {
          // Mark as error
          await prisma.webhookEvent.updateMany({
            where: { dedupeKey },
            data: {
              processedAt: new Date(),
              error: error instanceof Error ? error.message : "Unknown error",
            },
          })

          console.error("Error processing Meta webhook event:", error)
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    console.error("Meta webhook error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

