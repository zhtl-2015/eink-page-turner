#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ADB_BIN="${ADB_BIN:-adb}"
FIREFOX_APK="${FIREFOX_APK:-org.mozilla.firefox}"
WEB_EXT_VERSION="${WEB_EXT_VERSION:-10.8.0}"

if ! command -v "$ADB_BIN" >/dev/null 2>&1; then
  cat >&2 <<'MSG'
错误：没有找到 adb。

请先安装 Android Platform Tools，并把 adb 加入 PATH：
  Ubuntu/Debian: sudo apt install adb
  macOS:         brew install --cask android-platform-tools
  Windows:       下载 platform-tools 并添加目录到 PATH

安装后可运行：adb devices
MSG
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "错误：没有找到 npx。请先安装 Node.js 20 或更高版本。" >&2
  exit 1
fi

DEVICE="${1:-${ADB_DEVICE:-}}"
mapfile -t DEVICES < <("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" { print $1 }')

if [ "${#DEVICES[@]}" -eq 0 ]; then
  cat >&2 <<'MSG'
错误：没有检测到已授权的 Android 设备。

检查：
1. 手机已开启“开发者选项”和“USB 调试”；
2. USB 线已连接，手机上已点“允许 USB 调试”；
3. 运行 adb devices 能看到 device 状态；
4. 在 Firefox 设置中开启“通过 USB 远程调试”。
MSG
  exit 1
fi

if [ -z "$DEVICE" ]; then
  if [ "${#DEVICES[@]}" -eq 1 ]; then
    DEVICE="${DEVICES[0]}"
  else
    echo "检测到多个设备，请把要使用的设备 ID 作为第一个参数：" >&2
    printf '  %s\n' "${DEVICES[@]}" >&2
    echo "例如：$0 ${DEVICES[0]}" >&2
    exit 1
  fi
fi

found=0
for candidate in "${DEVICES[@]}"; do
  if [ "$candidate" = "$DEVICE" ]; then
    found=1
    break
  fi
done

if [ "$found" -ne 1 ]; then
  echo "错误：设备 '$DEVICE' 不在已授权设备列表中。" >&2
  printf '可用设备：%s\n' "${DEVICES[*]}" >&2
  exit 1
fi

echo "设备：$DEVICE"
echo "Firefox APK：$FIREFOX_APK"
echo "将以“临时扩展”方式安装，不需要签名。关闭 Firefox 后扩展会消失。"
echo "按 Ctrl+C 结束调试会话。"
echo

exec npx --yes "web-ext@$WEB_EXT_VERSION" run \
  --source-dir "$ROOT_DIR/extension" \
  --target=firefox-android \
  --android-device="$DEVICE" \
  --firefox-apk="$FIREFOX_APK" \
  --no-reload \
  --no-input
