import type { EvolutionSendTextPayload, EvolutionSendTextResponse, EvolutionSendMediaPayload, EvolutionSendMediaResponse } from "./types"
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

/**
 * Send media message via Evolution API
 */
export async function sendEvolutionMediaMessage(
  config: EvolutionChannelConfig,
  recipientNumber: string,
  mediaType: "image" | "video" | "audio" | "document",
  mediaBase64: string,
  fileName: string,
  mimeType: string,
  caption?: string
): Promise<EvolutionSendMediaResponse> {
  const { baseUrl, instanceName, encryptedApiKey } = config

  // Decrypt API key
  const apiKey = decrypt(encryptedApiKey)

  // Clean baseUrl (remove trailing slash)
  const cleanBaseUrl = baseUrl.replace(/\/$/, "")

  // Construct URL
  const url = `${cleanBaseUrl}/message/sendMedia/${instanceName}`

  // Prepare payload
  const payload: EvolutionSendMediaPayload = {
    number: recipientNumber,
    mediatype: mediaType,
    mimetype: mimeType,
    media: mediaBase64,
    fileName,
    ...(caption && { caption }),
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
  return data as EvolutionSendMediaResponse
}

