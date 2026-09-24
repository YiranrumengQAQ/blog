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

/* ---------------- 移动端抽屉：底层滚动穿透治理 ---------------- */

// iOS Safari 对 body { overflow: hidden } 视而不见，穿透滚动要用
// 「body 定位到固定 + 记住滚动位置」的经典方案才能锁住。
// 引用计数：抽屉与文章灯箱共用一把锁，后开的先关也不会误解锁。
let lockCount = 0;
let savedScrollY = 0;

function lockBodyScroll() {
    if (lockCount === 0) {
        savedScrollY = window.scrollY;
        document.body.style.top = (-savedScrollY) + 'px';
        document.body.classList.add('scroll-locked');
    }
    lockCount++;
}

function unlockBodyScroll() {
    if (lockCount <= 0) return;
    lockCount--;
    if (lockCount > 0) return;
    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    // body 固定期间视口可滚高度塌缩为 0，scrollY 会被钳到 0；
    // 而 html 有 scroll-behavior: smooth，两参 scrollTo 会跟随平滑动画，
    // 关抽屉时页面会从顶部"滑"回原位。临时切 auto 原地复位。
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, savedScrollY);
    root.style.scrollBehavior = prevBehavior;
}

    function openMobile(ctx) {
        const { el } = ctx;
        el.sidebar.classList.add('mobile-open');
        el.sidebarOverlay.classList.add('active');
        el.mobileMenuBtn.classList.add('active');
        el.mobileMenuBtn.setAttribute('aria-expanded', 'true');
        lockBodyScroll();
    }

    function closeMobile(ctx) {
        const { el } = ctx;
        el.sidebar.classList.remove('mobile-open');
        el.sidebarOverlay.classList.remove('active');
        el.mobileMenuBtn.classList.remove('active');
        el.mobileMenuBtn.setAttribute('aria-expanded', 'false');
        unlockBodyScroll();
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

        // Esc 关闭抽屉（与灯箱、搜索框的 Esc 行为一致）
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (el.sidebar.classList.contains('mobile-open')) {
                e.stopPropagation();
                closeMobile(ctx);
            }
        });

        // 旋转屏幕 / 拖宽窗口回到桌面布局时，收起抽屉（closeMobile 会连带解锁）。
        // 注意不要在这里直接 unlockBodyScroll：文章灯箱也持有这把引用计数锁，
        // 直接调用会把灯箱的锁误解锁（宽窗口下灯箱后面就能滚动了）。
        window.addEventListener('resize', Blog.utils.debounce(() => {
            if (window.innerWidth > 768 && el.sidebar.classList.contains('mobile-open')) {
                closeMobile(ctx);
            }
        }, 200));
    }

    Blog.ui.sidebar = {
        render, updateActive, init,
        openMobile, closeMobile, toggleMobile,
        // 滚动锁对外开放：文章灯箱（iOS 上 overflow:hidden 锁不住滚动）复用同一把锁
        lockBodyScroll, unlockBodyScroll
    };
})();
