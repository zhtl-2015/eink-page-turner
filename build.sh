#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(python3 -c 'import json; print(json.load(open("'"$EXT_DIR"'/manifest.json"))["version"])')"
BASE_NAME="eink-page-turner-$VERSION"

command -v zip >/dev/null 2>&1 || {
  echo "错误：未找到 zip 命令。" >&2
  exit 1
}

rm -rf -- "$DIST_DIR"
mkdir -p -- "$DIST_DIR"

(
  cd -- "$EXT_DIR"
  zip -q -r -9 -X "$DIST_DIR/$BASE_NAME.xpi" . \
    -x '*.DS_Store' -x '__MACOSX/*' -x '*/.git/*'
)

cp -- "$DIST_DIR/$BASE_NAME.xpi" "$DIST_DIR/$BASE_NAME.zip"
(
  cd -- "$DIST_DIR"
  sha256sum "$BASE_NAME.xpi" "$BASE_NAME.zip" > SHA256SUMS.txt
)

echo "已生成："
echo "  dist/$BASE_NAME.xpi   （火狐扩展包，本质是 zip）"
echo "  dist/$BASE_NAME.zip   （内容相同的压缩包）"
echo "  dist/SHA256SUMS.txt"
