/**
 * ui/postlist.js — 文章列表 + 分页
 *
 * 修复的问题：
 * - 卡片日期重复显示两次 → 只显示一次
 * - 每张卡片单独 fetch 全文（N+1 请求）→ 直接使用内核预取的数据
 * - 内联 onerror 处理器（引号嵌套易碎）→ 统一的事件委托处理图片加载失败
 * - 分页越界（URL 里 page 超过总页数）→ 内核自动收敛到最后一页
 * - 搜索结果里的关键词用 <mark class="search-hl"> 高亮（highlightHTML，
 *   先转义后高亮，不做任何绕过 XSS 转义的事）
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const { $, $$, escapeHTML, escapeAttr } = Blog.utils;
    // 文案全部走 i18n：t() 每次调用都取"当前语言"，所以切换语言后重新渲染即可
    const t = (key, vars) => Blog.i18n.t(key, vars);
    // 图标全部走统一的内联 SVG 图标库（不使用 emoji）
    const icon = (name) => Blog.ui.icons.svg(name);

    function titleFor(state) {
        if (state.keyword) return t('list.searchTitle', { keyword: state.keyword });
        if (state.category) return t('list.categoryTitle', { name: state.category });
        if (state.tag) return t('list.tagTitle', { name: state.tag });
        if (state.archive) return t('list.archiveTitle', { name: Blog.i18n.formatMonth(state.archive) });
        return t('list.latest');
    }

    function coverHTML(item, detail) {
        const cover = (detail && detail.coverImage) || item.cover || null;
        if (cover) {
            return `<img src="${escapeAttr(cover)}" alt="${escapeAttr(item.title || '')}" loading="lazy" referrerpolicy="no-referrer">`;
        }
        const fallback = item.title || t('list.fallbackChar');
        return `<div class="card-cover-placeholder">${escapeHTML(fallback.charAt(0))}</div>`;
    }

    /**
     * 搜索关键词高亮：先把整段文本 HTML 转义（防 XSS），
     * 再把「同样转义过的关键词」包上 <mark>。正则特殊字符全部转义，
     * 不区分大小写；关键词里的空白匹配任意连续空白。
     */
    function highlightHTML(text, keyword) {
        const safe = escapeHTML(String(text == null ? '' : text));
        const kw = escapeHTML(String(keyword || '').trim());
        if (!kw) return safe;
        const pattern = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        try {
            return safe.replace(new RegExp('(' + pattern + ')', 'gi'), '<mark class="search-hl">$1</mark>');
        } catch (e) {
            return safe; // 非常规关键词导致正则非法时退回纯转义
        }
    }

    function cardHTML(item, detail, keyword) {
        const summary = (detail && detail.summary) || item.summary || '';
        const readingTime = (detail && detail.readingTime) || item.readingTime || null;
        const tags = item.tags || [];
        const date = Blog.i18n.formatDate(item.date);

        return `
        <article class="post-card${item.sticky ? ' sticky-post' : ''}" data-slug="${escapeAttr(item.slug)}" role="link" tabindex="0" aria-label="${escapeAttr(t('list.readAria', { title: item.title || '' }))}">
          <div class="card-cover">${coverHTML(item, detail)}</div>
          <div class="card-body">
            <div class="card-meta-top">
              ${item.sticky ? `<span class="card-sticky-badge">${escapeHTML(t('list.sticky'))}</span>` : ''}
              ${item.category ? `<span class="card-category">${highlightHTML(item.category, keyword)}</span>` : ''}
              <span>${escapeHTML(date)}</span>
            </div>
            <h2 class="card-title">${highlightHTML(item.title || '', keyword)}</h2>
            ${summary ? `<p class="card-summary">${highlightHTML(summary, keyword)}</p>` : ''}
            ${tags.length ? `<div class="card-tags-row">${tags.map((t) => `<span class="card-tag">${highlightHTML(t, keyword)}</span>`).join('')}</div>` : ''}
            ${readingTime ? `<div class="card-footer-info"><span>${escapeHTML(t('list.readingTime', { n: readingTime }))}</span></div>` : ''}
          </div>
        </article>`;
    }

    function emptyHTML(state, searchEnabled) {
        if (state.keyword) {
            return `
            <div class="empty-state">
              <div class="empty-icon">${icon('search')}</div>
              <h3>${escapeHTML(t('list.emptySearchTitle'))}</h3>
              <p>${escapeHTML(t(searchEnabled ? 'list.emptySearchHintIndexing' : 'list.emptySearchHint'))}</p>
              <div class="empty-actions"><button class="sidebar-reset" data-empty-action="reset">${escapeHTML(t('list.emptySearchAction'))}</button></div>
            </div>`;
        }
        return `
        <div class="empty-state">
          <div class="empty-icon">${icon('file-text')}</div>
          <h3>${escapeHTML(t('list.emptyTitle'))}</h3>
          <p>${escapeHTML(t('list.emptyHint'))}</p>
          <div class="empty-actions">
            <button class="sidebar-reset" data-empty-action="editor">${icon('feather')}<span>${escapeHTML(t('list.emptyEditor'))}</span></button>
            <button class="sidebar-reset" data-empty-action="reset">${escapeHTML(t('list.emptyShowAll'))}</button>
          </div>
        </div>`;
    }

    function errorHTML() {
        return `
        <div class="empty-state">
          <div class="empty-icon">${icon('alert-triangle')}</div>
          <h3>${escapeHTML(t('list.errorTitle'))}</h3>
          <p>${escapeHTML(t('list.errorHint'))}</p>
          <div class="empty-actions"><button class="sidebar-reset" data-empty-action="retry">${escapeHTML(t('list.retry'))}</button></div>
        </div>`;
    }

    function renderPagination(ctx, pg) {
        const { el, state } = ctx;
        if (pg.totalPages <= 1) {
            el.pagination.innerHTML = '';
            return;
        }
        let html = `<button class="page-btn" ${pg.hasPrev ? '' : 'disabled'} data-page="${pg.currentPage - 1}" aria-label="${escapeAttr(t('list.prevPage'))}">&lsaquo;</button>`;

        const maxVisible = 5;
        let startPage = Math.max(1, pg.currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(pg.totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span class="page-ellipsis">&hellip;</span>`;
        }
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn${i === pg.currentPage ? ' active' : ''}" data-page="${i}" aria-current="${i === pg.currentPage ? 'page' : 'false'}">${i}</button>`;
        }
        if (endPage < pg.totalPages) {
            if (endPage < pg.totalPages - 1) html += `<span class="page-ellipsis">&hellip;</span>`;
            html += `<button class="page-btn" data-page="${pg.totalPages}">${pg.totalPages}</button>`;
        }
        html += `<button class="page-btn" ${pg.hasNext ? '' : 'disabled'} data-page="${pg.currentPage + 1}" aria-label="${escapeAttr(t('list.nextPage'))}">&rsaquo;</button>`;
        el.pagination.innerHTML = html;
        void state;
    }

    /** 渲染列表视图（数据都在本地，渲染是同步的，无需骨架屏） */
    function render(ctx) {
        const { blog, state, el } = ctx;
        try {
            el.contentHeader.hidden = false;
            el.contentTitle.textContent = titleFor(state);
            el.pagination.innerHTML = '';

            const qr = blog.queryPosts({
                category: state.category,
                tag: state.tag,
                archive: state.archive,
                keyword: state.keyword,
                page: state.page,
                perPage: state.perPage
            });

            el.resultCount.textContent = t('list.resultCount', { n: qr.pagination.totalItems });

            if (qr.items.length === 0) {
                el.contentBody.innerHTML = emptyHTML(state, true);
                renderPagination(ctx, qr.pagination);
                return;
            }

            const cards = qr.items.map((item) =>
                cardHTML(item, blog.getCachedDetail(item.slug), state.keyword)
            ).join('');
            el.contentBody.innerHTML = `<div class="posts-list">${cards}</div>`;
            renderPagination(ctx, qr.pagination);
        } catch (err) {
            console.error('[postlist] 渲染失败:', err);
            el.contentBody.innerHTML = errorHTML();
        }
    }

    /** 初始化：事件委托（卡片点击 / 键盘 / 分页 / 空状态按钮 / 图片加载失败） */
    function init(ctx) {
        const { el } = ctx;

        el.contentBody.addEventListener('click', (e) => {
            const card = e.target.closest('.post-card');
            if (card) {
                // 点击卡片内部的标签/分类不打开文章
                if (e.target.closest('.card-tag, .card-category, a')) return;
                const slug = card.dataset.slug;
                if (slug) ctx.actions.navigateToPost(slug);
                return;
            }
            const pageBtn = e.target.closest('.page-btn');
            if (pageBtn && !pageBtn.disabled && !pageBtn.classList.contains('active')) {
                const p = parseInt(pageBtn.dataset.page, 10);
                if (!isNaN(p) && p !== ctx.state.page) {
                    ctx.state.page = p;
                    Blog.ui.router.syncListHash(ctx.state);
                    render(ctx);
                    el.contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                return;
            }
            const emptyBtn = e.target.closest('[data-empty-action]');
            if (emptyBtn) {
                const action = emptyBtn.dataset.emptyAction;
                if (action === 'reset') ctx.actions.resetFilters();
                else if (action === 'editor') window.location.href = 'editor.html';
                else if (action === 'retry') ctx.actions.reload();
            }
        });

        el.contentBody.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const card = e.target.closest('.post-card');
            if (!card) return;
            e.preventDefault();
            const slug = card.dataset.slug;
            if (slug) ctx.actions.navigateToPost(slug);
        });

        // 图片加载失败 → 优雅降级为首字占位图（事件捕获，统一处理）
        el.contentBody.addEventListener('error', (e) => {
            const img = e.target;
            if (!(img instanceof HTMLImageElement)) return;
            const coverBox = img.closest('.card-cover');
            if (coverBox) {
                const card = img.closest('.post-card');
                const title = (card && card.querySelector('.card-title')?.textContent) || '';
                coverBox.innerHTML = `<div class="card-cover-placeholder">${escapeHTML(title.charAt(0) || t('list.fallbackChar'))}</div>`;
            }
        }, true);
    }

    Blog.ui.postlist = { render, init, titleFor };
})();
