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
        }).catch((err) => {
            ctx.el.skeleton.hidden = true;
            console.error('[article] 加载失败:', err);
            paintError(ctx, slug, err);
        });
    }

    function paint(ctx, post) {
        const { blog, el, config } = ctx;
        document.title = `${post.title} - ${config.blogName}`;

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
              <span class="article-back-arrow">&larr;</span> ${escapeHTML(t('article.back'))}
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
            <div class="empty-icon">😿</div>
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

        // 图片：懒加载 + 防防盗链 + 失败占位 + 点击灯箱
        $$('img', content).forEach((img, i) => {
            img.setAttribute('loading', 'lazy');
            img.setAttribute('referrerpolicy', 'no-referrer');
            img.dataset.lbIndex = String(i);
            img.addEventListener('error', () => {
                const tip = document.createElement('span');
                tip.className = 'img-fallback';
                tip.textContent = img.alt
                    ? t('article.imgFallbackAlt', { alt: img.alt })
                    : t('article.imgFallback');
                img.replaceWith(tip);
            });
            img.addEventListener('click', () => openLightbox(ctx, i));
        });

        // 代码块：添加复制按钮
        $$('pre', content).forEach((pre) => {
            if (pre.querySelector('.copy-code-btn')) return;
            const btn = document.createElement('button');
            btn.className = 'copy-code-btn';
            btn.type = 'button';
            btn.textContent = t('article.copy');
            // 取代码时先摘掉按钮，避免把按钮文字（"复制"/"Copy"）也复制进去
            const codeOf = () => {
                const clone = pre.cloneNode(true);
                $$('.copy-code-btn', clone).forEach((b) => b.remove());
                return clone.textContent;
            };
            btn.addEventListener('click', async () => {
                try {
                    await copyText(codeOf());
                    btn.textContent = t('article.copied');
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.textContent = t('article.copy');
                        btn.classList.remove('copied');
                    }, 1500);
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
          <button class="lightbox-close" type="button" data-i18n-attr="aria-label:lightbox.close" aria-label="关闭">✕</button>
          <button class="lightbox-prev" type="button" data-i18n-attr="aria-label:lightbox.prev" aria-label="上一张">&#8249;</button>
          <img class="lightbox-img" alt="">
          <div class="lightbox-caption"></div>
          <div class="lightbox-counter"></div>
          <button class="lightbox-next" type="button" data-i18n-attr="aria-label:lightbox.next" aria-label="下一张">&#8250;</button>`;
        Blog.i18n.applyToDOM(root);
        document.body.appendChild(root);
        lbElements = {
            root,
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
        document.addEventListener('keydown', (e) => {
            if (root.hidden) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') stepLightbox(-1);
            else if (e.key === 'ArrowRight') stepLightbox(1);
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

    function openLightbox(ctx, index) {
        const imgs = $$('.article-content img', ctx.el.contentBody);
        if (!imgs.length) return;
        lbImages = imgs;
        const lb = ensureLightbox();
        lb.root.hidden = false;
        document.body.style.overflow = 'hidden';
        showLightboxImage(index);
    }

    function showLightboxImage(index) {
        if (!lbImages.length) return;
        lbCurrent = (index + lbImages.length) % lbImages.length;
        const img = lbImages[lbCurrent];
        const lb = lbElements;
        lb.img.src = img.currentSrc || img.src;
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
        lbElements.root.hidden = true;
        lbElements.img.src = '';
        document.body.style.overflow = '';
    }

    /* ---------------- 阅读进度条 ---------------- */

    function setProgressVisible(ctx, visible) {
        ctx.el.readingProgress.hidden = !visible;
        if (!visible) ctx.el.readingProgressBar.style.width = '0';
    }

    function updateProgress(ctx) {
        if (ctx.el.readingProgress.hidden) return;
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        const ratio = total > 0 ? Math.min(1, window.scrollY / total) : 0;
        ctx.el.readingProgressBar.style.width = (ratio * 100).toFixed(2) + '%';
    }

    function init(ctx) {
        window.addEventListener('scroll', () => updateProgress(ctx), { passive: true });
        window.addEventListener('resize', () => updateProgress(ctx), { passive: true });
    }

    Blog.ui.article = { render, init, setProgressVisible, openLightbox, closeLightbox };
})();
