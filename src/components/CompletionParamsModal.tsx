import React, { useEffect } from 'react'
import { Alert } from 'react-native'
import { useI18n } from '../contexts/I18nContext'
import type { CompletionParams } from '../utils/storage'
import {
  saveCompletionParams,
  loadCompletionParams,
  resetCompletionParams,
  DEFAULT_COMPLETION_PARAMS,
} from '../utils/storage'
import { useParameterModal } from '../hooks/useParameterModal'
import {
  ParameterTextInput,
  ParameterSwitch,
  StopSequenceField,
} from './ParameterFormFields'
import BaseParameterModal from './BaseParameterModal'

interface CompletionParamsModalProps {
  visible: boolean
  onClose: () => void
  onSave: (params: CompletionParams) => void
}

export default function CompletionParamsModal({
  visible,
  onClose,
  onSave,
}: CompletionParamsModalProps) {
  const { t } = useI18n()
  const {
    params,
    isLoading,
    loadParamsAsync,
    handleSave,
    handleReset,
    updateParam,
  } = useParameterModal({
    loadParams: loadCompletionParams,
    saveParams: saveCompletionParams,
    resetParams: resetCompletionParams,
    defaultParams: DEFAULT_COMPLETION_PARAMS,
  })

  useEffect(() => {
    if (visible) loadParamsAsync()
  }, [loadParamsAsync, visible])

  const handleTextInput = (text: string, paramKey: keyof CompletionParams) => {
    if (text === '') {
      updateParam(paramKey, undefined)
    } else {
      const parsedInt = parseInt(text, 10)
      const parsedFloat = parseFloat(text)

      // For integer fields
      if (paramKey === 'n_predict' || paramKey === 'thinking_budget_tokens') {
        updateParam(paramKey, Number.isNaN(parsedInt) ? text : parsedInt)
      } else {
        // For float fields (temperature, top_p)
        updateParam(paramKey, Number.isNaN(parsedFloat) ? text : parsedFloat)
      }
    }
  }

  const validateIntegerParam = (
    value: any,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (value === undefined || value === null) return null
    const num = typeof value === 'string' ? parseInt(value, 10) : value
    if (Number.isNaN(num) || num < min || num > max) {
      return t.params.valBetween.replace('{field}', fieldName).replace('{min}', String(min)).replace('{max}', String(max))
    }
    return null
  }

  const validateNumberParam = (
    value: any,
    min: number,
    max: number,
    fieldName: string,
  ): string | null => {
    if (value === undefined || value === null) return null
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (Number.isNaN(num) || num < min || num > max) {
      return t.params.valBetween.replace('{field}', fieldName).replace('{min}', String(min)).replace('{max}', String(max))
    }
    return null
  }

  const validateParams = (): { isValid: boolean; errors: string[] } => {
    const validations = [
      validateIntegerParam(params.n_predict, -1, 4096, t.params.maxTokens),
      validateIntegerParam(params.thinking_budget_tokens, 0, 999999, t.params.thinkingBudget),
      validateNumberParam(params.temperature, 0.0, 2.0, t.params.temperature),
      validateNumberParam(params.top_p, 0.0, 1.0, t.params.topP),
    ]

    const errors = validations.filter(
      (error): error is string => error !== null,
    )
    return { isValid: errors.length === 0, errors }
  }

  const convertStringParamsToNumbers = (
    stringParams: CompletionParams,
  ): CompletionParams => {
    const converted = { ...stringParams }

    if (typeof converted.n_predict === 'string') {
      const num = parseInt(converted.n_predict, 10)
      converted.n_predict = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.thinking_budget_tokens === 'string') {
      const num = parseInt(converted.thinking_budget_tokens, 10)
      converted.thinking_budget_tokens = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.temperature === 'string') {
      const num = parseFloat(converted.temperature)
      converted.temperature = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.top_p === 'string') {
      const num = parseFloat(converted.top_p)
      converted.top_p = Number.isNaN(num) ? undefined : num
    }

    return converted
  }

  const addStopSequence = () => {
    const newStop = [...(params.stop || []), '']
    updateParam('stop', newStop)
  }

  const removeStopSequence = (index: number) => {
    const newStop = (params.stop || []).filter((_, i) => i !== index)
    updateParam('stop', newStop)
  }

  const updateStopSequence = (index: number, value: string) => {
    const newStop = [...(params.stop || [])]
    newStop[index] = value
    updateParam('stop', newStop)
  }

  const onSaveHandler = () => {
    const validation = validateParams()
    if (!validation.isValid) {
      Alert.alert(
        t.params.valError,
        validation.errors.join('\n'),
        [{ text: t.common.ok }],
      )
      return
    }

    const convertedParams = convertStringParamsToNumbers(params)
    handleSave((_params) => onSave(convertedParams), onClose)
  }

  return (
    <BaseParameterModal
      visible={visible}
      onClose={onClose}
      title={t.params.completionTitle}
      description={t.params.completionDesc}
      isLoading={isLoading}
      onSave={onSaveHandler}
      onReset={handleReset}
    >
      {/* Max Tokens */}
      <ParameterTextInput
        label={t.params.maxTokens}
        description={t.params.maxTokensDesc}
        value={params.n_predict?.toString()}
        onChangeText={(text) => handleTextInput(text, 'n_predict')}
        keyboardType="numeric"
        placeholder="512"
      />

      {/* Temperature */}
      <ParameterTextInput
        label={t.params.temperature}
        description={t.params.temperatureDesc}
        value={params.temperature?.toString()}
        onChangeText={(text) => handleTextInput(text, 'temperature')}
        keyboardType="decimal-pad"
        placeholder="0.7"
      />

      {/* Top-p */}
      <ParameterTextInput
        label={t.params.topP}
        description={t.params.topPDesc}
        value={params.top_p?.toString()}
        onChangeText={(text) => handleTextInput(text, 'top_p')}
        keyboardType="decimal-pad"
        placeholder="0.9"
      />

      {/* Enable Thinking */}
      <ParameterSwitch
        label={t.params.enableThinking}
        description={t.params.enableThinkingDesc}
        value={params.enable_thinking || false}
        onValueChange={(value) => updateParam('enable_thinking', value)}
      />

      <ParameterTextInput
        label={t.params.thinkingBudget}
        description={t.params.thinkingBudgetDesc}
        value={params.thinking_budget_tokens?.toString()}
        onChangeText={(text) => handleTextInput(text, 'thinking_budget_tokens')}
        keyboardType="numeric"
        placeholder="1024"
      />

      <ParameterTextInput
        label={t.params.thinkingMsg}
        description={t.params.thinkingMsgDesc}
        value={params.thinking_budget_message}
        onChangeText={(text) => updateParam('thinking_budget_message', text)}
        keyboardType="default"
        placeholder="Reasoning budget reached."
      />

      {/* Stop Sequences */}
      <StopSequenceField
        stopSequences={params.stop || []}
        onUpdateStopSequence={updateStopSequence}
        onRemoveStopSequence={removeStopSequence}
        onAddStopSequence={addStopSequence}
      />
    </BaseParameterModal>
  )
}
