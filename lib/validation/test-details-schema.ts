import { z } from "zod"

import { isNumericInRange, type NumericInputOptions } from "@/lib/numeric-input"

const DURATION_LIMITS = { minValue: 1, maxValue: 180 } satisfies NumericInputOptions
const QUESTION_COUNT_LIMITS = { minValue: 1, maxValue: 500 } satisfies NumericInputOptions
const TOTAL_MARKS_LIMITS = { minValue: 1, maxValue: 10000 } satisfies NumericInputOptions
const WRONG_MARKS_LIMITS = {
  allowNegative: true,
  minValue: -5,
  maxValue: 0,
} satisfies NumericInputOptions
const UNATTEMPTED_MARKS_LIMITS = {
  allowPositiveSign: true,
  minValue: 0,
  maxValue: 100,
} satisfies NumericInputOptions
const CORRECT_MARKS_LIMITS = {
  allowPositiveSign: true,
  minValue: 0,
  maxValue: 100,
} satisfies NumericInputOptions

function numericField(message: string, options: NumericInputOptions) {
  return z.string().refine((value) => isNumericInRange(value, options), message)
}

export const testDetailsSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  name: z
    .string()
    .trim()
    .min(1, "Name of Test is required")
    .refine((value) => /[A-Za-z]/.test(value), "Test name must include letters"),
  topic: z.string().min(1, "Topic is required"),
  subTopic: z.string().min(1, "Sub Topic is required"),
  duration: numericField("Duration must be between 1 and 180 minutes", DURATION_LIMITS),
  difficulty: z.string().min(1, "Difficulty is required"),
  wrongMarks: numericField("Wrong marks must be between -5 and 0", WRONG_MARKS_LIMITS),
  unattemptMarks: numericField(
    "Unattempted marks must be between 0 and 100",
    UNATTEMPTED_MARKS_LIMITS
  ),
  correctMarks: numericField("Correct marks must be between 0 and 100", CORRECT_MARKS_LIMITS),
  totalQuestions: numericField("No of Questions must be between 1 and 500", QUESTION_COUNT_LIMITS),
  totalMarks: numericField("Total Marks must be between 1 and 10000", TOTAL_MARKS_LIMITS),
})

export type TestDetailsFormValues = z.infer<typeof testDetailsSchema>
