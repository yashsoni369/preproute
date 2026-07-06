"use client"

import { useDeferredValue, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react"

import {
  getListStatus,
  type DashboardTest,
  type ListStatusTone,
} from "@/lib/dashboard-data"

const STATUS_CHIP: Record<ListStatusTone, string> = {
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

type StatusFilter = "all" | "live" | "draft" | "in_progress"

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Draft" },
  { key: "in_progress", label: "In progress" },
]

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

type TestListProps = {
  tests: DashboardTest[]
  onCreate: () => void
  onView?: (test: DashboardTest) => void
  onEdit?: (test: DashboardTest) => void
}

const PAGE_SIZE = 10

export function TestList({ tests, onCreate, onView, onEdit }: TestListProps) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [page, setPage] = useState(1)
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()

    return tests.filter((test) => {
      const matchesQuery =
        !q ||
        test.name.toLowerCase().includes(q) ||
        test.subject.toLowerCase().includes(q)

      if (!matchesQuery) return false

      switch (filter) {
        case "live":
          return test.status === "live"
        case "in_progress":
          return test.status === "in_progress"
        case "draft":
          return test.status === "draft" || test.status === "ready"
        default:
          return true
      }
    })
  }, [tests, deferredQuery, filter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Clamp at render so an out-of-range page (e.g. after the set shrinks) is
  // handled without a corrective setState effect.
  const safePage = Math.min(page, pageCount)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  function changeQuery(value: string) {
    setQuery(value)
    setPage(1)
  }

  function changeFilter(next: StatusFilter) {
    setFilter(next)
    setPage(1)
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-[#e4e8f0] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#edf1f7] px-[18px] py-[15px] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-[#11183d]">All tests</h2>
          <p className="mt-0.5 text-[11.5px] text-[#98a2b3]">
            Every test you have created - manage, edit, or publish
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-[36px] shrink-0 items-center gap-1.5 rounded-[7px] bg-[#2448dd] px-3.5 text-[13px] font-semibold text-white hover:bg-[#16309e]"
        >
          <Plus className="size-4" strokeWidth={2.4} />
          Create New Test
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-[#edf1f7] px-[18px] py-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-[340px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#98a2b3]" />
          <input
            type="text"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Search by test name or subject..."
            className="h-[36px] w-full rounded-[8px] border border-[#e4e8f0] pl-9 pr-3 text-[13.5px] text-[#11183d] outline-none placeholder:text-[#98a2b3] focus:border-[#c7d1ff] focus:ring-2 focus:ring-[#2448dd]/10"
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => changeFilter(key)}
              className={`h-[32px] rounded-full border px-3 text-[12.5px] font-semibold ${
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr>
              {["Name", "Subject", "Questions", "Marks", "Status", "Created", ""].map(
                (heading, index) => (
                  <th
                    key={heading || "actions"}
                    className={`whitespace-nowrap border-b border-[#edf1f7] px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#98a2b3] ${
                      index === 6 ? "text-right" : "text-left"
                    }`}
                  >
                    {heading || "Actions"}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-[18px] py-10 text-center text-[13px] text-[#98a2b3]"
                >
                  No tests match your search.
                </td>
              </tr>
            ) : (
              visible.map((test) => {
                const status = getListStatus(test)
                const complete =
                  test.totalQuestions > 0 &&
                  test.questionsCompleted >= test.totalQuestions
                const pct =
                  test.totalQuestions > 0
                    ? Math.min(
                        100,
                        (test.questionsCompleted / test.totalQuestions) * 100
                      )
                    : 0

                return (
                  <tr key={test.id} className="hover:bg-[#f7f8ff]">
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5">
                      <div className="flex flex-col gap-0.5">
                        <strong className="text-[13.3px] font-semibold text-[#11183d]">
                          {test.name}
                        </strong>
                        <span className="text-[11.5px] capitalize text-[#98a2b3]">
                          {test.type} - {DIFFICULTY_LABEL[test.difficulty]}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5 text-[13px] text-[#30384b]">
                      {test.subject}
                    </td>
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5">
                      <div className="flex min-w-[118px] items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-[#edf1f7]">
                          <div
                            className={`h-full rounded-full ${
                              complete ? "bg-[#0a8a5c]" : "bg-[#2448dd]"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11.5px] tabular-nums text-[#6b7286]">
                          {test.questionsCompleted} / {test.totalQuestions}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5 text-[13px] tabular-nums text-[#30384b]">
                      {test.totalMarks}
                    </td>
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5">
                      <span
                        className={`inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold ${STATUS_CHIP[status.tone]}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5 text-[12.5px] tabular-nums text-[#6b7286]">
                      {formatDate(test.createdAt)}
                    </td>
                    <td className="border-b border-[#edf1f7] px-[18px] py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <RowAction
                          label="View"
                          icon={<Eye className="size-3.5" strokeWidth={2} />}
                          onClick={onView ? () => onView(test) : undefined}
                          disabledHint="Preview coming next"
                        />
                        <RowAction
                          label="Edit"
                          icon={<Pencil className="size-3.5" strokeWidth={2} />}
                          onClick={onEdit ? () => onEdit(test) : undefined}
                          disabledHint="Edit coming next"
                        />
                        <RowAction
                          label="Delete"
                          icon={<Trash2 className="size-3.5" strokeWidth={2} />}
                          onClick={undefined}
                          disabledHint="Delete is not supported by the provided API"
                          tone="danger"
                        />
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3">
        <span className="text-[12px] text-[#98a2b3]">
          {filtered.length === 0
            ? "No tests"
            : `Showing ${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          {filtered.length !== tests.length ? ` (of ${tests.length} total)` : ""}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="inline-flex size-[30px] items-center justify-center rounded-[7px] border border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#c7d1ff] hover:text-[#16309e] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#e4e8f0] disabled:hover:text-[#30384b]"
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
              className="inline-flex size-[30px] items-center justify-center rounded-[7px] border border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#c7d1ff] hover:text-[#16309e] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#e4e8f0] disabled:hover:text-[#30384b]"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function RowAction({
  label,
  icon,
  onClick,
  disabledHint,
  tone,
}: {
  label: string
  icon: React.ReactNode
  onClick?: () => void
  disabledHint: string
  tone?: "danger"
}) {
  const disabled = !onClick

  const base =
    "inline-flex h-[30px] items-center gap-1.5 rounded-[7px] border px-2.5 text-[12px] font-semibold transition-colors"
  const enabled =
    tone === "danger"
      ? "border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#f6c9cb] hover:bg-[#fef0ef] hover:text-[#d1373f]"
      : "border-[#e4e8f0] bg-white text-[#30384b] hover:border-[#c7d1ff] hover:bg-[#f7f8ff] hover:text-[#16309e]"
  const off = "cursor-not-allowed border-[#eef1f6] bg-white text-[#c4cad6]"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : `${label} test`}
      className={`${base} ${disabled ? off : enabled}`}
    >
      {icon}
      {label}
    </button>
  )
}
