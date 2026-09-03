/**
 * core/i18n.js — 多语言（i18n）核心
 *
 * 设计目标：加一门新语言 = 在 locales/ 里放一个 JSON 文件 + 在 config.json 里登记，
 * 不用改任何 JS / HTML。
 *
 * 语言包（locales/xx.json）结构：
 *   {
 *     "meta":   { "name": "English", "htmlLang": "en", "dir": "ltr" },
 *     "format": { "dateLong": "{mon} {d}, {y}", "monthLong": "{mon} {y}", ... },
 *     "nav":    { "searchPlaceholder": "Search posts…" },
 *     ...
 *   }
 *
 * 用法：
 *   Blog.i18n.t('nav.searchPlaceholder')          → 取文案
 *   Blog.i18n.t('list.resultCount', { n: 3 })     → 带占位符 {n}
 *   Blog.i18n.formatDate('2026-05-19')            → 按当前语言格式化日期
 *   Blog.i18n.applyToDOM(document)                → 填充所有 data-i18n 节点
 *
 * HTML 里标记文案：
 *   <h3 data-i18n="sidebar.categories">分类目录</h3>
 *   <input data-i18n-attr="placeholder:nav.searchPlaceholder;aria-label:nav.searchAria">
 *
 * 语言优先级：用户上次选择(localStorage) > 浏览器语言 > config.defaultLanguage。
 * 任何一步失败都会退回默认语言，页面不会白屏。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.core = Blog.core || {};

    const STORAGE_KEY = 'blog-lang';
    const BUILTIN_FALLBACK = 'zh-CN';       // 连 config.json 都读不到时的兜底语言
    const EVENT_NAME = 'blog:localechange';

    const dicts = Object.create(null);      // code -> 语言包对象
    let current = BUILTIN_FALLBACK;         // 当前语言
    let fallbackCode = BUILTIN_FALLBACK;    // 缺词时回退的语言
    let languages = [];                     // [{ code, name }] 可选语言列表
    let localesDir = './locales/';

    const $$ = (sel, root) => {
        const scope = root || document;
        return Array.from(scope.querySelectorAll(sel));
    };

    /* ---------------- 语言包读取 ---------------- */

    /** 按 "a.b.c" 取字符串值 */
    function lookup(dict, key) {
        if (!dict || !key) return undefined;
        let cur = dict;
        for (const part of String(key).split('.')) {
            if (cur === null || typeof cur !== 'object') return undefined;
            cur = cur[part];
        }
        return typeof cur === 'string' ? cur : undefined;
    }

    /** 按 "a.b.c" 取任意类型的原始值（数组 / 数字 / 对象） */
    function get(key, def) {
        const val = lookupRaw(current, key) !== undefined ? lookupRaw(current, key)
            : lookupRaw(fallbackCode, key);
        return val === undefined ? def : val;
    }

    function lookupRaw(code, key) {
        const dict = dicts[code];
        if (!dict || !key) return undefined;
        let cur = dict;
        for (const part of String(key).split('.')) {
            if (cur === null || typeof cur !== 'object') return undefined;
            cur = cur[part];
        }
        return cur;
    }

    /** 取数字配置（取不到就用默认值） */
    function num(key, def) {
        const v = Number(get(key, def));
        return Number.isFinite(v) ? v : def;
    }

    function interpolate(str, vars) {
        if (!vars) return str;
        return str.replace(/\{(\w+)\}/g, (m, name) => (
            vars[name] === undefined ? m : String(vars[name])
        ));
    }

    /** 在指定语言里找 key；n === 1 时优先用 key_one（简单复数规则） */
    function resolveFrom(code, key, vars) {
        let str = lookup(dicts[code], key);
        if (str !== undefined && vars && Number(vars.n) === 1) {
            const one = lookup(dicts[code], key + '_one');
            if (one !== undefined) str = one;
        }
        return str;
    }

    /** 主入口：取文案，找不到就回退默认语言，再找不到就原样返回 key */
    function t(key, vars) {
        let str = resolveFrom(current, key, vars);
        if (str === undefined && current !== fallbackCode) {
            str = resolveFrom(fallbackCode, key, vars);
        }
        if (str === undefined) return String(key);
        return interpolate(str, vars);
    }

    /* ---------------- 语言包加载 ---------------- */

    async function loadLocale(code) {
        const key = normalizeCode(code);
        if (!key) return null;
        if (dicts[key]) return dicts[key];
        try {
            const res = await fetch(localesDir + encodeURIComponent(key) + '.json');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || typeof data !== 'object') throw new Error('语言包格式有误');
            dicts[key] = data;
            return data;
        } catch (err) {
            console.warn('[i18n] 语言包加载失败，将回退默认语言:', key, err);
            return null;
        }
    }

    function normalizeCode(code) {
        return String(code == null ? '' : code).trim();
    }

    /** config.json 里 languages 允许写成 ["en"] 或 [{code:"en",name:"English"}] */
    function normalizeLanguages(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map((item) => {
                if (typeof item === 'string') return { code: normalizeCode(item), name: '' };
                if (item && typeof item === 'object') {
                    return { code: normalizeCode(item.code), name: normalizeCode(item.name) };
                }
                return null;
            })
            .filter((item) => item && item.code);
    }

    /** 可选语言列表（name 缺省时用语言包里的 meta.name） */
    function available() {
        return languages.map((item) => ({
            code: item.code,
            name: item.name || lookup(dicts[item.code], 'meta.name') || item.code
        }));
    }

    function isAllowed(code) {
        if (!code) return false;
        if (!languages.length) return true;               // 没配置列表就不设限
        return languages.some((item) => item.code.toLowerCase() === code.toLowerCase());
    }

    /** 浏览器语言匹配：先全码（zh-CN），再主码（zh） */
    function detectFromNavigator() {
        let tags = [];
        try {
            tags = navigator.languages && navigator.languages.length
                ? Array.from(navigator.languages)
                : [navigator.language];
        } catch (e) { tags = []; }
        for (const full of tags) {
            const code = normalizeCode(full);
            if (!code) continue;
            const exact = languages.find((l) => l.code.toLowerCase() === code.toLowerCase());
            if (exact) return exact.code;
            const base = code.split('-')[0].toLowerCase();
            const byBase = languages.find((l) => l.code.split('-')[0].toLowerCase() === base);
            if (byBase) return byBase.code;
        }
        return null;
    }

    function savedLocale() {
        try { return normalizeCode(localStorage.getItem(STORAGE_KEY)); } catch (e) { return ''; }
    }

    function saveLocale(code) {
        try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* 忽略 */ }
    }

    /* ---------------- 日期 / 数字（跟随语言） ---------------- */

    const pad2 = (n) => String(n).padStart(2, '0');

    function toDate(input) {
        if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
        return Blog.utils && Blog.utils.parseDate ? Blog.utils.parseDate(input) : null;
    }

    function applyPattern(pattern, vars) {
        // 注意顺序：先替换两位形式，避免 {m} 抢先吃掉 {mm}
        return String(pattern)
            .replace(/\{y\}/g, () => vars.y)
            .replace(/\{mm\}/g, () => pad2(vars.m))
            .replace(/\{m\}/g, () => vars.m)
            .replace(/\{dd\}/g, () => pad2(vars.d))
            .replace(/\{d\}/g, () => vars.d)
            .replace(/\{mon\}/g, () => vars.mon);
    }

    function monthName(monthIndex) {
        const months = get('format.months', []);
        return (Array.isArray(months) && months[monthIndex]) || String(monthIndex + 1);
    }

    /** 日期 → 当前语言的长日期（如 2026年5月19日 / May 19, 2026） */
    function formatDate(input) {
        const d = toDate(input);
        if (!d) return input ? String(input) : '';
        return applyPattern(t('format.dateLong', null) || '{y}-{mm}-{dd}', {
            y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), mon: monthName(d.getMonth())
        });
    }

    /**
     * 归档月份 → 当前语言写法。
     * 输入可以是稳定 key "2026-05"（推荐，切换语言不影响链接），
     * 也可以是 "2026-05-19" 或 Date。
     */
    function formatMonth(input) {
        const str = String(input == null ? '' : input).trim();
        const hit = str.match(/^(\d{4})-(\d{1,2})$/);
        let y;
        let m;
        if (hit) {
            y = Number(hit[1]);
            m = Number(hit[2]);
        } else {
            const d = toDate(input);
            if (!d) return str;
            y = d.getFullYear();
            m = d.getMonth() + 1;
        }
        return applyPattern(t('format.monthLong', null) || '{y}-{mm}', {
            y, m, d: 1, mon: monthName(m - 1)
        });
    }

    /** 阅读时长（分钟）：中文按字数、英文按字符数，速率写在语言包 format.charsPerMinute */
    function readingMinutes(content) {
        const per = Math.max(1, num('format.charsPerMinute', 350));
        const len = String(content == null ? '' : content).replace(/\s+/g, '').length;
        return Math.max(1, Math.ceil(len / per));
    }

    /** 字数统计：format.countMode = "chars"（按字符）或 "words"（按单词） */
    function countWords(content) {
        const text = String(content == null ? '' : content).trim();
        if (!text) return 0;
        if (get('format.countMode', 'chars') === 'words') return text.split(/\s+/).length;
        return text.replace(/\s+/g, '').length;
    }

    /* ---------------- 应用到页面 ---------------- */

    /** 把 data-i18n / data-i18n-attr 标记的节点全部填上当前语言的文案 */
    function applyToDOM(root) {
        const scope = root || document;
        $$('[data-i18n]', scope).forEach((node) => {
            node.textContent = t(node.getAttribute('data-i18n'));
        });
        $$('[data-i18n-attr]', scope).forEach((node) => {
            node.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
                const idx = pair.indexOf(':');
                if (idx < 0) return;
                const attr = pair.slice(0, idx).trim();
                const key = pair.slice(idx + 1).trim();
                if (attr && key) node.setAttribute(attr, t(key));
            });
        });
    }

    /** 同步 <html lang> / dir，并通知所有监听者重新渲染 */
    function applyMeta() {
        const html = document.documentElement;
        html.setAttribute('lang', get('meta.htmlLang', current) || current);
        const dir = get('meta.dir', 'ltr');
        if (dir) html.setAttribute('dir', dir);
    }

    function notify() {
        try {
            document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { locale: current } }));
        } catch (e) { /* 老浏览器忽略 */ }
    }

    /** 切换语言：加载语言包 → 记住选择 → 刷新页面文案 */
    async function setLocale(code) {
        const target = normalizeCode(code);
        if (!target || target === current) return current;
        const dict = await loadLocale(target);
        if (!dict) return current;               // 加载失败就保持原语言
        current = target;
        saveLocale(current);
        applyMeta();
        applyToDOM(document);
        notify();
        return current;
    }

    /** 当前语言代码 */
    function locale() { return current; }

    /** 当前语言的显示名 */
    function localeName(code) {
        const c = normalizeCode(code) || current;
        const item = languages.find((l) => l.code === c);
        return (item && item.name) || lookup(dicts[c], 'meta.name') || c;
    }

    /**
     * 初始化。
     * @param {object} options
     *   - configUrl       config.json 路径（读取 languages / defaultLanguage），默认 './config.json'
     *   - localesDir      语言包目录，默认 './locales/'
     *   - languages       直接指定可选语言（优先于 configUrl）
     *   - defaultLanguage 默认语言（优先于 configUrl）
     * @returns {Promise<string>} 最终生效的语言代码
     */
    async function init(options = {}) {
        localesDir = options.localesDir || localesDir;

        let cfgLanguages = options.languages;
        let cfgDefault = options.defaultLanguage;

        // 自己读一次 config.json：这样即使博客数据加载失败，错误提示也能用正确的语言
        if (cfgLanguages === undefined && options.configUrl !== null) {
            const url = options.configUrl || './config.json';
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const cfg = await res.json();
                    cfgLanguages = cfg && cfg.languages;
                    cfgDefault = cfg && cfg.defaultLanguage;
                }
            } catch (err) {
                console.warn('[i18n] 读取 config.json 失败，使用默认语言:', err);
            }
        }

        languages = normalizeLanguages(cfgLanguages);
        fallbackCode = normalizeCode(cfgDefault) ||
            (languages[0] && languages[0].code) || BUILTIN_FALLBACK;

        // 默认语言必须可用，否则退回内置兜底语言
        if (!(await loadLocale(fallbackCode))) {
            if (fallbackCode !== BUILTIN_FALLBACK && await loadLocale(BUILTIN_FALLBACK)) {
                fallbackCode = BUILTIN_FALLBACK;
            }
        }
        current = fallbackCode;

        // 用户偏好 → 浏览器语言
        const candidates = [];
        const saved = savedLocale();
        if (saved && isAllowed(saved)) candidates.push(saved);
        const nav = detectFromNavigator();
        if (nav && isAllowed(nav)) candidates.push(nav);

        for (const code of candidates) {
            if (code === current) break;
            if (await loadLocale(code)) { current = code; break; }
        }

        applyMeta();
        applyToDOM(document);
        return current;
    }

    Blog.i18n = {
        init,
        setLocale,
        locale,
        localeName,
        available,
        t,
        get,
        num,
        formatDate,
        formatMonth,
        readingMinutes,
        countWords,
        applyToDOM,
        EVENT: EVENT_NAME
    };
})();
