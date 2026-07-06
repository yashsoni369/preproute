type CsvOptionKey = "option1" | "option2" | "option3" | "option4"

type CsvQuestionDraft = {
  question: string
  options: Record<CsvOptionKey, string>
  correctOption: CsvOptionKey | ""
  optionCount: number
  explanation: string
  difficulty: string
  topic: string
  subTopic: string
}

type CsvImportDefaults = {
  difficulty: string
  topic: string
  subTopic: string
  maxRows?: number
}

type CsvImportError = {
  row: number
  message: string
}

type CsvImportResult = {
  drafts: CsvQuestionDraft[]
  errors: CsvImportError[]
}

const optionKeys: CsvOptionKey[] = ["option1", "option2", "option3", "option4"]

const headerAliases: Record<string, string> = {
  answer: "correct_option",
  correct: "correct_option",
  correctanswer: "correct_option",
  correctoption: "correct_option",
  correct_option: "correct_option",
  optiona: "option1",
  optionb: "option2",
  optionc: "option3",
  optiond: "option4",
  solution: "explanation",
  sub_topic: "subtopic",
  subtopic: "subtopic",
}

function normalizeHeader(value: string) {
  const compact = value.trim().toLowerCase().replace(/[\s-]+/g, "_")
  const aliasKey = compact.replace(/_/g, "")

  return headerAliases[compact] ?? headerAliases[aliasKey] ?? compact
}

function normalizeDifficulty(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase()

  if (normalized === "difficult") return "hard"
  if (normalized === "easy" || normalized === "medium" || normalized === "hard") {
    return normalized
  }

  return fallback || "easy"
}

function parseCorrectOption(value: string): CsvOptionKey | "" {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "")

  if (!normalized) return ""

  if (/^[1-4]$/.test(normalized)) {
    return optionKeys[Number(normalized) - 1]
  }

  if (/^[a-d]$/.test(normalized)) {
    return optionKeys[normalized.charCodeAt(0) - 97]
  }

  if (/^option[1-4]$/.test(normalized)) {
    return optionKeys[Number(normalized.at(-1)) - 1]
  }

  if (/^option[a-d]$/.test(normalized)) {
    return optionKeys[normalized.charCodeAt(normalized.length - 1) - 97]
  }

  return ""
}

function parseCsvRows(csvText: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index]
    const nextChar = csvText[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      row.push(field)
      field = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1
      }
      row.push(field)
      field = ""
      rows.push(row)
      row = []
      continue
    }

    field += char
  }

  row.push(field)
  rows.push(row)

  return rows.filter((csvRow) =>
    csvRow.some((cell) => cell.trim().length > 0)
  )
}

function getCell(
  row: string[],
  headers: Map<string, number>,
  headerName: string
) {
  const index = headers.get(headerName)

  if (index === undefined) return ""

  return row[index]?.trim() ?? ""
}

function validateHeaders(headers: Map<string, number>) {
  const missing = ["question", "option1", "option2", "correct_option"].filter(
    (header) => !headers.has(header)
  )

  if (missing.length === 0) return ""

  return `Missing required headers: ${missing.join(", ")}.`
}

function getOptionCount(options: Record<CsvOptionKey, string>) {
  let optionCount = 0

  for (const key of optionKeys) {
    if (!options[key]) break
    optionCount += 1
  }

  return optionCount
}

function findOptionGap(options: Record<CsvOptionKey, string>) {
  let foundEmpty = false

  for (const key of optionKeys) {
    if (!options[key]) {
      foundEmpty = true
    } else if (foundEmpty) {
      return true
    }
  }

  return false
}

function parseCsvQuestionRow(
  row: string[],
  rowNumber: number,
  headers: Map<string, number>,
  defaults: CsvImportDefaults
): { draft?: CsvQuestionDraft; error?: CsvImportError } {
  const question = getCell(row, headers, "question")
  const options: Record<CsvOptionKey, string> = {
    option1: getCell(row, headers, "option1"),
    option2: getCell(row, headers, "option2"),
    option3: getCell(row, headers, "option3"),
    option4: getCell(row, headers, "option4"),
  }
  const optionCount = getOptionCount(options)
  const correctOption = parseCorrectOption(
    getCell(row, headers, "correct_option")
  )

  if (!question) {
    return { error: { row: rowNumber, message: "Question is required." } }
  }

  if (optionCount < 2) {
    return {
      error: {
        row: rowNumber,
        message: "At least option1 and option2 are required.",
      },
    }
  }

  if (findOptionGap(options)) {
    return {
      error: {
        row: rowNumber,
        message: "Options must be filled in order without gaps.",
      },
    }
  }

  if (!correctOption || optionKeys.indexOf(correctOption) >= optionCount) {
    return {
      error: {
        row: rowNumber,
        message: "Correct option must match a filled option.",
      },
    }
  }

  return {
    draft: {
      question,
      options,
      correctOption,
      optionCount,
      explanation: getCell(row, headers, "explanation"),
      difficulty: normalizeDifficulty(
        getCell(row, headers, "difficulty"),
        defaults.difficulty
      ),
      topic: getCell(row, headers, "topic") || defaults.topic,
      subTopic: getCell(row, headers, "subtopic") || defaults.subTopic,
    },
  }
}

export function parseCsvQuestionsForDrafts(
  csvText: string,
  defaults: CsvImportDefaults
): CsvImportResult {
  const rows = parseCsvRows(csvText)

  if (rows.length === 0) {
    return {
      drafts: [],
      errors: [{ row: 1, message: "CSV file is empty." }],
    }
  }

  const headers = new Map<string, number>()
  rows[0].forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header)

    if (normalizedHeader && !headers.has(normalizedHeader)) {
      headers.set(normalizedHeader, index)
    }
  })

  const headerError = validateHeaders(headers)

  if (headerError) {
    return {
      drafts: [],
      errors: [{ row: 1, message: headerError }],
    }
  }

  const drafts: CsvQuestionDraft[] = []
  const errors: CsvImportError[] = []
  const maxRows = defaults.maxRows ?? Number.POSITIVE_INFINITY

  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2

    if (drafts.length >= maxRows) {
      errors.push({
        row: rowNumber,
        message: `Skipped because this test only has room for ${maxRows} questions.`,
      })
      continue
    }

    const parsed = parseCsvQuestionRow(row, rowNumber, headers, defaults)

    if (parsed.draft) {
      drafts.push(parsed.draft)
    } else if (parsed.error) {
      errors.push(parsed.error)
    }
  }

  if (drafts.length === 0 && errors.length === 0) {
    errors.push({ row: 2, message: "CSV file does not contain question rows." })
  }

  return { drafts, errors }
}
