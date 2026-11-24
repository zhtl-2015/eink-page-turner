# 墨水屏翻页器（Firefox for Android）

把上下滚动的网页改成“一屏一页”的电子墨水屏阅读模式。

> 非官方项目，与 Mozilla 无隶属关系。Firefox 是 Mozilla Foundation 的商标。

![翻页模式界面](docs/screenshot-enabled.png)

- 收起时只在画面右下角保留一个「展开」按钮；展开后是横排控制条：「收起 / A− / A+ / ↑ / ↓」。
- 「下一页」固定在最右侧，控制条默认放在画面底部，优先覆盖网站底部栏，减少对正文的遮挡。
- 按钮按物理尺寸固定，不会因为电脑版网页自动缩小、页面字号变化而变小；双指缩放时也会尽量反向补偿。
- 整个控制条（包括按钮之间的空白区域）都可以直接拖动，没有额外的拖动符号；松手自动保存位置，收起后也能拖。
- 新增正文字号调节：A− / A+ 每次 10%，范围 80%–180%，设置跨页面保存；收起时恢复网站原字号，展开后重新应用。
- 每次点击滚动“一屏减去重叠距离”，默认额外保留 8% 重叠区域，宁可重复一点，也不让内容卡在两页之间。
- 自动检测页面顶部/底部的固定页眉、页脚，把它们的遮挡高度计入重叠区域。
- 到达页首/页尾时给出提示。
- 展开期间把页面的 `transition` / `animation` 缩短到 1ms，并强制 `scroll-behavior: auto`，避免平滑滚动和动画残影。
- **收起会退出翻页模式**，恢复网页原本的动画和字号；「展开」按钮仍可拖动。展开/收起状态、字体大小和按钮位置都保存在 `storage.local`。
- 自动识别两类页面：普通窗口滚动，以及固定布局里的内部滚动容器。
- 使用 Shadow DOM 隔离样式；即使网站有严格 CSP，控件样式和翻页功能也能工作。

当前版本：`0.3.0`，目标 Firefox for Android 142 及以上。

> v0.3.0 改了控制条布局，按钮位置使用新的存储键，会回到“右下角”默认位置一次；之后再拖动会正常保留。

## 安装

本仓库生成的 `.xpi` **没有 Mozilla 签名**。普通 Firefox for Android 正式版 / Beta 默认会拒绝安装，因此它目前只适合开发测试。最简单的测试方式是使用 Firefox Nightly。

### 推荐：Firefox Nightly 从本地文件安装

> 仅用于测试未签名扩展。关闭签名校验会降低浏览器安全性，请只安装自己信任的 `.xpi`。

1. 从 Google Play 或 [Mozilla 官网](https://www.mozilla.org/firefox/nightly/) 安装 **Firefox Nightly**。
2. 把 [`dist/eink-page-turner-0.3.0.xpi`](dist/eink-page-turner-0.3.0.xpi)（或 GitHub Releases 中的 `.xpi`）下载或传到手机。
3. 在 Nightly 地址栏打开 `about:config`。
   - 如果打不开，先执行第 4 步解锁隐藏设置，再回来重试。部分版本可能要在隐藏的 Secret settings / Debug menu 中启用 `about:config`。
4. 打开：设置 → 关于 Firefox，**连续点击 Firefox 图标 5 次**，解锁隐藏调试选项。
5. 回到 `about:config`，搜索 `xpinstall.signatures.required`，把值改为 `false`。
   - 如果修改后不生效，完全退出 Nightly 再重新打开。
6. 确认已通过“关于 Firefox”连续点击解锁隐藏菜单，然后进入：
   设置 → **从文件安装扩展**（英文界面为 **Install Extension from File**；不同版本可能位于隐藏的调试菜单中）。
7. 选择刚才保存的 `.xpi`，确认添加。
8. 打开任意网页，右下角出现「展开」即安装成功。

不同 Nightly 版本的隐藏菜单名称和位置可能略有差异。如果找不到入口，请重启 Nightly，并再次确认图标已连续点击 5 次。

> 这是测试流程，不是正式分发方式。普通用户请等待 AMO 上的签名版本；不建议在正式版中关闭签名校验。

### 备选：adb 临时安装（一般不需要）

如果 Nightly 的本地安装入口不可用，可以通过 adb 临时安装。需要电脑安装 Node.js 20+、Android Platform Tools，并在手机开发者选项中开启 USB 调试。

1. 在手机 Firefox / Nightly 中开启「通过 USB 远程调试」（Remote debugging via USB）。
2. 连接手机并确认 `adb devices` 能看到设备。
3. 在项目目录运行：

   ```bash
   ./tools/run-in-firefox-android.sh
   ```

   使用 Nightly 时：

   ```bash
   FIREFOX_APK=org.mozilla.fenix.nightly ./tools/run-in-firefox-android.sh
   ```

这种方式把扩展作为临时扩展加载，**重启 Firefox 后会消失**。完整参数见脚本内注释。

### 长期使用

当前 GitHub 构建包未签名，不适合正式版直接安装。后续如果发布到 AMO，签名版本可以直接从 AMO 安装并自动更新。

## 使用

1. 打开任意 `http://` 或 `https://` 网页。
2. 点右下角「展开」→ 显示「收起 / A− / A+ / ↑ / ↓」横排控制条，并开启翻页模式。
3. 点最右侧「↓」向前翻一屏，点「↑」回退一屏；翻页步长会自动减去重叠区域。
4. 按住控制条任意位置拖动（按钮上或按钮之间的空白都可以），可把它放到屏幕任意位置。
5. 点「A+」增大正文字号，点「A−」减小；每次 10%，达到上限/下限会有提示。
6. 到边界时会出现「已到页首 / 已到页尾」提示。
7. 点「收起」隐藏控制条并恢复网页原动画、原字号；右下角仍保留可拖动的「展开」。

翻页模式展开时，用手指滑动仍然可用。按钮是主操作方式；目前不会强制锁死触摸滚动，以免网页内的菜单、弹窗无法滚动。

### 按钮大小与页面缩放

电脑版网页在手机上常会以 980px 等宽布局整体缩小显示。扩展会读取屏幕宽度与可视视口比例，对按钮做反向缩放，所以按钮的物理高度保持约 40px，而不是跟着网页一起变成很小。双指缩放时也会尝试按 `visualViewport` 重新计算；但不同 Firefox 版本处理固定定位和缩放的方式可能略有差别，这一点属于尽力适配。

### 字号调节说明

字号调节只处理网页中的文字元素，会跳过固定页眉/页脚、导航、按钮、输入框以及 `pre/code` 等区域，避免把网站控件撑坏。它使用内联字号和行高覆盖，因此对常见正文页面有效；如果网站使用 Canvas 自绘文字、图片文字或非常特殊的布局，则可能不生效或产生排版偏移。新加载的章节内容如果没有被缩放，再点一次 A+/A− 或收起后重新展开即可重新应用。

## 已知限制

- 只注入顶层页面，不处理 iframe 内部的滚动区域。
- **不支持 Firefox 自带的阅读模式（`about:reader`）和 PDF 阅读器**：Firefox 不允许扩展向这类内部页面注入脚本。请直接在原网页上开启本扩展。
- 不匹配本地 `file://` 页面，只处理 `http://` 和 `https://` 网页。
- 不适用于 Canvas 自绘阅读器、使用 `transform` 模拟滚动的站点。
- 页面在 Shadow DOM 里创建的内部滚动容器可能无法自动识别；大多数普通电子书站点不受影响。
- 翻页按“当前可视高度减去重叠距离”计算，不按网站的分页/章节边界计算。
- 页眉/页脚检测基于屏幕上下边缘的命中测试；宽度不足半屏的浮动按钮或特殊布局的页眉可能不会被识别。
- 双指缩放下的按钮尺寸/位置补偿是尽力适配，极端缩放或浏览器特殊模式下仍可能有偏差。
- 字号调节依赖对页面文字元素写入内联样式，复杂网页可能出现局部排版变化；收起后会恢复原状。动态新增的内容可能需要再操作一次字号按钮才会应用。
- 控件会遮住所在位置的一小块内容，默认放在底部右侧以覆盖网站底栏，可随时拖走。

## 目录

```text
extension/                 扩展源码
  manifest.json
  content.js
  content.css
  icons/
dist/                      构建产物
  eink-page-turner-0.3.0.xpi
  eink-page-turner-0.3.0.zip
  SHA256SUMS.txt
docs/                      README 使用的界面截图
tools/
  run-in-firefox-android.sh
tests/                     桌面 Firefox 自动化测试与测试页
build.sh                   重新打包
LICENSE                    MIT 许可证
```

## 开发与验证

```bash
./build.sh
npx --yes web-ext@10.8.0 lint --source-dir extension --output text
```

桌面 Firefox 自动化测试（需要本机 Firefox、Python 3、Selenium 和 geckodriver）：

```bash
# 先构建出测试使用的 XPI
./build.sh

# 再启动测试页服务器
python3 -m http.server 8765 --bind 127.0.0.1

# 另开终端安装测试依赖并运行
python3 -m venv .venv
.venv/bin/pip install selenium
GECKODRIVER=/path/to/geckodriver .venv/bin/python tests/test_extension.py
```

未设置 `GECKODRIVER` 时，测试会尝试使用 `tools/bin/geckodriver`。

测试覆盖：展开/收起状态、横排与最右下一页、默认右下角、整条拖动、正文字号增减与行高变化、字号收起/展开恢复、位置/字号/状态持久化、重叠步长、固定页眉页脚检测、页尾提示、内部滚动容器、CSP 页面样式隔离。测试截图写入 `tests/artifacts/`，README 展示图位于 `docs/`。

> 维护者提示：`manifest.json` 中的扩展 ID 只是一个稳定标识，不需要域名服务器可访问。首次提交 AMO 签名前应改成自己的域名或 GUID，签名后再修改会导致用户无法平滑升级。发布到 GitHub 时，记得给 Release 附上 XPI、ZIP 和校验文件，并注明 XPI 未签名。

## 隐私

扩展需要访问所有 `http/https` 网页，以便注入控制条、修改滚动和字号。它**不会收集或上传**页面内容、浏览记录或使用数据，也不会发起网络请求；只使用浏览器本地的 `storage` 保存展开状态、按钮坐标和字号比例。清单中已声明 `data_collection_permissions.required = ["none"]`。

## 许可证

本项目使用 [MIT License](LICENSE)。
Copyright (c) 2026 EBookPlugin contributors。
