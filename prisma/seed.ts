import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Create a default user
  const email = process.env.SEED_EMAIL || "admin@example.com"
  const password = process.env.SEED_PASSWORD || "admin123"

  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    console.log(`User ${email} already exists`)
    return
  }

  const passwordHash = await hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
    },
  })

  // Create default workspace
  const workspace = await prisma.workspace.create({
    data: {
      name: "Default Workspace",
      members: {
        create: {
          userId: user.id,
          role: "owner",
        },
      },
    },
  })

  console.log(`Created user: ${email}`)
  console.log(`Created workspace: ${workspace.name} (${workspace.id})`)
  console.log(`\nYou can now login with:`)
  console.log(`Email: ${email}`)
  console.log(`Password: ${password}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

