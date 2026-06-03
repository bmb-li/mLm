export function getMetasoSearchUrl(query: string): string {
  return `https://metaso.cn/?q=${encodeURIComponent(query)}`
}

/**
 * DOM 轮询脚本：等待页面渲染后提取来源链接
 * 秘塔是 SPA，搜索结果延迟渲染到 DOM，需轮询等待
 */
export function getMetasoExtractionScript(): string {
  return `
(function() {
  var attempts = 0;
  var maxAttempts = 40;
  var interval = setInterval(function() {
    attempts++;
    var results = [];

    // 尝试多种选择器提取来源链接
    var selectors = [
      '.search-origin-list-box a[href]',
      '.search-title_result-title__Qtgg4 a[href]',
      '.resultTitle a[href]',
      'a[target="_blank"][href*="://"]',
      '[class*="origin-item"] a[href]',
    ];

    for (var s = 0; s < selectors.length; s++) {
      var items = document.querySelectorAll(selectors[s]);
      if (items.length > 0) {
        for (var i = 0; i < items.length; i++) {
          var a = items[i];
          var href = (a.href || a.getAttribute('href') || '');
          var text = (a.textContent || '').trim();
          if (text && href.startsWith('http') && href.indexOf('metaso.cn') === -1 && href.indexOf('static-') === -1) {
            var dup = false;
            for (var j = 0; j < results.length; j++) {
              if (results[j].url === href) { dup = true; break; }
            }
            if (!dup) {
              results.push({ title: text.slice(0, 100), url: href, content: '' });
            }
          }
        }
        if (results.length > 0) break;
      }
    }

    // 如果有结果或超时，发送消息
    if (results.length > 0) {
      clearInterval(interval);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: results }));
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'search_results', results: [] }));
    }
  }, 1000);
  true;
})();
`
}
