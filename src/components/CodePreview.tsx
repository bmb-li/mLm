import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'
import { useTheme } from '../contexts/ThemeContext'
import Clipboard from '@react-native-clipboard/clipboard'

interface CodePreviewProps {
  code: string
  language?: string
  style?: any
  showHeader?: boolean
  wrapLines?: boolean
  onFullscreen?: () => void
  onHeightChange?: (height: number) => void
}

export default function CodePreview({ code, language = 'html', style, showHeader = true, wrapLines = false, onFullscreen, onHeightChange }: CodePreviewProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const webViewRef = useRef<WebView>(null)
  const loadedRef = useRef(false)
  const codeRef = useRef(code)
  const onHeightChangeRef = useRef(onHeightChange)
  const prevLineCountRef = useRef(0)
  const [internalHeight, setInternalHeight] = useState(0)
  const [copied, setCopied] = useState(false)
  codeRef.current = code
  onHeightChangeRef.current = onHeightChange

  const lines = useMemo(() => code.split('\n'), [code])
  const estimatedHeight = Math.min(lines.length * 20 + 40, 500)
  const parentControlsSize = style && (style.flex !== undefined || style.height !== undefined)
  const containerMinHeight = parentControlsSize ? 60 : Math.max(internalHeight || estimatedHeight, 60)

  const baseHtml = useMemo(() => {
    const isDark = theme.dark
    const base = isDark ? '#e6edf3' : '#24292e'
    const lcStyle = wrapLines ? 'white-space:pre-wrap;word-break:break-all' : 'white-space:pre'
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
td.lc{padding:0;${lcStyle};vertical-align:top;color:${base}}
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
<\/script>
</head>
<body>
<table><tbody id="tbl"></tbody></table>
<script>
window.renderCode(${JSON.stringify(lines).replace(/<\//g, '<\\/')});
<\/script>
</body>
</html>`
  }, [language, theme.dark, lines, wrapLines])

  useEffect(() => {
    const lineCount = code.split('\n').length
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
    prevLineCountRef.current = codeRef.current.split('\n').length
    webViewRef.current?.injectJavaScript(
      `window.renderCode(${JSON.stringify(codeRef.current.split('\n'))})`,
    )
  }, [])

  const handleCopy = useCallback(() => {
    Clipboard.setString(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [code])

  const handleHeight = useCallback((height: number) => {
    const h = Math.min(height + 16, 5000)
    setInternalHeight(h)
    onHeightChangeRef.current?.(h)
  }, [])

  return (
    <View style={[{ minHeight: containerMinHeight }, style]}>
      {showHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '600' }}>{language || 'code'}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity hitSlop={6} onPress={handleCopy} style={{ padding: 4 }}>
            <Text style={{ fontSize: 12, color: copied ? colors.primary : colors.textSecondary }}>
              {copied ? '✓ 已复制' : '📋 复制'}
            </Text>
          </TouchableOpacity>
          {onFullscreen && (
            <TouchableOpacity hitSlop={6} onPress={onFullscreen} style={{ padding: 4, marginLeft: 4 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>⛶ 全屏</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ html: baseHtml }}
        style={styles.webView}
        scrollEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={true}
        bounces={false}
        overScrollMode="never"
        onLoad={onLoad}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data)
            if (msg.type === 'codeHeight') {
              handleHeight(msg.height)
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
  webView: { flex: 1, backgroundColor: 'transparent' },
})
