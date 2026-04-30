# mLm - Development Guidelines

## Project Overview

**mLm** is a React Native app for on-device LLM inference on Android, powered by [llama.rn](https://github.com/mybigday/llama.rn). It provides a chat interface, model management, and an OpenAI-compatible local API server.

## General

- Pay attention to code readability.
- Add comments appropriately, no need to explain the obvious.
- Apply first-principles thinking when appropriate.

## Architecture

1. **TypeScript App (`src/`)**
   - `src/App.tsx` — Root component with navigation setup
   - `src/navigation/RootNavigator.tsx` — Root stack navigator
   - `src/navigation/MainTabNavigator.tsx` — 4 bottom tabs: Chat, Models, Server, Settings
   - `src/screens/` — Screen components for each tab and sub-screens
   - `src/components/` — Reusable UI components
   - `src/services/tcp/` — TCP server with OpenAI-compatible API
   - `src/hooks/` — Custom hooks (useLocalServer, etc.)
   - `src/contexts/` — React contexts (theme, i18n, model)
   - `src/i18n/` — Multi-language system (en/zh)
   - `src/utils/` — Utility functions and constants

2. **Native Layer**
   - `llama.rn` (JSI bridge) provides the binding to llama.cpp
   - All llama.cpp/ggml symbols are prefixed with `LM_`/`lm_`
   - Native build is handled by llama.rn prebuilt libraries

## Build System

### Android Debug 构建

`bundleInDebug = true`，无需 Metro 服务器：

```bash
npm run build:android
```

1. Debug APK 包含内置 JS Bundle，可直接安装运行
2. 安装：`adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
3. 运行：`adb shell am start -n com.mlmrn/.MainActivity`
4. **无需 Metro 服务器**
5. **不要使用 `React.lazy` + 动态 `import()`** — 改用直接 `import`

### Release 构建

```bash
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/build/generated/assets/react/release/index.android.bundle \
  --assets-dest android/app/build/generated/res/react/release
cd android && ./gradlew assembleRelease
```

### Metro 热重载调试

1. 设置 dev server host: `adb shell settings put global dev_server_host "<dev-ip>:8081"`
2. `npx react-native start --no-interactive` 启动 Metro
3. `adb shell am start -n com.mlmrn/.MainActivity` 启动应用

## Important Conventions

- **NEVER build from source** (npm run bootstrap, cmake, or any C++ build) - will cause system freeze/crash
- Follow conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Testing Strategy

- **Jest tests:** `src/__tests__/` — run with `npm test`
- **Integration:** Build APK and test on device

## Key Files Reference

### App Core
- `src/App.tsx`
- `src/navigation/RootNavigator.tsx`
- `src/navigation/MainTabNavigator.tsx`

### Screens
- `src/screens/MainChatScreen.tsx` — Main chat with llama.rn integration
- `src/screens/ModelScreen.tsx` — Model management (load/unload, GGUF)
- `src/screens/LocalServerScreen.tsx` — Server controls
- `src/screens/SettingsScreen.tsx` — Theme, language, examples, about
- `src/screens/ExamplesGalleryScreen.tsx` — Example demos
- `src/screens/ServerLogsScreen.tsx` — Server log viewer
- `src/screens/APISetupScreen.tsx` — API setup guide

### Services
- `src/services/tcp/TCPServer.ts` — TCP server
- `src/services/tcp/openaiHandler.ts` — OpenAI API handler
- `src/services/tcp/httpParser.ts` — HTTP request parser
- `src/services/tcp/chatHandlers.ts` — Ollama-compatible handlers

### Core / Reusable
- `src/components/AppHeader.tsx` — Purple header
- `src/components/ModelSelectorBar.tsx` — Active model bar
- `src/contexts/I18nContext.tsx` — i18n provider
- `src/contexts/ThemeContext.tsx` — Theme provider
- `src/contexts/ModelContext.tsx` — Model state
- `src/hooks/useLocalServer.ts` — Server lifecycle hook
