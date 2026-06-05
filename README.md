# mLm

mLm 是一款基于 [llama.rn](https://github.com/mybigday/llama.rn) 构建的 Android 本地大模型推理应用。

本项目基于 llama.rn 开发，在此基础上进行了 UI 重构并增加了 OpenAI 兼容的本地 API 服务。

## 功能

- **💬 聊天** - 本地 LLM 聊天界面，支持流式输出
- **📦 模型管理** - 加载和管理本地 GGUF 模型
- **🔌 本地服务器** - OpenAI 兼容 API 服务（端口 8889）
- **⚙️ 参数调节** - 上下文窗口、采样参数等高级设置
- **🌐 多语言** - 中文/英文界面

## 依赖

```bash
git clone https://github.com/mybigday/llama.rn.git modules/llama.rn
npm install
```

## 构建

### Debug

```bash
npm run build:android
```

### Release

```bash
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/build/generated/assets/react/release/index.android.bundle \
  --assets-dest android/app/build/generated/res/react/release
cd android && ./gradlew assembleRelease
```

## 致谢

- [llama.rn](https://github.com/mybigday/llama.rn) - React Native binding for llama.cpp
- [llama.cpp](https://github.com/ggerganov/llama.cpp) - LLM inference engine
- [InferrLM](https://github.com/sbhjt-gr/InferrLM) - On-device AI for iOS & Android
