import { z } from "zod"
import type { Resolver } from "react-hook-form"

import {
  activeOptionKeys,
  hasQuestionContent,
  type OptionKey,
  type QuestionDraft,
} from "@/lib/question-draft"

export type QuestionDraftFormFields = Pick<
  QuestionDraft,
  "question" | "options" | "correctOption" | "optionCount"
>

export type QuestionDraftErrors = Partial<
  Record<"question" | "options" | "correctOption" | "form", string>
>

export const questionDraftSchema = z
  .object({
    question: z.string(),
    options: z.record(z.string(), z.string()),
    correctOption: z.string(),
    optionCount: z.number(),
  })
  .superRefine((draft, ctx) => {
    const keys = activeOptionKeys(draft.optionCount)

    if (!hasQuestionContent(draft)) {
      ctx.addIssue({
        code: "custom",
        path: ["question"],
        message: "Question text is required",
      })
    }

    if (!keys.every((key) => draft.options[key]?.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `All ${keys.length} options are required`,
      })
    }

    if (!draft.correctOption || !keys.includes(draft.correctOption as OptionKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["correctOption"],
        message: "Select the correct option",
      })
    }
  })

export function validateQuestionDraft(draft: QuestionDraft): QuestionDraftErrors {
  const result = questionDraftSchema.safeParse(draft)

  if (result.success) return {}

  const errors: QuestionDraftErrors = {}

  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof QuestionDraftErrors

    if (key && !errors[key]) {
      errors[key] = issue.message
    }
  }

  return errors
}

// react-hook-form's Resolver expects errors keyed to its FieldValues shape.
// questionDraftSchema's superRefine issues already land on the right field
// names (question / options / correctOption), so this adapts the zod result
// into RHF's resolver contract without forcing the whole QuestionDraft type
// (explanation/difficulty/topic/subTopic aren't validated) through zodResolver.
export const questionDraftResolver: Resolver<QuestionDraftFormFields> = async (
  values
) => {
  const result = questionDraftSchema.safeParse(values)

  if (result.success) {
    return { values, errors: {} }
  }

  const errors: Record<string, { type: string; message: string }> = {}

  for (const issue of result.error.issues) {
    const key = issue.path[0]

    if (typeof key === "string" && !errors[key]) {
      errors[key] = { type: issue.code, message: issue.message }
    }
  }

  return { values: {}, errors }
}
