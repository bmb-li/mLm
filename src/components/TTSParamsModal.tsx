import React, { useEffect } from 'react'
import type { TTSParams } from '../utils/storage'
import {
  saveTTSParams,
  loadTTSParams,
  resetTTSParams,
  DEFAULT_TTS_PARAMS,
} from '../utils/storage'
import { useParameterModal } from '../hooks/useParameterModal'
import BaseParameterModal from './BaseParameterModal'
import { TTSVoiceSection } from './TTSVoiceSection'
import { useI18n } from '../contexts/I18nContext'
import type { TTSCapabilities } from '../../modules/llama.rn/src'

interface TTSParamsModalProps {
  visible: boolean
  onClose: () => void
  onSave: (params: TTSParams) => void
  /** The loaded model's capabilities; null until a model + codec is ready. */
  caps?: TTSCapabilities | null
}

export default function TTSParamsModal({
  visible,
  onClose,
  onSave,
  caps = null,
}: TTSParamsModalProps) {
  const { t } = useI18n()

  const {
    params,
    isLoading,
    loadParamsAsync,
    handleSave,
    handleReset,
    updateParam,
  } = useParameterModal({
    loadParams: loadTTSParams,
    saveParams: saveTTSParams,
    resetParams: resetTTSParams,
    defaultParams: DEFAULT_TTS_PARAMS,
  })

  useEffect(() => {
    if (visible) {
      loadParamsAsync()
    }
  }, [loadParamsAsync, visible])

  const onSaveHandler = () => {
    handleSave(onSave, onClose)
  }

  return (
    <BaseParameterModal
      visible={visible}
      onClose={onClose}
      title={t.params.ttsTitle}
      description={t.params.ttsDesc}
      isLoading={isLoading}
      onSave={onSaveHandler}
      onReset={handleReset}
    >
      <TTSVoiceSection caps={caps} params={params} updateParam={updateParam} />
    </BaseParameterModal>
  )
}
