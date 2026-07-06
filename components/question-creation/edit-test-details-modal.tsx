"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useEffect, useId, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import {
  getSubjects,
  getSubTopicsByTopics,
  getTopicsBySubject,
  normalizeDifficultyForApi,
  updateTest,
  type Subject,
  type SubTopic,
  type TestRecord,
  type Topic,
} from "@/lib/api"
import { confirmDiscardUnsavedChanges, useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning"
import {
  clampNumericInput,
  sanitizeNumericInput,
  stepNumericInput,
  type NumericInputOptions,
} from "@/lib/numeric-input"
import {
  testDetailsSchema,
  type TestDetailsFormValues,
} from "@/lib/validation/test-details-schema"
import { cn } from "@/lib/utils"

export type EditableTestDetails = TestRecord & {
  subjectName?: string
  topicNames?: string[]
  subTopicNames?: string[]
}

type SelectOption = {
  value: string
  label: string
}

type EditTestDetailsModalProps = {
  open: boolean
  test: EditableTestDetails
  hasCompletedDrafts: boolean
  onClose: () => void
  onSaved: (test: EditableTestDetails) => void
}

function toNumber(value: string) {
  return Number(value.trim())
}

function numberToField(value: number | null | undefined, fallback = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : fallback
}

function signedNumberToField(value: number | null | undefined, fallback = "") {
  const fieldValue = numberToField(value, fallback)
  const parsed = Number(fieldValue)

  if (!fieldValue.trim() || !Number.isFinite(parsed)) {
    return fieldValue
  }

  return parsed >= 0 ? `+${parsed}` : String(parsed)
}

function buildFormFromTest(test: EditableTestDetails): TestDetailsFormValues {
  return {
    subject: test.subject ?? "",
    name: test.name ?? "",
    topic: test.topics?.[0] ?? "",
    subTopic: test.sub_topics?.[0] ?? "",
    duration: numberToField(test.total_time),
    difficulty: normalizeDifficultyForApi(test.difficulty),
    wrongMarks: numberToField(test.wrong_marks, "-1"),
    unattemptMarks: signedNumberToField(test.unattempt_marks, "+0"),
    correctMarks: signedNumberToField(test.correct_marks, "+5"),
    totalQuestions: numberToField(test.total_questions),
    totalMarks: numberToField(test.total_marks),
  }
}

function mergeSelectedOption(
  options: SelectOption[],
  selectedValue: string,
  selectedLabel?: string
) {
  if (
    !selectedValue ||
    options.some((option) => option.value === selectedValue)
  ) {
    return options
  }

  return [
    {
      value: selectedValue,
      label: selectedLabel || selectedValue,
    },
    ...options,
  ]
}

export function EditTestDetailsModal({
  open,
  test,
  hasCompletedDrafts,
  onClose,
  onSaved,
}: EditTestDetailsModalProps) {
  const initialFormForTest = useMemo(() => buildFormFromTest(test), [test])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [subTopics, setSubTopics] = useState<SubTopic[]>([])
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false)
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)
  const [isLoadingSubTopics, setIsLoadingSubTopics] = useState(false)

  const {
    control,
    watch,
    setValue,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<TestDetailsFormValues>({
    resolver: zodResolver(testDetailsSchema),
    defaultValues: initialFormForTest,
  })

  const subjectValue = watch("subject")
  const topicValue = watch("topic")
  const subTopicValue = watch("subTopic")

  useUnsavedChangesWarning(open && isDirty && !isSubmitting)

  const handleClose = useCallback(() => {
    if (confirmDiscardUnsavedChanges(open && isDirty)) {
      onClose()
    }
  }, [isDirty, onClose, open])

  useEffect(() => {
    if (!open) return

    reset(initialFormForTest)
  }, [initialFormForTest, open, reset])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleClose, open])

  useEffect(() => {
    if (!open) return

    let isMounted = true

    async function loadSubjects() {
      setIsLoadingSubjects(true)
      try {
        const response = await getSubjects()

        if (!isMounted) return
        setSubjects(response.data ?? [])
      } catch (error) {
        if (!isMounted) return
        const message =
          error instanceof Error ? error.message : "Unable to load subjects"
        setError("root", { type: "manual", message })
        toast.error("Unable to load subjects", { description: message })
      } finally {
        if (isMounted) {
          setIsLoadingSubjects(false)
        }
      }
    }

    loadSubjects()

    return () => {
      isMounted = false
    }
  }, [open, setError])

  useEffect(() => {
    if (!open || !subjectValue) return

    let isMounted = true

    async function loadTopics() {
      setIsLoadingTopics(true)
      try {
        const response = await getTopicsBySubject(subjectValue)

        if (!isMounted) return
        setTopics(response.data ?? [])
      } catch (error) {
        if (!isMounted) return
        const message =
          error instanceof Error ? error.message : "Unable to load topics"
        setError("root", { type: "manual", message })
        toast.error("Unable to load topics", { description: message })
      } finally {
        if (isMounted) {
          setIsLoadingTopics(false)
        }
      }
    }

    loadTopics()

    return () => {
      isMounted = false
    }
  }, [open, setError, subjectValue])

  useEffect(() => {
    if (!open || !topicValue) return

    let isMounted = true

    async function loadSubTopics() {
      setIsLoadingSubTopics(true)
      try {
        const response = await getSubTopicsByTopics([topicValue])

        if (!isMounted) return
        setSubTopics(response.data ?? [])
      } catch (error) {
        if (!isMounted) return
        const message =
          error instanceof Error ? error.message : "Unable to load sub-topics"
        setError("root", { type: "manual", message })
        toast.error("Unable to load sub-topics", { description: message })
      } finally {
        if (isMounted) {
          setIsLoadingSubTopics(false)
        }
      }
    }

    loadSubTopics()

    return () => {
      isMounted = false
    }
  }, [open, setError, topicValue])

  const subjectOptions = useMemo(
    () =>
      mergeSelectedOption(
        subjects.map((subject) => ({
          value: subject.id,
          label: subject.name,
        })),
        subjectValue,
        test.subjectName
      ),
    [subjectValue, subjects, test.subjectName]
  )

  const topicOptions = useMemo(
    () =>
      mergeSelectedOption(
        topics.map((topic) => ({
          value: topic.id,
          label: topic.name,
        })),
        topicValue,
        topicValue === test.topics?.[0] ? test.topicNames?.[0] : undefined
      ),
    [topicValue, test.topicNames, test.topics, topics]
  )

  const subTopicOptions = useMemo(
    () =>
      mergeSelectedOption(
        subTopics.map((subTopic) => ({
          value: subTopic.id,
          label: subTopic.name,
        })),
        subTopicValue,
        subTopicValue === test.sub_topics?.[0]
          ? test.subTopicNames?.[0]
          : undefined
      ),
    [subTopicValue, subTopics, test.subTopicNames, test.sub_topics]
  )

  async function onSubmit(form: TestDetailsFormValues) {
    const payload = {
      name: form.name.trim(),
      type: "chapterwise",
      subject: form.subject,
      topics: [form.topic],
      sub_topics: [form.subTopic],
      correct_marks: toNumber(form.correctMarks),
      wrong_marks: toNumber(form.wrongMarks),
      unattempt_marks: toNumber(form.unattemptMarks),
      difficulty: normalizeDifficultyForApi(form.difficulty),
      total_time: toNumber(form.duration),
      total_marks: toNumber(form.totalMarks),
      total_questions: toNumber(form.totalQuestions),
    }

    try {
      const response = await updateTest(test.id, payload)
      const selectedSubject = subjectOptions.find(
        (option) => option.value === form.subject
      )
      const selectedTopic = topicOptions.find(
        (option) => option.value === form.topic
      )
      const selectedSubTopic = subTopicOptions.find(
        (option) => option.value === form.subTopic
      )
      const responseTest = response.data
      const savedTest: EditableTestDetails = {
        ...test,
        ...(responseTest ?? {}),
        ...payload,
        id: responseTest?.id ?? test.id,
        status: responseTest?.status ?? test.status,
        created_at: responseTest?.created_at ?? test.created_at,
        updated_at: responseTest?.updated_at ?? test.updated_at,
        subjectName: selectedSubject?.label,
        topicNames: selectedTopic ? [selectedTopic.label] : [],
        subTopicNames: selectedSubTopic ? [selectedSubTopic.label] : [],
      }

      onSaved(savedTest)
      onClose()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update test details. Please try again."
      setError("root", { type: "manual", message })
      toast.error("Unable to save test details", { description: message })
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#11183d]/35 px-4 py-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-test-details-title"
        className="flex max-h-[92dvh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_20px_60px_rgba(17,24,61,0.18)]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[#edf1f7] px-6 py-5">
          <h2
            id="edit-test-details-title"
            className="text-[20px] font-semibold text-[#11183d]"
          >
            Edit Test creation
          </h2>
          <button
            type="button"
            aria-label="Close edit test details"
            className="flex size-9 items-center justify-center rounded-full text-[#8d96a8] transition hover:bg-[#f5f6ff] hover:text-[#2448dd] focus-visible:ring-2 focus-visible:ring-[#8aa4ef] focus-visible:outline-none"
            onClick={handleClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 [scrollbar-color:#c5cedd_transparent] [scrollbar-width:thin]">
          <div className="mb-5 inline-flex h-[48px] w-full max-w-[360px] items-center rounded-[10px] border border-[#dce2ec] bg-white p-1">
            <button
              type="button"
              className="h-9 rounded-[7px] bg-[#f5f6ff] px-5 text-[14px] font-medium whitespace-nowrap text-[#2448dd]"
            >
              Chapter Wise
            </button>
            <button
              type="button"
              disabled
              className="h-9 px-8 text-[14px] font-medium whitespace-nowrap text-[#9ba3b2] disabled:cursor-not-allowed"
            >
              PYQ
            </button>
            <button
              type="button"
              disabled
              className="h-9 px-5 text-[14px] font-medium whitespace-nowrap text-[#9ba3b2] disabled:cursor-not-allowed"
            >
              Mock Test
            </button>
          </div>

          {errors.root?.message ? (
            <p className="mb-5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errors.root.message}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-x-[50px] gap-y-4 xl:grid-cols-2">
            <Controller
              control={control}
              name="subject"
              render={({ field }) => (
                <SelectField
                  label="Subject"
                  value={field.value}
                  placeholder={
                    isLoadingSubjects ? "Loading subjects" : "Choose from Drop-down"
                  }
                  disabled={isLoadingSubjects}
                  error={errors.subject?.message}
                  options={subjectOptions}
                  onValueChange={(value) => {
                    field.onChange(value)
                    setValue("topic", "")
                    setValue("subTopic", "")
                    setTopics([])
                    setSubTopics([])
                  }}
                />
              )}
            />

            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <TextField
                  label="Name of Test"
                  placeholder="Enter name of Test"
                  value={field.value}
                  error={errors.name?.message}
                  onChange={field.onChange}
                />
              )}
            />

            <Controller
              control={control}
              name="topic"
              render={({ field }) => (
                <SelectField
                  label="Topic"
                  value={field.value}
                  placeholder={
                    isLoadingTopics ? "Loading topics" : "Choose from Drop-down"
                  }
                  disabled={!subjectValue || isLoadingTopics}
                  error={errors.topic?.message}
                  options={topicOptions}
                  onValueChange={(value) => {
                    field.onChange(value)
                    setValue("subTopic", "")
                    setSubTopics([])
                  }}
                />
              )}
            />

            <Controller
              control={control}
              name="subTopic"
              render={({ field }) => (
                <SelectField
                  label="Sub Topic"
                  value={field.value}
                  placeholder={
                    isLoadingSubTopics
                      ? "Loading sub-topics"
                      : "Choose from Drop-down"
                  }
                  disabled={!topicValue || isLoadingSubTopics}
                  error={errors.subTopic?.message}
                  options={subTopicOptions}
                  onValueChange={field.onChange}
                />
              )}
            />

            <Controller
              control={control}
              name="duration"
              render={({ field }) => (
                <TextField
                  label="Duration (Minutes)"
                  placeholder="Ex:60"
                  value={field.value}
                  error={errors.duration?.message}
                  inputMode="numeric"
                  minValue={1}
                  maxValue={360}
                  showStepper
                  onChange={field.onChange}
                />
              )}
            />

            <div className="space-y-[18px]">
              <Label className="text-[16px] font-medium text-[#30384b]">
                Test Difficulty Level
              </Label>
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-wrap items-center gap-x-10 gap-y-3 pt-[10px]"
                  >
                    {[
                      ["easy", "Easy"],
                      ["medium", "Medium"],
                      ["hard", "Difficult"],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-1.5 rounded-[6px] py-1 text-[15px] font-medium text-[#30384b] transition hover:text-[#2448dd]"
                      >
                        <RadioGroupItem
                          value={value}
                          className="size-5 border-[#6c83ff] data-checked:bg-white [&_[data-slot=radio-group-indicator]>span]:bg-[#6c83ff]"
                        />
                        {label}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
              {errors.difficulty ? <ErrorText>{errors.difficulty.message}</ErrorText> : null}
            </div>
          </div>

          <div className="mt-[24px]">
            <p className="mb-4 text-[15px] font-medium text-[#30384b]">
              Marking Scheme:
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-[105px_125px_145px_minmax(170px,1fr)_minmax(170px,1fr)] lg:gap-x-10">
              <Controller
                control={control}
                name="wrongMarks"
                render={({ field }) => (
                  <TextField
                    label="Wrong Answer"
                    placeholder="-1"
                    value={field.value}
                    error={errors.wrongMarks?.message}
                    inputMode="numeric"
                    allowNegative
                    minValue={-100}
                    maxValue={0}
                    showStepper
                    compact
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="unattemptMarks"
                render={({ field }) => (
                  <TextField
                    label="Unattempted"
                    placeholder="+0"
                    value={field.value}
                    error={errors.unattemptMarks?.message}
                    inputMode="numeric"
                    allowPositiveSign
                    minValue={0}
                    maxValue={100}
                    showStepper
                    compact
                    showPositiveSign
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="correctMarks"
                render={({ field }) => (
                  <TextField
                    label="Correct Answer"
                    placeholder="+5"
                    value={field.value}
                    error={errors.correctMarks?.message}
                    inputMode="numeric"
                    allowPositiveSign
                    minValue={0}
                    maxValue={100}
                    showStepper
                    compact
                    showPositiveSign
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="totalQuestions"
                render={({ field }) => (
                  <TextField
                    label="No of Questions"
                    placeholder="Ex:50"
                    value={field.value}
                    error={errors.totalQuestions?.message}
                    inputMode="numeric"
                    minValue={1}
                    maxValue={500}
                    showStepper
                    disabled={hasCompletedDrafts}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="totalMarks"
                render={({ field }) => (
                  <TextField
                    label="Total Marks"
                    placeholder="Ex:250"
                    value={field.value}
                    error={errors.totalMarks?.message}
                    inputMode="numeric"
                    minValue={1}
                    maxValue={10000}
                    showStepper
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-5 border-t border-[#edf1f7] px-6 py-5">
          <Button
            type="button"
            variant="secondary"
            className="h-11 w-40 rounded-[6px] bg-[#f7f8ff] text-[15px] font-medium text-[#2448dd] hover:bg-[#eef1ff]"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-40 rounded-[6px] bg-[#7280f7] text-[15px] font-medium text-white hover:bg-[#6472ea]"
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  )
}

type TextFieldProps = {
  label: string
  placeholder: string
  value: string
  error?: string
  compact?: boolean
  disabled?: boolean
  inputMode?: "numeric" | "text"
  allowNegative?: boolean
  allowPositiveSign?: boolean
  integerOnly?: boolean
  minValue?: number
  maxValue?: number
  showPositiveSign?: boolean
  showStepper?: boolean
  onChange: (value: string) => void
}

function TextField({
  label,
  placeholder,
  value,
  error,
  compact = false,
  disabled = false,
  inputMode = "text",
  allowNegative = false,
  allowPositiveSign = false,
  integerOnly = true,
  minValue,
  maxValue,
  showPositiveSign = false,
  showStepper = false,
  onChange,
}: TextFieldProps) {
  const fieldId = useId()
  const isNumeric = inputMode === "numeric"
  const numericOptions: NumericInputOptions = {
    allowNegative,
    allowPositiveSign,
    integerOnly,
    minValue,
    maxValue,
    showPositiveSign,
  }

  function adjustStepper(delta: number) {
    if (disabled) return

    onChange(stepNumericInput(value, delta, numericOptions))
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value

    onChange(isNumeric ? sanitizeNumericInput(nextValue, numericOptions) : nextValue)
  }

  function handleBlur() {
    if (isNumeric) {
      onChange(clampNumericInput(value, numericOptions))
    }
  }

  return (
    <div className={compact ? "space-y-1.5" : "space-y-[11px]"}>
      <Label
        htmlFor={fieldId}
        className={cn(
          "font-medium text-[#30384b]",
          compact ? "text-[11px] leading-4" : "text-[15px]"
        )}
      >
        {label}
      </Label>
      <div className={showStepper ? (compact ? "relative w-[82px]" : "relative") : undefined}>
        <Input
          id={fieldId}
          type="text"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (!showStepper) return

            if (event.key === "ArrowUp") {
              event.preventDefault()
              adjustStepper(1)
            }

            if (event.key === "ArrowDown") {
              event.preventDefault()
              adjustStepper(-1)
            }
          }}
          placeholder={placeholder}
          inputMode={inputMode}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          className={cn(
            "rounded-[6px] border-[#c8d0dd] shadow-none placeholder:text-[#cbd1db] focus-visible:border-[#6d8cff] focus-visible:ring-0 focus-visible:shadow-none",
            compact
              ? "h-8 w-[82px] px-2 text-[12px] text-[#111827]"
              : "h-11 px-4 text-[15px] text-[#30384b]",
            showStepper && (compact ? "pr-5" : "pr-8"),
            disabled &&
              "disabled:bg-[#f7f8fb] disabled:text-[#697083] disabled:opacity-100"
          )}
        />
        {showStepper ? (
          <div className={cn("absolute top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-[3px] text-[#98a2b3]", compact ? "right-1.5" : "right-2.5")}>
            <button
              type="button"
              className="flex h-3 w-3 items-center justify-center hover:text-[#2448dd] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Increase ${label}`}
              onClick={() => adjustStepper(1)}
              disabled={disabled}
              tabIndex={-1}
            >
              <ChevronUp className="size-2.5" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="flex h-3 w-3 items-center justify-center hover:text-[#2448dd] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Decrease ${label}`}
              onClick={() => adjustStepper(-1)}
              disabled={disabled}
              tabIndex={-1}
            >
              <ChevronDown className="size-2.5" strokeWidth={2.4} />
            </button>
          </div>
        ) : null}
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  )
}
type SelectFieldProps = {
  label: string
  value: string
  placeholder: string
  disabled?: boolean
  error?: string
  options: SelectOption[]
  onValueChange: (value: string) => void
}

function SelectField({
  label,
  value,
  placeholder,
  disabled = false,
  error,
  options,
  onValueChange,
}: SelectFieldProps) {
  const fieldId = useId()
  const selectedOption = options.find((option) => option.value === value)

  if (options.length === 0) {
    return (
      <div className="space-y-[11px]">
        <Label htmlFor={fieldId} className="text-[15px] font-medium text-[#30384b]">{label}</Label>
        <div
          id={fieldId}
          aria-disabled="true"
          className="flex h-11 w-full items-center rounded-[6px] border border-[#d9e0eb] bg-white px-4 text-[15px] text-[#cbd1db]"
        >
          <span className="truncate">{placeholder}</span>
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    )
  }

  if (selectedOption && options.length <= 1) {
    return (
      <div className="space-y-[11px]">
        <Label htmlFor={fieldId} className="text-[15px] font-medium text-[#30384b]">{label}</Label>
        <div
          id={fieldId}
          aria-readonly="true"
          className="flex h-11 w-full items-center rounded-[6px] border border-[#d9e0eb] bg-white px-4 text-[15px] text-[#30384b]"
        >
          <span className="truncate">{selectedOption.label}</span>
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    )
  }

  return (
    <div className="space-y-[11px]">
      <Label htmlFor={fieldId} className="text-[15px] font-medium text-[#30384b]">{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onValueChange(nextValue)
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger
          id={fieldId}
          aria-invalid={Boolean(error)}
          className="h-11 w-full rounded-[6px] border-[#c8d0dd] px-4 text-[15px] text-[#30384b] shadow-none focus-visible:border-[#6d8cff] focus-visible:ring-0 focus-visible:shadow-none"
        >
          <span className={selectedOption ? "truncate" : "truncate text-[#cbd1db]"}>
            {selectedOption?.label ?? placeholder}
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="border border-[#dce2ec] bg-white">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-red-500">{children}</p>
}
