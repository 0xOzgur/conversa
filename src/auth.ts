import NextAuth, { type DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { verifyPassword, getUserByEmail } from "@/lib/auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      workspaceId: string
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    workspaceId: string
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await getUserByEmail(credentials.email as string)
        if (!user) {
          return null
        }

        const isValid = await verifyPassword(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) {
          return null
        }

        // Get user's first workspace (or create default)
        const workspaceMember = await prisma.workspaceMember.findFirst({
          where: { userId: user.id },
        })

        if (!workspaceMember) {
          // Create default workspace
          const workspace = await prisma.workspace.create({
            data: {
              name: "My Workspace",
              members: {
                create: {
                  userId: user.id,
                  role: "owner",
                },
              },
            },
          })

          return {
            id: user.id,
            email: user.email,
            workspaceId: workspace.id,
          }
        }

        return {
          id: user.id,
          email: user.email,
          workspaceId: workspaceMember.workspaceId,
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.workspaceId = user.workspaceId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.workspaceId = token.workspaceId as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})

