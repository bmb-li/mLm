import type { SearchResult, SearchEngine } from '../types'
import { searchTavily } from '../providers/TavilyProvider'
import { enrichWithContent } from './ContentFetchService'
import { ImageSourcePropType, ImageRequireSource } from 'react-native'

export function getSearchEngineIcon(engine: SearchEngine, isDark?: boolean): any {
  switch (engine) {
    case 'google':
      return isDark
        ? require('../../../assets/search/google_dark.png')
        : require('../../../assets/search/google.png')
    case 'bing':
      return isDark
        ? require('../../../assets/search/bing_dark.png')
        : require('../../../assets/search/bing.png')
    case 'baidu':
      return isDark
        ? require('../../../assets/search/baidu_dark.png')
        : require('../../../assets/search/baidu.png')
    case 'tavily':
      return isDark
        ? require('../../../assets/search/tavily_dark.png')
        : require('../../../assets/search/tavily.png')
    case 'metaso':
      return require('../../../assets/search/metaso.png')
  }
}

export function getSearchEngineIconDisabled(): any {
  return require('../../../assets/search/web_search_grey.png')
}

export function buildSearchSystemPrompt(results: SearchResult[], query: string): string {
  const date = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const refs = results.map((r, i) => {
    const idx = i + 1
    const snippet = r.content
      ? r.content.length > 200
        ? r.content.slice(0, 200) + '...'
        : r.content
      : ''
    return `[${idx}] ${r.title}\n   URL: ${r.url}${snippet ? '\n   内容: ' + snippet : ''}`
  }).join('\n\n')

  return `当前时间: ${date}

用户查询: ${query}

以下是网络搜索结果（按相关性排序）：

${refs}

请基于以上搜索结果回答用户问题。在引用来源时标注编号如 [1][2]，提供准确、简洁的回答。如果搜索结果不足以回答，请如实说明。`
}

export async function searchWebViaApi(
  query: string,
  engine: SearchEngine,
  tavilyApiKey?: string,
): Promise<SearchResult[]> {
  let results: SearchResult[]
  switch (engine) {
    case 'tavily':
      results = await searchTavily(query, tavilyApiKey || '')
      break
    default:
      throw new Error(`Engine ${engine} requires WebView`)
  }

  return enrichWithContent(results)
}
