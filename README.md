# Unified Inbox

A production-ready unified inbox system for managing customer communication across multiple channels: WhatsApp (Evolution API), Instagram, and Facebook.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: NextAuth.js (Credentials provider)
- **UI**: Tailwind CSS + shadcn/ui
- **Realtime**: Server-Sent Events (SSE)
- **Validation**: Zod
- **Package Manager**: pnpm

## Features

- Multi-channel support (WhatsApp, Instagram, Facebook)
- Multi-tenant architecture (workspace-scoped)
- Real-time message updates via SSE
- Encrypted API key storage
- Webhook deduplication
- Clean, scalable architecture

## Prerequisites

- Node.js 20+
- PostgreSQL database
- pnpm installed (`npm install -g pnpm`)

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Variables

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/unified_inbox?schema=public"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here-generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Encryption (32 bytes hex or any string - will be derived)
ENCRYPTION_KEY="your-32-byte-hex-key-or-any-string"

# Optional: For production
NODE_ENV="development"
```

**Generate encryption key:**
```bash
# Option 1: Generate 32-byte hex key
openssl rand -hex 32

# Option 2: Use any string (will be derived using PBKDF2)
```

**Generate NextAuth secret:**
```bash
openssl rand -base64 32
```

### 3. Database Setup

```bash
# Generate Prisma Client
pnpm db:generate

# Push schema to database (for development)
pnpm db:push

# Or run migrations (for production)
pnpm db:migrate

# Seed database with default user (optional)
# Set SEED_EMAIL and SEED_PASSWORD in .env or use defaults
pnpm db:seed
```

**Default seed credentials:**
- Email: `admin@example.com`
- Password: `admin123`

You can customize these by setting `SEED_EMAIL` and `SEED_PASSWORD` environment variables.

### 4. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Webhook Configuration

### Evolution API Webhook

**URL**: `https://your-domain.com/api/webhooks/evolution`

**Method**: POST

**Headers**: 
- `Content-Type: application/json`

**Configuration in Evolution API**:
- Set webhook URL in your Evolution API instance settings
- Ensure webhook is enabled for message events

### Meta (Facebook/Instagram) Webhook

**Verification URL**: `https://your-domain.com/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=CHALLENGE_STRING`

**Webhook URL**: `https://your-domain.com/api/webhooks/meta`

**Method**: POST

**Configuration**:
1. Go to Meta App Dashboard
2. Add webhook subscription
3. Subscribe to: `messages`, `messaging_postbacks`, `message_reads`
4. For Instagram: Subscribe to `messages`, `messaging_seen`
5. Set verify token in your environment

## Testing Webhooks Locally

### Using ngrok

1. Install ngrok: `npm install -g ngrok` or download from [ngrok.com](https://ngrok.com)

2. Start your Next.js dev server:
   ```bash
   pnpm dev
   ```

3. Expose local server:
   ```bash
   ngrok http 3000
   ```

4. Use the ngrok URL (e.g., `https://abc123.ngrok.io`) for webhook configuration:
   - Evolution API: `https://abc123.ngrok.io/api/webhooks/evolution`
   - Meta: `https://abc123.ngrok.io/api/webhooks/meta`

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── channels/      # Channel management
│   │   ├── webhooks/      # Webhook handlers
│   │   ├── conversations/ # Conversation endpoints
│   │   └── events/        # SSE endpoint
│   ├── login/             # Login page
│   ├── app/               # Protected app routes
│   │   ├── inbox/         # Inbox UI
│   │   └── settings/      # Settings pages
│   └── layout.tsx         # Root layout
├── components/            # React components (shadcn/ui)
├── lib/                   # Utilities
│   ├── encryption.ts     # Encryption utilities
│   ├── prisma.ts          # Prisma client
│   └── utils.ts           # General utilities
├── providers/             # Channel providers
│   ├── evolution/         # Evolution API provider
│   └── meta/              # Meta provider
└── types/                 # TypeScript types
```

## Development Commands

```bash
# Development
pnpm dev

# Build
pnpm build

# Start production server
pnpm start

# Database
pnpm db:generate    # Generate Prisma Client
pnpm db:push        # Push schema (dev)
pnpm db:migrate     # Run migrations
pnpm db:studio      # Open Prisma Studio
```

## Architecture Notes

### Multi-Tenancy

All queries are scoped by `workspaceId`. Ensure every database query includes workspace filtering.

### Encryption

API keys are encrypted using AES-256-GCM before storage. The encryption key is derived from `ENCRYPTION_KEY` environment variable.

### Webhook Deduplication

All webhook events are deduplicated using a unique `dedupeKey` (provider + messageId + timestamp). This prevents duplicate message processing.

### Real-time Updates

Server-Sent Events (SSE) are used for real-time message updates. Clients connect to `/api/events` and receive updates when new messages arrive.

## License

MIT

