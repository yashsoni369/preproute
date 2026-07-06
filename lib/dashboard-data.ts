// Dashboard data model + derivations. Records come live from `GET /tests`
// (see `mapTestRecordToDashboardTest`) and are shaped into `DashboardTest`,
// which the analytics widgets and the test list both render from.

import type { TestDetailRecord } from "@/lib/api"

export type Difficulty = "easy" | "medium" | "hard"

// Derived, coarse pipeline stage used by the analytics widgets. The backend
// does not store these - they are inferred from the real status + question
// completion (see `derivePipelineStatus`).
export type PipelineStatus = "draft" | "in_progress" | "ready" | "live"

// The real status values the backend accepts/returns (plus `null` on older
// records). Surfaced verbatim in the test list's status chip.
export type BackendStatus =
  | "draft"
  | "unpublished"
  | "scheduled"
  | "expired"
  | "live"

export type DashboardTest = {
  id: string
  name: string
  type: string
  subject: string
  difficulty: Difficulty
  questionsCompleted: number
  totalQuestions: number
  totalMarks: number
  wrongMarks: number
  correctMarks: number
  status: PipelineStatus // derived - drives the analytics widgets
  rawStatus: BackendStatus | null // real backend status - drives the list chip
  createdAt: string // ISO date
  updatedAt: string // ISO date
}

// ---------------------------------------------------------------------------
// API record -> DashboardTest adapter
// ---------------------------------------------------------------------------

function normalizeDifficulty(value: string | undefined): Difficulty {
  if (value === "hard" || value === "difficult") return "hard"
  if (value === "medium") return "medium"
  if (value === "easy") return "easy"
  return "medium"
}

function normalizeBackendStatus(value: string | undefined): BackendStatus | null {
  if (
    value === "draft" ||
    value === "unpublished" ||
    value === "scheduled" ||
    value === "expired" ||
    value === "live"
  ) {
    return value
  }

  return null
}

// The backend only persists `live`/`draft` (and legacy `null`); the pipeline's
// `in_progress`/`ready` stages are inferred from how many questions exist.
function derivePipelineStatus(
  rawStatus: BackendStatus | null,
  completed: number,
  total: number
): PipelineStatus {
  if (rawStatus === "live") return "live"
  if (total > 0 && completed >= total) return "ready"
  if (completed > 0) return "in_progress"
  return "draft"
}

export function mapTestRecordToDashboardTest(
  record: TestDetailRecord
): DashboardTest {
  const completed = record.questions?.length ?? 0
  const total = record.total_questions ?? 0
  const rawStatus = normalizeBackendStatus(record.status)

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    subject: record.subject,
    difficulty: normalizeDifficulty(record.difficulty),
    questionsCompleted: completed,
    totalQuestions: total,
    totalMarks: record.total_marks ?? 0,
    wrongMarks: record.wrong_marks ?? 0,
    correctMarks: record.correct_marks ?? 0,
    status: derivePipelineStatus(rawStatus, completed, total),
    rawStatus,
    createdAt: record.created_at ?? "",
    updatedAt: record.updated_at ?? record.created_at ?? "",
  }
}

// Status shown in the test-list chip. Prefers the real backend status; falls
// back to an inferred "In progress" for partially-authored drafts.
export type ListStatusTone =
  | "live"
  | "draft"
  | "progress"
  | "unpublished"
  | "scheduled"
  | "expired"

export function getListStatus(test: DashboardTest): {
  label: string
  tone: ListStatusTone
} {
  switch (test.rawStatus) {
    case "live":
      return { label: "Live", tone: "live" }
    case "unpublished":
      return { label: "Unpublished", tone: "unpublished" }
    case "scheduled":
      return { label: "Scheduled", tone: "scheduled" }
    case "expired":
      return { label: "Expired", tone: "expired" }
    default:
      if (
        test.questionsCompleted > 0 &&
        test.questionsCompleted < test.totalQuestions
      ) {
        return { label: "In progress", tone: "progress" }
      }
      return { label: "Draft", tone: "draft" }
  }
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

export function getPipelineCounts(tests: DashboardTest[]) {
  const counts = {
    draft: 0,
    in_progress: 0,
    ready: 0,
    live: 0,
  }

  for (const test of tests) {
    counts[test.status] += 1
  }

  return counts
}

export function getSubjectCoverage(tests: DashboardTest[]) {
  const counts = new Map<string, number>()
  for (const test of tests) {
    counts.set(test.subject, (counts.get(test.subject) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
}

export function getDifficultyDistribution(tests: DashboardTest[]) {
  const total = tests.length || 1
  const order: Difficulty[] = ["easy", "medium", "hard"]
  const counts: Record<Difficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
  }

  for (const test of tests) {
    counts[test.difficulty] += 1
  }

  return order.map((difficulty) => {
    const count = counts[difficulty]
    return { difficulty, count, percent: Math.round((count / total) * 100) }
  })
}

export type MarkingSchemeFlag = {
  test: DashboardTest
  message: string
}

export function getMarkingSchemeFlags(
  tests: DashboardTest[]
): MarkingSchemeFlag[] {
  const wrongMarksValues = tests.map((t) => t.wrongMarks)
  const typical = mode(wrongMarksValues)
  const flags: MarkingSchemeFlag[] = []

  for (const test of tests) {
    if (test.status === "live") continue

    if (test.wrongMarks !== typical && Math.abs(test.wrongMarks - typical) >= 1) {
      if (test.wrongMarks === 0) {
        flags.push({
          test,
          message: `No penalty for wrong answers on a ${test.difficulty} test - unusual combination, worth a second look.`,
        })
      } else {
        flags.push({
          test,
          message: `Wrong-answer penalty is ${test.wrongMarks}, outside the ${typical} most chapterwise tests use.`,
        })
      }
    }
  }

  return flags
}

function mode(values: number[]) {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[0] ?? 0
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

// Weekly creation throughput, derived from each test's `createdAt`. Replaces
// the old static fixture - the trend is now real.
export function getCreationTrend(tests: DashboardTest[], weeks = 8) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]

  // Monday of the current week, at local midnight.
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOffset = (startOfToday.getDay() + 6) % 7 // Mon=0 ... Sun=6
  const thisWeekStart = new Date(startOfToday.getTime() - dayOffset * MS_PER_DAY)

  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(
      thisWeekStart.getTime() - (weeks - 1 - i) * 7 * MS_PER_DAY
    )
    return {
      start: start.getTime(),
      end: start.getTime() + 7 * MS_PER_DAY,
      week: `${MONTHS[start.getMonth()]} ${start.getDate()}`,
      count: 0,
    }
  })

  for (const test of tests) {
    if (!test.createdAt) continue
    const created = new Date(test.createdAt).getTime()
    if (Number.isNaN(created)) continue
    const bucket = buckets.find((b) => created >= b.start && created < b.end)
    if (bucket) bucket.count += 1
  }

  return buckets.map(({ week, count }) => ({ week, count }))
}
