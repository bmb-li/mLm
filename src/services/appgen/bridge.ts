// WebView bridge script injected into generated apps
export const generateBridgeScript = (): string => `
<script>
(function() {
  var pendingRequests = {};
  var reqId = 0;
  window.AI = {
    chat: function(options, onStream) {
      return new Promise(function(resolve, reject) {
        var requestId = 'r' + (++reqId);
        pendingRequests[requestId] = { resolve, reject, onStream };
        var payload = { type: 'aiChat', requestId: requestId, messages: options.messages || [] };
        if (options.systemPrompt) payload.systemPrompt = options.systemPrompt;
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      });
    },
    repairJSON: function(jsonString) {
      return new Promise(function(resolve) {
        var requestId = 'r' + (++reqId);
        pendingRequests[requestId] = { resolve: resolve };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'repairJSON', requestId: requestId, jsonString: jsonString
        }));
      });
    },
    getApps: function() {
      return new Promise(function(resolve) {
        var requestId = 'r' + (++reqId);
        pendingRequests[requestId] = { resolve: resolve };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'getApps', requestId: requestId
        }));
      });
    },
    openApp: function(id) {
      return new Promise(function(resolve) {
        var requestId = 'r' + (++reqId);
        pendingRequests[requestId] = { resolve: resolve };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'openApp', requestId: requestId, appId: id
        }));
      });
    }
  };
  window._onAIMessage = function(msg) {
    var req = pendingRequests[msg.id];
    if (!req) return;
    if (msg.type === 'chunk' && req.onStream) req.onStream(msg.text);
    else if (msg.type === 'done' || msg.type === 'repairResult') {
      req.resolve(msg.text || msg.result);
      delete pendingRequests[msg.id];
    }
    else if (msg.type === 'appsResult') {
      req.resolve(msg.apps);
      delete pendingRequests[msg.id];
    }
    else if (msg.type === 'openAppResult') {
      req.resolve(msg.htmlCode);
      delete pendingRequests[msg.id];
    }
    else if (msg.type === 'error') { req.reject(new Error(msg.error || 'AI error')); delete pendingRequests[msg.id]; }
  };
  window.addEventListener('message', function(e) {
    try { window._onAIMessage(JSON.parse(e.data)); } catch(ex) {}
  });
})();
</script>
`

export const injectBridge = (html: string): string => {
  const script = generateBridgeScript()
  if (html.includes('</body>')) return html.replace('</body>', `${script}</body>`)
  if (html.includes('</html>')) return html.replace('</html>', `${script}</html>`)
  if (html.includes('<head>')) return html.replace('<head>', `<head>${script}`)
  return script + html
}

export const commonWebViewProps = {
  javaScriptEnabled: true,
  domStorageEnabled: true,
  allowFileAccess: true,
  allowUniversalAccessFromFileURLs: true,
  mixedContentMode: 'compatibility' as const,
  originWhitelist: ['*'],
} as const
