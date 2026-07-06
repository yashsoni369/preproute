export const optionKeys = ["option1", "option2", "option3", "option4"] as const

export type OptionKey = (typeof optionKeys)[number]

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = optionKeys.length

export type QuestionDraft = {
  question: string
  options: Record<OptionKey, string>
  correctOption: OptionKey | ""
  optionCount: number
  explanation: string
  difficulty: string
  topic: string
  subTopic: string
}

export function clampOptionCount(value: unknown) {
  const numeric = Math.floor(Number(value))

  if (!Number.isFinite(numeric)) return MAX_OPTIONS

  return Math.min(MAX_OPTIONS, Math.max(MIN_OPTIONS, numeric))
}

export function activeOptionKeys(optionCount: number) {
  return optionKeys.slice(0, clampOptionCount(optionCount))
}

export function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()
}

export function hasQuestionContent(draft: Pick<QuestionDraft, "question">) {
  return stripHtml(draft.question).length > 0 || /<img\b/i.test(draft.question)
}
