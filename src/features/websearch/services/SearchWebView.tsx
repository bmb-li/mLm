import React, { useRef, useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native'
import { WebView } from 'react-native-webview'
import type { SearchResult } from '../types'
import { getGoogleSearchUrl, getGoogleExtractionScript } from '../providers/GoogleProvider'
import { getBingSearchUrl, getBingExtractionScript } from '../providers/BingProvider'
import { getBaiduSearchUrl, getBaiduExtractionScript } from '../providers/BaiduProvider'
import { getMetasoSearchUrl, getMetasoExtractionScript } from '../providers/MetasoProvider'
import type { SearchEngine } from '../types'

interface WebViewMessage {
  type: string
  results?: { title: string; url: string }[]
  error?: string
}

interface Props {
  query: string
  engine: SearchEngine
  onResults: (results: SearchResult[]) => void
  onError: (error: string) => void
  onReady: () => void
}

const SEARCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export default function SearchWebView({ query, engine, onResults, onError, onReady }: Props) {
  const webViewRef = useRef<any>(null)
  const [currentUrl, setCurrentUrl] = useState('')
  const [showCaptcha, setShowCaptcha] = useState(false)
  const captchaUrlRef = useRef('')

  const getUrl = useCallback(() => {
    switch (engine) {
      case 'google': return getGoogleSearchUrl(query)
      case 'bing': return getBingSearchUrl(query)
      case 'baidu': return getBaiduSearchUrl(query)
      case 'metaso': return getMetasoSearchUrl(query)
      default: return getGoogleSearchUrl(query)
    }
  }, [engine, query])

  const getScript = useCallback(() => {
    switch (engine) {
      case 'google': return getGoogleExtractionScript()
      case 'bing': return getBingExtractionScript()
      case 'baidu': return getBaiduExtractionScript()
      case 'metaso': return getMetasoExtractionScript()
      default: return getGoogleExtractionScript()
    }
  }, [engine])

  useEffect(() => {
    setCurrentUrl(getUrl())
    setShowCaptcha(false)
  }, [getUrl])

  const handleMessage = useCallback((event: any) => {
    try {
      const msg: WebViewMessage = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'search_results' && Array.isArray(msg.results)) {
        onResults(msg.results.map(r => ({ title: r.title, url: r.url, content: '' })))
      } else if (msg.type === 'captcha_required') {
        captchaUrlRef.current = currentUrl
        setShowCaptcha(true)
        onError('CAPTCHA verification required')
      } else if (msg.type === 'search_error') {
        onError(msg.error || 'Search failed')
      }
    } catch (e) {
      onError('Failed to parse search results')
    }
  }, [onResults, onError, currentUrl])

  const handleLoadEnd = useCallback(() => {
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(getScript())
    }, 1000)
  }, [getScript])

  return (
    <View style={styles.wrapper}>
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.hiddenWebView}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        userAgent={SEARCH_UA}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { description } = syntheticEvent.nativeEvent
          if (description) onError('WebView error: ' + description)
        }}
        originWhitelist={['*']}
      />
      <Modal visible={showCaptcha} transparent animationType="fade" onRequestClose={() => setShowCaptcha(false)}>
        <View style={styles.captchaOverlay}>
          <View style={styles.captchaModal}>
            <View style={styles.captchaHeader}>
              <Text style={styles.captchaTitle}>CAPTCHA Verification</Text>
              <TouchableOpacity onPress={() => setShowCaptcha(false)} style={styles.captchaClose}>
                <Text style={styles.captchaCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <WebView
              source={{ uri: captchaUrlRef.current || currentUrl }}
              style={{ flex: 1 }}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              userAgent={SEARCH_UA}
              onMessage={handleMessage}
              onLoadEnd={() => {
                setTimeout(() => {
                  webViewRef.current?.injectJavaScript(getScript())
                }, 1000)
              }}
              originWhitelist={['*']}
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { width: 1, height: 1, overflow: 'hidden', position: 'absolute', left: -9999, top: -9999 },
  hiddenWebView: { width: 800, height: 600 },
  captchaOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  captchaModal: { width: '90%', height: '80%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  captchaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  captchaTitle: { fontSize: 16, fontWeight: '600' },
  captchaClose: { padding: 8 },
  captchaCloseText: { fontSize: 16 },
})
