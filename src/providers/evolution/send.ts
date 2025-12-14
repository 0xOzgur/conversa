import type { EvolutionSendTextPayload, EvolutionSendTextResponse } from "./types"
import { decrypt } from "@/lib/encryption"

export interface EvolutionChannelConfig {
  baseUrl: string
  instanceName: string
  encryptedApiKey: string
}

/**
 * Send text message via Evolution API
 */
export async function sendEvolutionTextMessage(
  config: EvolutionChannelConfig,
  recipientNumber: string,
  text: string
): Promise<EvolutionSendTextResponse> {
  const { baseUrl, instanceName, encryptedApiKey } = config

  // Decrypt API key
  const apiKey = decrypt(encryptedApiKey)

  // Clean baseUrl (remove trailing slash)
  const cleanBaseUrl = baseUrl.replace(/\/$/, "")

  // Construct URL
  const url = `${cleanBaseUrl}/message/sendText/${instanceName}`

  // Prepare payload
  const payload: EvolutionSendTextPayload = {
    number: recipientNumber,
    text,
  }

  // Send request
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Evolution API error: ${response.status} ${response.statusText} - ${errorText}`
    )
  }

  const data = await response.json()
  return data as EvolutionSendTextResponse
}

