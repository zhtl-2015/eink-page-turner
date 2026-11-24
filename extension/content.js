(() => {
  'use strict';

  const HOST_TAG = 'eink-page-turner';
  const ACTIVE_ATTR = 'data-eink-page-turner-active';
  const STORAGE_KEY = 'enabled';
  const PLACEMENT_KEY = 'placement';
  const FONT_SCALE_KEY = 'fontScale';
  const FONT_SCALE_MIN = 0.8;
  const FONT_SCALE_MAX = 1.8;
  const FONT_SCALE_STEP = 0.1;
  const FONT_MEASURING_ATTR = 'data-eink-page-turner-measuring';
  const ext = typeof browser !== 'undefined' ? browser : globalThis.chrome;

  if (document.querySelector(HOST_TAG)) {
    return;
  }

  let modeEnabled = false;
  let userChangedMode = false;
  let userChangedPosition = false;
  let host = null;
  let shadowRoot = null;
  let panelElement = null;
  let prevButton = null;
  let nextButton = null;
  let toggleButton = null;
  let fontDownButton = null;
  let fontUpButton = null;
  let toast = null;
  let toastTimer = 0;
  let layoutFrame = 0;
  let lastLayoutKey = '';
  let position = null;
  let resolvedPosition = null;
  let resolvedMetrics = null;
  let dragState = null;
  let suppressClickUntil = 0;
  let fontScale = 1;
  let adjustedTextStyles = null;

  const UI_CSS = `
    :host {
      all: initial;
      color-scheme: light;
      --s: var(--eink-s, 1);
      --ui-gap: calc(5px * var(--s));
      --ui-height: calc(40px * var(--s));
      --ui-border: calc(2px * var(--s));
      --ui-radius: calc(7px * var(--s));
      --ui-toggle-width: calc(52px * var(--s));
      --ui-font-width: calc(38px * var(--s));
      --ui-page-width: calc(44px * var(--s));
      --ui-arrow-size: calc(20px * var(--s));
      --ui-toggle-size: calc(13px * var(--s));
      --ui-font-size: calc(15px * var(--s));
      --ui-toast-size: calc(14px * var(--s));
      --ui-toast-offset: calc(8px * var(--s));
    }

    * {
      box-sizing: border-box;
    }

    .panel {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      justify-content: flex-start;
      gap: var(--ui-gap);
      width: max-content;
      pointer-events: auto;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
        "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    button {
      flex: none;
      pointer-events: auto;
      appearance: none;
      -webkit-appearance: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: auto;
      height: var(--ui-height);
      min-height: var(--ui-height);
      margin: 0;
      padding: calc(2px * var(--s)) 0;
      border: var(--ui-border) solid #000;
      border-radius: var(--ui-radius);
      background: #fff;
      color: #000;
      font-family: inherit;
      font-size: var(--ui-font-size);
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0;
      text-align: center;
      text-shadow: none;
      box-shadow: none;
      cursor: pointer;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
      text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
      transition: none !important;
      animation: none !important;
      transform: none;
    }

    button:focus {
      outline: none;
    }

    button:focus-visible {
      outline: calc(3px * var(--s)) solid #000;
      outline-offset: calc(2px * var(--s));
    }

    #toggle {
      width: var(--ui-toggle-width);
      font-size: var(--ui-toggle-size);
    }

    .font-btn {
      width: var(--ui-font-width);
      font-size: var(--ui-font-size);
    }

    .page-btn {
      width: var(--ui-page-width);
      font-size: var(--ui-arrow-size);
      font-weight: 800;
    }

    :host([data-mode="on"]) #toggle {
      background: #000;
      color: #fff;
    }

    :host(.dragging) .panel,
    :host(.dragging) button {
      cursor: grabbing;
    }

    [hidden] {
      display: none !important;
    }

    #toast {
      position: absolute;
      left: 50%;
      bottom: calc(100% + var(--ui-toast-offset));
      top: auto;
      transform: translateX(-50%);
      max-width: calc(220px * var(--s));
      padding: calc(7px * var(--s)) calc(9px * var(--s));
      border: var(--ui-border) solid #000;
      border-radius: calc(6px * var(--s));
      background: #fff;
      color: #000;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
        "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
      font-size: var(--ui-toast-size);
      font-weight: 700;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transition: none !important;
      animation: none !important;
    }

    :host([data-toast-vertical="below"]) #toast {
      top: calc(100% + var(--ui-toast-offset));
      bottom: auto;
    }

    #toast.show {
      opacity: 1;
      visibility: visible;
    }
  `;

  const HOST_STYLES = [
    ['all', 'initial'],
    ['position', 'fixed'],
    ['top', '0'],
    ['left', '0'],
    ['right', 'auto'],
    ['bottom', 'auto'],
    ['transform', 'translate(-1000px, -1000px)'],
    ['transform-origin', '0 0'],
    ['z-index', '2147483647'],
    ['display', 'block'],
    ['width', 'auto'],
    ['height', 'auto'],
    ['min-width', '0'],
    ['min-height', '0'],
    ['max-width', 'none'],
    ['max-height', 'none'],
    ['margin', '0'],
    ['padding', '0'],
    ['border', '0'],
    ['border-radius', '0'],
    ['background', 'transparent'],
    ['box-shadow', 'none'],
    ['opacity', '0'],
    ['visibility', 'visible'],
    ['overflow', 'visible'],
    ['pointer-events', 'none'],
    ['direction', 'ltr'],
    ['text-align', 'initial'],
    ['font-size', '16px'],
    ['line-height', '1.2'],
    ['color-scheme', 'light'],
    ['--eink-s', '1'],
    ['-webkit-text-size-adjust', '100%'],
    ['text-size-adjust', '100%']
  ];

  function createHost() {
    host = document.createElement(HOST_TAG);
    host.setAttribute('data-eink-page-turner', 'root');
    host.setAttribute('data-mode', 'off');

    for (const [property, value] of HOST_STYLES) {
      host.style.setProperty(property, value, 'important');
    }

    shadowRoot = host.attachShadow({ mode: 'open' });

    try {
      if ('adoptedStyleSheets' in shadowRoot && typeof CSSStyleSheet === 'function') {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(UI_CSS);
        shadowRoot.adoptedStyleSheets = [sheet];
      } else {
        throw new Error('adoptedStyleSheets is unavailable');
      }
    } catch (error) {
      const style = document.createElement('style');
      style.textContent = UI_CSS;
      shadowRoot.appendChild(style);
    }

    panelElement = document.createElement('div');
    panelElement.className = 'panel';

    toggleButton = document.createElement('button');
    toggleButton.id = 'toggle';
    toggleButton.type = 'button';
    toggleButton.textContent = '展开';
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.setAttribute('aria-label', '展开翻页控件');
    toggleButton.title = '展开翻页控件';

    fontDownButton = document.createElement('button');
    fontDownButton.id = 'font-down';
    fontDownButton.className = 'font-btn';
    fontDownButton.type = 'button';
    fontDownButton.hidden = true;
    fontDownButton.textContent = 'A−';
    fontDownButton.setAttribute('aria-label', '减小正文字号');
    fontDownButton.title = '减小正文字号';

    fontUpButton = document.createElement('button');
    fontUpButton.id = 'font-up';
    fontUpButton.className = 'font-btn';
    fontUpButton.type = 'button';
    fontUpButton.hidden = true;
    fontUpButton.textContent = 'A+';
    fontUpButton.setAttribute('aria-label', '增大正文字号');
    fontUpButton.title = '增大正文字号';

    prevButton = document.createElement('button');
    prevButton.id = 'prev';
    prevButton.className = 'page-btn';
    prevButton.type = 'button';
    prevButton.hidden = true;
    prevButton.setAttribute('aria-label', '上一页');
    prevButton.title = '上一页';
    prevButton.textContent = '↑';

    nextButton = document.createElement('button');
    nextButton.id = 'next';
    nextButton.className = 'page-btn';
    nextButton.type = 'button';
    nextButton.hidden = true;
    nextButton.setAttribute('aria-label', '下一页');
    nextButton.title = '下一页';
    nextButton.textContent = '↓';

    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    panelElement.append(
      toggleButton,
      fontDownButton,
      fontUpButton,
      prevButton,
      nextButton
    );
    shadowRoot.append(panelElement, toast);
    document.documentElement.appendChild(host);

    for (const button of [
      toggleButton,
      fontDownButton,
      fontUpButton,
      prevButton,
      nextButton
    ]) {
      for (const eventName of ['pointerdown', 'touchstart', 'mousedown']) {
        button.addEventListener(eventName, (event) => event.stopPropagation(), { passive: true });
      }
    }

    prevButton.addEventListener('click', (event) => {
      stopButtonEvent(event);
      turnPage(-1);
    });

    nextButton.addEventListener('click', (event) => {
      stopButtonEvent(event);
      turnPage(1);
    });

    toggleButton.addEventListener('click', (event) => {
      stopButtonEvent(event);
      userChangedMode = true;
      setMode(!modeEnabled, true);
    });

    fontDownButton.addEventListener('click', (event) => {
      stopButtonEvent(event);
      changeFontScale(-1);
    });

    fontUpButton.addEventListener('click', (event) => {
      stopButtonEvent(event);
      changeFontScale(1);
    });

    shadowRoot.addEventListener('pointerdown', onPointerDown, true);
    shadowRoot.addEventListener('click', onShadowClickCapture, true);
    shadowRoot.addEventListener('touchstart', onShadowTouchStart, { capture: true, passive: true });
    shadowRoot.addEventListener('contextmenu', onShadowContextMenu, true);

    installViewportTracking();
    updateLayout(true);
  }

  function stopButtonEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  function onShadowClickCapture(event) {
    if (performance.now() >= suppressClickUntil) {
      return;
    }
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  }

  function isControlTarget(event) {
    return event.composedPath().some((node) => {
      return (
        node instanceof Element &&
        panelElement &&
        (node === panelElement || panelElement.contains(node))
      );
    });
  }

  function onShadowTouchStart(event) {
    if (isControlTarget(event)) {
      event.stopPropagation();
    }
  }

  function onShadowContextMenu(event) {
    if (isControlTarget(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onPointerDown(event) {
    if (event.isPrimary === false) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    if (!isControlTarget(event)) {
      return;
    }

    event.stopPropagation();

    if (!resolvedPosition || !resolvedMetrics) {
      updateLayout(true);
    }
    if (!resolvedPosition || !resolvedMetrics) {
      return;
    }

    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: resolvedPosition.x,
      startY: resolvedPosition.y,
      pageScale: resolvedMetrics.pageScale,
      viewportWidth: resolvedMetrics.viewportPhysicalWidth,
      viewportHeight: resolvedMetrics.viewportPhysicalHeight,
      dragging: false
    };

    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
  }

  function onPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const deltaX = (event.clientX - dragState.startClientX) * dragState.pageScale;
    const deltaY = (event.clientY - dragState.startClientY) * dragState.pageScale;

    if (!dragState.dragging) {
      if (Math.hypot(deltaX, deltaY) < 8) {
        return;
      }
      dragState.dragging = true;
      userChangedPosition = true;
      hideToast();
      host.classList.add('dragging');
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    position = {
      x: dragState.startX + deltaX / dragState.viewportWidth,
      y: dragState.startY + deltaY / dragState.viewportHeight
    };
    updateLayout(true);
  }

  function onPointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const wasDragging = dragState.dragging;

    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerUp, true);

    if (wasDragging) {
      if (resolvedPosition) {
        position = { x: resolvedPosition.x, y: resolvedPosition.y };
      }
      suppressClickUntil = performance.now() + 500;
      const expiry = suppressClickUntil;
      window.setTimeout(() => {
        if (suppressClickUntil === expiry) {
          suppressClickUntil = 0;
        }
      }, 600);
      host.classList.remove('dragging');
      savePosition();
    }

    dragState = null;
  }

  function shouldAdjustForPageScale() {
    try {
      if (/Android/i.test(navigator.userAgent)) {
        return true;
      }
      return (
        window.matchMedia('(pointer: coarse)').matches &&
        getScreenWidthCss() > 0 &&
        getScreenWidthCss() <= 1200
      );
    } catch (error) {
      return false;
    }
  }

  function getScreenWidthCss() {
    const screenObject = window.screen;
    if (!screenObject) {
      return 0;
    }

    const width = Number(screenObject.width) || 0;
    const height = Number(screenObject.height) || 0;
    if (!width || !height) {
      return 0;
    }

    let landscape = false;
    if (screenObject.orientation && typeof screenObject.orientation.type === 'string') {
      landscape = screenObject.orientation.type.startsWith('landscape');
    } else if (typeof window.orientation === 'number') {
      landscape = Math.abs(window.orientation) === 90;
    } else {
      landscape = width > height;
    }

    return landscape ? Math.max(width, height) : Math.min(width, height);
  }

  function getViewportInfo() {
    const documentElement = document.documentElement;
    const layoutWidth = Math.max(
      1,
      (documentElement && documentElement.clientWidth) || window.innerWidth || 1
    );
    const layoutHeight = Math.max(
      1,
      (documentElement && documentElement.clientHeight) || window.innerHeight || 1
    );
    const visualViewport = window.visualViewport;
    const width =
      visualViewport && visualViewport.width > 0
        ? visualViewport.width
        : layoutWidth;
    const height =
      visualViewport && visualViewport.height > 0
        ? visualViewport.height
        : layoutHeight;
    const offsetLeft = visualViewport ? visualViewport.offsetLeft || 0 : 0;
    const offsetTop = visualViewport ? visualViewport.offsetTop || 0 : 0;

    let pageScale = 1;
    if (shouldAdjustForPageScale()) {
      const screenWidth = getScreenWidthCss();
      if (screenWidth > 0) {
        pageScale = screenWidth / width;
        if (!Number.isFinite(pageScale) || pageScale <= 0) {
          pageScale = 1;
        }
        pageScale = Math.min(5, Math.max(0.1, pageScale));
      }
    }

    return {
      visualWidth: width,
      visualHeight: height,
      offsetLeft,
      offsetTop,
      pageScale,
      cssScale: 1 / pageScale,
      viewportPhysicalWidth: width * pageScale,
      viewportPhysicalHeight: height * pageScale
    };
  }

  function clamp(value, minimum, maximum) {
    if (maximum < minimum) {
      return minimum;
    }
    return Math.min(maximum, Math.max(minimum, value));
  }

  function updateLayout(force) {
    if (!host) {
      return;
    }

    const info = getViewportInfo();
    host.style.setProperty('--eink-s', String(info.cssScale), 'important');

    const baseWidth = host.offsetWidth || 0;
    const baseHeight = host.offsetHeight || 0;
    if (!baseWidth || !baseHeight) {
      return;
    }

    const physicalWidth = Math.max(1, baseWidth * info.pageScale);
    const physicalHeight = Math.max(1, baseHeight * info.pageScale);
    const viewportWidth = Math.max(1, info.viewportPhysicalWidth);
    const viewportHeight = Math.max(1, info.viewportPhysicalHeight);
    const marginX = 6;
    const marginY = 6;

    const key = [
      info.pageScale.toFixed(4),
      Math.round(info.visualWidth * 10),
      Math.round(info.visualHeight * 10),
      Math.round(info.offsetLeft * 10),
      Math.round(info.offsetTop * 10),
      Math.round(physicalWidth * 10),
      Math.round(physicalHeight * 10),
      modeEnabled ? 1 : 0,
      fontScale.toFixed(2),
      position ? position.x.toFixed(4) : 'default',
      position ? position.y.toFixed(4) : 'default'
    ].join('|');

    if (!force && key === lastLayoutKey && host.dataset.positioned === 'true') {
      return;
    }

    let x;
    let y;
    if (position) {
      x = position.x;
      y = position.y;
    } else {
      x = (viewportWidth - 16 - physicalWidth / 2) / viewportWidth;
      y = (viewportHeight - 12 - physicalHeight / 2) / viewportHeight;
    }

    const halfWidthX = (physicalWidth / 2 + marginX) / viewportWidth;
    const halfHeightY = (physicalHeight / 2 + marginY) / viewportHeight;
    x = clamp(x, halfWidthX, 1 - halfWidthX);
    y = clamp(y, halfHeightY, 1 - halfHeightY);

    const left = info.offsetLeft + x * info.visualWidth - baseWidth / 2;
    const top = info.offsetTop + y * info.visualHeight - baseHeight / 2;

    host.style.setProperty(
      'transform',
      `translate(${left}px, ${top}px)`,
      'important'
    );
    host.style.setProperty('opacity', '1', 'important');
    host.dataset.positioned = 'true';
    host.setAttribute('data-ui-scale', info.cssScale.toFixed(3));
    host.setAttribute('data-page-scale', info.pageScale.toFixed(3));
    host.setAttribute(
      'data-toast-vertical',
      y < 0.3 ? 'below' : 'above'
    );
    host.setAttribute('data-font-scale', fontScale.toFixed(2));

    resolvedPosition = { x, y };
    resolvedMetrics = {
      pageScale: info.pageScale,
      viewportPhysicalWidth: viewportWidth,
      viewportPhysicalHeight: viewportHeight,
      hostPhysicalWidth: physicalWidth,
      hostPhysicalHeight: physicalHeight
    };
    lastLayoutKey = key;
  }

  function scheduleLayout() {
    if (layoutFrame) {
      return;
    }
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = 0;
      updateLayout(false);
    });
  }

  function installViewportTracking() {
    window.addEventListener('resize', scheduleLayout, { passive: true });
    window.addEventListener('orientationchange', scheduleLayout, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleLayout, { passive: true });
      window.visualViewport.addEventListener('scroll', scheduleLayout, { passive: true });
    }
  }

  function setMode(nextMode, persist) {
    modeEnabled = Boolean(nextMode);

    if (modeEnabled) {
      document.documentElement.setAttribute(ACTIVE_ATTR, 'true');
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      hideToast();
      restorePageFontScaleInstant();
    }

    if (host) {
      host.setAttribute('data-mode', modeEnabled ? 'on' : 'off');
      host.setAttribute('aria-expanded', String(modeEnabled));
    }

    for (const button of [fontDownButton, fontUpButton, prevButton, nextButton]) {
      if (button) {
        button.hidden = !modeEnabled;
      }
    }

    if (toggleButton) {
      toggleButton.textContent = modeEnabled ? '收起' : '展开';
      toggleButton.setAttribute('aria-expanded', String(modeEnabled));
      toggleButton.setAttribute(
        'aria-label',
        modeEnabled ? '收起翻页控件' : '展开翻页控件'
      );
      toggleButton.title = modeEnabled ? '收起翻页控件' : '展开翻页控件';
    }

    if (persist) {
      saveMode();
    }

    updateLayout(true);

    if (modeEnabled) {
      refreshPageFontScale();
    }
  }

  function saveMode() {
    try {
      if (!ext || !ext.storage || !ext.storage.local) {
        return;
      }
      const result = ext.storage.local.set({
        [STORAGE_KEY]: modeEnabled
      });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (error) {
      // 存储不可用时，本页内仍可正常翻页。
    }
  }

  function savePosition() {
    if (!position) {
      return;
    }
    try {
      if (!ext || !ext.storage || !ext.storage.local) {
        return;
      }
      const result = ext.storage.local.set({
        [PLACEMENT_KEY]: {
          x: Number(position.x.toFixed(5)),
          y: Number(position.y.toFixed(5))
        }
      });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (error) {
      // 忽略存储错误，当前页面仍可拖动。
    }
  }

  function saveFontScale() {
    try {
      if (!ext || !ext.storage || !ext.storage.local) {
        return;
      }
      const result = ext.storage.local.set({
        [FONT_SCALE_KEY]: fontScale
      });
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    } catch (error) {
      // 忽略存储错误，本页内字号仍可调整。
    }
  }

  function validPosition(value) {
    return (
      value &&
      typeof value === 'object' &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    );
  }

  async function loadSettings() {
    if (!ext || !ext.storage || !ext.storage.local) {
      return null;
    }

    try {
      const data = await ext.storage.local.get([
        STORAGE_KEY,
        PLACEMENT_KEY,
        FONT_SCALE_KEY
      ]);
      if (!data || typeof data !== 'object') {
        return null;
      }
      const storedFontScale = Number(data[FONT_SCALE_KEY]);
      return {
        enabled: Boolean(data[STORAGE_KEY]),
        position: validPosition(data[PLACEMENT_KEY])
          ? {
              x: clamp(Number(data[PLACEMENT_KEY].x), 0, 1),
              y: clamp(Number(data[PLACEMENT_KEY].y), 0, 1)
            }
          : null,
        fontScale: Number.isFinite(storedFontScale)
          ? clamp(
              Math.round(storedFontScale * 10) / 10,
              FONT_SCALE_MIN,
              FONT_SCALE_MAX
            )
          : 1
      };
    } catch (error) {
      return null;
    }
  }

  function listenForStorageChanges() {
    try {
      if (!ext || !ext.storage || !ext.storage.onChanged) {
        return;
      }
      ext.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') {
          return;
        }
        if (changes[STORAGE_KEY]) {
          const next = Boolean(changes[STORAGE_KEY].newValue);
          if (next !== modeEnabled) {
            setMode(next, false);
          }
        }
        if (changes[PLACEMENT_KEY] && !dragState) {
          const next = validPosition(changes[PLACEMENT_KEY].newValue)
            ? changes[PLACEMENT_KEY].newValue
            : null;
          if (next) {
            position = {
              x: clamp(Number(next.x), 0, 1),
              y: clamp(Number(next.y), 0, 1)
            };
            updateLayout(true);
          }
        }
        if (changes[FONT_SCALE_KEY]) {
          const next = Number(changes[FONT_SCALE_KEY].newValue);
          if (Number.isFinite(next)) {
            const normalized = clamp(
              Math.round(next * 10) / 10,
              FONT_SCALE_MIN,
              FONT_SCALE_MAX
            );
            if (normalized !== fontScale) {
              fontScale = normalized;
              if (modeEnabled) {
                refreshPageFontScale();
              }
            }
          }
        }
      });
    } catch (error) {
      // 旧版本浏览器没有 storage.onChanged 时忽略同步即可。
    }
  }

  const TEXT_SKIP_SELECTOR = [
    'script',
    'style',
    'noscript',
    'template',
    'textarea',
    'input',
    'select',
    'option',
    'button',
    'svg',
    'canvas',
    'video',
    'audio',
    'iframe',
    'object',
    'embed',
    'pre',
    'code',
    'nav',
    '[role="navigation"]',
    '[role="button"]',
    '[aria-hidden="true"]',
    '[contenteditable="true"]'
  ].join(',');

  function restorePageFontScale() {
    if (!adjustedTextStyles) {
      return;
    }

    for (const record of adjustedTextStyles) {
      const { element } = record;
      if (!element || !element.isConnected || !element.style) {
        continue;
      }

      if (record.fontValue) {
        element.style.setProperty('font-size', record.fontValue, record.fontPriority);
      } else {
        element.style.removeProperty('font-size');
      }

      if (record.lineAdjusted) {
        if (record.lineValue) {
          element.style.setProperty('line-height', record.lineValue, record.linePriority);
        } else {
          element.style.removeProperty('line-height');
        }
      }
    }

    adjustedTextStyles = null;
  }

  function restorePageFontScaleInstant() {
    const alreadyMeasuring = document.documentElement.hasAttribute(FONT_MEASURING_ATTR);
    if (!alreadyMeasuring) {
      document.documentElement.setAttribute(FONT_MEASURING_ATTR, 'true');
    }
    try {
      restorePageFontScale();
      if (document.body) {
        void document.body.offsetHeight;
      }
    } finally {
      if (!alreadyMeasuring) {
        document.documentElement.removeAttribute(FONT_MEASURING_ATTR);
      }
    }
  }

  function refreshPageFontScale() {
    document.documentElement.setAttribute(FONT_MEASURING_ATTR, 'true');

    try {
      restorePageFontScale();

      if (!modeEnabled || !document.body || Math.abs(fontScale - 1) < 0.001) {
        return 0;
      }

      // 先恢复原样式并强制一次布局，避免用已经缩放过的字号作为基准。
      void document.body.offsetHeight;

      const elements = new Set();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !/\S/.test(node.nodeValue)) {
              return NodeFilter.FILTER_REJECT;
            }
            const parent = node.parentElement;
            if (!parent || parent.closest(TEXT_SKIP_SELECTOR)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      while (elements.size < 6000) {
        const node = walker.nextNode();
        if (!node) {
          break;
        }
        const parent = node.parentElement;
        if (parent) {
          elements.add(parent);
        }
      }

      const records = [];

      for (const element of elements) {
        if (!element.isConnected || !element.style) {
          continue;
        }

        const computed = window.getComputedStyle(element);
        if (
          computed.display === 'none' ||
          computed.visibility === 'hidden' ||
          Number(computed.opacity || 1) <= 0.01
        ) {
          continue;
        }

        if (computed.position === 'fixed' || computed.position === 'sticky') {
          continue;
        }

        const baseFontSize = Number.parseFloat(computed.fontSize);
        if (!Number.isFinite(baseFontSize) || baseFontSize < 6) {
          continue;
        }

        const baseLineHeight = Number.parseFloat(computed.lineHeight);
        records.push({
          element,
          baseFontSize,
          baseLineHeight,
          fontValue: element.style.getPropertyValue('font-size'),
          fontPriority: element.style.getPropertyPriority('font-size'),
          lineValue: element.style.getPropertyValue('line-height'),
          linePriority: element.style.getPropertyPriority('line-height'),
          lineAdjusted: Number.isFinite(baseLineHeight) && baseLineHeight > 0
        });
      }

      // 所有基准尺寸采集完再统一写入，避免祖先元素先放大后污染后代的计算值。
      for (const record of records) {
        const { element, baseFontSize, baseLineHeight, lineAdjusted } = record;
        element.style.setProperty(
          'font-size',
          `${(baseFontSize * fontScale).toFixed(2)}px`,
          'important'
        );
        if (lineAdjusted) {
          element.style.setProperty(
            'line-height',
            `${(baseLineHeight * fontScale).toFixed(2)}px`,
            'important'
          );
        }
      }

      adjustedTextStyles = records;
      return records.length;
    } finally {
      document.documentElement.removeAttribute(FONT_MEASURING_ATTR);
    }
  }

  function changeFontScale(direction) {
    if (!modeEnabled) {
      return;
    }

    const next = clamp(
      Math.round((fontScale + direction * FONT_SCALE_STEP) * 10) / 10,
      FONT_SCALE_MIN,
      FONT_SCALE_MAX
    );

    if (Math.abs(next - fontScale) < 0.001) {
      showToast(direction > 0 ? '已是最大字号' : '已是最小字号');
      return;
    }

    fontScale = next;
    saveFontScale();
    const adjustedCount = refreshPageFontScale();

    let message = `字号 ${Math.round(fontScale * 100)}%`;
    if (fontScale !== 1 && adjustedCount === 0) {
      message += '（未找到正文）';
    }
    showToast(message);
  }

  function showToast(message) {
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, 1100);
  }

  function hideToast() {
    if (!toast) {
      return;
    }
    toast.classList.remove('show');
    window.clearTimeout(toastTimer);
    toastTimer = 0;
  }

  function getWindowY() {
    if (typeof window.scrollY === 'number') {
      return window.scrollY;
    }
    if (typeof window.pageYOffset === 'number') {
      return window.pageYOffset;
    }
    const scrollingElement = document.scrollingElement || document.documentElement;
    return scrollingElement ? scrollingElement.scrollTop : 0;
  }

  function getWindowScrollInfo() {
    const scrollingElement = document.scrollingElement || document.documentElement;
    if (!scrollingElement) {
      return null;
    }

    const viewport = Math.max(
      1,
      Math.round(scrollingElement.clientHeight || window.innerHeight || 1)
    );
    const max = Math.max(0, scrollingElement.scrollHeight - viewport);

    return {
      isWindow: true,
      element: scrollingElement,
      current: Math.max(0, Math.round(getWindowY())),
      viewport,
      max
    };
  }

  function isScrollableOverflow(value) {
    return value === 'auto' || value === 'scroll' || value === 'overlay';
  }

  function findInnerScrollRoot() {
    if (!document.body) {
      return null;
    }

    const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const viewportArea = viewportWidth * viewportHeight;
    let best = null;

    const consider = (element) => {
      if (!element || !element.isConnected || element === document.documentElement) {
        return;
      }
      if (element.clientWidth < 140 || element.clientHeight < 140) {
        return;
      }

      const max = element.scrollHeight - element.clientHeight;
      if (max < 16) {
        return;
      }

      const computed = window.getComputedStyle(element);
      if (!isScrollableOverflow(computed.overflowY)) {
        return;
      }
      if (computed.display === 'none' || computed.visibility === 'hidden') {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 140 || rect.height < 140) {
        return;
      }

      const intersectWidth = Math.max(
        0,
        Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0)
      );
      const intersectHeight = Math.max(
        0,
        Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
      );
      const visibleArea = intersectWidth * intersectHeight;

      if (visibleArea < viewportArea * 0.12) {
        return;
      }

      const activeBonus = element.scrollTop > 2 ? 1.4 : 1;
      const score =
        visibleArea *
        Math.min(max, viewportHeight * 60) *
        activeBonus;

      if (!best || score > best.score) {
        best = {
          isWindow: false,
          element,
          score,
          current: Math.max(0, Math.round(element.scrollTop)),
          viewport: Math.max(1, Math.round(element.clientHeight)),
          max: Math.max(0, Math.round(max))
        };
      }
    };

    consider(document.body);

    const nodes = document.body.querySelectorAll('*');
    const limit = Math.min(nodes.length, 9000);
    for (let index = 0; index < limit; index += 1) {
      const element = nodes[index];
      if (element.clientWidth < 140 || element.clientHeight < 140) {
        continue;
      }
      if (element.scrollHeight - element.clientHeight < 16) {
        continue;
      }
      consider(element);
    }

    return best;
  }

  function findScrollRoot() {
    const windowInfo = getWindowScrollInfo();

    // 普通网页优先使用窗口滚动，避免误选侧边栏等内部滚动区域。
    if (windowInfo && windowInfo.max > 8) {
      return windowInfo;
    }

    return findInnerScrollRoot() || windowInfo;
  }

  function forceInstantScroll(root, target) {
    const targets = [
      document.documentElement,
      document.body,
      root && root.element
    ];
    const originals = [];
    const seen = new Set();

    for (const element of targets) {
      if (!element || !element.style || seen.has(element)) {
        continue;
      }
      seen.add(element);
      originals.push({
        element,
        value: element.style.getPropertyValue('scroll-behavior'),
        priority: element.style.getPropertyPriority('scroll-behavior')
      });
      try {
        element.style.setProperty('scroll-behavior', 'auto', 'important');
      } catch (error) {
        // 某些特殊元素可能不允许修改样式，忽略即可。
      }
    }

    try {
      if (!root || root.isWindow) {
        const scrollingElement = document.scrollingElement || document.documentElement;
        if (!scrollingElement) {
          return;
        }
        scrollingElement.scrollTop = target;

        if (Math.abs(getWindowY() - target) > 2) {
          window.scrollTo(0, target);
        }
        if (Math.abs(getWindowY() - target) > 2 && document.body) {
          document.body.scrollTop = target;
        }
      } else {
        root.element.scrollTop = target;
      }
    } finally {
      window.requestAnimationFrame(() => {
        for (const original of originals) {
          const { element, value, priority } = original;
          if (!element.isConnected) {
            continue;
          }
          if (
            element.style.getPropertyValue('scroll-behavior') !== 'auto' ||
            element.style.getPropertyPriority('scroll-behavior') !== 'important'
          ) {
            continue;
          }
          if (value) {
            element.style.setProperty('scroll-behavior', value, priority);
          } else {
            element.style.removeProperty('scroll-behavior');
          }
        }
      });
    }
  }

  function getPageViewportRect(root) {
    if (!root || root.isWindow) {
      const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth || 1);
      const height = Math.max(1, document.documentElement.clientHeight || window.innerHeight || 1);
      return {
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
      };
    }

    const rect = root.element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(document.documentElement.clientWidth, rect.right);
    const bottom = Math.min(document.documentElement.clientHeight, rect.bottom);

    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top)
    };
  }

  function findOverlayAncestors(element) {
    const overlays = new Set();
    let node = element;

    while (node && node !== document.documentElement) {
      if (node === host) {
        break;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const computed = window.getComputedStyle(node);
        const positionValue = computed.position;
        if (positionValue === 'fixed' || positionValue === 'sticky') {
          if (
            computed.display !== 'none' &&
            computed.visibility !== 'hidden' &&
            Number(computed.opacity || 1) > 0.01
          ) {
            overlays.add(node);
          }
        }
      }

      const rootNode = typeof node.getRootNode === 'function' ? node.getRootNode() : null;
      node = rootNode && rootNode.host ? rootNode.host : node.parentElement;
    }

    return overlays;
  }

  function unionIntervalHeight(intervals) {
    if (!intervals.length) {
      return 0;
    }

    intervals.sort((a, b) => a[0] - b[0]);

    let total = 0;
    let start = intervals[0][0];
    let end = intervals[0][1];

    for (let index = 1; index < intervals.length; index += 1) {
      const interval = intervals[index];
      if (interval[0] <= end + 1) {
        end = Math.max(end, interval[1]);
      } else {
        total += Math.max(0, end - start);
        start = interval[0];
        end = interval[1];
      }
    }

    total += Math.max(0, end - start);
    return total;
  }

  function detectOverlays(root) {
    const rect = getPageViewportRect(root);
    if (rect.height < 60 || rect.width < 80) {
      return { top: 0, bottom: 0 };
    }

    const top = rect.top + 1;
    const bottom = rect.bottom - 1;
    const xs = [0.25, 0.5, 0.75].map((fraction) => rect.left + rect.width * fraction);
    const overlays = new Set();

    for (const y of [top, bottom]) {
      for (const x of xs) {
        let elements;
        try {
          elements = document.elementsFromPoint(x, y);
        } catch (error) {
          continue;
        }
        for (const element of elements) {
          if (!element || element === host) {
            continue;
          }
          for (const overlay of findOverlayAncestors(element)) {
            overlays.add(overlay);
          }
        }
      }
    }

    const topIntervals = [];
    const bottomIntervals = [];

    for (const overlay of overlays) {
      const overlayRect = overlay.getBoundingClientRect();
      if (
        overlayRect.width < rect.width * 0.5 ||
        overlayRect.height < 4 ||
        overlayRect.height > rect.height * 0.5
      ) {
        continue;
      }

      if (overlayRect.top <= top + 2 && overlayRect.bottom > top + 2) {
        topIntervals.push([
          Math.max(rect.top, overlayRect.top),
          Math.min(rect.bottom, overlayRect.bottom)
        ]);
      }

      if (overlayRect.bottom >= bottom - 2 && overlayRect.top < bottom - 2) {
        bottomIntervals.push([
          Math.max(rect.top, overlayRect.top),
          Math.min(rect.bottom, overlayRect.bottom)
        ]);
      }
    }

    return {
      top: Math.min(
        Math.round(unionIntervalHeight(topIntervals)),
        Math.round(rect.height * 0.5)
      ),
      bottom: Math.min(
        Math.round(unionIntervalHeight(bottomIntervals)),
        Math.round(rect.height * 0.5)
      )
    };
  }

  function computePageOverlap(root, viewport) {
    const baseOverlap = Math.max(24, Math.round(viewport * 0.08));
    const overlays = detectOverlays(root);
    const maximum = Math.round(viewport * 0.6);
    return Math.min(maximum, baseOverlap + overlays.top + overlays.bottom);
  }

  function turnPage(direction) {
    if (!modeEnabled) {
      return;
    }

    const root = findScrollRoot();
    if (!root) {
      return;
    }

    const viewport = Math.max(1, root.viewport);
    const overlap = computePageOverlap(root, viewport);
    const step = Math.max(1, viewport - overlap);
    const max = Math.max(0, root.max);
    const current = Math.min(max, Math.max(0, root.current));
    let target;

    if (host) {
      host.setAttribute('data-page-overlap', String(overlap));
      host.setAttribute('data-page-step', String(step));
    }

    if (direction > 0) {
      target = Math.min(max, current + step);
    } else {
      target = Math.max(0, current - step);
    }

    if (target === current) {
      if (direction > 0) {
        showToast(current >= max - 1 ? '已到页尾' : '页面无法继续滚动');
      } else {
        showToast(current <= 1 ? '已到页首' : '页面无法继续滚动');
      }
      return;
    }

    hideToast();
    forceInstantScroll(root, target);
  }

  function init() {
    if (!document.documentElement || document.querySelector(HOST_TAG)) {
      return;
    }

    createHost();
    setMode(false, false);
    listenForStorageChanges();

    loadSettings().then((stored) => {
      if (!stored) {
        return;
      }
      if (stored.position && !userChangedPosition) {
        position = stored.position;
        updateLayout(true);
      }
      fontScale = stored.fontScale;
      if (!userChangedMode) {
        setMode(stored.enabled, false);
      } else if (modeEnabled) {
        refreshPageFontScale();
      }
    });
  }

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
