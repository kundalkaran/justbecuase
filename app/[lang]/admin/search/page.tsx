"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Database,
  RefreshCw,
  Zap,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  Settings2,
  Clock,
  Activity,
  Users,
  Building2,
  FolderKanban,
  FileText,
  Globe,
} from "lucide-react"
import { toast } from "sonner"

// ---- Types ----

type SyncStatus = "idle" | "running" | "done" | "error"

interface IndexStat {
  docs: number
  size: string
}

interface SyncResult {
  success: boolean
  synced?: Record<string, number>
  errors?: string[]
  error?: string
  timestamp?: string
}

interface CollectionDef {
  key: string
  label: string
  collectionParam: string[]
  icon: React.ElementType
  description: string
}

const COLLECTIONS: CollectionDef[] = [
  {
    key: "projects",
    label: "Opportunities",
    collectionParam: ["projects"],
    icon: FolderKanban,
    description: "All active/open volunteer opportunities",
  },
  {
    key: "volunteers",
    label: "Impact Agents",
    collectionParam: ["volunteers"],
    icon: Users,
    description: "All volunteer profiles",
  },
  {
    key: "ngos",
    label: "NGOs",
    collectionParam: ["ngos"],
    icon: Building2,
    description: "All NGO organization profiles",
  },
  {
    key: "blog",
    label: "Blog Posts",
    collectionParam: ["blog"],
    icon: FileText,
    description: "All published blog articles",
  },
  {
    key: "pages",
    label: "Static Pages",
    collectionParam: ["pages"],
    icon: Globe,
    description: "About, Contact, and other static pages",
  },
]

const INDEX_LABEL_MAP: Record<string, string> = {
  justbecause_volunteers: "Impact Agents",
  justbecause_ngos: "NGOs",
  justbecause_projects: "Opportunities",
  justbecause_blog_posts: "Blog Posts",
  justbecause_pages: "Pages",
}

// ---- Main Page ----

export default function AdminSearchPage() {
  const [stats, setStats] = useState<Record<string, IndexStat> | null>(null)
  const [esStatus, setEsStatus] = useState<"loading" | "ok" | "error">("loading")
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({})
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})
  const [cleanupStatus, setCleanupStatus] = useState<SyncStatus>("idle")
  const [cleanupResult, setCleanupResult] = useState<{ removed?: number; error?: string } | null>(null)
  const [setupStatus, setSetupStatus] = useState<SyncStatus>("idle")
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchStats = useCallback(async () => {
    setEsStatus("loading")
    try {
      const res = await fetch("/api/admin/es-sync")
      const data = await res.json()
      if (!res.ok || data.status === "error" || data.status === "unreachable") {
        setEsStatus("error")
        setStats(data.indices || {})
      } else {
        setStats(data.indices || {})
        setEsStatus("ok")
      }
      setLastRefreshed(new Date())
    } catch {
      setEsStatus("error")
      setStats(null)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const runSync = async (key: string, collections?: string[]) => {
    setSyncStatus(s => ({ ...s, [key]: "running" }))
    setSyncResults(r => ({ ...r, [key]: {} as SyncResult }))
    try {
      const res = await fetch("/api/admin/es-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full", collections }),
      })
      const data: SyncResult = await res.json()
      setSyncResults(r => ({ ...r, [key]: data }))
      setSyncStatus(s => ({ ...s, [key]: data.success ? "done" : "error" }))
      if (data.success) {
        const total = Object.values(data.synced || {}).reduce((a, b) => a + b, 0)
        toast.success(`Synced ${total} documents`)
        fetchStats()
      } else {
        toast.error(data.error || "Sync failed")
      }
    } catch (e: any) {
      setSyncResults(r => ({ ...r, [key]: { success: false, error: e.message } }))
      setSyncStatus(s => ({ ...s, [key]: "error" }))
      toast.error("Sync request failed")
    }
  }

  const runCleanup = async () => {
    setCleanupStatus("running")
    setCleanupResult(null)
    try {
      const res = await fetch("/api/admin/es-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "cleanup" }),
      })
      const data = await res.json()
      setCleanupResult(data.success ? { removed: data.removed } : { error: data.error })
      setCleanupStatus(data.success ? "done" : "error")
      if (data.success) toast.success(`Removed ${data.removed} stale documents`)
      else toast.error(data.error || "Cleanup failed")
    } catch (e: any) {
      setCleanupResult({ error: e.message })
      setCleanupStatus("error")
    }
  }

  const runSetup = async () => {
    setSetupStatus("running")
    try {
      const res = await fetch("/api/admin/es-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "setup" }),
      })
      const data = await res.json()
      setSetupStatus(data.success ? "done" : "error")
      if (data.success) toast.success("Index mappings verified/created")
      else toast.error(data.error || "Setup failed")
    } catch (e: any) {
      setSetupStatus("error")
      toast.error(e.message)
    }
  }

  const totalDocs = stats ? Object.values(stats).reduce((a, b) => a + b.docs, 0) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6" />
            Search Index
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage Elasticsearch — sync data, check health, and rebuild indexes manually
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Refreshed {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={esStatus === "loading"}>
            {esStatus === "loading"
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh Stats</span>
          </Button>
        </div>
      </div>

      {/* Status + Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Index Health
            </CardTitle>
            <Badge variant={esStatus === "ok" ? "default" : esStatus === "error" ? "destructive" : "secondary"}>
              {esStatus === "ok" ? "Connected" : esStatus === "error" ? "Unreachable" : "Checking..."}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {esStatus === "error" && (
            <div className="flex items-center gap-2 text-sm text-destructive mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Elasticsearch is unreachable. Check ELASTICSEARCH_URL and ELASTICSEARCH_API_KEY environment variables.
            </div>
          )}
          {esStatus === "loading" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          )}
          {stats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(stats).map(([indexName, info]) => {
                  const label = INDEX_LABEL_MAP[indexName] || indexName.replace("justbecause_", "").replace(/_/g, " ")
                  return (
                    <div key={indexName} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground capitalize mb-1">{label}</p>
                      <p className="text-2xl font-bold">{info.docs.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{info.size}</p>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Total indexed documents: <strong>{totalDocs.toLocaleString()}</strong>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Full Sync — All */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" /> Full Re-Index
          </CardTitle>
          <CardDescription>
            Re-syncs all MongoDB collections into Elasticsearch. Use this after bulk imports or
            if search results look stale. New projects/volunteers sync automatically on create/update.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
            <div>
              <p className="font-medium text-sm">Sync All Collections</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Volunteers · NGOs · Opportunities · Blog · Pages
              </p>
              {syncResults["all"] && (
                <SyncResultBadge result={syncResults["all"]} />
              )}
            </div>
            <SyncButton
              status={syncStatus["all"] || "idle"}
              onClick={() => runSync("all", undefined)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-Collection Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> Sync by Collection
          </CardTitle>
          <CardDescription>
            Selectively re-index individual collections without touching others.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {COLLECTIONS.map(({ key, label, collectionParam, icon: Icon, description }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-1.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  {stats && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Currently indexed:{" "}
                      <strong>
                        {Object.entries(stats)
                          .filter(([k]) => k.includes(key === "blog" ? "blog" : key === "pages" ? "page" : key === "volunteers" ? "volunteer" : key === "ngos" ? "ngo" : "project"))
                          .reduce((a, [, v]) => a + v.docs, 0)
                          .toLocaleString()}
                      </strong>
                    </p>
                  )}
                  {syncResults[key] && (
                    <SyncResultBadge result={syncResults[key]} />
                  )}
                </div>
              </div>
              <SyncButton
                status={syncStatus[key] || "idle"}
                onClick={() => runSync(key, collectionParam)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      {/* Maintenance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cleanup Stale Docs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4" /> Cleanup Stale Documents
            </CardTitle>
            <CardDescription>
              Removes ES documents whose source MongoDB record no longer exists (deleted users, archived projects, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cleanupResult && (
              <div className={`text-sm mb-3 flex items-center gap-2 ${cleanupResult.error ? "text-destructive" : "text-emerald-600"}`}>
                {cleanupResult.error
                  ? <><AlertCircle className="h-4 w-4" /> {cleanupResult.error}</>
                  : <><Check className="h-4 w-4" /> Removed {cleanupResult.removed} stale documents</>}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={runCleanup}
              disabled={cleanupStatus === "running"}
              className="w-full"
            >
              {cleanupStatus === "running"
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Running Cleanup...</>
                : cleanupStatus === "done"
                ? <><Check className="h-4 w-4 mr-2" />Done — Run Again</>
                : <><Trash2 className="h-4 w-4 mr-2" />Run Cleanup</>}
            </Button>
          </CardContent>
        </Card>

        {/* Rebuild Mappings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" /> Rebuild Index Mappings
            </CardTitle>
            <CardDescription>
              Ensures all Elasticsearch index mappings and settings are up-to-date.
              Safe to run anytime — only creates missing indexes, never deletes data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={runSetup}
              disabled={setupStatus === "running"}
              className="w-full"
            >
              {setupStatus === "running"
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Verifying...</>
                : setupStatus === "done"
                ? <><Check className="h-4 w-4 mr-2" />Mappings OK — Run Again</>
                : <><Settings2 className="h-4 w-4 mr-2" />Verify / Rebuild Mappings</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---- Small helper components ----

function SyncButton({ status, onClick }: { status: SyncStatus; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant={status === "done" ? "outline" : "default"}
      onClick={onClick}
      disabled={status === "running"}
      className="ml-4 shrink-0"
    >
      {status === "running" ? (
        <><Loader2 className="h-4 w-4 animate-spin mr-2" />Syncing...</>
      ) : status === "done" ? (
        <><Check className="h-4 w-4 mr-2" />Done — Re-sync</>
      ) : status === "error" ? (
        <><AlertCircle className="h-4 w-4 mr-2" />Retry</>
      ) : (
        <><Zap className="h-4 w-4 mr-2" />Sync Now</>
      )}
    </Button>
  )
}

function SyncResultBadge({ result }: { result: SyncResult }) {
  if (!result || (!result.synced && !result.error)) return null
  if (!result.success) {
    return (
      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
        <AlertCircle className="h-3 w-3" /> {result.error || "Failed"}
      </p>
    )
  }
  const total = Object.values(result.synced || {}).reduce((a, b) => a + b, 0)
  return (
    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
      <Check className="h-3 w-3" />
      Synced {total} docs
      {result.errors && result.errors.length > 0 && (
        <span className="text-amber-600 ml-1">({result.errors.length} errors)</span>
      )}
      {result.timestamp && (
        <span className="text-muted-foreground ml-1">at {new Date(result.timestamp).toLocaleTimeString()}</span>
      )}
    </p>
  )
}
