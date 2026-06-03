import React, { useRef, useCallback, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { WebView } from 'react-native-webview'
import { useTheme } from '../../../contexts/ThemeContext'
import { useI18n } from '../../../contexts/I18nContext'
import { getMetasoSearchUrl } from '../providers/MetasoProvider'

const SEARCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// 提取页面可见纯文本的脚本（不含 HTML/JS）
const EXTRACT_TEXT_SCRIPT = `
(function() {
  var text = document.body.innerText || '';
  text = text.replace(/\\s+/g, ' ').trim();
  if (text.length > 3000) text = text.slice(0, 3000) + '...';
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'page_text', text: text }));
})();
true;
`

interface Props {
  visible: boolean
  query: string
  onUseResults: (text: string) => void
  onClose: () => void
}

export default function SearchResultModal({ visible, query, onUseResults, onClose }: Props) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors
  const webViewRef = useRef<any>(null)
  const [pageText, setPageText] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'page_text' && msg.text) {
        setPageText(msg.text)
        setIsExtracting(false)
      }
    } catch {}
  }, [])

  const handleExtract = useCallback(() => {
    setIsExtracting(true)
    webViewRef.current?.injectJavaScript(EXTRACT_TEXT_SCRIPT)
  }, [])

  const handleUseResults = useCallback(() => {
    if (pageText) {
      onUseResults(pageText)
    }
  }, [pageText, onUseResults])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* 头部 */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t.common.cancel}</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {t.search.engineMetaso}
          </Text>
          <TouchableOpacity
            onPress={handleUseResults}
            disabled={!pageText}
            style={[styles.headerBtn, { opacity: pageText ? 1 : 0.4 }]}
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
              使用结果
            </Text>
          </TouchableOpacity>
        </View>

        {/* 搜索结果提示 */}
        {!isReady && (
          <View style={styles.loadingBar}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              正在搜索...
            </Text>
          </View>
        )}

        {/* WebView */}
        <WebView
          ref={webViewRef}
          source={{ uri: getMetasoSearchUrl(query) }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          userAgent={SEARCH_UA}
          onLoadEnd={() => {
            setIsReady(true)
            setTimeout(() => handleExtract(), 3000)
          }}
          onMessage={handleMessage}
        />

        {/* 底部操作栏 */}
        {isReady && (
          <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.extractBtn, { backgroundColor: colors.card }]}
              onPress={handleExtract}
              disabled={isExtracting}
            >
              <Text style={{ color: colors.text, fontSize: 14 }}>
                {isExtracting ? '提取中...' : '重新提取文本'}
              </Text>
            </TouchableOpacity>
            {pageText && (
              <Text style={[styles.textPreview, { color: colors.textSecondary }]} numberOfLines={2}>
                已提取 {pageText.length} 字符
              </Text>
            )}
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  headerBtn: { paddingHorizontal: 4, paddingVertical: 4, minWidth: 60 },
  loadingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 8,
  },
  loadingText: { fontSize: 13 },
  webView: { flex: 1 },
  footer: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, alignItems: 'center', gap: 4,
  },
  extractBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  textPreview: { fontSize: 12 },
})
