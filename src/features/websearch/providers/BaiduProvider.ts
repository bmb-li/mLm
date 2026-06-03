export function getBaiduSearchUrl(query: string): string {
  return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
}

export function getBaiduExtractionScript(): string {
  return `
(function() {
  try {
    const results = [];
    const selectors = [
      '#content_left .result h3 a','#content_left .c-container h3 a','.result h3 a',
      '.c-container h3.c-title a','.c-container h3.t a','.result-op h3 a','h3 a[href]'
    ];
    for (const sel of selectors) {
      const items = document.querySelectorAll(sel);
      if (items.length > 0) {
        items.forEach(function(a) {
          try {
            if (a && a.href) {
              var t = a.textContent.trim(), u = a.href;
              if (t && u && !u.includes('baidu.com/s?') && !u.includes('baidu.com/sf/') && !u.startsWith('javascript:') && !u.startsWith('#') && !u.includes('passport.baidu.com')) {
                if (!results.some(function(r) { return r.url === u || r.title === t; })) results.push({ title: t, url: u });
              }
            }
          } catch(e) {}
        });
        if (results.length > 0) break;
      }
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: results }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_error', error: e.message }));
  }
  true;
})();
`
}
