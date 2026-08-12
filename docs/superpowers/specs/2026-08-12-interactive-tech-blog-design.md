# 互動式技術部落格 — 設計文件

日期:2026-08-12
狀態:已核准

## 目標

把 singyichen.github.io 從單頁 portfolio 擴充為完整個人網站:首頁保留 portfolio,新增 `/blog` 技術部落格。部落格文章支援「artifacts 式」的內嵌互動元件(可操作圖表、可調參數 demo)、互動流程圖與互動心智圖。寫作流程以 Markdown/MDX 為主,互動元件由 Claude Code 依自然語言描述產生(仿 notecraft 的 `@ai-visualize` 模式,但以對話代替標記)。

參考:
- https://github.com/SteveLin100132/notecraft — Astro + MDX + AI 產生 React 互動元件的模式
- https://blog.aihao.tw/ — 視覺與版型主要參考:淺色極簡、內容至上、簡潔導覽、「日期 + 標題 + 標籤」式文章列表

## 範圍

第一版包含:

- Portfolio 首頁(內容不變,視覺重新設計為與部落格一致的極簡風格)
- 深/淺色雙主題:預設跟隨系統偏好,導覽列提供手動切換並以 localStorage 記住選擇
- 文章列表頁(依日期排序、顯示摘要)
- 文章頁(MDX 渲染、內嵌互動元件)
- 標籤分類頁
- Mermaid 圖表(含縮放平移、全螢幕檢視)
- markmap 互動心智圖
- React Flow 深度互動流程圖(artifact 元件)
- Recharts 資料圖表(artifact 元件)
- GitHub Actions 自動部署到 GitHub Pages
- 一篇示範文章驗證所有功能

明確不做(YAGNI):全文搜尋、RSS、sitemap、留言、列表分頁(文章量大後再加)、Tailwind。

## 技術選型

- **框架**:Astro 5(靜態輸出)+ `@astrojs/mdx` + `@astrojs/react`
- **互動元件**:React islands(`client:visible` — 元件進入視窗才載入 JS,其餘內容零 JS)
- **圖表 libraries**:`mermaid`(按需載入)、`markmap-lib`/`markmap-view`(按需載入)、`@xyflow/react`、`recharts`、`motion`
- **樣式**:原生 CSS custom properties。版型與氣質以 blog.aihao.tw 為藍本:極簡、留白充足、內容至上。雙主題以 tokens 實作 — `:root` 定義淺色(近白背景、深灰文字、低飽和 accent),`[data-theme="dark"]` 覆寫為深色(可沿用現有 `#0f1115`/`#7dd3c0` 系);切換邏輯:預設跟隨 `prefers-color-scheme`,手動切換寫入 localStorage,`<head>` 內以 inline script 先行套用避免閃爍(FOUC)
- **部署**:GitHub Actions(`withastro/action`)→ GitHub Pages,push `main` 即部署

選型理由:Astro 拿到 notecraft 的核心價值(MDX + React 互動元件)但架構自主;island 架構讓內容頁保持極快;不直接用 notecraft 因其定位是筆記應用(dashboard/資料夾導向),整合 portfolio 彆扭且被單人專案綁定;Next.js 對純內容站 overkill。

## 目錄結構

```
├── astro.config.mjs
├── package.json
├── .github/workflows/deploy.yml     # 自動部署
├── docs/superpowers/specs/          # 設計文件
├── src/
│   ├── layouts/
│   │   ├── BaseLayout.astro         # 共用 <head>、導覽列(站名/Blog/主題切換)、design tokens、主題 inline script
│   │   └── PostLayout.astro         # 文章版型(標題、日期、標籤、內文)
│   ├── pages/
│   │   ├── index.astro              # portfolio 首頁(內容沿用,重製為極簡雙主題風格)
│   │   └── blog/
│   │       ├── index.astro          # 文章列表(仿 aihao:日期 + 標題 + 標籤的簡潔清單)
│   │       ├── [...slug].astro      # 文章頁
│   │       └── tags/[tag].astro     # 標籤頁
│   ├── content/
│   │   └── blog/                    # 一篇文章一個 .mdx
│   ├── components/
│   │   ├── diagrams/                # Mermaid/markmap 渲染與互動容器(共用基礎設施)
│   │   └── posts/<文章slug>/        # 各文章專屬的互動元件 (.tsx)
│   └── styles/global.css
└── CLAUDE.md                        # 寫作流程與元件約定
```

## 內容模型

Astro content collection + zod schema 驗證,寫錯 frontmatter 時 build 直接失敗:

```yaml
---
title: "文章標題"
description: "一句話摘要,顯示在列表頁與 meta description"
pubDate: 2026-08-12
tags: ["ai-agent", "observability"]
draft: false        # true 時不出現在正式站與列表
---
```

標籤頁由所有文章的 `tags` 自動彙整產生,無需另外維護標籤清單。

## 互動元件(artifacts 功能)

機制:

- MDX 文章內直接 `import` React 元件並以 `client:visible` 使用
- 元件放在 `src/components/posts/<文章slug>/`,與文章一一對應;跨文章可共用的放 `src/components/diagrams/` 或後續視需要建立共用目錄
- 預裝 `recharts`、`motion`、`@xyflow/react`;D3 等其他 library 需要時再加

寫作流程(記錄於 CLAUDE.md,任何 session 皆可執行):

1. 作者以 MDX 寫文章,在需要互動視覺化處以自然語言描述需求(寫在文中或直接在 Claude Code 對話中提出)
2. Claude 產生 `.tsx` 元件於對應目錄、加上 import、嵌入文章
3. `npm run dev` 熱重載即時預覽

## 圖表功能

| 需求 | 工具 | 寫作方式 | 互動能力 |
|------|------|----------|----------|
| 一般流程圖/時序圖 | Mermaid | ` ```mermaid ` code block | 滾輪縮放、拖曳平移、點擊全螢幕 |
| 深度互動流程圖 | React Flow | 描述需求,Claude 產元件 | 節點拖曳、步驟導覽動畫、收合子流程、點節點展開說明 |
| 心智圖 | markmap | ` ```markmap ` code block(巢狀 markdown 清單) | 節點收合/展開、縮放、平移 |
| 資料圖表 | Recharts | 描述需求,Claude 產元件 | hover tooltip、可調參數等依需求 |

實作方式:remark plugin 將 `mermaid` 與 `markmap` code fence 轉為佔位元素,頁面存在對應區塊時才動態載入該 library 於瀏覽器端渲染;外層包互動容器(縮放/平移/全螢幕)。無圖表的頁面不載入任何圖表 JS。markmap 為讀者瀏覽互動(收合/縮放/探索),不提供讀者編輯節點。

所有圖表須配合雙主題:Mermaid 依當前主題選用亮/暗 theme,主題切換時重新渲染;markmap 與 React Flow、Recharts 元件一律使用 CSS design tokens 取色,隨主題自動變色。

## 部署

- `.github/workflows/deploy.yml` 使用 `withastro/action`,push `main` 自動 build + 部署
- 手動一次性設定:repo Settings → Pages → Source 改為「GitHub Actions」
- 網址不變:`https://singyichen.github.io`,部落格於 `/blog`

## 錯誤處理

- frontmatter 錯誤:zod schema 使 build 失敗並指出欄位
- MDX 語法錯誤/元件 import 失敗:build 失敗,部署不會上線壞頁面
- Mermaid/markmap 語法錯誤:瀏覽器端渲染失敗時顯示原始 code block 與錯誤訊息,不弄壞整頁

## 驗證

- `npm run build` 通過 = frontmatter、MDX、元件、頁面路由皆合法
- 示範文章一篇:**一篇 RAG(Retrieval-Augmented Generation)主題的真實技術文章**,非佔位內容,內含:一個 Mermaid 流程圖(RAG pipeline,驗證縮放/全螢幕)、一個 markmap 心智圖(RAG 知識架構,驗證收合展開)、一個 Recharts 互動圖表(如 chunk size 與檢索品質關係)、一個 React Flow 互動流程圖(可逐步演示 RAG 檢索流程)
- 本地 `npm run dev` 人工預覽,深/淺主題各檢查一次;部署後確認 GitHub Pages 正常
