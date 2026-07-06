"use client"

import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  BarChart3,
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FileQuestion,
  Pencil,
} from "lucide-react"

import { AuthenticatedShell } from "@/components/layout/authenticated-shell"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "@/components/ui/toast"
import { updateTest, type TestRecord } from "@/lib/api"
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning"
import { getAuthToken } from "@/lib/auth"
import { cn } from "@/lib/utils"

const CURRENT_TEST_STORAGE_KEY = "preproute_current_test"
const CREATED_QUESTIONS_STORAGE_KEY = "preproute_created_questions"

const optionKeys = ["option1", "option2", "option3", "option4"] as const

type OptionKey = (typeof optionKeys)[number]

type QuestionDraft = {
  question: string
  options: Record<OptionKey, string>
  correctOption: OptionKey | ""
  optionCount?: number
  explanation?: string
  difficulty?: string
  topic?: string
  subTopic?: string
}

type CurrentTest = TestRecord & {
  subjectName?: string
  topicNames?: string[]
  subTopicNames?: string[]
}

type StoredQuestionState = {
  testId?: string
  questions?: unknown[]
  drafts?: unknown[]
}

type LiveUntilValue =
  | "always"
  | "one-week"
  | "two-weeks"
  | "three-weeks"
  | "one-month"
  | "custom"

const liveUntilOptions: Array<{ value: LiveUntilValue; label: string }> = [
  { value: "always", label: "Always Available" },
  { value: "one-week", label: "1 Week" },
  { value: "two-weeks", label: "2 Weeks" },
  { value: "three-weeks", label: "3 Weeks" },
  { value: "one-month", label: "1 Month" },
  { value: "custom", label: "Custom Duration" },
]

const DATE_DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const TIME_DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: padTimePart(hour),
}))

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, minute) => ({
  value: minute,
  label: padTimePart(minute),
}))

type TimeParts = {
  hour: number
  minute: number
}

function parseStoredTest(value: string | null): CurrentTest | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<CurrentTest>

    if (typeof parsed.id === "string" && parsed.id.trim()) {
      return parsed as CurrentTest
    }
  } catch {
    return null
  }

  return null
}

function padTimePart(value: number) {
  return String(value).padStart(2, "0")
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return undefined
  }

  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined
  }

  return date
}

function toDateValue(date: Date) {
  return [
    date.getFullYear(),
    padTimePart(date.getMonth() + 1),
    padTimePart(date.getDate()),
  ].join("-")
}

function formatDateValue(value: string) {
  const date = parseDateValue(value)

  return date ? DATE_DISPLAY_FORMATTER.format(date) : "Select date"
}

function parseTimeValue(value: string): TimeParts | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)

  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return { hour, minute }
}

function toTimeValue(hour: number, minute: number) {
  return `${padTimePart(hour)}:${padTimePart(minute)}`
}

function getCurrentTimeParts(): TimeParts {
  const now = new Date()

  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
  }
}

function formatTimeValue(value: string) {
  const parts = parseTimeValue(value)

  if (!parts) return "Select time"

  return TIME_DISPLAY_FORMATTER.format(
    new Date(2024, 0, 1, parts.hour, parts.minute)
  )
}

function parseStoredQuestions(value: string | null): StoredQuestionState | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<StoredQuestionState>

    if (
      parsed &&
      typeof parsed === "object" &&
      (typeof parsed.testId === "string" ||
        Array.isArray(parsed.questions) ||
        Array.isArray(parsed.drafts))
    ) {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function getTotalQuestions(test?: CurrentTest | null) {
  if (!test) return 0

  const value = Number(test.total_questions)

  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  return 0
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

function displayDifficulty(value?: string) {
  if (!value) return "Easy"

  if (value === "hard" || value === "difficult") {
    return "Difficult"
  }

  return titleCase(value)
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()
}

function hasQuestionContent(draft: QuestionDraft) {
  return stripHtml(draft.question).length > 0 || /<img\b/i.test(draft.question)
}

function isQuestionDraft(value: unknown): value is QuestionDraft {
  if (!value || typeof value !== "object") return false

  const draft = value as Partial<QuestionDraft>
  const options = draft.options as Partial<Record<OptionKey, unknown>> | undefined

  return (
    typeof draft.question === "string" &&
    Boolean(options) &&
    optionKeys.every((key) => typeof options?.[key] === "string")
  )
}

function isDraftValid(value: unknown) {
  if (!isQuestionDraft(value)) return false

  const count = Number.isFinite(Number(value.optionCount))
    ? Math.min(optionKeys.length, Math.max(2, Math.floor(Number(value.optionCount))))
    : optionKeys.length
  const keys = optionKeys.slice(0, count)

  return (
    hasQuestionContent(value) &&
    keys.every((key) => value.options[key].trim().length > 0) &&
    Boolean(value.correctOption) &&
    keys.includes(value.correctOption as OptionKey)
  )
}

function getCompletedCount(
  storedQuestions: StoredQuestionState | null,
  testId: string
) {
  if (!storedQuestions || storedQuestions.testId !== testId) return 0

  const savedQuestionCount = Array.isArray(storedQuestions.questions)
    ? storedQuestions.questions.length
    : 0
  const validDraftCount = Array.isArray(storedQuestions.drafts)
    ? storedQuestions.drafts.filter(isDraftValid).length
    : 0

  return Math.max(savedQuestionCount, validDraftCount)
}

function listLabels(ids?: string[], labels?: string[]) {
  if (labels?.length) return labels
  if (ids?.length) return ids

  return []
}

export function PublishConfirmationScreen() {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()
  const redirectTimerRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [currentTest, setCurrentTest] = useState<CurrentTest | null>(null)
  const [storedQuestions, setStoredQuestions] =
    useState<StoredQuestionState | null>(null)
  const [liveUntil, setLiveUntil] = useState<LiveUntilValue>("always")
  const [customEndDate, setCustomEndDate] = useState("")
  const [customEndTime, setCustomEndTime] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [isQuestionPanelCollapsed, setIsQuestionPanelCollapsed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!getAuthToken()) {
        router.replace("/")
        return
      }

      const storedTest = parseStoredTest(
        window.localStorage.getItem(CURRENT_TEST_STORAGE_KEY)
      )
      const questionState = parseStoredQuestions(
        window.localStorage.getItem(CREATED_QUESTIONS_STORAGE_KEY)
      )

      setCurrentTest(storedTest)
      setStoredQuestions(questionState)
      setIsReady(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [router])

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  const totalQuestions = getTotalQuestions(currentTest)
  const completedCount = currentTest
    ? getCompletedCount(storedQuestions, currentTest.id)
    : 0
  const hasMatchingQuestionState =
    Boolean(currentTest) && storedQuestions?.testId === currentTest?.id
  const canPublish =
    Boolean(currentTest) &&
    hasMatchingQuestionState &&
    totalQuestions > 0 &&
    completedCount >= totalQuestions
  const doneCount = totalQuestions || completedCount
  const hasUnsavedPublishOptions =
    liveUntil !== "always" || Boolean(customEndDate) || Boolean(customEndTime)

  useUnsavedChangesWarning(
    hasUnsavedPublishOptions && !isSubmitting && !successMessage
  )

  const progressItems = useMemo(
    () =>
      Array.from({ length: Math.max(totalQuestions, completedCount) }, (_, index) => ({
        index,
        isCompleted: index < completedCount,
      })),
    [completedCount, totalQuestions]
  )

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!currentTest || !canPublish) return

    const ok = await confirm({
      title: "Publish this test?",
      description: "Publishing makes the test live and available on the platform.",
      confirmLabel: "Publish now",
    })

    if (!ok) return

    setIsSubmitting(true)
    setErrorMessage("")
    setSuccessMessage("")

    try {
      const response = await updateTest(currentTest.id, { status: "live" })
      const updatedTest: CurrentTest = {
        ...currentTest,
        ...(response.data ?? {}),
        status: "live",
      }

      window.localStorage.setItem(
        CURRENT_TEST_STORAGE_KEY,
        JSON.stringify(updatedTest)
      )
      setCurrentTest(updatedTest)
      setSuccessMessage("Test published successfully. Redirecting to test creation.")
      toast.success("Test published", {
        description: "Redirecting to test creation...",
      })
      redirectTimerRef.current = window.setTimeout(() => {
        router.push("/test-creation")
      }, 1800)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to publish the test. Please try again."

      setErrorMessage(message)
      toast.error("Unable to publish the test", { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isReady) {
    return (
      <AuthenticatedShell>
        <div className="flex min-h-full items-center justify-center px-6 text-sm text-[#697083]">
          Loading publish confirmation...
        </div>
      </AuthenticatedShell>
    )
  }

  if (!currentTest) {
    return (
      <AuthenticatedShell>
        <BlockingState
          title="No created test found"
          description="Create the test details first before publishing."
          actionLabel="Back to Test Details"
          onAction={() => router.push("/test-creation")}
        />
      </AuthenticatedShell>
    )
  }

  if (!canPublish) {
    return (
      <AuthenticatedShell>
        <div className="flex min-h-full bg-white">
          <QuestionProgressPanel
            isCollapsed={isQuestionPanelCollapsed}
            items={progressItems}
            totalQuestions={totalQuestions}
            onToggleCollapsed={() =>
              setIsQuestionPanelCollapsed((current) => !current)
            }
          />
          <section className="min-w-0 flex-1 px-5 pb-8 pt-4 lg:px-6">
            <HeaderBreadcrumb />
            <BlockingState
              embedded
              title="Questions are not completed"
              description={
                hasMatchingQuestionState
                  ? `Complete all required questions before publishing. ${completedCount} of ${totalQuestions} questions are done.`
                  : "Saved question state was not found for this test. Return to question creation and save the required questions before publishing."
              }
              actionLabel="Back to Question Creation"
              onAction={() => router.push("/question-creation")}
            />
          </section>
        </div>
      </AuthenticatedShell>
    )
  }

  return (
    <AuthenticatedShell>
      <div className="flex min-h-full bg-white">
        <QuestionProgressPanel
          isCollapsed={isQuestionPanelCollapsed}
          items={progressItems}
          totalQuestions={totalQuestions}
          onToggleCollapsed={() =>
            setIsQuestionPanelCollapsed((current) => !current)
          }
        />

        <section className="min-w-0 flex-1 px-5 pb-8 pt-4 lg:px-6">
          <HeaderBreadcrumb />

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[18px] font-semibold text-[#11183d]">
              Test created
            </h1>
            <span className="inline-flex h-8 items-center gap-2 rounded-[6px] bg-[#effaf5] px-3 text-[13px] font-semibold text-[#0aa66e]">
              <CheckCircle2 className="size-4 fill-[#18ad72] text-white" />
              All {doneCount} Questions done
            </span>
          </div>

          <TestSummaryCard test={currentTest} onEdit={() => router.push("/question-creation")} />

          {errorMessage ? (
            <p className="mt-5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="mt-5 rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </p>
          ) : null}

          <form onSubmit={handlePublish} noValidate className="mt-6">
            <PublishModeTabs />

            <section className="mt-6 rounded-[7px] border border-[#dce2ec] bg-white px-5 py-5">
              <div className="mb-5">
                <h2 className="text-[16px] font-semibold text-[#11183d]">
                  Live Until
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-[#697083]">
                  Choose how long this test should remain available on the platform.
                </p>
              </div>

              <RadioGroup
                value={liveUntil}
                onValueChange={(value) => {
                  setLiveUntil(value as LiveUntilValue)
                  setErrorMessage("")
                }}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                {liveUntilOptions.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-3 rounded-[6px] border px-4 text-[14px] font-medium transition",
                      liveUntil === option.value
                        ? "border-[#7f91ff] bg-[#f5f7ff] text-[#2448dd]"
                        : "border-[#dce2ec] bg-white text-[#30384b] hover:border-[#b9c5d8] hover:bg-[#fbfcff]"
                    )}
                  >
                    <RadioGroupItem
                      value={option.value}
                      className="size-5 border-[#6c83ff] data-checked:bg-white [&_[data-slot=radio-group-indicator]>span]:bg-[#6c83ff]"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </RadioGroup>

              {liveUntil === "custom" ? (
                <CustomDurationFields
                  endDate={customEndDate}
                  endTime={customEndTime}
                  onDateChange={setCustomEndDate}
                  onTimeChange={setCustomEndTime}
                />
              ) : null}
            </section>

            <div className="mt-6 flex justify-end gap-5 pb-2">
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-40 rounded-[6px] bg-[#f7f8ff] text-[15px] font-medium text-[#2448dd] hover:bg-[#eef1ff]"
                onClick={async () => {
                  if (hasUnsavedPublishOptions) {
                    const ok = await confirm({
                      title: "Discard changes?",
                      description: "Your publish options will not be saved.",
                      confirmLabel: "Discard",
                      tone: "danger",
                    })

                    if (!ok) return
                  }

                  router.push("/question-creation")
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-40 rounded-[6px] bg-[#7280f7] text-[15px] font-medium text-white hover:bg-[#6472ea]"
              >
                {isSubmitting ? "Publishing..." : "Confirm"}
              </Button>
            </div>
          </form>
        </section>
      </div>
      {confirmDialog}
    </AuthenticatedShell>
  )
}

function HeaderBreadcrumb() {
  return (
    <div className="mb-4 flex items-center gap-4 text-[15px] leading-6 text-[#63656c]">
      <span>Test creation</span>
    </div>
  )
}

type QuestionProgressItem = {
  index: number
  isCompleted: boolean
}

type QuestionProgressPanelProps = {
  isCollapsed: boolean
  items: QuestionProgressItem[]
  totalQuestions: number
  onToggleCollapsed: () => void
}

function QuestionProgressPanel({
  isCollapsed,
  items,
  totalQuestions,
  onToggleCollapsed,
}: QuestionProgressPanelProps) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-[calc(100dvh-4rem)] shrink-0 border-r border-[#e5e9f0] bg-white transition-[width] duration-200 lg:block",
        isCollapsed ? "w-[72px]" : "w-[230px]"
      )}
    >
      <button
        type="button"
        aria-label={isCollapsed ? "Expand question panel" : "Collapse question panel"}
        className={cn(
          "absolute right-[-16px] top-1/2 z-30 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#d8deea] bg-white text-[#6f7a90] shadow-sm transition hover:bg-[#f5f6ff] hover:text-[#2448dd]"
        )}
        onClick={onToggleCollapsed}
      >
        {isCollapsed ? (
          <ChevronsRight className="size-4" />
        ) : (
          <ChevronsLeft className="size-4" />
        )}
      </button>

      <div className={cn(isCollapsed ? "px-0 pt-16" : "px-4 pt-8")}>
        {!isCollapsed ? (
          <div className="mb-5 space-y-3 px-1 text-[13px] font-medium text-[#667085]">
            <p>Question creation</p>
            <p>Total Questions . {totalQuestions}</p>
          </div>
        ) : null}

        <div
          className={cn(
            "max-h-[calc(100dvh-11rem)] overflow-y-auto",
            isCollapsed
              ? "flex flex-col items-center gap-2 overflow-x-hidden px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "space-y-2 pr-2 [scrollbar-color:#c5cedd_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c5cedd] [&::-webkit-scrollbar-track]:bg-transparent"
          )}
        >
          {items.map((item) => (
            <button
              key={item.index}
              type="button"
              className={cn(
                "flex items-center border transition",
                isCollapsed
                  ? "size-9 justify-center rounded-full px-0 text-[12px] font-semibold"
                  : "h-9 w-full justify-between rounded-[7px] px-3 text-[13px] font-medium",
                item.isCompleted
                  ? isCollapsed
                    ? "border-[#10b981] bg-[#10b981] text-white shadow-sm"
                    : "border-[#52d59a] bg-[#f4fff9] text-[#079767]"
                  : isCollapsed
                    ? "border-[#e1e6ef] bg-white text-[#98a2b3]"
                    : "border-[#e1e6ef] bg-white text-[#aeb8c8]"
              )}
              aria-disabled="true"
              title={`Question ${item.index + 1}`}
            >
              {isCollapsed ? (
                <span className="leading-none">{item.index + 1}</span>
              ) : (
                <>
                  <span className="flex items-center gap-2 truncate">
                    {item.isCompleted ? (
                      <CheckCircle2 className="size-4 shrink-0 fill-[#18ad72] text-white" />
                    ) : (
                      <span className="size-3 shrink-0 rounded-full bg-[#d0d6e2]" />
                    )}
                    <span>Question {item.index + 1}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" />
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function TestSummaryCard({
  test,
  onEdit,
}: {
  test: CurrentTest
  onEdit: () => void
}) {
  const subject = test.subjectName || test.subject
  const topics = listLabels(test.topics, test.topicNames)
  const subTopics = listLabels(test.sub_topics, test.subTopicNames)

  return (
    <section className="rounded-[7px] border border-[#dce2ec] bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex h-6 items-center rounded-full bg-[#08093e] px-3 text-[13px] font-medium text-white">
            Chapter Wise
          </span>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <h2 className="text-[16px] font-semibold text-[#11183d]">
              {test.name || "Chapter 1"}
            </h2>
            <span className="inline-flex h-6 items-center gap-1 rounded-[6px] bg-[#2ebdaf] px-3 text-[12px] font-medium text-white">
              {displayDifficulty(test.difficulty)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 text-[13px] text-[#6d7484]">
            <SummaryLine label="Subject" value={subject} />
            <SummaryChips label="Topic" values={topics} />
            <SummaryChips label="Sub Topic" values={subTopics} />
          </div>
        </div>

        <button
          type="button"
          className="rounded-full p-2 text-[#7280f7] transition hover:bg-[#f5f6ff] hover:text-[#2448dd] focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none"
          aria-label="Edit test details"
          title="Back to question creation to edit details"
          onClick={onEdit}
        >
          <Pencil className="size-5" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <SummaryMetric icon={Clock} label={`${test.total_time || 0} Min`} />
        <SummaryMetric icon={FileQuestion} label={`${test.total_questions || 0} Q's`} />
        <SummaryMetric icon={BarChart3} label={`${test.total_marks || 0} Marks`} />
      </div>
    </section>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <span>{label}</span>
      <span className="min-w-0 truncate text-[#697083]">: {value}</span>
    </div>
  )
}

function SummaryChips({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2">
      <span>{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span>:</span>
        {values.length > 0 ? (
          values.map((value) => (
            <span
              key={value}
              className="rounded-[6px] border border-[#ffc75a] bg-[#fffdf6] px-2 py-0.5 text-[12px] text-[#f5a400]"
            >
              {value}
            </span>
          ))
        ) : (
          <span className="text-[#9aa3b2]">Not selected</span>
        )}
      </div>
    </div>
  )
}

function SummaryMetric({
  icon: Icon,
  label,
}: {
  icon: typeof Clock
  label: string
}) {
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-[7px] border border-[#dce2ec] px-3 text-[13px] text-[#4f586a]">
      <Icon className="size-4 text-[#c3cad8]" />
      {label}
    </span>
  )
}

function PublishModeTabs() {
  return (
    <div className="inline-flex h-[48px] w-full max-w-[340px] items-center rounded-[10px] border border-[#dce2ec] bg-white p-1">
      <button
        type="button"
        className="h-9 flex-1 rounded-[7px] bg-[#f5f6ff] px-5 text-[14px] font-medium whitespace-nowrap text-[#2448dd]"
      >
        Publish Now
      </button>
      <button
        type="button"
        disabled
        className="h-9 flex-1 px-5 text-[14px] font-medium whitespace-nowrap text-[#9ba3b2] disabled:opacity-70"
        title="Scheduling is unavailable until a schedule API is documented"
      >
        Schedule Publish
      </button>
    </div>
  )
}

type CustomDurationFieldsProps = {
  endDate: string
  endTime: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}

function CustomDurationFields({
  endDate,
  endTime,
  onDateChange,
  onTimeChange,
}: CustomDurationFieldsProps) {
  const [isDateOpen, setIsDateOpen] = useState(false)
  const [isTimeOpen, setIsTimeOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedDate = parseDateValue(endDate)
  const selectedTime = parseTimeValue(endTime)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  useEffect(() => {
    if (!isDateOpen && !isTimeOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsDateOpen(false)
        setIsTimeOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDateOpen(false)
        setIsTimeOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isDateOpen, isTimeOpen])

  return (
    <div ref={rootRef} className="mt-6 grid gap-4 md:grid-cols-2">
      <div className="relative space-y-2.5">
        <Label
          htmlFor="publish-end-date"
          className="text-[14px] font-medium text-[#30384b]"
        >
          Select End Date
        </Label>
        <button
          id="publish-end-date"
          type="button"
          aria-controls="publish-end-date-panel"
          aria-expanded={isDateOpen}
          aria-label="Select end date"
          className={cn(
            "flex h-11 w-full items-center justify-between gap-3 rounded-[6px] border border-[#c8d0dd] bg-white px-4 text-left text-[15px] text-[#30384b] shadow-none transition hover:border-[#aeb9ca] focus-visible:border-[#6d8cff] focus-visible:ring-3 focus-visible:ring-[#6d8cff]/20 focus-visible:outline-none",
            isDateOpen && "border-[#6d8cff] ring-3 ring-[#6d8cff]/20",
            !selectedDate && "text-[#8a94a6]"
          )}
          onClick={() => {
            setIsDateOpen((current) => !current)
            setIsTimeOpen(false)
          }}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <CalendarIcon className="size-4 shrink-0 text-[#7280f7]" />
            <span className="truncate">{formatDateValue(endDate)}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#98a2b3]" />
        </button>

        {isDateOpen ? (
          <div
            id="publish-end-date-panel"
            role="dialog"
            aria-label="Choose end date"
            className="absolute left-0 top-[calc(100%+8px)] z-50 w-auto rounded-[8px] border border-[#dce2ec] bg-white p-0 shadow-[0_18px_48px_rgba(17,24,61,0.16)]"
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate ?? today}
              disabled={{ before: today }}
              onSelect={(date) => {
                if (!date) return

                onDateChange(toDateValue(date))
                setIsDateOpen(false)
              }}
            />
            <div className="flex items-center justify-between border-t border-[#edf0f5] px-3 py-2">
              <button
                type="button"
                className="rounded-[6px] px-2 py-1 text-[13px] font-medium text-[#697083] transition hover:bg-[#f5f6ff] hover:text-[#2448dd]"
                onClick={() => {
                  onDateChange("")
                  setIsDateOpen(false)
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="rounded-[6px] px-2 py-1 text-[13px] font-semibold text-[#2448dd] transition hover:bg-[#f5f6ff]"
                onClick={() => {
                  onDateChange(toDateValue(today))
                  setIsDateOpen(false)
                }}
              >
                Today
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative space-y-2.5">
        <Label
          htmlFor="publish-end-time"
          className="text-[14px] font-medium text-[#30384b]"
        >
          Select End Time
        </Label>
        <button
          id="publish-end-time"
          type="button"
          aria-controls="publish-end-time-panel"
          aria-expanded={isTimeOpen}
          aria-label="Select end time"
          className={cn(
            "flex h-11 w-full items-center justify-between gap-3 rounded-[6px] border border-[#c8d0dd] bg-white px-4 text-left text-[15px] text-[#30384b] shadow-none transition hover:border-[#aeb9ca] focus-visible:border-[#6d8cff] focus-visible:ring-3 focus-visible:ring-[#6d8cff]/20 focus-visible:outline-none",
            isTimeOpen && "border-[#6d8cff] ring-3 ring-[#6d8cff]/20",
            !selectedTime && "text-[#8a94a6]"
          )}
          onClick={() => {
            setIsTimeOpen((current) => !current)
            setIsDateOpen(false)
          }}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Clock className="size-4 shrink-0 text-[#7280f7]" />
            <span className="truncate">{formatTimeValue(endTime)}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#98a2b3]" />
        </button>

        {isTimeOpen ? (
          <div
            id="publish-end-time-panel"
            role="dialog"
            aria-label="Choose end time"
            className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(21rem,calc(100vw-2rem))] rounded-[8px] border border-[#dce2ec] bg-white p-0 shadow-[0_18px_48px_rgba(17,24,61,0.16)]"
          >
            <div className="p-3">
              <div className="grid grid-cols-2 gap-3">
                <TimeOptionColumn
                  label="Hour"
                  options={HOUR_OPTIONS}
                  selectedValue={selectedTime?.hour}
                  onSelect={(hour) => {
                    const current = selectedTime ?? getCurrentTimeParts()
                    onTimeChange(toTimeValue(hour, current.minute))
                  }}
                />
                <TimeOptionColumn
                  label="Minute"
                  options={MINUTE_OPTIONS}
                  selectedValue={selectedTime?.minute}
                  onSelect={(minute) => {
                    const current = selectedTime ?? getCurrentTimeParts()
                    onTimeChange(toTimeValue(current.hour, minute))
                  }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#edf0f5] pt-3">
                <span className="text-[13px] font-medium text-[#697083]">
                  {selectedTime ? formatTimeValue(endTime) : "No time selected"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-[6px] px-2 py-1 text-[13px] font-medium text-[#697083] transition hover:bg-[#f5f6ff] hover:text-[#2448dd]"
                    onClick={() => onTimeChange("")}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] px-2 py-1 text-[13px] font-medium text-[#2448dd] transition hover:bg-[#f5f6ff]"
                    onClick={() => {
                      const current = getCurrentTimeParts()
                      onTimeChange(toTimeValue(current.hour, current.minute))
                    }}
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] bg-[#7280f7] px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#6472ea]"
                    onClick={() => setIsTimeOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-[12px] text-[#98a2b3] md:col-span-2">
        Note: custom duration is recorded locally; the current API publishes without an end date.
      </p>
    </div>
  )
}
type TimeOption = {
  value: number
  label: string
}

function TimeOptionColumn({
  label,
  options,
  selectedValue,
  onSelect,
}: {
  label: string
  options: TimeOption[]
  selectedValue?: number
  onSelect: (value: number) => void
}) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-[12px] font-semibold text-[#697083]">{label}</p>
      <div
        role="listbox"
        aria-label={`${label} options`}
        className="h-36 overflow-y-auto rounded-[7px] border border-[#e4e8f0] bg-[#fbfcff] p-1 [scrollbar-color:#c5cedd_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c5cedd] [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {options.map((option) => {
          const isSelected = selectedValue === option.value

          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={cn(
                "flex h-8 w-full items-center justify-between rounded-[6px] px-2 text-[14px] font-medium transition",
                isSelected
                  ? "bg-[#7280f7] text-white shadow-sm"
                  : "text-[#30384b] hover:bg-[#f5f6ff] hover:text-[#2448dd]"
              )}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
              {isSelected ? <Check className="size-3.5" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type BlockingStateProps = {
  title: string
  description: string
  actionLabel: string
  embedded?: boolean
  onAction: () => void
}

function BlockingState({
  title,
  description,
  actionLabel,
  embedded = false,
  onAction,
}: BlockingStateProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-6",
        embedded ? "min-h-[420px]" : "min-h-full"
      )}
    >
      <section className="w-full max-w-lg rounded-[8px] border border-[#dce2ec] bg-white p-6 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#fff7ed] text-[#f59e0b]">
          <AlertCircle className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[#11183d]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#697083]">{description}</p>
        <Button
          type="button"
          className="mt-5 h-10 rounded-[6px] bg-[#7280f7] px-6 text-white hover:bg-[#6472ea]"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </section>
    </div>
  )
}

