import type { SearchResult, SearchEngine } from '../types'

export function getGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export function getGoogleExtractionScript(): string {
  return `
(function() {
  try {
    if (window.location.href.includes('/sorry/') || window.location.href.includes('google.com/sorry')) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'captcha_required' }));
      return;
    }
    const results = [];
    const selectors = ['#search .MjjYud','#search .g','#rso .g','.hlcw0c','[data-sokoban-container]','div[data-hveid] > div > div','#rso > div','.v7W49e','.tF2Cxc','.Gx5Zad'];
    let items = null;
    for (const sel of selectors) { items = document.querySelectorAll(sel); if (items.length > 0) break; }
    if (!items || items.length === 0) {
      document.querySelectorAll('h3').forEach(function(h3) {
        try {
          var a = h3.closest('a') || (h3.parentElement ? h3.parentElement.querySelector('a') : null);
          if (a && a.href && h3.textContent) {
            var u = a.href, t = h3.textContent.trim();
            if (t && !u.includes('google.com/') && !u.startsWith('javascript:')) {
              if (!results.some(function(r) { return r.url === u; })) results.push({ title: t, url: u });
            }
          }
        } catch(e) {}
      });
    } else {
      items.forEach(function(item) {
        try {
          var h3 = item.querySelector('h3'), a = item.querySelector('a');
          if (h3 && a && a.href && !a.href.includes('google.com/') && !a.href.startsWith('javascript:')) {
            if (!results.some(function(r) { return r.url === a.href; })) results.push({ title: h3.textContent.trim(), url: a.href });
          }
        } catch(e) {}
      });
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: results }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_error', error: e.message }));
  }
  true;
})();
`
}
