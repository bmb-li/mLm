import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, Image, StyleSheet, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import type { Language } from '../i18n/types'
import AppHeader from '../components/AppHeader'
import SettingsSection from '../components/SettingsSection'
import { BuildInfo, getBackendDevicesInfo } from '../../modules/llama.rn/src'
import { loadSearchEngine, saveSearchEngine, loadTavilyApiKey, saveTavilyApiKey } from '../features/websearch/utils/searchStorage'
import { getSearchEngineIcon } from '../features/websearch/services/SearchOrchestrator'
import type { SearchEngine } from '../features/websearch/types'

export default function SettingsScreen({ navigation }: { navigation: any }) {
  const { theme, themeMode, setThemeMode } = useTheme()
  const { t, language, setLanguage } = useI18n()
  const colors = theme.colors

  const themeOptions: { label: string; value: 'system' | 'light' | 'dark' }[] = [
    { label: t.settings.systemTheme, value: 'system' },
    { label: t.settings.lightTheme, value: 'light' },
    { label: t.settings.darkTheme, value: 'dark' },
  ]

  const languageOptions: { label: string; value: Language }[] = [
    { label: 'English', value: 'en' },
    { label: '中文', value: 'zh' },
  ]

  const [searchEngine, setSearchEngine] = useState<SearchEngine>('google')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [showTavilyInput, setShowTavilyInput] = useState(false)
  const [tavilyApiKey, setTavilyApiKey] = useState('')

  useEffect(() => {
    loadSearchEngine().then(setSearchEngine)
    loadTavilyApiKey().then(setTavilyApiKey)
  }, [])

  const handleTavilyKeyChange = (text: string) => {
    setTavilyApiKey(text)
    saveTavilyApiKey(text)
  }

  const getEngineLabel = (engine: SearchEngine): string => {
    switch (engine) {
      case 'google': return t.search.engineGoogle
      case 'bing': return t.search.engineBing
      case 'baidu': return t.search.engineBaidu
      case 'tavily': return t.search.engineTavily
      case 'metaso': return t.search.engineMetaso
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['left', 'right']}>
      <AppHeader title={t.settings.title} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsSection title={t.settings.appearance}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>🎨</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.settings.theme}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.optionRow}>
            {themeOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: themeMode === opt.value ? colors.primary : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setThemeMode(opt.value)}
              >
                <Text style={{
                  color: themeMode === opt.value ? '#FFF' : colors.text,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.separator, { backgroundColor: colors.background }]} />
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>🌐</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.settings.language}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.optionRow}>
            {languageOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionChip,
                  {
                    backgroundColor: language === opt.value ? colors.primary : colors.card,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setLanguage(opt.value)}
              >
                <Text style={{
                  color: language === opt.value ? '#FFF' : colors.text,
                  fontSize: 13,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SettingsSection>

        <SettingsSection title={t.settings.examples}>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate('ExamplesGallery')}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>🧪</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.settings.examples}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  {t.examples.title}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        </SettingsSection>

        <SettingsSection title={t.search.webSearch}>
          <TouchableOpacity onPress={() => setSearchExpanded(!searchExpanded)} style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Image
                  source={getSearchEngineIcon(searchEngine, theme.dark)}
                  style={{ width: 22, height: 22 }}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {searchExpanded ? t.search.searchEngine : `${getSearchEngineIcon(searchEngine)} ${getEngineLabel(searchEngine)}`}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  {searchExpanded ? ' ' : t.search.searchEngineDesc}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 18, transform: [{ rotate: searchExpanded ? '90deg' : '0deg' }] }}>›</Text>
          </TouchableOpacity>

          {searchExpanded && (
            <View style={{ paddingBottom: 8 }}>
              {([
                { id: 'google' as const, label: t.search.engineGoogle },
                { id: 'bing' as const, label: t.search.engineBing },
                { id: 'baidu' as const, label: t.search.engineBaidu },
                { id: 'tavily' as const, label: t.search.engineTavily },
              { id: 'metaso' as const, label: t.search.engineMetaso },
              ]).map(eng => (
                <View key={eng.id}>
                  <TouchableOpacity style={[styles.optionRow, { alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => {
                    setSearchEngine(eng.id)
                    saveSearchEngine(eng.id)
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={[styles.radio, searchEngine === eng.id && { backgroundColor: colors.primary, borderColor: colors.primary }]} />
                      <Image source={getSearchEngineIcon(eng.id, theme.dark)} style={{ width: 24, height: 24, marginLeft: 8 }} resizeMode="contain" />
                      <Text style={[styles.optionText, { color: colors.text, marginLeft: 6 }]}>{eng.label}</Text>
                    </View>
                    {eng.id === 'tavily' && (
                      <TouchableOpacity onPress={() => setShowTavilyInput(!showTavilyInput)} style={{ paddingHorizontal: 8 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 16 }}>⋯</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                  {eng.id === 'tavily' && showTavilyInput && (
                    <View style={{ paddingHorizontal: 32, paddingBottom: 12 }}>
                      <TextInput
                        value={tavilyApiKey}
                        onChangeText={handleTavilyKeyChange}
                        placeholder={t.search.tavilyApiKey}
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry
                        style={{
                          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 8, color: colors.text,
                          fontSize: 14, backgroundColor: colors.inputBackground,
                        }}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </SettingsSection>

        <SettingsSection title={t.settings.about}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>ℹ️</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.settings.version}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  mLm 0.3.1 (llama.rn b{BuildInfo.number})
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.background }]} />
          <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://github.com/bmb-li/mLm')}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 22 }}>📂</Text>
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={[styles.settingText, { color: colors.text }]}>
                  {t.settings.githubRepo}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 32 },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingTextContainer: { flex: 1 },
  settingText: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  settingDescription: { fontSize: 14, lineHeight: 20 },
  separator: { height: 1, marginHorizontal: 16 },
  optionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  optionList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  optionText: {
    fontSize: 15,
    paddingVertical: 6,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ccc',
    marginLeft: 8,
  },
})
