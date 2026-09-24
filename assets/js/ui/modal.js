/**
 * ui/modal.js — 玻璃确认框（替代原生 confirm）
 *
 *   Blog.ui.modal.confirm({
 *     title, message, confirmLabel, cancelLabel, extraLabel, danger
 *   }) → Promise<'confirm' | 'cancel' | 'extra'>
 *
 * 原则（对应体验清单第 5 条）：
 *   低风险操作（切主题 / 开关雨 / 换语言 / 回首页）绝不弹窗；
 *   只有高风险且不可逆的操作（清空内容、覆盖 manifest、丢稿离开）才打断，
 *   并且一定给「保存并离开」这类第三选项，而不是只有确定/取消。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const icon = (name) => (Blog.ui.icons ? Blog.ui.icons.svg(name) : '');

    let root = null;
    let resolveFn = null;
    let lastFocus = null;

    function build() {
        if (root && document.body.contains(root)) return root;
        root = document.createElement('div');
        root.className = 'glass-modal-layer';
        root.hidden = true;
        root.innerHTML =
            '<div class="glass-modal" role="alertdialog" aria-modal="true">' +
            '  <div class="glass-modal-icon" aria-hidden="true"></div>' +
            '  <h3 class="glass-modal-title"></h3>' +
            '  <p class="glass-modal-msg"></p>' +
            '  <div class="glass-modal-actions">' +
            '    <button type="button" class="glass-modal-btn cancel"></button>' +
            '    <button type="button" class="glass-modal-btn extra" hidden></button>' +
            '    <button type="button" class="glass-modal-btn confirm"></button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(root);

        root.addEventListener('click', (e) => {
            if (e.target === root) done('cancel');
            const btn = e.target.closest('.glass-modal-btn');
            if (!btn) return;
            if (btn.classList.contains('confirm')) done('confirm');
            else if (btn.classList.contains('extra')) done('extra');
            else done('cancel');
        });
        document.addEventListener('keydown', (e) => {
            if (root.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); done('cancel'); }
            if (e.key === 'Enter') { e.preventDefault(); done('confirm'); }
        });
        return root;
    }

    function done(result) {
        if (root) root.hidden = true;
        if (Blog.ui.sidebar) Blog.ui.sidebar.unlockBodyScroll();
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* 忽略 */ } }
        const fn = resolveFn;
        resolveFn = null;
        if (fn) fn(result);
    }

    function confirm(opts) {
        opts = opts || {};
        build();
        // 上一个还没关就先收掉，避免叠框
        if (resolveFn) done('cancel');

        root.querySelector('.glass-modal-icon').innerHTML = icon(opts.danger ? 'alert-triangle' : 'help-circle');
        root.querySelector('.glass-modal-title').textContent = opts.title || '';
        root.querySelector('.glass-modal-msg').textContent = opts.message || '';
        const cancel = root.querySelector('.cancel');
        const extra = root.querySelector('.extra');
        const ok = root.querySelector('.confirm');
        cancel.textContent = opts.cancelLabel || '取消';
        ok.textContent = opts.confirmLabel || '确定';
        ok.classList.toggle('is-danger', !!opts.danger);
        if (opts.extraLabel) { extra.hidden = false; extra.textContent = opts.extraLabel; }
        else extra.hidden = true;

        lastFocus = document.activeElement;
        root.hidden = false;
        if (Blog.ui.sidebar) Blog.ui.sidebar.lockBodyScroll();
        requestAnimationFrame(() => cancel.focus());

        return new Promise((resolve) => { resolveFn = resolve; });
    }

    Blog.ui.modal = { confirm };
})();
