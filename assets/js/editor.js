/**
 * editor.js — 写作助手逻辑
 *
 * 面向零基础用户：
 * - 填表单 + 写正文 → 一键生成标准 .md 文件和 manifest.json
 * - 导入现有 posts 文件夹后可编辑旧文章，manifest 自动合并（防止覆盖丢失）
 * - 草稿自动保存在浏览器 localStorage
 * - 纯前端实现，双击打开或部署后都能用（无需服务器、无需构建）
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    const { $, $$, escapeHTML, debounce } = Blog.utils;
    const { makeSummary, calcReadingTime } = Blog.utils;
    const { parseFrontMatter } = Blog.core;

    /* ---------------- 状态 ---------------- */

    const els = {
        fTitle: $('#fTitle'), fDate: $('#fDate'), fCategory: $('#fCategory'),
        fTags: $('#fTags'), fCover: $('#fCover'), fSummary: $('#fSummary'),
        fSticky: $('#fSticky'), fContent: $('#fContent'), fSlug: $('#fSlug'),
        previewMeta: $('#previewMeta'), previewTitle: $('#previewTitle'),
        previewCover: $('#previewCover'), previewContent: $('#previewContent'),
        wordCount: $('#wordCount'), importNote: $('#importNote'),
        existingSelect: $('#existingSelect'), manifestWarn: $('#manifestWarn'),
        importDirInput: $('#importDirInput'), importFilesInput: $('#importFilesInput'),
        toastContainer: $('#toastContainer')
    };

    /** 已导入的现有文章：slug -> {slug,title,date,category,tags,sticky,cover,summary,content} */
    let existingPosts = {};
    let slugManuallyEdited = false;
    let loadingExisting = false; // 载入旧文章时暂停草稿覆盖

    const DRAFT_KEY = 'blog-editor-draft-v1';

    /* ---------------- 工具 ---------------- */

    function toast(msg, type, duration) {
        const box = els.toastContainer;
        const t = document.createElement('div');
        t.className = 'toast' + (type && type !== 'info' ? ' toast-' + type : '');
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(() => {
            t.classList.add('toast-out');
            t.addEventListener('animationend', () => t.remove());
            setTimeout(() => t.remove(), 600);
        }, duration || (type === 'error' ? 4200 : 2400));
    }

    /** 清洗文件名：小写、空格转横杠、去掉非法字符 */
    function sanitizeSlug(raw) {
        return String(raw || '')
            .toLowerCase()
            .trim()
            .replace(/\.md$/i, '')
            .replace(/[\s_]+/g, '-')
            .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
            .replace(/-{2,}/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
    }

    function todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function autoSlug() {
        const date = els.fDate.value || todayStr();
        const fromTitle = sanitizeSlug(els.fTitle.value);
        if (fromTitle && /^[a-z0-9]/.test(fromTitle)) return fromTitle;
        // 中文标题无法转拼音，用日期做文件名，直观又不会错
        return 'post-' + date.replace(/\D/g, '');
    }

    function currentSlug() {
        const s = sanitizeSlug(els.fSlug.value) || autoSlug();
        return s;
    }

    function getFormPost() {
        const tags = els.fTags.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        return {
            slug: currentSlug(),
            title: els.fTitle.value.trim() || '无标题',
            date: els.fDate.value || todayStr(),
            category: els.fCategory.value.trim() || '默认分类',
            tags,
            sticky: els.fSticky.checked,
            cover: els.fCover.value.trim(),
            summary: els.fSummary.value.trim(),
            content: els.fContent.value.replace(/\r\n/g, '\n')
        };
    }

    function quoteIfNeeded(v) {
        v = String(v);
        if (/[,:\[\]"'#\n]/.test(v)) {
            return '"' + v.replace(/"/g, "'") + '"';
        }
        return v;
    }

    /** 生成完整的 .md 文件内容（front matter + 正文） */
    function buildMarkdown(post) {
        const lines = ['---'];
        lines.push('title: ' + quoteIfNeeded(post.title));
        lines.push('date: ' + post.date);
        lines.push('category: ' + quoteIfNeeded(post.category));
        lines.push('tags: [' + post.tags.map(quoteIfNeeded).join(', ') + ']');
        if (post.sticky) lines.push('sticky: true');
        if (post.cover) lines.push('cover: ' + post.cover);
        if (post.summary) lines.push('summary: ' + quoteIfNeeded(post.summary));
        lines.push('---');
        lines.push('');
        lines.push(post.content.trim());
        lines.push('');
        return lines.join('\n');
    }

    /** 生成合并后的 manifest.json（现有文章 + 当前文章） */
    function buildManifest() {
        const current = getFormPost();
        const entry = {
            slug: current.slug,
            title: current.title,
            date: current.date,
            category: current.category,
            tags: current.tags,
            sticky: current.sticky
        };
        const summary = current.summary || makeSummary(current.content, 80);
        if (summary) entry.summary = summary;
        const cover = current.cover || (current.content.match(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/) || [])[1] || '';
        if (cover) entry.cover = cover;

        const list = Object.values(existingPosts).map((p) => {
            const e = {
                slug: p.slug,
                title: p.title,
                date: p.date,
                category: p.category || '默认分类',
                tags: Array.isArray(p.tags) ? p.tags : []
            };
            if (p.sticky) e.sticky = true;
            if (p.summary) e.summary = p.summary;
            if (p.cover) e.cover = p.cover;
            return e;
        });

        // 当前文章替换同 slug 的旧文章，置顶的放最前面（方便人读）
        const others = list.filter((e) => e.slug !== current.slug);
        const merged = current.sticky ? [entry, ...others] : [...others, entry];
        return JSON.stringify(merged, null, 4) + '\n';
    }

    function download(filename, text, mime) {
        const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 200);
    }

    /* ---------------- 预览 ---------------- */

    function renderPreview() {
        const post = getFormPost();
        els.previewTitle.textContent = post.title;

        // 元信息行
        const meta = [];
        if (post.date) meta.push(post.date);
        if (post.category) meta.push(post.category);
        if (post.tags.length) meta.push(post.tags.join(' / '));
        if (post.sticky) meta.push('📌 置顶');
        els.previewMeta.textContent = meta.join(' · ');

        // 封面
        const cover = post.cover || (post.content.match(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/) || [])[1];
        if (cover) {
            els.previewCover.src = cover;
            els.previewCover.hidden = false;
            els.previewCover.onerror = () => { els.previewCover.hidden = true; };
        } else {
            els.previewCover.hidden = true;
        }

        // 正文
        if (post.content.trim()) {
            els.previewContent.innerHTML = Blog.core.renderPreview(post.content);
        } else {
            els.previewContent.innerHTML = '<div class="preview-empty">开始输入，这里会实时显示文章在博客里的效果 ✨</div>';
        }

        // 字数
        const len = post.content.replace(/\s+/g, '').length;
        els.wordCount.textContent = `${len} 字 · 约 ${calcReadingTime(post.content)} 分钟读完`;
    }

    /* ---------------- 草稿 ---------------- */

    const saveDraft = debounce(() => {
        try {
            const post = getFormPost();
            localStorage.setItem(DRAFT_KEY, JSON.stringify({
                form: {
                    title: els.fTitle.value, date: els.fDate.value, category: els.fCategory.value,
                    tags: els.fTags.value, cover: els.fCover.value, summary: els.fSummary.value,
                    sticky: els.fSticky.checked, content: els.fContent.value,
                    slug: els.fSlug.value, slugEdited: slugManuallyEdited
                },
                existing: existingPosts
            }));
        } catch (e) { /* 存储空间不足等，忽略 */ }
    }, 500);

    function restoreDraft() {
        let data = null;
        try {
            data = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
        } catch (e) { return false; }
        if (!data || !data.form) return false;
        const f = data.form;
        els.fTitle.value = f.title || '';
        els.fDate.value = f.date || todayStr();
        els.fCategory.value = f.category || '';
        els.fTags.value = f.tags || '';
        els.fCover.value = f.cover || '';
        els.fSummary.value = f.summary || '';
        els.fSticky.checked = !!f.sticky;
        els.fContent.value = f.content || '';
        els.fSlug.value = f.slug || '';
        slugManuallyEdited = !!f.slugEdited;
        existingPosts = data.existing || {};
        refreshImportUI();
        return !!(f.title || f.content);
    }

    function clearAll() {
        els.fTitle.value = '';
        els.fDate.value = todayStr();
        els.fCategory.value = '';
        els.fTags.value = '';
        els.fCover.value = '';
        els.fSummary.value = '';
        els.fSticky.checked = false;
        els.fContent.value = '';
        els.fSlug.value = '';
        slugManuallyEdited = false;
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* 忽略 */ }
        renderPreview();
    }

    /* ---------------- 导入现有文章 ---------------- */

    function refreshImportUI() {
        const slugs = Object.keys(existingPosts);
        els.importNote.textContent = slugs.length
            ? `✅ 已导入 ${slugs.length} 篇现有文章，下载 manifest.json 时会自动包含它们（放心不会丢）。在下方下拉框可以随时调出旧文章修改。`
            : '尚未导入。导入后：这里会记住博客里已有的文章，下载的 manifest.json 会自动包含它们。';
        els.manifestWarn.classList.toggle('visible', slugs.length === 0);

        // 下拉框
        els.existingSelect.innerHTML = '<option value="">— 选择要编辑的已有文章 —</option>' +
            slugs.map((s) => `<option value="${escapeHTML(s)}">${escapeHTML(existingPosts[s].title || s)}（${s}）</option>`).join('');
    }

    async function readTextFile(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error('读取失败: ' + file.name));
            r.readAsText(file, 'utf-8');
        });
    }

    async function importFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        let mdCount = 0, jsonCount = 0;
        const manifestEntries = {};

        // 先读 manifest.json
        for (const f of files) {
            if (/^manifest\.json$/i.test(f.name) && /\.json$/i.test(f.name)) {
                try {
                    const arr = JSON.parse(await readTextFile(f));
                    if (Array.isArray(arr)) {
                        arr.forEach((e) => {
                            if (e && e.slug) manifestEntries[String(e.slug).replace(/\.md$/i, '')] = e;
                        });
                        jsonCount++;
                    }
                } catch (e) {
                    toast(`manifest.json 解析失败：${e.message}`, 'error');
                }
            }
        }

        // 再读 md 文件
        for (const f of files) {
            if (!/\.md$|\.markdown$/i.test(f.name)) continue;
            if (/^readme/i.test(f.name)) continue; // 忽略 README.md
            const slug = f.name.replace(/\.(md|markdown)$/i, '').replace(/^.*[\\/]/, '');
            try {
                const text = await readTextFile(f);
                const parsed = parseFrontMatter(text);
                const m = parsed.metadata;
                const base = manifestEntries[slug] || {};
                existingPosts[slug] = {
                    slug,
                    title: (typeof m.title === 'string' && m.title) || base.title || slug,
                    date: m.date || base.date || '',
                    category: (typeof m.category === 'string' && m.category) || base.category || '默认分类',
                    tags: Array.isArray(m.tags) ? m.tags : (Array.isArray(base.tags) ? base.tags : []),
                    sticky: m.sticky != null ? !!m.sticky : !!base.sticky,
                    cover: (typeof m.cover === 'string' && m.cover) || base.cover || '',
                    summary: (typeof m.summary === 'string' && m.summary) || base.summary || '',
                    content: parsed.content.trim(),
                    _hasFile: true
                };
                mdCount++;
            } catch (e) {
                console.warn('导入失败:', f.name, e);
            }
        }

        refreshImportUI();
        saveDraft();
        if (mdCount || jsonCount) {
            toast(`导入完成：${mdCount} 篇文章${jsonCount ? ' + manifest.json' : ''}`, 'success');
        } else {
            toast('没有找到可导入的 .md / manifest.json 文件', 'error');
        }
    }

    function loadExistingIntoForm(slug) {
        const p = existingPosts[slug];
        if (!p) return;
        loadingExisting = true;
        els.fTitle.value = p.title || '';
        els.fDate.value = p.date || todayStr();
        els.fCategory.value = p.category || '';
        els.fTags.value = (p.tags || []).join(', ');
        els.fCover.value = p.cover || '';
        els.fSummary.value = p.summary || '';
        els.fSticky.checked = !!p.sticky;
        els.fContent.value = p.content || '';
        els.fSlug.value = slug;
        slugManuallyEdited = true;
        loadingExisting = false;
        renderPreview();
        toast(`已载入「${p.title || slug}」，修改后重新下载 .md 和 manifest.json 即可更新`, 'info', 3600);
    }

    /* ---------------- 工具栏插入 ---------------- */

    function insertAround(before, after, placeholder) {
        const ta = els.fContent;
        const start = ta.selectionStart, end = ta.selectionEnd;
        const selected = ta.value.slice(start, end) || placeholder || '';
        ta.setRangeText(before + selected + after, start, end, 'select');
        // 选中中间的文字方便直接替换
        ta.selectionStart = start + before.length;
        ta.selectionEnd = start + before.length + selected.length;
        ta.focus();
        ta.dispatchEvent(new Event('input'));
    }

    function insertLinePrefix(prefix) {
        const ta = els.fContent;
        const start = ta.selectionStart;
        const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
        ta.setRangeText(prefix, lineStart, lineStart, 'end');
        ta.focus();
        ta.dispatchEvent(new Event('input'));
    }

    function insertBlock(text) {
        const ta = els.fContent;
        const start = ta.selectionStart;
        const needsNL = start > 0 && ta.value[start - 1] !== '\n';
        const payload = (needsNL ? '\n' : '') + text;
        ta.setRangeText(payload, start, ta.selectionEnd, 'end');
        ta.focus();
        ta.dispatchEvent(new Event('input'));
    }

    const mdActions = {
        bold: () => insertAround('**', '**', '加粗文字'),
        italic: () => insertAround('*', '*', '斜体文字'),
        h2: () => insertLinePrefix('## '),
        h3: () => insertLinePrefix('### '),
        quote: () => insertLinePrefix('> '),
        code: () => insertBlock('```\n代码写这里\n```\n'),
        link: () => insertAround('[', '](https://example.com)', '链接文字'),
        image: () => insertAround('![', '](图片链接)', '图片描述'),
        list: () => insertLinePrefix('- '),
        hr: () => insertBlock('---\n')
    };

    /* ---------------- 事件绑定 ---------------- */

    function bindEvents() {
        // 表单变化 → 预览 + 草稿
        ['fTitle', 'fDate', 'fCategory', 'fTags', 'fCover', 'fSummary', 'fSticky', 'fContent']
            .forEach((id) => {
                els[id].addEventListener('input', () => {
                    renderPreview();
                    saveDraft();
                });
            });

        // slug 手动编辑标记 & 自动建议
        els.fSlug.addEventListener('input', () => {
            slugManuallyEdited = els.fSlug.value.trim() !== '';
        });
        els.fTitle.addEventListener('input', () => {
            if (!slugManuallyEdited) els.fSlug.placeholder = autoSlug();
        });
        els.fDate.addEventListener('change', () => {
            if (!slugManuallyEdited) els.fSlug.placeholder = autoSlug();
        });

        // Markdown 工具栏
        $('#mdToolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-md]');
            if (!btn) return;
            const fn = mdActions[btn.dataset.md];
            if (fn) fn();
            saveDraft();
        });

        // 自动生成摘要
        $('#btnGenSummary').addEventListener('click', () => {
            const s = makeSummary(els.fContent.value, 80);
            if (!s) return toast('先写一点正文，才能生成摘要哦', 'error');
            els.fSummary.value = s;
            renderPreview();
            saveDraft();
            toast('摘要已生成，可自行修改', 'success');
        });

        // 下载 .md
        $('#btnDownloadMd').addEventListener('click', () => {
            const post = getFormPost();
            if (!els.fTitle.value.trim()) {
                toast('请先填写文章标题', 'error');
                els.fTitle.focus();
                return;
            }
            download(post.slug + '.md', buildMarkdown(post), 'text/markdown');
            toast(`已生成 ${post.slug}.md，请上传到 posts 文件夹`, 'success', 3600);
        });

        // 下载 manifest.json
        $('#btnDownloadManifest').addEventListener('click', () => {
            if (!els.fTitle.value.trim()) {
                toast('请先填写文章标题', 'error');
                els.fTitle.focus();
                return;
            }
            if (Object.keys(existingPosts).length === 0) {
                const ok = confirm(
                    '⚠️ 你还没有导入现有的 posts 文件夹。\n\n' +
                    '下载的 manifest.json 将只包含当前这一篇文章。\n' +
                    '如果博客里已有其他文章，它们会从首页消失！\n\n' +
                    '确定要继续下载吗？（建议先点「导入 posts 文件夹」）'
                );
                if (!ok) return;
            }
            download('manifest.json', buildManifest(), 'application/json');
            toast('已生成 manifest.json，请覆盖 posts/manifest.json', 'success', 3600);
        });

        // 草稿 & 清空
        $('#btnSaveDraft').addEventListener('click', () => {
            saveDraft.cancel();
            try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    form: {
                        title: els.fTitle.value, date: els.fDate.value, category: els.fCategory.value,
                        tags: els.fTags.value, cover: els.fCover.value, summary: els.fSummary.value,
                        sticky: els.fSticky.checked, content: els.fContent.value,
                        slug: els.fSlug.value, slugEdited: slugManuallyEdited
                    },
                    existing: existingPosts
                }));
                toast('草稿已保存到本浏览器（Ctrl+S 随时保存）', 'success');
            } catch (e) {
                toast('保存失败：浏览器存储不可用', 'error');
            }
        });
        $('#btnClear').addEventListener('click', () => {
            if (confirm('确定清空当前内容吗？（已导入的文章列表会保留，草稿会被删除）')) {
                clearAll();
                toast('已清空', 'success');
            }
        });

        // 导入
        $('#btnImportDir').addEventListener('click', () => els.importDirInput.click());
        $('#btnImportFiles').addEventListener('click', () => els.importFilesInput.click());
        els.importDirInput.addEventListener('change', (e) => {
            importFiles(e.target.files);
            e.target.value = '';
        });
        els.importFilesInput.addEventListener('change', (e) => {
            importFiles(e.target.files);
            e.target.value = '';
        });

        // 编辑已有文章
        els.existingSelect.addEventListener('change', (e) => {
            const slug = e.target.value;
            if (slug) loadExistingIntoForm(slug);
        });

        // 主题
        $('#themeToggle').addEventListener('click', () => {
            const html = document.documentElement;
            const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            try { localStorage.setItem('blog-theme', next); } catch (e) { /* 忽略 */ }
        });

        // 快捷键 Ctrl+S 保存草稿
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                $('#btnSaveDraft').click();
            }
        });
    }

    /* ---------------- 启动 ---------------- */

    function init() {
        // 主题恢复
        try {
            const saved = localStorage.getItem('blog-theme');
            if (saved === 'dark' || saved === 'light') {
                document.documentElement.setAttribute('data-theme', saved);
            } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        } catch (e) { /* 忽略 */ }

        els.fDate.value = todayStr();
        bindEvents();

        const hasDraft = restoreDraft();
        if (!hasDraft) {
            renderPreview();
            toast('👋 欢迎使用写作助手！先导入 posts 文件夹，再开始写新文章', 'info', 5000);
        } else {
            renderPreview();
            toast('已恢复上次未发布的草稿', 'success');
        }

        // 本地 marked 缺失时从 CDN 补
        if (!window.marked) {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            s.onload = renderPreview;
            document.head.appendChild(s);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
