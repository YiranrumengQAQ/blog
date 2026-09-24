/**
 * ui/glass.js — 雨夜玻璃主题的交互层（全部 GPU 合成属性）
 *
 *   1. 指针光斑：一团跟随鼠标的柔光，用 mix-blend 在玻璃上游走，
 *      让每块玻璃都有“被照亮”的真实反光。
 *   2. 卡片倾斜：指针悬停时卡片做细微 3D 偏转（perspective + rotate），
 *      配合 CSS 的镜面高光，产生视差折射感。
 *   3. 入场显现：卡片进入视口时淡入上浮（IntersectionObserver）。
 *
 * 无障碍：触屏 / 无指针设备自动跳过 1、2；内容显现失败时有兜底，
 * 保证文字一定可见（CSS 里 .no-glass-fx 是最后一道保险）。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const TILT_SELECTOR = '.post-card, .glass-card';
    const REVEAL_SELECTOR = '.post-card, .sidebar-section, .article-view, .editor-panel, .content-header, .empty-state';

    let spot = null;
    let spotX = -500, spotY = -500, spotTX = -500, spotTY = -500;
    let spotRaf = 0;
    let tiltEl = null;
    let finePointer = false;

    try {
        finePointer = window.matchMedia('(pointer: fine)').matches;
    } catch (e) { finePointer = true; }

    /* ---------------- 1. 指针光斑 ---------------- */

    function ensureSpot() {
        if (spot || !finePointer) return spot;
        spot = document.createElement('div');
        spot.id = 'glassSpot';
        spot.setAttribute('aria-hidden', 'true');
        document.body.appendChild(spot);
        return spot;
    }

    function loopSpot() {
        spotRaf = 0;
        // 指数跟随：又顺又稳，还自带拖尾感
        spotX += (spotTX - spotX) * 0.16;
        spotY += (spotTY - spotY) * 0.16;
        if (spot) {
            spot.style.transform = `translate3d(${spotX.toFixed(1)}px,${spotY.toFixed(1)}px,0)`;
        }
        if (Math.abs(spotTX - spotX) > 0.4 || Math.abs(spotTY - spotY) > 0.4) {
            spotRaf = requestAnimationFrame(loopSpot);
        }
    }

    function onPointerMove(e) {
        if (!finePointer) return;
        ensureSpot();
        spotTX = e.clientX;
        spotTY = e.clientY;
        if (!spotRaf) spotRaf = requestAnimationFrame(loopSpot);
        updateTilt(e);
    }

    /* ---------------- 2. 卡片 3D 倾斜 ---------------- */

    function resetTilt() {
        if (tiltEl) {
            tiltEl.style.transform = '';
            tiltEl = null;
        }
    }

    function updateTilt(e) {
        const card = e.target && e.target.closest ? e.target.closest(TILT_SELECTOR) : null;
        if (card !== tiltEl) resetTilt();
        if (!card) return;
        // 小屏 / 列表滚动时不倾斜，避免晕
        if (window.innerWidth < 768) return;
        const rect = card.getBoundingClientRect();
        if (rect.width < 40 || rect.height < 40) return;
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        tiltEl = card;
        // 最大 3.2°：能感到玻璃在转，又不会转晕
        card.style.transform =
            `perspective(1100px) rotateX(${(-py * 6.4).toFixed(2)}deg) ` +
            `rotateY(${(px * 6.4).toFixed(2)}deg) translateY(-4px) translateZ(0)`;
    }

    /* ---------------- 3. 入场显现 ---------------- */

    let observer = null;

    function ensureObserver() {
        if (observer) return observer;
        if (!('IntersectionObserver' in window)) return null;
        observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
        return observer;
    }

    function watch(root) {
        const scope = root || document;
        if (!scope.querySelectorAll) return;
        const ob = ensureObserver();
        const nodes = scope.querySelectorAll(REVEAL_SELECTOR);
        nodes.forEach((n) => {
            if (n.classList.contains('in')) return;
            if (ob) ob.observe(n);
            else n.classList.add('in'); // 老浏览器：直接显示
        });
    }

    // 列表 / 文章是动态渲染的：内容区变化后重新扫描一次
    function watchDynamic() {
        const body = document.getElementById('contentBody');
        if (!body || !('MutationObserver' in window)) {
            // 兜底：定时补扫几次（写作助手页没有 contentBody 也无妨）
            let times = 0;
            const timer = setInterval(() => {
                watch(document);
                if (++times > 10) clearInterval(timer);
            }, 600);
            return;
        }
        new MutationObserver(() => watch(body)).observe(body, { childList: true, subtree: true });
    }

    /* ---------------- 初始化 ---------------- */

    function init() {
        // 保险：如果显现系统没跑起来（比如 Observer 被禁用），强制全部可见
        setTimeout(() => {
            const anyHidden = Array.prototype.some.call(
                document.querySelectorAll(REVEAL_SELECTOR),
                (n) => !n.classList.contains('in')
            );
            if (anyHidden && !('IntersectionObserver' in window)) {
                document.body.classList.add('no-glass-fx');
            }
        }, 1400);

        watch(document);
        watchDynamic();
        // 首屏元素直接点亮，不等滚动
        requestAnimationFrame(() => requestAnimationFrame(() => watch(document)));

        if (finePointer) {
            document.addEventListener('pointermove', onPointerMove, { passive: true });
            document.addEventListener('pointerleave', resetTilt);
            document.addEventListener('scroll', resetTilt, { passive: true });
        }
    }

    Blog.ui.glass = { init, watch, resetTilt };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
