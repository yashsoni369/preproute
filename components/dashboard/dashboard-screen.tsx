"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { AuthenticatedShell } from "@/components/layout/authenticated-shell"
import { ApiError } from "@/lib/api"
import { clearAuthSession, getAuthToken } from "@/lib/auth"
import { readDashboardTestsCache } from "@/lib/dashboard-cache"
import { refreshDashboardTests } from "@/lib/dashboard-tests-client"
import {
  getCreationTrend,
  getDifficultyDistribution,
  getMarkingSchemeFlags,
  getPipelineCounts,
  getSubjectCoverage,
  type DashboardTest,
} from "@/lib/dashboard-data"
import { toast } from "@/components/ui/toast"
import { CreationTrendChart } from "@/components/dashboard/charts/creation-trend-chart"
import { DifficultyDonutChart } from "@/components/dashboard/charts/difficulty-donut-chart"
import { PipelineStageBar } from "@/components/dashboard/charts/pipeline-stage-bar"
import { SubjectCoverageChart } from "@/components/dashboard/charts/subject-coverage-chart"
import { TestList } from "@/components/dashboard/test-list"

type LoadPhase = "loading" | "error" | "ready"

const EMPTY_TESTS: DashboardTest[] = []

export function DashboardScreen() {
  const router = useRouter()
  const [tests, setTests] = useState<DashboardTest[] | null>(null)
  const [phase, setPhase] = useState<LoadPhase>("loading")
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Bumped by the retry button to re-trigger the load effect.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/")
      return
    }

    let active = true
    const cached = readDashboardTestsCache()
    const shouldForceRefresh = reloadKey > 0
    const controller = new AbortController()

    if (cached) {
      window.queueMicrotask(() => {
        if (!active) return
        setTests(cached.tests)
        setPhase("ready")
      })
    }

    if (cached?.isFresh && !shouldForceRefresh) {
      return () => {
        active = false
        controller.abort()
      }
    }

    async function loadTests() {
      try {
        setIsRefreshing(Boolean(cached))
        const nextTests = await refreshDashboardTests({ signal: controller.signal })
        if (!active) return
        setTests(nextTests)
        setPhase("ready")
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          clearAuthSession()
          router.replace("/")
          return
        }
        if (!cached) {
          setPhase("error")
        }
        toast.error("Couldn't load latest tests", {
          description: cached
            ? "Showing the most recent dashboard data saved on this device."
            : error instanceof ApiError
              ? error.message
              : "Please check your connection and try again.",
        })
      } finally {
        if (active) {
          setIsRefreshing(false)
        }
      }
    }

    loadTests()

    return () => {
      active = false
      controller.abort()
    }
  }, [router, reloadKey])

  const retryLoad = useCallback(() => {
    setPhase("loading")
    setReloadKey((key) => key + 1)
  }, [])

  const data = tests ?? EMPTY_TESTS

  const pipelineCounts = useMemo(() => getPipelineCounts(data), [data])
  const subjectCoverage = useMemo(() => getSubjectCoverage(data), [data])
  const difficultyDistribution = useMemo(
    () => getDifficultyDistribution(data),
    [data]
  )
  const markingSchemeFlags = useMemo(() => getMarkingSchemeFlags(data), [data])
  const creationTrend = useMemo(() => getCreationTrend(data), [data])

  const goToCreate = useCallback(() => router.push("/test-creation"), [router])

  if (phase === "loading") {
    return (
      <AuthenticatedShell>
        <DashboardLoading />
      </AuthenticatedShell>
    )
  }

  if (phase === "error") {
    return (
      <AuthenticatedShell>
        <DashboardError onRetry={retryLoad} />
      </AuthenticatedShell>
    )
  }

  return (
    <AuthenticatedShell>
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1460px] flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[#11183d]">
              Dashboard
            </h1>
            <p className="mt-1 max-w-[72ch] text-[12.5px] leading-5 text-[#6b7286]">
              {data.length === 0 ? (
                "No tests yet - create your first test to get started."
              ) : (
                "Track test inventory, publishing progress, coverage, and scoring quality from one place."
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {isRefreshing ? (
              <span
                aria-label="Refreshing dashboard data"
                className="size-2.5 rounded-full bg-[#2448dd] opacity-70"
              />
            ) : null}
            <button
              type="button"
              onClick={goToCreate}
              className="h-[34px] rounded-[7px] bg-[#2448dd] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#16309e]"
            >
              Create test
            </button>
          </div>
        </div>

        {data.length === 0 ? (
          <DashboardEmpty onCreate={goToCreate} />
        ) : (
          <>
            <section
              aria-label="Pipeline overview"
              className="grid grid-cols-2 divide-x divide-y divide-[#edf1f7] overflow-hidden rounded-[8px] border border-[#e4e8f0] bg-white sm:grid-cols-4 sm:divide-y-0"
            >
              <Stat
                label="Drafts"
                value={pipelineCounts.draft}
                sub="Unpublished tests"
              />
              <Stat
                label="Awaiting questions"
                value={pipelineCounts.in_progress}
                sub="Partially authored"
              />
              <Stat
                label="Ready to publish"
                value={pipelineCounts.ready}
                sub={`${markingSchemeFlags.length} flagged`}
                tone={markingSchemeFlags.length > 0 ? "warn" : "good"}
              />
              <Stat label="Live" value={pipelineCounts.live} sub="Published to students" />
            </section>

            <TestList tests={data} onCreate={goToCreate} />

            <section className="rounded-[8px] border border-[#e4e8f0] bg-white p-3.5">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold text-[#11183d]">Pipeline mix</h2>
                <span className="text-[11px] font-semibold text-[#98a2b3]">
                  {data.length} tests total
                </span>
              </div>
              <PipelineStageBar counts={pipelineCounts} />
            </section>

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="grid min-w-0 gap-4">
                <section className="rounded-[8px] border border-[#e4e8f0] bg-white p-3.5">
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <h2 className="text-[13px] font-semibold text-[#11183d]">Creation throughput</h2>
                    <span className="text-[11px] font-semibold text-[#98a2b3]">Last 8 weeks</span>
                  </div>
                  <CreationTrendChart data={creationTrend} />
                </section>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                  <section className="rounded-[8px] border border-[#e4e8f0] bg-white p-3.5">
                    <h2 className="mb-3 text-[13px] font-semibold text-[#11183d]">
                      Difficulty distribution
                    </h2>
                    <DifficultyDonutChart data={difficultyDistribution} />
                  </section>

                  <section className="rounded-[8px] border border-[#e4e8f0] bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-[#edf1f7] px-4 py-3">
                      <h2 className="text-[13px] font-semibold text-[#11183d]">
                        Marking scheme watch
                      </h2>
                      <span className="text-[11px] font-semibold text-[#98a2b3]">
                        {markingSchemeFlags.length} flagged
                      </span>
                    </div>
                    {markingSchemeFlags.length === 0 ? (
                      <p className="px-4 py-4 text-[12px] text-[#98a2b3]">
                        No marking-scheme outliers right now.
                      </p>
                    ) : (
                      <ul>
                        {markingSchemeFlags.slice(0, 4).map(({ test, message }) => (
                          <li
                            key={test.id}
                            className="flex gap-2.5 border-b border-[#edf1f7] px-4 py-3 last:border-b-0"
                          >
                            <span className="mt-1.5 size-[7px] shrink-0 rounded-full bg-[#b5760a]" />
                            <div>
                              <strong className="block text-[12.3px] font-semibold text-[#11183d]">
                                {test.name}
                              </strong>
                              <p className="mt-0.5 text-[11.5px] leading-[1.45] text-[#6b7286]">
                                {message}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>

              <aside className="min-w-0">
                <section className="rounded-[8px] border border-[#e4e8f0] bg-white p-3.5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[13px] font-semibold text-[#11183d]">Coverage by subject</h2>
                    <span className="text-[11px] font-semibold text-[#98a2b3]">
                      {data.length} tests
                    </span>
                  </div>
                  <SubjectCoverageChart data={subjectCoverage} />
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </AuthenticatedShell>
  )
}

function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-5 px-5 py-6 lg:px-8">
      <div className="h-8 w-52 animate-pulse rounded-md bg-[#eef1f7]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-[10px] bg-[#eef1f7]" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[10px] bg-[#eef1f7]" />
    </div>
  )
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col items-center px-5 py-24 text-center lg:px-8">
      <div className="flex size-12 items-center justify-center rounded-full bg-[#fef0ef]">
        <AlertTriangle className="size-6 text-[#d1373f]" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-[16px] font-semibold text-[#11183d]">Couldn&apos;t load tests</h2>
      <p className="mt-1.5 max-w-[42ch] text-[13.5px] text-[#6b7286]">
        Something went wrong reaching the server. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-[38px] items-center gap-2 rounded-[7px] bg-[#2448dd] px-4 text-[13.5px] font-semibold text-white hover:bg-[#16309e]"
      >
        <RefreshCw className="size-4" strokeWidth={2.2} />
        Retry
      </button>
    </div>
  )
}

function DashboardEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-[10px] border border-dashed border-[#dce2ec] bg-white px-6 py-20 text-center">
      <h2 className="text-[16px] font-semibold text-[#11183d]">No tests yet</h2>
      <p className="mt-1.5 max-w-[42ch] text-[13.5px] text-[#6b7286]">
        Create your first test to define its subject, topics, and marking scheme, then add questions.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-[38px] items-center rounded-[7px] bg-[#2448dd] px-4 text-[13.5px] font-semibold text-white hover:bg-[#16309e]"
      >
        Create New Test
      </button>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number
  sub: string
  tone?: "warn" | "good"
}) {
  const toneClass =
    tone === "warn" ? "text-[#b5760a]" : tone === "good" ? "text-[#0a8a5c]" : "text-[#98a2b3]"

  return (
    <div className="px-5 py-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#6b7286]">
        {label}
      </div>
      <div className="mt-2 text-[25px] font-semibold tabular-nums tracking-[-0.01em] text-[#11183d]">
        {value}
      </div>
      <div className={`mt-1 text-[12px] font-medium ${toneClass}`}>{sub}</div>
    </div>
  )
}
