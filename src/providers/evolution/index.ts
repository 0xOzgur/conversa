import type { CanonicalInboundEvent } from "@/types"
import type { EvolutionWebhookPayload } from "./types"
import { normalizeEvolutionWebhook } from "./normalize"
import { sendEvolutionTextMessage } from "./send"
import type { EvolutionChannelConfig } from "./send"

export interface EvolutionProvider {
  normalizeWebhook(payload: EvolutionWebhookPayload, channelExternalId: string): CanonicalInboundEvent | null
  sendTextMessage(
    config: EvolutionChannelConfig,
    recipientNumber: string,
    text: string
  ): Promise<unknown>
}

export const evolutionProvider: EvolutionProvider = {
  normalizeWebhook(payload, channelExternalId) {
    return normalizeEvolutionWebhook(payload, channelExternalId)
  },

  async sendTextMessage(config, recipientNumber, text) {
    return sendEvolutionTextMessage(config, recipientNumber, text)
  },
}

