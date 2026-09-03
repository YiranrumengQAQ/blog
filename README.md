# 猫猫的回忆 · 静态博客

一个**零依赖、零构建**的纯静态博客，专为不懂代码的小白设计：
写文章就像填表格，改配置只需一行 JSON，推到 GitHub Pages 就能访问。

## 特性

- **全模块化**：HTML / CSS / JS 按功能拆分，改哪都清楚（结构见下文）
- **多语言 (i18n)**：界面文案全部抽到 `locales/*.json`，顶栏一键切换；**加一门新语言只要放一个 JSON 文件 + 在 config.json 里写一行**
- **写作助手**：打开 `editor.html`，填表格 + 写正文 → 一键下载发布文件，全程不用碰代码
- **全文搜索**：搜索正文内容，而不只是标题
- **亮暗主题**：跟随系统 + 手动切换 + 自动记忆
- **图片灯箱**：点击文章里的图片全屏看大图，支持键盘 ←/→ 和手机滑动
- **完美响应式**：手机 / 平板 / 电脑都好看
- **性能优化**：文章一次预取、本地缓存，列表零额外请求；Markdown 与 HTML 消毒库已本地化，**断网也能用**
- **安全渲染**：正文经 DOMPurify 消毒，误贴恶意代码也不会执行
- **统一图标**：全站（阅读页 + 写作助手）共用一套内联 SVG 图标，不使用 emoji，颜色跟随主题

## 文件结构

```
├── index.html              # 博客首页（只负责"搭骨架"）
├── editor.html             # 写作助手（推荐从这里写文章）
├── config.json             # 博客配置（博客名 / 作者 / 每页篇数 / 语言）
├── locales/                # 界面语言包（一种语言一个 JSON）
│   ├── zh-CN.json          #   简体中文
│   └── en.json             #   English
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
    │   │   ├── i18n.js        # 多语言（取文案 / 切语言 / 日期本地化）
    │   │   ├── kernel.js      # 博客内核（数据加载/查询/缓存）
    │   │   ├── frontmatter.js # 文章头部信息解析
    │   │   └── markdown.js    # Markdown 渲染 + 安全消毒
    │   ├── ui/
    │   │   ├── icons.js    # 全站统一的内联 SVG 图标库（替代 emoji）
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

## 快速开始

### 部署到 GitHub Pages

1. 把本仓库推送到你的 GitHub 仓库
2. 仓库 **Settings → Pages → Source** 选 `main` 分支，保存
3. 等 1 分钟，访问 `https://你的用户名.github.io/仓库名/`

### 本地预览

> **注意**：直接双击 `index.html` 无法加载数据（浏览器安全限制），需要起一个本地服务器：

```bash
# 在仓库目录里任选一种：
python3 -m http.server 8000        # Python
npx serve .                        # Node.js
```

然后浏览器打开 <http://localhost:8000>。VS Code 用户也可用 Live Server 插件。

## 写新文章（小白推荐流程）

**打开 `editor.html`（写作助手），三步发布：**

1. **填**：标题、正文（右边实时预览），点工具栏按钮自动生成 Markdown 格式
2. **下**：点「下载文章 .md」和「下载 manifest.json」
3. **传**：GitHub 仓库 → `Add file → Upload files` → .md 放进 `posts/`，覆盖 `posts/manifest.json` → `Commit changes`

> **提示**：第一次使用请先点写作助手里的「**导入 posts 文件夹**」，
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

> **提示**：front matter 与 manifest 的信息会智能合并，**front matter 优先**。
> 不确定格式？直接用写作助手生成，零出错。

## config.json

```json
{
  "blogName": "猫猫的回忆",
  "author": "猫猫",
  "perPage": 5,
  "defaultLanguage": "zh-CN",
  "languages": [
    { "code": "zh-CN", "name": "简体中文" },
    { "code": "en", "name": "English" }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `blogName` | 博客名字的默认值（顶栏 / 标题 / 页脚）；语言包里写了 `site.blogName` 时以语言包为准 |
| `author` | 作者名 |
| `perPage` | 列表每页显示几篇文章 |
| `defaultLanguage` | 默认语言（访客没选过、浏览器语言也匹配不上时用它） |
| `languages` | 顶栏语言下拉框里出现哪些语言；`code` 要和 `locales/` 里的文件名一致 |
| `defaultCategory` | 可选，文章没写分类时显示的名字（默认「默认分类」） |

## 多语言 (i18n)

界面上所有文字（菜单、按钮、空状态提示、日期写法、阅读时长……）都不写在代码里，
而是放在 `locales/` 下的语言包中，**纯前端实现，GitHub Pages 直接可用，不需要服务器**。

**访客怎么用**：顶栏右侧的语言下拉框选一下就行，选择会记住（localStorage）；
第一次访问会按浏览器语言自动匹配，匹配不上就用 `defaultLanguage`。

**语言怎么定的**（优先级从高到低）：

1. 访客上次在页面里选的语言
2. 浏览器语言（`zh-CN`、`zh`、`en-US`… 会自动匹配到最接近的已配置语言）
3. `config.json` 里的 `defaultLanguage`

### 加一门新语言（例如日语）

只做两件事，**不用改任何 JS / HTML**：

1. 复制 `locales/en.json`，另存为 `locales/ja.json`，把右边的值翻译成日语
   （左边的 key、`{n}` 这类占位符、`format` 里的 `{y} {m} {d} {mon}` 都不要动）
2. 在 `config.json` 的 `languages` 里加一行：

```json
{ "code": "ja", "name": "日本語" }
```

刷新页面，下拉框里就多出「日本語」了。文件名（`ja`）必须和 `code` 一致。

### 几个细节

- **日期 / 归档会跟着语言变**：`2026年5月19日` ↔ `May 19, 2026`；
  归档的内部标识固定是 `2026-05`，所以切语言不会让 `#/list?archive=2026-05` 这种链接失效。
- **阅读时长 / 字数按语言习惯算**：中文按字符数（约 350 字/分钟）显示「约 3 分钟阅读 · 1050 字」，
  英文按单词数（约 1000 字符/分钟）显示「3 min read · 210 words」。
  改速率就改语言包里的 `format.charsPerMinute` 和 `format.countMode`。
- **英文单复数**：语言包里给同一个 key 再加一个 `_one` 版本即可，
  例如 `"resultCount": "{n} posts in total"` + `"resultCount_one": "{n} post in total"`。
- **博客名也跟着语言走**：语言包里的 `site.blogName`（如 `猫猫的回忆` / `Cat's Memories`）
  会同时用于左上角标题、`<title>` 和页脚版权；没写这个 key 时回退 `config.json` 的 `blogName`。
- **只翻译界面，不翻译文章内容**：文章正文是作者写的，切语言不会去翻译它。
  （想做真正的多语言博客，需要给每种语言各写一份文章。）
- **`editor.html`（写作助手）目前只有中文**：它是给作者自己用的工具，没有做多语言。
- **语言包加载失败不会白屏**：文件缺失或 JSON 写错时，会自动回退到 `defaultLanguage`，
  控制台会打印一条警告。

## 图标

全站图标集中在 `assets/js/ui/icons.js`（24×24 描边风格的内联 SVG），**不使用 emoji**：
emoji 在不同系统/浏览器上长相不一致、颜色不跟随主题，读屏软件还会把它念出来。

- HTML 里写占位符：`<svg class="icon" data-icon="search"></svg>`，脚本加载后自动填充成真正的图标；
- JS 拼 HTML 字符串时用：`Blog.ui.icons.svg('search')`（动态内容渲染完可再调 `Blog.ui.icons.hydrate(node)`）；
- 加新图标：在 `icons.js` 的 `PATHS` 里加一行 `名字: '<path d="..."/>'`，
  尺寸与颜色由 CSS 的 `.icon` 统一控制（`currentColor`，亮/暗主题自动适配）。

## 常见问题

- **文章不显示？** 检查 `posts/manifest.json` 里的 `slug` 和 `.md` 文件名是否完全一致；按 F12 看控制台是否有红色报错。
- **图片不显示？** 图片链接要在浏览器里能直接打开；部分图床有防盗链，换 [imgbb.com](https://imgbb.com) 试试。
- **页面空白/初始化失败？** 你可能直接双击打开了 index.html，见上文「本地预览」。
- **搜索搜不到内容？** 搜索索引在页面打开后台建立，文章多时稍等片刻。
- **界面语言不对？** 语言是按浏览器语言自动匹配的，用顶栏下拉框手动选一次就会记住；
  选了没反应就按 F12 看控制台有没有「语言包加载失败」，通常是 `locales/` 里的文件名和 `config.json` 的 `code` 不一致。
- **想只显示一种语言？** 把 `config.json` 的 `languages` 只留一项即可，下拉框会跟着变短。
- **改了 `config.json` 的 `blogName` 但左上角没变？** 站点名优先取语言包里的 `site.blogName`，
  想全站统一改，把 `locales/*.json` 里的 `site.blogName` 一起改掉（或删掉该 key 让它回退 `config.json`）。

## 调试 API

浏览器控制台里可用：

```js
__blogKernel.queryPosts({ keyword: '爱' })   // 查询文章
__blogApp.getState()                        // 当前视图状态
__blogApp.toggleTheme()                     // 切换主题
Blog.i18n.setLocale('en')                   // 切换界面语言
Blog.i18n.locale()                          // 当前语言
Blog.i18n.t('list.latest')                  // 取某条文案
```
