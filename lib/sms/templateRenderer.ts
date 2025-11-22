export function renderTemplateContent(
  template: string,
  variables: Record<string, string | number | null | undefined>
) {
  return Object.entries(variables).reduce((content, [key, value]) => {
    const token = key.startsWith('[') ? key : `[${key}]`
    const stringValue = value !== null && value !== undefined ? String(value) : ''
    return content.replace(new RegExp(token, 'g'), stringValue)
  }, template)
}
