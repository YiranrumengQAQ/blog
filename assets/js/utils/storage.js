/**
 * utils/storage.js — 全站统一的本地存储入口（Blog.storage）
 *
 * 为什么要收口：
 *   theme.js / rain.js / i18n.js / editor.js 各自 try/catch 访问 localStorage 时，
 *   一旦隐私模式或配额爆了，各模块会各自回退到自己的默认值，
 *   最后组合出一个「主题是暗的、雨是开的、语言是中文的」不一致状态。
 *   这里统一探测可用性、统一异常策略，并在不可用时退化成内存存储，
 *   保证「同一次会话内」状态始终连续。
 *
 * 命名空间：所有键都以 blog- 开头，见 KEYS。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});

    /** 全站键名表：新增状态请写在这里，避免到处散落魔法字符串 */
    const KEYS = {
        theme: 'blog-theme',
        rain: 'blog-rain',
        locale: 'blog-locale',
        listState: 'blog-list-state',     // 列表筛选 + 滚动位置
        readPos: 'blog-read-pos',         // { slug: ratio }
        recent: 'blog-recent-posts',      // 最近阅读 slug 列表
        readerMode: 'blog-reader-mode',
        editorDraft: 'blog-editor-draft-v1'
    };

    let backend = null;       // 真实 localStorage 或 null
    const memory = new Map(); // 不可用时的会话内兜底

    try {
        const probe = '__blog_probe__';
        window.localStorage.setItem(probe, '1');
        window.localStorage.removeItem(probe);
        backend = window.localStorage;
    } catch (e) {
        backend = null;       // 隐私模式 / 被禁用 / file:// 限制
    }

    function get(key, fallback) {
        try {
            const v = backend ? backend.getItem(key) : (memory.has(key) ? memory.get(key) : null);
            return v === null || v === undefined ? (fallback === undefined ? null : fallback) : v;
        } catch (e) {
            return fallback === undefined ? null : fallback;
        }
    }

    function set(key, value) {
        const v = String(value);
        try {
            if (backend) backend.setItem(key, v);
            else memory.set(key, v);
            return true;
        } catch (e) {
            // 配额满：退到内存，至少本次会话内状态是连续的
            memory.set(key, v);
            return false;
        }
    }

    function remove(key) {
        try { if (backend) backend.removeItem(key); } catch (e) { /* 忽略 */ }
        memory.delete(key);
    }

    /** JSON 读：坏数据自动丢弃并清理，绝不让一条脏记录卡死整个功能 */
    function getJSON(key, fallback) {
        const raw = get(key, null);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (e) {
            remove(key);
            return fallback;
        }
    }

    function setJSON(key, value) {
        try { return set(key, JSON.stringify(value)); }
        catch (e) { return false; }
    }

    Blog.storage = {
        KEYS,
        get, set, remove, getJSON, setJSON,
        available: () => !!backend
    };
})();
