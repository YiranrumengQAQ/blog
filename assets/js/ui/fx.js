/**
 * ui/fx.js — 玻璃材质的「微物理」反馈层（B 级：玩到极致）
 *
 *   1. 水波纹点击：按钮被按下时，从指针落点扩散一圈极轻的水环（26）
 *   2. 闪电反光：雨幕打闪时，所有玻璃表面同步掠过一道冷光（24）
 *   3. 滚动高光：文章玻璃的镜面高光角度随滚动缓慢变化（28）
 *   4. 指针邻域折射：光斑附近的玻璃边缘折射增强（21）
 *
 * 全部走 CSS 自定义属性 + 合成层，JS 只负责写变量，不直接改样式。
 * prefers-reduced-motion 下整层自动关闭。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 忽略 */ }

    const RIPPLE_SELECTOR = [
        'button', '.glass-btn', '.sidebar-cat-item', '.sidebar-archive-item',
        '.sidebar-tag', '.card-tag', '.card-category', '.page-btn',
        '.article-nav-item', '.palette-item'
    ].join(',');

    /* ---------------- 1. 水波纹 ---------------- */

    function ripple(e) {
        const host = e.target && e.target.closest ? e.target.closest(RIPPLE_SELECTOR) : null;
        if (!host || host.disabled) return;
        const rect = host.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return;

        // 波纹必须能被裁剪在按钮内部；不给静态定位的元素加，免得跑到页面角上
        const cs = getComputedStyle(host);
        if (cs.position === 'static') host.style.position = 'relative';

        const dot = document.createElement('span');
        dot.className = 'water-ripple';
        const size = Math.max(rect.width, rect.height) * 1.6;
        const x = (e.clientX || rect.left + rect.width / 2) - rect.left;
        const y = (e.clientY || rect.top + rect.height / 2) - rect.top;
        dot.style.width = dot.style.height = size.toFixed(1) + 'px';
        dot.style.left = (x - size / 2).toFixed(1) + 'px';
        dot.style.top = (y - size / 2).toFixed(1) + 'px';
        host.appendChild(dot);
        // 动画结束即自毁：绝不在 DOM 里留残骸
        const kill = () => dot.remove();
        dot.addEventListener('animationend', kill, { once: true });
        setTimeout(kill, 900);
    }

    /* ---------------- 2. 闪电反光 ---------------- */

    let flashTimer = 0;

    function onLightning(e) {
        const power = (e && e.detail && e.detail.power) || 1;
        const root = document.documentElement;
        root.style.setProperty('--flash-power', Math.min(1, power).toFixed(2));
        document.body.classList.remove('glass-flash');
        void document.body.offsetWidth;            // 重排，保证连续两次闪电都能播
        document.body.classList.add('glass-flash');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => document.body.classList.remove('glass-flash'), 620);
    }

    /* ---------------- 3. 滚动高光 + 4. 指针邻域 ---------------- */

    let raf = 0;
    let lastY = -1;

    function onScroll() {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            const y = window.scrollY;
            if (y === lastY) return;
            lastY = y;
            const doc = document.documentElement;
            const total = Math.max(1, doc.scrollHeight - window.innerHeight);
            const p = Math.min(1, y / total);
            // 高光角度随阅读进度在 128deg ~ 172deg 之间缓慢游走：
            // 像是你在雨夜里慢慢走过一块玻璃，反射角一直在变
            doc.style.setProperty('--sheen-angle', (128 + p * 44).toFixed(1) + 'deg');
            doc.style.setProperty('--sheen-shift', (p * 100).toFixed(1) + '%');
        });
    }

    function onPointer(e) {
        const doc = document.documentElement;
        doc.style.setProperty('--px', e.clientX.toFixed(0) + 'px');
        doc.style.setProperty('--py', e.clientY.toFixed(0) + 'px');
    }

    function init() {
        if (reduced) return;           // 「减少动态」：整层不启用
        document.addEventListener('pointerdown', ripple, { passive: true });
        document.addEventListener('blog:lightning', onLightning);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        let fine = true;
        try { fine = window.matchMedia('(pointer: fine)').matches; } catch (err) { /* 忽略 */ }
        if (fine) document.addEventListener('pointermove', onPointer, { passive: true });
    }

    Blog.ui.fx = { init, ripple };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
