import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"

// GET /api/conversations - List conversations
export async function GET(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const searchParams = req.nextUrl.searchParams
    const status = searchParams.get("status") || undefined
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const where: {
      workspaceId: string
      status?: string
    } = {
      workspaceId: context.workspaceId,
    }

    if (status && ["open", "pending", "closed"].includes(status)) {
      where.status = status
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              primaryName: true,
              avatarUrl: true,
              handles: true,
            },
          },
          channelAccount: {
            select: {
              id: true,
              type: true,
              displayName: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              body: true,
              direction: true,
              messageType: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          lastMessageAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.conversation.count({ where }),
    ])

    return NextResponse.json({
      conversations,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error("Error fetching conversations:", error)
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    )
  }
}

