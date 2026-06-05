import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ActivityIndicator,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native'
import type { ContextParams } from '../utils/storage'
import {
  saveContextParams,
  loadContextParams,
  resetContextParams,
  DEFAULT_CONTEXT_PARAMS,
} from '../utils/storage'
import { useParameterModal } from '../hooks/useParameterModal'
import { ParameterTextInput, ParameterSwitch } from './ParameterFormFields'
import { ParameterMenu } from './ParameterMenu'
import BaseParameterModal from './BaseParameterModal'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import { createThemedStyles } from '../styles/commonStyles'
import { getBackendDevicesInfo } from '../../modules/llama.rn/src'
import type { NativeBackendDeviceInfo } from '../../modules/llama.rn/src'

interface ContextParamsModalProps {
  visible: boolean
  onClose: () => void
  onSave: (params: ContextParams) => void
}

const CACHE_TYPE_OPTIONS = [
  'f16',
  'f32',
  'q8_0',
  'q4_0',
  'q4_1',
  'iq4_nl',
  'q5_0',
  'q5_1',
]

export default function ContextParamsModal({
  visible,
  onClose,
  onSave,
}: ContextParamsModalProps) {
  const { t } = useI18n()
  const { theme } = useTheme()
  const themedStyles = createThemedStyles(theme.colors)
  const deviceStyles = useMemo(
    () =>
      StyleSheet.create({
        devicesSection: {
          marginTop: 6,
        },
        deviceItem: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
          marginBottom: 6,
          backgroundColor: theme.colors.inputBackground,
        },
        deviceItemSelected: {
          borderColor: theme.colors.primary,
          backgroundColor: theme.dark
            ? 'rgba(17, 122, 255, 0.18)'
            : 'rgba(17, 122, 255, 0.08)',
        },
        deviceHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        deviceRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        deviceName: {
          flex: 1,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.text,
          marginRight: 6,
        },
        deviceMeta: {
          fontSize: 11,
          color: theme.colors.textSecondary,
        },
        deviceMetaRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 4,
          flexWrap: 'wrap',
          gap: 8,
        },
        deviceBadge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 10,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        deviceBadgeText: {
          color: theme.colors.text,
          fontSize: 10,
          fontWeight: '600',
        },
        selectionIndicator: {
          width: 16,
          height: 16,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: theme.colors.border,
        },
        selectionIndicatorSelected: {
          borderColor: theme.colors.primary,
          backgroundColor: theme.colors.primary,
        },
        helperText: {
          fontSize: 11,
          color: theme.colors.textSecondary,
          marginTop: 2,
        },
        loadingRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 6,
        },
        loadingText: {
          marginLeft: 8,
          color: theme.colors.textSecondary,
          fontSize: 13,
        },
        errorText: {
          marginTop: 6,
          color: theme.colors.error,
          fontSize: 12,
        },
        emptyText: {
          marginTop: 6,
          color: theme.colors.textSecondary,
          fontSize: 12,
        },
      }),
    [theme],
  )
  const {
    params,
    isLoading,
    loadParamsAsync,
    handleSave,
    handleReset,
    updateParam,
  } = useParameterModal({
    loadParams: loadContextParams,
    saveParams: saveContextParams,
    resetParams: resetContextParams,
    defaultParams: DEFAULT_CONTEXT_PARAMS,
  })
  const [availableDevices, setAvailableDevices] = useState<
    NativeBackendDeviceInfo[]
  >([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)
  const [devicesError, setDevicesError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) loadParamsAsync()
  }, [loadParamsAsync, visible])

  useEffect(() => {
    let isMounted = true
    const fetchDevices = async () => {
      if (!visible || availableDevices.length > 0) return

      try {
        setIsLoadingDevices(true)
        const devices = await getBackendDevicesInfo()
        if (isMounted) {
          setAvailableDevices(devices)
          setDevicesError(null)
        }
      } catch (error: any) {
        console.error('Error loading backend devices:', error)
        if (isMounted) {
          setDevicesError(error?.message ?? 'Failed to load devices')
        }
      } finally {
        if (isMounted) {
          setIsLoadingDevices(false)
        }
      }
    }

    fetchDevices()
    return () => {
      isMounted = false
    }
  }, [availableDevices.length, visible])

  const handleTextInput = (text: string, paramKey: keyof ContextParams) => {
    if (text === '') {
      updateParam(paramKey, undefined)
    } else {
      const parsedValue = parseInt(text, 10)
      updateParam(paramKey, Number.isNaN(parsedValue) ? text : parsedValue)
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

  const validateParams = (): { isValid: boolean; errors: string[] } => {
    const validations = [
      validateIntegerParam(params.n_ctx, 128, 999999, t.params.contextSize),
      validateIntegerParam(params.n_gpu_layers, 0, 99, t.params.gpuLayers),
      validateIntegerParam(params.n_batch, 1, 99999, t.params.batchSize),
      validateIntegerParam(params.n_ubatch, 1, 99999, t.params.uBatch),
      validateIntegerParam(params.n_parallel, 1, 16, t.params.parallel),
      validateIntegerParam(params.image_max_tokens, 1, 99999, 'Max Image Tokens'),
      validateIntegerParam(params.n_threads, 1, 32, t.params.threads),
      validateIntegerParam(params.n_cpu_moe, 0, 99, t.params.cpuMoe),
    ]

    const errors = validations.filter(
      (error): error is string => error !== null,
    )
    return { isValid: errors.length === 0, errors }
  }

  const convertStringParamsToNumbers = (
    stringParams: ContextParams,
  ): ContextParams => {
    const converted = { ...stringParams }

    if (typeof converted.n_ctx === 'string') {
      const num = parseInt(converted.n_ctx, 10)
      converted.n_ctx = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.n_gpu_layers === 'string') {
      const num = parseInt(converted.n_gpu_layers, 10)
      converted.n_gpu_layers = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.n_batch === 'string') {
      const num = parseInt(converted.n_batch, 10)
      converted.n_batch = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.n_ubatch === 'string') {
      const num = parseInt(converted.n_ubatch, 10)
      converted.n_ubatch = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.n_parallel === 'string') {
      const num = parseInt(converted.n_parallel, 10)
      converted.n_parallel = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.image_max_tokens === 'string') {
      const num = parseInt(converted.image_max_tokens, 10)
      converted.image_max_tokens = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.n_threads === 'string') {
      const num = parseInt(converted.n_threads, 10)
      converted.n_threads = Number.isNaN(num) ? undefined : num
    }

    if (typeof converted.n_cpu_moe === 'string') {
      const num = parseInt(converted.n_cpu_moe, 10)
      converted.n_cpu_moe = Number.isNaN(num) ? undefined : num
    }

    return converted
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

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return 'Unknown memory'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const i = Math.min(
      Math.floor(Math.log(bytes) / Math.log(k)),
      sizes.length - 1,
    )
    const formatted = bytes / Math.pow(k, i)
    return `${formatted.toFixed(formatted >= 100 || i === 0 ? 0 : 1)} ${
      sizes[i]
    }`
  }

  const isAllDevicesSelected = !params.devices || params.devices.length === 0

  const toggleDeviceSelection = (deviceName: string) => {
    const existing = params.devices ?? []
    const isSelected = existing.includes(deviceName)
    if (isSelected) {
      const filtered = existing.filter((dev) => dev !== deviceName)
      updateParam('devices', filtered.length > 0 ? filtered : undefined)
    } else {
      updateParam('devices', [...existing, deviceName])
    }
  }

  return (
    <BaseParameterModal
      visible={visible}
      onClose={onClose}
      title={t.params.contextTitle}
      description={t.params.contextDesc}
      isLoading={isLoading}
      onSave={onSaveHandler}
      onReset={handleReset}
      showWarning
      warningText={t.params.contextWarning}
    >
      {/* 并行序列数 */}
      <ParameterTextInput
        label={t.params.parallel}
        description={t.params.parallelDesc}
        value={params.n_parallel?.toString() || '1'}
        onChangeText={(text) => handleTextInput(text, 'n_parallel')}
        keyboardType="numeric"
        placeholder="1"
      />

      {/* Max Image Tokens */}
      <ParameterTextInput
        label={t.params.imageMaxTokens}
        description={t.params.imageMaxTokensDesc}
        value={params.image_max_tokens?.toString() || ''}
        onChangeText={(text) => {
          if (text === '') {
            updateParam('image_max_tokens', undefined)
          } else {
            const num = parseInt(text, 10)
            updateParam('image_max_tokens', Number.isNaN(num) ? text : num)
          }
        }}
        keyboardType="numeric"
        placeholder="e.g. 512"
      />

      {/* Context Size */}
      <ParameterTextInput
        label={t.params.contextSize}
        description={t.params.contextSizeDesc}
        value={params.n_ctx?.toString()}
        onChangeText={(text) => {
          // Allow any text input, validation happens on save
          if (text === '') {
            updateParam('n_ctx', undefined)
          } else {
            const parsedValue = parseInt(text, 10)
            updateParam('n_ctx', Number.isNaN(parsedValue) ? text : parsedValue)
          }
        }}
        keyboardType="numeric"
        placeholder="8192"
      />

      {/* GPU Layers */}
      <ParameterTextInput
        label={t.params.gpuLayers}
        description={t.params.gpuLayersDesc}
        value={params.n_gpu_layers?.toString()}
        onChangeText={(text) => {
          if (text === '') {
            updateParam('n_gpu_layers', undefined)
          } else {
            const parsedValue = parseInt(text, 10)
            updateParam(
              'n_gpu_layers',
              Number.isNaN(parsedValue) ? text : parsedValue,
            )
          }
        }}
        keyboardType="numeric"
        placeholder="99"
      />

      <View style={themedStyles.paramGroup}>
        <Text style={themedStyles.paramLabel}>{t.params.devices}</Text>
        <Text style={themedStyles.paramDescription}>
          {t.params.devicesDesc}
        </Text>

        <View style={deviceStyles.devicesSection}>
          <TouchableOpacity
            style={[
              deviceStyles.deviceItem,
              isAllDevicesSelected && deviceStyles.deviceItemSelected,
            ]}
            onPress={() => updateParam('devices', undefined)}
          >
            <View style={deviceStyles.deviceHeader}>
              <View>
                <Text style={deviceStyles.deviceName}>
                  {t.params.devicesAll}
                </Text>
                <Text style={deviceStyles.deviceMeta}>
                  {t.params.devicesDefault}
                </Text>
              </View>
              <View
                style={[
                  deviceStyles.selectionIndicator,
                  isAllDevicesSelected &&
                    deviceStyles.selectionIndicatorSelected,
                ]}
              />
            </View>
          </TouchableOpacity>

          {isLoadingDevices && (
            <View style={deviceStyles.loadingRow}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
              <Text style={deviceStyles.loadingText}>{t.params.devicesLoading}</Text>
            </View>
          )}

          {devicesError && !isLoadingDevices && (
            <Text style={deviceStyles.errorText}>{devicesError}</Text>
          )}

          {!isLoadingDevices &&
            availableDevices.length === 0 &&
            !devicesError && (
              <Text style={deviceStyles.emptyText}>
                {t.params.devicesNone}
              </Text>
            )}

          {availableDevices.map((device) => {
            const isSelected =
              !isAllDevicesSelected &&
              (params.devices?.includes(device.deviceName) ?? false)
            return (
              <TouchableOpacity
                key={device.deviceName}
                style={[
                  deviceStyles.deviceItem,
                  isSelected && deviceStyles.deviceItemSelected,
                ]}
                onPress={() => toggleDeviceSelection(device.deviceName)}
              >
                <View style={deviceStyles.deviceHeader}>
                  <Text style={deviceStyles.deviceName}>
                    {device.deviceName}
                  </Text>
                  <View style={deviceStyles.deviceRight}>
                    <View style={deviceStyles.deviceBadge}>
                      <Text style={deviceStyles.deviceBadgeText}>
                        {device.type.toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={[
                        deviceStyles.selectionIndicator,
                        isSelected && deviceStyles.selectionIndicatorSelected,
                      ]}
                    />
                  </View>
                </View>
                <View style={deviceStyles.deviceMetaRow}>
                  <Text style={deviceStyles.deviceMeta}>
                    {`Backend: ${device.backend}`}
                  </Text>
                  <Text style={deviceStyles.deviceMeta}>
                    {`Memory: ${formatBytes(device.maxMemorySize)}`}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}

          {Platform.OS === 'android' && (
            <Text style={deviceStyles.helperText}>
              {t.params.devicesTip}
            </Text>
          )}
        </View>
      </View>

      {/* Memory Lock */}
      <ParameterSwitch
        label={t.params.memoryLock}
        description={t.params.memoryLockDesc}
        value={params.use_mlock || false}
        onValueChange={(value) => updateParam('use_mlock', value)}
      />

      {/* Memory Map */}
      <ParameterSwitch
        label={t.params.memoryMap}
        description={t.params.memoryMapDesc}
        value={params.use_mmap || false}
        onValueChange={(value) => updateParam('use_mmap', value)}
      />

      {/* Batch Size */}
      <ParameterTextInput
        label={t.params.batchSize}
        description={t.params.batchSizeDesc}
        value={params.n_batch?.toString() || '512'}
        onChangeText={(text) => handleTextInput(text, 'n_batch')}
        keyboardType="numeric"
        placeholder="512"
      />

      {/* Micro Batch Size */}
      <ParameterTextInput
        label={t.params.uBatch}
        description={t.params.uBatchDesc}
        value={params.n_ubatch?.toString() || '512'}
        onChangeText={(text) => handleTextInput(text, 'n_ubatch')}
        keyboardType="numeric"
        placeholder="512"
      />

      {/* Threads */}
      <ParameterTextInput
        label={t.params.threads}
        description={t.params.threadsDesc}
        value={params.n_threads?.toString()}
        onChangeText={(text) => handleTextInput(text, 'n_threads')}
        keyboardType="numeric"
        placeholder="8"
      />

      {/* CPU MoE Layers */}
      <ParameterTextInput
        label={t.params.cpuMoe}
        description={t.params.cpuMoeDesc}
        value={params.n_cpu_moe?.toString() || '0'}
        onChangeText={(text) => handleTextInput(text, 'n_cpu_moe')}
        keyboardType="numeric"
        placeholder="0"
      />

      {/* Context Shift */}
      <ParameterSwitch
        label={t.params.ctxShift}
        description={t.params.ctxShiftDesc}
        value={params.ctx_shift || false}
        onValueChange={(value) => updateParam('ctx_shift', value)}
      />

      {/* Flash Attention Type */}
      <ParameterMenu
        label={t.params.flashAttn}
        description={t.params.flashAttnDesc}
        value={params.flash_attn_type}
        options={['auto', 'on', 'off']}
        onSelect={(value) => updateParam('flash_attn_type', value)}
        placeholder="auto"
      />

      {/* Cache Type K */}
      <ParameterMenu
        label={t.params.cacheTypeK}
        description={t.params.cacheTypeKDesc}
        value={params.cache_type_k}
        options={CACHE_TYPE_OPTIONS}
        onSelect={(value) => updateParam('cache_type_k', value)}
        placeholder="f16"
      />

      {/* Cache Type V */}
      <ParameterMenu
        label={t.params.cacheTypeV}
        description={t.params.cacheTypeVDesc}
        value={params.cache_type_v}
        options={CACHE_TYPE_OPTIONS}
        onSelect={(value) => updateParam('cache_type_v', value)}
        placeholder="f16"
      />

      {/* KV Unified */}
      <ParameterSwitch
        label={t.params.kvUnified}
        description={t.params.kvUnifiedDesc}
        value={params.kv_unified || false}
        onValueChange={(value) => updateParam('kv_unified', value)}
      />

      {/* SWA Full */}
      <ParameterSwitch
        label={t.params.swaFull}
        description={t.params.swaFullDesc}
        value={params.swa_full || false}
        onValueChange={(value) => updateParam('swa_full', value)}
      />
    </BaseParameterModal>
  )
}
