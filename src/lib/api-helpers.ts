import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Get authenticated user and workspace from request
 */
export async function getAuthContext() {
  const session = await auth()
  
  if (!session?.user?.id || !session?.user?.workspaceId) {
    return null
  }

  return {
    userId: session.user.id,
    workspaceId: session.user.workspaceId,
  }
}

/**
 * Require authentication - returns auth context or error response
 */
export async function requireAuth() {
  const context = await getAuthContext()
  
  if (!context) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
      context: null,
    }
  }

  return {
    error: null,
    context,
  }
}

/**
 * Parse JSON body with error handling
 */
export async function parseJsonBody<T>(req: NextRequest): Promise<T | null> {
  try {
    return await req.json()
  } catch (error) {
    return null
  }
}

