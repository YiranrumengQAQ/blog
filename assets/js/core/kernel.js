/**
 * core/kernel.js — BlogKernel 博客内核
 *
 * 职责：
 * - 加载 config.json 与 posts/manifest.json
 * - 解析文章 front matter，与 manifest 信息智能合并
 * - 后台预取全部文章（限并发），构建分类 / 标签 / 归档 / 全文搜索索引
 * - 提供文章查询、详情获取、上下篇导航等 API
 *
 * 相比旧版的改进：
 * - 列表页不再为每张卡片单独请求文章全文（修复 N+1 请求问题）
 * - 搜索升级为全文搜索（标题 / 摘要 / 正文 / 分类 / 标签）
 * - 日期全部按本地时区解析（修复归档月份偏移 bug）
 * - "上一篇 / 下一篇"按时间顺序计算，不再被置顶文章打断
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.core = Blog.core || {};

    const { parseDate, monthKey, makeSummary, calcReadingTime } = Blog.utils;
    const { parseFrontMatter } = Blog.core;

    const DEFAULT_CATEGORY = '默认分类';

    class BlogKernel {
        constructor(options = {}) {
            this.configUrl = options.configUrl || './config.json';
            this.manifestUrl = options.manifestUrl || './posts/manifest.json';
            this.postsDir = options.postsDir || './posts/';
            this.config = {};
            this.postsIndex = [];
            this.postsCache = new Map();
            this.categories = {};
            this.tags = {};
            this.archives = {};
            this.hydrated = false;
            this.failedSlugs = [];
            this.hooks = {
                onProgress: options.onProgress || (() => {}),
                onError: options.onError || (() => {})
            };
        }

        /** 初始化：加载配置与文章目录（立即返回，文章正文随后台预取） */
        async init() {
            const [configRes, manifestRes] = await Promise.all([
                fetchJSON(this.configUrl, 'config.json 加载失败'),
                fetchJSON(this.manifestUrl, 'posts/manifest.json 加载失败')
            ]);
            this.config = normalizeConfig(configRes);
            this.postsIndex = normalizePosts(manifestRes);
            this._buildTaxonomies();
            return this;
        }

        /** 排序：置顶优先，其余按日期从新到旧 */
        sortPosts(list) {
            return [...list].sort((a, b) => {
                const sa = !!a.sticky;
                const sb = !!b.sticky;
                if (sa !== sb) return sb ? 1 : -1;
                const da = parseDate(a.date);
                const db = parseDate(b.date);
                return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
            });
        }

        /** 纯时间顺序（忽略置顶），用于上一篇 / 下一篇 */
        _chronoList() {
            return [...this.postsIndex].sort((a, b) => {
                const da = parseDate(a.date);
                const db = parseDate(b.date);
                return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
            });
        }

        /** 构建分类 / 标签 / 归档索引 */
        _buildTaxonomies() {
            this.categories = {};
            this.tags = {};
            this.archives = {};
            for (const post of this.postsIndex) {
                const cat = post.category || DEFAULT_CATEGORY;
                (this.categories[cat] = this.categories[cat] || []).push(post);
                for (const tag of post.tags || []) {
                    (this.tags[tag] = this.tags[tag] || []).push(post);
                }
                const mk = monthKey(post.date);
                if (mk) (this.archives[mk] = this.archives[mk] || []).push(post);
            }
        }

        /**
         * 后台预取全部文章（限制并发），完成后重建索引。
         * 好处：封面 / 摘要 / 全文搜索一次就绪，列表渲染零额外请求。
         */
        async hydrateAll({ concurrency = 6, onProgress } = {}) {
            const queue = this.postsIndex.map((p) => p.slug);
            const total = queue.length;
            if (total === 0) {
                this.hydrated = true;
                return this;
            }
            let done = 0;
            this.failedSlugs = [];
            const workers = Array.from(
                { length: Math.min(concurrency, total) },
                async () => {
                    while (queue.length) {
                        const slug = queue.shift();
                        try {
                            await this.getPostDetail(slug);
                        } catch (e) {
                            this.failedSlugs.push(slug);
                            console.warn('[BlogKernel] 文章加载失败:', slug, e);
                        }
                        done += 1;
                        if (onProgress) onProgress(done, total);
                    }
                }
            );
            await Promise.all(workers);

            // 合并 front matter 元数据后重新排序、重建索引
            this.postsIndex = this.sortPosts(this.postsIndex);
            this._buildTaxonomies();
            this.hydrated = true;
            return this;
        }

        /** 获取已缓存的详情（不发起请求） */
        getCachedDetail(slug) {
            return this.postsCache.get(slug) || null;
        }

        /** 获取文章详情（带缓存） */
        async getPostDetail(slug) {
            if (this.postsCache.has(slug)) return this.postsCache.get(slug);
            try {
                const url = this.postsDir + encodeURIComponent(slug) + '.md';
                const response = await fetch(url);
                if (!response.ok) throw new Error(`文章 ${slug}.md 请求失败 (HTTP ${response.status})`);
                const rawMarkdown = await response.text();
                const parsed = parseFrontMatter(rawMarkdown);

                const base = this.postsIndex.find((p) => p.slug === slug) || { slug };
                const meta = sanitizedMeta(parsed.metadata);

                // front matter 优先于 manifest（改文章即改信息，所见即所得）
                const merged = Object.assign({}, base, meta, { slug });
                if (!merged.title) merged.title = slug;
                if (!merged.category) merged.category = DEFAULT_CATEGORY;
                if (!Array.isArray(merged.tags)) merged.tags = merged.tags ? [String(merged.tags)] : [];

                merged.content = parsed.content;
                merged.wordCount = parsed.content.replace(/\s+/g, '').length;
                merged.readingTime = calcReadingTime(parsed.content);

                // 封面：front matter cover > manifest cover > 正文第一张图
                let cover = merged.cover || null;
                if (!cover) {
                    const m = parsed.content.match(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/);
                    cover = m ? m[1] : null;
                }
                merged.coverImage = resolveImageUrl(cover, this.postsDir);

                // 摘要：front matter summary > manifest summary > 自动截取
                if (!merged.summary) {
                    merged.summary = makeSummary(parsed.content, 110);
                } else {
                    merged.summary = String(merged.summary);
                }

                // 全文搜索索引
                merged._searchText = [
                    merged.title, merged.summary, merged.category,
                    (merged.tags || []).join(' '), parsed.content
                ].join(' ').toLowerCase().replace(/\s+/g, ' ');

                this.postsCache.set(slug, merged);

                // 将元数据同步回索引，供列表 / 侧栏 / 搜索使用
                const idx = this.postsIndex.findIndex((p) => p.slug === slug);
                if (idx !== -1) {
                    const ref = this.postsIndex[idx];
                    ref.title = merged.title;
                    ref.date = merged.date || ref.date;
                    ref.category = merged.category;
                    ref.tags = merged.tags;
                    ref.sticky = !!merged.sticky;
                    ref.summary = merged.summary;
                    ref.cover = merged.cover || ref.cover;
                    ref.readingTime = merged.readingTime;
                }
                return merged;
            } catch (error) {
                this.hooks.onError(`获取文章详情失败: ${slug}`, error);
                throw error;
            }
        }

        /** 按条件查询文章（分类 / 标签 / 归档 / 关键词全文搜索 + 分页） */
        queryPosts(params = {}) {
            const {
                category = null, tag = null, archive = null,
                keyword = null, page = 1, perPage = this.config.perPage || 5
            } = params;

            let result = [...this.postsIndex];
            if (category) result = result.filter((p) => (p.category || DEFAULT_CATEGORY) === category);
            if (tag) result = result.filter((p) => (p.tags || []).includes(tag));
            if (archive) result = result.filter((p) => monthKey(p.date) === archive);
            if (keyword) {
                const low = String(keyword).toLowerCase().trim();
                if (low) {
                    result = result.filter((p) => {
                        const d = this.postsCache.get(p.slug);
                        if (d && d._searchText) return d._searchText.includes(low);
                        const hay = [
                            p.title, p.summary, p.category, (p.tags || []).join(' ')
                        ].join(' ').toLowerCase();
                        return hay.includes(low);
                    });
                }
            }

            const totalItems = result.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
            const currentPage = Math.min(Math.max(1, page), totalPages);
            const start = (currentPage - 1) * perPage;
            return {
                items: result.slice(start, start + perPage),
                pagination: {
                    currentPage, perPage, totalItems, totalPages,
                    hasNext: currentPage < totalPages,
                    hasPrev: currentPage > 1
                }
            };
        }

        /** 上一篇 / 下一篇（按时间顺序，忽略置顶） */
        getAdjacentPosts(slug) {
            const chrono = this._chronoList();
            const index = chrono.findIndex((p) => p.slug === slug);
            return {
                prevPost: index > 0 ? chrono[index - 1] : null,
                nextPost: index !== -1 && index < chrono.length - 1 ? chrono[index + 1] : null
            };
        }

        // 兼容旧 API 名
        _getAdjacentPosts(slug) { return this.getAdjacentPosts(slug); }

        /** 侧边栏所需的分类 / 标签 / 归档统计数据 */
        getTaxonomyData() {
            const toList = (obj) => Object.keys(obj)
                .map((name) => ({ name, count: obj[name].length }))
                .sort((a, b) => b.count - a.count);
            return {
                categories: toList(this.categories),
                tags: toList(this.tags),
                archives: toList(this.archives).sort((a, b) => b.name.localeCompare(a.name)),
                totalPosts: this.postsIndex.length
            };
        }

        clearCache() {
            this.postsCache.clear();
            this.hydrated = false;
        }
    }

    /* ---------- 内部工具 ---------- */

    async function fetchJSON(url, errMsg) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(errMsg + ` (HTTP ${res.status})`);
        try {
            return await res.json();
        } catch (e) {
            throw new Error(errMsg + '（JSON 格式有误）');
        }
    }

    function normalizeConfig(raw) {
        const c = raw && typeof raw === 'object' ? raw : {};
        return {
            blogName: c.blogName || '我的博客',
            author: c.author || '',
            description: c.description || '',
            perPage: Math.max(1, parseInt(c.perPage, 10) || 5)
        };
    }

    function normalizePosts(list) {
        if (!Array.isArray(list)) return [];
        return list
            .filter((e) => e && e.slug)
            .map((e) => {
                const post = Object.assign({}, e);
                post.slug = String(e.slug).replace(/\.md$/i, '');
                post.title = e.title || post.slug;
                post.category = e.category || DEFAULT_CATEGORY;
                post.tags = Array.isArray(e.tags) ? e.tags : (e.tags ? [String(e.tags)] : []);
                post.sticky = !!e.sticky;
                post.date = e.date || '';
                return post;
            });
    }

    /** 清洗 front matter 元数据：只保留已知字段 */
    function sanitizedMeta(meta) {
        const out = {};
        const keys = ['title', 'date', 'category', 'tags', 'sticky', 'cover', 'summary', 'author'];
        for (const k of keys) {
            if (meta[k] !== undefined && meta[k] !== '') out[k] = meta[k];
        }
        return out;
    }

    /** 相对路径图片补全为相对 posts 目录的地址 */
    function resolveImageUrl(url, postsDir) {
        if (!url) return null;
        url = String(url).trim();
        if (!url) return null;
        if (/^(https?:|\/\/|data:)/i.test(url)) return url;
        if (url.startsWith('/')) return url;
        if (url.startsWith('./')) url = url.slice(2);
        return postsDir + url;
    }

    Blog.core.BlogKernel = BlogKernel;
})();
