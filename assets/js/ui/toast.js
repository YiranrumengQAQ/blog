/**
 * ui/toast.js — 轻提示 (Toast)
 * showToast(message, type, duration)
 * type: 'info' | 'success' | 'error'
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    let container = null;

    function ensureContainer() {
        if (container && document.body.contains(container)) return container;
        container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration || (type === 'error' ? 4200 : 2600);
        const box = ensureContainer();
        const toast = document.createElement('div');
        toast.className = 'toast' + (type !== 'info' ? ' toast-' + type : '');
        toast.textContent = message;
        box.appendChild(toast);

        const remove = () => {
            if (!toast.parentNode) return;
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', (e) => {
                if (e.animationName === 'toastOut') toast.remove();
            });
            // 兜底：动画事件丢失时直接移除
            setTimeout(() => toast.remove(), 600);
        };
        setTimeout(remove, duration);
        return toast;
    }

    Blog.ui.toast = { show: showToast };
})();
