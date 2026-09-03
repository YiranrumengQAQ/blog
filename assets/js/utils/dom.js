/**
 * utils/dom.js — DOM 基础工具
 * 提供 $ / $$ 选择器、HTML 转义、防抖等通用函数
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.utils = Blog.utils || {};

    /** 选择第一个匹配元素 */
    const $ = (sel, root) => (root || document).querySelector(sel);

    /** 选择所有匹配元素（返回数组） */
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    /** HTML 文本转义（防 XSS） */
    function escapeHTML(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    /** HTML 属性转义（别名，语义更清晰） */
    const escapeAttr = escapeHTML;

    /** 防抖：延迟 ms 毫秒执行，期间重复调用会重置计时 */
    function debounce(fn, ms) {
        let timer = null;
        const wrapped = function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
        wrapped.cancel = () => clearTimeout(timer);
        return wrapped;
    }

    /** 安全复制文本到剪贴板（兼容非 https 环境） */
    function copyText(text) {
        return new Promise((resolve, reject) => {
            const done = (ok) => (ok ? resolve() : reject(new Error('copy failed')));
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => done(true), () => fallback());
            } else {
                fallback();
            }
            function fallback() {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    const ok = document.execCommand('copy');
                    ta.remove();
                    done(ok);
                } catch (e) {
                    done(false);
                }
            }
        });
    }

    Blog.utils.$ = $;
    Blog.utils.$$ = $$;
    Blog.utils.escapeHTML = escapeHTML;
    Blog.utils.escapeAttr = escapeAttr;
    Blog.utils.debounce = debounce;
    Blog.utils.copyText = copyText;
})();
