/**
 * main.js — 应用入口
 *
 * 职责：组装各模块（内核 / 路由 / 侧栏 / 列表 / 详情 / 搜索 / 主题 / Toast），
 * 管理全局状态，处理浏览器前进后退，后台预取文章并静默刷新界面。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    const { $ } = Blog.utils;
    const { toast } = Blog.ui;

    /* ---------------- 内核与全局状态 ---------------- */

    const blog = new Blog.core.BlogKernel({
        onError: (msg, err) => {
            console.warn('[BlogKernel]', msg, err);
        }
    });

    const state = {
        view: 'list',      // 'list' | 'detail'
        category: null,
        tag: null,
        archive: null,
        keyword: '',
        page: 1,
        slug: null,
        perPage: 5
    };

    /* ---------------- DOM 引用 ---------------- */

    const el = {
        siteHeader: $('#siteHeader'),
        searchWrap: $('#searchWrap'),
        searchInput: $('#searchInput'),
        searchClear: $('#searchClear'),
        mobileSearchBtn: $('#mobileSearchBtn'),
        mobileMenuBtn: $('#mobileMenuBtn'),
        themeToggle: $('#themeToggle'),
        sidebar: $('#sidebar'),
        sidebarOverlay: $('#sidebarOverlay'),
        sidebarCategories: $('#sidebarCategories'),
        sidebarTags: $('#sidebarTags'),
        sidebarArchives: $('#sidebarArchives'),
        contentArea: $('#contentArea'),
        contentHeader: $('#contentHeader'),
        contentTitle: $('#contentTitle'),
        resultCount: $('#resultCount'),
        contentBody: $('#contentBody'),
        pagination: $('#pagination'),
        skeleton: $('#loadingSkeleton'),
        backToTop: $('#backToTop'),
        readingProgress: $('#readingProgress'),
        readingProgressBar: $('#readingProgressBar'),
        footerName: $('#footerName'),
        footerYear: $('#footerYear')
    };

    const ctx = { blog, state, el, config: null, actions: {} };

    /* ---------------- 动作 ---------------- */

    const actions = {
        refreshAll() {
            Blog.ui.search.syncInput(ctx);
            Blog.ui.sidebar.updateActive(ctx);
            if (state.view === 'detail' && state.slug) {
                Blog.ui.article.render(ctx);
            } else {
                state.view = 'list';
                el.skeleton.hidden = true;
                Blog.ui.article.setProgressVisible(ctx, false);
                document.title = ctx.config ? ctx.config.blogName : '博客';
                Blog.ui.postlist.render(ctx);
            }
        },

        /** 设置筛选条件（保留未提及的字段语义由调用方决定） */
        setFilters(patch) {
            Object.assign(state, {
                view: 'list',
                slug: null,
                page: 1,
                keyword: ''
            }, patch);
            Blog.ui.router.syncListHash(state);
            actions.refreshAll();
            Blog.ui.sidebar.closeMobile(ctx);
        },

        resetFilters() {
            actions.setFilters({ category: null, tag: null, archive: null, keyword: '' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        navigateToPost(slug) {
            state.view = 'detail';
            state.slug = slug;
            Blog.ui.router.syncPostHash(slug);
            Blog.ui.sidebar.closeMobile(ctx);
            window.scrollTo({ top: 0, behavior: 'auto' });
            actions.refreshAll();
        },

        navigateToList() {
            state.view = 'list';
            state.slug = null;
            Blog.ui.router.syncListHash(state);
            actions.refreshAll();
            el.contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        reload() {
            window.location.reload();
        }
    };
    ctx.actions = actions;

    /* ---------------- 模块初始化 ---------------- */

    Blog.ui.theme.initTheme();
    Blog.ui.article.init(ctx);
    Blog.ui.postlist.init(ctx);
    Blog.ui.search.init(ctx);
    Blog.ui.sidebar.init(ctx);

    el.themeToggle.addEventListener('click', () => Blog.ui.theme.toggleTheme());

    // 博客名点击 → 回首页
    document.querySelector('.blog-name').addEventListener('click', (e) => {
        e.preventDefault();
        actions.resetFilters();
    });

    // 回到顶部 & 顶栏阴影
    function onScroll() {
        el.backToTop.classList.toggle('visible', window.scrollY > 500);
        el.siteHeader.classList.toggle('scrolled', window.scrollY > 10);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    el.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 浏览器前进 / 后退
    window.addEventListener('popstate', () => {
        Blog.ui.router.parseHash(state);
        actions.refreshAll();
        if (state.view === 'detail') window.scrollTo({ top: 0, behavior: 'auto' });
    });

    /* ---------------- 启动 ---------------- */

    function showErrorScreen(err) {
        el.skeleton.hidden = true;
        const isFile = window.location.protocol === 'file:';
        const why = isFile
            ? '你是直接双击打开的 index.html：浏览器安全策略不允许本地页面读取文章数据。'
            : '无法加载 config.json 或 posts/manifest.json，请检查文件是否存在、JSON 格式是否正确。';
        el.contentHeader.hidden = true;
        el.contentBody.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🐱</div>
            <h3>博客初始化失败</h3>
            <p>${why}</p>
            <p style="font-size:0.8rem;margin-top:0.6rem;opacity:0.75;">本地预览可在仓库目录运行：python3 -m http.server 8000</p>
            <div class="empty-actions"><button class="sidebar-reset" id="initRetryBtn">重试</button></div>
          </div>`;
        const retry = $('#initRetryBtn');
        if (retry) retry.addEventListener('click', () => window.location.reload());
        console.error('[blog] 初始化失败:', err);
    }

    async function boot() {
        Blog.ui.router.parseHash(state);
        try {
            await blog.init();
        } catch (err) {
            showErrorScreen(err);
            return;
        }

        ctx.config = blog.config;
        state.perPage = blog.config.perPage || 5;
        document.title = blog.config.blogName;
        const headerName = $('#headerBlogName');
        if (headerName) headerName.textContent = blog.config.blogName;
        if (el.footerName) el.footerName.textContent = blog.config.blogName;
        if (el.footerYear) el.footerYear.textContent = String(new Date().getFullYear());

        Blog.ui.sidebar.render(ctx);
        Blog.ui.search.syncInput(ctx);
        Blog.ui.sidebar.updateActive(ctx);
        actions.refreshAll();

        // 后台预取全部文章：完成后静默更新列表（补全封面 / 摘要）与侧栏
        blog.hydrateAll({
            onProgress: (done, total) => {
                if (total > 3) console.debug(`[blog] 文章索引建立中 ${done}/${total}`);
            }
        }).then(() => {
            Blog.ui.sidebar.render(ctx);
            Blog.ui.sidebar.updateActive(ctx);
            if (state.view === 'list') Blog.ui.postlist.render(ctx);
            if (blog.failedSlugs.length) {
                toast.show(`有 ${blog.failedSlugs.length} 篇文章加载失败，请检查 posts/ 目录`, 'error');
            }
        }).catch((err) => console.warn('[blog] 预取失败:', err));

        // 本地 marked 缺失时尝试从 CDN 补齐，加载完刷新当前视图
        if (!window.marked) {
            Blog.core.ensureMarked(() => {
                if (state.view === 'detail') actions.refreshAll();
            });
        }
    }

    // 页脚
    if (el.footerYear) el.footerYear.textContent = String(new Date().getFullYear());

    boot();

    /* ---------------- 调试 API ---------------- */
    window.__blogKernel = blog;
    window.__blogApp = {
        refreshAll: actions.refreshAll,
        navigateToPost: actions.navigateToPost,
        navigateToList: actions.navigateToList,
        toggleTheme: Blog.ui.theme.toggleTheme,
        getState: () => state,
        getTaxonomyData: () => blog.getTaxonomyData()
    };

    console.log('%c🐱 Blog 已就绪（模块化版）', 'font-size:1.1em;color:#8D6E63;');
    console.log('%c调试 API：window.__blogKernel / window.__blogApp', 'font-size:0.75em;color:#aaa;');
})();
