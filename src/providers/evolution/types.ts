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
        url?: string
        mimetype?: string
        fileLength?: number
        mediaUrl?: string // S3/Minio integration provides this
      }
      videoMessage?: {
        caption?: string
        url?: string
        mimetype?: string
        fileLength?: number
        mediaUrl?: string // S3/Minio integration provides this
      }
      audioMessage?: {
        url?: string
        mimetype?: string
        fileLength?: number
        mediaUrl?: string // S3/Minio integration provides this
      }
      documentMessage?: {
        url?: string
        mimetype?: string
        fileName?: string
        fileLength?: number
      }
    }
    messageTimestamp?: number
    pushName?: string
    participant?: string
    mediaUrl?: string // S3/Minio integration - direct access URL
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

