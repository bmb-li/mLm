// Diff application utility for app generation
export const HTML_CODE_PLACEHOLDER = '[HTML_OUTPUT_OMITTED]'
export const DIFF_CODE_PLACEHOLDER = '[PREVIOUS_DIFF_APPLIED]'

let latestHtmlCode = ''

export function getLatestHtmlCode(): string {
  return latestHtmlCode
}

export function setLatestHtmlCode(code: string): void {
  latestHtmlCode = code
}

export function clearLatestHtmlCode(): void {
  latestHtmlCode = ''
}

export function replaceHtmlWithPlaceholder(text: string, htmlCode: string): string {
  const idx = text.indexOf(htmlCode)
  if (idx !== -1) {
    return text.substring(0, idx) + HTML_CODE_PLACEHOLDER + text.substring(idx + htmlCode.length)
  }
  return text
}

export function applyDiff(originalHtml: string, diffText: string): { success: boolean; result: string } {
  try {
    const lines = originalHtml.split('\n')
    const blocks = diffText.split('@@@@').map(b => b.trim()).filter(b => b.length > 0)
    let result = [...lines]

    for (const block of blocks) {
      const blockLines = block.split('\n')
      const contextBefore: string[] = []
      const linesToRemove: string[] = []
      const linesToAdd: string[] = []
      let foundChange = false

      for (const line of blockLines) {
        if (line.startsWith('-')) {
          foundChange = true
          linesToRemove.push(line.substring(1))
        } else if (line.startsWith('+')) {
          foundChange = true
          linesToAdd.push(line.substring(1))
        } else {
          if (!foundChange) {
            contextBefore.push(line)
          }
        }
      }

      if (!foundChange || linesToAdd.length === 0) continue

      // Find the context in result
      const contextStr = contextBefore.join('\n')
      for (let i = 0; i <= result.length - contextBefore.length; i++) {
        const match = result.slice(i, i + contextBefore.length).join('\n')
        if (match === contextStr) {
          const startIdx = i
          const removeCount = linesToRemove.length > 0 ? linesToRemove.length : contextBefore.length
          result.splice(startIdx, removeCount, ...linesToAdd)
          break
        }
      }
    }

    return { success: true, result: result.join('\n') }
  } catch (e) {
    return { success: false, result: originalHtml }
  }
}
