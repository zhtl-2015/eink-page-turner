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
XPI = XPIS[-1] if XPIS else ROOT / "dist" / "eink-page-turner-0.2.0.xpi"
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


def shadow_button(driver, bid: str):
    return driver.execute_script(
        """
        const host = document.querySelector('eink-page-turner');
        return host && host.shadowRoot ? host.shadowRoot.getElementById(arguments[0]) : null;
        """,
        bid,
    )


def state(driver):
    return driver.execute_script(
        """
        const host = document.querySelector('eink-page-turner');
        const prev = host && host.shadowRoot && host.shadowRoot.getElementById('prev');
        const next = host && host.shadowRoot && host.shadowRoot.getElementById('next');
        const toggle = host && host.shadowRoot && host.shadowRoot.getElementById('toggle');
        const rect = host ? host.getBoundingClientRect() : null;
        return {
          host: !!host,
          rect: rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null,
          mode: host && host.getAttribute('data-mode'),
          active: document.documentElement.getAttribute('data-eink-page-turner-active'),
          prevHidden: prev ? prev.hidden : null,
          nextHidden: next ? next.hidden : null,
          toggleText: toggle ? toggle.textContent : null,
          prevText: prev ? prev.textContent : null,
          nextText: next ? next.textContent : null,
          step: host && host.getAttribute('data-page-step'),
          overlap: host && host.getAttribute('data-page-overlap'),
          uiScale: host && host.getAttribute('data-ui-scale'),
          pageScale: host && host.getAttribute('data-page-scale'),
          y: window.scrollY,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          docClientHeight: document.documentElement.clientHeight,
          max: Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight)
        };
        """
    )


def ui_geometry(driver):
    return driver.execute_script(
        """
        const host = document.querySelector('eink-page-turner');
        const sr = host.shadowRoot;
        const info = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            width: rect.width,
            height: rect.height,
            fontSize: style.fontSize,
            text: el.textContent.trim()
          };
        };
        return {
          host: info(host),
          prev: info(sr.getElementById('prev')),
          next: info(sr.getElementById('next')),
          toggle: info(sr.getElementById('toggle'))
        };
        """
    )


def click_shadow(driver, bid: str) -> None:
    button = shadow_button(driver, bid)
    if button is None:
        raise AssertionError(f"没找到按钮 {bid}")
    button.click()


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
    check(initial["mode"] == "off", "默认关闭翻页模式", initial)
    check(initial["prevHidden"] is True and initial["nextHidden"] is True, "关闭时不显示翻页按钮")
    check(abs(initial["rect"]["width"] - 44) <= 1, "控件宽度固定为 44px", initial["rect"])
    check(abs(initial["rect"]["height"] - 51) <= 1, "关闭时控件为紧凑高度", initial["rect"])

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
    check(before_css["transition"].startswith("2s"), "关闭时页面过渡保持原样", before_css)
    check(before_css["scrollBehavior"] == "smooth", "关闭时 smooth 滚动保持原样", before_css)

    # 先验证拖动：拖动开关按钮本身不应误触开关，也不应改变模式。
    before_drag = state(driver)
    toggle = shadow_button(driver, "toggle")
    ActionChains(driver).click_and_hold(toggle).move_by_offset(-90, 45).release().perform()
    time.sleep(0.1)
    after_drag = state(driver)
    check(after_drag["mode"] == "off", "拖动按钮不会误触开关", after_drag["mode"])
    check(
        abs(after_drag["rect"]["x"] - (before_drag["rect"]["x"] - 90)) <= 3
        and abs(after_drag["rect"]["y"] - (before_drag["rect"]["y"] + 45)) <= 3,
        "按钮可以拖动到新位置",
        {"before": before_drag["rect"], "after": after_drag["rect"]},
    )
    check(
        after_drag["rect"]["x"] >= 0
        and after_drag["rect"]["y"] >= 0
        and after_drag["rect"]["x"] + after_drag["rect"]["width"] <= after_drag["innerWidth"]
        and after_drag["rect"]["y"] + after_drag["rect"]["height"] <= after_drag["innerHeight"],
        "拖动后控件仍在屏幕内",
        after_drag["rect"],
    )
    time.sleep(0.6)

    click_shadow(driver, "toggle")
    wait_mode(driver, "on")
    enabled = state(driver)
    check(enabled["active"] == "true", "开启时写入动画抑制标记", enabled)
    check(enabled["prevHidden"] is False and enabled["nextHidden"] is False, "开启时显示上下页按钮")
    check(enabled["toggleText"] == "开", "开启时开关显示“开”", enabled["toggleText"])
    check(enabled["prevText"] == "↑" and enabled["nextText"] == "↓", "上下页按钮只显示箭头")

    geometry = ui_geometry(driver)
    check(abs(geometry["host"]["width"] - 44) <= 1, "开启后控件宽度仍为 44px", geometry["host"])
    check(
        abs(geometry["prev"]["height"] - 40) <= 1
        and abs(geometry["next"]["height"] - 40) <= 1
        and abs(geometry["toggle"]["height"] - 34) <= 1,
        "按钮尺寸紧凑",
        geometry,
    )
    check(
        geometry["prev"]["fontSize"] == "21px"
        and geometry["next"]["fontSize"] == "21px"
        and geometry["toggle"]["fontSize"] == "14px",
        "箭头与开关字号固定",
        geometry,
    )

    after_css = driver.execute_script(
        """
        const card = document.querySelector('.smooth-card');
        const pulse = document.querySelector('.pulse');
        return {
          transition: getComputedStyle(card).transitionDuration,
          animation: getComputedStyle(pulse).animationDuration,
          iterations: getComputedStyle(pulse).animationIterationCount,
          scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
          hostDisplay: getComputedStyle(document.querySelector('eink-page-turner')).display
        };
        """
    )
    check(after_css["transition"] == "0.001s", "开启后过渡时长降至 1ms", after_css)
    check(after_css["animation"] == "0.001s", "开启后动画时长降至 1ms", after_css)
    check(after_css["iterations"] == "1", "开启后动画只播放一次", after_css)
    check(after_css["scrollBehavior"] == "auto", "开启后 scroll-behavior 变为 auto", after_css)
    check(after_css["hostDisplay"] == "block", "悬浮控件显示", after_css)
    driver.save_screenshot(str(OUT / "mobile-enabled-top.png"))

    # 页面文字变大时，控件物理尺寸不应跟着改变。
    driver.execute_script(
        """
        const style = document.createElement('style');
        style.id = 'test-page-font-size';
        style.textContent = 'html, body { font-size: 40px !important; }';
        document.documentElement.appendChild(style);
        """
    )
    time.sleep(0.1)
    geometry_after_font = ui_geometry(driver)
    check(
        abs(geometry_after_font["host"]["width"] - 44) <= 1
        and abs(geometry_after_font["prev"]["height"] - 40) <= 1,
        "页面字号变化不影响控件尺寸",
        geometry_after_font,
    )
    driver.execute_script("document.getElementById('test-page-font-size')?.remove();")

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
    check(after_next["y"] > 0, "下一页确实滚动了")
    driver.save_screenshot(str(OUT / "mobile-enabled.png"))

    # 连续翻到页尾
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

    # 开启状态与拖动位置跨刷新保留
    expected_position = state(driver)["rect"]
    driver.refresh()
    wait_injected(driver)
    wait_mode(driver, "on")
    refreshed = state(driver)
    check(refreshed["active"] == "true", "刷新后翻页模式保持开启")
    check(
        abs(refreshed["rect"]["x"] - expected_position["x"]) <= 2
        and abs(refreshed["rect"]["y"] - expected_position["y"]) <= 2,
        "刷新后按钮位置保持",
        {"before": expected_position, "after": refreshed["rect"]},
    )

    click_shadow(driver, "toggle")
    wait_mode(driver, "off")
    disabled = state(driver)
    check(disabled["active"] is None, "关闭后移除动画抑制标记", disabled)
    restored_css = driver.execute_script(
        """
        return {
          transition: getComputedStyle(document.querySelector('.smooth-card')).transitionDuration,
          scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
        };
        """
    )
    check(restored_css["transition"].startswith("2s"), "关闭后恢复页面过渡", restored_css)
    check(restored_css["scrollBehavior"] == "smooth", "关闭后恢复页面滚动行为", restored_css)
    check(disabled["prevHidden"] is True, "关闭后隐藏翻页按钮", disabled)
    check(disabled["toggleText"] == "关", "关闭时开关显示“关”", disabled["toggleText"])
    driver.save_screenshot(str(OUT / "mobile-disabled.png"))

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
        return {
          width: getComputedStyle(toggle).width,
          border: getComputedStyle(toggle).borderTopWidth,
          display: getComputedStyle(host).display
        };
        """
    )
    check(
        csp_style["width"] == "44px" and csp_style["border"] == "2px",
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
