import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { generateDedupeKey, processInboundEvent } from "@/lib/webhook-processor"
import { evolutionProvider } from "@/providers/evolution"
import { sseBroadcaster } from "@/lib/sse-broadcaster"
import { decrypt } from "@/lib/encryption"
import type { EvolutionWebhookPayload } from "@/providers/evolution/types"

// Schema for message events (messages.upsert, messages.update, etc.)
// Note: CHATS_DELETE uses a different format and is handled separately
const evolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.union([z.string(), z.object({ name: z.string() }).passthrough()]),
  data: z.object({
    key: z.object({
      remoteJid: z.string().optional(),
      fromMe: z.boolean().optional(),
      id: z.string().optional(),
    }).optional(),
    message: z.any().optional(),
    messageTimestamp: z.number().optional(),
    pushName: z.string().optional(),
    mediaUrl: z.string().optional(), // S3/Minio integration - direct media URL
  }).optional(),
}).passthrough() // Allow additional fields for flexibility

// Helper function to process deleted chats
async function processDeletedChats(deletedChats: any[], channelAccount: any) {
  for (const chat of deletedChats) {
    const chatId = chat?.id || chat?.remoteJid || chat
    if (!chatId || typeof chatId !== "string") {
      console.warn(`[Webhook] Invalid chat ID in deletion:`, chat)
      continue
    }

    // Extract phone number from JID (format: [email protected] or [email protected]:[server] or [email protected])
    // Remove @s.whatsapp.net, @lid, or similar suffixes
    const phoneNumber = chatId.split("@")[0]
    const cleanChatId = chatId.includes("@") ? chatId.split("@")[0] : chatId
    
    console.log(`[Webhook] Processing deleted chat: ${chatId} -> ${cleanChatId}`)
    
    // Find all conversations for this channel account
    const allConversations = await prisma.conversation.findMany({
      where: {
        workspaceId: channelAccount.workspaceId,
        channelAccountId: channelAccount.id,
      },
      include: {
        contact: true,
      },
    })
    
    // Debug: Log all conversations and their contact wa_id values
    console.log(`[Webhook] Searching for chat ${chatId} (phone: ${cleanChatId}) in ${allConversations.length} conversations`)
    allConversations.forEach((conv, idx) => {
      const handles = conv.contact.handles as { wa_id?: string } | null
      const waId = handles?.wa_id || "no wa_id"
      console.log(`[Webhook]   Conversation ${idx + 1}: contactId=${conv.contactId}, wa_id=${waId}`)
    })
    
    // Find conversation by matching contact's WhatsApp ID
    // Note: wa_id is stored as just the phone number (no suffix) in our system
    // But chatId from Evolution API can be in format: number@lid or number@s.whatsapp.net
    const matchingConversation = allConversations.find((conv) => {
      const handles = conv.contact.handles as { wa_id?: string } | null
      if (!handles || !handles.wa_id) {
        console.log(`[Webhook]   Skipping conversation ${conv.id}: no wa_id in handles`)
        return false
      }
      
      const contactWaId = handles.wa_id
      // contactWaId is stored as just the number (e.g., "276965378490569")
      // chatId can be "276965378490569@lid" or "276965378490569@s.whatsapp.net"
      // cleanChatId is "276965378490569"
      
      // Match by phone number (wa_id is just the number, chatId has suffix)
      const matches = (
        contactWaId === cleanChatId ||
        contactWaId === phoneNumber ||
        cleanChatId === contactWaId ||
        phoneNumber === contactWaId
      )
      
      if (matches) {
        console.log(`[Webhook]   ✓ MATCH FOUND: conversation ${conv.id}, contactWaId=${contactWaId}, chatId=${chatId}, cleanChatId=${cleanChatId}`)
      } else {
        console.log(`[Webhook]   No match: contactWaId=${contactWaId} vs chatId=${chatId} (clean: ${cleanChatId})`)
      }
      
      return matches
    })

    if (matchingConversation) {
      // Delete the conversation
      await prisma.conversation.delete({
        where: { id: matchingConversation.id },
      })

      console.log(`[Webhook] ✓ Deleted conversation ${matchingConversation.id} for chat ${chatId}`)

      // Broadcast deletion via SSE
      sseBroadcaster.broadcast(channelAccount.workspaceId, "message", {
        type: "conversation_deleted",
        conversationId: matchingConversation.id,
        channelAccountId: channelAccount.id,
      })
    } else {
      console.log(`[Webhook] No conversation found for chat ${chatId} (searched ${allConversations.length} conversations)`)
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // Log that webhook endpoint was hit
    console.log(`[Webhook] ===== WEBHOOK ENDPOINT HIT =====`)
    console.log(`[Webhook] Timestamp: ${new Date().toISOString()}`)
    console.log(`[Webhook] URL: ${req.url}`)
    
    const body = await req.json()
    const eventType = body?.event
    
    // Log if this might be CHATS_DELETE (check URL path too)
    const urlPath = req.url || ""
    if (urlPath.includes("CHATS_DELETE") || urlPath.includes("chats.delete") || urlPath.includes("chats_delete")) {
      console.log(`[Webhook] ⚠️ CHATS_DELETE detected in URL path: ${urlPath}`)
    }
    
    // Extract instance name - can be string or object with name property
    let instanceName: string | undefined
    if (typeof body?.instance === "string") {
      instanceName = body.instance
    } else if (body?.instance?.name) {
      instanceName = body.instance.name
    }
    
    // Log ALL incoming webhook events for debugging
    console.log(`[Webhook] ===== INCOMING EVENT =====`)
    console.log(`[Webhook] Event Type: ${eventType || "unknown"}`)
    console.log(`[Webhook] Instance: ${instanceName || "unknown"}`)
    console.log(`[Webhook] Payload keys:`, Object.keys(body))
    console.log(`[Webhook] Full payload (first 500 chars):`, JSON.stringify(body).substring(0, 500))
    
    // Log all events that might be related to chat deletion
    // Check for various possible event names
    const possibleDeleteEvents = [
      "CHATS_DELETE",
      "chats.delete",
      "CHATS.DELETE",
      "chats_delete",
      "CHAT_DELETE",
      "chat.delete",
      "CHAT.DELETE",
      "chat_delete",
    ]
    
    const isChatsDelete = eventType && possibleDeleteEvents.some(
      (pattern) => eventType === pattern || eventType.toLowerCase() === pattern.toLowerCase()
    )
    
    // Also log if event contains "delete" or "chat" keywords
    const mightBeDeleteEvent = eventType && (
      eventType.toLowerCase().includes("delete") || 
      eventType.toLowerCase().includes("chat")
    )
    
    if (isChatsDelete || mightBeDeleteEvent) {
      console.log(`[Webhook] ===== POTENTIAL DELETE EVENT DETECTED =====`)
      console.log(`[Webhook] Event Type: ${eventType}`)
      console.log(`[Webhook] Instance: ${instanceName}`)
      console.log(`[Webhook] Full Payload:`, JSON.stringify(body, null, 2))
    }
    
    // Handle CHATS_DELETE event (must be handled before schema validation)
    if (isChatsDelete) {
      console.log(`[Webhook] ===== CONFIRMED CHATS_DELETE EVENT =====`)
      
      if (!instanceName) {
        console.warn(`[Webhook] CHATS_DELETE: Instance name not found in payload`, body)
        // Return 200 to prevent retries
        return NextResponse.json(
          { received: true, error: "Instance name is required" },
          { status: 200 }
        )
      }

      // Find channel account by instance name
      const channelAccount = await prisma.channelAccount.findFirst({
        where: {
          type: "whatsapp_evolution",
          externalId: instanceName,
        },
      })

      if (!channelAccount) {
        console.warn(`[Webhook] Channel not found for instance: ${instanceName}`)
        return NextResponse.json({ received: true, error: "Channel not found" }, { status: 200 })
      }

      // Process deleted chats
      // CHATS_DELETE event format: { event: "CHATS_DELETE", data: [{ id: "[email protected]" }], instance: {...} }
      // Also check if data might be in a different format
      let deletedChats: any[] = []
      if (Array.isArray(body.data)) {
        deletedChats = body.data
      } else if (body.data && typeof body.data === "object") {
        // Maybe data is an object with a chats array?
        if (Array.isArray(body.data.chats)) {
          deletedChats = body.data.chats
        } else if (Array.isArray(body.data.deleted)) {
          deletedChats = body.data.deleted
        } else {
          // Try to extract chat IDs from the object
          deletedChats = [body.data]
        }
      }
      
      console.log(`[Webhook] Processing ${deletedChats.length} deleted chat(s)`)
      
      await processDeletedChats(deletedChats, channelAccount)

      return NextResponse.json({ received: true, processed: true }, { status: 200 })
    }
    
    // Handle chats.update event - might indicate chat deletion
    // Since CHATS_DELETE is now active, we only handle explicit deletion flags in chats.update
    // Check for various possible formats: chats.update, CHATS_UPDATE, chats_update, etc.
    const isChatsUpdate = eventType && (
      eventType === "chats.update" || 
      eventType === "CHATS_UPDATE" ||
      eventType.toLowerCase() === "chats.update" ||
      eventType.toLowerCase() === "chats_update" ||
      eventType.toLowerCase().includes("chats.update") ||
      eventType.toLowerCase().includes("chats_update")
    )
    
    if (isChatsUpdate) {
      if (!instanceName) {
        return NextResponse.json(
          { received: true, error: "Instance name is required" },
          { status: 200 }
        )
      }

      // Find channel account by instance name
      const channelAccount = await prisma.channelAccount.findFirst({
        where: {
          type: "whatsapp_evolution",
          externalId: instanceName,
        },
      })

      if (!channelAccount) {
        console.warn(`[Webhook] Channel not found for instance: ${instanceName}`)
        return NextResponse.json({ received: true, error: "Channel not found" }, { status: 200 })
      }

      // Check if data contains deleted chats
      // chats.update might have data as array with remoteJid
      let updateData: any[] = []
      if (Array.isArray(body.data)) {
        updateData = body.data
      } else if (body.data && typeof body.data === "object") {
        updateData = [body.data]
      }

      // Since CHATS_DELETE event doesn't seem to be sent by Evolution API,
      // we'll check if the chat still exists in Evolution API when chats.update is received
      // This is a fallback mechanism
      for (const chatUpdate of updateData) {
        const remoteJid = chatUpdate?.remoteJid
        if (!remoteJid) continue

        // Check if there's an explicit deleted/archived flag first
        if (chatUpdate.deleted === true || chatUpdate.archived === true || 
            chatUpdate.isDeleted === true || chatUpdate.isArchived === true) {
          console.log(`[Webhook] Chat marked as deleted in chats.update: ${remoteJid}`)
          await processDeletedChats([{ id: remoteJid }], channelAccount)
          continue
        }

        // If no explicit flag, check if chat exists in Evolution API
        // This is a fallback for when CHATS_DELETE event is not sent
        // Check if we have a conversation for this chat in our system
        const phoneNumber = remoteJid.split("@")[0]
        const existingConversation = await prisma.conversation.findFirst({
          where: {
            workspaceId: channelAccount.workspaceId,
            channelAccountId: channelAccount.id,
            contact: {
              handles: {
                path: ["wa_id"],
                equals: phoneNumber,
              },
            },
          },
        })

        if (!existingConversation) {
          // No conversation in our system, skip check
          console.log(`[Webhook] No conversation found for ${remoteJid} (phone: ${phoneNumber}) - skipping Evolution API check`)
          continue
        }

        console.log(`[Webhook] Found conversation ${existingConversation.id} for ${remoteJid} - checking Evolution API...`)

        try {
          const metadata = channelAccount.metadata as { baseUrl?: string } | null
          const baseUrl = metadata?.baseUrl || ""
          
          if (baseUrl && channelAccount.encryptedApiKey) {
            const apiKey = decrypt(channelAccount.encryptedApiKey)
            const cleanBaseUrl = baseUrl.replace(/\/$/, "")
            
            // Check if this specific chat exists in Evolution API
            const checkUrl = `${cleanBaseUrl}/chat/findChats/${instanceName}`
            console.log(`[Webhook] Checking if chat ${remoteJid} exists in Evolution API...`)
            
            const response = await fetch(checkUrl, {
              method: "POST",
              headers: {
                "apikey": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                where: {
                  remoteJid: remoteJid,
                },
                limit: 1,
              }),
            })
            
            if (response.ok) {
              const chatData = await response.json()
              const allChats = Array.isArray(chatData) ? chatData : (chatData?.chats || chatData?.data || [])
              
              console.log(`[Webhook] Evolution API returned ${allChats.length} chat(s) for ${remoteJid}`)
              
              // If chat not found in Evolution API, it was deleted
              if (allChats.length === 0) {
                console.log(`[Webhook] ✓ Chat ${remoteJid} NOT found in Evolution API - DELETING from our system`)
                await processDeletedChats([{ id: remoteJid }], channelAccount)
              } else {
                console.log(`[Webhook] ✓ Chat ${remoteJid} still exists in Evolution API`)
              }
            } else {
              const errorText = await response.text().catch(() => "")
              console.warn(`[Webhook] Failed to check chat existence (${response.status}): ${errorText.substring(0, 200)}`)
            }
          }
        } catch (error) {
          console.error(`[Webhook] Error checking chat existence for ${remoteJid}:`, error)
          // On error, don't delete (to avoid false positives)
        }
      }

      // Return 200 to acknowledge receipt
      return NextResponse.json({ received: true, processed: true }, { status: 200 })
    }
    
    // Handle other non-message events that we don't need to process
    // These events have different formats and should be acknowledged but not processed
    const nonMessageEvents = [
      "contacts.update",
      "contacts.upsert",
      "presence.update",
      "connection.update",
      "qrcode.update",
      "chats.upsert", // chats.upsert has array data format, not object
    ]
    
    if (eventType && nonMessageEvents.includes(eventType.toLowerCase())) {
      // Acknowledge receipt but don't process
      return NextResponse.json({ received: true, skipped: true }, { status: 200 })
    }
    
    // Validate payload for message events (CHATS_DELETE and other events already handled above)
    let validated
    let payload: EvolutionWebhookPayload
    
    try {
      validated = evolutionWebhookSchema.parse(body)
      payload = validated as EvolutionWebhookPayload
      
      // Extract instance name from validated payload
      if (typeof payload.instance === "string") {
        instanceName = payload.instance
      } else if (payload.instance && typeof payload.instance === "object" && "name" in payload.instance) {
        instanceName = (payload.instance as { name: string }).name
      }
    } catch (error) {
      // If validation fails, log and return 200 to prevent retries
      // But also check if it might be a delete event we didn't catch
      const mightBeDeleteEvent = eventType && (
        eventType.toLowerCase().includes("delete") || 
        eventType.toLowerCase().includes("chat")
      )
      
      if (mightBeDeleteEvent) {
        console.log(`[Webhook] ===== UNKNOWN DELETE-LIKE EVENT (validation failed) =====`)
        console.log(`[Webhook] Event Type: ${eventType}`)
        console.log(`[Webhook] Instance: ${instanceName}`)
        console.log(`[Webhook] Full Payload:`, JSON.stringify(body, null, 2))
        console.log(`[Webhook] Validation Error:`, error)
      } else {
        console.warn(`[Webhook] Schema validation failed for event ${eventType}:`, error)
      }
      
      return NextResponse.json(
        { received: true, error: "Invalid payload format" },
        { status: 200 }
      )
    }

    if (!instanceName) {
      return NextResponse.json(
        { received: true, error: "Instance name is required" },
        { status: 200 }
      )
    }

    // Find channel account by instance name
    // externalId is the instanceName in our schema
    const channelAccount = await prisma.channelAccount.findFirst({
      where: {
        type: "whatsapp_evolution",
        externalId: instanceName,
      },
    })

    if (!channelAccount) {
      console.warn(`[Webhook] Channel not found for instance: ${instanceName}`)
      return NextResponse.json({ received: true, error: "Channel not found" }, { status: 200 })
    }

    // Get channel account metadata for baseUrl
    const channelMetadata = channelAccount.metadata as { baseUrl?: string } | null
    const baseUrl = channelMetadata?.baseUrl || ""

    // Normalize webhook
    const normalized = evolutionProvider.normalizeWebhook(
      payload,
      instanceName
    )

    if (!normalized) {
      // Not a message event we care about
      return NextResponse.json({ received: true, skipped: true }, { status: 200 })
    }

    // Handle media messages
    // If S3/Minio is configured, Evolution API provides direct mediaUrl in webhook
    // Otherwise, we need to use proxy endpoint for WhatsApp encrypted URLs
    if (normalized && (normalized.message.messageType === "video" || normalized.message.messageType === "image" || normalized.message.messageType === "audio")) {
      // Check if mediaUrl is from S3/Minio (direct access URL)
      // S3 URLs typically contain: s3.amazonaws.com, s3.[region].amazonaws.com, or minio endpoints
      const isS3Url = normalized.message.mediaUrl && 
        !normalized.message.mediaUrl.includes("mmg.whatsapp.net") &&
        (normalized.message.mediaUrl.includes("s3.amazonaws.com") ||
         normalized.message.mediaUrl.includes("s3.") ||
         normalized.message.mediaUrl.includes("minio") ||
         (normalized.message.mediaUrl.startsWith("http://") || normalized.message.mediaUrl.startsWith("https://")))
      
      if (!isS3Url) {
        // WhatsApp encrypted URL - need proxy endpoint
        const messageId = payload.data?.key?.id || normalized.message.externalMessageId
        
        if (messageId) {
          // Use our proxy endpoint to fetch from Evolution API
          normalized.message.mediaUrl = `/api/media/evolution?instance=${encodeURIComponent(instanceName)}&messageId=${encodeURIComponent(messageId)}`
        }
      }
    }

    // Generate dedupe key
    const messageId = normalized.message.externalMessageId
    const dedupeKey = generateDedupeKey(
      "evolution",
      messageId,
      normalized.message.timestamp
    )

    // Insert webhook event with deduplication
    try {
      await prisma.webhookEvent.create({
        data: {
          workspaceId: channelAccount.workspaceId,
          provider: "evolution",
          dedupeKey,
          rawPayload: payload as any,
        },
      })
    } catch (error: unknown) {
      // Deduplication conflict - event already processed
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
      }
      throw error
    }

    // Process the event
    try {
      await processInboundEvent(channelAccount.workspaceId, normalized)

      // Mark as processed
      await prisma.webhookEvent.updateMany({
        where: { dedupeKey },
        data: { processedAt: new Date() },
      })

      // Get the conversation ID for SSE broadcast
      // Find contact by searching all contacts (since handles is JSON)
      const allContacts = await prisma.contact.findMany({
        where: { workspaceId: channelAccount.workspaceId },
      })
      
      const contact = allContacts.find((c) => {
        const handles = c.handles as { wa_id?: string }
        return handles.wa_id === normalized.contactExternalId
      })

      if (contact) {
        const conversation = await prisma.conversation.findFirst({
          where: {
            workspaceId: channelAccount.workspaceId,
            channelAccountId: channelAccount.id,
            contactId: contact.id,
          },
        })

        if (conversation) {
          // Broadcast via SSE
          sseBroadcaster.broadcast(channelAccount.workspaceId, "message", {
            type: "new_message",
            conversationId: conversation.id,
            channelAccountId: channelAccount.id,
          })
        }
      }

      return NextResponse.json({ received: true, processed: true }, { status: 200 })
    } catch (error) {
      // Mark as error
      await prisma.webhookEvent.updateMany({
        where: { dedupeKey },
        data: {
          processedAt: new Date(),
          error: error instanceof Error ? error.message : "Unknown error",
        },
      })

      console.error("Error processing Evolution webhook:", error)
      return NextResponse.json(
        { error: "Processing failed" },
        { status: 500 }
      )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Evolution webhook error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

