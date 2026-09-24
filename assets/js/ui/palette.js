/**
 * ui/palette.js — 快速搜索 / 命令面板（Command Palette）
 *
 *   Ctrl / ⌘ + K 或 /      打开
 *   直接输入                 即时搜索文章（标题 / 摘要 / 分类 / 标签全文）
 *   输入 >                   切换到命令模式（主题 / 雨效 / 语言 / 阅读模式 / 回首页…）
 *   ↑ ↓                      选择，Enter 执行，Esc 关闭
 *   空输入                   显示「最近阅读」与「最近搜索」
 *
 * 所有结果都会高亮匹配到的关键词；没有结果时给出明确的空状态而不是一片空白。
 * 面板本身继续使用全站玻璃体系（.palette-card 走 --lens-blur）。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const store = Blog.storage;
    const RECENT_SEARCH_KEY = 'blog-recent-search';
    const t = (key, vars) => (Blog.i18n ? Blog.i18n.t(key, vars) : key);
    const icon = (name) => (Blog.ui.icons ? Blog.ui.icons.svg(name) : '');
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    let ctxRef = null;
    let root = null, input = null, listEl = null, hintEl = null;
    let items = [];       // 当前可选项 [{ type, label, desc, run }]
    let active = 0;
    let open = false;

    /* ---------------- 最近搜索 ---------------- */

    function recentSearches() {
        if (!store) return [];
        return (store.getJSON(RECENT_SEARCH_KEY, []) || []).filter((s) => typeof s === 'string' && s);
    }
    function pushRecentSearch(kw) {
        if (!store || !kw) return;
        const list = recentSearches().filter((s) => s !== kw);
        list.unshift(kw);
        store.setJSON(RECENT_SEARCH_KEY, list.slice(0, 8));
    }

    /* ---------------- 命令表 ---------------- */

    function commands() {
        const list = [
            {
                id: 'theme', icon: 'moon', label: t('palette.cmdTheme'),
                run: () => Blog.ui.theme && Blog.ui.theme.toggleTheme()
            },
            {
                id: 'rain', icon: 'cloud-rain', label: t('palette.cmdRain'),
                run: () => Blog.ui.rain && Blog.ui.rain.toggle()
            },
            {
                id: 'reader', icon: 'book-open', label: t('palette.cmdReader'),
                run: () => Blog.ui.reader && Blog.ui.reader.toggle()
            },
            {
                id: 'home', icon: 'arrow-left', label: t('palette.cmdHome'),
                run: () => ctxRef && ctxRef.actions.resetFilters()
            },
            {
                id: 'top', icon: 'arrow-up', label: t('palette.cmdTop'),
                run: () => window.scrollTo({ top: 0, behavior: 'smooth' })
            },
            {
                id: 'help', icon: 'help-circle', label: t('palette.cmdHelp'),
                run: () => Blog.ui.shortcuts && Blog.ui.shortcuts.showHelp()
            }
        ];
        // 语言：直接列出全部可用语言，省得去顶栏找那个被压扁的下拉框
        (Blog.i18n ? Blog.i18n.available() : []).forEach((lang) => {
            list.push({
                id: 'lang-' + lang.code, icon: 'sparkles',
                label: t('palette.cmdLanguage', { name: lang.name }),
                run: () => Blog.i18n.setLocale(lang.code)
            });
        });
        return list;
    }

    /* ---------------- 构建 DOM ---------------- */

    function build() {
        if (root && document.body.contains(root)) return root;
        root = document.createElement('div');
        root.className = 'palette';
        root.hidden = true;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div class="palette-card">' +
            '  <div class="palette-head">' +
            '    <span class="palette-icon" aria-hidden="true">' + icon('search') + '</span>' +
            '    <input class="palette-input" type="text" autocomplete="off" spellcheck="false">' +
            '    <kbd class="palette-esc">ESC</kbd>' +
            '  </div>' +
            '  <div class="palette-list" role="listbox"></div>' +
            '  <div class="palette-hint"></div>' +
            '</div>';
        document.body.appendChild(root);
        input = root.querySelector('.palette-input');
        listEl = root.querySelector('.palette-list');
        hintEl = root.querySelector('.palette-hint');

        root.addEventListener('click', (e) => { if (e.target === root) close(); });
        input.addEventListener('input', () => refresh());
        input.addEventListener('keydown', onKey);
        listEl.addEventListener('click', (e) => {
            const row = e.target.closest('.palette-item');
            if (!row) return;
            runItem(parseInt(row.dataset.index, 10));
        });
        listEl.addEventListener('mousemove', (e) => {
            const row = e.target.closest('.palette-item');
            if (!row) return;
            setActive(parseInt(row.dataset.index, 10), false);
        });
        return root;
    }

    /* ---------------- 渲染 ---------------- */

    function highlight(text, kw) {
        const s = String(text == null ? '' : text);
        if (!kw) return esc(s);
        const i = s.toLowerCase().indexOf(kw.toLowerCase());
        if (i < 0) return esc(s);
        return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + kw.length)) + '</mark>' + esc(s.slice(i + kw.length));
    }

    function section(title) {
        return '<div class="palette-section">' + esc(title) + '</div>';
    }

    function refresh() {
        const raw = input.value;
        const isCmd = raw.trim().startsWith('>');
        items = [];
        let html = '';

        if (isCmd) {
            const q = raw.trim().slice(1).trim().toLowerCase();
            const list = commands().filter((c) => !q || c.label.toLowerCase().includes(q) || c.id.includes(q));
            html += section(t('palette.commands'));
            list.forEach((c) => {
                items.push({ run: c.run, close: true });
                html += row(items.length - 1, c.icon, highlight(c.label, q), '');
            });
            if (!list.length) html += empty(t('palette.noCommand'));
            hintEl.innerHTML = hint();
            listEl.innerHTML = html;
            setActive(0, true);
            return;
        }

        const kw = raw.trim();
        if (!kw) {
            // 空输入：最近阅读 + 最近搜索 + 命令提示
            const recent = (Blog.ui.article && Blog.ui.article.recentPosts) ? Blog.ui.article.recentPosts() : [];
            if (recent.length) {
                html += section(t('palette.recentRead'));
                recent.slice(0, 5).forEach((r) => {
                    items.push({ run: () => ctxRef.actions.navigateToPost(r.slug), close: true });
                    html += row(items.length - 1, 'file-text', esc(r.title), '');
                });
            }
            const searches = recentSearches();
            if (searches.length) {
                html += section(t('palette.recentSearch'));
                searches.slice(0, 5).forEach((s) => {
                    items.push({ run: () => { input.value = s; refresh(); }, close: false });
                    html += row(items.length - 1, 'search', esc(s), '');
                });
            }
            if (!items.length) html += empty(t('palette.emptyStart'));
        } else {
            const blog = ctxRef && ctxRef.blog;
            const res = blog ? blog.queryPosts({ keyword: kw, page: 1, perPage: 8 }) : { items: [], pagination: {} };
            if (res.items.length) {
                html += section(t('palette.articles', { n: res.pagination.totalItems }));
                res.items.forEach((p) => {
                    items.push({ run: () => ctxRef.actions.navigateToPost(p.slug), close: true });
                    html += row(items.length - 1, 'file-text',
                        highlight(p.title, kw), highlight(p.summary || '', kw));
                });
                if (res.pagination.totalItems > res.items.length) {
                    items.push({ run: () => runFullSearch(kw), close: true });
                    html += row(items.length - 1, 'list',
                        esc(t('palette.seeAll', { n: res.pagination.totalItems })), '');
                }
            } else {
                html += empty(t('palette.noResult', { q: kw }));
            }

            // 分类 / 标签快速筛选
            const tax = blog ? blog.getTaxonomyData() : { categories: [], tags: [] };
            const low = kw.toLowerCase();
            const cats = (tax.categories || []).filter((c) => c.name.toLowerCase().includes(low)).slice(0, 3);
            const tags = (tax.tags || []).filter((x) => x.name.toLowerCase().includes(low)).slice(0, 3);
            if (cats.length || tags.length) {
                html += section(t('palette.filters'));
                cats.forEach((c) => {
                    items.push({ run: () => ctxRef.actions.setFilters({ category: c.name, tag: null, archive: null }), close: true });
                    html += row(items.length - 1, 'folder-open',
                        highlight(c.name, kw), esc(t('palette.inCategory', { n: c.count })));
                });
                tags.forEach((x) => {
                    items.push({ run: () => ctxRef.actions.setFilters({ tag: x.name, category: null, archive: null }), close: true });
                    html += row(items.length - 1, 'pin',
                        highlight(x.name, kw), esc(t('palette.inTag', { n: x.count })));
                });
            }
        }

        hintEl.innerHTML = hint();
        listEl.innerHTML = html;
        setActive(0, true);
    }

    function row(index, iconName, labelHTML, descHTML) {
        return '<div class="palette-item" role="option" data-index="' + index + '">' +
            '<span class="palette-item-icon" aria-hidden="true">' + icon(iconName) + '</span>' +
            '<span class="palette-item-text">' +
            '<span class="palette-item-label">' + labelHTML + '</span>' +
            (descHTML ? '<span class="palette-item-desc">' + descHTML + '</span>' : '') +
            '</span></div>';
    }

    function empty(text) {
        return '<div class="palette-empty">' + icon('sparkles') + '<span>' + esc(text) + '</span></div>';
    }

    function hint() {
        return '<span><kbd>↑</kbd><kbd>↓</kbd> ' + esc(t('palette.hintMove')) + '</span>' +
            '<span><kbd>Enter</kbd> ' + esc(t('palette.hintOpen')) + '</span>' +
            '<span><kbd>&gt;</kbd> ' + esc(t('palette.hintCommand')) + '</span>';
    }

    /* ---------------- 选择与执行 ---------------- */

    function setActive(i, scroll) {
        if (!items.length) { active = 0; return; }
        active = (i + items.length) % items.length;
        const rows = listEl.querySelectorAll('.palette-item');
        rows.forEach((r, idx) => r.classList.toggle('is-active', idx === active));
        if (scroll !== false && rows[active] && rows[active].scrollIntoView) {
            rows[active].scrollIntoView({ block: 'nearest' });
        }
    }

    function runItem(i) {
        const item = items[i];
        if (!item) return;
        const kw = input.value.trim();
        if (kw && !kw.startsWith('>')) pushRecentSearch(kw);
        if (item.close) close();
        item.run();
    }

    function runFullSearch(kw) {
        const el = ctxRef && ctxRef.el;
        if (el && el.searchInput) {
            el.searchInput.value = kw;
            el.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); return; }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (items.length) runItem(active);
            else if (input.value.trim()) { const kw = input.value.trim(); close(); runFullSearch(kw); }
        }
    }

    /* ---------------- 开关 ---------------- */

    function openPalette(prefill) {
        build();
        if (open) { input.focus(); return; }
        open = true;
        root.hidden = false;
        input.placeholder = t('palette.placeholder');
        input.value = prefill || '';
        if (Blog.ui.sidebar) Blog.ui.sidebar.lockBodyScroll();
        refresh();
        // 等一帧再聚焦，iOS 上直接聚焦会让键盘把面板顶飞
        requestAnimationFrame(() => { input.focus(); input.select(); });
    }

    function close() {
        if (!open) return;
        open = false;
        root.hidden = true;
        if (Blog.ui.sidebar) Blog.ui.sidebar.unlockBodyScroll();
    }

    function init(ctx) {
        ctxRef = ctx;
        build();
        // 捕获阶段拦下 Ctrl/⌘+K 与 /：比顶栏搜索框的监听更早，统一入口
        document.addEventListener('keydown', (e) => {
            const typing = Blog.ui.shortcuts ? Blog.ui.shortcuts.isTyping(e.target) : false;
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                e.stopPropagation();
                open ? close() : openPalette();
                return;
            }
            if (e.key === '/' && !typing && !open && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                openPalette();
            }
        }, true);

        // 顶栏搜索图标（移动端）也走面板，省得在小屏上摆一个输入框
        const mobileBtn = document.getElementById('mobileSearchBtn');
        if (mobileBtn) {
            mobileBtn.addEventListener('click', (e) => {
                if (window.innerWidth > 768) return;
                e.preventDefault();
                e.stopPropagation();
                openPalette();
            }, true);
        }
    }

    Blog.ui.palette = { init, open: openPalette, close, isOpen: () => open };
})();
