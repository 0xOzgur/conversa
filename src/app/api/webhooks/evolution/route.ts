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
  }).optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Log request details for debugging
    console.log("=== Evolution Webhook Received ===")
    console.log("URL:", req.url)
    console.log("Method:", req.method)
    console.log("Headers:", Object.fromEntries(req.headers.entries()))
    
    const body = await req.json()
    console.log("Body:", JSON.stringify(body, null, 2))
    
    // Validate payload
    const validated = evolutionWebhookSchema.parse(body)
    const payload = validated as EvolutionWebhookPayload

    // Extract instance name
    const instanceName = payload.instance
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
      // Still log the webhook but don't process
      console.warn(`Channel account not found for instance: ${instanceName}`)
      console.log("Available channels:", await prisma.channelAccount.findMany({
        where: { type: "whatsapp_evolution" },
        select: { externalId: true, displayName: true }
      }))
      return NextResponse.json({ received: true, error: "Channel not found" }, { status: 200 })
    }

    console.log(`Processing webhook for instance: ${instanceName}, channel: ${channelAccount.id}`)

    // Normalize webhook
    const normalized = evolutionProvider.normalizeWebhook(
      payload,
      instanceName
    )

    if (!normalized) {
      // Not a message event we care about
      console.log(`Event ${payload.event} not normalized (not a message event we care about)`)
      return NextResponse.json({ received: true, skipped: true }, { status: 200 })
    }

    console.log("Normalized event:", JSON.stringify(normalized, null, 2))

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
          rawPayload: payload,
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

