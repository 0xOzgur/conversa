import type { CanonicalInboundEvent } from "@/types"
import type { MetaWebhookPayload } from "./types"
import { normalizeMetaWebhook } from "./normalize"
import { sendMetaTextMessage } from "./send"
import type { MetaChannelConfig } from "./send"

export interface MetaProvider {
  normalizeWebhook(
    payload: MetaWebhookPayload,
    channelExternalId: string,
    channelType: "facebook_page" | "instagram_business"
  ): CanonicalInboundEvent[]
  sendTextMessage(
    config: MetaChannelConfig,
    recipientId: string,
    text: string,
    pageId?: string
  ): Promise<unknown>
}

export const metaProvider: MetaProvider = {
  normalizeWebhook(payload, channelExternalId, channelType) {
    return normalizeMetaWebhook(payload, channelExternalId, channelType)
  },

  async sendTextMessage(config, recipientId, text, pageId) {
    return sendMetaTextMessage(config, recipientId, text, pageId)
  },
}

