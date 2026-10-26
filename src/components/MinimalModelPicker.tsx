import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Icon from '@react-native-vector-icons/material-design-icons'
import { MaskedProgress } from './MaskedProgress'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { createThemedStyles } from '../styles/commonStyles'
import type { CustomModel } from '../utils/storage'

interface MinimalModelPickerProps {
  /** Intro text shown above the list. */
  description: string
  /** Already-imported models to offer (typically filtered to one folder). */
  models: CustomModel[]
  /** Called with the model and its filesystem path (no file:// prefix). */
  onLoad: (model: CustomModel, path: string) => void
  /** Optional extra controls rendered between description and the list. */
  children?: React.ReactNode
  /** Section title, defaults to "已导入的模型". */
  title?: string
  /** Shown when the list is empty. */
  emptyHint?: string
  /** Which category to point at in the Models tab hint. */
  modelCategoryHint?: string
  isLoading?: boolean
  initProgress?: number
  progressText?: string
}

/**
 * Minimal model picker: lists models that were already imported in the Models
 * tab and offers a single "加载" action per row. Downloading / deleting /
 * adding custom models all happen in the Models tab, so they are not repeated
 * here.
 */
export function MinimalModelPicker({
  description,
  models,
  onLoad,
  children,
  title,
  emptyHint,
  modelCategoryHint = '模型页',
  isLoading = false,
  initProgress = 0,
  progressText = '',
}: MinimalModelPickerProps) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const themedStyles = createThemedStyles(theme.colors)
  const navigation = useNavigation<any>()
  const styles = createStyles(theme)

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.description}>{description}</Text>

        {children}

        <Text style={styles.sectionTitle}>
          {`${title ?? '已导入的模型'} (${models.length})`}
        </Text>

        {models.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyStateText}>
              {emptyHint ??
                `还没有导入模型。请到「${modelCategoryHint}」分类下载或导入 GGUF，然后回到本页。`}
            </Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() =>
                navigation.navigate('MainTabs', { screen: 'ModelTab' })
              }
            >
              <Text style={styles.emptyActionText}>前往模型页 →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          models.map(model => (
            <View key={model.id} style={styles.row}>
              <Icon
                name="bullseye-arrow"
                size={18}
                color={theme.colors.primary}
              />
              <Text style={styles.modelName} numberOfLines={1}>
                {model.id}
              </Text>
              <TouchableOpacity
                style={styles.loadButton}
                onPress={() =>
                  onLoad(
                    model,
                    (model.localPath || '').replace(/^file:\/\//, ''),
                  )
                }
                disabled={isLoading}
              >
                <Text style={styles.loadButtonText}>加载</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <MaskedProgress
        visible={isLoading}
        text={
          progressText ||
          t.examples.initializing.replace('{progress}', String(initProgress))
        }
        progress={initProgress}
        showProgressBar={initProgress > 0}
      />
    </>
  )
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 32 },
    description: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textSecondary,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
      marginTop: 4,
    },
    emptyCard: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    emptyStateText: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textSecondary,
    },
    emptyAction: {
      marginTop: 10,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
    },
    emptyActionText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    modelName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    loadButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: theme.colors.primary,
    },
    loadButtonText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  })

export default MinimalModelPicker
