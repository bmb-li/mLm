import type { SearchResult } from '../types'

export async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  if (!apiKey) {
    throw new Error('Tavily API key is required')
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      include_raw_content: false,
    }),
  })

  if (!res.ok) {
    throw new Error(`Tavily search failed: ${res.status}`)
  }

  const data = await res.json()
  return (data.results || []).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    content: r.content || '',
  }))
}
