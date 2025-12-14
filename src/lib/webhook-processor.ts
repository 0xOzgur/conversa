import { prisma } from "./prisma"
import type { CanonicalInboundEvent } from "@/types"
import type { ContactHandles } from "@/types"

/**
 * Generate deduplication key for webhook event
 */
export function generateDedupeKey(
  provider: "meta" | "evolution",
  messageId: string,
  timestamp: Date | number
): string {
  const ts = timestamp instanceof Date ? timestamp.getTime() : timestamp
  return `${provider}:${messageId}:${ts}`
}

/**
 * Process canonical inbound event:
 * - Upsert contact
 * - Upsert conversation
 * - Insert message
 * - Update conversation stats
 */
export async function processInboundEvent(
  workspaceId: string,
  event: CanonicalInboundEvent
): Promise<void> {
  // Find channel account
  const channelAccount = await prisma.channelAccount.findFirst({
    where: {
      workspaceId,
      type: event.channelType,
      externalId: event.channelExternalId,
    },
  })

  if (!channelAccount) {
    throw new Error(
      `Channel account not found: ${event.channelType}:${event.channelExternalId}`
    )
  }

  // Prepare contact handles
  const handles: ContactHandles = {}
  if (event.channelType === "whatsapp_evolution") {
    handles.wa_id = event.contactExternalId
  } else if (event.channelType === "instagram_business") {
    handles.ig_id = event.contactExternalId
  } else if (event.channelType === "facebook_page") {
    handles.fb_psid = event.contactExternalId
  }

  // Find or create contact
  // Since handles is JSON, we need to search all contacts and filter manually
  const allContacts = await prisma.contact.findMany({
    where: { workspaceId },
  })

  let contactRecord = allContacts.find((c) => {
    const h = c.handles as ContactHandles
    if (event.channelType === "whatsapp_evolution" && h.wa_id === event.contactExternalId) {
      return true
    }
    if (event.channelType === "instagram_business" && h.ig_id === event.contactExternalId) {
      return true
    }
    if (event.channelType === "facebook_page" && h.fb_psid === event.contactExternalId) {
      return true
    }
    return false
  })

  if (!contactRecord) {
    contactRecord = await prisma.contact.create({
      data: {
        workspaceId,
        primaryName: event.contactName || event.contactExternalId,
        handles,
      },
    })
  } else {
    // Update contact handles and name if needed
    const existingHandles = contactRecord.handles as ContactHandles
    const updatedHandles = { ...existingHandles, ...handles }
    
    const shouldUpdate = 
      (event.contactName && event.contactName !== contactRecord.primaryName) ||
      JSON.stringify(updatedHandles) !== JSON.stringify(existingHandles)

    if (shouldUpdate) {
      contactRecord = await prisma.contact.update({
        where: { id: contactRecord.id },
        data: {
          primaryName: event.contactName || contactRecord.primaryName,
          handles: updatedHandles,
          updatedAt: new Date(),
        },
      })
    }
  }

  // Upsert conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      workspaceId,
      channelAccountId: channelAccount.id,
      contactId: contactRecord.id,
    },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        channelAccountId: channelAccount.id,
        contactId: contactRecord.id,
        status: "open",
        lastMessageAt: event.message.timestamp,
        unreadCount: 1,
      },
    })
  } else {
    // Update conversation
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: event.message.timestamp,
        unreadCount: {
          increment: 1,
        },
        status: conversation.status === "closed" ? "open" : conversation.status,
      },
    })
  }

  // Determine message type from event type
  let messageType: "text" | "image" | "audio" | "system" | "comment" = "text"
  if (event.eventType === "comment") {
    messageType = "comment"
  } else if (event.eventType === "reply") {
    messageType = "comment" // Replies are also comments
  }

  // Insert message
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: "inbound",
      messageType,
      body: event.message.text,
      externalMessageId: event.message.externalMessageId,
      receivedAt: event.message.timestamp,
      rawPayload: event.message.rawPayload,
    },
  })
}

