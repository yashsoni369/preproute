"use client"

import { useRouter } from "next/navigation"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  type LucideIcon,
} from "lucide-react"

import { AuthenticatedShell } from "@/components/layout/authenticated-shell"
import { toast } from "@/components/ui/toast"
import {
  ApiError,
  fetchQuestionsBulk,
  getTestById,
  normalizeDifficultyForApi,
  type QuestionRecord,
  type TestDetailRecord,
} from "@/lib/api"
import { clearAuthSession, getAuthToken } from "@/lib/auth"
import { readDashboardTestsCache } from "@/lib/dashboard-cache"
import { refreshDashboardTests } from "@/lib/dashboard-tests-client"
import {
  getListStatus,
  getPipelineCounts,
  type DashboardTest,
  type PipelineStatus,
} from "@/lib/dashboard-data"
import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  optionKeys,
  stripHtml,
  type OptionKey,
  type QuestionDraft,
} from "@/lib/question-draft"

type LoadPhase = "loading" | "error" | "ready"
type TrackingFilter = "all" | PipelineStatus
type DetailAction = "open" | "continue" | "edit" | "publish"

type TrackingDetailBundle = {
  test: TestDetailRecord
  questions: QuestionRecord[]
  fetchedAt: number
}

const EMPTY_TESTS: DashboardTest[] = []
const PAGE_SIZE = 12
const CURRENT_TEST_STORAGE_KEY = "preproute_current_test"
const CREATED_QUESTIONS_STORAGE_KEY = "preproute_created_questions"

const FILTERS: { key: TrackingFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_progress", label: "In progress" },
  { key: "ready", label: "Ready" },
  { key: "live", label: "Live" },
]

const STATUS_STYLE: Record<
  ReturnType<typeof getListStatus>["tone"],
  string
> = {
  live: "border-[#bfe8d5] bg-[#e8f7f0] text-[#0a8a5c]",
  draft: "border-[#e4e8f0] bg-[#edf1f7] text-[#6b7286]",
  progress: "border-[#f4d78e] bg-[#fff6e3] text-[#b5760a]",
  unpublished: "border-[#e4e8f0] bg-[#edf1f7] text-[#6b7286]",
  scheduled: "border-[#c7d1ff] bg-[#f3f5ff] text-[#16309e]",
  expired: "border-[#f6c9cb] bg-[#fef0ef] text-[#d1373f]",
}

const DIFFICULTY_LABEL: Record<DashboardTest["difficulty"], string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
}

const STAGE_COPY: Record<
  PipelineStatus,
  { label: string; summary: string; tone: string }
> = {
  draft: {
    label: "Draft",
    summary: "Test details are saved. Questions have not started.",
    tone: "text-[#6b7286]",
  },
  in_progress: {
    label: "Questions in progress",
    summary: "Some questions are added. Target count is still pending.",
    tone: "text-[#b5760a]",
  },
  ready: {
    label: "Ready to publish",
    summary: "The required question count is complete. Status is not live.",
    tone: "text-[#0a8a5c]",
  },
  live: {
    label: "Live",
    summary: "This test has been published.",
    tone: "text-[#0a8a5c]",
  },
}

function formatDate(iso: string) {
  if (!iso) return "-"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "-"

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getProgress(test: DashboardTest) {
  if (test.totalQuestions <= 0) {
    return 0
  }

  return Math.min(100, (test.questionsCompleted / test.totalQuestions) * 100)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Please check your connection and try again."
}

function getUniqueQuestionIds(record: TestDetailRecord) {
  return Array.from(
    new Set((record.questions ?? []).filter((id) => typeof id === "string" && id))
  )
}

function sortQuestionsByTestOrder(
  questionIds: string[],
  questions: QuestionRecord[]
) {
  if (questionIds.length === 0) return questions

  const order = new Map(questionIds.map((id, index) => [id, index]))

  return [...questions].sort((a, b) => {
    const aIndex = order.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bIndex = order.get(b.id) ?? Number.MAX_SAFE_INTEGER

    return aIndex - bIndex
  })
}

function getQuestionOptionCount(question: QuestionRecord) {
  const lastFilledIndex = optionKeys.reduce((latest, key, index) => {
    const value = question[key]

    return typeof value === "string" && value.trim() ? index : latest
  }, -1)
  const correctIndex = optionKeys.indexOf(question.correct_option as OptionKey)

  return Math.min(
    MAX_OPTIONS,
    Math.max(MIN_OPTIONS, lastFilledIndex + 1, correctIndex + 1)
  )
}

function toQuestionDraft(question: QuestionRecord): QuestionDraft {
  const correctOption = optionKeys.includes(question.correct_option as OptionKey)
    ? (question.correct_option as OptionKey)
    : ""

  return {
    question: question.question ?? "",
    options: {
      option1: question.option1 ?? "",
      option2: question.option2 ?? "",
      option3: question.option3 ?? "",
      option4: question.option4 ?? "",
    },
    correctOption,
    optionCount: getQuestionOptionCount(question),
    explanation: question.explanation ?? "",
    difficulty: normalizeDifficultyForApi(question.difficulty),
    topic: "",
    subTopic: "",
  }
}

function seedTrackingFlowState(bundle: TrackingDetailBundle) {
  window.localStorage.setItem(
    CURRENT_TEST_STORAGE_KEY,
    JSON.stringify(bundle.test)
  )

  if (bundle.questions.length === 0) {
    window.localStorage.removeItem(CREATED_QUESTIONS_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(
    CREATED_QUESTIONS_STORAGE_KEY,
    JSON.stringify({
      testId: bundle.test.id,
      questions: bundle.questions,
      drafts: bundle.questions.map(toQuestionDraft),
    })
  )
}

function getQuestionText(question: QuestionRecord) {
  const text = stripHtml(question.question ?? "")

  if (text) return text
  if (/<img\b/i.test(question.question ?? "")) return "Image based question"

  return "Untitled question"
}

function getOptionLabel(key: OptionKey) {
  return String.fromCharCode(65 + optionKeys.indexOf(key))
}

export function TestTrackingScreen() {
  const router = useRouter()
  const [tests, setTests] = useState<DashboardTest[] | null>(null)
  const [phase, setPhase] = useState<LoadPhase>("loading")
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<TrackingFilter>("all")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<
    Record<string, TrackingDetailBundle>
  >({})
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<DetailAction | null>(null)
  const detailCacheRef = useRef<Record<string, TrackingDetailBundle>>({})
  const detailRequestsRef = useRef<
    Record<string, Promise<TrackingDetailBundle>>
  >({})
  const deferredQuery = useDeferredValue(query)

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
            ? "Showing the most recent tracking data saved on this device."
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

  const data = tests ?? EMPTY_TESTS

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()

    return data.filter((test) => {
      const matchesQuery =
        !q ||
        test.name.toLowerCase().includes(q) ||
        test.subject.toLowerCase().includes(q) ||
        test.type.toLowerCase().includes(q)

      if (!matchesQuery) return false
      if (filter === "all") return true

      return test.status === filter
    })
  }, [data, deferredQuery, filter])

  const counts = useMemo(() => getPipelineCounts(data), [data])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const selectedTest =
    filtered.find((test) => test.id === selectedId) ?? visible[0] ?? filtered[0]
  const selectedDetail = selectedTest ? detailCache[selectedTest.id] : undefined
  const isSelectedDetailOpen = Boolean(
    selectedTest && openDetailId === selectedTest.id
  )
  const isSelectedDetailLoading = Boolean(
    selectedTest && detailLoadingId === selectedTest.id
  )

  const retryLoad = useCallback(() => {
    setPhase("loading")
    setReloadKey((key) => key + 1)
  }, [])

  function changeQuery(value: string) {
    setQuery(value)
    setPage(1)
  }

  function changeFilter(next: TrackingFilter) {
    setFilter(next)
    setPage(1)
  }

  const goToCreate = useCallback(() => router.push("/test-creation"), [router])

  const rememberDetailBundle = useCallback(
    (testId: string, bundle: TrackingDetailBundle) => {
      setDetailCache((current) => {
        const next = { ...current, [testId]: bundle }
        detailCacheRef.current = next
        return next
      })
    },
    []
  )

  const loadTrackingDetail = useCallback(
    async (testId: string) => {
      const cached = detailCacheRef.current[testId]

      if (cached) return cached

      const pending = detailRequestsRef.current[testId]

      if (pending) return pending

      const request = (async () => {
        setDetailLoadingId(testId)
        setDetailError(null)

        const detailResponse = await getTestById(testId)
        const detailRecord = detailResponse.data

        if (!detailRecord) {
          throw new Error("Test details were not returned by the server.")
        }

        const questionIds = getUniqueQuestionIds(detailRecord)
        const questionResponse =
          questionIds.length > 0
            ? await fetchQuestionsBulk(questionIds)
            : { data: [] as QuestionRecord[] }
        const questions = sortQuestionsByTestOrder(
          questionIds,
          questionResponse.data ?? []
        )
        const bundle = {
          test: detailRecord,
          questions,
          fetchedAt: Date.now(),
        }

        rememberDetailBundle(testId, bundle)
        return bundle
      })()

      detailRequestsRef.current[testId] = request

      try {
        return await request
      } finally {
        delete detailRequestsRef.current[testId]
        setDetailLoadingId((current) => (current === testId ? null : current))
      }
    },
    [rememberDetailBundle]
  )

  const handleDetailFailure = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        clearAuthSession()
        router.replace("/")
        return
      }

      const message = getErrorMessage(error)
      setDetailError(message)
      toast.error("Couldn't load test details", { description: message })
    },
    [router]
  )

  const openSelectedDetails = useCallback(
    async (test?: DashboardTest) => {
      if (!test) return

      setBusyAction("open")
      setOpenDetailId(test.id)

      try {
        await loadTrackingDetail(test.id)
      } catch (error) {
        handleDetailFailure(error)
      } finally {
        setBusyAction((current) => (current === "open" ? null : current))
      }
    },
    [handleDetailFailure, loadTrackingDetail]
  )

  const openExistingFlow = useCallback(
    async (test: DashboardTest | undefined, target: "question" | "publish") => {
      if (!test) return

      const action = target === "publish" ? "publish" : "continue"
      setBusyAction(action)
      setOpenDetailId(test.id)

      try {
        const bundle = await loadTrackingDetail(test.id)
        seedTrackingFlowState(bundle)
        router.push(target === "publish" ? "/publish-confirmation" : "/question-creation")
      } catch (error) {
        handleDetailFailure(error)
      } finally {
        setBusyAction((current) => (current === action ? null : current))
      }
    },
    [handleDetailFailure, loadTrackingDetail, router]
  )

  const editSelectedTest = useCallback(
    async (test?: DashboardTest) => {
      if (!test) return

      setBusyAction("edit")
      setOpenDetailId(test.id)

      try {
        const bundle = await loadTrackingDetail(test.id)
        seedTrackingFlowState(bundle)
        router.push("/question-creation")
      } catch (error) {
        handleDetailFailure(error)
      } finally {
        setBusyAction((current) => (current === "edit" ? null : current))
      }
    },
    [handleDetailFailure, loadTrackingDetail, router]
  )

  if (phase === "loading") {
    return (
      <AuthenticatedShell>
        <TrackingLoading />
      </AuthenticatedShell>
    )
  }

  if (phase === "error") {
    return (
      <AuthenticatedShell>
        <TrackingError onRetry={retryLoad} />
      </AuthenticatedShell>
    )
  }

  return (
    <AuthenticatedShell>
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-[1460px] flex-col gap-4 px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[#11183d]">
              Test Tracking
            </h1>
            <p className="mt-1 max-w-[72ch] text-[12.5px] leading-5 text-[#6b7286]">
              Track completion, readiness, and live status across created tests.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {isRefreshing ? (
              <span
                aria-label="Refreshing test tracking data"
                className="size-2.5 rounded-full bg-[#2448dd] opacity-70"
              />
            ) : null}
            <button
              type="button"
              onClick={goToCreate}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[#2448dd] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#16309e]"
            >
              <Plus className="size-3.5" strokeWidth={2.3} />
              Create test
            </button>
          </div>
        </div>

        {data.length === 0 ? (
          <TrackingEmpty onCreate={goToCreate} />
        ) : (
          <>
            <section
              aria-label="Tracking summary"
              className="grid grid-cols-2 divide-x divide-y divide-[#edf1f7] overflow-hidden rounded-[8px] border border-[#e4e8f0] bg-white sm:grid-cols-5 sm:divide-y-0"
            >
              <TrackingStat label="All tests" value={data.length} />
              <TrackingStat label="Draft" value={counts.draft} />
              <TrackingStat label="In progress" value={counts.in_progress} tone="warn" />
              <TrackingStat label="Ready" value={counts.ready} tone="good" />
              <TrackingStat label="Live" value={counts.live} tone="good" />
            </section>

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <section className="min-w-0 overflow-hidden rounded-[8px] border border-[#e4e8f0] bg-white">
                <div className="flex flex-col gap-3 border-b border-[#edf1f7] px-4 py-3.5 lg:flex-row lg:items-center">
                  <div className="relative w-full lg:max-w-[360px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3]" />
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => changeQuery(event.target.value)}
                      placeholder="Search tests..."
                      className="h-[36px] w-full rounded-[8px] border border-[#e4e8f0] pl-9 pr-3 text-[13px] text-[#11183d] outline-none placeholder:text-[#98a2b3] focus:border-[#c7d1ff] focus:ring-2 focus:ring-[#2448dd]/10"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 lg:ml-auto">
                    {FILTERS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => changeFilter(key)}
                        className={`h-[31px] rounded-full border px-3 text-[12px] font-semibold ${
                          filter === key
                            ? "border-[#c7d1ff] bg-[#f3f5ff] text-[#16309e]"
                            : "border-[#e4e8f0] bg-white text-[#6b7286] hover:border-[#c7d1ff] hover:text-[#16309e]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1.35fr)_140px_150px_96px] gap-3 border-b border-[#edf1f7] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#98a2b3] max-xl:hidden">
                  <span>Test</span>
                  <span>Questions</span>
                  <span>Status</span>
                  <span className="text-right">Created</span>
                </div>

                <div>
                  {visible.length === 0 ? (
                    <div className="px-4 py-12 text-center text-[13px] text-[#98a2b3]">
                      No tests match this view.
                    </div>
                  ) : (
                    visible.map((test) => (
                      <TrackingRow
                        key={test.id}
                        test={test}
                        isSelected={selectedTest?.id === test.id}
                        onSelect={() => {
                          setSelectedId(test.id)
                          setDetailError(null)
                        }}
                      />
                    ))
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f7] px-4 py-3">
                  <span className="text-[12px] text-[#98a2b3]">
                    {filtered.length === 0
                      ? "No tests"
                      : `Showing ${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                    {filtered.length !== data.length ? ` (of ${data.length} total)` : ""}
                  </span>
                  {pageCount > 1 ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPage(Math.max(1, safePage - 1))}
                        disabled={safePage <= 1}
                        className="inline-flex size-[30px] items-center justify-center rounded-[7px] border border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#c7d1ff] hover:text-[#16309e] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-4" strokeWidth={2} />
                      </button>
                      <span className="px-1 text-[12.5px] font-semibold tabular-nums text-[#6b7286]">
                        {safePage} / {pageCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                        disabled={safePage >= pageCount}
                        className="inline-flex size-[30px] items-center justify-center rounded-[7px] border border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#c7d1ff] hover:text-[#16309e] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-4" strokeWidth={2} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>

              <aside className="min-w-0 xl:sticky xl:top-4">
                <TrackingDetail
                  test={selectedTest}
                  detail={selectedDetail}
                  isDetailOpen={isSelectedDetailOpen}
                  isLoadingDetail={isSelectedDetailLoading}
                  detailError={detailError}
                  busyAction={busyAction}
                  onOpenDetails={() => openSelectedDetails(selectedTest)}
                  onContinue={() => openExistingFlow(selectedTest, "question")}
                  onEdit={() => editSelectedTest(selectedTest)}
                  onPublish={() => openExistingFlow(selectedTest, "publish")}
                />
              </aside>
            </div>
          </>
        )}
      </div>
    </AuthenticatedShell>
  )
}

function TrackingRow({
  test,
  isSelected,
  onSelect,
}: {
  test: DashboardTest
  isSelected: boolean
  onSelect: () => void
}) {
  const status = getListStatus(test)
  const progress = getProgress(test)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-1 gap-2 border-b border-[#edf1f7] px-4 py-3 text-left last:border-b-0 hover:bg-[#f7f8ff] xl:grid-cols-[minmax(0,1.35fr)_140px_150px_96px] xl:items-center xl:gap-3 ${
        isSelected ? "bg-[#f7f8ff]" : "bg-white"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[#11183d]">
          {test.name}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] capitalize text-[#98a2b3]">
          {test.subject} - {test.type} - {DIFFICULTY_LABEL[test.difficulty]}
        </span>
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 rounded-full bg-[#edf1f7]">
            <span
              className={`block h-full rounded-full ${
                test.status === "live" || test.status === "ready"
                  ? "bg-[#0a8a5c]"
                  : "bg-[#2448dd]"
              }`}
              style={{ width: `${progress}%` }}
            />
          </span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-[#6b7286]">
            {test.questionsCompleted}/{test.totalQuestions}
          </span>
        </span>
      </span>
      <span>
        <span
          className={`inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold ${STATUS_STYLE[status.tone]}`}
        >
          {status.label}
        </span>
      </span>
      <span className="text-right text-[12px] tabular-nums text-[#6b7286] max-xl:text-left">
        {formatDate(test.createdAt)}
      </span>
    </button>
  )
}

function TrackingDetail({
  test,
  detail,
  isDetailOpen,
  isLoadingDetail,
  detailError,
  busyAction,
  onOpenDetails,
  onContinue,
  onEdit,
  onPublish,
}: {
  test?: DashboardTest
  detail?: TrackingDetailBundle
  isDetailOpen: boolean
  isLoadingDetail: boolean
  detailError: string | null
  busyAction: DetailAction | null
  onOpenDetails: () => void
  onContinue: () => void
  onEdit: () => void
  onPublish: () => void
}) {
  if (!test) {
    return (
      <section className="rounded-[8px] border border-[#e4e8f0] bg-white p-4">
        <p className="text-[13px] text-[#98a2b3]">Select a test to view tracking details.</p>
      </section>
    )
  }

  const status = getListStatus(test)
  const stage = STAGE_COPY[test.status]
  const progress = getProgress(test)
  const fetchedQuestionCount = detail?.questions.length
  const visibleQuestionCount = fetchedQuestionCount ?? test.questionsCompleted
  const primaryAction =
    test.status === "ready"
      ? {
          label: "Publish",
          icon: Send,
          onClick: onPublish,
          action: "publish" as const,
        }
      : {
          label: test.status === "live" ? "Open editor" : "Continue",
          icon: test.status === "live" ? Pencil : ArrowRight,
          onClick: test.status === "live" ? onEdit : onContinue,
          action: test.status === "live" ? ("edit" as const) : ("continue" as const),
        }
  const checks = [
    { label: "Test details saved", done: true },
    { label: "Questions started", done: visibleQuestionCount > 0 },
    {
      label: "Required questions complete",
      done: test.totalQuestions > 0 && visibleQuestionCount >= test.totalQuestions,
    },
    { label: "Published live", done: test.status === "live" },
  ]

  return (
    <section className="rounded-[8px] border border-[#e4e8f0] bg-white">
      <div className="border-b border-[#edf1f7] px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold text-[#11183d]">
              {test.name}
            </h2>
            <p className="mt-0.5 text-[11.5px] capitalize text-[#98a2b3]">
              {test.type} - {DIFFICULTY_LABEL[test.difficulty]}
            </p>
          </div>
          <span
            className={`inline-flex h-[22px] shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold ${STATUS_STYLE[status.tone]}`}
          >
            {status.label}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <TrackingActionButton
            icon={Eye}
            label="Open details"
            isLoading={busyAction === "open" || isLoadingDetail}
            onClick={onOpenDetails}
          />
          <TrackingActionButton
            icon={primaryAction.icon}
            label={primaryAction.label}
            isLoading={busyAction === primaryAction.action}
            onClick={primaryAction.onClick}
            isPrimary={test.status === "ready"}
          />
          {test.status !== "live" ? (
            <TrackingActionButton
              icon={Pencil}
              label="Edit"
              isLoading={busyAction === "edit"}
              onClick={onEdit}
              className="col-span-2"
            />
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[12.5px] font-semibold ${stage.tone}`}>
              {stage.label}
            </span>
            <span className="text-[11.5px] font-medium tabular-nums text-[#6b7286]">
              {Math.round(progress)}%
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[#6b7286]">
            {stage.summary}
          </p>
          <div className="mt-3 h-2 rounded-full bg-[#edf1f7]">
            <div
              className={`h-full rounded-full ${
                test.status === "live" || test.status === "ready"
                  ? "bg-[#0a8a5c]"
                  : "bg-[#2448dd]"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <DetailMetric label="Subject" value={test.subject} />
          <DetailMetric label="Total marks" value={String(test.totalMarks)} />
          <DetailMetric
            label="Questions"
            value={`${visibleQuestionCount}/${test.totalQuestions}`}
          />
          <DetailMetric
            label="Marking"
            value={`+${test.correctMarks} / ${test.wrongMarks}`}
          />
        </div>

        <QuestionCompletionStrip
          completed={visibleQuestionCount}
          total={Math.max(test.totalQuestions, visibleQuestionCount)}
        />

        <div className="rounded-[8px] border border-[#edf1f7]">
          <div className="border-b border-[#edf1f7] px-3 py-2.5 text-[12px] font-semibold text-[#11183d]">
            Lifecycle check
          </div>
          <ul>
            {checks.map((check) => (
              <li
                key={check.label}
                className="flex items-center gap-2.5 border-b border-[#edf1f7] px-3 py-2.5 last:border-b-0"
              >
                {check.done ? (
                  <CheckCircle2 className="size-4 text-[#0a8a5c]" strokeWidth={2} />
                ) : (
                  <Circle className="size-4 text-[#c4cad6]" strokeWidth={2} />
                )}
                <span
                  className={`text-[12px] font-medium ${
                    check.done ? "text-[#30384b]" : "text-[#98a2b3]"
                  }`}
                >
                  {check.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11.5px] text-[#6b7286]">
          <span>
            Created
            <strong className="mt-0.5 block text-[12px] font-semibold text-[#30384b]">
              {formatDate(test.createdAt)}
            </strong>
          </span>
          <span>
            Updated
            <strong className="mt-0.5 block text-[12px] font-semibold text-[#30384b]">
              {formatDate(test.updatedAt)}
            </strong>
          </span>
        </div>

        {isDetailOpen ? (
          <QuestionDetailPanel
            detail={detail}
            error={detailError}
            isLoading={isLoadingDetail}
            expectedCount={test.totalQuestions}
          />
        ) : null}
      </div>
    </section>
  )
}

function TrackingActionButton({
  icon: Icon,
  label,
  isLoading,
  isPrimary,
  className = "",
  onClick,
}: {
  icon: LucideIcon
  label: string
  isLoading: boolean
  isPrimary?: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`inline-flex h-[34px] items-center justify-center gap-1.5 rounded-[7px] border px-3 text-[12px] font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
        isPrimary
          ? "border-[#2448dd] bg-[#2448dd] text-white hover:bg-[#16309e]"
          : "border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#c7d1ff] hover:text-[#16309e]"
      } ${className}`}
    >
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin" strokeWidth={2.2} />
      ) : (
        <Icon className="size-3.5" strokeWidth={2.2} />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

function QuestionCompletionStrip({
  completed,
  total,
}: {
  completed: number
  total: number
}) {
  if (total <= 0) return null

  return (
    <div className="rounded-[8px] border border-[#edf1f7] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-[#11183d]">
          Question completion
        </span>
        <span className="text-[11.5px] tabular-nums text-[#6b7286]">
          {completed}/{total}
        </span>
      </div>
      <div className="flex max-h-[78px] flex-wrap gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {Array.from({ length: total }).map((_, index) => {
          const isDone = index < completed

          return (
            <span
              key={index}
              className={`inline-flex size-6 items-center justify-center rounded-full border text-[10.5px] font-semibold tabular-nums ${
                isDone
                  ? "border-[#bfe8d5] bg-[#e8f7f0] text-[#0a8a5c]"
                  : "border-[#e4e8f0] bg-[#f8fafc] text-[#98a2b3]"
              }`}
            >
              {index + 1}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function QuestionDetailPanel({
  detail,
  error,
  isLoading,
  expectedCount,
}: {
  detail?: TrackingDetailBundle
  error: string | null
  isLoading: boolean
  expectedCount: number
}) {
  return (
    <div className="rounded-[8px] border border-[#edf1f7]">
      <div className="flex items-center justify-between gap-3 border-b border-[#edf1f7] px-3 py-2.5">
        <span className="text-[12px] font-semibold text-[#11183d]">
          Opened question details
        </span>
        <span className="text-[11.5px] tabular-nums text-[#6b7286]">
          {detail?.questions.length ?? 0}/{expectedCount}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-2.5 p-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-[7px] bg-[#eef1f7]" />
          ))}
        </div>
      ) : error ? (
        <div className="p-3 text-[12px] leading-5 text-[#d1373f]">{error}</div>
      ) : detail?.questions.length ? (
        <div className="max-h-[360px] space-y-2 overflow-y-auto p-3 pr-2 [scrollbar-color:#c5cedd_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c5cedd] [&::-webkit-scrollbar-track]:bg-transparent">
          {detail.questions.map((question, index) => (
            <QuestionPreview key={question.id} question={question} index={index} />
          ))}
        </div>
      ) : (
        <div className="p-3 text-[12px] leading-5 text-[#98a2b3]">
          No saved questions were returned for this test yet.
        </div>
      )}
    </div>
  )
}

function QuestionPreview({
  question,
  index,
}: {
  question: QuestionRecord
  index: number
}) {
  const optionCount = getQuestionOptionCount(question)
  const activeOptions = optionKeys.slice(0, optionCount)
  const correctOption = optionKeys.includes(question.correct_option as OptionKey)
    ? (question.correct_option as OptionKey)
    : null

  return (
    <article className="rounded-[7px] border border-[#edf1f7] bg-white px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#f3f5ff] text-[10.5px] font-semibold tabular-nums text-[#2448dd]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold text-[#11183d]">
            {getQuestionText(question)}
          </p>
          <div className="mt-1.5 grid gap-1">
            {activeOptions.map((key) => {
              const isCorrect = key === correctOption

              return (
                <div
                  key={key}
                  className={`flex min-w-0 items-center gap-1.5 text-[11.5px] ${
                    isCorrect ? "text-[#0a8a5c]" : "text-[#6b7286]"
                  }`}
                >
                  <span
                    className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold ${
                      isCorrect
                        ? "bg-[#e8f7f0] text-[#0a8a5c]"
                        : "bg-[#f1f4f8] text-[#98a2b3]"
                    }`}
                  >
                    {getOptionLabel(key)}
                  </span>
                  <span className="truncate">{stripHtml(question[key] ?? "") || "-"}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </article>
  )
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-[#edf1f7] px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#98a2b3]">
        {label}
      </div>
      <div className="mt-1 truncate text-[12.5px] font-semibold text-[#11183d]">
        {value}
      </div>
    </div>
  )
}

function TrackingStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "warn" | "good"
}) {
  const toneClass =
    tone === "warn" ? "text-[#b5760a]" : tone === "good" ? "text-[#0a8a5c]" : "text-[#98a2b3]"

  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#6b7286]">
        {label}
      </div>
      <div className="mt-1.5 text-[23px] font-semibold tabular-nums tracking-[-0.01em] text-[#11183d]">
        {value}
      </div>
      <div className={`mt-0.5 text-[11.5px] font-medium ${toneClass}`}>Tests</div>
    </div>
  )
}

function TrackingLoading() {
  return (
    <div className="mx-auto flex max-w-[1460px] flex-col gap-4 px-4 py-4 lg:px-6">
      <div className="h-8 w-52 animate-pulse rounded-md bg-[#eef1f7]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-[8px] bg-[#eef1f7]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="h-[520px] animate-pulse rounded-[8px] bg-[#eef1f7]" />
        <div className="h-[420px] animate-pulse rounded-[8px] bg-[#eef1f7]" />
      </div>
    </div>
  )
}

function TrackingError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col items-center px-5 py-24 text-center lg:px-8">
      <div className="flex size-12 items-center justify-center rounded-full bg-[#fef0ef]">
        <AlertTriangle className="size-6 text-[#d1373f]" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-[16px] font-semibold text-[#11183d]">
        Couldn&apos;t load test tracking
      </h2>
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

function TrackingEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-[10px] border border-dashed border-[#dce2ec] bg-white px-6 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-[#f3f5ff]">
        <ClipboardCheck className="size-6 text-[#2448dd]" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-[16px] font-semibold text-[#11183d]">No tests to track</h2>
      <p className="mt-1.5 max-w-[42ch] text-[13.5px] text-[#6b7286]">
        Create a test, add its questions, and it will appear here.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-[38px] items-center rounded-[7px] bg-[#2448dd] px-4 text-[13.5px] font-semibold text-white hover:bg-[#16309e]"
      >
        Create test
      </button>
    </div>
  )
}
