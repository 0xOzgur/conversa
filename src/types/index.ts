export type ChannelType = "facebook_page" | "instagram_business" | "whatsapp_evolution"

export type ConversationStatus = "open" | "pending" | "closed"

export type MessageDirection = "inbound" | "outbound"

export type MessageType = "text" | "image" | "audio" | "system" | "comment"

export type WorkspaceRole = "owner" | "admin" | "agent"

export interface ContactHandles {
  wa_id?: string
  ig_id?: string
  fb_psid?: string
}

export interface ChannelAccountMetadata {
  baseUrl?: string
  instanceName?: string
  webhookVersion?: string
  [key: string]: unknown
}

export interface CanonicalInboundEvent {
  channelType: ChannelType
  channelExternalId: string
  contactExternalId: string
  contactName?: string
  eventType: "message" | "comment" | "reply"
  message: {
    text?: string
    timestamp: Date
    externalMessageId: string
    rawPayload: unknown
  }
}

