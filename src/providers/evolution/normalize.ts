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
  // Process message events: messages.upsert, messages.update, and send.message
  if (payload.event !== "messages.upsert" && payload.event !== "messages.update" && payload.event !== "send.message") {
    return null
  }

  const data = payload.data
  
  // For send.message event, structure might be slightly different
  // Check if key is directly in data or nested
  let key = data.key
  let message = data.message
  
  // For send.message, message might be at data.message or data.data.message
  if (!message && (data as any).data?.message) {
    message = (data as any).data.message
  }
  
  // For send.message, key might be at data.key or data.data.key
  if (!key && (data as any).data?.key) {
    key = (data as any).data.key
  }

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

  // Remove suffixes: @s.whatsapp.net and device suffix like ":79"
  const contactExternalId = remoteJid.split("@")[0].split(":")[0]

  // Also try remoteJidAlt if provided (some payloads include alternate)
  const remoteJidAlt = (key as any).remoteJidAlt
  const altContactExternalId = remoteJidAlt
    ? remoteJidAlt.split("@")[0].split(":")[0]
    : undefined

  // Extract message text and type
  let text: string | undefined
  let messageType: "text" | "image" | "video" | "audio" = "text"
  let mediaUrl: string | undefined
  
  // Check for mediaUrl (S3/Minio integration) - PRIORITY
  // Evolution API includes mediaUrl at different levels depending on event type
  // For send.message: mediaUrl is at data.message.mediaUrl
  // For messages.upsert: mediaUrl might be at data.message.mediaUrl or data.mediaUrl
  // Check data.message.mediaUrl first (S3/Minio integration for send.message)
  if ((message as any)?.mediaUrl && typeof (message as any).mediaUrl === "string") {
    mediaUrl = (message as any).mediaUrl
  } else if (data.mediaUrl && typeof data.mediaUrl === "string") {
    mediaUrl = data.mediaUrl
  }
  
  // Also check if mediaUrl is nested in message object for send.message event
  // send.message structure: data.message = { imageMessage: {...}, mediaUrl: "..." }
  if (!mediaUrl && payload.event === "send.message" && (data as any).message?.mediaUrl) {
    mediaUrl = (data as any).message.mediaUrl
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
    contactExternalId: contactExternalId || altContactExternalId || remoteJid.split("@")[0],
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

