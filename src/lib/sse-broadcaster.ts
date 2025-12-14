/**
 * Simple SSE broadcaster for real-time updates
 * In production, consider using Redis Pub/Sub or similar
 */

type SSEClient = {
  workspaceId: string
  send: (data: string) => void
}

class SSEBroadcaster {
  private clients: Map<string, SSEClient[]> = new Map()

  /**
   * Register a new SSE client
   */
  subscribe(workspaceId: string, send: (data: string) => void): () => void {
    if (!this.clients.has(workspaceId)) {
      this.clients.set(workspaceId, [])
    }

    const client: SSEClient = { workspaceId, send }
    this.clients.get(workspaceId)!.push(client)

    // Return unsubscribe function
    return () => {
      const clients = this.clients.get(workspaceId)
      if (clients) {
        const index = clients.indexOf(client)
        if (index > -1) {
          clients.splice(index, 1)
        }
        if (clients.length === 0) {
          this.clients.delete(workspaceId)
        }
      }
    }
  }

  /**
   * Broadcast event to all clients in a workspace
   */
  broadcast(workspaceId: string, event: string, data: unknown): void {
    const clients = this.clients.get(workspaceId)
    if (!clients) {
      return
    }

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

    clients.forEach((client) => {
      try {
        client.send(message)
      } catch (error) {
        // Client disconnected, will be cleaned up on next send attempt
        console.error("SSE send error:", error)
      }
    })
  }

  /**
   * Broadcast to all workspaces (admin use)
   */
  broadcastAll(event: string, data: unknown): void {
    this.clients.forEach((_, workspaceId) => {
      this.broadcast(workspaceId, event, data)
    })
  }
}

export const sseBroadcaster = new SSEBroadcaster()

