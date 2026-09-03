# 🐱 猫猫的回忆 · 静态博客

一个**零依赖、零构建**的纯静态博客，专为不懂代码的小白设计：
写文章就像填表格，改配置只需一行 JSON，推到 GitHub Pages 就能访问。

## ✨ 特性

- 🧩 **全模块化**：HTML / CSS / JS 按功能拆分，改哪都清楚（结构见下文）
- ✍️ **写作助手**：打开 `editor.html`，填表格 + 写正文 → 一键下载发布文件，全程不用碰代码
- 🔍 **全文搜索**：搜索正文内容，而不只是标题
- 🌓 **亮暗主题**：跟随系统 + 手动切换 + 自动记忆
- 🖼 **图片灯箱**：点击文章里的图片全屏看大图，支持键盘 ←/→ 和手机滑动
- 📱 **完美响应式**：手机 / 平板 / 电脑都好看
- ⚡ **性能优化**：文章一次预取、本地缓存，列表零额外请求；Markdown 与 HTML 消毒库已本地化，**断网也能用**
- 🛡 **安全渲染**：正文经 DOMPurify 消毒，误贴恶意代码也不会执行

## 📂 文件结构

```
├── index.html              # 博客首页（只负责"搭骨架"）
├── editor.html             # ✍️ 写作助手（推荐从这里写文章）
├── config.json             # 博客配置（博客名 / 作者 / 每页篇数）
├── posts/
│   ├── manifest.json       # 文章目录（由写作助手自动生成）
│   └── xxx.md              # 文章正文（Markdown）
├── docs/
│   └── 写作指南.md          # 图文版新手教程
└── assets/
    ├── css/                # 样式（按功能拆分）
    │   ├── tokens.css      #   设计变量（改颜色/圆角/字体在这里）
    │   ├── base.css        #   全局基础样式
    │   ├── layout.css      #   顶栏 / 侧边栏 / 布局
    │   ├── components.css  #   卡片 / 分页 / Toast 等组件
    │   ├── article.css     #   文章页 / 灯箱 / 进度条
    │   ├── responsive.css  #   移动端适配
    │   └── editor.css      #   写作助手专用
    ├── js/
    │   ├── main.js         # 入口：组装所有模块
    │   ├── core/
    │   │   ├── kernel.js      # 博客内核（数据加载/查询/缓存）
    │   │   ├── frontmatter.js # 文章头部信息解析
    │   │   └── markdown.js    # Markdown 渲染 + 安全消毒
    │   ├── ui/
    │   │   ├── router.js   # 路由（#/ 文章列表、#/post/xxx 详情）
    │   │   ├── postlist.js # 文章列表 + 分页
    │   │   ├── article.js  # 文章详情 + 灯箱 + 阅读进度
    │   │   ├── sidebar.js  # 侧边栏（分类/标签/归档）
    │   │   ├── search.js   # 搜索（Ctrl+K 或按 / 唤起）
    │   │   ├── theme.js    # 亮暗主题
    │   │   └── toast.js    # 轻提示
    │   └── utils/
    │       ├── dom.js      # DOM 工具（转义/防抖/复制）
    │       └── format.js   # 日期/摘要/字数工具
    └── vendor/             # 本地化的第三方库（离线可用）
        ├── marked.min.js   #   Markdown 解析
        └── purify.min.js   #   HTML 消毒
```

## 🚀 快速开始

### 部署到 GitHub Pages

1. 把本仓库推送到你的 GitHub 仓库
2. 仓库 **Settings → Pages → Source** 选 `main` 分支，保存
3. 等 1 分钟，访问 `https://你的用户名.github.io/仓库名/` 🎉

### 本地预览

> ⚠️ 直接双击 `index.html` 无法加载数据（浏览器安全限制），需要起一个本地服务器：

```bash
# 在仓库目录里任选一种：
python3 -m http.server 8000        # Python
npx serve .                        # Node.js
```

然后浏览器打开 <http://localhost:8000>。VS Code 用户也可用 Live Server 插件。

## ✍️ 写新文章（小白推荐流程）

**打开 `editor.html`（写作助手），三步发布：**

1. **填**：标题、正文（右边实时预览），点工具栏按钮自动生成 Markdown 格式
2. **下**：点「下载文章 .md」和「下载 manifest.json」
3. **传**：GitHub 仓库 → `Add file → Upload files` → .md 放进 `posts/`，覆盖 `posts/manifest.json` → `Commit changes`

> 💡 第一次使用请先点写作助手里的「**导入 posts 文件夹**」，
> 这样下载的 manifest.json 会自动包含旧文章，不会弄丢。
> 图片用免费图床（如 [imgbb.com](https://imgbb.com)）上传后把链接贴进正文即可。

详细图文教程见 **[docs/写作指南.md](docs/写作指南.md)**。

### 手动写文章（进阶）

在 `posts/` 新建 `my-post.md`：

```markdown
---
title: 文章标题
date: 2026-05-20
category: 生活
tags: [旅行, 美食]
sticky: false
cover: https://...（可选，封面图）
summary: 一句话摘要（可选，自动截取）
---

正文用 Markdown 写，**加粗**、*斜体*、![图片](图片链接) 都支持。
```

再在 `posts/manifest.json` 数组里加一条：

```json
{ "slug": "my-post", "title": "文章标题", "date": "2026-05-20", "category": "生活", "tags": ["旅行"] }
```

> 💡 front matter 与 manifest 的信息会智能合并，**front matter 优先**。
> 不确定格式？直接用写作助手生成，零出错。

## ⚙️ config.json

```json
{
  "blogName": "猫猫的回忆",
  "author": "猫猫",
  "perPage": 5
}
```

| 字段 | 说明 |
| --- | --- |
| `blogName` | 博客名字（顶栏 / 标题 / 页脚） |
| `author` | 作者名 |
| `perPage` | 列表每页显示几篇文章 |

## ❓ 常见问题

- **文章不显示？** 检查 `posts/manifest.json` 里的 `slug` 和 `.md` 文件名是否完全一致；按 F12 看控制台是否有红色报错。
- **图片不显示？** 图片链接要在浏览器里能直接打开；部分图床有防盗链，换 [imgbb.com](https://imgbb.com) 试试。
- **页面空白/初始化失败？** 你可能直接双击打开了 index.html，见上文「本地预览」。
- **搜索搜不到内容？** 搜索索引在页面打开后台建立，文章多时稍等片刻。

## 🛠 调试 API

浏览器控制台里可用：

```js
__blogKernel.queryPosts({ keyword: '爱' })   // 查询文章
__blogApp.getState()                        // 当前视图状态
__blogApp.toggleTheme()                     // 切换主题
```
