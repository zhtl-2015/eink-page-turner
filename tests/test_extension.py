#!/usr/bin/env python3
"""在桌面 Firefox 中以临时扩展方式验证核心行为。"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parent.parent
XPIS = sorted((ROOT / "dist").glob("eink-page-turner-*.xpi"))
XPI = XPIS[-1] if XPIS else ROOT / "dist" / "eink-page-turner-0.3.1.xpi"
BASE = "http://127.0.0.1:8765/tests"
OUT = ROOT / "tests" / "artifacts"
OUT.mkdir(exist_ok=True)
GECKODRIVER = Path(os.environ.get("GECKODRIVER", ROOT / "tools" / "bin" / "geckodriver"))

failures: list[str] = []


def check(condition: bool, label: str, detail: object = "") -> None:
    if condition:
        print(f"PASS  {label}")
    else:
        print(f"FAIL  {label}  {detail}")
        failures.append(label)


def shadow_element(driver, element_id: str):
    return driver.execute_script(
        """
        const host = document.querySelector('eink-page-turner');
        return host && host.shadowRoot ? host.shadowRoot.getElementById(arguments[0]) : null;
        """,
        element_id,
    )


def state(driver):
    return driver.execute_script(
        """
        const host = document.querySelector('eink-page-turner');
        const sr = host && host.shadowRoot;
        const byId = (id) => (sr ? sr.getElementById(id) : null);
        const rect = host ? host.getBoundingClientRect() : null;
        const info = (el) => (el ? {
          hidden: el.hidden,
          text: el.textContent.trim(),
          rect: (() => {
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
          })()
        } : null);
        return {
          host: !!host,
          rect: rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null,
          mode: host && host.getAttribute('data-mode'),
          active: document.documentElement.getAttribute('data-eink-page-turner-active'),
          toggle: info(byId('toggle')),
          fontDown: info(byId('font-down')),
          fontUp: info(byId('font-up')),
          prev: info(byId('prev')),
          next: info(byId('next')),
          hasDragHandle: !!(sr && sr.querySelector('.drag-handle')),
          step: host && host.getAttribute('data-page-step'),
          overlap: host && host.getAttribute('data-page-overlap'),
          uiScale: host && host.getAttribute('data-ui-scale'),
          pageScale: host && host.getAttribute('data-page-scale'),
          y: window.scrollY,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          vw: window.visualViewport ? window.visualViewport.width : document.documentElement.clientWidth,
          vh: window.visualViewport ? window.visualViewport.height : document.documentElement.clientHeight,
          docClientHeight: document.documentElement.clientHeight,
          max: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight)
        };
        """
    )


def paragraph_style(driver):
    return driver.execute_script(
        """
        const p = document.querySelector('p');
        const s = getComputedStyle(p);
        return {fontSize: parseFloat(s.fontSize), lineHeight: parseFloat(s.lineHeight)};
        """
    )


def click_shadow(driver, element_id: str) -> None:
    element = shadow_element(driver, element_id)
    if element is None:
        raise AssertionError(f"没找到按钮 {element_id}")
    element.click()


def wait_mode(driver, expected: str) -> None:
    WebDriverWait(driver, 5).until(
        lambda d: d.execute_script(
            "const h=document.querySelector('eink-page-turner'); return h && h.getAttribute('data-mode');"
        ) == expected
    )


def wait_injected(driver) -> None:
    WebDriverWait(driver, 5).until(
        lambda d: d.execute_script("return !!document.querySelector('eink-page-turner')")
    )


def ensure_mode(driver, expected: str) -> None:
    if state(driver)["mode"] != expected:
        click_shadow(driver, "toggle")
    wait_mode(driver, expected)


def wait_paragraph_font(driver, expected: float, tolerance: float = 0.3) -> float:
    def actual(d):
        return paragraph_style(d)["fontSize"]

    WebDriverWait(driver, 5).until(lambda d: abs(actual(d) - expected) <= tolerance)
    return actual(driver)


driver = None
try:
    options = Options()
    options.add_argument("-headless")
    options.set_preference("xpinstall.signatures.required", False)
    options.set_preference("extensions.autoDisableScopes", 0)
    options.set_preference("extensions.enabledScopes", 15)
    options.set_preference("browser.startup.homepage_override.mstone", "ignore")
    service = (
        Service(executable_path=str(GECKODRIVER))
        if GECKODRIVER.exists()
        else Service()
    )
    driver = webdriver.Firefox(options=options, service=service)
    driver.set_window_size(390, 844)
    driver.install_addon(str(XPI), temporary=True)
    time.sleep(0.5)

    # 1. 普通窗口滚动页
    driver.get(f"{BASE}/fixture.html")
    wait_injected(driver)
    initial = state(driver)
    check(initial["host"], "扩展注入页面", initial)
    check(initial["mode"] == "off", "默认收起", initial)
    check(initial["toggle"]["text"] == "展开", "收起时显示“展开”", initial["toggle"])
    check(
        initial["fontDown"]["hidden"]
        and initial["fontUp"]["hidden"]
        and initial["prev"]["hidden"]
        and initial["next"]["hidden"],
        "收起时隐藏翻页和字体按钮",
    )
    check(not initial["hasDragHandle"], "不再显示拖动符号")
    check(
        abs(initial["rect"]["width"] - 52) <= 1
        and abs(initial["rect"]["height"] - 40) <= 1,
        "收起后只保留一个紧凑按钮",
        initial["rect"],
    )
    check(
        abs((initial["rect"]["x"] + initial["rect"]["width"]) - (initial["vw"] - 16)) <= 2
        and abs((initial["rect"]["y"] + initial["rect"]["height"]) - (initial["vh"] - 12)) <= 2,
        "默认位于画面右下角",
        initial["rect"],
    )

    before_css = driver.execute_script(
        """
        const card = document.querySelector('.smooth-card');
        const html = getComputedStyle(document.documentElement);
        return {
          transition: getComputedStyle(card).transitionDuration,
          animation: getComputedStyle(document.querySelector('.pulse')).animationDuration,
          iterations: getComputedStyle(document.querySelector('.pulse')).animationIterationCount,
          scrollBehavior: html.scrollBehavior
        };
        """
    )
    check(before_css["transition"].startswith("2s"), "收起时页面过渡保持原样", before_css)
    check(before_css["scrollBehavior"] == "smooth", "收起时 smooth 滚动保持原样", before_css)

    # 收起状态下直接拖动“展开”按钮，不应误展开。
    toggle = shadow_element(driver, "toggle")
    ActionChains(driver).click_and_hold(toggle).move_by_offset(-90, -45).release().perform()
    time.sleep(0.1)
    after_drag = state(driver)
    check(after_drag["mode"] == "off", "拖动收起按钮不会误展开", after_drag["mode"])
    check(
        abs(after_drag["rect"]["x"] - (initial["rect"]["x"] - 90)) <= 3
        and abs(after_drag["rect"]["y"] - (initial["rect"]["y"] - 45)) <= 3,
        "收起后仍然可以拖动",
        {"before": initial["rect"], "after": after_drag["rect"]},
    )
    time.sleep(0.6)

    click_shadow(driver, "toggle")
    wait_mode(driver, "on")
    enabled = state(driver)
    check(enabled["active"] == "true", "展开时写入动画抑制标记", enabled)
    check(enabled["toggle"]["text"] == "收起", "展开后按钮显示“收起”", enabled["toggle"])
    check(
        not enabled["fontDown"]["hidden"]
        and not enabled["fontUp"]["hidden"]
        and not enabled["prev"]["hidden"]
        and not enabled["next"]["hidden"],
        "展开后显示全部按钮",
    )
    check(
        abs(enabled["rect"]["width"] - 236) <= 2
        and abs(enabled["rect"]["height"] - 40) <= 1,
        "展开后为横排布局",
        enabled["rect"],
    )

    visible_buttons = [enabled[key] for key in ("toggle", "fontDown", "fontUp", "prev", "next")]
    tops = [button["rect"]["y"] for button in visible_buttons]
    check(max(tops) - min(tops) <= 1, "所有按钮水平排列", tops)
    check(
        enabled["next"]["rect"]["x"] == max(button["rect"]["x"] for button in visible_buttons),
        "下一页按钮位于最右侧",
        {key: enabled[key]["rect"]["x"] for key in ("toggle", "fontDown", "fontUp", "prev", "next")},
    )
    check(
        abs(enabled["prev"]["rect"]["height"] - 40) <= 1
        and abs(enabled["fontDown"]["rect"]["height"] - 40) <= 1,
        "按钮尺寸仍为紧凑高度",
    )

    after_css = driver.execute_script(
        """
        const card = document.querySelector('.smooth-card');
        const pulse = document.querySelector('.pulse');
        return {
          transition: getComputedStyle(card).transitionDuration,
          animation: getComputedStyle(pulse).animationDuration,
          iterations: getComputedStyle(pulse).animationIterationCount,
          scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
        };
        """
    )
    check(after_css["transition"] == "0.001s", "展开后过渡时长降至 1ms", after_css)
    check(after_css["animation"] == "0.001s", "展开后动画时长降至 1ms", after_css)
    check(after_css["iterations"] == "1", "展开后动画只播放一次", after_css)
    check(after_css["scrollBehavior"] == "auto", "展开后 scroll-behavior 变为 auto", after_css)

    # 字体大小调节
    base_paragraph = paragraph_style(driver)
    base_page_height = driver.execute_script("return document.documentElement.scrollHeight")
    host_before_font = state(driver)["rect"]

    click_shadow(driver, "font-up")
    first_font = wait_paragraph_font(driver, base_paragraph["fontSize"] * 1.1)
    check(first_font > base_paragraph["fontSize"], "A+ 能增大正文字号", {"base": base_paragraph, "now": first_font})
    check(
        driver.execute_script("return document.documentElement.scrollHeight") > base_page_height,
        "字号增大后页面高度随之增加",
    )

    click_shadow(driver, "font-up")
    wait_paragraph_font(driver, base_paragraph["fontSize"] * 1.2)
    scaled_style = paragraph_style(driver)
    check(
        abs(scaled_style["lineHeight"] - base_paragraph["lineHeight"] * 1.2) <= 0.6,
        "行高随字号同步缩放",
        {"base": base_paragraph, "now": scaled_style},
    )
    check(
        abs(state(driver)["rect"]["width"] - host_before_font["width"]) <= 1
        and abs(state(driver)["rect"]["height"] - host_before_font["height"]) <= 1,
        "字体调节不改变控件尺寸",
        {"before": host_before_font, "after": state(driver)["rect"]},
    )
    font_toast = driver.execute_script(
        "return document.querySelector('eink-page-turner').shadowRoot.getElementById('toast').textContent"
    )
    check(font_toast == "字号 120%", "字号变化提示正确", font_toast)

    host_with_font = state(driver)["rect"]
    click_shadow(driver, "toggle")
    wait_mode(driver, "off")
    collapsed = state(driver)
    check(not collapsed["active"], "收起后恢复网页动画", collapsed["active"])
    check(
        abs(paragraph_style(driver)["fontSize"] - base_paragraph["fontSize"]) <= 0.3,
        "收起后恢复网页原字号",
        {"base": base_paragraph, "now": paragraph_style(driver)},
    )
    check(
        abs(collapsed["rect"]["width"] - 52) <= 1,
        "收起后只保留展开按钮",
        collapsed["rect"],
    )
    restored_css = driver.execute_script(
        """
        return {
          transition: getComputedStyle(document.querySelector('.smooth-card')).transitionDuration,
          scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
        };
        """
    )
    check(restored_css["transition"].startswith("2s"), "收起后恢复页面过渡", restored_css)
    check(restored_css["scrollBehavior"] == "smooth", "收起后恢复页面滚动行为", restored_css)
    driver.save_screenshot(str(OUT / "mobile-collapsed.png"))

    click_shadow(driver, "toggle")
    wait_mode(driver, "on")
    wait_paragraph_font(driver, base_paragraph["fontSize"] * 1.2)
    check(
        abs(state(driver)["rect"]["x"] - host_with_font["x"]) <= 2
        and abs(state(driver)["rect"]["y"] - host_with_font["y"]) <= 2,
        "展开后保持拖动位置",
        {"before": host_with_font, "after": state(driver)["rect"]},
    )
    driver.save_screenshot(str(OUT / "mobile-expanded.png"))

    # 翻页与重叠
    start_y = state(driver)["y"]
    click_shadow(driver, "next")
    after_next = state(driver)
    expected_step = int(after_next["step"] or 0)
    expected_overlap = int(after_next["overlap"] or 0)
    check(
        after_next["docClientHeight"] - expected_overlap == expected_step,
        "翻页步长 = 视口高度 - 重叠距离",
        after_next,
    )
    check(
        expected_overlap > 0 and expected_step < after_next["docClientHeight"],
        "翻页保留重叠区域",
        {"step": expected_step, "overlap": expected_overlap},
    )
    check(
        abs((after_next["y"] - start_y) - expected_step) <= 1,
        "下一页按重叠步长滚动",
        {"start": start_y, "after": after_next["y"], "expected": expected_step},
    )
    driver.save_screenshot(str(OUT / "mobile-page-turn.png"))

    for _ in range(40):
        if driver.execute_script("return window.scrollY >= document.documentElement.scrollHeight - innerHeight - 1"):
            break
        click_shadow(driver, "next")
    at_bottom = state(driver)
    check(abs(at_bottom["y"] - at_bottom["max"]) <= 2, "可翻到页面最后一屏", at_bottom)

    click_shadow(driver, "next")
    time.sleep(0.15)
    bottom_toast = driver.execute_script(
        "return document.querySelector('eink-page-turner').shadowRoot.getElementById('toast').textContent"
    )
    check(bottom_toast == "已到页尾", "页尾边界提示正确", bottom_toast)

    click_shadow(driver, "prev")
    after_prev = state(driver)
    prev_step = int(after_prev["step"] or 0)
    check(
        abs((at_bottom["y"] - after_prev["y"]) - prev_step) <= 2,
        "上一页按重叠步长回退",
        {"bottom": at_bottom["y"], "after": after_prev["y"], "step": prev_step},
    )

    # 展开状态、位置、字号跨刷新保留
    expected_position = state(driver)["rect"]
    driver.refresh()
    wait_injected(driver)
    wait_mode(driver, "on")
    wait_paragraph_font(driver, base_paragraph["fontSize"] * 1.2)
    refreshed = state(driver)
    check(refreshed["active"] == "true", "刷新后保持展开状态")
    check(
        abs(refreshed["rect"]["x"] - expected_position["x"]) <= 2
        and abs(refreshed["rect"]["y"] - expected_position["y"]) <= 2,
        "刷新后按钮位置保持",
        {"before": expected_position, "after": refreshed["rect"]},
    )
    check(refreshed["toggle"]["text"] == "收起", "刷新后按钮文案保持")
    check(
        abs(paragraph_style(driver)["fontSize"] - base_paragraph["fontSize"] * 1.2) <= 0.3,
        "刷新后字号设置保持",
    )

    click_shadow(driver, "toggle")
    wait_mode(driver, "off")
    check(not state(driver)["active"], "关闭后移除动画抑制标记")
    check(state(driver)["prev"]["hidden"], "收起后隐藏翻页按钮")
    driver.save_screenshot(str(OUT / "mobile-collapsed-after-refresh.png"))

    # 2. 页面内滚动容器
    driver.get(f"{BASE}/inner-scroller.html")
    wait_injected(driver)
    ensure_mode(driver, "on")
    inner_before = driver.execute_script(
        "const r=document.getElementById('reader'); return {top:r.scrollTop, h:r.clientHeight, max:r.scrollHeight-r.clientHeight};"
    )
    click_shadow(driver, "next")
    inner_state = state(driver)
    inner_after = driver.execute_script(
        "const r=document.getElementById('reader'); return {top:r.scrollTop, y:window.scrollY};"
    )
    inner_step = int(inner_state["step"] or 0)
    check(
        abs(inner_after["top"] - min(inner_before["max"], inner_step)) <= 2,
        "识别页面内部滚动容器并按重叠步长翻页",
        {"before": inner_before, "after": inner_after, "step": inner_step},
    )
    check(inner_after["y"] == 0, "内部容器滚动不会误滚窗口", inner_after)

    # 3. CSP style-src 'none'
    driver.get(f"{BASE}/csp.html")
    wait_injected(driver)
    ensure_mode(driver, "on")
    csp_style = driver.execute_script(
        """
        const host = document.querySelector('eink-page-turner');
        const toggle = host.shadowRoot.getElementById('toggle');
        const next = host.shadowRoot.getElementById('next');
        return {
          toggleWidth: getComputedStyle(toggle).width,
          border: getComputedStyle(toggle).borderTopWidth,
          nextWidth: getComputedStyle(next).width,
          display: getComputedStyle(host).display
        };
        """
    )
    check(
        csp_style["toggleWidth"] == "52px"
        and csp_style["nextWidth"] == "44px"
        and csp_style["border"] == "2px",
        "CSP 页面中阴影样式仍生效",
        csp_style,
    )
    y0 = state(driver)["y"]
    click_shadow(driver, "next")
    y1 = state(driver)["y"]
    check(y1 - y0 > 100, "CSP 页面中翻页仍可用", {"before": y0, "after": y1})
    driver.save_screenshot(str(OUT / "mobile-csp.png"))

    # 4. 固定页眉页脚：自动加大重叠距离
    driver.get(f"{BASE}/overlap.html")
    wait_injected(driver)
    ensure_mode(driver, "on")
    y0 = state(driver)["y"]
    click_shadow(driver, "next")
    overlay_state = state(driver)
    overlay_step = int(overlay_state["step"] or 0)
    overlay_overlap = int(overlay_state["overlap"] or 0)
    check(
        overlay_overlap >= 100,
        "检测到固定页眉页脚并加大重叠距离",
        {"overlap": overlay_overlap, "step": overlay_step},
    )
    check(
        overlay_step <= overlay_state["docClientHeight"] - 100,
        "页眉页脚页面使用更短翻页步长",
        {"step": overlay_step, "viewport": overlay_state["docClientHeight"]},
    )
    check(
        abs((overlay_state["y"] - y0) - overlay_step) <= 1,
        "页眉页脚页面滚动距离与步长一致",
        {"before": y0, "after": overlay_state["y"], "step": overlay_step},
    )
    driver.save_screenshot(str(OUT / "mobile-overlay.png"))

finally:
    if driver is not None:
        driver.quit()

print()
if failures:
    print("失败的检查：", failures)
    sys.exit(1)
print("全部通过")
