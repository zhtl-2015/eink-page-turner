(() => {
  'use strict';

  const HOST_TAG = 'eink-page-turner';
  const ACTIVE_ATTR = 'data-eink-page-turner-active';
  const STORAGE_KEY = 'enabled';
  const POSITION_KEY = 'position';
  const ext = typeof browser !== 'undefined' ? browser : globalThis.chrome;

  if (document.querySelector(HOST_TAG)) {
    return;
  }

  let modeEnabled = false;
  let userChangedMode = false;
  let userChangedPosition = false;
  let host = null;
  let shadowRoot = null;
  let prevButton = null;
  let nextButton = null;
  let toggleButton = null;
  let toast = null;
  let toastTimer = 0;
  let layoutFrame = 0;
  let lastLayoutKey = '';
  let position = null;
  let resolvedPosition = null;
  let resolvedMetrics = null;
  let dragState = null;
  let suppressClickUntil = 0;

  const UI_CSS = `
    :host {
      all: initial;
      color-scheme: light;
      --s: var(--eink-s, 1);
      --ui-width: calc(44px * var(--s));
      --ui-gap: calc(5px * var(--s));
      --ui-border: calc(2px * var(--s));
      --ui-radius: calc(7px * var(--s));
      --ui-page-height: calc(40px * var(--s));
      --ui-toggle-height: calc(34px * var(--s));
      --ui-arrow-size: calc(21px * var(--s));
      --ui-toggle-size: calc(14px * var(--s));
      --ui-handle-height: calc(12px * var(--s));
      --ui-handle-bar-width: calc(14px * var(--s));
      --ui-handle-bar-height: calc(7px * var(--s));
      --ui-toast-size: calc(14px * var(--s));
      --ui-toast-offset: calc(8px * var(--s));
    }

    * {
      box-sizing: border-box;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--ui-gap);
      width: var(--ui-width);
      pointer-events: none;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
        "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    .drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: var(--ui-handle-height);
      pointer-events: auto;
      cursor: grab;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }

    .drag-handle::before {
      content: "";
      width: var(--ui-handle-bar-width);
      height: var(--ui-handle-bar-height);
      background: repeating-linear-gradient(
        to bottom,
        #000 0 calc(2px * var(--s)),
        transparent calc(2px * var(--s)) calc(5px * var(--s))
      );
      opacity: 0.68;
    }

    .toolbar {
      display: flex;
      flex-direction: column;
      gap: var(--ui-gap);
      width: 100%;
      pointer-events: none;
    }

    button {
      pointer-events: auto;
      appearance: none;
      -webkit-appearance: none;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: var(--ui-page-height);
      margin: 0;
      padding: calc(2px * var(--s)) 0;
      border: var(--ui-border) solid #000;
      border-radius: var(--ui-radius);
      background: #fff;
      color: #000;
      font-family: inherit;
      font-size: var(--ui-arrow-size);
      font-weight: 800;
      line-height: 1;
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
      min-height: var(--ui-toggle-height);
      font-size: var(--ui-toggle-size);
      font-weight: 700;
      letter-spacing: 0;
    }

    :host([data-mode="on"]) #toggle {
      background: #000;
      color: #fff;
    }

    :host(.dragging) .drag-handle,
    :host(.dragging) button {
      cursor: grabbing;
    }

    [hidden] {
      display: none !important;
    }

    #toast {
      position: absolute;
      top: 50%;
      right: calc(100% + var(--ui-toast-offset));
      left: auto;
      transform: translateY(-50%);
      max-width: calc(180px * var(--s));
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

    :host([data-toast-side="right"]) #toast {
      right: auto;
      left: calc(100% + var(--ui-toast-offset));
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

    const panel = document.createElement('div');
    panel.className = 'panel';

    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.setAttribute('aria-hidden', 'true');
    dragHandle.title = '拖动调整位置';

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    prevButton = document.createElement('button');
    prevButton.id = 'prev';
    prevButton.type = 'button';
    prevButton.hidden = true;
    prevButton.setAttribute('aria-label', '上一页');
    prevButton.title = '上一页';
    prevButton.textContent = '↑';

    nextButton = document.createElement('button');
    nextButton.id = 'next';
    nextButton.type = 'button';
    nextButton.hidden = true;
    nextButton.setAttribute('aria-label', '下一页');
    nextButton.title = '下一页';
    nextButton.textContent = '↓';

    toggleButton = document.createElement('button');
    toggleButton.id = 'toggle';
    toggleButton.type = 'button';
    toggleButton.textContent = '关';
    toggleButton.setAttribute('aria-pressed', 'false');
    toggleButton.setAttribute('aria-label', '开启整页翻页模式');
    toggleButton.title = '开启整页翻页模式';

    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    toolbar.append(prevButton, nextButton, toggleButton);
    panel.append(dragHandle, toolbar);
    shadowRoot.append(panel, toast);
    document.documentElement.appendChild(host);

    for (const button of [prevButton, nextButton, toggleButton]) {
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
        (node.matches('.drag-handle') || node.matches('button'))
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
    const marginX = Math.min(8, viewportWidth * 0.02);
    const marginY = Math.min(6, viewportHeight * 0.02);

    const key = [
      info.pageScale.toFixed(4),
      Math.round(info.visualWidth * 10),
      Math.round(info.visualHeight * 10),
      Math.round(info.offsetLeft * 10),
      Math.round(info.offsetTop * 10),
      Math.round(physicalWidth * 10),
      Math.round(physicalHeight * 10),
      modeEnabled ? 1 : 0,
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
      x = (viewportWidth - physicalWidth - 12) / viewportWidth;
      y = (viewportHeight - physicalHeight) / 2 / viewportHeight;
    }

    const maxX = Math.max(0, 1 - (physicalWidth + marginX) / viewportWidth);
    const maxY = Math.max(0, 1 - (physicalHeight + marginY) / viewportHeight);
    x = clamp(x, marginX / viewportWidth, maxX);
    y = clamp(y, marginY / viewportHeight, maxY);

    const left = info.offsetLeft + x * info.visualWidth;
    const top = info.offsetTop + y * info.visualHeight;

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
      'data-toast-side',
      x + physicalWidth / viewportWidth / 2 > 0.5 ? 'left' : 'right'
    );

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
    }

    if (host) {
      host.setAttribute('data-mode', modeEnabled ? 'on' : 'off');
    }

    if (prevButton) {
      prevButton.hidden = !modeEnabled;
    }

    if (nextButton) {
      nextButton.hidden = !modeEnabled;
    }

    if (toggleButton) {
      toggleButton.textContent = modeEnabled ? '开' : '关';
      toggleButton.setAttribute('aria-pressed', String(modeEnabled));
      toggleButton.setAttribute(
        'aria-label',
        modeEnabled ? '关闭整页翻页模式' : '开启整页翻页模式'
      );
      toggleButton.title = modeEnabled ? '关闭整页翻页模式' : '开启整页翻页模式';
    }

    if (persist) {
      saveMode();
    }

    updateLayout(true);
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
        [POSITION_KEY]: {
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
      const data = await ext.storage.local.get([STORAGE_KEY, POSITION_KEY]);
      if (!data || typeof data !== 'object') {
        return null;
      }
      return {
        enabled: Boolean(data[STORAGE_KEY]),
        position: validPosition(data[POSITION_KEY])
          ? {
              x: clamp(Number(data[POSITION_KEY].x), 0, 1),
              y: clamp(Number(data[POSITION_KEY].y), 0, 1)
            }
          : null
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
        if (changes[POSITION_KEY] && !dragState) {
          const next = validPosition(changes[POSITION_KEY].newValue)
            ? changes[POSITION_KEY].newValue
            : null;
          if (next) {
            position = {
              x: clamp(Number(next.x), 0, 1),
              y: clamp(Number(next.y), 0, 1)
            };
            updateLayout(true);
          }
        }
      });
    } catch (error) {
      // 旧版本浏览器没有 storage.onChanged 时忽略同步即可。
    }
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
      if (!userChangedMode) {
        setMode(stored.enabled, false);
      }
    });
  }

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
