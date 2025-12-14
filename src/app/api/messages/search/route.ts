import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"

// GET /api/messages/search - Search messages
export async function GET(req: NextRequest) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get("q")
    const conversationId = searchParams.get("conversationId")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      )
    }

    // Build where clause
    const where: {
      workspaceId: string
      conversationId?: string
      body?: { contains: string; mode: "insensitive" }
    } = {
      workspaceId: context.workspaceId,
      body: {
        contains: query,
        mode: "insensitive",
      },
    }

    if (conversationId) {
      // Verify conversation belongs to workspace
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          workspaceId: context.workspaceId,
        },
      })

      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        )
      }

      where.conversationId = conversationId
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          conversation: {
            include: {
              contact: {
                select: {
                  id: true,
                  primaryName: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ])

    return NextResponse.json({
      messages,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error("Error searching messages:", error)
    return NextResponse.json(
      { error: "Failed to search messages" },
      { status: 500 }
    )
  }
}

