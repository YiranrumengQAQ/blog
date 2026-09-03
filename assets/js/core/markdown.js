/**
 * core/markdown.js — Markdown 渲染封装
 *
 * 1. 优先使用本地内置的 marked（assets/vendor/marked.min.js），离线可用；
 * 2. 若本地文件缺失，自动回退加载 CDN；
 * 3. 渲染结果用 DOMPurify 消毒，防止文章里误贴的脚本代码被执行；
 * 4. 极端情况下（marked 完全不可用）降级为纯文本段落渲染，保证不白屏。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.core = Blog.core || {};

    const CDN_FALLBACK = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';

    /** 尝试从 CDN 补加载 marked（本地文件丢失时的兜底） */
    function ensureMarked(onReady) {
        if (window.marked && typeof window.marked.parse === 'function') return true;
        if (ensureMarked._tried) return false;
        ensureMarked._tried = true;
        const s = document.createElement('script');
        s.src = CDN_FALLBACK;
        s.onload = () => onReady && onReady();
        document.head.appendChild(s);
        return false;
    }

    /** 降级渲染：转义后按空行分段 */
    function fallbackRender(src) {
        const esc = Blog.utils.escapeHTML(String(src || ''));
        return '<p>' + esc.split(/\n{2,}/).join('</p><p>').replace(/\n/g, '<br>') + '</p>';
    }

    /**
     * 渲染 Markdown 为安全 HTML
     * @param {string} src Markdown 源文本
     */
    function renderMarkdown(src) {
        const raw = String(src || '');
        try {
            if (window.marked && typeof window.marked.parse === 'function') {
                const html = window.marked.parse(raw, { gfm: true, breaks: true, async: false });
                if (window.DOMPurify) {
                    return window.DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
                }
                return html;
            }
        } catch (e) {
            console.warn('[markdown] 渲染失败，使用降级方案:', e);
        }
        ensureMarked();
        return fallbackRender(raw);
    }

    /** 渲染 markdown 的轻量版（供写作助手预览用） */
    function renderPreview(src) {
        return renderMarkdown(src);
    }

    Blog.core.renderMarkdown = renderMarkdown;
    Blog.core.renderPreview = renderPreview;
    Blog.core.ensureMarked = ensureMarked;
})();
