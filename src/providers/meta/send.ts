import type { MetaSendMessagePayload, MetaSendMessageResponse } from "./types"
import { decrypt } from "@/lib/encryption"

export interface MetaChannelConfig {
  encryptedApiKey: string
  pageId?: string
}

/**
 * Send text message via Meta Graph API
 * Stubbed for MVP - requires proper Graph API setup
 */
export async function sendMetaTextMessage(
  config: MetaChannelConfig,
  recipientId: string,
  text: string,
  pageId?: string
): Promise<MetaSendMessageResponse> {
  // Decrypt API key
  const accessToken = decrypt(config.encryptedApiKey)

  // Use provided pageId or config pageId
  const targetPageId = pageId || config.pageId
  if (!targetPageId) {
    throw new Error("Page ID is required for Meta messaging")
  }

  // Graph API endpoint for sending messages
  const url = `https://graph.facebook.com/v18.0/${targetPageId}/messages`

  const payload: MetaSendMessagePayload = {
    recipient: {
      id: recipientId,
    },
    message: {
      text,
    },
    messaging_type: "RESPONSE",
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      access_token: accessToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Meta API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const data = await response.json()
  return data as MetaSendMessageResponse
}

