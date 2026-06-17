import React, { useRef, useMemo, useCallback, useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useTheme } from '../contexts/ThemeContext'

interface CodePreviewProps {
  code: string
  language?: string
  style?: any
  onHeightChange?: (height: number) => void
}

export default function CodePreview({ code, language = 'html', style, onHeightChange }: CodePreviewProps) {
  const { theme } = useTheme()
  const webViewRef = useRef<WebView>(null)
  const loadedRef = useRef(false)
  const codeRef = useRef(code)
  const onHeightChangeRef = useRef(onHeightChange)
  const prevLineCountRef = useRef(0)
  codeRef.current = code
  onHeightChangeRef.current = onHeightChange

  const baseHtml = useMemo(() => {
    const isDark = theme.dark
    const base = isDark ? '#e6edf3' : '#24292e'
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px;line-height:1.5;overflow-x:auto;overflow-y:auto;color:${base}}
table{border-collapse:collapse;width:100%}
tr:hover{background:rgba(128,128,128,0.08)}
td.ln{min-width:2.5em;text-align:right;padding-right:16px;color:${isDark ? '#555' : '#ccc'};user-select:none;vertical-align:top;padding:0 16px 0 8px;white-space:nowrap}
td.lc{padding:0;white-space:pre;vertical-align:top;color:${base}}
.k{color:${isDark ? '#ff7b72' : '#d73a49'}}   .t{color:${isDark ? '#79c0ff' : '#005cc5'}}
.a{color:${isDark ? '#d2a8ff' : '#6f42c1'}}   .v{color:${isDark ? '#a5d6ff' : '#032f62'}}
.c{color:${isDark ? '#6A9955' : '#4d7c3c'}}   .n{color:${isDark ? '#79c0ff' : '#005cc5'}}
.e{color:${isDark ? '#d2a8ff' : '#6f42c1'}}   .m{color:${isDark ? '#8b949e' : '#6a737d'}}
</style>
<script>
window.renderCode = function(lines) {
  try {
    var tbl = document.getElementById('tbl');
    if (!tbl) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'codeError',error:'no tbl'})); return; }
    var h = '';
    var RE = /(&lt;!--[\\s\\S]*?--&gt;)|(\\/\\/[^\\n]*)|(\\/\\*[\\s\\S]*?\\*\\/)|(&lt;\\/?\\w[\\w-][^&]*&gt;)|("(?:[^"&]|&[^;]*;)*"|'(?:[^'&]|&[^;]*;)*')|(\\b\\d+\\.?\\d*\\b)|(\\b(?:function|var|let|const|if|else|for|while|do|switch|case|break|continue|return|throw|try|catch|finally|new|delete|typeof|instanceof|in|of|class|extends|import|export|from|default|async|await|yield|this|super|true|false|null|undefined|void|static|get|set|enum|implements|interface|namespace|private|protected|public|abstract|type|readonly|keyof|any|unknown|never|as|module|declare)\\b)/gi;
    for (var i = 0; i < lines.length; i++) {
      var s = (lines[i] || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var line = '', last = 0, m;
      RE.lastIndex = 0;
      while ((m = RE.exec(s)) !== null) {
        line += s.slice(last, m.index);
        if (m[1] || m[2] || m[3]) line += '<span class="c">' + m[0] + '</span>';
        else if (m[4]) line += '<span class="t">' + m[0] + '</span>';
        else if (m[6]) line += '<span class="v">' + m[0] + '</span>';
        else if (m[7]) line += '<span class="n">' + m[0] + '</span>';
        else if (m[8]) line += '<span class="k">' + m[0] + '</span>';
        else line += m[0];
        last = m.index + m[0].length;
      }
      line += s.slice(last);
      h += '<tr><td class="ln">' + (i+1) + '</td><td class="lc">' + line + '</td></tr>';
    }
    tbl.innerHTML = h;
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'codeHeight',height:document.body.scrollHeight}));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'codeError',error:e.message,stack:e.stack}));
  }
};
</script>
</head>
<body>
<table><tbody id="tbl"></tbody></table>
</body>
</html>`
  }, [language, theme.dark])

  useEffect(() => {
    const lineCount = code.split('\n').length
    console.warn('[CodePreview] code change', { lineCount, loaded: loadedRef.current, prev: prevLineCountRef.current, codeLen: code.length })
    if (lineCount !== prevLineCountRef.current) {
      prevLineCountRef.current = lineCount
      if (loadedRef.current) {
        webViewRef.current?.injectJavaScript(
          `window.renderCode(${JSON.stringify(code.split('\n'))})`,
        )
      }
    }
  }, [code])

  const onLoad = useCallback(() => {
    loadedRef.current = true
    console.warn('[CodePreview] onLoad', { lines: codeRef.current.split('\n').length })
    prevLineCountRef.current = codeRef.current.split('\n').length
    webViewRef.current?.injectJavaScript(
      `window.renderCode(${JSON.stringify(codeRef.current.split('\n'))})`,
    )
  }, [])

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: baseHtml }}
        style={styles.webView}
        scrollEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onLoad={onLoad}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data)
            if (msg.type === 'codeHeight' && onHeightChangeRef.current) {
              onHeightChangeRef.current(Math.min(msg.height + 16, 5000))
            } else if (msg.type === 'codeError') {
              console.warn('[CodePreview] JS Error:', msg.error)
            }
          } catch {}
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { minHeight: 60 },
  webView: { flex: 1, backgroundColor: 'transparent' },
})
