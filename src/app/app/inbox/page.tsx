"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Conversation {
  id: string
  status: string
  unreadCount: number
  lastMessageAt: string
  contact: {
    id: string
    primaryName: string
    avatarUrl: string | null
  }
  channelAccount: {
    id: string
    type: string
    displayName: string
  }
  messages: Array<{
    id: string
    body: string | null
    direction: string
    createdAt: string
  }>
}

interface Message {
  id: string
  body: string | null
  direction: string
  messageType: string
  createdAt: string
  sentAt: string | null
  receivedAt: string | null
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)

  // Load conversations
  useEffect(() => {
    loadConversations()
  }, [])

  // Setup SSE connection (only once, not on conversation change)
  useEffect(() => {
    const cleanup = setupSSE()
    return cleanup
  }, [])

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      // Reset last message ID when switching conversations
      lastMessageIdRef.current = null
      loadMessages(selectedConversation.id)
      // Mark as read
      markAsRead(selectedConversation.id)
    }
  }, [selectedConversation])

  // Auto-scroll to bottom when new message is added
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      // Only scroll if it's a new message (different ID)
      if (lastMessage.id !== lastMessageIdRef.current) {
        lastMessageIdRef.current = lastMessage.id
        // Small delay to ensure DOM is updated
        setTimeout(() => {
          scrollToBottom()
        }, 100)
      }
    }
  }, [messages])

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/conversations")
      const data = await res.json()
      const newConversations = data.conversations || []
      setConversations(newConversations)
      
      // Don't update selectedConversation here to avoid loops
      // The conversation list is updated, and if user clicks on it, it will be selected fresh
      
      return newConversations
    } catch (error) {
      console.error("Error loading conversations:", error)
      return []
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error("Error loading messages:", error)
    }
  }

  const markAsRead = async (conversationId: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unreadCount: 0 }),
      })
      // Update conversations list but don't trigger full reload to avoid loops
      loadConversations()
    } catch (error) {
      console.error("Error marking as read:", error)
    }
  }

  const sendMessage = async () => {
    if (!selectedConversation || !messageText.trim()) return

    setLoading(true)
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          text: messageText,
        }),
      })

      if (res.ok) {
        setMessageText("")
        loadMessages(selectedConversation.id)
        loadConversations()
      }
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setLoading(false)
    }
  }

  const setupSSE = () => {
    const eventSource = new EventSource("/api/events")

    eventSource.onopen = () => {
      console.log("SSE connection opened")
    }

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error)
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        console.log("SSE event received:", data)
        
        if (data.type === "new_message") {
          // Always reload conversations to get latest updates
          loadConversations()
          
          // If we have a conversationId and it matches the selected conversation, reload messages
          if (data.conversationId) {
            // Check if this is the currently selected conversation without causing re-render
            setSelectedConversation((current) => {
              if (current && current.id === data.conversationId) {
                // Reload messages for the selected conversation
                loadMessages(data.conversationId)
              }
              return current // Don't change state, just check and reload messages
            })
          }
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error)
      }
    }

    eventSource.addEventListener("message", handleMessage)

    return () => {
      eventSource.removeEventListener("message", handleMessage)
      eventSource.close()
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="flex h-full">
      {/* Conversation List */}
      <div className="w-80 border-r overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Conversations</h2>
        </div>
        <div className="divide-y">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              className={`w-full p-4 text-left hover:bg-accent ${
                selectedConversation?.id === conv.id ? "bg-accent" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{conv.contact.primaryName}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {conv.channelAccount.displayName}
                  </div>
                  {conv.messages[0] && (
                    <div className="text-sm text-muted-foreground truncate mt-1">
                      {conv.messages[0].body}
                    </div>
                  )}
                </div>
                <div className="ml-2 text-xs text-muted-foreground">
                  {formatTime(conv.lastMessageAt)}
                </div>
              </div>
              {conv.unreadCount > 0 && (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary text-primary-foreground">
                    {conv.unreadCount}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Message Thread */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            <div className="p-4 border-b">
              <h2 className="font-semibold">{selectedConversation.contact.primaryName}</h2>
              <p className="text-sm text-muted-foreground">
                {selectedConversation.channelAccount.displayName}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-3 ${
                      msg.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="text-sm">{msg.body}</div>
                    <div
                      className={`text-xs mt-1 ${
                        msg.direction === "outbound"
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  sendMessage()
                }}
                className="flex gap-2"
              >
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  disabled={loading}
                />
                <Button type="submit" disabled={loading || !messageText.trim()}>
                  Send
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a conversation to start messaging
          </div>
        )}
      </div>
    </div>
  )
}

