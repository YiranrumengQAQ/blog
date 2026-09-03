/**
 * ui/icons.js — 全站统一的内联 SVG 图标库
 *
 * 为什么要有这个文件：
 * - 全站（阅读页 + 写作助手）都用同一套线性图标，不再使用 emoji。
 *   emoji 在不同系统/浏览器上长相不一致、颜色不受主题控制，还会被读屏软件念出来。
 * - 图标路径只写一份：HTML 里用占位符，JS 渲染的字符串用 Blog.ui.icons.svg()。
 *
 * 用法一：HTML 里放占位符（本文件加载后自动填充）
 *   <svg class="icon" data-icon="search" aria-hidden="true"></svg>
 *
 * 用法二：拼 HTML 字符串时
 *   Blog.ui.icons.svg('search')                  → 完整 <svg> 字符串
 *   Blog.ui.icons.svg('search', { class: 'x' })  → 指定 class
 *
 * 用法三：动态内容渲染完之后手动补一次
 *   Blog.ui.icons.hydrate(someElement)
 *
 * 图标风格：24x24 网格、描边 2px、圆角端点（与顶栏原有图标一致），
 * 颜色跟随 currentColor，因此亮/暗主题自动适配。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    /* ---------------- 图标路径表 ---------------- */

    const PATHS = {
        /* --- 通用操作 --- */
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.3 2.4 2.4 4.6-4.9"/>',
        copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        'arrow-left': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
        'arrow-up': '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
        'chevron-left': '<path d="m15 18-6-6 6-6"/>',
        'chevron-right': '<path d="m9 18 6-6-6-6"/>',

        /* --- 写作 / 文件 --- */
        feather: '<path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
        pen: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8a.5.5 0 0 1-.6-.6l.8-2.9a2 2 0 0 1 .5-.9z"/>',
        'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
        'file-down': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
        'file-plus': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
        braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
        'folder-open': '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-4.5-4.5L5 21"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
        quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
        code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
        list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
        minus: '<path d="M5 12h14"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
        'upload-cloud': '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9"/><path d="m8 16 4-4 4 4"/>',
        pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',

        /* --- 提示 / 状态 --- */
        'alert-triangle': '<path d="m10.3 3.9-8 13.9A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.2l-8-13.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        'alert-circle': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        'help-circle': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
        sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/><path d="M19 3v3"/><path d="M17.5 4.5h3"/>',
        eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',

        /* --- 主题 --- */
        sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5"/><path d="M12 19.5V22"/><path d="M4.9 4.9 6.7 6.7"/><path d="m17.3 17.3 1.8 1.8"/><path d="M2 12h2.5"/><path d="M19.5 12H22"/><path d="m4.9 19.1 1.8-1.8"/><path d="m17.3 6.7 1.8-1.8"/>',
        moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',

        /* --- 品牌：猫爪印（index.html 的 noscript 提示里有一份等价的静态内联版本） --- */
        paw: '<ellipse cx="6.6" cy="10.6" rx="1.9" ry="2.5"/><ellipse cx="10.4" cy="7" rx="1.9" ry="2.6"/><ellipse cx="14.6" cy="7" rx="1.9" ry="2.6"/><ellipse cx="18.4" cy="10.6" rx="1.9" ry="2.5"/><path d="M12.5 12.6c-3 0-5.9 2.4-5.9 5 0 1.7 1.4 2.9 3.1 2.9 1.1 0 1.9-.5 2.8-.5s1.7.5 2.8.5c1.7 0 3.1-1.2 3.1-2.9 0-2.6-2.9-5-5.9-5z"/>'
    };

    /* ---------------- 生成 / 填充 ---------------- */

    /** 图标是否存在（避免拼错名字时页面出现空白） */
    function has(name) {
        return Object.prototype.hasOwnProperty.call(PATHS, name);
    }

    /**
     * 返回一个完整的 <svg> 字符串。
     * @param {string} name 图标名
     * @param {object} [opts] { class: '额外类名', title: '无障碍标题' }
     */
    function svg(name, opts) {
        const body = PATHS[name];
        if (!body) {
            console.warn('[icons] 未知图标名:', name);
            return '';
        }
        const o = opts || {};
        const cls = 'icon' + (o.class ? ' ' + o.class : '');
        const label = o.title
            ? `<title>${String(o.title).replace(/</g, '&lt;')}</title>`
            : '';
        const aria = o.title ? 'role="img"' : 'aria-hidden="true"';
        return `<svg class="${cls}" viewBox="0 0 24 24" ${aria} focusable="false" ` +
            `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
            `stroke-linejoin="round">${label}${body}</svg>`;
    }

    /**
     * 把 root 里所有 <svg data-icon="名字"> 占位符填成真正的图标。
     * 已经是完整图标的节点（没有 data-icon）不会被动到。
     */
    function hydrate(root) {
        const scope = root || document;
        if (!scope || !scope.querySelectorAll) return;
        Array.prototype.forEach.call(scope.querySelectorAll('[data-icon]'), (node) => {
            const name = node.getAttribute('data-icon');
            const body = PATHS[name];
            if (!body) {
                console.warn('[icons] 未知图标名:', name);
                return;
            }
            // 允许用 data-icon-class 追加类名，用 data-icon-title 提供无障碍标题
            const extra = node.getAttribute('data-icon-class');
            node.setAttribute('class', ('icon' + (extra ? ' ' + extra : '') +
                ' ' + (node.getAttribute('class') || '')).trim());
            node.setAttribute('viewBox', '0 0 24 24');
            node.setAttribute('fill', 'none');
            node.setAttribute('stroke', 'currentColor');
            node.setAttribute('stroke-width', node.getAttribute('data-icon-stroke') || '2');
            node.setAttribute('stroke-linecap', 'round');
            node.setAttribute('stroke-linejoin', 'round');
            node.setAttribute('focusable', 'false');
            const title = node.getAttribute('data-icon-title');
            if (title) {
                node.setAttribute('role', 'img');
                node.removeAttribute('aria-hidden');
            } else if (!node.getAttribute('aria-label')) {
                node.setAttribute('aria-hidden', 'true');
            }
            node.innerHTML = (title ? `<title>${title}</title>` : '') + body;
        });
    }

    Blog.ui.icons = { svg, hydrate, has, names: Object.keys(PATHS) };

    // 脚本是 defer 加载的，执行时 DOM 已解析完，可以直接填充一次
    hydrate(document);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => hydrate(document));
    }
})();
