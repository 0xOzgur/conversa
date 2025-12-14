import type { MetaWebhookPayload } from "./types"
import type { CanonicalInboundEvent } from "@/types"

/**
 * Normalize Meta webhook payload to canonical format
 */
export function normalizeMetaWebhook(
  payload: MetaWebhookPayload,
  channelExternalId: string,
  channelType: "facebook_page" | "instagram_business"
): CanonicalInboundEvent[] {
  const events: CanonicalInboundEvent[] = []

  for (const entry of payload.entry) {
    // Handle messaging events (DMs)
    if (entry.messaging) {
      for (const message of entry.messaging) {
        // Skip read receipts and postbacks
        if (message.read || message.postback) {
          continue
        }

        const msg = message.message
        if (!msg || !msg.text) {
          continue
        }

        const contactExternalId = message.sender.id
        const externalMessageId = msg.mid
        const timestamp = new Date(message.timestamp)

        events.push({
          channelType,
          channelExternalId,
          contactExternalId,
          eventType: "message",
          message: {
            text: msg.text,
            timestamp,
            externalMessageId,
            rawPayload: message,
          },
        })
      }
    }

    // Handle comment events
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.field !== "comments") {
          continue
        }

        const value = change.value
        if (!value.message) {
          continue
        }

        const contactExternalId = value.from.id
        const externalMessageId = value.comment_id || value.post_id || `comment-${Date.now()}`
        const timestamp = new Date(value.created_time * 1000)

        // Determine if this is a reply or top-level comment
        const eventType = value.parent_id ? "reply" : "comment"

        events.push({
          channelType,
          channelExternalId,
          contactExternalId,
          contactName: value.from.username,
          eventType,
          message: {
            text: value.message,
            timestamp,
            externalMessageId,
            rawPayload: value,
          },
        })
      }
    }
  }

  return events
}

