/**
 * core/markdown.js — Markdown 渲染封装
 *
 * 1. 优先使用本地内置的 marked（assets/vendor/marked.min.js），离线可用；
 * 2. 若本地文件缺失，自动回退加载 CDN；
 * 3. 渲染结果用 DOMPurify 消毒，防止文章里误贴的脚本代码被执行；
 *    白名单内的视频站 iframe（B 站 / YouTube 等）会被放行，其余 iframe 一律删除；
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

    /* ---------------- 视频等嵌入内容（iframe）的白名单 ----------------
     * DOMPurify 默认会整个删掉 <iframe>（防 XSS），文章里嵌入的
     * B 站 / YouTube 播放器也会跟着消失。这里放行"可信站点的 iframe"：
     * ADD_TAGS/ADD_ATTR 让 iframe 能存活，再用钩子校验 src——
     * 白名单之外的（含 javascript: 等危险协议、空 src）一律移除。
     */
    const EMBED_HOSTS = [
        'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com',      // YouTube
        'player.vimeo.com',                                               // Vimeo
        'www.bilibili.com', 'player.bilibili.com', 'player.bilibili.tv',  // B 站
        'player.youku.com', 'v.youku.com',                                // 优酷
        'www.dailymotion.com',                                            // Dailymotion
        'music.163.com', 'y.music.163.com',                               // 网易云音乐
        'open.spotify.com'                                                // Spotify
    ];

    function isAllowedEmbedUrl(url) {
        try {
            const u = new URL(String(url || ''), 'https://example.invalid');
            if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
            const host = u.hostname.toLowerCase();
            return EMBED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
        } catch (e) { return false; }
    }

    let purifyHooked = false;
    function hookPurify() {
        if (purifyHooked || !window.DOMPurify || !window.DOMPurify.addHook) return;
        purifyHooked = true;
        window.DOMPurify.addHook('uponSanitizeElement', (node, data) => {
            if (data && data.tagName === 'iframe') {
                if (!isAllowedEmbedUrl(node.getAttribute && node.getAttribute('src'))) {
                    node.remove();
                }
            }
        });
    }

    /** DOMPurify 消毒配置：放行可信 iframe / 任务列表复选框，其余规则保持默认 */
    function sanitize(html) {
        if (!window.DOMPurify) return html; // 极端情况：无消毒库时维持原行为
        hookPurify();
        return window.DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
            // iframe 及其专有属性（默认配置会连 src 一起删掉）
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling',
                'allowpaymentrequest', 'allowpopups', 'referrerpolicy', 'loading', 'target'],
        });
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
                return sanitize(html);
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
