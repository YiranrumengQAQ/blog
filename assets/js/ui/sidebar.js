/**
 * ui/sidebar.js — 侧边栏（分类 / 标签云 / 归档）+ 移动端抽屉
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const { $, $$, escapeHTML, escapeAttr } = Blog.utils;

    function render(ctx) {
        const { el, state } = ctx;
        const tax = ctx.blog.getTaxonomyData();
        const emptyTip = `<span class="sidebar-empty">${escapeHTML(Blog.i18n.t('sidebar.empty'))}</span>`;

        el.sidebarCategories.innerHTML = tax.categories.length
            ? tax.categories.map((c) =>
                `<div class="sidebar-cat-item${state.category === c.name ? ' active' : ''}" data-category="${escapeAttr(c.name)}" role="button" tabindex="0">${escapeHTML(c.name)}<span class="count">${c.count}</span></div>`
            ).join('')
            : emptyTip;

        el.sidebarTags.innerHTML = tax.tags.length
            ? tax.tags.map((t) =>
                `<span class="sidebar-tag${state.tag === t.name ? ' active' : ''}" data-tag="${escapeAttr(t.name)}" role="button" tabindex="0">${escapeHTML(t.name)}<span class="count">${t.count}</span></span>`
            ).join('')
            : emptyTip;

        // a.name 是稳定 key（"2026-05"），显示文字才跟语言走
        el.sidebarArchives.innerHTML = tax.archives.length
            ? tax.archives.map((a) =>
                `<div class="sidebar-archive-item${state.archive === a.name ? ' active' : ''}" data-archive="${escapeAttr(a.name)}" role="button" tabindex="0">${escapeHTML(Blog.i18n.formatMonth(a.name))}<span class="count">${a.count}</span></div>`
            ).join('')
            : emptyTip;
    }

    function updateActive(ctx) {
        const { el, state } = ctx;
        $$('.sidebar-cat-item', el.sidebarCategories).forEach((n) => {
            n.classList.toggle('active', n.dataset.category === (state.category || ''));
        });
        $$('.sidebar-tag', el.sidebarTags).forEach((n) => {
            n.classList.toggle('active', n.dataset.tag === (state.tag || ''));
        });
        $$('.sidebar-archive-item', el.sidebarArchives).forEach((n) => {
            n.classList.toggle('active', n.dataset.archive === (state.archive || ''));
        });
    }

    function openMobile(ctx) {
        const { el } = ctx;
        el.sidebar.classList.add('mobile-open');
        el.sidebarOverlay.classList.add('active');
        el.mobileMenuBtn.classList.add('active');
        el.mobileMenuBtn.setAttribute('aria-expanded', 'true');
    }

    function closeMobile(ctx) {
        const { el } = ctx;
        el.sidebar.classList.remove('mobile-open');
        el.sidebarOverlay.classList.remove('active');
        el.mobileMenuBtn.classList.remove('active');
        el.mobileMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleMobile(ctx) {
        if (ctx.el.sidebar.classList.contains('mobile-open')) closeMobile(ctx);
        else openMobile(ctx);
    }

    /** 初始化：绑定侧边栏点击事件（事件委托，只需绑定一次） */
    function init(ctx) {
        const { el } = ctx;

        const handleFilter = (attr, value) => {
            if (!value) return;
            const patch = { view: 'list', slug: null, page: 1, keyword: '' };
            patch[attr] = (stateCurrentValue(attr) === value) ? null : value;
            // 单一筛选维度：切换时清空其他筛选
            if (attr !== 'category') patch.category = null;
            if (attr !== 'tag') patch.tag = null;
            if (attr !== 'archive') patch.archive = null;
            ctx.actions.setFilters(patch);
            closeMobile(ctx);
        };

        const stateCurrentValue = (attr) => ctx.state[attr];

        el.sidebar.addEventListener('click', (e) => {
            const cat = e.target.closest('.sidebar-cat-item');
            if (cat) return handleFilter('category', cat.dataset.category);
            const tag = e.target.closest('.sidebar-tag');
            if (tag) return handleFilter('tag', tag.dataset.tag);
            const arc = e.target.closest('.sidebar-archive-item');
            if (arc) return handleFilter('archive', arc.dataset.archive);
            if (e.target.closest('#sidebarReset')) {
                ctx.actions.resetFilters();
                closeMobile(ctx);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        // 键盘可访问性
        el.sidebar.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const item = e.target.closest('.sidebar-cat-item, .sidebar-tag, .sidebar-archive-item');
            if (!item) return;
            e.preventDefault();
            item.click();
        });

        el.mobileMenuBtn.addEventListener('click', () => toggleMobile(ctx));
        el.sidebarOverlay.addEventListener('click', () => closeMobile(ctx));
    }

    Blog.ui.sidebar = { render, updateActive, init, openMobile, closeMobile, toggleMobile };
})();
