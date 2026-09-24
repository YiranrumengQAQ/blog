/**
 * ui/shortcuts.js — 全站键盘体系
 *
 *   Ctrl/⌘ + K   聚焦搜索        （search.js 内也有一份，这里只做兜底与统一提示）
 *   /            聚焦搜索
 *   T            切换亮/暗主题
 *   R            开关雨效（rain.js 自己监听，这里只登记进帮助面板）
 *   F            阅读模式（文章页）
 *   G 然后 H     回首页
 *   G 然后 T     回到顶部
 *   Esc          关闭灯箱 / 侧栏 / 阅读模式 / 帮助
 *   ?            显示快捷键帮助
 *
 * 铁律：在 input / textarea / select / contenteditable 里，
 * 除了 Ctrl+K 与 Esc，其余单键快捷键一律不触发。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const t = (key, vars) => (Blog.i18n ? Blog.i18n.t(key, vars) : key);

    function isTyping(target) {
        const el = target || document.activeElement;
        if (!el) return false;
        const tag = (el.tagName || '').toUpperCase();
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
    }

    /* ---------------- 帮助面板 ---------------- */

    let helpEl = null;

    const ROWS = [
        ['Ctrl / ⌘ + K', 'shortcuts.search'],
        ['/', 'shortcuts.search'],
        ['T', 'shortcuts.theme'],
        ['R', 'shortcuts.rain'],
        ['F', 'shortcuts.reader'],
        ['G H', 'shortcuts.home'],
        ['G T', 'shortcuts.top'],
        ['Esc', 'shortcuts.close'],
        ['?', 'shortcuts.help']
    ];

    function buildHelp() {
        if (helpEl && document.body.contains(helpEl)) return helpEl;
        helpEl = document.createElement('div');
        helpEl.className = 'shortcut-help';
        helpEl.hidden = true;
        helpEl.setAttribute('role', 'dialog');
        helpEl.setAttribute('aria-modal', 'true');
        helpEl.innerHTML =
            '<div class="shortcut-help-card">' +
            '<h3>' + t('shortcuts.title') + '</h3>' +
            '<ul>' + ROWS.map((r) =>
                '<li><kbd>' + r[0] + '</kbd><span>' + t(r[1]) + '</span></li>'
            ).join('') + '</ul>' +
            '<p class="shortcut-help-tip">' + t('shortcuts.tip') + '</p>' +
            '</div>';
        helpEl.addEventListener('click', (e) => { if (e.target === helpEl) hideHelp(); });
        document.body.appendChild(helpEl);
        return helpEl;
    }

    function showHelp() { buildHelp().hidden = false; }
    function hideHelp() { if (helpEl) helpEl.hidden = true; }
    function helpOpen() { return !!helpEl && !helpEl.hidden; }

    /* ---------------- 绑定 ---------------- */

    let gPending = 0;   // 「G 然后 X」的等待截止时间

    function init(ctx) {
        // 切语言后面板文案要跟着变：直接丢掉重建，下次呼出就是新语言
        if (Blog.i18n) {
            document.addEventListener(Blog.i18n.EVENT, () => {
                const wasOpen = helpOpen();
                if (helpEl && helpEl.parentNode) helpEl.parentNode.removeChild(helpEl);
                helpEl = null;
                if (wasOpen) showHelp();
            });
        }

        document.addEventListener('keydown', (e) => {
            const typing = isTyping(e.target);

            // Ctrl/⌘ + K：任何地方都能召唤搜索
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                const input = document.getElementById('searchInput');
                if (input) { input.focus(); input.select(); }
                return;
            }

            if (e.key === 'Escape') {
                if (helpOpen()) { hideHelp(); return; }
                return; // 灯箱 / 侧栏 / 搜索各自已有 Esc 处理，不在这里抢
            }

            if (typing || e.ctrlKey || e.metaKey || e.altKey) return;

            // G 前缀序列
            if (Date.now() < gPending) {
                gPending = 0;
                if (e.key === 'h' || e.key === 'H') {
                    e.preventDefault();
                    if (ctx && ctx.actions) ctx.actions.resetFilters();
                    return;
                }
                if (e.key === 't' || e.key === 'T') {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
            }
            if (e.key === 'g' || e.key === 'G') { gPending = Date.now() + 1200; return; }

            switch (e.key) {
                case 't': case 'T':
                    e.preventDefault();
                    if (Blog.ui.theme) Blog.ui.theme.toggleTheme();
                    break;
                case 'f': case 'F':
                    if (Blog.ui.reader) { e.preventDefault(); Blog.ui.reader.toggle(); }
                    break;
                case '?':
                    e.preventDefault();
                    helpOpen() ? hideHelp() : showHelp();
                    break;
                default:
                    break;
            }
        });
    }

    Blog.ui.shortcuts = { init, showHelp, hideHelp, isTyping };
})();
