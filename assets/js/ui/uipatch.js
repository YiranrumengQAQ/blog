/**
 * ui/uipatch.js — Neo-Brutalism 皮肤补丁的开关
 *
 * 与 assets/css/neo-brutalism.css 配套：
 *   · 补丁默认启用（<html> 上没有 ui-clay 类时，补丁 CSS 生效）；
 *   · 想回到旧黏土 UI：给 <html> 加 ui-clay 类即可撕掉补丁，
 *     旧样式一行没改，原样复活；
 *   · 这里负责渲染右下角的悬浮开关按钮、把选择记进
 *     localStorage（键 blog-ui），并同步移动端地址栏颜色
 *     （theme.js / editor.js 只认黏土配色，需要补丁校准）。
 *
 * 页面不依赖本文件也能正常工作：禁用 JS 时补丁 CSS 依然生效
 * （只是没有开关按钮），功能零耦合。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'blog-ui';

    /* ---------------- 皮肤存取 ---------------- */

    function readSaved() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function isClayNow() {
        return document.documentElement.classList.contains('ui-clay');
    }

    /** 首帧兜底：<head> 内联脚本理论上已经加好类，这里再确认一次
        （比如 bfcache 恢复、或内联脚本被 CSP 拦下的极端情况）。 */
    if (readSaved() === 'clay') {
        document.documentElement.classList.add('ui-clay');
    }

    /* ---------------- meta theme-color 校准 ----------------
       theme.js / editor.js 切换主题时写死的是黏土配色
       （#EDEBFA / #201C2E）；补丁态的地址栏底色不同，这里跟着
       「皮肤 × 亮暗」重新计算。用 MutationObserver 监听
       data-theme 变化，两个页面（两套主题逻辑）都能被覆盖到。 */

    var META_COLORS = {
        clay: { light: '#EDEBFA', dark: '#201C2E' },   /* 旧黏土底色 */
        brutal: { light: '#FAF3E3', dark: '#171512' }  /* 新粗野纸底 */
    };

    function syncMetaColor() {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) return;
        var skin = isClayNow() ? 'clay' : 'brutal';
        var mode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        meta.setAttribute('content', META_COLORS[skin][mode]);
    }

    try {
        new MutationObserver(syncMetaColor).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    } catch (e) { /* 老浏览器没有 Observer 就不同步了，不影响功能 */ }

    /* ---------------- 悬浮开关按钮 ---------------- */

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ui-style-switch';
    btn.id = 'uiStyleSwitch';

    var swatch = document.createElement('span');
    swatch.className = 'ui-style-swatch';
    swatch.setAttribute('aria-hidden', 'true');

    var label = document.createElement('span');
    label.className = 'ui-style-label';

    btn.appendChild(swatch);
    btn.appendChild(label);

    function renderSwitch() {
        var clay = isClayNow();
        label.textContent = clay ? 'CLAY' : 'BRUTAL';
        swatch.classList.toggle('clay-mode', clay);
        btn.setAttribute('aria-pressed', String(clay));
        btn.title = clay
            ? '当前：黏土风（旧 UI）· 点击切换到 Neo-Brutalism / Switch to Neo-Brutalism'
            : '当前：Neo-Brutalism · 点击切换回黏土风（旧 UI）/ Switch to Clay';
        btn.setAttribute('aria-label', btn.title);
    }

    btn.addEventListener('click', function () {
        var clay = document.documentElement.classList.toggle('ui-clay');
        try { localStorage.setItem(STORAGE_KEY, clay ? 'clay' : 'brutal'); } catch (e) { /* 忽略 */ }
        syncMetaColor();
        renderSwitch();
    });

    if (document.body) {
        document.body.appendChild(btn);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            document.body.appendChild(btn);
        });
    }

    renderSwitch();
    syncMetaColor();
})();
