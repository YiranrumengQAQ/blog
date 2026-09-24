/**
 * ui/article.js — 文章详情视图
 *
 * 新增体验：
 * - 图片灯箱：点击文章里的图片全屏查看，支持 ←/→/Esc 键盘与触摸滑动
 * - 阅读进度条：文章顶部随滚动增长的渐变进度条
 * - 代码块一键复制
 * - 图片加载失败时显示友好的占位提示
 * - 加载失败提供"重试"按钮
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const { $, $$, escapeHTML, escapeAttr, copyText } = Blog.utils;
    const { renderMarkdown } = Blog.core;
    // 所有界面文案走 i18n，切换语言后重新 render 即可
    const t = (key, vars) => Blog.i18n.t(key, vars);
    // 图标统一走内联 SVG 图标库（不使用 emoji）
    const icon = (name) => Blog.ui.icons.svg(name);

    const store = Blog.storage;
    const MAX_RECENT = 12;

    /* ---------------- 阅读位置记忆 / 最近阅读 ---------------- */

    /**
     * 阅读位置按「比例」存（不是像素）：换设备、换窗口宽度、换字号后
     * 回来仍然大致停在原处；比例小于 2% 或已经读完的不记，免得干扰。
     */
    function saveReadPos(slug) {
        if (!store || !slug) return;
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        if (total <= 0) return;
        const ratio = Math.min(1, Math.max(0, window.scrollY / total));
        const map = store.getJSON(store.KEYS.readPos, {}) || {};
        if (ratio < 0.02 || ratio > 0.985) delete map[slug];
        else map[slug] = Math.round(ratio * 1000) / 1000;
        store.setJSON(store.KEYS.readPos, map);
    }

    function readPosOf(slug) {
        if (!store || !slug) return 0;
        const map = store.getJSON(store.KEYS.readPos, {}) || {};
        const v = Number(map[slug]);
        return v > 0 && v < 1 ? v : 0;
    }

    /** 恢复阅读位置：等两帧让图片占位与布局落定，再平滑滚过去 */
    function restoreReadPos(slug) {
        const ratio = readPosOf(slug);
        if (!ratio) return;
        const go = () => {
            const doc = document.documentElement;
            const total = doc.scrollHeight - window.innerHeight;
            if (total <= 0) return;
            window.scrollTo({ top: total * ratio, behavior: 'smooth' });
            if (Blog.ui.toast) {
                Blog.ui.toast.show(t('article.resumed', { n: Math.round(ratio * 100) }), 'info', 2200);
            }
        };
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(go, 120)));
    }

    function pushRecent(post) {
        if (!store || !post || !post.slug) return;
        const list = (store.getJSON(store.KEYS.recent, []) || []).filter(
            (r) => r && r.slug && r.slug !== post.slug
        );
        list.unshift({ slug: post.slug, title: post.title || post.slug, at: Date.now() });
        store.setJSON(store.KEYS.recent, list.slice(0, MAX_RECENT));
    }

    function recentPosts() {
        if (!store) return [];
        return (store.getJSON(store.KEYS.recent, []) || []).filter((r) => r && r.slug);
    }

    /* ---------------- 渲染 ---------------- */

    function render(ctx) {
        const { blog, state, el } = ctx;
        const slug = state.slug;
        if (!slug) return Promise.resolve();

        el.contentHeader.hidden = true;
        el.pagination.innerHTML = '';
        setProgressVisible(ctx, true);

        const cached = blog.getCachedDetail(slug);
        if (!cached) ctx.el.skeleton.hidden = false;
        updateProgress(ctx);

        return blog.getPostDetail(slug).then((post) => {
            ctx.el.skeleton.hidden = true;
            paint(ctx, post);
            pushRecent(post);
            // 只有「不是刚从列表点进来的第一屏」才需要恢复；由调用方决定
            if (ctx.pendingRestoreRead === slug) {
                ctx.pendingRestoreRead = null;
                restoreReadPos(slug);
            }
        }).catch((err) => {
            ctx.el.skeleton.hidden = true;
            console.error('[article] 加载失败:', err);
            paintError(ctx, slug, err);
        });
    }

    function paint(ctx, post) {
        const { blog, el } = ctx;
        // 站点名由 main.js 统一解析（语言包 site.blogName > config.blogName > 兜底文案）
        const siteName = ctx.getSiteName ? ctx.getSiteName() : (ctx.config && ctx.config.blogName) || '';
        document.title = siteName ? `${post.title} - ${siteName}` : post.title;

        const adjacent = blog.getAdjacentPosts(post.slug);

        const coverHTML = post.coverImage
            ? `<img src="${escapeAttr(post.coverImage)}" alt="${escapeAttr(post.title || '')}" class="article-cover-full" referrerpolicy="no-referrer">`
            : '';

        const tagsHTML = (post.tags && post.tags.length)
            ? `<span class="meta-sep"></span>` + post.tags.map((t) =>
                `<span class="card-tag clickable" data-tag-nav="${escapeAttr(t)}">${escapeHTML(t)}</span>`
            ).join('')
            : '';

        const navItem = (dir, p, emptyText) => p
            ? `<div class="article-nav-item ${dir}" data-nav-slug="${escapeAttr(p.slug)}" role="link" tabindex="0">
                 <div class="article-nav-label">${escapeHTML(t(dir === 'prev' ? 'article.prev' : 'article.next'))}</div>
                 <div class="article-nav-title">${escapeHTML(p.title || '')}</div>
               </div>`
            : `<div class="article-nav-item ${dir} empty">
                 <div class="article-nav-label">${escapeHTML(t(dir === 'prev' ? 'article.prev' : 'article.next'))}</div>
                 <div class="article-nav-title">${escapeHTML(emptyText)}</div>
               </div>`;

        el.contentBody.innerHTML = `
          <div class="article-view">
            <button class="article-back" id="articleBackBtn" type="button">
              <span class="article-back-arrow">${icon('arrow-left')}</span> ${escapeHTML(t('article.back'))}
            </button>
            ${coverHTML}
            <h1 class="article-title">${escapeHTML(post.title || '')}</h1>
            <div class="article-meta">
              <span>${escapeHTML(Blog.i18n.formatDate(post.date))}</span>
              <span class="meta-sep"></span>
              ${post.category ? `<span class="card-category clickable" data-cat-nav="${escapeAttr(post.category)}">${escapeHTML(post.category)}</span><span class="meta-sep"></span>` : ''}
              <span>${escapeHTML(t('article.readingTime', { n: post.readingTime }))}</span>
              <span class="meta-sep"></span>
              <span>${escapeHTML(t('article.wordCount', { n: post.wordCount }))}</span>
              ${tagsHTML}
              ${post.sticky ? `<span class="card-sticky-badge">${escapeHTML(t('article.sticky'))}</span>` : ''}
            </div>
            <div class="article-content">${renderMarkdown(post.content || '')}</div>
            <div class="article-nav">
              ${navItem('prev', adjacent.prevPost, t('article.noPrev'))}
              ${navItem('next', adjacent.nextPost, t('article.noNext'))}
            </div>
          </div>`;

        postProcess(ctx);
        void el;
    }

    function paintError(ctx, slug, err) {
        const { el } = ctx;
        const isFileProtocol = window.location.protocol === 'file:';
        const hint = isFileProtocol
            ? t('article.errorFileHint')
            : t('article.errorMissingHint', { slug });
        el.contentBody.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${icon('alert-circle')}</div>
            <h3>${escapeHTML(t('article.errorTitle'))}</h3>
            <p>${escapeHTML(hint)}</p>
            <div class="empty-actions">
              <button class="sidebar-reset" data-article-action="retry">${escapeHTML(t('article.retry'))}</button>
              <button class="sidebar-reset" data-article-action="home">${escapeHTML(t('article.home'))}</button>
            </div>
          </div>`;
        void err;
    }

    /* ---------------- 渲染后处理 ---------------- */

    function postProcess(ctx) {
        const { el } = ctx;
        const content = $('.article-content', el.contentBody);
        if (!content) return;

        // 链接：新标签页打开 + 安全属性
        $$('a', content).forEach((a) => {
            const href = a.getAttribute('href') || '';
            if (/^https?:/i.test(href)) {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            }
        });

        // 图片：懒加载 + 防防盗链 + Blur-up 渐显 + 失败占位 + 点击灯箱
        $$('img', content).forEach((img, i) => {
            img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', 'async');
            img.setAttribute('referrerpolicy', 'no-referrer');
            img.dataset.lbIndex = String(i);

            // Blur-up：先占位（骨架微光）→ 图片解码完成后从模糊淡入清晰，
            // 页面不会因为图片突然出现而「跳」一下
            if (!img.parentNode.classList || !img.parentNode.classList.contains('img-shell')) {
                const shell = document.createElement('span');
                shell.className = 'img-shell is-loading';
                img.parentNode.insertBefore(shell, img);
                shell.appendChild(img);
                const done = () => shell.classList.remove('is-loading');
                const fail = () => shell.classList.add('is-failed');
                if (img.complete && img.naturalWidth > 0) done();
                else {
                    img.addEventListener('load', done, { once: true });
                    img.addEventListener('error', fail, { once: true });
                }
            }
            img.addEventListener('error', () => {
                const tip = document.createElement('span');
                tip.className = 'img-fallback';
                const text = img.alt
                    ? t('article.imgFallbackAlt', { alt: img.alt })
                    : t('article.imgFallback');
                tip.innerHTML = `${icon('image')}<span>${escapeHTML(text)}</span>`;
                const shell = img.closest('.img-shell');
                (shell || img).replaceWith(tip);
            });
            img.addEventListener('click', () => openLightbox(ctx, i));
        });

        // 代码块：添加复制按钮
        $$('pre', content).forEach((pre) => {
            if (pre.querySelector('.copy-code-btn')) return;
            const btn = document.createElement('button');
            btn.className = 'copy-code-btn';
            btn.type = 'button';
            const setLabel = (copied) => {
                btn.innerHTML = `${icon(copied ? 'check' : 'copy')}<span>${escapeHTML(t(copied ? 'article.copied' : 'article.copy'))}</span>`;
                btn.classList.toggle('copied', copied);
            };
            setLabel(false);
            // 取代码时先摘掉按钮，避免把按钮文字（"复制"/"Copy"）也复制进去
            const codeOf = () => {
                const clone = pre.cloneNode(true);
                $$('.copy-code-btn', clone).forEach((b) => b.remove());
                return clone.textContent;
            };
            btn.addEventListener('click', async () => {
                try {
                    await copyText(codeOf());
                    setLabel(true);
                    setTimeout(() => setLabel(false), 1500);
                } catch (e) {
                    Blog.ui.toast.show(t('article.copyFailed'), 'error');
                }
            });
            pre.appendChild(btn);
        });

        // 文内导航（标签 / 分类 / 上下篇 / 返回）
        $$('[data-tag-nav]', el.contentBody).forEach((n) => {
            n.addEventListener('click', (e) => {
                e.stopPropagation();
                ctx.actions.setFilters({ tag: n.dataset.tagNav, category: null, archive: null });
            });
        });
        $$('[data-cat-nav]', el.contentBody).forEach((n) => {
            n.addEventListener('click', (e) => {
                e.stopPropagation();
                ctx.actions.setFilters({ category: n.dataset.catNav, tag: null, archive: null });
            });
        });
        $$('[data-nav-slug]', el.contentBody).forEach((n) => {
            const go = () => ctx.actions.navigateToPost(n.dataset.navSlug);
            n.addEventListener('click', go);
            n.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
            });
        });
        const back = $('#articleBackBtn', el.contentBody);
        if (back) back.addEventListener('click', () => ctx.actions.navigateToList());
        ensureMobileBar(ctx);
        el.contentBody.querySelectorAll('[data-article-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.dataset.articleAction === 'home') ctx.actions.resetFilters();
                else ctx.actions.refreshAll();
            });
        });
    }

    /* ---------------- 灯箱 ---------------- */

    let lbElements = null;

    function ensureLightbox() {
        if (lbElements && document.body.contains(lbElements.root)) return lbElements;
        const root = document.createElement('div');
        root.className = 'lightbox';
        root.id = 'lightbox';
        root.hidden = true;
        root.innerHTML = `
          <button class="lightbox-close" type="button" data-i18n-attr="aria-label:lightbox.close" aria-label="关闭">${icon('x')}</button>
          <button class="lightbox-prev" type="button" data-i18n-attr="aria-label:lightbox.prev" aria-label="上一张">${icon('chevron-left')}</button>
          <div class="lightbox-stage"><img class="lightbox-img" alt="" draggable="false"></div>
          <div class="lightbox-caption"></div>
          <div class="lightbox-counter"></div>
          <div class="lightbox-tools">
            <button type="button" class="lightbox-zoom-out" aria-label="${escapeAttr(t('lightbox.zoomOut'))}" title="${escapeAttr(t('lightbox.zoomOut'))}">${icon('minus')}</button>
            <span class="lightbox-scale">100%</span>
            <button type="button" class="lightbox-zoom-in" aria-label="${escapeAttr(t('lightbox.zoomIn'))}" title="${escapeAttr(t('lightbox.zoomIn'))}">${icon('plus')}</button>
            <button type="button" class="lightbox-reset" aria-label="${escapeAttr(t('lightbox.reset'))}" title="${escapeAttr(t('lightbox.reset'))}">${icon('maximize')}</button>
            <a class="lightbox-origin" target="_blank" rel="noopener noreferrer" title="${escapeAttr(t('lightbox.origin'))}">${icon('link')}<span>${escapeHTML(t('lightbox.origin'))}</span></a>
          </div>
          <button class="lightbox-next" type="button" data-i18n-attr="aria-label:lightbox.next" aria-label="下一张">${icon('chevron-right')}</button>`;
        Blog.i18n.applyToDOM(root);
        document.body.appendChild(root);
        lbElements = {
            root,
            stage: $('.lightbox-stage', root),
            scaleLabel: $('.lightbox-scale', root),
            origin: $('.lightbox-origin', root),
            img: $('.lightbox-img', root),
            caption: $('.lightbox-caption', root),
            counter: $('.lightbox-counter', root),
            prev: $('.lightbox-prev', root),
            next: $('.lightbox-next', root),
            close: $('.lightbox-close', root)
        };

        lbElements.close.addEventListener('click', closeLightbox);
        root.addEventListener('click', (e) => { if (e.target === root) closeLightbox(); });
        lbElements.prev.addEventListener('click', () => stepLightbox(-1));
        lbElements.next.addEventListener('click', () => stepLightbox(1));
        bindZoom(root);
        document.addEventListener('keydown', (e) => {
            if (root.hidden) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') stepLightbox(-1);
            else if (e.key === 'ArrowRight') stepLightbox(1);
            else if (e.key === '+' || e.key === '=') zoomBy(1.25);
            else if (e.key === '-' || e.key === '_') zoomBy(0.8);
            else if (e.key === '0') resetZoom();
        });

        // 触摸滑动切换
        let startX = null;
        root.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
        root.addEventListener('touchend', (e) => {
            if (startX === null) return;
            const dx = e.changedTouches[0].clientX - startX;
            if (Math.abs(dx) > 50) stepLightbox(dx > 0 ? -1 : 1);
            startX = null;
        }, { passive: true });

        return lbElements;
    }

    let lbImages = [];
    let lbCurrent = 0;

    /* 缩放 / 拖动：滚轮缩放、双击切换 1x↔2x、放大后可拖动、0 复位 */
    const ZOOM_MIN = 1, ZOOM_MAX = 6;
    let zoom = 1, panX = 0, panY = 0;
    let dragging = false, dragX = 0, dragY = 0, startPanX = 0, startPanY = 0;

    function applyTransform() {
        if (!lbElements) return;
        lbElements.img.style.transform =
            `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) scale(${zoom.toFixed(3)})`;
        lbElements.img.classList.toggle('is-zoomed', zoom > 1.01);
        if (lbElements.scaleLabel) lbElements.scaleLabel.textContent = Math.round(zoom * 100) + '%';
    }

    function setZoom(next, originX, originY) {
        const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
        if (clamped === zoom) return;
        if (originX !== undefined && lbElements) {
            // 以指针为锚点缩放：放大时不会把用户正在看的那块跑掉
            const rect = lbElements.img.getBoundingClientRect();
            const cx = originX - (rect.left + rect.width / 2);
            const cy = originY - (rect.top + rect.height / 2);
            const k = clamped / zoom;
            panX = panX - cx * (k - 1);
            panY = panY - cy * (k - 1);
        }
        zoom = clamped;
        if (zoom <= 1.01) { panX = 0; panY = 0; }
        applyTransform();
    }

    function zoomBy(factor) { setZoom(zoom * factor); }
    function resetZoom() { zoom = 1; panX = 0; panY = 0; applyTransform(); }

    function bindZoom(root) {
        const img = lbElements.img;
        $('.lightbox-zoom-in', root).addEventListener('click', () => zoomBy(1.3));
        $('.lightbox-zoom-out', root).addEventListener('click', () => zoomBy(1 / 1.3));
        $('.lightbox-reset', root).addEventListener('click', resetZoom);

        root.addEventListener('wheel', (e) => {
            if (root.hidden) return;
            e.preventDefault();
            setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
        }, { passive: false });

        img.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (zoom > 1.01) resetZoom();
            else setZoom(2.2, e.clientX, e.clientY);
        });

        img.addEventListener('pointerdown', (e) => {
            if (zoom <= 1.01) return;
            dragging = true;
            dragX = e.clientX; dragY = e.clientY;
            startPanX = panX; startPanY = panY;
            img.setPointerCapture(e.pointerId);
            img.classList.add('is-dragging');
        });
        img.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            panX = startPanX + (e.clientX - dragX);
            panY = startPanY + (e.clientY - dragY);
            applyTransform();
        });
        const endDrag = (e) => {
            if (!dragging) return;
            dragging = false;
            img.classList.remove('is-dragging');
            try { img.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        };
        img.addEventListener('pointerup', endDrag);
        img.addEventListener('pointercancel', endDrag);
    }

    function openLightbox(ctx, index) {
        const imgs = $$('.article-content img', ctx.el.contentBody);
        if (!imgs.length) return;
        lbImages = imgs;
        const lb = ensureLightbox();
        lb.root.hidden = false;
        // iOS 上 body { overflow: hidden } 挡不住触摸滚动，
        // 复用侧栏抽屉那套「body 定位固定」的引用计数锁（关灯箱时才真正解锁）
        if (Blog.ui.sidebar) Blog.ui.sidebar.lockBodyScroll();
        showLightboxImage(index);
    }

    function showLightboxImage(index) {
        if (!lbImages.length) return;
        resetZoom();                      // 换图回到 100%，不然会莫名其妙停在放大状态
        lbCurrent = (index + lbImages.length) % lbImages.length;
        const img = lbImages[lbCurrent];
        const lb = lbElements;
        const src = img.currentSrc || img.src;
        lb.img.src = src;
        if (lb.origin) lb.origin.href = src;
        lb.img.alt = img.alt || '';
        lb.caption.textContent = img.alt || '';
        lb.caption.style.display = img.alt ? '' : 'none';
        lb.counter.textContent = lbImages.length > 1 ? `${lbCurrent + 1} / ${lbImages.length}` : '';
        const multiple = lbImages.length > 1;
        lb.prev.disabled = !multiple;
        lb.next.disabled = !multiple;
    }

    function stepLightbox(delta) {
        showLightboxImage(lbCurrent + delta);
    }

    function closeLightbox() {
        if (!lbElements) return;
        resetZoom();
        lbElements.root.hidden = true;
        lbElements.img.src = '';
        if (Blog.ui.sidebar) Blog.ui.sidebar.unlockBodyScroll();
    }

    /* ---------------- 移动端文章底部操作条 ---------------- */

    /**
     * 手机上读长文时，返回与回顶都在屏幕最上面，够不着。
     * 这里在文章页底部浮一条玻璃小条：← 返回 / ↑ 顶部（只在 ≤768px 出现）。
     */
    let mobileBar = null;

    function ensureMobileBar(ctx) {
        if (!mobileBar || !document.body.contains(mobileBar)) {
            mobileBar = document.createElement('div');
            mobileBar.className = 'article-mobile-bar';
            mobileBar.innerHTML =
                `<button type="button" data-act="back">${icon('arrow-left')}<span>${escapeHTML(t('article.back'))}</span></button>` +
                `<button type="button" data-act="top">${icon('arrow-up')}<span>${escapeHTML(t('nav.backToTop'))}</span></button>`;
            mobileBar.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                if (btn.dataset.act === 'back') ctx.actions.navigateToList();
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            document.body.appendChild(mobileBar);
        } else {
            // 语言可能换了：文字重新取一次
            const labels = mobileBar.querySelectorAll('span');
            if (labels[0]) labels[0].textContent = t('article.back');
            if (labels[1]) labels[1].textContent = t('nav.backToTop');
        }
        mobileBar.hidden = false;
    }

    function hideMobileBar() {
        if (mobileBar) mobileBar.hidden = true;
    }

    /* ---------------- 阅读进度条 ---------------- */

    function setProgressVisible(ctx, visible) {
        ctx.el.readingProgress.hidden = !visible;
        if (!visible) {
            ctx.el.readingProgressBar.style.width = '0';
            hideMobileBar();
        }
    }

    function updateProgress(ctx) {
        if (ctx.el.readingProgress.hidden) return;
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        const ratio = total > 0 ? Math.min(1, window.scrollY / total) : 0;
        ctx.el.readingProgressBar.style.width = (ratio * 100).toFixed(2) + '%';
    }

    function init(ctx) {
        let saveTimer = 0;
        const onScroll = () => {
            updateProgress(ctx);
            // 滚动停下 400ms 后再落盘，避免把每一帧都写进 storage
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                if (ctx.state.view === 'detail' && ctx.state.slug) saveReadPos(ctx.state.slug);
            }, 400);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', () => updateProgress(ctx), { passive: true });
        // 离开页面 / 切后台前补存一次，保证「关掉再回来」也能续上
        window.addEventListener('pagehide', () => {
            if (ctx.state.view === 'detail' && ctx.state.slug) saveReadPos(ctx.state.slug);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' &&
                ctx.state.view === 'detail' && ctx.state.slug) saveReadPos(ctx.state.slug);
        });
    }

    Blog.ui.article = {
        render, init, setProgressVisible, openLightbox, closeLightbox,
        saveReadPos, readPosOf, recentPosts
    };
})();
