import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encryption"
import type { ChannelAccountMetadata } from "@/types"

// GET /api/channels - List all channels for workspace
export async function GET(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const channels = await prisma.channelAccount.findMany({
      where: {
        workspaceId: context.workspaceId,
      },
      select: {
        id: true,
        type: true,
        externalId: true,
        displayName: true,
        metadata: true,
        createdAt: true,
        // Don't return encryptedApiKey
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ channels })
  } catch (error) {
    console.error("Error fetching channels:", error)
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: 500 }
    )
  }
}

// POST /api/channels - Create new channel
const createChannelSchema = z.object({
  type: z.enum(["facebook_page", "instagram_business", "whatsapp_evolution"]),
  displayName: z.string().min(1),
  // Evolution API specific
  baseUrl: z.string().url().optional(),
  instanceName: z.string().optional(),
  apiKey: z.string().optional(),
  // Meta specific
  pageId: z.string().optional(),
  accessToken: z.string().optional(),
  // Generic metadata
  metadata: z.record(z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const body = await req.json()
    const validated = createChannelSchema.parse(body)

    // Validate based on channel type
    if (validated.type === "whatsapp_evolution") {
      if (!validated.baseUrl || !validated.instanceName || !validated.apiKey) {
        return NextResponse.json(
          { error: "baseUrl, instanceName, and apiKey are required for WhatsApp Evolution channels" },
          { status: 400 }
        )
      }

      // Encrypt API key
      const encryptedApiKey = encrypt(validated.apiKey)

      // Prepare metadata
      const metadata: ChannelAccountMetadata = {
        baseUrl: validated.baseUrl,
        instanceName: validated.instanceName,
        ...validated.metadata,
      }

      // Create channel account
      const channel = await prisma.channelAccount.create({
        data: {
          workspaceId: context.workspaceId,
          type: validated.type,
          externalId: validated.instanceName,
          displayName: validated.displayName,
          metadata,
          encryptedApiKey,
        },
      })

      return NextResponse.json(
        {
          channel: {
            id: channel.id,
            type: channel.type,
            externalId: channel.externalId,
            displayName: channel.displayName,
            metadata: channel.metadata,
            createdAt: channel.createdAt,
          },
        },
        { status: 201 }
      )
    } else if (validated.type === "facebook_page" || validated.type === "instagram_business") {
      if (!validated.pageId || !validated.accessToken) {
        return NextResponse.json(
          { error: "pageId and accessToken are required for Meta channels" },
          { status: 400 }
        )
      }

      // Encrypt access token
      const encryptedApiKey = encrypt(validated.accessToken)

      // Prepare metadata
      const metadata: ChannelAccountMetadata = {
        pageId: validated.pageId,
        ...validated.metadata,
      }

      // Create channel account
      const channel = await prisma.channelAccount.create({
        data: {
          workspaceId: context.workspaceId,
          type: validated.type,
          externalId: validated.pageId,
          displayName: validated.displayName,
          metadata,
          encryptedApiKey,
        },
      })

      return NextResponse.json(
        {
          channel: {
            id: channel.id,
            type: channel.type,
            externalId: channel.externalId,
            displayName: channel.displayName,
            metadata: channel.metadata,
            createdAt: channel.createdAt,
          },
        },
        { status: 201 }
      )
    }

    return NextResponse.json(
      { error: "Invalid channel type" },
      { status: 400 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error creating channel:", error)
    return NextResponse.json(
      { error: "Failed to create channel" },
      { status: 500 }
    )
  }
}

