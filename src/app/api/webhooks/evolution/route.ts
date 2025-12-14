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
    const body = await req.json()
    
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
    const channelAccount = await prisma.channelAccount.findFirst({
      where: {
        type: "whatsapp_evolution",
        externalId: instanceName,
        metadata: {
          path: ["instanceName"],
          equals: instanceName,
        },
      },
    })

    if (!channelAccount) {
      // Still log the webhook but don't process
      console.warn(`Channel account not found for instance: ${instanceName}`)
      return NextResponse.json({ received: true }, { status: 200 })
    }

    // Normalize webhook
    const normalized = evolutionProvider.normalizeWebhook(
      payload,
      instanceName
    )

    if (!normalized) {
      // Not a message event we care about
      return NextResponse.json({ received: true }, { status: 200 })
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

      // Broadcast via SSE
      sseBroadcaster.broadcast(channelAccount.workspaceId, "message", {
        type: "new_message",
        channelAccountId: channelAccount.id,
      })

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

