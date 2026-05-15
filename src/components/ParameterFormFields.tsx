import React from 'react'
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { createThemedStyles } from '../styles/commonStyles'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'

interface ParameterTextInputProps {
  label: string
  description: string
  value?: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'ascii-capable'
}

export function ParameterTextInput({
  label,
  description,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'ascii-capable',
}: ParameterTextInputProps) {
  const { theme } = useTheme()
  const themedStyles = createThemedStyles(theme.colors)

  return (
    <View style={themedStyles.paramGroup}>
      <Text style={themedStyles.paramLabel}>{label}</Text>
      <Text style={themedStyles.paramDescription}>{description}</Text>
      <TextInput
        style={themedStyles.textInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
      />
    </View>
  )
}

interface ParameterSwitchProps {
  label: string
  description: string
  value: boolean
  onValueChange: (value: boolean) => void
}

export function ParameterSwitch({
  label,
  description,
  value,
  onValueChange,
}: ParameterSwitchProps) {
  const { theme } = useTheme()
  const themedStyles = createThemedStyles(theme.colors)

  const styles = StyleSheet.create({
    switchRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    switchInfo: {
      flex: 1,
      marginRight: 12,
    },
  })

  return (
    <View style={themedStyles.paramGroup}>
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={themedStyles.paramLabel}>{label}</Text>
          <Text style={themedStyles.paramDescription}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
          thumbColor={theme.colors.white}
        />
      </View>
    </View>
  )
}

interface StopSequenceFieldProps {
  stopSequences: string[]
  onUpdateStopSequence: (index: number, value: string) => void
  onRemoveStopSequence: (index: number) => void
  onAddStopSequence: () => void
}

export function StopSequenceField({
  stopSequences,
  onUpdateStopSequence,
  onRemoveStopSequence,
  onAddStopSequence,
}: StopSequenceFieldProps) {
  const { theme } = useTheme()
  const { t } = useI18n()
  const themedStyles = createThemedStyles(theme.colors)

  const styles = StyleSheet.create({
    stopSequenceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    stopSequenceInput: {
      flex: 1,
      marginRight: 8,
    },
    removeButton: {
      backgroundColor: theme.colors.error,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 6,
    },
    removeButtonText: {
      color: theme.colors.white,
      fontSize: 12,
      fontWeight: '500',
    },
    addButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: 10,
      borderRadius: 8,
      marginTop: 8,
    },
    addButtonText: {
      color: theme.colors.white,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
    },
  })

  return (
    <View style={themedStyles.paramGroup}>
      <Text style={themedStyles.paramLabel}>{t.params.stopSeq}</Text>
      <Text style={themedStyles.paramDescription}>
        {t.params.stopSeqDesc}
      </Text>

      {stopSequences.map((stopSeq, index) => (
        <View key={index} style={styles.stopSequenceContainer}>
          <TextInput
            style={[themedStyles.textInput, styles.stopSequenceInput]}
            value={stopSeq}
            onChangeText={(text) => onUpdateStopSequence(index, text)}
            placeholder={t.params.stopSeqPlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            autoCorrect={false}
            autoComplete="off"
            autoCapitalize="none"
            keyboardType="ascii-capable"
          />
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => onRemoveStopSequence(index)}
          >
            <Text style={styles.removeButtonText}>{t.params.stopSeqRemove}</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.addButton} onPress={onAddStopSequence}>
        <Text style={styles.addButtonText}>{t.params.stopSeqAdd}</Text>
      </TouchableOpacity>
    </View>
  )
}
