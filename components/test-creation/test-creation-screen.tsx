"use client"

import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { AuthenticatedShell } from "@/components/layout/authenticated-shell"
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
import { useConfirm } from "@/components/ui/confirm-dialog"
import {
  createTest,
  getSubjects,
  getSubTopicsByTopics,
  getTopicsBySubject,
  normalizeDifficultyForApi,
  type CreateTestPayload,
  type Subject,
  type SubTopic,
  type Topic,
} from "@/lib/api"
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning"
import { getAuthToken } from "@/lib/auth"
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

const CURRENT_TEST_STORAGE_KEY = "preproute_current_test"

const initialForm: TestDetailsFormValues = {
  subject: "",
  name: "",
  topic: "",
  subTopic: "",
  duration: "",
  difficulty: "easy",
  wrongMarks: "-1",
  unattemptMarks: "0",
  correctMarks: "5",
  totalQuestions: "",
  totalMarks: "",
}

function toNumber(value: string) {
  return Number(value.trim())
}

export function TestCreationScreen() {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [subTopics, setSubTopics] = useState<SubTopic[]>([])
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(true)
  const [isLoadingTopics, setIsLoadingTopics] = useState(false)
  const [isLoadingSubTopics, setIsLoadingSubTopics] = useState(false)

  const {
    control,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<TestDetailsFormValues>({
    resolver: zodResolver(testDetailsSchema),
    defaultValues: initialForm,
  })

  const subjectValue = watch("subject")
  const topicValue = watch("topic")
  const subTopicValue = watch("subTopic")

  useUnsavedChangesWarning(isDirty && !isSubmitting)

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.id === subjectValue),
    [subjectValue, subjects]
  )
  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === topicValue),
    [topicValue, topics]
  )
  const selectedSubTopic = useMemo(
    () => subTopics.find((subTopic) => subTopic.id === subTopicValue),
    [subTopicValue, subTopics]
  )

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/")
      return
    }

    let isMounted = true

    async function loadSubjects() {
      setIsLoadingSubjects(true)
      try {
        const response = await getSubjects()

        if (!isMounted) return
        setSubjects(response.data ?? [])
      } catch (error) {
        if (!isMounted) return
        toast.error("Unable to load subjects", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        })
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
  }, [router])

  useEffect(() => {
    // Topics are cleared eagerly wherever subjectValue changes (the subject
    // select's onValueChange and resetForm), so there's nothing to reset here.
    if (!subjectValue) return

    let isMounted = true

    async function loadTopics() {
      setIsLoadingTopics(true)
      try {
        const response = await getTopicsBySubject(subjectValue)

        if (!isMounted) return
        setTopics(response.data ?? [])
      } catch (error) {
        if (!isMounted) return
        toast.error("Unable to load topics", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        })
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
  }, [subjectValue])

  useEffect(() => {
    // Sub-topics are cleared eagerly wherever topicValue changes (the topic
    // select's onValueChange and resetForm), so there's nothing to reset here.
    if (!topicValue) return

    let isMounted = true

    async function loadSubTopics() {
      setIsLoadingSubTopics(true)
      try {
        const response = await getSubTopicsByTopics([topicValue])

        if (!isMounted) return
        setSubTopics(response.data ?? [])
      } catch (error) {
        if (!isMounted) return
        toast.error("Unable to load sub-topics", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        })
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
  }, [topicValue])

  async function onSubmit(form: TestDetailsFormValues) {
    const payload: CreateTestPayload = {
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
      status: "draft",
    }

    try {
      const response = await createTest(payload)
      const createdTest = response.data

      if (!createdTest?.id) {
        throw new Error("Test created without an id")
      }

      window.localStorage.setItem(
        CURRENT_TEST_STORAGE_KEY,
        JSON.stringify({
          ...createdTest,
          subjectName: selectedSubject?.name,
          topicNames: selectedTopic ? [selectedTopic.name] : [],
          subTopicNames: selectedSubTopic ? [selectedSubTopic.name] : [],
        })
      )
      toast.success("Test created", {
        description: `${payload.name} is ready for questions.`,
      })
      router.push("/question-creation")
    } catch (error) {
      toast.error("Unable to create test", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    }
  }

  async function resetForm() {
    if (isDirty) {
      const confirmed = await confirm({
        title: "Discard unsaved changes?",
        description: "Your test details will be cleared.",
        confirmLabel: "Discard",
        tone: "danger",
      })

      if (!confirmed) return
    }

    reset(initialForm)
    setTopics([])
    setSubTopics([])
  }

  return (
    <AuthenticatedShell>
      {confirmDialog}
      <div className="flex min-h-full flex-col px-5 py-4 lg:px-6 xl:px-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="my-auto">
          <div className="mb-4 inline-flex h-[48px] w-[330px] items-center rounded-[10px] border border-[#dce2ec] bg-white p-1">
            <button
              type="button"
              className="h-9 rounded-[7px] bg-[#f5f6ff] px-5 text-[14px] font-medium whitespace-nowrap text-[#2448dd]"
            >
              Chapterwise
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="h-9 px-8 text-[14px] font-medium whitespace-nowrap text-[#9ba3b2] disabled:cursor-not-allowed disabled:opacity-70"
            >
              PYQ
            </button>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="h-9 px-5 text-[14px] font-medium whitespace-nowrap text-[#9ba3b2] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Mock Test
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-[50px] gap-y-3 xl:grid-cols-2">
            <Controller
              control={control}
              name="subject"
              render={({ field }) => (
                <SelectField
                  label="Subject"
                  value={field.value}
                  placeholder={isLoadingSubjects ? "Loading subjects" : "Choose from Drop-down"}
                  disabled={isLoadingSubjects}
                  error={errors.subject?.message}
                  onValueChange={(value) => {
                    field.onChange(value)
                    setValue("topic", "")
                    setValue("subTopic", "")
                    setTopics([])
                    setSubTopics([])
                  }}
                  options={subjects.map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  }))}
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
                  placeholder={isLoadingTopics ? "Loading topics" : "Choose from Drop-down"}
                  disabled={!subjectValue || isLoadingTopics}
                  error={errors.topic?.message}
                  onValueChange={(value) => {
                    field.onChange(value)
                    setValue("subTopic", "")
                    setSubTopics([])
                  }}
                  options={topics.map((topic) => ({ value: topic.id, label: topic.name }))}
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
                    isLoadingSubTopics ? "Loading sub-topics" : "Choose from Drop-down"
                  }
                  disabled={!topicValue || isLoadingSubTopics}
                  error={errors.subTopic?.message}
                  onValueChange={field.onChange}
                  options={subTopics.map((subTopic) => ({
                    value: subTopic.id,
                    label: subTopic.name,
                  }))}
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
              <FieldLabel
                label="Test Difficulty Level"
                required
                className="text-[16px] font-medium text-[#30384b]"
              />
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

          <div className="mt-4">
            <p className="mb-3 text-[15px] font-medium text-[#30384b]">
              Marking Scheme:
            </p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-[150px_150px_150px_250px_250px] xl:gap-[50px]">
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

          <div className="mt-4 flex justify-end gap-5 pb-0">
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-40 rounded-[6px] bg-[#f7f8ff] text-[15px] font-medium text-[#2448dd] hover:bg-[#eef1ff]"
              onClick={() => resetForm()}
            >
              Cancel
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
      </div>
    </AuthenticatedShell>
  )
}

type TextFieldProps = {
  label: string
  placeholder: string
  value: string
  error?: string
  compact?: boolean
  inputMode?: "numeric" | "text"
  allowNegative?: boolean
  allowPositiveSign?: boolean
  integerOnly?: boolean
  minValue?: number
  maxValue?: number
  showPositiveSign?: boolean
  showStepper?: boolean
  required?: boolean
  onChange: (value: string) => void
}

function TextField({
  label,
  placeholder,
  value,
  error,
  compact = false,
  inputMode = "text",
  allowNegative = false,
  allowPositiveSign = false,
  integerOnly = true,
  minValue,
  maxValue,
  showPositiveSign = false,
  showStepper = false,
  required = true,
  onChange,
}: TextFieldProps) {
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
    <div className="space-y-2.5">
      <FieldLabel label={label} required={required} />
      <div className={showStepper ? "relative" : undefined}>
        <Input
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
          aria-invalid={Boolean(error)}
          className={cn(
            "h-11 rounded-[6px] border-[#c8d0dd] px-4 text-[15px] shadow-none placeholder:text-[#cbd1db] focus-visible:border-[#6d8cff] focus-visible:ring-0 focus-visible:shadow-none",
            compact ? "text-[#111827]" : "text-[#30384b]",
            showStepper && "pr-8"
          )}
        />
        {showStepper ? (
          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-[3px] text-[#98a2b3]">
            <button
              type="button"
              className="flex h-3.5 w-3.5 items-center justify-center transition hover:text-[#2448dd] focus-visible:outline-none"
              aria-label={`Increase ${label}`}
              onClick={() => adjustStepper(1)}
              tabIndex={-1}
            >
              <ChevronUp className="size-3" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="flex h-3.5 w-3.5 items-center justify-center transition hover:text-[#2448dd] focus-visible:outline-none"
              aria-label={`Decrease ${label}`}
              onClick={() => adjustStepper(-1)}
              tabIndex={-1}
            >
              <ChevronDown className="size-3" strokeWidth={2.4} />
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
  required?: boolean
  options: Array<{ value: string; label: string }>
  onValueChange: (value: string) => void
}

function SelectField({
  label,
  value,
  placeholder,
  disabled = false,
  error,
  required = true,
  options,
  onValueChange,
}: SelectFieldProps) {
  const selectedOption = options.find((option) => option.value === value)

  if (options.length === 0) {
    return (
      <div className="space-y-2.5">
        <FieldLabel label={label} required={required} />
        <div
          aria-disabled="true"
          className="flex h-11 w-full items-center justify-between gap-1.5 rounded-[6px] border border-[#c8d0dd] bg-white px-4 text-[15px] text-[#cbd1db]"
        >
          <span className="truncate">{placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-[#cbd1db]" />
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    )
  }

  if (selectedOption && options.length <= 1) {
    return (
      <div className="space-y-2.5">
        <FieldLabel label={label} required={required} />
        <div
          aria-readonly="true"
          className="flex h-11 w-full items-center justify-between gap-1.5 rounded-[6px] border border-[#c8d0dd] bg-white px-4 text-[15px] text-[#30384b]"
        >
          <span className="truncate">{selectedOption.label}</span>
          <ChevronDown className="size-4 shrink-0 text-[#c3cad8]" />
        </div>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <FieldLabel label={label} required={required} />
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

function FieldLabel({
  label,
  required = false,
  className = "text-[15px] font-medium text-[#30384b]",
}: {
  label: string
  required?: boolean
  className?: string
}) {
  return (
    <Label className={className}>
      <span>
        {label}
        {required ? (
          <span className="ml-0.5 text-[#ff5f67]" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
    </Label>
  )
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-red-500">{children}</p>
}
