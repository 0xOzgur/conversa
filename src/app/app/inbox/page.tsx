"use client"

import { useEffect, useState, useRef, useCallback } from "react"
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
  rawPayload?: {
    mediaUrl?: string
    [key: string]: unknown
  }
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState("")
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "unread" | "archived">("all")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const selectedConversationRef = useRef<Conversation | null>(null)
  const loadConversationsRef = useRef<() => Promise<Conversation[]>>()
  const loadMessagesRef = useRef<(id: string) => Promise<Message[]>>()
  const filterStatusRef = useRef<"all" | "unread" | "archived">("all")
  const searchQueryRef = useRef<string>("")

  // Define applyFilters first (used by loadConversations)
  const applyFilters = useCallback((
    convs: Conversation[],
    status: "all" | "unread" | "archived",
    query: string
  ) => {
    let filtered = [...convs]

    // Apply status filter
    if (status === "unread") {
      filtered = filtered.filter((c) => c.unreadCount > 0)
    } else if (status === "archived") {
      filtered = filtered.filter((c) => c.status === "closed")
    }

    // Apply search filter
    if (query.trim()) {
      const lowerQuery = query.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.contact.primaryName.toLowerCase().includes(lowerQuery) ||
          c.channelAccount.displayName.toLowerCase().includes(lowerQuery) ||
          c.messages[0]?.body?.toLowerCase().includes(lowerQuery)
      )
    }

    setFilteredConversations(filtered)
  }, [])

  // Define loadConversations (uses applyFilters)
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations")
      const data = await res.json()
      const newConversations = data.conversations || []
      setConversations(newConversations)
      // Use refs to get latest filter values
      applyFilters(newConversations, filterStatusRef.current, searchQueryRef.current)
      
      // Update selectedConversation if it exists (to get latest data)
      setSelectedConversation((current) => {
        if (current) {
          const updated = newConversations.find((c: Conversation) => c.id === current.id)
          return updated || current
        }
        return current
      })
      
      return newConversations
    } catch (error) {
      console.error("Error loading conversations:", error)
      return []
    }
  }, [applyFilters])

  // Define loadMessages
  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`)
      const data = await res.json()
      setMessages(data.messages || [])
      return data.messages || []
    } catch (error) {
      console.error("Error loading messages:", error)
      return []
    }
  }, [])

  // Define setupSSE (uses refs, so can be defined here)
  const setupSSE = useCallback(() => {
    const eventSource = new EventSource("/api/events")

    eventSource.onerror = (error) => {
      console.error("[SSE] Connection error:", error)
    }

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === "new_message") {
          // Use refs to get latest function references (always up-to-date)
          const loadConvs = loadConversationsRef.current
          const loadMsgs = loadMessagesRef.current
          
          if (!loadConvs) {
            console.warn("loadConversations ref not available yet")
            return
          }
          
          // Always reload conversations to get latest updates
          loadConvs().then(() => {
            // If we have a conversationId and it matches the selected conversation, reload messages
            if (data.conversationId && loadMsgs) {
              // Check if this is the currently selected conversation using ref (always up-to-date)
              const current = selectedConversationRef.current
              if (current && current.id === data.conversationId) {
                // Reload messages for the selected conversation
                loadMsgs(data.conversationId).then(() => {
                  // Small delay to ensure DOM is updated, then scroll
                  setTimeout(() => {
                    scrollToBottom()
                  }, 100)
                })
              }
            }
          })
        }
      } catch (error) {
        console.error("Error parsing SSE event:", error)
      }
    }

    // Listen for the custom "message" event type
    eventSource.addEventListener("message", handleMessage)

    return () => {
      eventSource.removeEventListener("message", handleMessage)
      eventSource.close()
    }
  }, [])

  // Update refs when values change
  useEffect(() => {
    filterStatusRef.current = filterStatus
  }, [filterStatus])

  useEffect(() => {
    searchQueryRef.current = searchQuery
  }, [searchQuery])

  // Update function refs when they change
  useEffect(() => {
    loadConversationsRef.current = loadConversations
  }, [loadConversations])

  useEffect(() => {
    loadMessagesRef.current = loadMessages
  }, [loadMessages])

  // Load conversations
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Setup SSE connection (only once, not on conversation change)
  // Wait for refs to be initialized
  useEffect(() => {
    // Ensure refs are set before setting up SSE
    if (loadConversationsRef.current && loadMessagesRef.current) {
      const cleanup = setupSSE()
      return cleanup
    }
  }, [loadConversations, loadMessages, setupSSE])

  // Update ref when selectedConversation changes
  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      // Reset last message ID when switching conversations
      lastMessageIdRef.current = null
      loadMessages(selectedConversation.id)
      // Mark as read
      markAsRead(selectedConversation.id)
    }
  }, [selectedConversation, loadMessages])

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

  // Apply filters when conversations, filterStatus, or searchQuery changes
  useEffect(() => {
    applyFilters(conversations, filterStatus, searchQuery)
  }, [conversations, filterStatus, searchQuery, applyFilters])


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
        loadConversations()
        
        // Reset lastMessageIdRef so auto-scroll will trigger when new message arrives
        lastMessageIdRef.current = null
        
        // Wait a bit for webhook to process, then reload messages and scroll
        setTimeout(() => {
          loadMessages(selectedConversation.id).then(() => {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
              scrollToBottom()
            }, 100)
          })
        }, 500)
      }
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setLoading(false)
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
      <div className="w-80 border-r overflow-y-auto flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold mb-3">Conversations</h2>
          
          {/* Search Input */}
          <div className="mb-3">
            <Input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex gap-2">
            <Button
              variant={filterStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("all")}
            >
              All
            </Button>
            <Button
              variant={filterStatus === "unread" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("unread")}
            >
              Unread
            </Button>
            <Button
              variant={filterStatus === "archived" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus("archived")}
            >
              Archived
            </Button>
          </div>
        </div>
        <div className="divide-y flex-1 overflow-y-auto">
          {filteredConversations.map((conv) => (
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
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{selectedConversation.contact.primaryName}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedConversation.channelAccount.displayName}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const newStatus = selectedConversation.status === "closed" ? "open" : "closed"
                    try {
                      await fetch(`/api/conversations/${selectedConversation.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: newStatus }),
                      })
                      loadConversations()
                      if (newStatus === "closed") {
                        setSelectedConversation(null)
                      }
                    } catch (error) {
                      console.error("Error updating conversation status:", error)
                    }
                  }}
                >
                  {selectedConversation.status === "closed" ? "Unarchive" : "Archive"}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => {
                const mediaUrl = msg.rawPayload?.mediaUrl as string | undefined
                return (
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
                      {/* Media Content */}
                      {msg.messageType === "image" && mediaUrl && (
                        <div className="mb-2">
                          <img
                            src={mediaUrl}
                            alt="Image"
                            className="max-w-full rounded-md"
                            onError={(e) => {
                              // Fallback if image fails to load
                              e.currentTarget.style.display = "none"
                            }}
                          />
                        </div>
                      )}
                      {msg.messageType === "video" && mediaUrl && (
                        <div className="mb-2">
                          <video
                            src={mediaUrl}
                            controls
                            className="max-w-full rounded-md"
                            onError={(e) => {
                              e.currentTarget.style.display = "none"
                            }}
                          >
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      )}
                      {msg.messageType === "audio" && mediaUrl && (
                        <div className="mb-2">
                          <audio src={mediaUrl} controls className="w-full">
                            Your browser does not support the audio tag.
                          </audio>
                        </div>
                      )}
                      {/* Text Content */}
                      {msg.body && (
                        <div className="text-sm">{msg.body}</div>
                      )}
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
                )
              })}
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
            <div className="text-center">
              <p className="mb-4">Select a conversation to start messaging</p>
              <Button
                variant="outline"
                onClick={async () => {
                  const query = prompt("Enter search query:")
                  if (query && query.trim()) {
                    try {
                      const res = await fetch(`/api/messages/search?q=${encodeURIComponent(query)}`)
                      const data = await res.json()
                      if (data.messages && data.messages.length > 0) {
                        alert(`Found ${data.messages.length} message(s)`)
                        // You could open a search results modal here
                      } else {
                        alert("No messages found")
                      }
                    } catch (error) {
                      console.error("Error searching messages:", error)
                      alert("Error searching messages")
                    }
                  }
                }}
              >
                Search Messages
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

