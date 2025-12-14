import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"

// GET /api/conversations/[id]/messages - Get messages for conversation
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    // Verify conversation belongs to workspace
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        workspaceId: context.workspaceId,
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: {
          conversationId: params.id,
          workspaceId: context.workspaceId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({
        where: {
          conversationId: params.id,
          workspaceId: context.workspaceId,
        },
      }),
    ])

    // Reverse to show oldest first
    messages.reverse()

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
    console.error("Error fetching messages:", error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }
}

