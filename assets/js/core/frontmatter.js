/**
 * core/frontmatter.js — 文章头部信息 (Front Matter) 解析器
 *
 * 支持的极简格式（无需懂 YAML）：
 * ---
 * title: 文章标题
 * date: 2026-05-19
 * category: 生活
 * tags: [标签1, 标签2]        ← 也支持 tags: 标签1, 标签2
 * sticky: true
 * cover: https://example.com/cover.jpg
 * summary: 一句话摘要
 * ---
 *
 * 修复 bug：旧解析器会把所有含逗号的值（如标题 "爱你, 真的"）
 * 误判为数组；现在只有 tags 字段和 [..] 包裹的值才会按数组处理。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.core = Blog.core || {};

    const ARRAY_KEYS = new Set(['tags', 'tag']);
    const BOOL_KEYS = new Set(['sticky', 'top', 'pinned']);

    function stripQuotes(s) {
        s = s.trim();
        if (s.length >= 2) {
            const a = s[0];
            const b = s[s.length - 1];
            if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
                return s.slice(1, -1).trim();
            }
        }
        return s;
    }

    function splitList(raw) {
        return raw
            .replace(/^\[/, '')
            .replace(/\]$/, '')
            .split(',')
            .map((s) => stripQuotes(s))
            .filter(Boolean);
    }

    /**
     * 解析 Front Matter。
     * @param {string} raw 文章原始文本
     * @returns {{metadata: Object, content: string, hasFrontMatter: boolean}}
     */
    function parseFrontMatter(raw) {
        const text = String(raw || '').replace(/^\uFEFF/, '');
        const result = { metadata: {}, content: text, hasFrontMatter: false };

        // 容忍文件开头有空行 / 空白
        const trimmed = text.replace(/^\s+/, '');
        if (!trimmed.startsWith('---')) return result;

        const m = trimmed.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
        if (!m) return result;

        result.hasFrontMatter = true;
        result.content = trimmed.slice(m[0].length).replace(/^\r?\n/, '');

        const lines = m[1].split(/\r?\n/);
        for (const line of lines) {
            if (!line.trim() || /^\s*#/.test(line)) continue;
            const idx = line.indexOf(':');
            if (idx <= 0) continue;
            const key = line.slice(0, idx).trim();
            let value = line.slice(idx + 1).trim();
            if (value === '') continue;

            if (value.startsWith('[') && value.endsWith(']')) {
                value = splitList(value);
            } else if (ARRAY_KEYS.has(key.toLowerCase())) {
                value = value.includes(',') ? splitList(value) : [stripQuotes(value)];
            } else {
                value = stripQuotes(value);
                if (BOOL_KEYS.has(key.toLowerCase())) {
                    value = /^(true|yes|1)$/i.test(String(value));
                }
            }
            result.metadata[key] = value;
        }
        return result;
    }

    Blog.core.parseFrontMatter = parseFrontMatter;
})();
