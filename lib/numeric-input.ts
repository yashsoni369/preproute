export type NumericInputOptions = {
  allowNegative?: boolean
  allowPositiveSign?: boolean
  integerOnly?: boolean
  minValue?: number
  maxValue?: number
  showPositiveSign?: boolean
}

function isIncompleteSignedValue(value: string) {
  return value === "-" || value === "+"
}

function formatNumericValue(value: number, options: NumericInputOptions) {
  const normalizedValue = options.integerOnly ? Math.trunc(value) : value

  if (options.showPositiveSign && normalizedValue >= 0) {
    return `+${normalizedValue}`
  }

  return String(normalizedValue)
}

function clampNumber(value: number, options: NumericInputOptions) {
  let nextValue = value

  if (typeof options.minValue === "number") {
    nextValue = Math.max(options.minValue, nextValue)
  }

  if (typeof options.maxValue === "number") {
    nextValue = Math.min(options.maxValue, nextValue)
  }

  return nextValue
}

export function sanitizeNumericInput(
  value: string,
  options: NumericInputOptions = {}
) {
  const { allowNegative = false, allowPositiveSign = false, integerOnly = true } =
    options
  let nextValue = ""
  let hasDecimal = false
  let hasSign = false

  for (const character of value.trim()) {
    if (/\d/.test(character)) {
      nextValue += character
      continue
    }

    if (
      character === "-" &&
      allowNegative &&
      nextValue.length === 0 &&
      !hasSign
    ) {
      nextValue = "-"
      hasSign = true
      continue
    }

    if (
      character === "+" &&
      allowPositiveSign &&
      nextValue.length === 0 &&
      !hasSign
    ) {
      nextValue = "+"
      hasSign = true
      continue
    }

    if (!integerOnly && character === "." && !hasDecimal) {
      nextValue += "."
      hasDecimal = true
    }
  }

  return nextValue
}

export function clampNumericInput(
  value: string,
  options: NumericInputOptions = {}
) {
  const sanitizedValue = sanitizeNumericInput(value, options)

  if (!sanitizedValue || isIncompleteSignedValue(sanitizedValue)) {
    return ""
  }

  const parsedValue = Number(sanitizedValue)

  if (!Number.isFinite(parsedValue)) {
    return ""
  }

  return formatNumericValue(clampNumber(parsedValue, options), options)
}

export function stepNumericInput(
  value: string,
  delta: number,
  options: NumericInputOptions = {}
) {
  const sanitizedValue = sanitizeNumericInput(value, options)
  const parsedValue = Number(sanitizedValue)
  const minValue = options.minValue
  const maxValue = options.maxValue
  const fallbackValue =
    typeof minValue === "number" && minValue > 0
      ? minValue - delta
      : typeof maxValue === "number" && maxValue < 0
        ? maxValue - delta
        : 0
  const currentValue =
    sanitizedValue && !isIncompleteSignedValue(sanitizedValue) && Number.isFinite(parsedValue)
      ? parsedValue
      : fallbackValue

  return formatNumericValue(clampNumber(currentValue + delta, options), options)
}

export function isNumericInRange(
  value: string,
  options: NumericInputOptions = {}
) {
  const sanitizedValue = sanitizeNumericInput(value, options)

  if (!sanitizedValue || isIncompleteSignedValue(sanitizedValue)) {
    return false
  }

  const parsedValue = Number(sanitizedValue)

  if (!Number.isFinite(parsedValue)) {
    return false
  }

  if (typeof options.minValue === "number" && parsedValue < options.minValue) {
    return false
  }

  if (typeof options.maxValue === "number" && parsedValue > options.maxValue) {
    return false
  }

  return true
}
