import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api-helpers"
import { prisma } from "@/lib/prisma"

// GET /api/conversations/[id] - Get single conversation
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
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: params.id,
        workspaceId: context.workspaceId,
      },
      include: {
        contact: true,
        channelAccount: {
          select: {
            id: true,
            type: true,
            displayName: true,
            metadata: true,
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    console.error("Error fetching conversation:", error)
    return NextResponse.json(
      { error: "Failed to fetch conversation" },
      { status: 500 }
    )
  }
}

// PATCH /api/conversations/[id] - Update conversation (status, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth()
  if (authResult.error) {
    return authResult.error
  }

  const { context } = authResult

  try {
    const body = await req.json()
    const { status, unreadCount } = body

    const updateData: {
      status?: string
      unreadCount?: number
    } = {}

    if (status && ["open", "pending", "closed"].includes(status)) {
      updateData.status = status
    }

    if (typeof unreadCount === "number") {
      updateData.unreadCount = Math.max(0, unreadCount)
    }

    const conversation = await prisma.conversation.updateMany({
      where: {
        id: params.id,
        workspaceId: context.workspaceId,
      },
      data: updateData,
    })

    if (conversation.count === 0) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      )
    }

    const updated = await prisma.conversation.findUnique({
      where: { id: params.id },
    })

    return NextResponse.json({ conversation: updated })
  } catch (error) {
    console.error("Error updating conversation:", error)
    return NextResponse.json(
      { error: "Failed to update conversation" },
      { status: 500 }
    )
  }
}

