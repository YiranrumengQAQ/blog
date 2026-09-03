/**
 * ui/search.js — 搜索模块
 *
 * 修复 bug：旧版在文章页按 Esc 清空搜索时会连带退出文章
 * （事件冒泡到 document 触发了两次处理），现在在输入框内按 Esc
 * 只处理搜索框自身的逻辑。
 *
 * 快捷键：Ctrl/Cmd+K 或 / 聚焦搜索框；Esc 清空并失焦。
 * 搜索关键词写入 hash 使用 replaceState，不制造历史记录。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const { debounce } = Blog.utils;

    function clearSearch(ctx) {
        const { state, el } = ctx;
        el.searchInput.value = '';
        el.searchWrap.classList.remove('has-value');
        el.searchClear.classList.remove('visible');
        if (state.keyword) {
            state.keyword = '';
            state.page = 1;
            state.view = 'list';
            state.slug = null;
            Blog.ui.router.syncListHash(state, { replace: false });
            ctx.actions.refreshAll();
        }
    }

    function submitSearch(ctx) {
        const { state, el } = ctx;
        const val = el.searchInput.value.trim();
        el.searchWrap.classList.toggle('has-value', !!val);
        el.searchClear.classList.toggle('visible', !!val);
        if (val === state.keyword) return;
        state.keyword = val;
        state.page = 1;
        state.view = 'list';
        state.slug = null;
        // 搜索时清空其他筛选（与旧版行为一致）
        state.category = null;
        state.tag = null;
        state.archive = null;
        Blog.ui.router.syncListHash(state, { replace: true });
        ctx.actions.refreshAll();
    }

    function init(ctx) {
        const { el } = ctx;
        const debouncedSubmit = debounce(() => submitSearch(ctx), 300);

        el.searchInput.addEventListener('input', () => debouncedSubmit(ctx));

        el.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                debouncedSubmit.cancel();
                submitSearch(ctx);
            } else if (e.key === 'Escape') {
                e.stopPropagation(); // 不要冒泡到全局快捷键（如退出文章）
                clearSearch(ctx);
                el.searchInput.blur();
                // 移动端：Esc 除清空外还要收起展开的搜索栏（弹层快捷键退出）
                if (window.innerWidth <= 768) {
                    el.searchWrap.classList.remove('mobile-visible');
                }
            }
        });

        el.searchInput.addEventListener('input', () => {
            const val = el.searchInput.value.trim();
            el.searchClear.classList.toggle('visible', !!val);
            el.searchWrap.classList.toggle('has-value', !!val);
        });

        el.searchClear.addEventListener('click', () => {
            clearSearch(ctx);
            el.searchInput.focus();
        });

        // 移动端搜索开关
        el.mobileSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            el.searchWrap.classList.toggle('mobile-visible');
            if (el.searchWrap.classList.contains('mobile-visible')) el.searchInput.focus();
        });

        // 点击外部收起移动端搜索
        document.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;
            if (!el.searchWrap.classList.contains('mobile-visible')) return;
            if (el.searchWrap.contains(e.target) || el.mobileSearchBtn.contains(e.target)) return;
            el.searchWrap.classList.remove('mobile-visible');
        });

        // 全局快捷键：Ctrl/Cmd+K 或 "/" 聚焦搜索
        document.addEventListener('keydown', (e) => {
            const target = e.target;
            const typing = target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement || target.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                focusSearch(ctx);
                return;
            }
            if (e.key === '/' && !typing) {
                e.preventDefault();
                focusSearch(ctx);
                return;
            }
            // Esc 退出文章详情（目标不是输入框、且灯箱未打开时）
            const lightbox = document.getElementById('lightbox');
            // 移动端抽屉打开时，Esc 的职责是先收起抽屉（sidebar.js 处理），不退出文章
            const drawerOpen = el.sidebar && el.sidebar.classList.contains('mobile-open');
            if (e.key === 'Escape' && !typing && !drawerOpen && ctx.state.view === 'detail' &&
                (!lightbox || lightbox.hidden)) {
                ctx.actions.navigateToList();
            }
        });

        // 搜索框占位符提示快捷键（非触屏设备）
        el.searchInput.dataset.i18nAttr =
            ('ontouchstart' in window)
                ? 'placeholder:nav.searchPlaceholder;aria-label:nav.searchAria'
                : 'placeholder:nav.searchPlaceholderKbd;aria-label:nav.searchAria';
        Blog.i18n.applyToDOM(el.searchInput.parentNode);
    }

    function focusSearch(ctx) {
        const { el } = ctx;
        if (window.innerWidth <= 768 && !el.searchWrap.classList.contains('mobile-visible')) {
            el.searchWrap.classList.add('mobile-visible');
        }
        el.searchInput.focus();
        el.searchInput.select();
    }

    /** 外部（如恢复 hash 状态）同步搜索框显示 */
    function syncInput(ctx) {
        const { el, state } = ctx;
        el.searchInput.value = state.keyword || '';
        el.searchClear.classList.toggle('visible', !!state.keyword);
        el.searchWrap.classList.toggle('has-value', !!state.keyword);
    }

    Blog.ui.search = { init, syncInput, clearSearch, focusSearch };
})();
