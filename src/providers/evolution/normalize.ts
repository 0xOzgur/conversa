import type { EvolutionWebhookPayload } from "./types"
import type { CanonicalInboundEvent } from "@/types"

/**
 * Construct Evolution API media URL
 * Evolution API provides media through: /instance/{instance}/message/fetchMedia/{messageId}
 */
export function constructEvolutionMediaUrl(
  baseUrl: string,
  instanceName: string,
  messageId: string
): string {
  const cleanBaseUrl = baseUrl.replace(/\/$/, "")
  return `${cleanBaseUrl}/instance/${instanceName}/message/fetchMedia/${messageId}`
}

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

  // Determine message direction
  const direction: "inbound" | "outbound" = key.fromMe ? "outbound" : "inbound"

  // Extract contact ID (phone number from remoteJid)
  // For inbound: contact is the sender
  // For outbound: contact is the recipient
  const remoteJid = key.remoteJid
  if (!remoteJid) {
    return null
  }

  // Remove @s.whatsapp.net suffix if present
  const contactExternalId = remoteJid.split("@")[0]

  // Extract message text and type
  let text: string | undefined
  let messageType: "text" | "image" | "video" | "audio" = "text"
  let mediaUrl: string | undefined
  
  // Check for mediaUrl (S3/Minio integration) - PRIORITY
  // Evolution API includes mediaUrl at data.message level when S3/Minio is configured
  // Check data.message.mediaUrl first (S3/Minio integration)
  if ((message as any)?.mediaUrl && typeof (message as any).mediaUrl === "string") {
    mediaUrl = (message as any).mediaUrl
  } else if (data.mediaUrl && typeof data.mediaUrl === "string") {
    mediaUrl = data.mediaUrl
  }

  if (message.conversation) {
    text = message.conversation
    messageType = "text"
  } else if (message.extendedTextMessage?.text) {
    text = message.extendedTextMessage.text
    messageType = "text"
  } else if (message.imageMessage) {
    text = message.imageMessage.caption || "[Image]"
    messageType = "image"
    // Only set mediaUrl if not already set from data.mediaUrl (S3/Minio)
    if (!mediaUrl) {
      mediaUrl = message.imageMessage.mediaUrl || message.imageMessage.url
    }
  } else if (message.videoMessage) {
    text = message.videoMessage.caption || "[Video]"
    messageType = "video"
    // Only set mediaUrl if not already set from data.mediaUrl (S3/Minio)
    if (!mediaUrl) {
      mediaUrl = message.videoMessage.mediaUrl || message.videoMessage.url
    }
  } else if (message.audioMessage) {
    text = "[Audio]"
    messageType = "audio"
    // Only set mediaUrl if not already set from data.mediaUrl (S3/Minio)
    if (!mediaUrl) {
      mediaUrl = message.audioMessage.mediaUrl || message.audioMessage.url
    }
  } else if (message.documentMessage) {
    text = message.documentMessage.fileName || "[Document]"
    messageType = "text" // Documents shown as text with filename
    if (!mediaUrl) {
      mediaUrl = message.documentMessage.url
    }
  }

  // Skip if no content at all
  if (!text && !mediaUrl) {
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
    direction, // Added to support outbound messages
    message: {
      text: text || undefined,
      messageType,
      mediaUrl,
      timestamp,
      externalMessageId,
      rawPayload: payload,
    },
  }
}

