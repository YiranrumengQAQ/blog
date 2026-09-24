/**
 * ui/reader.js — 沉浸阅读模式
 *
 * 开启后（body.reader-mode）：
 *   顶栏收起 / 侧栏收起 / 文章居中放大 / 背景变暗 / 雨幕降低存在感 /
 *   玻璃更干净（模糊与高光减弱），行高与字号上调。
 * 具体外观全部在 glass-rain.css 的 “阅读模式” 段落里，本文件只管状态。
 *
 * 要点：
 *   - 只有文章详情页可用，列表页自动退出；
 *   - 状态记进 Blog.storage（blog-reader-mode），下次进文章自动恢复；
 *   - 雨幕不重启，只是变柔：换文章 ≠ 换世界。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const store = Blog.storage;
    const t = (key, vars) => (Blog.i18n ? Blog.i18n.t(key, vars) : key);
    const icon = (name) => (Blog.ui.icons ? Blog.ui.icons.svg(name) : '');

    let active = false;
    let btn = null;
    let ctxRef = null;

    function ensureButton() {
        if (btn && document.body.contains(btn)) return btn;
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reader-toggle';
        btn.id = 'readerToggle';
        btn.addEventListener('click', () => toggle());
        document.body.appendChild(btn);
        syncButton();
        return btn;
    }

    function syncButton() {
        if (!btn) return;
        btn.innerHTML = icon(active ? 'x' : 'book-open') +
            '<span>' + t(active ? 'reader.exit' : 'reader.enter') + '</span>';
        btn.setAttribute('aria-pressed', String(active));
        btn.setAttribute('title', t(active ? 'reader.exit' : 'reader.enter'));
    }

    function apply(on, opts) {
        opts = opts || {};
        active = !!on;
        document.body.classList.toggle('reader-mode', active);
        document.documentElement.classList.toggle('reader-mode', active);
        syncButton();
        if (store && !opts.silent) store.set(store.KEYS.readerMode, active ? 'on' : 'off');
        // 进入阅读模式时顺手收起移动端侧栏
        if (active && Blog.ui.sidebar && ctxRef) Blog.ui.sidebar.closeMobile(ctxRef);
    }

    function toggle() {
        apply(!active);
        if (Blog.ui.toast) {
            Blog.ui.toast.show(t(active ? 'reader.on' : 'reader.off'), 'info', 1800);
        }
        return active;
    }

    /** 视图切换时调用：列表页强制退出（但不擦掉用户偏好） */
    function syncView(view) {
        if (view === 'detail') {
            ensureButton();
            btn.hidden = false;
            const saved = store ? store.get(store.KEYS.readerMode) : null;
            if (saved === 'on' && !active) apply(true, { silent: true });
        } else {
            if (btn) btn.hidden = true;
            if (active) apply(false, { silent: true });   // 偏好保留，回文章时再恢复
        }
    }

    function init(ctx) {
        ctxRef = ctx;
        ensureButton();
        btn.hidden = true;
        // Esc 退出阅读模式（灯箱打开时让灯箱先处理）
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !active) return;
            const lb = document.getElementById('lightbox');
            if (lb && !lb.hidden) return;
            apply(false);
        });
        document.addEventListener(Blog.i18n ? Blog.i18n.EVENT : 'blog:locale', syncButton);
    }

    Blog.ui.reader = { init, toggle, syncView, isActive: () => active };
})();
