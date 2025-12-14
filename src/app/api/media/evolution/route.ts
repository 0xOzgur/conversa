import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

// GET /api/media/evolution - Proxy media from Evolution API
export async function GET(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const searchParams = req.nextUrl.searchParams
    const instanceName = searchParams.get("instance")
    const messageId = searchParams.get("messageId")

    if (!instanceName || !messageId) {
      return NextResponse.json(
        { error: "instance and messageId are required" },
        { status: 400 }
      )
    }

    // Find channel account
    const channelAccount = await prisma.channelAccount.findFirst({
      where: {
        type: "whatsapp_evolution",
        externalId: instanceName,
        workspaceId: context.workspaceId,
      },
    })

    if (!channelAccount) {
      return NextResponse.json(
        { error: "Channel account not found" },
        { status: 404 }
      )
    }

    // Get baseUrl and API key from metadata
    const metadata = channelAccount.metadata as { baseUrl?: string } | null
    const baseUrl = metadata?.baseUrl || ""

    if (!baseUrl) {
      return NextResponse.json(
        { error: "Base URL not configured" },
        { status: 400 }
      )
    }

    // Decrypt API key
    const apiKey = decrypt(channelAccount.encryptedApiKey)

    // Get message from database to extract message key info
    const message = await prisma.message.findFirst({
      where: {
        externalMessageId: messageId,
        workspaceId: context.workspaceId,
      },
      select: {
        rawPayload: true,
      },
    })

    if (!message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      )
    }

    // Extract message key from rawPayload (Evolution API webhook format)
    const rawPayload = message.rawPayload as any
    const messageKey = rawPayload?.data?.key

    if (!messageKey) {
      return NextResponse.json(
        { error: "Message key not found in payload" },
        { status: 400 }
      )
    }

    const cleanBaseUrl = baseUrl.replace(/\/$/, "")
    
    // Extract media URL and message data from rawPayload
    const videoMessage = rawPayload?.data?.message?.videoMessage
    const imageMessage = rawPayload?.data?.message?.imageMessage
    const audioMessage = rawPayload?.data?.message?.audioMessage
    const whatsappMediaUrl = videoMessage?.url || imageMessage?.url || audioMessage?.url
    
    console.log(`[Media Proxy] Message key:`, { remoteJid: messageKey.remoteJid, id: messageKey.id })
    console.log(`[Media Proxy] WhatsApp media URL:`, whatsappMediaUrl)

    // Try different Evolution API endpoint formats
    let response: Response | null = null

    // Format 1: POST /message/fetchMedia (without instance in path)
    let mediaUrl = `${cleanBaseUrl}/message/fetchMedia`
    console.log(`[Media Proxy] Trying format 1: POST ${mediaUrl}`)
    response = await fetch(mediaUrl, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: messageKey,
      }),
    })
    
    if (response.ok) {
      console.log(`[Media Proxy] ✅ Format 1 succeeded!`)
    } else {
      console.log(`[Media Proxy] Format 1 failed (${response.status})`)

      // Format 2: POST /instance/{instance}/message/fetchMedia
      mediaUrl = `${cleanBaseUrl}/instance/${instanceName}/message/fetchMedia`
      console.log(`[Media Proxy] Trying format 2: POST ${mediaUrl}`)
      response = await fetch(mediaUrl, {
        method: "POST",
        headers: {
          apikey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: messageKey,
        }),
      })
      
      if (response.ok) {
        console.log(`[Media Proxy] ✅ Format 2 succeeded!`)
      } else {
        console.log(`[Media Proxy] Format 2 failed (${response.status})`)

        // Format 3: GET /message/fetchMedia/{messageId}
        mediaUrl = `${cleanBaseUrl}/message/fetchMedia/${messageId}`
        console.log(`[Media Proxy] Trying format 3: GET ${mediaUrl}`)
        response = await fetch(mediaUrl, {
          headers: {
            apikey: apiKey,
          },
        })
        
        if (response.ok) {
          console.log(`[Media Proxy] ✅ Format 3 succeeded!`)
        } else {
          console.log(`[Media Proxy] Format 3 failed (${response.status})`)
          
          // Format 4: Try using WhatsApp URL directly (Evolution API might proxy it)
          // Note: WhatsApp URLs are encrypted, but Evolution API might handle them
          if (whatsappMediaUrl && whatsappMediaUrl.startsWith("http")) {
            console.log(`[Media Proxy] Trying format 4: Direct WhatsApp URL (may not work - encrypted)`)
            // Try to fetch directly - this will likely fail but worth trying
            response = await fetch(whatsappMediaUrl, {
              headers: {
                "User-Agent": "WhatsApp",
              },
            })
            
            if (response.ok) {
              console.log(`[Media Proxy] ✅ Format 4 succeeded (direct WhatsApp URL worked!)`)
            } else {
              console.log(`[Media Proxy] Format 4 failed (${response.status}) - WhatsApp URL is encrypted`)
              // Return helpful error
              return NextResponse.json(
                { 
                  error: "Evolution API fetchMedia endpoint not found",
                  message: "Could not find a working fetchMedia endpoint. Please check your Evolution API documentation.",
                  triedFormats: [
                    "POST /message/fetchMedia",
                    `POST /instance/${instanceName}/message/fetchMedia`,
                    `GET /message/fetchMedia/${messageId}`,
                    "Direct WhatsApp URL (encrypted)"
                  ],
                  suggestion: "Check Evolution API documentation for the correct media fetch endpoint, or contact Evolution API support."
                },
                { status: 404 }
              )
            }
          } else {
            return NextResponse.json(
              { 
                error: "Evolution API fetchMedia endpoint not found and no WhatsApp URL available",
                triedFormats: [
                  "POST /message/fetchMedia",
                  `POST /instance/${instanceName}/message/fetchMedia`,
                  `GET /message/fetchMedia/${messageId}`
                ]
              },
              { status: 404 }
            )
          }
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error(`[Media Proxy] Evolution API media fetch failed: ${response.status} ${response.statusText} - ${errorText}`)
      return NextResponse.json(
        { error: "Failed to fetch media", details: errorText },
        { status: response.status }
      )
    }
    
    console.log(`[Media Proxy] Successfully fetched media, content-type: ${response.headers.get("content-type")}`)

    // Get content type from response
    const contentType = response.headers.get("content-type") || "application/octet-stream"

    // Return media with proper content type
    const mediaBuffer = await response.arrayBuffer()
    return new NextResponse(mediaBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("Error fetching media:", error)
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 500 }
    )
  }
}

