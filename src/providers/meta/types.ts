export interface MetaWebhookPayload {
  object: "page" | "instagram"
  entry: Array<{
    id: string
    time: number
    messaging?: Array<{
      sender: { id: string }
      recipient: { id: string }
      timestamp: number
      message?: {
        mid: string
        text?: string
        attachments?: Array<{
          type: string
          payload: {
            url?: string
          }
        }>
      }
      postback?: {
        title: string
        payload: string
      }
      read?: {
        watermark: number
      }
    }>
    changes?: Array<{
      value: {
        from: { id: string; username?: string }
        item: "comment" | "post"
        comment_id?: string
        post_id?: string
        message?: string
        created_time: number
        parent_id?: string
      }
      field: string
    }>
  }>
}

export interface MetaSendMessagePayload {
  recipient: {
    id: string
  }
  message: {
    text: string
  }
  messaging_type?: "RESPONSE" | "UPDATE" | "MESSAGE_TAG"
}

export interface MetaSendMessageResponse {
  recipient_id: string
  message_id: string
}

