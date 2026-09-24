/**
 * ui/toast.js — 轻提示系统 (Toast)
 *
 *   Blog.ui.toast.show(message, type, duration)
 *   Blog.ui.toast.show({ message, type, duration, action: { label, onClick }, sticky })
 *
 * 分级（时长符合「越严重看得越久」）：
 *   success  ✓  2600ms
 *   info     i  2600ms
 *   warn     !  3600ms
 *   error    ×  5200ms
 *   sticky      不自动消失，只能点 × 或点动作按钮关掉
 *
 * 支持撤销：show({ message: '文章已删除', action: { label: '撤销', onClick } })
 * 同一条消息重复触发时合并计数，不会刷屏。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const icon = (name) => (Blog.ui.icons ? Blog.ui.icons.svg(name) : '');

    const TYPES = {
        success: { icon: 'check-circle', duration: 2600 },
        info: { icon: 'info', duration: 2600 },
        warn: { icon: 'alert-triangle', duration: 3600 },
        error: { icon: 'alert-circle', duration: 5200 }
    };

    let container = null;
    const live = new Map();   // message → { node, countEl, count, timer }

    function ensureContainer() {
        if (container && document.body.contains(container)) return container;
        container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        return container;
    }

    function removeToast(node, key) {
        if (!node || !node.parentNode) return;
        node.classList.add('toast-out');
        node.addEventListener('animationend', (e) => {
            if (e.animationName === 'toastOut') node.remove();
        });
        setTimeout(() => node.remove(), 600);   // 兜底：动画事件丢失也要走
        if (key) live.delete(key);
    }

    function showToast(message, type, duration) {
        // 对象式调用：show({ message, type, action, sticky, duration })
        let opts = {};
        if (message && typeof message === 'object') {
            opts = message;
            message = opts.message;
            type = opts.type;
            duration = opts.duration;
        }
        type = TYPES[type] ? type : 'info';
        const conf = TYPES[type];
        const sticky = !!opts.sticky || type === 'error' && opts.sticky !== false && opts.important === true;
        duration = duration || conf.duration;

        const box = ensureContainer();
        const key = type + '::' + message + '::' + (opts.action ? opts.action.label : '');

        // 同一条消息连续触发：只更新计数与倒计时，不再堆一屏
        const existing = live.get(key);
        if (existing && existing.node.parentNode && !opts.action) {
            existing.count += 1;
            existing.countEl.textContent = '×' + existing.count;
            existing.countEl.hidden = false;
            clearTimeout(existing.timer);
            if (!sticky) existing.timer = setTimeout(() => removeToast(existing.node, key), duration);
            return existing.node;
        }

        const node = document.createElement('div');
        node.className = 'toast toast-' + type + (sticky ? ' toast-sticky' : '');
        node.innerHTML =
            '<span class="toast-icon" aria-hidden="true">' + icon(conf.icon) + '</span>' +
            '<span class="toast-msg"></span>' +
            '<span class="toast-count" hidden></span>';
        node.querySelector('.toast-msg').textContent = message == null ? '' : String(message);

        let timer = 0;

        if (opts.action && typeof opts.action.onClick === 'function') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toast-action';
            btn.textContent = opts.action.label || '撤销';
            btn.addEventListener('click', () => {
                clearTimeout(timer);
                try { opts.action.onClick(); } finally { removeToast(node, key); }
            });
            node.appendChild(btn);
        }

        if (sticky) {
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'toast-close';
            close.setAttribute('aria-label', 'Close');
            close.innerHTML = icon('x');
            close.addEventListener('click', () => removeToast(node, key));
            node.appendChild(close);
        }

        // 鼠标停在提示上时暂停倒计时——正在读的东西不该被抽走
        const start = () => {
            if (sticky) return;
            clearTimeout(timer);
            timer = setTimeout(() => removeToast(node, key), duration);
        };
        node.addEventListener('mouseenter', () => clearTimeout(timer));
        node.addEventListener('mouseleave', start);

        box.appendChild(node);
        live.set(key, { node, countEl: node.querySelector('.toast-count'), count: 1, timer: 0 });
        start();
        live.get(key).timer = timer;
        return node;
    }

    /** 语义化快捷方式 */
    const api = {
        show: showToast,
        success: (m, o) => showToast(Object.assign({ message: m, type: 'success' }, o || {})),
        info: (m, o) => showToast(Object.assign({ message: m, type: 'info' }, o || {})),
        warn: (m, o) => showToast(Object.assign({ message: m, type: 'warn' }, o || {})),
        error: (m, o) => showToast(Object.assign({ message: m, type: 'error' }, o || {})),
        /** 带撤销的提示：undo(文案, 撤销回调) */
        undo: (m, onUndo, label) => showToast({
            message: m, type: 'success', duration: 6000,
            action: { label: label || (Blog.i18n ? Blog.i18n.t('toast.undo') : '撤销'), onClick: onUndo }
        }),
        dismissAll: () => { live.forEach((v, k) => removeToast(v.node, k)); }
    };

    Blog.ui.toast = api;
})();
