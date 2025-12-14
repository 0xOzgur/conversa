"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Channel {
  id: string
  type: string
  externalId: string
  displayName: string
  metadata: Record<string, unknown>
  createdAt: string
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<"whatsapp_evolution" | "facebook_page" | "instagram_business">("whatsapp_evolution")
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    displayName: "",
    baseUrl: "",
    instanceName: "",
    apiKey: "",
    pageId: "",
    accessToken: "",
  })

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      const res = await fetch("/api/channels")
      const data = await res.json()
      setChannels(data.channels || [])
    } catch (error) {
      console.error("Error loading channels:", error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload: Record<string, unknown> = {
        type: formType,
        displayName: formData.displayName,
      }

      if (formType === "whatsapp_evolution") {
        payload.baseUrl = formData.baseUrl
        payload.instanceName = formData.instanceName
        payload.apiKey = formData.apiKey
      } else {
        payload.pageId = formData.pageId
        payload.accessToken = formData.accessToken
      }

      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setShowForm(false)
        setFormData({
          displayName: "",
          baseUrl: "",
          instanceName: "",
          apiKey: "",
          pageId: "",
          accessToken: "",
        })
        loadChannels()
      } else {
        const error = await res.json()
        alert(error.error || "Failed to create channel")
      }
    } catch (error) {
      console.error("Error creating channel:", error)
      alert("Failed to create channel")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Channel Settings</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "Add Channel"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add New Channel</CardTitle>
            <CardDescription>Connect a communication channel</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Channel Type</Label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as typeof formType)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="whatsapp_evolution">WhatsApp (Evolution API)</option>
                  <option value="facebook_page">Facebook Page</option>
                  <option value="instagram_business">Instagram Business</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  required
                />
              </div>

              {formType === "whatsapp_evolution" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="baseUrl">Base URL</Label>
                    <Input
                      id="baseUrl"
                      type="url"
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                      placeholder="https://evo.example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instanceName">Instance Name</Label>
                    <Input
                      id="instanceName"
                      value={formData.instanceName}
                      onChange={(e) => setFormData({ ...formData, instanceName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      value={formData.apiKey}
                      onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                      required
                    />
                  </div>
                </>
              )}

              {(formType === "facebook_page" || formType === "instagram_business") && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pageId">Page ID</Label>
                    <Input
                      id="pageId"
                      value={formData.pageId}
                      onChange={(e) => setFormData({ ...formData, pageId: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Access Token</Label>
                    <Input
                      id="accessToken"
                      type="password"
                      value={formData.accessToken}
                      onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                      required
                    />
                  </div>
                </>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Adding..." : "Add Channel"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {channels.map((channel) => (
          <Card key={channel.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{channel.displayName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {channel.type} • {channel.externalId}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  Added {new Date(channel.createdAt).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {channels.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No channels configured. Add your first channel to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

