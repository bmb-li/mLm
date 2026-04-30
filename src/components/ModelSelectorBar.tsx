import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'

type ModelSelectorBarProps = {
  activeModelName?: string | null
  onPress?: () => void
}

export default function ModelSelectorBar({
  activeModelName,
  onPress,
}: ModelSelectorBarProps) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const colors = theme.colors

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t.chat.activeModel}
        </Text>
        <Text
          style={[styles.modelName, { color: colors.primary }]}
          numberOfLines={1}
        >
          {activeModelName || t.chat.noModelSelected}
        </Text>
      </View>
      {onPress && (
        <Text style={[styles.chevron, { color: colors.textSecondary }]}>
          ›
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 22,
    marginLeft: 8,
  },
})
