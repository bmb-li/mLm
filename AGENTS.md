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

### 构建被中断后的缓存损坏恢复

构建若被强行中断（Ctrl-C、会话/环境重启），Gradle 会留下**半写/0 字节**的缓存文件，导致后续构建报以下错误：

| 错误信息 | 损坏位置 | 修复 |
|---|---|---|
| `Could not read workspace metadata from .../transforms/<hash>/metadata.bin` | Gradle transform 缓存 | `./gradlew --stop` 后 `rm -rf ~/.gradle/caches/9.0.0/transforms` |
| `[CXX1420] Could not read '.../.cxx/.../configure_fingerprint.bin': Was not a C/C++ structured log file` | 模块 `.cxx`（文件为 0 字节）| `rm -rf android/app/.cxx android/app/build/intermediates/cxx modules/llama.rn/android/.cxx` |
| `java.io.EOFException: End of input at line 1 column 1 path $` | 同上（空 JSON）| 同上 |

**要点**：
- 0 字节的 `configure_fingerprint.bin` 是**症状不是原因**——AGP 认为 CMake configure 已 up-to-date 就不再重跑，从而反复读到坏文件。**必须删掉整个 `.cxx` 强制重跑 configure**，只删那个文件无效。
- 先看 `android/app/build/intermediates/cxx/*/logs/*/configure_stdout.txt`：若含 `Configuring done` / `Generating done`，说明 CMake 本身没问题，纯粹是 AGP 缓存坏了。
- 清 transform 缓存后首次构建会重新 transform 全部依赖（耗时较长，属正常）。
- WSL2 上 `rm -rf` 偶发报 `Directory not empty`（9p 文件系统竞态），重试一次即可。
- 长时间构建建议后台运行，避免被会话重启打断：
  ```bash
  setsid nohup ./gradlew assembleDebug --no-daemon --max-workers=1 \
    -PreactNativeArchitectures=arm64-v8a > /tmp/build.log 2>&1 < /dev/null &
  ```

### Metro Hot Reload

```bash
adb shell settings put global dev_server_host "<dev-ip>:8081"
npx react-native start
adb shell am start -n com.mlmrn/.MainActivity
```

### USB ADB 直连（WSL2 + usbipd-win）

本项目开发机是 **WSL2（Ubuntu-24.04）**。WSL2 是虚拟机，USB 设备不会自动进入，需用 Windows 侧 **usbipd-win** 把手机转发进来（USB 透传），否则 `adb devices` 在 WSL2 内永远为空，只能退而用无线调试。

**已安装/配置（一次性）：**
- Windows：`usbipd-win 5.3.0`，装在 `C:\Program Files\usbipd-win\usbipd.exe`（不在 PATH，需全路径调用）
- Redmi K70 Pro 已 `usbipd bind --busid 1-8`（持久化，重启仍 Shared）
- Linux：`linux-tools-virtual`（提供 `/usr/bin/usbip`）+ 内核模块 `vhci_hcd usbip-core usbip-host`

**每次开机需执行（bind 持久，attach 不持久）：**

```bash
USBPID='/mnt/c/Program Files/usbipd-win/usbipd.exe'
"$USBPID" list                                  # 确认手机 BUSID（如 1-8）状态为 Shared
"$USBPID" attach --wsl --busid 1-8              # 转发进 WSL2（需 Windows 管理员/UAC 授权）
sudo modprobe vhci-hcd usbip-core usbip-host   # 加载内核模块（按提示输入 sudo 密码）
sleep 3
sudo chmod 666 /dev/bus/usb/001/* /dev/bus/usb/002/*   # 授权设备节点
adb kill-server && adb start-server
adb devices                                     # 应显示 <serial>  device（USB 直连）
```

**关键点：**
- `adb` 路径：`/home/admin-li/Android/sdk/platform-tools/adb`
- **udev 规则对 vhci 设备不自动生效**（节点是 `root:root crw-rw-r--`），必须手动 `chmod 666` 设备节点，否则报 `no permissions (missing udev rules)`。`chmod` 是临时的，重启后要重做。
- 手机端 USB 调试授权弹窗需手动接受一次。

**排查路径**：`usbipd list` 无手机 → 检查 USB 线/开发者选项；有手机但 `Not shared` → 重新 `bind`；`attach` 报错 → Windows 端需管理员运行；设备在但 `no permissions` → `chmod 666` 节点 + 重启 adb。

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

### ✅ 已在上游修复（v0.12.9 起）——无需再打本地补丁

我们已将此 bug 上报上游（Issue #373），上游在 **v0.12.9** 合入了 commit `b9eebd5`（"fix: settle cancelled parallel completions"，Closes #373），以架构性重写方式正式修复：

- 新增 `cpp/jsi/JSICompletion.h`、`cpp/jsi/JSIRequestManager.h`
- 重构 `RNLlamaJSI.cpp` 的 `llamaCancelRequest`（返回 `cancel_result`，QUEUED 时调用 `onComplete`）与 `rn-slot-manager`
- **已在本机 v0.12.9 实测验证：停止按钮不再卡"停止"状态**

**升级 v0.12.9 及以后版本时**：
- 不再需要手动重新应用 `llamaCancelRequest` 补丁
- `rsync --delete` 同步 `cpp/` 后，旧补丁会被上游代码自然覆盖，切勿手动叠加旧补丁（会与新版取消机制冲突）
- 若升级后停止按钮异常，先确认 `llamaCancelRequest` 是否处理了 `QUEUED` 分支并调用 `onComplete`

### ✅ HTP/NPU 卡 80% 已修复（v0.12.9，本机实测通过）

**症状**：选择 HTP（NPU）后端加载模型时，初始化进度卡在 80% 后不再前进。

**根因**：llama.rn 的 HTP backend 是 **FastRPC 架构**——主机侧 `.so`（`librnllama_..._hexagon_opencl.so`）通过 `htp_iface_*.invoke` 调用 DSP 上运行的 skel 固件（`libggml-htp-vXX.so`），二者通过共享的 `cpp/ggml-hexagon/htp/htp_iface.idl` 接口通信。

- llama.cpp 在 commit `a4a206a`（b9982，2026-07-13）**不兼容地改了 IDL**：`start()` 签名 `use_hmx`→`n_hmx`，并新增 `hwinfo()` 方法
- app 里 `android/app/src/main/assets/ggml-hexagon/` 的旧 skel 是 4月30日 编译的（旧 IDL，无 `hwinfo`）
- 主机后端调用 `htp_iface_hwinfo` / 新 `start` 时 FastRPC invoke 挂起 → 卡 80%
- **release tarball 只含主机侧 jniLibs，不含 skel 固件**（CI 将 skel 作为保留 1 天的构建工件单独分发），所以必须自行编译

**修复步骤**（在 `../llama.rn` 源码下）：
```bash
./scripts/build-hexagon-htp.sh   # 产物输出到 bin/arm64-v8a/
```

**工具链版本随 llama.rn 版本变化（务必与脚本内置版本一致）**：

| llama.rn 版本 | Hexagon SDK | Tools | 变体 | skel 架构 |
|---|---|---|---|---|
| v0.12.9 ~ rc.3 | 6.4.0.2 | 19.0.04（toolv19）| v73/v75/v79/v81 |
| rc.4 ~ rc.7 | 6.4.0.2 | 19.0.04（toolv19）| v73/v75/v79/v81 |
| **rc.8+** | **6.7.0.0** | **21.0.04（toolv21）** | v73/v75/v79/v81/**v85** |

> rc.8 起 `scripts/build-hexagon-htp.sh` 顶部硬编码 `HEXAGON_SDK_VERSION=6.7.0.0` / `HEXAGON_TOOLS_VERSION=21.0.04`，并构建 `v85`（`PREBUILT_DIRS=toolv21_v*`）。旧 SDK 会直接报 "SDK not found"。
> SDK 安装：解压 `hexagon-sdk-v6.7.0.0-amd64-lnx.tar.xz`（顶层目录即 `6.7.0.0/`）到 `~/.hexagon-sdk/`。

- 将产物 `libggml-htp-v*.so` **全部**覆盖到 `android/app/src/main/assets/ggml-hexagon/`
- **关键校验**：`strings libggml-htp-vXX.so | grep hwinfo` 应命中（新 IDL）；旧 skel 为 0 命中
- 删除遗留的 `libggml-htp-v69.so`（v69 后端不再支持，脚本明确不构建 v69）

**IDL 变更记录（决定是否需要重建 skel）**：
| 版本 | IDL 变更 | 是否需重建 |
|---|---|---|
| rc.1 / rc.2 / rc.3 | 无 | 否（可复用）|
| rc.4 ~ rc.7 | `mmap(fd, size)` 的 size `uint32`→`uint64` | **是** |
| **rc.8+** | `start()` 新增 `power_mode` 参数（主机侧 6 参调用）| **是** |

**⚠️ 升级 llama.rn 后必须重新编译 skel**：skel 固件与主机后端 IDL 强耦合，每次 llama.cpp sync 都可能改 IDL。若 HTP 卡 80%，先 `git diff <旧tag> <新tag> -- vendor/llama.cpp/ggml/src/ggml-hexagon/htp/htp_iface.idl`，有变更就必须重建 skel。

**⚠️ RNLlama.java 的 HTP_LIBS 坑**：`ensureHtpLibraries` 按 `HTP_LIBS` 数组**顺序提取**，任一文件缺失即 `return false` → 整个提取中断 → `ADSP_LIBRARY_PATH` 未设置 → DSP 找不到任何 skel（表现：启动即 `open_mod_table_handle_invoke failed ... No such file`）。

> 历史坑：曾残留 `"libggml-htp-v69.so"`（上游无）。
> **rc.8 起 `HTP_LIBS` 新增 `libggml-htp-v85.so`** —— 升级 rc.8 时必须把 v85 skel 一并编入 `assets/ggml-hexagon/`，否则 NPU 完全不可用。校验：`assets` 里的 skel 列表应与 `RNLlama.java` 的 `HTP_LIBS` 完全一致。

**⚠️ rc.8 build.gradle 的 Hexagon 探测**：`modules/llama.rn/android/build.gradle` 硬编码检查 `~/.hexagon-sdk/6.7.0.0` + `tools/HEXAGON_TOOLS/21.0.04`，命中则打印 `✅ Hexagon SDK detected — enabling DSP build` 并给 CMake 传 `-DHEXAGON_SDK_ROOT`。在 `RNLLAMA_BUILD_FROM_SOURCE=OFF`（本项目默认）下，这**只影响薄 JNI 桥的一个编译宏**（`-DGGML_USE_HEXAGON`），**不会**编译 llama.cpp/hexagon 主机源码；预编译字库路径不变。

**验证日志特征**（`adb logcat | grep rnllama`）：
- `load_tensors: layer N assigned to device HTP1`、`llama_kv_cache: layer N: dev = HTP1` → 层已上 NPU
- `Slot 0: Stopped on EOS token` → 生成正常完成
- 无 `failed to open session` / `failed to create device` → skel 加载成功

### 经验教训

- **永远先同步 C++ 代码**：仅替换 `.so` 库而不同步 `cpp/` 桥接层，会导致 JNI 函数签名不匹配，模型加载直接崩溃。这是最容易踩的坑。
- **`llamaCancelRequest` 是典型的上游 bug**：任何版本的 llama.rn 都需要检查这个补丁。升级后务必确认 `RNLlamaJSI.cpp` 中的 `cancelRequest` 是否调用了 `onComplete`。
- **JSI 桥 vs TurboModules**：llama.rn 使用 JSI（直接注入全局函数）而非 RN TurboModules。调试时关注 `rnllama` 全局 JS 调用是否生效，可通过 `console.log` 在 JS 端验证 `llamaCancelRequest` 是否触发。
- **v0.12.9 起取消机制已上游修复**：`rsync --delete` 同步 `cpp/` 后会自动覆盖旧补丁，**不要**再手动叠加本地 `llamaCancelRequest` 补丁（会与新版 `cancel_result`/QUEUED 机制冲突）。
