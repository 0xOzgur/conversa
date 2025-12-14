import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"
import { evolutionProvider } from "@/providers/evolution"
import { metaProvider } from "@/providers/meta"
import { sseBroadcaster } from "@/lib/sse-broadcaster"
import type { EvolutionChannelConfig } from "@/providers/evolution/send"
import type { MetaChannelConfig } from "@/providers/meta/send"
import { decrypt } from "@/lib/encryption"

const sendMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1),
})

// POST /api/messages/send - Send a message
export async function POST(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const body = await req.json()
    const validated = sendMessageSchema.parse(body)

    // Get conversation with channel account
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: validated.conversationId,
        workspaceId: context.workspaceId,
      },
      include: {
        channelAccount: true,
        contact: true,
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    const channelAccount = conversation.channelAccount
    const contact = conversation.contact

    // Determine contact external ID based on channel type
    let contactExternalId: string | undefined
    const handles = contact.handles as { wa_id?: string; ig_id?: string; fb_psid?: string }

    if (channelAccount.type === "whatsapp_evolution") {
      contactExternalId = handles.wa_id
    } else if (channelAccount.type === "instagram_business") {
      contactExternalId = handles.ig_id
    } else if (channelAccount.type === "facebook_page") {
      contactExternalId = handles.fb_psid
    }

    if (!contactExternalId) {
      return NextResponse.json(
        { error: "Contact external ID not found" },
        { status: 400 }
      )
    }

    // Send message via appropriate provider
    let externalMessageId: string
    const sentAt = new Date()

    if (channelAccount.type === "whatsapp_evolution") {
      if (!channelAccount.encryptedApiKey) {
        return NextResponse.json(
          { error: "Channel API key not configured" },
          { status: 400 }
        )
      }

      const metadata = channelAccount.metadata as { baseUrl?: string; instanceName?: string }
      const config: EvolutionChannelConfig = {
        baseUrl: metadata.baseUrl || "",
        instanceName: metadata.instanceName || channelAccount.externalId,
        encryptedApiKey: channelAccount.encryptedApiKey,
      }

      const response = await evolutionProvider.sendTextMessage(
        config,
        contactExternalId,
        validated.text
      ) as { key?: { id?: string } }

      externalMessageId = response.key?.id || `sent-${Date.now()}`
    } else if (channelAccount.type === "facebook_page" || channelAccount.type === "instagram_business") {
      if (!channelAccount.encryptedApiKey) {
        return NextResponse.json(
          { error: "Channel access token not configured" },
          { status: 400 }
        )
      }

      const metadata = channelAccount.metadata as { pageId?: string }
      const config: MetaChannelConfig = {
        encryptedApiKey: channelAccount.encryptedApiKey,
        pageId: metadata.pageId || channelAccount.externalId,
      }

      const response = await metaProvider.sendTextMessage(
        config,
        contactExternalId,
        validated.text,
        metadata.pageId || channelAccount.externalId
      ) as { message_id?: string }

      externalMessageId = response.message_id || `sent-${Date.now()}`
    } else {
      return NextResponse.json(
        { error: "Unsupported channel type" },
        { status: 400 }
      )
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        workspaceId: context.workspaceId,
        conversationId: validated.conversationId,
        direction: "outbound",
        messageType: "text",
        body: validated.text,
        externalMessageId,
        sentAt,
        rawPayload: {
          provider: channelAccount.type,
          externalMessageId,
        },
      },
    })

    // Update conversation
    await prisma.conversation.update({
      where: { id: validated.conversationId },
      data: {
        lastMessageAt: sentAt,
      },
    })

    // Broadcast via SSE
    sseBroadcaster.broadcast(context.workspaceId, "message", {
      type: "new_message",
      conversationId: validated.conversationId,
      message,
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error sending message:", error)
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    )
  }
}

