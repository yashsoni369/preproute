"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Bold,
  CheckCircle2,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FileQuestion,
  ImageIcon,
  Italic,
  Link2,
  List,
  Minus,
  Pencil,
  Plus,
  Sigma,
  Square,
  Strikethrough,
  Trash2,
  Underline,
  Upload,
} from "lucide-react"

import { Dialog } from "@base-ui/react/dialog"

import { AuthenticatedShell } from "@/components/layout/authenticated-shell"
import {
  EditTestDetailsModal,
  type EditableTestDetails,
} from "@/components/question-creation/edit-test-details-modal"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  createQuestionsBulk,
  normalizeDifficultyForApi,
  type CreateQuestionPayload,
  type TestRecord,
} from "@/lib/api"
import { confirmDiscardUnsavedChanges, useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning"
import { getAuthToken } from "@/lib/auth"
import { parseCsvQuestionsForDrafts } from "@/lib/csv-question-import"
import {
  activeOptionKeys,
  clampOptionCount,
  hasQuestionContent,
  MAX_OPTIONS,
  MIN_OPTIONS,
  optionKeys,
  type OptionKey,
  type QuestionDraft,
} from "@/lib/question-draft"
import {
  questionDraftResolver,
  type QuestionDraftFormFields,
} from "@/lib/validation/question-draft-schema"
import { cn } from "@/lib/utils"

const CURRENT_TEST_STORAGE_KEY = "preproute_current_test"
const CREATED_QUESTIONS_STORAGE_KEY = "preproute_created_questions"
const MAX_CSV_FILE_BYTES = 1024 * 1024

const emptyFormFields: QuestionDraftFormFields = {
  question: "",
  options: { option1: "", option2: "", option3: "", option4: "" },
  correctOption: "",
  optionCount: MAX_OPTIONS,
}

function draftToFormFields(draft: QuestionDraft): QuestionDraftFormFields {
  return {
    question: draft.question,
    options: draft.options,
    correctOption: draft.correctOption,
    optionCount: draft.optionCount,
  }
}

type CurrentTest = TestRecord & {
  subjectName?: string
  topicNames?: string[]
  subTopicNames?: string[]
}

type SelectOption = {
  value: string
  label: string
}

function createEmptyDraft(
  difficulty = "easy",
  topic = "",
  subTopic = ""
): QuestionDraft {
  return {
    question: "",
    options: {
      option1: "",
      option2: "",
      option3: "",
      option4: "",
    },
    correctOption: "",
    optionCount: MAX_OPTIONS,
    explanation: "",
    difficulty: normalizeDifficultyForApi(difficulty),
    topic,
    subTopic,
  }
}

function buildInitialDrafts(test: CurrentTest) {
  const totalQuestions = getTotalQuestions(test)
  const firstTopic = Array.isArray(test.topics) ? test.topics[0] ?? "" : ""
  const firstSubTopic = Array.isArray(test.sub_topics)
    ? test.sub_topics[0] ?? ""
    : ""

  return Array.from({ length: totalQuestions }, () =>
    createEmptyDraft(test.difficulty || "easy", firstTopic, firstSubTopic)
  )
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

function hasSavedQuestionsForTest(value: string | null, testId: string) {
  if (!value) return false

  try {
    const parsed = JSON.parse(value) as {
      testId?: string
      questions?: unknown[]
      drafts?: unknown[]
    }

    return (
      parsed.testId === testId &&
      (Array.isArray(parsed.questions) || Array.isArray(parsed.drafts))
    )
  } catch {
    return false
  }
}

function getStoredDraftsForTest(
  value: string | null,
  test: CurrentTest
): QuestionDraft[] | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as {
      testId?: string
      drafts?: unknown[]
    }

    if (parsed.testId !== test.id || !Array.isArray(parsed.drafts)) {
      return null
    }

    const baseDrafts = buildInitialDrafts(test)

    return baseDrafts.map((baseDraft, index) => {
      const storedDraft = parsed.drafts?.[index]

      if (!storedDraft || typeof storedDraft !== "object") {
        return baseDraft
      }

      const draft = storedDraft as Partial<QuestionDraft>
      const options = (draft.options ?? {}) as Partial<Record<OptionKey, string>>
      const correctOption = optionKeys.includes(draft.correctOption as OptionKey)
        ? (draft.correctOption as OptionKey)
        : ""

      return {
        question:
          typeof draft.question === "string" ? draft.question : baseDraft.question,
        options: {
          option1:
            typeof options.option1 === "string"
              ? options.option1
              : baseDraft.options.option1,
          option2:
            typeof options.option2 === "string"
              ? options.option2
              : baseDraft.options.option2,
          option3:
            typeof options.option3 === "string"
              ? options.option3
              : baseDraft.options.option3,
          option4:
            typeof options.option4 === "string"
              ? options.option4
              : baseDraft.options.option4,
        },
        correctOption,
        optionCount:
          typeof draft.optionCount === "number"
            ? clampOptionCount(draft.optionCount)
            : baseDraft.optionCount,
        explanation:
          typeof draft.explanation === "string"
            ? draft.explanation
            : baseDraft.explanation,
        difficulty:
          typeof draft.difficulty === "string"
            ? normalizeDifficultyForApi(draft.difficulty)
            : baseDraft.difficulty,
        topic: typeof draft.topic === "string" ? draft.topic : baseDraft.topic,
        subTopic:
          typeof draft.subTopic === "string" ? draft.subTopic : baseDraft.subTopic,
      }
    })
  } catch {
    return null
  }
}

function getTotalQuestions(test?: CurrentTest | null) {
  if (!test) return 0

  const value = Number(test.total_questions)

  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }

  return 1
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function normalizeLinkUrl(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) return ""

  if (/^(https?:|mailto:)/i.test(trimmedValue)) {
    return trimmedValue
  }

  return `https://${trimmedValue}`
}

function isDraftValid(draft: QuestionDraft) {
  const keys = activeOptionKeys(draft.optionCount)

  return (
    hasQuestionContent(draft) &&
    keys.every((key) => draft.options[key].trim().length > 0) &&
    Boolean(draft.correctOption) &&
    keys.includes(draft.correctOption as OptionKey)
  )
}

function buildOptions(ids: string[], labels?: string[]) {
  return ids.map((id, index) => ({
    value: id,
    label: labels?.[index] || id,
  }))
}

function optionLabel(key: OptionKey) {
  return `Option ${optionKeys.indexOf(key) + 1}`
}

export function QuestionCreationScreen() {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()
  const screenTopRef = useRef<HTMLDivElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [initialDraftsSnapshot, setInitialDraftsSnapshot] = useState("")
  const [isReady, setIsReady] = useState(false)
  const [currentTest, setCurrentTest] = useState<CurrentTest | null>(null)
  const [drafts, setDrafts] = useState<QuestionDraft[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isQuestionPanelCollapsed, setIsQuestionPanelCollapsed] = useState(false)
  const [isEditTestModalOpen, setIsEditTestModalOpen] = useState(false)
  const [hasSavedQuestionBatch, setHasSavedQuestionBatch] = useState(false)

  const draftsRef = useRef(drafts)
  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  const {
    control,
    handleSubmit: handleQuestionFormSubmit,
    reset: resetQuestionForm,
    setValue: setQuestionFormValue,
    setError: setQuestionFormError,
    clearErrors: clearQuestionFormErrors,
    formState: { errors },
  } = useForm<QuestionDraftFormFields>({
    resolver: questionDraftResolver,
    defaultValues: emptyFormFields,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!getAuthToken()) {
        router.replace("/")
        return
      }

      const storedTest = parseStoredTest(
        window.localStorage.getItem(CURRENT_TEST_STORAGE_KEY)
      )

      if (!storedTest) {
        setIsReady(true)
        return
      }

      const storedQuestionState = window.localStorage.getItem(
        CREATED_QUESTIONS_STORAGE_KEY
      )

      setCurrentTest(storedTest)
      setHasSavedQuestionBatch(
        hasSavedQuestionsForTest(storedQuestionState, storedTest.id)
      )
      const nextDrafts =
        getStoredDraftsForTest(storedQuestionState, storedTest) ??
        buildInitialDrafts(storedTest)

      setInitialDraftsSnapshot(JSON.stringify(nextDrafts))
      setDrafts(nextDrafts)
      setIsReady(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [router])

  // Loads the active question's fields into the RHF-tracked subset whenever
  // navigation moves to a different question. Reads drafts via a ref (rather
  // than depending on `drafts`) so typing doesn't re-trigger this reset.
  useEffect(() => {
    if (!isReady) return

    const draft = draftsRef.current[currentIndex] ?? createEmptyDraft()

    resetQuestionForm(draftToFormFields(draft))
  }, [currentIndex, isReady, resetQuestionForm])

  const currentDraft = drafts[currentIndex] ?? createEmptyDraft()
  const totalQuestions = currentTest ? getTotalQuestions(currentTest) : drafts.length
  const completedCount = useMemo(
    () => drafts.filter((draft) => isDraftValid(draft)).length,
    [drafts]
  )

  const hasUnsavedDraftChanges = useMemo(
    () =>
      isReady &&
      Boolean(currentTest) &&
      JSON.stringify(drafts) !== initialDraftsSnapshot,
    [currentTest, drafts, initialDraftsSnapshot, isReady]
  )

  useUnsavedChangesWarning(
    hasUnsavedDraftChanges && !isSubmitting && !isEditTestModalOpen
  )

  const topicOptions = useMemo(() => {
    if (!currentTest) return []

    return buildOptions(currentTest.topics ?? [], currentTest.topicNames)
  }, [currentTest])

  const subTopicOptions = useMemo(() => {
    if (!currentTest) return []

    return buildOptions(currentTest.sub_topics ?? [], currentTest.subTopicNames)
  }, [currentTest])

  function handleTestDetailsSaved(updatedTest: EditableTestDetails) {
    const nextTest: CurrentTest = updatedTest

    setCurrentTest(nextTest)
    setCurrentIndex((index) =>
      Math.min(index, Math.max(getTotalQuestions(nextTest) - 1, 0))
    )
    window.localStorage.setItem(
      CURRENT_TEST_STORAGE_KEY,
      JSON.stringify(nextTest)
    )
    toast.success("Test details updated")
  }

  function updateCurrentDraft(nextDraft: Partial<QuestionDraft>) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft, index) =>
        index === currentIndex ? { ...draft, ...nextDraft } : draft
      )
    )
    clearQuestionFormErrors("root")
    setStatusMessage("")
  }

  function updateOption(key: OptionKey, value: string) {
    updateCurrentDraft({
      options: {
        ...currentDraft.options,
        [key]: value,
      },
    })
  }

  function deleteOption(targetKey: OptionKey) {
    const keys = activeOptionKeys(currentDraft.optionCount)

    if (keys.length <= MIN_OPTIONS) return

    const targetIndex = keys.indexOf(targetKey)

    if (targetIndex === -1) return

    // Compact remaining values so option1..optionN stay contiguous.
    const remainingValues = keys
      .filter((_, index) => index !== targetIndex)
      .map((key) => currentDraft.options[key])
    const nextOptions: Record<OptionKey, string> = {
      option1: "",
      option2: "",
      option3: "",
      option4: "",
    }
    remainingValues.forEach((val, index) => {
      nextOptions[optionKeys[index]] = val
    })

    let nextCorrect: OptionKey | "" = currentDraft.correctOption

    if (currentDraft.correctOption) {
      const correctIndex = keys.indexOf(currentDraft.correctOption)

      if (correctIndex === targetIndex) {
        nextCorrect = ""
      } else if (correctIndex > targetIndex) {
        nextCorrect = optionKeys[correctIndex - 1]
      }
    }

    updateCurrentDraft({
      options: nextOptions,
      optionCount: currentDraft.optionCount - 1,
      correctOption: nextCorrect,
    })
    setQuestionFormValue("options", nextOptions)
    setQuestionFormValue("optionCount", currentDraft.optionCount - 1)
    setQuestionFormValue("correctOption", nextCorrect)
  }

  function addOption() {
    if (currentDraft.optionCount >= MAX_OPTIONS) return

    updateCurrentDraft({ optionCount: currentDraft.optionCount + 1 })
    setQuestionFormValue("optionCount", currentDraft.optionCount + 1)
  }

  function clearCurrentDraft() {
    const emptyDraft = createEmptyDraft(
      currentTest?.difficulty || "easy",
      topicOptions[0]?.value ?? "",
      subTopicOptions[0]?.value ?? ""
    )

    updateCurrentDraft(emptyDraft)
    resetQuestionForm(draftToFormFields(emptyDraft))
  }

  function hasAnyDraftInput() {
    return drafts.some(
      (draft) =>
        hasQuestionContent(draft) ||
        Object.values(draft.options).some((option) => option.trim()) ||
        Boolean(draft.correctOption) ||
        Boolean(draft.explanation.trim())
    )
  }

  function openCsvPicker() {
    csvInputRef.current?.click()
  }

  async function handleCsvFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file || !currentTest) return

    const isCsvFile =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel"

    if (!isCsvFile) {
      toast.error("Use a CSV file", {
        description: "Upload a .csv file with question, option, and answer columns.",
      })
      return
    }

    if (file.size > MAX_CSV_FILE_BYTES) {
      toast.error("CSV file too large", {
        description: "Please upload a CSV file under 1 MB.",
      })
      return
    }

    if (hasAnyDraftInput()) {
      const confirmed = await confirm({
        title: "Import CSV questions?",
        description:
          "Imported rows will replace the current question drafts for this test.",
        confirmLabel: "Import CSV",
      })

      if (!confirmed) return
    }

    try {
      const text = await file.text()
      const parsed = parseCsvQuestionsForDrafts(text, {
        difficulty: normalizeDifficultyForApi(currentTest.difficulty || "easy"),
        topic: topicOptions[0]?.value ?? "",
        subTopic: subTopicOptions[0]?.value ?? "",
        maxRows: totalQuestions,
      })

      if (parsed.drafts.length === 0) {
        const message =
          parsed.errors[0]?.message ??
          "CSV file does not contain importable questions."

        setQuestionFormError("root", { type: "manual", message })
        toast.error("No questions imported", { description: message })
        return
      }

      const baseDrafts = buildInitialDrafts(currentTest)
      const nextDrafts = baseDrafts.map((draft, index) =>
        parsed.drafts[index] ? { ...draft, ...parsed.drafts[index] } : draft
      )

      setDrafts(nextDrafts)
      setCurrentIndex(0)
      resetQuestionForm(draftToFormFields(nextDrafts[0] ?? createEmptyDraft()))
      setHasSavedQuestionBatch(false)
      clearQuestionFormErrors()

      const importedMessage = `Imported ${parsed.drafts.length} question${
        parsed.drafts.length === 1 ? "" : "s"
      } from ${file.name}. Review them, then click Next to save.`

      setStatusMessage(importedMessage)
      toast.success("CSV imported", { description: importedMessage })

      if (parsed.errors.length > 0) {
        const skippedMessage = `Skipped ${parsed.errors.length} row${
          parsed.errors.length === 1 ? "" : "s"
        }: ${parsed.errors
          .slice(0, 3)
          .map((error) => `row ${error.row} - ${error.message}`)
          .join("; ")}`

        setQuestionFormError("root", {
          type: "manual",
          message: skippedMessage,
        })
        toast.info("Some CSV rows were skipped", {
          description: skippedMessage,
        })
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to read the selected CSV file."

      setQuestionFormError("root", { type: "manual", message })
      toast.error("CSV import failed", { description: message })
    }
  }

  function selectQuestion(index: number) {
    setCurrentIndex(index)
    setStatusMessage("")
    scrollToQuestionTop()
  }

  function scrollToQuestionTop() {
    window.requestAnimationFrame(() => {
      screenTopRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      })
    })
  }

  async function advanceOrFinalize() {
    if (!currentTest) return

    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((index) => index + 1)
      setStatusMessage(`Question ${currentIndex + 1} saved locally.`)
      scrollToQuestionTop()
      return
    }

    const validDrafts = drafts.filter((draft) => isDraftValid(draft))

    if (validDrafts.length === 0) {
      setQuestionFormError("root", {
        type: "manual",
        message: "Add at least one valid question before continuing",
      })
      return
    }

    if (validDrafts.length < totalQuestions) {
      const firstInvalidIndex = drafts.findIndex((draft) => !isDraftValid(draft))

      if (firstInvalidIndex >= 0) {
        setCurrentIndex(firstInvalidIndex)
        scrollToQuestionTop()
      }

      const incompleteMessage = `Complete all ${totalQuestions} questions before publishing. ${validDrafts.length} of ${totalQuestions} questions are complete.`

      setQuestionFormError("root", { type: "manual", message: incompleteMessage })
      toast.error(incompleteMessage)
      return
    }

    const payload: CreateQuestionPayload[] = validDrafts.map((draft) => ({
      type: "mcq",
      subject: currentTest.subject,
      question: draft.question.trim(),
      option1: draft.options.option1.trim(),
      option2: draft.options.option2.trim(),
      option3: draft.options.option3.trim(),
      option4: draft.options.option4.trim(),
      correct_option: draft.correctOption as OptionKey,
      explanation: draft.explanation.trim() || undefined,
      difficulty: normalizeDifficultyForApi(draft.difficulty || currentTest.difficulty),
      test_id: currentTest.id,
    }))

    setIsSubmitting(true)

    try {
      const response = await createQuestionsBulk(payload)
      window.localStorage.setItem(
        CREATED_QUESTIONS_STORAGE_KEY,
        JSON.stringify({
          testId: currentTest.id,
          questions: response.data ?? [],
          drafts: validDrafts,
        })
      )
      setInitialDraftsSnapshot(JSON.stringify(validDrafts))
      setHasSavedQuestionBatch(true)
      setStatusMessage(
        `Saved ${validDrafts.length} question${validDrafts.length === 1 ? "" : "s"}.`
      )
      toast.success(
        `Saved ${validDrafts.length} question${validDrafts.length === 1 ? "" : "s"}`
      )
      router.push("/publish-confirmation")
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save questions. Please try again."

      setQuestionFormError("root", { type: "manual", message })
      toast.error("Unable to save questions", { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  // handleQuestionFormSubmit must be invoked inside an event handler, not
  // during render, since it internally reads refs.
  function onQuestionFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    void handleQuestionFormSubmit(advanceOrFinalize)(event)
  }

  if (!isReady) {
    return (
      <AuthenticatedShell>
        <div className="flex min-h-full items-center justify-center px-6 text-sm text-[#697083]">
          Loading question creation...
        </div>
      </AuthenticatedShell>
    )
  }

  if (!currentTest) {
    return (
      <AuthenticatedShell>
        <div className="flex min-h-full items-center justify-center px-6">
          <section className="w-full max-w-lg rounded-[8px] border border-[#dce2ec] bg-white p-6 text-center">
            <h1 className="text-lg font-semibold text-[#11183d]">
              No created test found
            </h1>
            <p className="mt-2 text-sm text-[#697083]">
              Create the test details first before adding questions.
            </p>
            <Button
              type="button"
              className="mt-5 h-10 rounded-[6px] bg-[#7280f7] px-6 text-white hover:bg-[#6472ea]"
              onClick={() => router.push("/test-creation")}
            >
              Back to Test Details
            </Button>
          </section>
        </div>
      </AuthenticatedShell>
    )
  }

  return (
    <AuthenticatedShell
      actions={
        <Button
          type="button"
          disabled={!hasSavedQuestionBatch}
          className="h-10 w-[160px] rounded-[6px] bg-[#7280f7] text-[15px] font-medium text-white hover:bg-[#6472ea] disabled:opacity-70"
          title={
            hasSavedQuestionBatch
              ? "Open publish confirmation"
              : "Save all questions before publishing"
          }
          onClick={() => {
            if (confirmDiscardUnsavedChanges(hasUnsavedDraftChanges)) {
              router.push("/publish-confirmation")
            }
          }}
        >
          Publish
        </Button>
      }
    >
      <div className="flex min-h-full bg-white">
        <QuestionProgressPanel
          currentIndex={currentIndex}
          drafts={drafts}
          isCollapsed={isQuestionPanelCollapsed}
          totalQuestions={totalQuestions}
          onSelect={selectQuestion}
          onToggleCollapsed={() =>
            setIsQuestionPanelCollapsed((current) => !current)
          }
        />

        <section className="min-w-0 flex-1 px-5 pb-8 pt-4 lg:px-6">
          <div ref={screenTopRef} />

          <TestSummaryCard
            completedCount={completedCount}
            test={currentTest}
            topicOptions={topicOptions}
            subTopicOptions={subTopicOptions}
            onEditRequested={() => {
              setStatusMessage("")
              setIsEditTestModalOpen(true)
            }}
          />

          <EditTestDetailsModal
            open={isEditTestModalOpen}
            test={currentTest}
            hasCompletedDrafts={completedCount > 0}
            onClose={() => setIsEditTestModalOpen(false)}
            onSaved={handleTestDetailsSaved}
          />

          {confirmDialog}

          {errors.root?.message ? (
            <p className="mt-5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errors.root.message}
            </p>
          ) : null}

          {statusMessage ? (
            <p className="mt-5 rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {statusMessage}
            </p>
          ) : null}

          <form onSubmit={onQuestionFormSubmit} noValidate className="mt-7">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-[16px] font-semibold text-[#101044]">
                Question {currentIndex + 1}/
                <span className="text-[#8aa4ef]">{totalQuestions}</span>
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-[6px] bg-[#fff7f7] px-3 text-[13px] font-medium text-[#ff6f75] shadow-none hover:bg-[#fff0f0]"
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: "Clear this question?",
                      description:
                        "The question text, options, solution and settings for this question will be cleared.",
                      confirmLabel: "Clear",
                      tone: "danger",
                    })

                    if (confirmed) {
                      clearCurrentDraft()
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete All Edits
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled
                  title="Coming soon"
                  className="h-10 rounded-[6px] bg-[#fafbff] px-4 text-[13px] font-medium text-[#98a0b2] shadow-none"
                >
                  <Plus className="size-4" />
                  MCQ
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  title="Import MCQ questions from CSV"
                  className="h-10 rounded-[6px] border border-[#dce2ec] bg-white px-4 text-[13px] font-medium text-[#2448dd] shadow-none hover:border-[#b7c5ff] hover:bg-[#f5f6ff]"
                  onClick={openCsvPicker}
                >
                  <Upload className="size-4" />
                  CSV
                </Button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvFileChange}
                />
              </div>
            </div>

            <Controller
              control={control}
              name="question"
              render={({ field }) => (
                <QuestionTextEditor
                  error={errors.question?.message}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value)
                    updateCurrentDraft({ question: value })
                  }}
                />
              )}
            />

            <div className="mt-7">
              <p className="mb-5 text-[15px] font-semibold text-[#11183d]">
                Type the options below
              </p>
              <Controller
                control={control}
                name="correctOption"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      updateCurrentDraft({ correctOption: value as OptionKey })
                    }}
                    className="space-y-5"
                  >
                    {activeOptionKeys(currentDraft.optionCount).map((key) => (
                      <Controller
                        key={key}
                        control={control}
                        name={`options.${key}`}
                        render={({ field: optionField }) => (
                          <OptionRow
                            optionKey={key}
                            value={optionField.value ?? ""}
                            canDelete={currentDraft.optionCount > MIN_OPTIONS}
                            onChange={(value) => {
                              optionField.onChange(value)
                              updateOption(key, value)
                            }}
                            onDelete={() => deleteOption(key)}
                          />
                        )}
                      />
                    ))}
                  </RadioGroup>
                )}
              />
              {currentDraft.optionCount < MAX_OPTIONS ? (
                <button
                  type="button"
                  onClick={addOption}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-[#c3cede] px-3 py-2 text-[13px] font-medium text-[#2448dd] transition hover:border-[#7f91ff] hover:bg-[#f5f6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8aa4ef]"
                >
                  <Plus className="size-4" />
                  Add Option
                </button>
              ) : null}
              {errors.options ? <ErrorText>{errors.options.message}</ErrorText> : null}
              {errors.correctOption ? (
                <ErrorText>{errors.correctOption.message}</ErrorText>
              ) : null}
            </div>

            <div className="mt-7 space-y-4">
              <Label className="text-[15px] font-semibold text-[#11183d]">
                Add Solution
              </Label>
              <div className="relative">
                <textarea
                  value={currentDraft.explanation}
                  onChange={(event) =>
                    updateCurrentDraft({ explanation: event.target.value })
                  }
                  placeholder="Type here"
                  className="min-h-[155px] w-full resize-none rounded-[6px] border border-[#d7e0ee] px-4 py-4 text-[14px] text-[#30384b] outline-none placeholder:text-[#aeb8c7] focus:border-[#6d8cff] focus:ring-2 focus:ring-[#6d8cff]/20"
                />
                <button
                  type="button"
                  className="absolute right-4 top-4 text-[#cbd1db] transition hover:text-[#ff6f75]"
                  aria-label="Clear solution"
                  onClick={() => updateCurrentDraft({ explanation: "" })}
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            </div>


            <QuestionSettings
              difficulty={currentDraft.difficulty}
              topic={currentDraft.topic}
              subTopic={currentDraft.subTopic}
              topicOptions={topicOptions}
              subTopicOptions={subTopicOptions}
              onChange={(nextDraft) => updateCurrentDraft(nextDraft)}
            />

            <div className="mt-8 flex items-center justify-between gap-4 pb-2">
              <Button
                type="button"
                className="h-11 rounded-[6px] bg-[#ff747b] px-5 text-[15px] font-medium text-white hover:bg-[#f2636c]"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: "Exit test creation?",
                    description: hasUnsavedDraftChanges
                      ? "You have unsaved question drafts that will be lost if you leave now."
                      : "You'll return to the test details page.",
                    confirmLabel: "Exit",
                    cancelLabel: "Stay",
                    tone: "danger",
                  })

                  if (confirmed) {
                    router.push("/test-creation")
                  }
                }}
              >
                Exit Test Creation
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-40 rounded-[6px] bg-[#7280f7] text-[15px] font-medium text-white hover:bg-[#6472ea]"
              >
                {isSubmitting ? "Saving..." : "Next"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </AuthenticatedShell>
  )
}

type QuestionProgressPanelProps = {
  currentIndex: number
  drafts: QuestionDraft[]
  isCollapsed: boolean
  totalQuestions: number
  onSelect: (index: number) => void
  onToggleCollapsed: () => void
}

function QuestionProgressPanel({
  currentIndex,
  drafts,
  isCollapsed,
  totalQuestions,
  onSelect,
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

        <div className={cn("max-h-[calc(100dvh-11rem)] overflow-y-auto", isCollapsed ? "flex flex-col items-center gap-2 overflow-x-hidden px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "space-y-2 pr-2 [scrollbar-color:#c5cedd_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#c5cedd] [&::-webkit-scrollbar-track]:bg-transparent")}>
          {Array.from({ length: totalQuestions }).map((_, index) => {
            const draft = drafts[index] ?? createEmptyDraft()
            const isCompleted = isDraftValid(draft)
            const isActive = index === currentIndex
            const rowStateClass = isCollapsed
              ? isCompleted && isActive
                ? "border-[#10b981] bg-[#10b981] text-white shadow-sm"
                : isCompleted
                  ? "border-[#7bdcaf] bg-[#f0fff8] text-[#079767]"
                  : isActive
                    ? "border-[#869dff] bg-[#eef3ff] text-[#2448dd] shadow-sm"
                    : "border-[#e1e6ef] bg-white text-[#98a2b3] hover:border-[#b8c5d6] hover:bg-[#fbfcff]"
              : isCompleted
                ? "border-[#52d59a] bg-[#f4fff9] text-[#079767] hover:bg-[#ecfff6]"
                : isActive
                  ? "border-[#c7d4ff] bg-[#f8faff] text-[#7b8496]"
                  : "border-[#e1e6ef] bg-white text-[#aeb8c8] hover:border-[#cdd7e6] hover:bg-[#fbfcff]"

            return (
              <button
                key={index}
                type="button"
                className={cn(
                  "flex items-center border transition",
                  isCollapsed
                    ? "size-9 justify-center rounded-full px-0 text-[12px] font-semibold"
                    : "h-9 w-full justify-between rounded-[7px] px-3 text-[13px] font-medium",
                  rowStateClass
                )}
                onClick={() => onSelect(index)}
                title={`Question ${index + 1}`}
              >
                {isCollapsed ? (
                  <span className="leading-none">{index + 1}</span>
                ) : (
                  <>
                    <span className="flex items-center gap-2 truncate">
                      {isCompleted ? (
                        <CheckCircle2 className="size-4 shrink-0 fill-[#18ad72] text-white" />
                      ) : (
                        <span className="size-3 shrink-0 rounded-full bg-[#d0d6e2]" />
                      )}
                      <span>Question {index + 1}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0" />
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

type TestSummaryCardProps = {
  completedCount: number
  test: CurrentTest
  topicOptions: SelectOption[]
  subTopicOptions: SelectOption[]
  onEditRequested: () => void
}

function TestSummaryCard({
  completedCount,
  test,
  topicOptions,
  subTopicOptions,
  onEditRequested,
}: TestSummaryCardProps) {
  const subject = test.subjectName || test.subject
  const topics = topicOptions.length > 0 ? topicOptions : buildOptions(test.topics ?? [])
  const subTopics =
    subTopicOptions.length > 0 ? subTopicOptions : buildOptions(test.sub_topics ?? [])

  return (
    <section className="rounded-[7px] border border-[#dce2ec] bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex h-6 items-center rounded-full bg-[#08093e] px-3 text-[13px] font-medium text-white">
            Chapter Wise
          </span>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <h1 className="text-[16px] font-semibold text-[#11183d]">
              {test.name || "Chapter 1"}
            </h1>
            <span className="inline-flex h-6 items-center gap-1 rounded-[6px] bg-[#2ebdaf] px-3 text-[12px] font-medium text-white">
              {displayDifficulty(test.difficulty)}
            </span>
            {completedCount > 0 ? (
              <span className="inline-flex h-6 items-center rounded-[6px] bg-[#effaf5] px-3 text-[12px] font-medium text-[#0aa66e]">
                {completedCount} saved locally
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 text-[13px] text-[#6d7484]">
            <SummaryLine label="Subject" value={subject} />
            <SummaryChips label="Topic" values={topics.map((topic) => topic.label)} />
            <SummaryChips
              label="Sub Topic"
              values={subTopics.map((subTopic) => subTopic.label)}
            />
          </div>
        </div>

        <button
          type="button"
          className="rounded-full p-2 text-[#7280f7] transition hover:bg-[#f5f6ff]"
          aria-label="Edit test details"
          onClick={onEditRequested}
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

type QuestionTextEditorProps = {
  error?: string
  value: string
  onChange: (value: string) => void
}

type EditorPromptKind = "link" | "formula" | null

function QuestionTextEditor({ error, value, onChange }: QuestionTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [promptKind, setPromptKind] = useState<EditorPromptKind>(null)
  const [promptValue, setPromptValue] = useState("")

  useEffect(() => {
    const editor = editorRef.current

    if (!editor || document.activeElement === editor || editor.innerHTML === value) {
      return
    }

    editor.innerHTML = value
  }, [value])

  function syncEditorValue() {
    onChange(editorRef.current?.innerHTML ?? "")
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function runCommand(command: string, commandValue?: string) {
    focusEditor()
    document.execCommand(command, false, commandValue)
    syncEditorValue()
  }

  function insertHtml(html: string) {
    focusEditor()
    document.execCommand("insertHTML", false, html)
    syncEditorValue()
  }

  function saveEditorSelection() {
    const editor = editorRef.current
    const selection = window.getSelection()
    const range =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    savedRangeRef.current =
      range && editor && editor.contains(range.commonAncestorContainer)
        ? range.cloneRange()
        : null
  }

  function restoreEditorSelection() {
    editorRef.current?.focus()

    const range = savedRangeRef.current

    if (!range) return

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function openPrompt(kind: Exclude<EditorPromptKind, null>) {
    // The dialog moves focus out of the editor and makes it inert, which
    // collapses the current selection. Capture it now so we can restore it
    // and wrap/insert against the original selection on confirm.
    saveEditorSelection()

    if (kind === "link") {
      const selectedText = savedRangeRef.current?.toString().trim()

      setPromptValue(selectedText ? "https://" : "")
    } else {
      setPromptValue("")
    }

    setPromptKind(kind)
  }

  function closePrompt() {
    setPromptKind(null)
    setPromptValue("")
  }

  function handlePromptConfirm() {
    const kind = promptKind
    const trimmedValue = promptValue.trim()

    closePrompt()

    if (!trimmedValue) return

    // Defer until the dialog has closed so focus and inert are released from
    // the editor before we restore the selection and run the command.
    window.setTimeout(() => {
      restoreEditorSelection()

      if (kind === "link") {
        runCommand("createLink", normalizeLinkUrl(trimmedValue))
      } else if (kind === "formula") {
        insertHtml(
          `<span data-formula="true" style="font-family:monospace;background:#f6f8ff;border:1px solid #dce2ec;border-radius:4px;padding:1px 6px;">${escapeHtml(trimmedValue)}</span>`
        )
      }
    }, 0)
  }

  function handleLink() {
    openPrompt("link")
  }

  function handleFormula() {
    openPrompt("formula")
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) {
      event.target.value = ""
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image too large", {
        description: "Please use an image under 2 MB.",
      })
      event.target.value = ""
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      const imageSource = typeof reader.result === "string" ? reader.result : ""

      if (imageSource) {
        insertHtml(
          `<img src="${imageSource}" alt="${escapeHtml(file.name)}" />`
        )
      }
    }
    reader.readAsDataURL(file)
    event.target.value = ""
  }

  const tools = [
    { label: "Italic", icon: Italic, action: "italic" },
    { label: "Bold", icon: Bold, action: "bold" },
    { label: "Underline", icon: Underline, action: "underline" },
    { label: "Strikethrough", icon: Strikethrough, action: "strikeThrough" },
    { label: "Link", icon: Link2, action: "link" },
    { label: "Block quote", icon: Square, action: "blockquote" },
    { label: "Align left", icon: AlignLeft, action: "justifyLeft" },
    { label: "Align center", icon: AlignCenter, action: "justifyCenter" },
    { label: "Align right", icon: AlignRight, action: "justifyRight" },
    { label: "List", icon: List, action: "insertUnorderedList" },
    { label: "Upload image", icon: ImageIcon, action: "image" },
    { label: "Divider", icon: Minus, action: "insertHorizontalRule" },
    { label: "Formula", icon: Sigma, action: "formula" },
  ]

  function handleToolbarAction(action: string) {
    if (action === "link") {
      handleLink()
      return
    }

    if (action === "image") {
      imageInputRef.current?.click()
      return
    }

    if (action === "formula") {
      handleFormula()
      return
    }

    if (action === "blockquote") {
      runCommand("formatBlock", "blockquote")
      return
    }

    runCommand(action)
  }

  return (
    <div>
      <div className="rounded-[6px] border border-[#9fc0ff] bg-white">
        <div className="flex min-h-11 flex-wrap items-center gap-1 border-b border-[#dce2ec] bg-[#fbfcff] px-4 py-2 text-[#7b8496]">
          {tools.map((tool) => {
            const Icon = tool.icon

            return (
              <button
                key={tool.label}
                type="button"
                className="flex size-7 items-center justify-center rounded-[5px] text-[#7b8496] transition hover:bg-[#eef3ff] hover:text-[#2448dd] focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none"
                title={tool.label}
                aria-label={tool.label}
                onClick={() => handleToolbarAction(tool.action)}
              >
                <Icon className="size-4" strokeWidth={1.9} />
              </button>
            )
          })}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>
        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-invalid={Boolean(error)}
            data-placeholder="Type here"
            suppressContentEditableWarning
            className="rich-question-editor min-h-[150px] w-full overflow-y-auto px-5 py-4 pr-12 text-[14px] leading-6 text-[#30384b] outline-none empty:before:text-[#9faabc] empty:before:content-[attr(data-placeholder)] [&_a]:text-[#2448dd] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#9fc0ff] [&_blockquote]:pl-3 [&_blockquote]:text-[#4b5563] [&_hr]:my-3 [&_hr]:border-[#dce2ec] [&_img]:my-2 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:rounded-[6px] [&_li]:ml-5 [&_ul]:list-disc"
            onInput={syncEditorValue}
            onBlur={syncEditorValue}
          />
          <button
            type="button"
            aria-label="Clear question"
            className="absolute right-4 top-4 text-[#cbd1db] transition hover:text-[#ff6f75]"
            onClick={() => {
              if (editorRef.current) {
                editorRef.current.innerHTML = ""
              }
              onChange("")
            }}
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Dialog.Root
        open={promptKind !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closePrompt()
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[90] bg-[#0b1020]/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-[95] flex w-[calc(100vw-3rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[10px] border border-[#e4e8f0] bg-white p-6 text-[#30384b] shadow-[0_24px_60px_rgba(17,24,61,0.22)] transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Dialog.Title className="text-[16px] font-semibold text-[#11183d]">
              {promptKind === "link" ? "Insert link" : "Insert formula"}
            </Dialog.Title>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                handlePromptConfirm()
              }}
              className="flex flex-col gap-4"
            >
              <div className="space-y-2">
                <Label className="text-[14px] font-medium text-[#30384b]">
                  {promptKind === "link" ? "Link URL" : "Formula"}
                </Label>
                <Input
                  autoFocus
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  placeholder={
                    promptKind === "link" ? "https://example.com" : "E = mc^2"
                  }
                  className="h-11 rounded-[6px] border-[#d7e0ee] px-4 text-[14px] text-[#30384b] shadow-none placeholder:text-[#aeb8c7] focus-visible:border-[#6d8cff] focus-visible:ring-0 focus-visible:shadow-none"
                />
              </div>
              <div className="mt-1 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 rounded-[6px] border border-[#dce2ec] bg-white px-5 text-[14px] font-medium text-[#4f586a] shadow-none hover:bg-[#f7f8ff]"
                  onClick={closePrompt}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 rounded-[6px] bg-[#7280f7] px-5 text-[14px] font-medium text-white hover:bg-[#6472ea]"
                >
                  {promptKind === "link" ? "Insert link" : "Insert formula"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

type OptionRowProps = {
  optionKey: OptionKey
  value: string
  canDelete: boolean
  onChange: (value: string) => void
  onDelete: () => void
}

function OptionRow({
  optionKey,
  value,
  canDelete,
  onChange,
  onDelete,
}: OptionRowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-4">
      <RadioGroupItem
        value={optionKey}
        aria-label={`${optionLabel(optionKey)} is correct`}
        className="size-5 shrink-0 border-[#6c83ff] data-checked:bg-white [&_[data-slot=radio-group-indicator]>span]:bg-[#6c83ff]"
      />
      <div className="relative min-w-0 flex-1">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type Option here"
          className="h-11 rounded-[6px] border-[#d7e0ee] px-5 pr-12 text-[14px] text-[#30384b] shadow-none placeholder:text-[#aeb8c7] focus-visible:border-[#6d8cff] focus-visible:ring-0 focus-visible:shadow-none"
        />
        {canDelete ? (
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#cbd1db] transition hover:text-[#ff6f75]"
            aria-label={`Delete ${optionLabel(optionKey)}`}
            onClick={onDelete}
          >
            <Trash2 className="size-5" />
          </button>
        ) : null}
      </div>
    </label>
  )
}

type QuestionSettingsProps = {
  difficulty: string
  topic: string
  subTopic: string
  topicOptions: SelectOption[]
  subTopicOptions: SelectOption[]
  onChange: (draft: Partial<QuestionDraft>) => void
}

function QuestionSettings({
  difficulty,
  topic,
  subTopic,
  topicOptions,
  subTopicOptions,
  onChange,
}: QuestionSettingsProps) {
  return (
    <section className="mt-8 space-y-5 border-t border-[#edf1f7] pt-6">
      <h3 className="text-[15px] font-semibold text-[#30384b]">
        Question settings
      </h3>
      <SettingSelect
        label="Level of Difficulty"
        value={difficulty}
        placeholder="Select from Drop-down"
        options={[
          { value: "easy", label: "Easy" },
          { value: "medium", label: "Medium" },
          { value: "hard", label: "Difficult" },
        ]}
        onValueChange={(value) => onChange({ difficulty: value })}
      />
      <SettingSelect
        label="Topic"
        value={topic}
        placeholder="Select from Drop-down"
        options={topicOptions}
        disabled={topicOptions.length === 0}
        onValueChange={(value) => onChange({ topic: value })}
      />
      <SettingSelect
        label="Sub-topic"
        value={subTopic}
        placeholder="Select from Drop-down"
        options={subTopicOptions}
        disabled={subTopicOptions.length === 0}
        onValueChange={(value) => onChange({ subTopic: value })}
      />
    </section>
  )
}

type SettingSelectProps = {
  label: string
  value: string
  placeholder: string
  options: SelectOption[]
  disabled?: boolean
  onValueChange: (value: string) => void
}

function SettingSelect({
  label,
  value,
  placeholder,
  options,
  disabled = false,
  onValueChange,
}: SettingSelectProps) {
  const selectedOption = options.find((option) => option.value === value)

  if (options.length === 0) {
    return (
      <div className="space-y-2.5">
        <Label className="text-[14px] font-medium text-[#30384b]">{label}</Label>
        <div
          aria-disabled="true"
          className="flex h-10 w-full items-center rounded-[6px] border border-[#d9e0eb] bg-white px-4 text-[14px] text-[#cbd1db]"
        >
          <span className="truncate">{placeholder}</span>
        </div>
      </div>
    )
  }

  if (selectedOption && options.length <= 1) {
    return (
      <div className="space-y-2.5">
        <Label className="text-[14px] font-medium text-[#30384b]">{label}</Label>
        <div
          aria-readonly="true"
          className="flex h-10 w-full items-center rounded-[6px] border border-[#d9e0eb] bg-white px-4 text-[14px] text-[#30384b]"
        >
          <span className="truncate">{selectedOption.label}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <Label className="text-[14px] font-medium text-[#30384b]">{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onValueChange(nextValue)
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="h-10 w-full rounded-[6px] border-[#c8d0dd] px-4 text-[14px] text-[#30384b] shadow-none transition focus-visible:border-[#6d8cff] focus-visible:ring-0 focus-visible:shadow-none data-[popup-open]:border-[#6d8cff] data-[popup-open]:ring-0 data-[popup-open]:shadow-none">
          <span className={selectedOption ? "truncate" : "truncate text-[#cbd1db]"}>
            {selectedOption?.label ?? placeholder}
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="border border-[#dce2ec] bg-white shadow-sm">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm text-red-500">{children}</p>
}




