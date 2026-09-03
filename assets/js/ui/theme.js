/**
 * ui/theme.js — 亮色 / 暗色主题管理
 * 记住用户选择；首次访问跟随系统偏好；同步移动端状态栏颜色
 *
 * 防闪烁：真正的首帧主题由 index.html / editor.html <head> 里的内联脚本
 * 在渲染前写好（读同一个 localStorage 键 blog-theme）；本文件在这里做
 * 二次确认（meta 颜色同步、系统偏好跟随），两处逻辑必须保持一致。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const STORAGE_KEY = 'blog-theme';

    function getSavedTheme() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function saveTheme(theme) {
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* 忽略 */ }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        saveTheme(theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#141218' : '#FDFBF7');
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function toggleTheme() {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        return next;
    }

    /**
     * 解析应当使用的主题：
     * 1. 用户保存过的偏好（localStorage）优先；
     * 2. 其次 <head> 内联脚本已经算好并写到 <html data-theme> 上的值（防 FOUC）；
     * 3. 最后才看系统偏好。
     */
    function resolveTheme() {
        const saved = getSavedTheme();
        if (saved === 'light' || saved === 'dark') return saved;
        const current = document.documentElement.getAttribute('data-theme');
        if (current === 'dark' || current === 'light') return current;
        try {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    /** 初始化：应用解析出的主题；未做过选择的用户跟随系统偏好实时变化 */
    function initTheme() {
        applyTheme(resolveTheme());

        // 首次访问（没有保存过偏好）时，系统切换深浅色要实时跟进；
        // 一旦用户手动切换过，就只认 localStorage 里的选择。
        try {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const onChange = (e) => {
                if (getSavedTheme() === 'light' || getSavedTheme() === 'dark') return;
                applyTheme(e.matches ? 'dark' : 'light');
            };
            if (mq.addEventListener) mq.addEventListener('change', onChange);
            else if (mq.addListener) mq.addListener(onChange); // 旧 Safari
        } catch (e) { /* 忽略 */ }
    }

    Blog.ui.theme = { initTheme, toggleTheme, applyTheme, currentTheme, resolveTheme };
})();
