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
