import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

type SettingsSectionProps = {
  title: string
  children: React.ReactNode
}

export default function SettingsSection({ title, children }: SettingsSectionProps) {
  const { theme } = useTheme()
  const colors = theme.colors

  return (
    <View style={styles.section}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {title}
        </Text>
      </View>
      <View style={[styles.content, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
    marginHorizontal: 16,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  content: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
})
