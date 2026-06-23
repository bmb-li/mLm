import React, { useState, useCallback } from 'react'
import { View, Text, useWindowDimensions } from 'react-native'
import { WebView } from 'react-native-webview'

interface Props {
  expression: string
  display?: boolean
}

export default function MathView({ expression, display }: Props) {
  const { width: screenWidth } = useWindowDimensions()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [height, setHeight] = useState(2000)
  const [width, setWidth] = useState(screenWidth - 30)

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{padding:${display ? '8px 0' : '2px 0'};text-align:left;background-color:#2a2a2a;min-width:2000px}
.katex{color:#FFF!important}
#math{display:inline-block}
</style>
</head>
<body>
<div id="math"></div>
<script>
function renderMath() {
  try {
    katex.render(${JSON.stringify(expression)}, document.getElementById('math'), {
      displayMode: ${!!display},
      throwOnError: false
    });
    var h = document.body.scrollHeight;
    var katexHtml = document.querySelector('.katex-html');
    var rawW = katexHtml ? Math.ceil(katexHtml.getBoundingClientRect().width) : 80;
    var w = Math.round(rawW * 1.08) + 8;
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready', height:h, width:w}));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'error', error:e.message}));
  }
}
if (typeof katex !== 'undefined') { renderMath(); }
else {
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.js';
  s.onload = function() { setTimeout(renderMath, 10); };
  s.onerror = function() {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'error', error:'CDN load failed'}));
  };
  document.head.appendChild(s);
}
<\/script>
</body>
</html>`

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ready' && msg.height > 0) {
        setHeight(Math.min(msg.height, 2000))
        if (msg.width > 0) setWidth(Math.min(msg.width, 600))
        setState('ready')
      } else if (msg.type === 'error') {
        setState('error')
        console.warn('[MATH] err:', msg.error)
      }
    } catch {}
  }, [display])

  if (state === 'error') {
    return (
      <View style={{ paddingVertical: 2 }}>
        <View style={{ backgroundColor: '#333', borderRadius: 4, padding: 8 }}>
          <Text style={{ color: '#FFF', fontSize: 14, fontFamily: 'monospace' }}>{expression}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ alignSelf: 'flex-start', width, height: Math.min(height, 2000), overflow: 'hidden' }}>
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#2a2a2a' }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        onMessage={handleMessage}
        androidLayerType="software"
      />
    </View>
  )
}
