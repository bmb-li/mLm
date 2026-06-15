import React, { useRef, useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import Clipboard from '@react-native-clipboard/clipboard'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { injectBridge, commonWebViewProps } from '../services/appgen/bridge'
import CodePreview from './CodePreview'

interface AppPreviewProps {
  html: string
  fill?: boolean
  defaultTab?: 'preview' | 'code'
  onFullscreen?: () => void
  onAIMessage?: (msg: any, postMessage: (data: any) => void) => Promise<any>
}

export default function AppPreview({ html, fill, defaultTab, onFullscreen, onAIMessage }: AppPreviewProps) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const [showPreview, setShowPreview] = useState(defaultTab !== 'code')
  const [webViewHeight, setWebViewHeight] = useState(200)
  const [codeHeight, setCodeHeight] = useState(800)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const webViewRef = useRef<WebView>(null)

  const postToWebView = useCallback((data: any) => {
    webViewRef.current?.postMessage(JSON.stringify(data))
  }, [])

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'rendered') {
        if (msg.success) {
          setRenderError(null)
        } else {
          setRenderError(msg.error || 'Render failed')
        }
        return
      }
      if (msg.type === 'previewHeight' && msg.height > 0 && !fill) {
        setWebViewHeight(Math.min(msg.height + 20, 4000))
        return
      }
      if (onAIMessage && (msg.type === 'aiChat' || msg.type === 'repairJSON')) {
        try {
          const result = await onAIMessage(msg, postToWebView)
          if (msg.type === 'repairJSON') {
            postToWebView({ id: msg.requestId, type: 'repairResult', result })
          }
        } catch (e: any) {
          postToWebView({ id: msg.requestId, type: 'error', error: e.message })
        }
      }
    } catch {}
  }, [onAIMessage, postToWebView, fill])

  const injectedHtml = injectBridge(html)

  return (
    <View style={[styles.container, fill && { flex: 1, alignSelf: 'stretch', marginVertical: 0 }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Tab bar */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, showPreview && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}
          onPress={() => setShowPreview(true)}
        >
          <Text style={[styles.tabText, { color: showPreview ? colors.primary : colors.textSecondary }]}>
            {(t as any).appgen?.preview || 'Preview'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, !showPreview && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}
          onPress={() => setShowPreview(false)}
        >
          <Text style={[styles.tabText, { color: !showPreview ? colors.primary : colors.textSecondary }]}>
            {(t as any).appgen?.code || 'Code'}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {showPreview ? (
          onFullscreen && (
            <TouchableOpacity style={styles.fullBtn} onPress={onFullscreen}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                {(t as any).appgen?.fullscreen || 'Full Screen'}
              </Text>
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity style={styles.fullBtn} onPress={() => {
            Clipboard.setString(html)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}>
            <Text style={{ color: copied ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: copied ? '700' : '400' }}>
              {copied ? '✓ 已复制' : (t as any).appgen?.copyCode || '复制代码'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {showPreview ? (
        <View style={[styles.webViewWrap, fill && { flex: 1, overflow: 'hidden' }]}>
          <WebView
            ref={webViewRef}
            {...commonWebViewProps}
            source={{ html: injectedHtml }}
            style={[styles.webView, fill ? { flex: 1 } : { height: webViewHeight }, { backgroundColor: '#FFF' }]}
            onMessage={handleMessage}
            scrollEnabled={!!fill}
            onLoadEnd={() => {
              if (!fill) {
                webViewRef.current?.injectJavaScript(`
                  setTimeout(function() {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'previewHeight',
                      height: document.body.scrollHeight
                    }))
                  }, 200)
                `)
              }
            }}
            originWhitelist={['*']}
          />
          {renderError && (
            <Text style={[styles.errorText, { color: colors.error }]}>⚠️ {renderError}</Text>
          )}
        </View>
      ) : (
        <View style={styles.codeWrap}>
          <CodePreview code={html} onHeightChange={setCodeHeight} style={fill ? { flex: 1 } : { height: codeHeight }} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, marginVertical: 8 },
  tabRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 12, marginRight: 4 },
  tabText: { fontSize: 13, fontWeight: '600' },
  fullBtn: { marginLeft: 'auto', paddingVertical: 6, paddingHorizontal: 8 },
  webViewWrap: { minHeight: 200 },
  webView: { width: '100%' },
  codeWrap: { padding: 12, flex: 1 },
  codeText: { fontSize: 12, fontFamily: 'monospace', lineHeight: 16 },
  errorText: { fontSize: 12, textAlign: 'center', padding: 8 },
})
