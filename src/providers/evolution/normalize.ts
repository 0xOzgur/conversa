import type { EvolutionWebhookPayload } from "./types"
import type { CanonicalInboundEvent } from "@/types"

/**
 * Normalize Evolution API webhook payload to canonical format
 */
export function normalizeEvolutionWebhook(
  payload: EvolutionWebhookPayload,
  channelExternalId: string
): CanonicalInboundEvent | null {
  // Only process message events
  if (payload.event !== "messages.upsert" && payload.event !== "messages.update") {
    return null
  }

  const data = payload.data
  const key = data.key
  const message = data.message

  if (!key || !message) {
    return null
  }

  // Skip outbound messages (fromMe = true)
  if (key.fromMe) {
    return null
  }

  // Extract contact ID (phone number from remoteJid)
  const remoteJid = key.remoteJid
  if (!remoteJid) {
    return null
  }

  // Remove @s.whatsapp.net suffix if present
  const contactExternalId = remoteJid.split("@")[0]

  // Extract message text
  let text: string | undefined
  if (message.conversation) {
    text = message.conversation
  } else if (message.extendedTextMessage?.text) {
    text = message.extendedTextMessage.text
  } else if (message.imageMessage?.caption) {
    text = message.imageMessage.caption
  } else if (message.videoMessage?.caption) {
    text = message.videoMessage.caption
  }

  // Skip if no text content
  if (!text) {
    return null
  }

  // Extract timestamp
  const timestamp = data.messageTimestamp
    ? new Date(data.messageTimestamp * 1000)
    : new Date()

  // Extract message ID
  const externalMessageId = key.id || `${timestamp.getTime()}-${Math.random()}`

  return {
    channelType: "whatsapp_evolution",
    channelExternalId,
    contactExternalId,
    contactName: data.pushName || undefined,
    eventType: "message",
    message: {
      text,
      timestamp,
      externalMessageId,
      rawPayload: payload,
    },
  }
}

