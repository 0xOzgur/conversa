import { compare, hash } from "bcryptjs"
import { prisma } from "./prisma"

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword)
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: {
      workspaceMembers: {
        include: {
          workspace: true,
        },
      },
    },
  })
}

export async function createUser(email: string, password: string) {
  const passwordHash = await hashPassword(password)
  return prisma.user.create({
    data: {
      email,
      passwordHash,
    },
  })
}

export async function getOrCreateDefaultWorkspace(userId: string) {
  // Check if user already has a workspace
  const existingMember = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
  })

  if (existingMember) {
    return existingMember.workspace
  }

  // Create default workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: "My Workspace",
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
  })

  return workspace
}

