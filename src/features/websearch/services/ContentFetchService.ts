import type { SearchResult } from '../types'

const NO_CONTENT = 'No content found'
const MAX_SIZE = 500 * 1024
const READ_TIMEOUT = 8000

function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function extractText(html: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length > 3000) {
    text = text.slice(0, 3000) + '...'
  }
  return text
}

async function fetchAndExtract(url: string): Promise<string> {
  if (!isValidUrl(url)) return NO_CONTENT

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), READ_TIMEOUT)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeoutId)

    if (!response.ok) return NO_CONTENT

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE) return NO_CONTENT

    const html = await response.text()
    if (html.length > MAX_SIZE) return NO_CONTENT

    return extractText(html)
  } catch {
    clearTimeout(timeoutId)
    return NO_CONTENT
  }
}

export async function enrichWithContent(results: SearchResult[]): Promise<SearchResult[]> {
  if (results.length === 0) return results

  const limit = Math.min(results.length, 5)
  const enriched = await Promise.all(
    results.slice(0, limit).map(async (r) => {
      if (r.content) return r
      const content = await fetchAndExtract(r.url)
      return { ...r, content }
    }),
  )

  if (enriched.length < results.length) {
    return [...enriched, ...results.slice(limit)]
  }
  return enriched
}
