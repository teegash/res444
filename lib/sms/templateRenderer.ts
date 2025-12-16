export function renderTemplateContent(
  template: string,
  variables: Record<string, string | number | null | undefined>
) {
  const escapeRegex = (value: string) => value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')

  return Object.entries(variables).reduce((content, [key, value]) => {
    const stringValue = value !== null && value !== undefined ? String(value) : ''
    const normalized = key
      .replace(/^\s*\{\{\s*/, '')
      .replace(/\s*\}\}\s*$/, '')
      .replace(/^\s*\[\s*/, '')
      .replace(/\s*\]\s*$/, '')
    const tokensToReplace = new Set<string>([
      key,
      `{{${normalized}}}`,
      `{{ ${normalized} }}`,
      `[${normalized}]`,
    ])

    let updated = content
    tokensToReplace.forEach((token) => {
      updated = updated.replace(new RegExp(escapeRegex(token), 'g'), stringValue)
    })
    return updated
  }, template)
}
