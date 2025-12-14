import type { CanonicalInboundEvent } from "@/types"
import type { EvolutionWebhookPayload } from "./types"
import { normalizeEvolutionWebhook } from "./normalize"
import { sendEvolutionTextMessage, sendEvolutionMediaMessage } from "./send"
import type { EvolutionChannelConfig } from "./send"

export interface EvolutionProvider {
  normalizeWebhook(payload: EvolutionWebhookPayload, channelExternalId: string): CanonicalInboundEvent | null
  sendTextMessage(
    config: EvolutionChannelConfig,
    recipientNumber: string,
    text: string
  ): Promise<unknown>
  sendMediaMessage(
    config: EvolutionChannelConfig,
    recipientNumber: string,
    mediaType: "image" | "video" | "audio" | "document",
    mediaBase64: string,
    fileName: string,
    mimeType: string,
    caption?: string
  ): Promise<unknown>
}

export const evolutionProvider: EvolutionProvider = {
  normalizeWebhook(payload, channelExternalId) {
    return normalizeEvolutionWebhook(payload, channelExternalId)
  },

  async sendTextMessage(config, recipientNumber, text) {
    return sendEvolutionTextMessage(config, recipientNumber, text)
  },

  async sendMediaMessage(config, recipientNumber, mediaType, mediaBase64, fileName, mimeType, caption) {
    return sendEvolutionMediaMessage(config, recipientNumber, mediaType, mediaBase64, fileName, mimeType, caption)
  },
}

