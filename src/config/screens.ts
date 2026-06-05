import MultimodalScreen from '../screens/MultimodalScreen'
import TTSScreen from '../screens/TTSScreen'
import ToolCallsScreen from '../screens/ToolCallsScreen'
import BenchScreen from '../screens/BenchScreen'
import TextCompletionScreen from '../screens/TextCompletionScreen'
import ParallelDecodingScreen from '../screens/ParallelDecodingScreen'
import EmbeddingScreen from '../screens/EmbeddingScreen'
import StressTestScreen from '../screens/StressTestScreen'
import type {
  ExampleRouteName,
  ExampleScreenDefinition,
} from '../types/example'
import { EXAMPLE_SCREEN_METADATA } from './screenMetadata'

const SCREEN_COMPONENTS: Record<
  ExampleRouteName,
  ExampleScreenDefinition['component']
> = {
  TextCompletion: TextCompletionScreen,
  ParallelDecoding: ParallelDecodingScreen,
  Multimodal: MultimodalScreen,
  ToolCalling: ToolCallsScreen,
  Embeddings: EmbeddingScreen,
  TTS: TTSScreen,
  Bench: BenchScreen,
  StressTest: StressTestScreen,
}

export const EXAMPLE_SCREENS: ExampleScreenDefinition[] =
  EXAMPLE_SCREEN_METADATA.map((screen) => ({
    ...screen,
    component: SCREEN_COMPONENTS[screen.routeName],
  }))
