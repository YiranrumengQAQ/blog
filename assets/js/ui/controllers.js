/**
 * ui/controllers.js — 视觉模块生命周期注册表
 *
 * 对应审阅意见 B 级 21~25：RainController / GlassController / DropController /
 * ThemeController / StorageController 要有统一的生命周期，而不是每个模块
 * 各自在文件底部偷偷 init()。
 *
 * 约定：每个视觉模块都暴露 { init, destroy?, refresh? }，在这里登记之后：
 *
 *   Blog.controllers.list()        查看当前注册了哪些控制器与它们的能力
 *   Blog.controllers.refreshAll()  路由切页 / 语言切换后统一刷新
 *   Blog.controllers.destroyAll()  卸载全部（调试、或嵌入式场景下需要）
 *   Blog.controllers.get('rain')   拿到某个控制器
 *
 * 之所以是「注册表」而不是「基类」：现有模块都是 IIFE 单例，强行改成 class
 * 会牵动每一个调用点；注册表能在不动既有代码的前提下，把生命周期收成一处，
 * 并且让「谁可销毁、谁不可销毁」在控制台里一眼可见。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const registry = new Map();

    function register(name, mod, meta) {
        if (!mod) return null;
        registry.set(name, { name, mod, meta: meta || {} });
        return mod;
    }

    function get(name) {
        const entry = registry.get(name);
        return entry ? entry.mod : null;
    }

    function call(name, method, args) {
        const entry = registry.get(name);
        if (!entry || typeof entry.mod[method] !== 'function') return false;
        try {
            entry.mod[method].apply(entry.mod, args || []);
            return true;
        } catch (e) {
            console.warn('[controllers] ' + name + '.' + method + ' 失败:', e);
            return false;
        }
    }

    function refreshAll(arg) {
        registry.forEach((entry) => {
            if (typeof entry.mod.refresh === 'function') call(entry.name, 'refresh', [arg]);
        });
    }

    function destroyAll() {
        registry.forEach((entry) => {
            if (typeof entry.mod.destroy === 'function') call(entry.name, 'destroy');
        });
    }

    function list() {
        return Array.from(registry.values()).map((e) => ({
            name: e.name,
            init: typeof e.mod.init === 'function',
            destroy: typeof e.mod.destroy === 'function',
            refresh: typeof e.mod.refresh === 'function',
            tier: e.meta.tier || '-'
        }));
    }

    /** 全部脚本 defer 加载完之后再登记，保证各模块已经挂到 Blog.ui 上 */
    function boot() {
        register('storage', Blog.storage, { tier: 'state' });
        register('theme', Blog.ui.theme, { tier: 'state' });
        register('rain', Blog.ui.rain, { tier: 'T0 背景 / 雨幕' });
        register('glass', Blog.ui.glass, { tier: 'T1 玻璃交互' });
        register('fx', Blog.ui.fx, { tier: 'T1/T4 材质反馈' });
        register('reader', Blog.ui.reader, { tier: 'T3 阅读层' });
        register('palette', Blog.ui.palette, { tier: 'T4 浮层' });
        register('modal', Blog.ui.modal, { tier: 'T4 浮层' });
        register('toast', Blog.ui.toast, { tier: 'T4 浮层' });
    }

    Blog.controllers = { register, get, call, refreshAll, destroyAll, list };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
