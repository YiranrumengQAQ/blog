/**
 * ui/theme.js — 亮色 / 暗色主题管理
 * 记住用户选择；首次访问跟随系统偏好；同步移动端状态栏颜色
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

    /** 初始化：优先用户保存的偏好，其次系统偏好 */
    function initTheme() {
        const saved = getSavedTheme();
        if (saved === 'light' || saved === 'dark') {
            applyTheme(saved);
            return;
        }
        let prefersDark = false;
        try {
            prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch (e) { /* 忽略 */ }
        applyTheme(prefersDark ? 'dark' : 'light');
    }

    Blog.ui.theme = { initTheme, toggleTheme, applyTheme, currentTheme };
})();
