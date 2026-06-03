export type SearchEngine = 'google' | 'bing' | 'baidu' | 'tavily' | 'metaso'

export interface SearchResult {
  title: string
  url: string
  content: string
}

export interface SearchProviderConfig {
  id: SearchEngine
  name: string
  requiresApiKey: boolean
}

export const SEARCH_ENGINES: SearchProviderConfig[] = [
  { id: 'google', name: 'Google', requiresApiKey: false },
  { id: 'bing', name: 'Bing', requiresApiKey: false },
  { id: 'baidu', name: 'Baidu', requiresApiKey: false },
  { id: 'tavily', name: 'Tavily', requiresApiKey: true },
  { id: 'metaso', name: '秘塔AI搜索', requiresApiKey: false },
]
