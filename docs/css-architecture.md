# CSS 架构与光学层级说明

这份文档解决审阅意见里的第 18、19、20 条：**specificity 地狱**、**旧主题与新主题分层**、
以及 **"真玻璃"到底是什么**。先看结论，再看规矩。

---

## 1. 现在的加载顺序（index.html / editor.html）

```
tokens.css        设计令牌（颜色 / 圆角 / 间距的变量源）
base.css          reset + 排版基线
layout.css        栅格与页面骨架
components.css    通用组件（卡片 / 按钮 / 分页 / toast 容器 …）
article.css       正文与文章页
responsive.css    断点适配（1024 / 768 / 480 / 380）
editor.css        写作助手（仅 editor.html）
─────────────────────────────────────────────
glass-rain.css    ← 主题层：雨夜玻璃（必须最后加载）
neo-brutalism.css ← 旧主题：保留但不加载
```

**规矩：`glass-rain.css` 是唯一的"主题层"，前面 6 个文件是"核心层"。**
核心层只描述结构与默认外观，不写主题专属效果；主题层只覆盖外观，不改结构。

---

## 2. 目标结构（下一次大重构时按这个走）

```
assets/css/
  core/
    tokens.css
    base.css
    layout.css
    components.css
    article.css
    responsive.css
  themes/
    glass/        雨夜玻璃（当前）
    brutalism/    粗野主义（旧）
    flat/         预留
```

配合 CSS Cascade Layers，可以彻底告别 `!important` 和长选择器：

```css
@layer core, theme, overrides;
@import url("core/tokens.css")   layer(core);
@import url("themes/glass/…css") layer(theme);
```

> 注意：**不要只给一部分文件加 `@layer`**。未分层的样式优先级永远高于分层样式，
> 半套 layer 会让覆盖关系比现在更难理解。要迁就一次性全迁。

在完成迁移之前，主题层的覆盖遵守：
1. 选择器最多写到 `body.glass-theme .foo`，不要再往上叠；
2. 主题变量集中在 `:root` / `html[data-theme="…"]` 两处；
3. 只有打印、可访问性与跨浏览器 fallback 允许 `!important`。

---

## 3. 光学层级（Optical Tiers）

这是这套视觉系统的宪法，写在 `glass-rain.css` 第 19 节，核心一句话：

> **玻璃里面不要再有玻璃。**

| 层 | 内容 | 有没有 `backdrop-filter` |
|----|------|--------------------------|
| T0 | 天空 / 背景照片 / 极光 / 远近雨 / 闪电（`.rain-stage`） | 无（自己发光） |
| T1 | 大型玻璃容器：`.header-inner` `.sidebar-section` `.post-card` `.article-view` `.glass-card` `.glass-bar` `.glass-modal` `.palette-card` | **有**（主折射面） |
| T2 | 容器内部的内容玻璃：`.glass-item` `.glass-badge` `.card-tag` 等 | 无（只留表面：半透明底 + 边框 + 内高光） |
| T3 | 正文内容层：`pre` `code` `table` | 无（**反玻璃**，实底 + 清晰边界 + 无 text-shadow） |
| T4 | 独立浮层：`.toast` `.lightbox-tools` `.reader-toggle` `.article-mobile-bar` `#glassSpot` | 有（它们直接挂在 `body` 上，不在 T1 内部） |
| T5 | 前景水珠 `.gdrop` | 有（最后一层透镜） |

三层光学叠加只发生在 T1 的 `background-image` 上（`glass.js` / `fx.js` 写变量）：

```
radial(--mx/--my)   卡内近场高光（指针在这张卡上时）
radial(--px/--py)   视口级指针邻域折射
linear(--sheen-angle/--sheen-shift)  随滚动转角的镜面高光
```

`::before` / `::after` 一律不参与：前者是虹膜边缘环 / 顶沿光线，后者是掠光 sheen。
**改高光千万别写到伪元素上**，否则边缘光学会整块坏掉（这个坑已经踩过一次）。

---

## 4. 容器职责分离

以前 `.glass-card` 同时是「玻璃材质容器 + 内容裁剪容器 + 交互浮层容器」，
`overflow: hidden` 会把 tooltip / dropdown / popover 一起裁掉。现在：

- 掠光用 `clip-path: inset(…% round var(--radius))` **自己裁自己**；
- 容器恢复 `overflow: visible`，封面图靠自身 `overflow: hidden` + 圆角；
- 全站浮层（面板 / 确认框 / 提示 / 灯箱）一律挂在 `body` 下，不寄生在卡片里；
- 真要在卡片里放浮层，给浮层加 `.glass-overlay-escape`，不要改容器。

---

## 5. 关于「真玻璃」这个说法

`backdrop-filter` 的本质是 **背景采样 + 模糊 + 滤镜**，没有 distortion /
displacement / UV offset，所以它不是物理意义上的 refraction。这套主题准确的描述是：

```
高级毛玻璃 + 镜面高光 + 边缘光学 + 透镜式模糊
```

我们**刻意不为了"物理正确"去硬加扭曲**：观感优先，稳定优先。
（源码注释里原先写的"实时折射"已改成准确表述。）

---

## 6. JS 侧的对应约定

所有视觉模块统一 `init() / destroy() / refresh()`，并在
`assets/js/ui/controllers.js` 注册。控制台里可以直接查看：

```js
Blog.controllers.list()        // 谁可销毁、谁可刷新、属于哪一层
Blog.controllers.refreshAll()  // 路由切页后统一刷新
Blog.controllers.destroyAll()  // 全部卸载
```

状态一律走 `Blog.storage`（`assets/js/utils/storage.js`）：
统一键名表、统一异常策略、localStorage 不可用时降级为内存存储，
避免「主题读取失败→暗、雨效读取失败→开、语言读取失败→中文」这种组合错乱。
