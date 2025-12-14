export interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: {
    key?: {
      remoteJid?: string
      fromMe?: boolean
      id?: string
    }
    message?: {
      conversation?: string
      extendedTextMessage?: {
        text: string
      }
      imageMessage?: {
        caption?: string
      }
      videoMessage?: {
        caption?: string
      }
    }
    messageTimestamp?: number
    pushName?: string
    participant?: string
  }
}

export interface EvolutionSendTextPayload {
  number: string
  text: string
}

export interface EvolutionSendTextResponse {
  key: {
    remoteJid: string
    fromMe: boolean
    id: string
  }
  message: {
    conversation: string
  }
  messageTimestamp: number
  status: string
}

