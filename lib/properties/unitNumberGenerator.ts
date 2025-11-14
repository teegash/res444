/**
 * Unit Number Generator
 * Parses unit number patterns and generates unit numbers
 * 
 * Supported patterns:
 * - "101-110" → Unit 101, Unit 102, ..., Unit 110
 * - "1-A to 1-J" → 1-A, 1-B, ..., 1-J
 * - "A1-A10" → A1, A2, ..., A10
 */

export interface UnitNumberRange {
  start: string
  end: string
  prefix?: string
  suffix?: string
  isNumeric: boolean
}

export interface ParsedPattern {
  pattern: string
  count: number
  unitNumbers: string[]
  isValid: boolean
  error?: string
}

/**
 * Parse numeric range pattern (e.g., "101-110")
 */
function parseNumericRange(pattern: string): UnitNumberRange | null {
  const match = pattern.match(/^(\d+)-(\d+)$/)
  if (!match) return null

  const start = parseInt(match[1], 10)
  const end = parseInt(match[2], 10)

  if (start >= end) return null
  if (end - start > 1000) return null // Safety limit

  return {
    start: match[1],
    end: match[2],
    isNumeric: true,
  }
}

/**
 * Parse alphanumeric range pattern (e.g., "1-A to 1-J")
 */
function parseAlphanumericRange(pattern: string): UnitNumberRange | null {
  // Pattern: "prefix-start to prefix-end" or "prefix-start-prefix-end"
  const toMatch = pattern.match(/^(.+?)\s+to\s+(.+?)$/i)
  if (toMatch) {
    const start = toMatch[1].trim()
    const end = toMatch[2].trim()

    // Extract common prefix
    const prefix = extractCommonPrefix(start, end)
    const startSuffix = start.replace(prefix, '')
    const endSuffix = end.replace(prefix, '')

    return {
      start: startSuffix,
      end: endSuffix,
      prefix,
      isNumeric: false,
    }
  }

  // Pattern: "A1-A10" or "1A-1J"
  const dashMatch = pattern.match(/^(.+?)-(.+?)$/)
  if (dashMatch) {
    const start = dashMatch[1].trim()
    const end = dashMatch[2].trim()

    const prefix = extractCommonPrefix(start, end)
    const startSuffix = start.replace(prefix, '')
    const endSuffix = end.replace(prefix, '')

    return {
      start: startSuffix,
      end: endSuffix,
      prefix,
      isNumeric: false,
    }
  }

  return null
}

/**
 * Extract common prefix from two strings
 */
function extractCommonPrefix(str1: string, str2: string): string {
  let prefix = ''
  const minLength = Math.min(str1.length, str2.length)

  for (let i = 0; i < minLength; i++) {
    if (str1[i] === str2[i]) {
      prefix += str1[i]
    } else {
      break
    }
  }

  return prefix
}

/**
 * Generate numeric sequence
 */
function generateNumericSequence(
  start: string,
  end: string,
  prefix?: string,
  suffix?: string
): string[] {
  const startNum = parseInt(start, 10)
  const endNum = parseInt(end, 10)
  const numbers: string[] = []

  for (let i = startNum; i <= endNum; i++) {
    let unitNumber = i.toString()
    if (prefix) unitNumber = prefix + unitNumber
    if (suffix) unitNumber = unitNumber + suffix
    numbers.push(unitNumber)
  }

  return numbers
}

/**
 * Generate alphanumeric sequence
 */
function generateAlphanumericSequence(
  start: string,
  end: string,
  prefix?: string
): string[] {
  const numbers: string[] = []

  // Check if it's a numeric suffix (e.g., "1" to "10")
  const startNum = parseInt(start, 10)
  const endNum = parseInt(end, 10)

  if (!isNaN(startNum) && !isNaN(endNum)) {
    // Numeric suffix
    for (let i = startNum; i <= endNum; i++) {
      const unitNumber = prefix ? `${prefix}${i}` : i.toString()
      numbers.push(unitNumber)
    }
  } else {
    // Letter suffix (e.g., "A" to "J")
    const startChar = start.toUpperCase()
    const endChar = end.toUpperCase()

    if (startChar.length === 1 && endChar.length === 1) {
      const startCode = startChar.charCodeAt(0)
      const endCode = endChar.charCodeAt(0)

      if (startCode >= 65 && startCode <= 90 && endCode >= 65 && endCode <= 90) {
        for (let i = startCode; i <= endCode; i++) {
          const letter = String.fromCharCode(i)
          const unitNumber = prefix ? `${prefix}${letter}` : letter
          numbers.push(unitNumber)
        }
      } else {
        // Invalid character range
        return []
      }
    } else {
      // Complex alphanumeric - try to parse
      // For now, return empty array for unsupported patterns
      return []
    }
  }

  return numbers
}

/**
 * Parse unit number pattern and generate unit numbers
 */
export function parseUnitNumberPattern(
  pattern: string,
  expectedCount: number
): ParsedPattern {
  const trimmedPattern = pattern.trim()

  if (!trimmedPattern) {
    return {
      pattern: trimmedPattern,
      count: 0,
      unitNumbers: [],
      isValid: false,
      error: 'Unit number pattern is required',
    }
  }

  // Try numeric range first
  let range = parseNumericRange(trimmedPattern)
  let unitNumbers: string[] = []

  if (range) {
    unitNumbers = generateNumericSequence(range.start, range.end)
  } else {
    // Try alphanumeric range
    range = parseAlphanumericRange(trimmedPattern)
    if (range) {
      unitNumbers = generateAlphanumericSequence(
        range.start,
        range.end,
        range.prefix
      )
    }
  }

  if (!range || unitNumbers.length === 0) {
    return {
      pattern: trimmedPattern,
      count: 0,
      unitNumbers: [],
      isValid: false,
      error: `Invalid unit number pattern format: "${trimmedPattern}". Use formats like "101-110" or "1-A to 1-J"`,
    }
  }

  // Validate count matches
  if (unitNumbers.length !== expectedCount) {
    return {
      pattern: trimmedPattern,
      count: unitNumbers.length,
      unitNumbers,
      isValid: false,
      error: `Pattern generates ${unitNumbers.length} units but count is ${expectedCount}. Pattern should match the count.`,
    }
  }

  return {
    pattern: trimmedPattern,
    count: unitNumbers.length,
    unitNumbers,
    isValid: true,
  }
}

/**
 * Validate unit number pattern format
 */
export function validateUnitNumberPattern(pattern: string): {
  valid: boolean
  error?: string
} {
  const trimmedPattern = pattern.trim()

  if (!trimmedPattern) {
    return { valid: false, error: 'Unit number pattern is required' }
  }

  // Check numeric range
  if (/^\d+-\d+$/.test(trimmedPattern)) {
    const [start, end] = trimmedPattern.split('-').map(Number)
    if (start >= end) {
      return { valid: false, error: 'Start number must be less than end number' }
    }
    if (end - start > 1000) {
      return { valid: false, error: 'Range cannot exceed 1000 units' }
    }
    return { valid: true }
  }

  // Check alphanumeric range with "to"
  if (/^.+?\s+to\s+.+?$/i.test(trimmedPattern)) {
    return { valid: true }
  }

  // Check alphanumeric range with dash
  if (/^.+?-.+?$/.test(trimmedPattern)) {
    return { valid: true }
  }

  return {
    valid: false,
    error: 'Invalid pattern format. Use "101-110" or "1-A to 1-J"',
  }
}

