import React from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import ModelDownloadCard, {
  MtmdModelDownloadCard,
  TTSModelDownloadCard,
} from './ModelDownloadCard'
import CustomModelCard from './CustomModelCard'
import CustomModelModal from './CustomModelModal'
import { MaskedProgress } from './MaskedProgress'
import { createThemedStyles } from '../styles/commonStyles'
import { useTheme } from '../contexts/ThemeContext'
import type { CustomModel } from '../utils/storage'
import type { ExampleModelDefinition } from '../types/example'

interface ExampleModelSetupProps {
  children?: React.ReactNode
  description: string
  defaultModels: ExampleModelDefinition[]
  onInitializeModel: (
    model: ExampleModelDefinition,
    ...paths: string[]
  ) => void | Promise<void>
  customModels?: CustomModel[]
  availableModels?: CustomModel[]
  onInitializeCustomModel?: (
    model: CustomModel,
    modelPath: string,
    mmprojPath?: string,
  ) => void | Promise<void>
  onReloadCustomModels?: () => Promise<unknown>
  showCustomModelModal?: boolean
  onOpenCustomModelModal?: () => void
  onCloseCustomModelModal?: () => void
  customModelModalTitle?: string
  requireMMProj?: boolean
  enableFileSelection?: boolean
  defaultModelSectionTitle?: string
  customModelSectionTitle?: string
  addCustomModelLabel?: string
  availableModelSectionTitle?: string
  isLoading?: boolean
  initProgress?: number
  progressText?: string
  showProgressBar?: boolean
}

export function ExampleModelSetup({
  children,
  description,
  defaultModels,
  onInitializeModel,
  customModels = [],
  availableModels,
  onInitializeCustomModel,
  onReloadCustomModels,
  showCustomModelModal = false,
  onOpenCustomModelModal,
  onCloseCustomModelModal,
  customModelModalTitle = 'Add Custom Model',
  requireMMProj = false,
  enableFileSelection = true,
  defaultModelSectionTitle = 'Default Models',
  customModelSectionTitle = 'Custom Models',
  addCustomModelLabel = '+ Add Custom Model',
  availableModelSectionTitle = '📦 已下载的模型',
  isLoading = false,
  initProgress = 0,
  progressText = '',
  showProgressBar = initProgress > 0,
}: ExampleModelSetupProps) {
  const { theme } = useTheme()
  const themedStyles = createThemedStyles(theme.colors)

  return (
    <View style={themedStyles.container}>
      <ScrollView
        style={themedStyles.setupContainer}
        contentContainerStyle={themedStyles.scrollContent}
      >
        <Text style={themedStyles.setupDescription}>{description}</Text>
        {children}

        {availableModels && availableModels.length > 0 && (
          <>
            <Text style={themedStyles.modelSectionTitle}>
              {availableModelSectionTitle}
            </Text>
            {availableModels.map((model) => (
              <CustomModelCard
                key={model.id}
                model={model}
                onInitialize={(modelPath, mmprojPath) =>
                  onInitializeCustomModel
                    ? onInitializeCustomModel(model, modelPath || '', mmprojPath)
                    : onInitializeModel(defaultModels[0] || {} as any, modelPath || '', mmprojPath)
                }
                onModelRemoved={async () => {
                  if (onReloadCustomModels) await onReloadCustomModels()
                }}
                initializeButtonText="使用此模型"
              />
            ))}
          </>
        )}

        {onOpenCustomModelModal && onCloseCustomModelModal && (
          <TouchableOpacity
            style={themedStyles.addCustomModelButton}
            onPress={onOpenCustomModelModal}
          >
            <Text style={themedStyles.addCustomModelButtonText}>
              {addCustomModelLabel}
            </Text>
          </TouchableOpacity>
        )}

        <Text style={themedStyles.modelSectionTitle}>
          {defaultModelSectionTitle}
        </Text>
        {defaultModels.map((model) => {
          if (model.kind === 'multimodal') {
            return (
              <MtmdModelDownloadCard
                key={model.key}
                title={model.title}
                repo={model.repo}
                filename={model.filename}
                mmproj={model.mmproj}
                size={model.size}
                initializeButtonText={model.initializeButtonText}
                onInitialize={(modelPath, mmprojPath) =>
                  onInitializeModel(model, modelPath, mmprojPath)
                }
              />
            )
          }

          if (model.kind === 'tts') {
            return (
              <TTSModelDownloadCard
                key={model.key}
                title={model.title}
                repo={model.repo}
                filename={model.filename}
                size={model.size}
                vocoder={model.vocoder}
                initializeButtonText={model.initializeButtonText}
                onInitialize={(ttsPath, vocoderPath) =>
                  onInitializeModel(model, ttsPath, vocoderPath)
                }
              />
            )
          }

          return (
            <ModelDownloadCard
              key={model.key}
              title={model.title}
              repo={model.repo}
              filename={model.filename}
              size={model.size}
              initializeButtonText={model.initializeButtonText}
              onInitialize={(modelPath) => onInitializeModel(model, modelPath)}
            />
          )
        })}
      </ScrollView>

      {onOpenCustomModelModal && onCloseCustomModelModal && (
        <CustomModelModal
          visible={showCustomModelModal}
          onClose={onCloseCustomModelModal}
          onModelAdded={async () => {
            if (onReloadCustomModels) {
              await onReloadCustomModels()
            }
          }}
          title={customModelModalTitle}
          requireMMProj={requireMMProj}
          enableFileSelection={enableFileSelection}
        />
      )}

      <MaskedProgress
        visible={isLoading}
        text={progressText}
        progress={initProgress}
        showProgressBar={showProgressBar}
      />
    </View>
  )
}
