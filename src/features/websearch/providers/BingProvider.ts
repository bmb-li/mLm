export function getBingSearchUrl(query: string): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}`
}

export function getBingExtractionScript(): string {
  return `
(function() {
  try {
    const results = [];
    const items = document.querySelectorAll('#b_results .b_algo');
    items.forEach(function(el) {
      try {
        var h2 = el.querySelector('h2'), a = h2 ? h2.querySelector('a') : null;
        if (a && a.href) {
          var t = a.textContent.trim(), u = a.href;
          if (t && u && !u.startsWith('javascript:') && !u.startsWith('#') && !u.includes('bing.com/search')) {
            if (!results.some(function(r) { return r.url === u; })) results.push({ title: t, url: u });
          }
        }
      } catch(e) {}
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: results }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_error', error: e.message }));
  }
  true;
})();
`
}
