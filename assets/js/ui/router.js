/**
 * ui/router.js — 基于 hash 的轻量路由
 *
 * 路由规则：
 *   #/                    → 文章列表（首页）
 *   #/list?category=x&tag=y&archive=z&search=k&page=n → 筛选后的列表
 *   #/post/<slug>         → 文章详情
 *
 * 关键词搜索使用 replaceState（不污染历史记录），
 * 点击筛选 / 翻页 / 打开文章使用 pushState（支持浏览器前进后退）。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    /** 把当前状态写入地址栏 hash */
    function syncListHash(state, opts) {
        opts = opts || {};
        const parts = [];
        if (state.category) parts.push('category=' + encodeURIComponent(state.category));
        if (state.tag) parts.push('tag=' + encodeURIComponent(state.tag));
        if (state.archive) parts.push('archive=' + encodeURIComponent(state.archive));
        if (state.keyword) parts.push('search=' + encodeURIComponent(state.keyword));
        if (state.page > 1) parts.push('page=' + state.page);
        const hash = parts.length ? '#/list?' + parts.join('&') : '#/';
        if (window.location.hash !== hash) {
            if (opts.replace) history.replaceState(null, '', hash);
            else history.pushState(null, '', hash);
        }
    }

    function syncPostHash(slug) {
        const hash = '#/post/' + encodeURIComponent(slug);
        if (window.location.hash !== hash) {
            history.pushState(null, '', hash);
        }
    }

    /**
     * 从地址栏解析出状态（写入 state 对象）
     * @returns {boolean} 是否解析成功（无法识别的 hash 返回 false 并重置为列表）
     */
    function parseHash(state) {
        const resetToList = () => {
            state.view = 'list';
            state.slug = null;
            state.category = null;
            state.tag = null;
            state.archive = null;
            state.keyword = '';
            state.page = 1;
        };

        const hash = window.location.hash.replace(/^#/, '');
        if (!hash || hash === '/' || hash === '/list') {
            resetToList();
            return true;
        }
        if (hash.startsWith('/post/')) {
            const slug = decodeURIComponent(hash.replace(/^\/post\//, '').split('?')[0]);
            if (slug) {
                state.view = 'detail';
                state.slug = slug;
                return true;
            }
            resetToList();
            return true;
        }
        if (hash.startsWith('/list?')) {
            const params = new URLSearchParams(hash.replace(/^\/list\?/, ''));
            resetToList();
            state.category = params.get('category') || null;
            state.tag = params.get('tag') || null;
            state.archive = params.get('archive') || null;
            state.keyword = params.get('search') || '';
            state.page = Math.max(1, parseInt(params.get('page'), 10) || 1);
            return true;
        }
        resetToList();
        return false;
    }

    Blog.ui.router = { syncListHash, syncPostHash, parseHash };
})();
