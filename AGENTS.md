# mLm - Development Guidelines

## Project Overview

**mLm** is a React Native app for on-device LLM inference on Android, powered by a vendored copy of [llama.rn](https://github.com/mybigday/llama.rn) at `modules/llama.rn/`. It provides a chat interface, model management, and an OpenAI-compatible local API server.

## Architecture

- **TypeScript App (`src/`)** — React Navigation with 4 bottom tabs (Chat, Models, Server, Settings)
- **llama.rn** — Vendored React Native binding for llama.cpp, linked via `react-native.config.js` as a local module
- **Native** — llama.rn uses prebuilt `librnllama_*.so` + JNI bridge (`librnllama_jni_*.so`) from `modules/llama.rn/android/src/main/jniLibs/arm64-v8a/`
- Only **arm64-v8a** ABI is built (see `android/gradle.properties`)

## Critical Constraint — NEVER Build C++ from Source

**Do NOT run `npm run build:android` or any command that triggers CMake/C++ compilation.** The system will freeze/crash. Only compile the thin JNI bridge (8 C++ files in `cpp/jsi/`) via CMake, which is safe with `--max-workers=1`.

## Build Commands

### Debug APK (safe workflow, no C++ build from source)

```bash
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/build/generated/assets/react/debug/index.android.bundle \
  --assets-dest android/app/build/generated/res/react/debug
cd android && ./gradlew assembleDebug --max-workers=1 -PreactNativeArchitectures=arm64-v8a
```

Steps:
1. Bundle JS separately (Node.js only, no C++)
2. Build APK via Gradle with `--max-workers=1` to avoid system overload
3. Install: `adb install -r android/app/build/outputs/apk/debug/mLm_v8a.apk`
4. Run: `adb shell am start -n com.mlmrn/.MainActivity`
5. **No Metro server required** (`bundleInDebug = true`)

### Release APK

```bash
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/build/generated/assets/react/release/index.android.bundle \
  --assets-dest android/app/build/generated/res/react/release
cd android && ./gradlew assembleRelease --max-workers=1
```

### llvm-strip Fix

The NDK `llvm-strip` at `$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip` may be a broken text file. Fix:
```bash
cd $ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/
rm llvm-strip && ln -sf llvm-objcopy llvm-strip
```
Without this fix, `.so` files are not stripped and APK balloons to ~456MB (normally ~130MB).

### Metro Hot Reload

```bash
adb shell settings put global dev_server_host "<dev-ip>:8081"
npx react-native start
adb shell am start -n com.mlmrn/.MainActivity
```

## Updating llama.rn

llama.rn is vendored at `modules/llama.rn/`. When updating prebuilt libraries:

1. Download `llama-rn-android-jni-libs.tar.gz` from GitHub releases
2. Extract to `modules/llama.rn/android/src/main/jniLibs/`
3. Update `modules/llama.rn/src/version.ts` (BUILD_NUMBER, BUILD_COMMIT)
4. **Must also sync bridge C++ code** (`cpp/` and `src/` directories) from the updated llama.rn source — otherwise the JNI wrapper calls stale APIs and the app crashes on model load
5. Clear `.cxx` cache: `rm -rf modules/llama.rn/android/.cxx`
6. Rebuild

To update from a local clone at `../llama.rn/`:
```bash
rsync -a --delete ../llama.rn/cpp/ modules/llama.rn/cpp/
rsync -a --delete ../llama.rn/src/ modules/llama.rn/src/
```

## Version Info Locations

Version must be updated in **3 places**:
- `package.json` — `"version": "0.0.2"`
- `android/app/build.gradle` — `versionCode`, `versionName`
- `src/screens/SettingsScreen.tsx` — hardcoded display string

## TypeScript / JavaScript

- **No `React.lazy` or dynamic `import()`** — use direct imports
- Typecheck: `npx tsc --noEmit`
- Jest tests: `npm test` (tests in `src/__tests__/`)
- Lint: `npx eslint` (uses `eslint-config-react-native` — no local config file, relies on package config)
- Babel alias: `llama.rn` and `@modelcontextprotocol/sdk` are aliased in `babel.config.js`

## Git / Release

- Commits must pass lefthook pre-commit (eslint + tsc on staged files) and commitlint
- Use `--no-verify` only if pre-commit hook infrastructure is broken (eslint config resolution fails from subdirectories)
- Follow conventional commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`)
- Publish release: `gh release create v<tag> <apk_path> --title "mLm v<tag>" --notes "<notes>"`

## llama.rn 升级经验（v0.12.5 b9769）

### 完整升级步骤

1. **同步 JS/TS 层**（`src/`）：
   ```bash
   rsync -a --delete ../llama.rn/src/ modules/llama.rn/src/
   ```

2. **同步 C++ 桥接层**（`cpp/`）— **必做！** 否则 JNI 调用旧 API，模型加载时直接崩溃：
   ```bash
   rsync -a --delete ../llama.rn/cpp/ modules/llama.rn/cpp/
   ```

3. **更新预编译 JNI 库** — 从 GitHub Release 下载 `llama-rn-android-jni-libs.tar.gz`，解压到：
   ```
   modules/llama.rn/android/src/main/jniLibs/
   ```

4. **更新版本信息** — 修改 `modules/llama.rn/src/version.ts`（BUILD_NUMBER、BUILD_COMMIT）

5. **清除缓存**：
   ```bash
   rm -rf modules/llama.rn/android/.cxx
   ```

6. **重建 APK** — 按构建命令重新编译

### C++ 关键修复：`llamaCancelRequest` Promise 挂起

**症状**：调用停止按钮（`ctx.stopCompletion()`）后，JS 层 `completion()` 返回的 Promise 永远不 resolve，导致 `isStreaming` 无法恢复为 `false`，UI 卡在"停止"状态。

**根因**：上游 `RNLlamaJSI.cpp` 中 `llamaCancelRequest` 仅执行 `cancel_request` + `removeRequest`，**没有调用 `onComplete` 回调**。JS 端通过 `NativeCompletionResult` Promise 等待结果，C++ 端直接移除了请求而未 resolve Promise，导致永久 pending。

**修复位置**：`modules/llama.rn/cpp/jsi/RNLlamaJSI.cpp`（约第 1463 行的 `cancelRequest` 函数）

**修复内容**：在 `removeRequest` 之前，获取 `onComplete` 回调并调用它：

```cpp
// Before RequestManager::getInstance().removeRequest(contextId, requestId):
auto callbacks = RequestManager::getInstance().getRequest(contextId, requestId);
if (callbacks.onComplete) {
    jsi::Object res(runtime);
    res.setProperty(runtime, "text", jsi::String::createFromUtf8(runtime, ""));
    res.setProperty(runtime, "interrupted", jsi::Value(true));
    res.setProperty(runtime, "stopped_eos", jsi::Value(false));
    res.setProperty(runtime, "stopped_word", jsi::Value(false));
    res.setProperty(runtime, "stopped_limit", jsi::Value(false));
    res.setProperty(runtime, "incomplete", jsi::Value(true));
    res.setProperty(runtime, "truncated", jsi::Value(false));
    res.setProperty(runtime, "context_full", jsi::Value(false));
    res.setProperty(runtime, "tokens_predicted", jsi::Value(0));
    res.setProperty(runtime, "tokens_evaluated", jsi::Value(0));
    res.setProperty(runtime, "tokens_cached", jsi::Value(0));
    res.setProperty(runtime, "n_decoded", jsi::Value(0));
    callbacks.onComplete->call(runtime, res);
}
```

**影响范围**：此修复不仅解决 mLm 的停止按钮问题，还修复了上游 llama.rn 示例中 `parallel.completion().promise` 在取消时永不 resolve 的问题。

**注意**：升级 llama.rn 后需要重新应用此修复（用 `git diff` 定位），因为它是**上游尚未合入的定制修改**。检查 `RNLlamaJSI.cpp` 中 `cancelRequest` 函数在 `removeRequest` 之前是否调用了 `onComplete`。

### 经验教训

- **永远先同步 C++ 代码**：仅替换 `.so` 库而不同步 `cpp/` 桥接层，会导致 JNI 函数签名不匹配，模型加载直接崩溃。这是最容易踩的坑。
- **`llamaCancelRequest` 是典型的上游 bug**：任何版本的 llama.rn 都需要检查这个补丁。升级后务必确认 `RNLlamaJSI.cpp` 中的 `cancelRequest` 是否调用了 `onComplete`。
- **JSI 桥 vs TurboModules**：llama.rn 使用 JSI（直接注入全局函数）而非 RN TurboModules。调试时关注 `rnllama` 全局 JS 调用是否生效，可通过 `console.log` 在 JS 端验证 `llamaCancelRequest` 是否触发。
