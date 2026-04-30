import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Clipboard, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'

export default function APISetupScreen() {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t.server.apiSetupGuide}
        </Text>

        <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.stepNumber, { color: colors.primary }]}>1</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            {t.server.startServer}
          </Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Go to the Server tab and toggle the server on. The server will listen on port 8889.
          </Text>
        </View>

        <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.stepNumber, { color: colors.primary }]}>2</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Download a Model
          </Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Go to the Models tab and download a GGUF model to use for inference.
          </Text>
        </View>

        <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.stepNumber, { color: colors.primary }]}>3</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Configure Your Client
          </Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Use the following settings in any OpenAI-compatible client (e.g., Open WebUI, Continue.dev, custom scripts):
          </Text>
          <TouchableOpacity onPress={() => copyToClipboard('http://<device-ip>:8889/v1')}>
            <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.code, { color: colors.text }]}>
                Base URL: http://{'<device-ip>'}:8889/v1
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.stepNumber, { color: colors.primary }]}>4</Text>
          <Text style={[styles.stepTitle, { color: colors.text }]}>
            Send a Request
          </Text>
          <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
            Example curl command:
          </Text>
          <TouchableOpacity
            onPress={() => copyToClipboard(
              [
                'curl http://<device-ip>:8889/v1/chat/completions \\',
                '  -H "Content-Type: application/json" \\',
                '  -d \'{"model":"your-model","messages":[',
                '    {"role":"user","content":"Hello"}],',
                '    "stream":true}\'',
              ].join('\n')
            )}
          >
            <View style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.code, { color: colors.textSecondary }]} selectable>
                {[
                  'curl http://<device-ip>:8889/v1/chat/completions \\',
                  '  -H "Content-Type: application/json" \\',
                  '  -d \'{"model":"your-model","messages":[',
                  '    {"role":"user","content":"Hello"}],',
                  '    "stream":true}\'',
                ].join('\n')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  stepCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  stepNumber: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  stepDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  codeBlock: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  code: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
})
