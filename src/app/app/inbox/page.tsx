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
    handles: {
      wa_id?: string
      ig_id?: string
      fb_psid?: string
    }
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const lastMarkedReadRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "unread" | "archived">("all")
  const [showProfilePanel, setShowProfilePanel] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const selectedConversationRef = useRef<Conversation | null>(null)
  const isUserScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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
    } else if (status === "all") {
      // "All" is now "Active" - exclude archived conversations
      filtered = filtered.filter((c) => c.status !== "closed")
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
      
      const loadConvs = loadConversationsRef.current
      const loadMsgs = loadMessagesRef.current

      // Handle message update (e.g., when mediaUrl is added to outbound message)
      if (data.type === "message_updated" && data.message && data.conversationId) {
        const current = selectedConversationRef.current
        if (current && current.id === data.conversationId && loadMsgs) {
          // Reload messages to get updated mediaUrl
          loadMsgs(data.conversationId).then(() => {
            if (!isUserScrollingRef.current) {
              setTimeout(() => {
                if (!isUserScrollingRef.current) {
                  scrollToBottom()
                }
              }, 200)
            }
          })
        }
        return // Don't reload conversations for message updates
      }

      // Always reload conversations on any SSE event (fallback for missing type)
      if (loadConvs) {
        loadConvs().then(() => {
          // If we have a conversationId and it matches the selected conversation, reload messages
          if (data.conversationId && loadMsgs) {
            const current = selectedConversationRef.current
            if (current && current.id === data.conversationId) {
              loadMsgs(data.conversationId).then(() => {
                if (!isUserScrollingRef.current) {
                  setTimeout(() => {
                    if (!isUserScrollingRef.current) {
                      scrollToBottom()
                    }
                  }, 200)
                }
              })
            }
          }
        })
      }

      if (data.type === "conversation_deleted") {
        // Reload conversations to remove deleted conversation
        const loadConvs = loadConversationsRef.current
        if (loadConvs) {
          loadConvs().then(() => {
            // If the deleted conversation was selected, clear selection
            const current = selectedConversationRef.current
            if (current && current.id === data.conversationId) {
              setSelectedConversation(null)
              setMessages([])
            }
          })
        }
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

  // Setup SSE connection (only once). Refs are updated separately.
  useEffect(() => {
    const cleanup = setupSSE()
    return cleanup
  }, [setupSSE])

  // Update ref when selectedConversation changes
  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      // Reset last message ID when switching conversations
      lastMessageIdRef.current = null
      // Reset last marked read guard when switching conversation
      lastMarkedReadRef.current = null
      isUserScrollingRef.current = false
      loadMessages(selectedConversation.id).then(() => {
        // Scroll to bottom when conversation is first loaded
        setTimeout(() => {
          scrollToBottom()
        }, 200)
      })
      // Mark as read
      if (selectedConversation.unreadCount > 0) {
        markAsRead(selectedConversation.id)
        lastMarkedReadRef.current = selectedConversation.id
      }
    }
  }, [selectedConversation, loadMessages])


  // Apply filters when conversations, filterStatus, or searchQuery changes
  useEffect(() => {
    applyFilters(conversations, filterStatus, searchQuery)
  }, [conversations, filterStatus, searchQuery, applyFilters])


  const markAsRead = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unreadCount: 0 }),
      })
      if (!res.ok) {
        if (res.status === 404) {
          // Conversation no longer exists; clear selection and refresh list
          setConversations((prev) => prev.filter((c) => c.id !== conversationId))
          setSelectedConversation((prev) =>
            prev && prev.id === conversationId ? null : prev
          )
        }
        return
      }
      // Optimistic update
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c
        )
      )
      setSelectedConversation((prev) =>
        prev && prev.id === conversationId ? { ...prev, unreadCount: 0 } : prev
      )
    } catch (error) {
      console.error("Error marking as read:", error)
    }
  }

  const markAsUnread = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unreadCount: 1 }),
      })
      if (!res.ok) {
        if (res.status === 404) {
          setConversations((prev) => prev.filter((c) => c.id !== conversationId))
          setSelectedConversation((prev) =>
            prev && prev.id === conversationId ? null : prev
          )
        }
        return
      }
      // Optimistic update
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: 1 } : c
        )
      )
      setSelectedConversation((prev) =>
        prev && prev.id === conversationId ? { ...prev, unreadCount: 1 } : prev
      )
    } catch (error) {
      console.error("Error marking as unread:", error)
    }
  }

  const sendMessage = async () => {
    if (!selectedConversation || (!messageText.trim() && !selectedFile)) return

    setLoading(true)
    try {
      let payload: any = {
        conversationId: selectedConversation.id,
      }

      // If file is selected, convert to base64 and send as media
      if (selectedFile) {
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            try {
              // Read as ArrayBuffer for more reliable base64 conversion
              const arrayBuffer = reader.result as ArrayBuffer
              const bytes = new Uint8Array(arrayBuffer)
              
              // Convert to base64 using binary string method
              let binary = ""
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i])
              }
              const base64 = btoa(binary)
              resolve(base64)
            } catch (error) {
              // Fallback to data URL method if ArrayBuffer fails
              const result = reader.result as string
              let base64 = result.includes(",") ? result.split(",")[1] : result
              base64 = base64.replace(/\s/g, "")
              resolve(base64)
            }
          }
          reader.onerror = reject
          // Read as ArrayBuffer instead of DataURL for more reliable conversion
          reader.readAsArrayBuffer(selectedFile)
        })

        // Determine media type from file
        const mimeType = selectedFile.type || "application/octet-stream"
        let mediaType: "image" | "video" | "audio" | "document" = "document"
        if (mimeType.startsWith("image/")) {
          mediaType = "image"
        } else if (mimeType.startsWith("video/")) {
          mediaType = "video"
        } else if (mimeType.startsWith("audio/")) {
          mediaType = "audio"
        }

        payload = {
          ...payload,
          mediaBase64: fileBase64,
          fileName: selectedFile.name,
          mimeType,
          mediaType,
          text: messageText.trim() || undefined, // Caption if provided
        }
      } else {
        // Text only message
        payload.text = messageText.trim()
      }

      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setMessageText("")
        setSelectedFile(null)
        loadConversations()
        
        // Reset lastMessageIdRef so auto-scroll will trigger when new message arrives
        lastMessageIdRef.current = null
        
        // Wait a bit for webhook to process, then reload messages and scroll
        setTimeout(() => {
          loadMessages(selectedConversation.id).then(() => {
            if (!isUserScrollingRef.current) {
              setTimeout(() => {
                if (!isUserScrollingRef.current) {
                  scrollToBottom()
                }
              }, 200)
            }
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

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case "whatsapp_evolution":
        return "💬"
      case "facebook_page":
        return "📘"
      case "instagram_business":
        return "📷"
      default:
        return "💬"
    }
  }

  const getChannelColor = (channelType: string) => {
    switch (channelType) {
      case "whatsapp_evolution":
        return "bg-green-100 text-green-700 border-green-200"
      case "facebook_page":
        return "bg-blue-100 text-blue-700 border-blue-200"
      case "instagram_business":
        return "bg-pink-100 text-pink-700 border-pink-200"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  const getMessageStatusDisplay = (msg: Message) => {
    // Only show ticks for outbound messages
    if (msg.direction !== "outbound") return null

    const raw = msg.rawPayload as any
    const status = raw?.status || raw?.data?.status || raw?.messageStatus

    if (status && typeof status === "string") {
      const s = status.toLowerCase()
      if (s.includes("read")) {
        return { icon: "✓✓", className: "text-sky-500", label: "Read" }
      }
      if (s.includes("delivery") || s.includes("delivered") || s.includes("server")) {
        return { icon: "✓✓", className: "text-muted-foreground", label: "Delivered" }
      }
      if (s.includes("pending")) {
        return { icon: "✓", className: "text-muted-foreground", label: "Pending" }
      }
    }

    return { icon: "✓", className: "text-muted-foreground", label: "Sent" }
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
              Active
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
                  <div className="font-medium truncate">
                    {conv.contact.primaryName}
                  </div>
                  <div className="text-sm text-muted-foreground truncate flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${getChannelColor(
                        conv.channelAccount.type
                      )}`}
                    >
                      {getChannelIcon(conv.channelAccount.type)}
                    </span>
                    <span>
                      {conv.channelAccount.type === "whatsapp_evolution"
                        ? "WhatsApp"
                        : conv.channelAccount.type === "facebook_page"
                        ? "Facebook"
                        : conv.channelAccount.type === "instagram_business"
                        ? "Instagram"
                        : "Unknown"}
                    </span>
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
      <div className="flex-1 flex flex-col relative">
        {selectedConversation ? (
          <>
            {/* Profile Panel */}
            {showProfilePanel && (
              <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l z-10 overflow-y-auto">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-semibold">Contact Details</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowProfilePanel(false)}
                  >
                    ✕
                  </Button>
                </div>
                <div className="p-4 space-y-4">
                  {/* Avatar */}
                  <div className="flex flex-col items-center">
                    {selectedConversation.contact.avatarUrl ? (
                      <img
                        src={selectedConversation.contact.avatarUrl}
                        alt={selectedConversation.contact.primaryName}
                        className="w-24 h-24 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center text-3xl">
                        {selectedConversation.contact.primaryName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <h3 className="mt-3 font-semibold text-lg">
                      {selectedConversation.contact.primaryName}
                    </h3>
                  </div>

                  {/* Channel Info */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase">
                        Channel
                      </label>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm border ${getChannelColor(
                            selectedConversation.channelAccount.type
                          )}`}
                        >
                          {getChannelIcon(selectedConversation.channelAccount.type)}
                        </span>
                        <span className="text-sm">
                          {selectedConversation.channelAccount.type === "whatsapp_evolution"
                            ? "WhatsApp"
                            : selectedConversation.channelAccount.type === "facebook_page"
                            ? "Facebook"
                            : selectedConversation.channelAccount.type === "instagram_business"
                            ? "Instagram"
                            : "Unknown"}
                        </span>
                      </div>
                    </div>

                    {/* WhatsApp Phone */}
                    {selectedConversation.channelAccount.type === "whatsapp_evolution" &&
                      selectedConversation.contact.handles.wa_id && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase">
                            Phone Number
                          </label>
                          <div className="mt-1">
                            <a
                              href={`https://wa.me/${selectedConversation.contact.handles.wa_id.replace(/[^0-9]/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-2"
                            >
                              {selectedConversation.contact.handles.wa_id}
                              <span className="text-xs">↗</span>
                            </a>
                          </div>
                        </div>
                      )}

                    {/* Facebook Profile */}
                    {selectedConversation.channelAccount.type === "facebook_page" &&
                      selectedConversation.contact.handles.fb_psid && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase">
                            Facebook Profile
                          </label>
                          <div className="mt-1">
                            <a
                              href={`https://facebook.com/${selectedConversation.contact.handles.fb_psid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-2"
                            >
                              View Profile
                              <span className="text-xs">↗</span>
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              ID: {selectedConversation.contact.handles.fb_psid}
                            </p>
                          </div>
                        </div>
                      )}

                    {/* Instagram Profile */}
                    {selectedConversation.channelAccount.type === "instagram_business" &&
                      selectedConversation.contact.handles.ig_id && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground uppercase">
                            Instagram Profile
                          </label>
                          <div className="mt-1">
                            <a
                              href={`https://instagram.com/${selectedConversation.contact.handles.ig_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex items-center gap-2"
                            >
                              View Profile
                              <span className="text-xs">↗</span>
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              ID: {selectedConversation.contact.handles.ig_id}
                            </p>
                          </div>
                        </div>
                      )}

                    {/* All Handles */}
                    {(selectedConversation.contact.handles.wa_id ||
                      selectedConversation.contact.handles.ig_id ||
                      selectedConversation.contact.handles.fb_psid) && (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase">
                          All Identifiers
                        </label>
                        <div className="mt-1 space-y-1">
                          {selectedConversation.contact.handles.wa_id && (
                            <div className="text-xs text-muted-foreground">
                              WhatsApp: {selectedConversation.contact.handles.wa_id}
                            </div>
                          )}
                          {selectedConversation.contact.handles.ig_id && (
                            <div className="text-xs text-muted-foreground">
                              Instagram: {selectedConversation.contact.handles.ig_id}
                            </div>
                          )}
                          {selectedConversation.contact.handles.fb_psid && (
                            <div className="text-xs text-muted-foreground">
                              Facebook: {selectedConversation.contact.handles.fb_psid}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">
                  {selectedConversation.contact.primaryName}
                </h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${getChannelColor(
                      selectedConversation.channelAccount.type
                    )}`}
                  >
                    {getChannelIcon(selectedConversation.channelAccount.type)}
                  </span>
                  <span>
                    {selectedConversation.channelAccount.type === "whatsapp_evolution"
                      ? "WhatsApp"
                      : selectedConversation.channelAccount.type === "facebook_page"
                      ? "Facebook"
                      : selectedConversation.channelAccount.type === "instagram_business"
                      ? "Instagram"
                      : "Unknown"}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProfilePanel(!showProfilePanel)}
                >
                  👤 Profile
                </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const run = async () => {
                      try {
                        if (selectedConversation.status === "closed") {
                          // If archived, unarchive then mark unread
                          await fetch(`/api/conversations/${selectedConversation.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "open" }),
                          })
                          await markAsUnread(selectedConversation.id)
                        } else if (selectedConversation.unreadCount > 0) {
                          await markAsRead(selectedConversation.id)
                        } else {
                          await markAsUnread(selectedConversation.id)
                        }
                      } catch (err) {
                        console.error("Error toggling read/unread:", err)
                      }
                    }
                    run()
                  }}
                >
                  {selectedConversation.unreadCount > 0 ? "Mark Read" : "Mark Unread"}
                </Button>
              </div>
            </div>
            <div
              ref={messagesContainerRef}
              className={`flex-1 overflow-y-auto p-4 space-y-4 ${showProfilePanel ? "mr-80" : ""}`}
              onScroll={(e) => {
                const container = e.currentTarget
                const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
                
                // Clear any pending scroll timeout
                if (scrollTimeoutRef.current) {
                  clearTimeout(scrollTimeoutRef.current)
                  scrollTimeoutRef.current = null
                }
                
                // If user scrolled up (more than 100px from bottom), mark as manually scrolling
                if (distanceFromBottom > 100) {
                  isUserScrollingRef.current = true
                  
                  // Keep the flag true for 10 seconds after user stops scrolling
                  scrollTimeoutRef.current = setTimeout(() => {
                    isUserScrollingRef.current = false
                    scrollTimeoutRef.current = null
                  }, 10000)
                } else {
                  // User scrolled back to bottom, allow auto-scroll immediately
                  isUserScrollingRef.current = false
                }
              }}
            >
              {messages.map((msg) => {
                const mediaUrl = msg.rawPayload?.mediaUrl as string | undefined
                // Debug: Log media messages only for inbound (outbound messages may not have URL immediately)
                if (msg.messageType !== "text" && !mediaUrl && msg.direction === "inbound") {
                  console.warn("Media message without URL:", {
                    id: msg.id,
                    messageType: msg.messageType,
                    rawPayload: msg.rawPayload,
                  })
                }
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
                      {msg.messageType === "image" && (
                        <div className="mb-2">
                          {mediaUrl ? (
                            <img
                              src={mediaUrl}
                              alt="Image"
                              className="max-w-full rounded-md"
                              onError={(e) => {
                                console.error("Failed to load image:", mediaUrl)
                                e.currentTarget.style.display = "none"
                              }}
                            />
                          ) : (
                            <div className={`p-4 rounded-md text-center text-sm ${
                              msg.direction === "outbound" 
                                ? "bg-primary-foreground/20 text-primary-foreground/80" 
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {msg.direction === "outbound" ? "📷 Image sent" : "📷 Image (URL not available)"}
                            </div>
                          )}
                        </div>
                      )}
                      {msg.messageType === "video" && (
                        <div className="mb-2">
                          {mediaUrl ? (
                            <video
                              src={mediaUrl}
                              controls
                              className="max-w-full rounded-md"
                              onError={(e) => {
                                console.error("Failed to load video:", mediaUrl)
                                e.currentTarget.style.display = "none"
                              }}
                            >
                              Your browser does not support the video tag.
                            </video>
                          ) : (
                            <div className={`p-4 rounded-md text-center text-sm ${
                              msg.direction === "outbound" 
                                ? "bg-primary-foreground/20 text-primary-foreground/80" 
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {msg.direction === "outbound" ? "🎥 Video sent" : "🎥 Video (URL not available)"}
                            </div>
                          )}
                        </div>
                      )}
                      {msg.messageType === "audio" && (
                        <div className="mb-2">
                          {mediaUrl ? (
                            <audio src={mediaUrl} controls className="w-full">
                              Your browser does not support the audio tag.
                            </audio>
                          ) : (
                            <div className={`p-4 rounded-md text-center text-sm ${
                              msg.direction === "outbound" 
                                ? "bg-primary-foreground/20 text-primary-foreground/80" 
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {msg.direction === "outbound" ? "🎵 Audio sent" : "🎵 Audio (URL not available)"}
                            </div>
                          )}
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
                        <div className="flex items-center gap-1">
                          {formatTime(msg.createdAt)}
                          {msg.direction === "outbound" && (() => {
                            const status = getMessageStatusDisplay(msg)
                            if (!status) return null
                            return (
                              <span className={`text-[11px] ${status.className}`} title={status.label}>
                                {status.icon}
                              </span>
                            )
                          })()}
                        </div>
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
                className="flex gap-2 items-center"
              >
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <span className="px-3 py-2 border rounded bg-muted hover:bg-muted/70 inline-flex items-center gap-1 text-sm">
                      📎 Attach
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        setSelectedFile(file || null)
                      }}
                      disabled={loading}
                    />
                  </label>
                  {selectedFile && (
                    <span className="text-xs text-muted-foreground">
                      {selectedFile.name}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                  >
                    😊
                  </Button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-12 left-0 bg-popover border rounded shadow p-2 grid grid-cols-6 gap-1 z-10">
                      {["😀","😃","😄","😁","😆","😅","😂","😊","😍","🤔","👍","🙏","🎉","🔥","❤️","👏"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="text-lg"
                          onClick={() => {
                            setMessageText((prev) => prev + emoji)
                            setShowEmojiPicker(false)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  disabled={loading}
                />
                <Button type="submit" disabled={loading || (!messageText.trim() && !selectedFile)}>
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

