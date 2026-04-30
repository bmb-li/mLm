import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'

type AppHeaderProps = {
  title?: string
  showBackButton?: boolean
  onBackPress?: () => void
  rightButtons?: React.ReactNode
  leftComponent?: React.ReactNode
  transparent?: boolean
}

export default function AppHeader({
  title = 'mLm',
  showBackButton = false,
  onBackPress,
  rightButtons,
  leftComponent,
  transparent = false,
}: AppHeaderProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const colors = theme.colors

  const bgColor = transparent ? 'transparent' : colors.headerBackground
  const textColor = transparent ? colors.text : colors.headerText

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          paddingTop: insets.top,
          borderBottomWidth: transparent ? 0 : 0,
        },
      ]}
    >
      <View style={[styles.inner, { height: 52 }]}>
        {leftComponent ? (
          <View style={styles.leftSection}>{leftComponent}</View>
        ) : (
          <View style={styles.leftSection}>
            {showBackButton && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={onBackPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.backIcon, { color: textColor }]}>
                  ←
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.logo]}>
              🦙
            </Text>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
        )}

        {rightButtons && (
          <View style={styles.rightSection}>
            {rightButtons}
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  backIcon: {
    fontSize: 22,
    fontWeight: '600',
  },
  logo: {
    fontSize: 22,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
})
