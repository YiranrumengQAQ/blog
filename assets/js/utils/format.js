/**
 * utils/format.js — 格式化工具（与语言无关）
 * 日期解析（修复时区偏移 bug）、Markdown 摘要提取、阅读时长估算
 *
 * 注意：这里只做"算"，不做"写"。
 * 需要显示成 "2026年5月19日" / "May 19, 2026" 这类文案时，
 * 请用 Blog.i18n.formatDate / Blog.i18n.formatMonth（core/i18n.js）。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.utils = Blog.utils || {};

    /**
     * 安全解析日期。
     * 修复 bug：new Date('2026-05-19') 按 UTC 解析，
     * 在 UTC- 时区会"倒退"一天，导致归档月份 / 显示日期错误。
     * 这里对纯日期字符串按本地时区解析。
     */
    function parseDate(str) {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (m) {
            return new Date(+m[1], +m[2] - 1, +m[3]);
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    /**
     * 归档用的稳定 key："2026-05"。
     * 故意不含任何语言文字：这样切换界面语言时，
     * 侧栏归档、地址栏 #/list?archive=2026-05 都不会失效。
     * 显示文案交给 Blog.i18n.formatMonth()。
     */
    function monthKey(dateStr) {
        const d = parseDate(dateStr);
        if (!d) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    /** 去掉 Markdown 语法，得到纯文本（用于摘要 / 搜索） */
    function stripMarkdown(md) {
        return String(md || '')
            .replace(/```[\s\S]*?(?:```|$)/g, ' ')      // 代码块
            .replace(/`([^`]*)`/g, '$1')                 // 行内代码
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')       // 图片
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')     // 链接（保留文字）
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')          // 标题
            .replace(/^\s{0,3}>\s?/gm, '')               // 引用
            .replace(/^([-*_]\s*){3,}$/gm, ' ')          // 分割线
            .replace(/^(\s*)[-*+]\s+/gm, '$1')           // 无序列表
            .replace(/^(\s*)\d+\.\s+/gm, '$1')           // 有序列表
            .replace(/(\*\*|__)(.*?)\1/g, '$2')          // 加粗
            .replace(/(\*|_(?=\S))(.*?)\1/g, '$2')       // 斜体
            .replace(/~~(.*?)~~/g, '$1')                 // 删除线
            .replace(/<[^>]+>/g, ' ')                    // HTML 标签
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** 从正文生成摘要（默认 110 字） */
    function makeSummary(content, maxLen) {
        const text = stripMarkdown(content);
        maxLen = maxLen || 110;
        if (text.length <= maxLen) return text;
        return text.slice(0, maxLen) + '…';
    }

    /**
     * 阅读时长（分钟），至少 1 分钟。
     * @param {string} content   正文
     * @param {number} perMinute 每分钟可读的字符数（中文约 350，英文约 1000），
     *                           由语言包 format.charsPerMinute 提供
     */
    function calcReadingTime(content, perMinute) {
        const rate = Number(perMinute) > 0 ? Number(perMinute) : 350;
        const len = String(content || '').replace(/\s+/g, '').length;
        return Math.max(1, Math.ceil(len / rate));
    }

    /**
     * 字数统计。
     * @param {string} content 正文
     * @param {string} mode    'chars'（中文等：按非空白字符数）| 'words'（英文等：按单词数）
     */
    function countWords(content, mode) {
        const text = String(content || '').trim();
        if (!text) return 0;
        if (mode === 'words') return text.split(/\s+/).length;
        return text.replace(/\s+/g, '').length;
    }

    Blog.utils.parseDate = parseDate;
    Blog.utils.monthKey = monthKey;
    Blog.utils.stripMarkdown = stripMarkdown;
    Blog.utils.makeSummary = makeSummary;
    Blog.utils.calcReadingTime = calcReadingTime;
    Blog.utils.countWords = countWords;
})();
