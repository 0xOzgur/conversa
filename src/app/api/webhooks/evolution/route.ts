import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { generateDedupeKey, processInboundEvent } from "@/lib/webhook-processor"
import { evolutionProvider } from "@/providers/evolution"
import { sseBroadcaster } from "@/lib/sse-broadcaster"
import type { EvolutionWebhookPayload } from "@/providers/evolution/types"

const evolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string().optional(),
      fromMe: z.boolean().optional(),
      id: z.string().optional(),
    }).optional(),
    message: z.any().optional(),
    messageTimestamp: z.number().optional(),
    pushName: z.string().optional(),
    mediaUrl: z.string().optional(), // S3/Minio integration - direct media URL
  }).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const eventType = body?.event
    const instanceName = body?.instance
    
    // Only log important events
    if (eventType === "messages.upsert" || eventType === "messages.update") {
      console.log(`[Webhook] ${eventType} from ${instanceName}`)
    }
    
    // Validate payload
    const validated = evolutionWebhookSchema.parse(body)
    const payload = validated as EvolutionWebhookPayload

    // Extract instance name
    if (!instanceName) {
      return NextResponse.json(
        { error: "Instance name is required" },
        { status: 400 }
      )
    }

    // Find channel account by instance name
    // externalId is the instanceName in our schema
    const channelAccount = await prisma.channelAccount.findFirst({
      where: {
        type: "whatsapp_evolution",
        externalId: instanceName,
      },
    })

    if (!channelAccount) {
      console.warn(`[Webhook] Channel not found for instance: ${instanceName}`)
      return NextResponse.json({ received: true, error: "Channel not found" }, { status: 200 })
    }

    // Get channel account metadata for baseUrl
    const channelMetadata = channelAccount.metadata as { baseUrl?: string } | null
    const baseUrl = channelMetadata?.baseUrl || ""

    // Normalize webhook
    const normalized = evolutionProvider.normalizeWebhook(
      payload,
      instanceName
    )

    if (!normalized) {
      // Not a message event we care about
      return NextResponse.json({ received: true, skipped: true }, { status: 200 })
    }

    // Handle media messages
    // If S3/Minio is configured, Evolution API provides direct mediaUrl in webhook
    // Otherwise, we need to use proxy endpoint for WhatsApp encrypted URLs
    if (normalized && (normalized.message.messageType === "video" || normalized.message.messageType === "image" || normalized.message.messageType === "audio")) {
      // Check if mediaUrl is from S3/Minio (direct access URL)
      // S3 URLs typically contain: s3.amazonaws.com, s3.[region].amazonaws.com, or minio endpoints
      const isS3Url = normalized.message.mediaUrl && 
        !normalized.message.mediaUrl.includes("mmg.whatsapp.net") &&
        (normalized.message.mediaUrl.includes("s3.amazonaws.com") ||
         normalized.message.mediaUrl.includes("s3.") ||
         normalized.message.mediaUrl.includes("minio") ||
         (normalized.message.mediaUrl.startsWith("http://") || normalized.message.mediaUrl.startsWith("https://")))
      
      if (!isS3Url) {
        // WhatsApp encrypted URL - need proxy endpoint
        const messageId = payload.data?.key?.id || normalized.message.externalMessageId
        
        if (messageId) {
          // Use our proxy endpoint to fetch from Evolution API
          normalized.message.mediaUrl = `/api/media/evolution?instance=${encodeURIComponent(instanceName)}&messageId=${encodeURIComponent(messageId)}`
        }
      }
    }

    // Generate dedupe key
    const messageId = normalized.message.externalMessageId
    const dedupeKey = generateDedupeKey(
      "evolution",
      messageId,
      normalized.message.timestamp
    )

    // Insert webhook event with deduplication
    try {
      await prisma.webhookEvent.create({
        data: {
          workspaceId: channelAccount.workspaceId,
          provider: "evolution",
          dedupeKey,
          rawPayload: payload as any,
        },
      })
    } catch (error: unknown) {
      // Deduplication conflict - event already processed
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
      }
      throw error
    }

    // Process the event
    try {
      await processInboundEvent(channelAccount.workspaceId, normalized)

      // Mark as processed
      await prisma.webhookEvent.updateMany({
        where: { dedupeKey },
        data: { processedAt: new Date() },
      })

      // Get the conversation ID for SSE broadcast
      // Find contact by searching all contacts (since handles is JSON)
      const allContacts = await prisma.contact.findMany({
        where: { workspaceId: channelAccount.workspaceId },
      })
      
      const contact = allContacts.find((c) => {
        const handles = c.handles as { wa_id?: string }
        return handles.wa_id === normalized.contactExternalId
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

      return NextResponse.json({ received: true, processed: true }, { status: 200 })
    } catch (error) {
      // Mark as error
      await prisma.webhookEvent.updateMany({
        where: { dedupeKey },
        data: {
          processedAt: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })

      console.error("Error processing Evolution webhook:", error)
      return NextResponse.json(
        { error: "Processing failed" },
        { status: 500 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Evolution webhook error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

