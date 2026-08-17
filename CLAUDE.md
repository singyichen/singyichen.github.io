# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概觀

Mandy Chen 的個人網站(https://singyichen.github.io),以 GitHub Pages 發佈。

站台是 Astro 靜態站(`package.json` 鎖 `astro@^6.0.5`,目前解析到 6.4.8)+ React islands:portfolio 首頁(`/`)與技術部落格(`/blog`)。原本的單一 `index.html` 版本已完全遷移為這個 Astro 專案。完整設計規格(遷移前寫的)在 `docs/superpowers/specs/2026-08-12-interactive-tech-blog-design.md`,可當背景參考 —— 但**這份文件與實際程式碼以目前實作為準**,規格若與此文件衝突,不要照抄規格。

## 常用指令

> **Node 版本**:Astro 6 要求 Node >= 22.12(`node_modules/astro/package.json` 的 `engines.node`)。這台機器預設 `node` 是 v20(`/opt/homebrew/bin/node`),另外用 Homebrew 裝了 keg-only 的 `node@22`,不在預設 PATH 上。跑任何指令前加上:
>
> ```bash
> PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
> ```
>
> 或整個 shell session 先 `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`。若 `node -v` 顯示 < 22.12,先確認這件事,不要急著改程式碼。

```bash
npm run dev       # 開發伺服器(熱重載)
npm run test      # vitest,只涵蓋 src/lib/ 的純函式
npm run build     # astro build + pagefind 索引;通過 = frontmatter、MDX、元件、路由皆合法 —— commit 前必須跑過
npm run preview   # 本地預覽建置結果
```

測試只涵蓋 `src/lib/` 的純函式(vitest);元件與頁面仍以 `npm run build` 加人工檢查把關。

部署:push 到 `main` 由 `.github/workflows/deploy.yml` 自動建置並發佈到 GitHub Pages。workflow 用明確步驟(`actions/checkout` → `actions/setup-node`〔鎖 `node-version: '22'`〕→ `npm ci` → `npm run build` → `upload-pages-artifact`),**不用** `withastro/action`——因為 build 現在是兩階段(`astro build` 之後還要跑 `pagefind --site dist` 產生搜尋索引),`withastro/action` 只知道跑 `astro build`,不會執行第二階段。**GitHub repo 設定需要手動切一次**:Settings → Pages → Build and deployment → Source 選 **GitHub Actions**(不切的話 workflow 跑綠也不會生效)。

## 架構總覽

- **Astro 靜態輸出 + React islands**:文章頁的閱讀層元件(進度條、繼續閱讀提示、目錄、收藏按鈕)用 `client:load`,因為必須在使用者第一次捲動前就掛載好,無法等進入視窗;搜尋(`SearchDialog`)用 `client:idle`,所以會隨全站每一頁(包含 portfolio 首頁 `/`)一起出貨;文章內的視覺化元件(mermaid/markmap 以外、用 xyflow 或 recharts 產生的)仍用 `client:visible`,進入視窗才載入對應 JS。
- **內容模型**(`src/content.config.ts`):文章是 `src/content/blog/*.mdx`,用 `glob` loader 讀取,schema(zod)驗證:
  - 必填:`title: string`、`description: string`、`pubDate`(`z.coerce.date()`,frontmatter 直接寫 `2026-08-12` 這種裸日期就會被 coerce 成 Date)
  - 選填:`tags: string[]`(預設 `[]`)、`draft: boolean`(預設 `false`,`true` 的文章不會出現在 `/blog`、標籤頁或建置出的路由)
  - 路由:`src/pages/blog/index.astro`(列表)、`src/pages/blog/[...slug].astro`(單篇,`params.slug` 對應 `post.id`)、`src/pages/blog/tags/[tag].astro`(標籤頁,`getStaticPaths` 掃全部文章的 `tags` 自動生成,不維護標籤清單)
- **Layout**:`src/layouts/BaseLayout.astro`(全站殼:`<head>` FOUC-avoidance script、nav、主題切換 button、`site-footer`)→ `src/layouts/PostLayout.astro`(文章標題/日期/標籤 header,並在 `<script>` 裡呼叫 `initDiagrams()`)
- **雙主題**:tokens 定義在 `src/styles/global.css` 的 `:root`(淺色:`--bg #fdfdfc`、`--accent #0e7c66` 等)與 `[data-theme='dark']`(深色:`--bg #0f1115`、`--accent #7dd3c0` 等)。`BaseLayout.astro` 的 `<head>` 有 `is:inline` script,依 localStorage 或 `prefers-color-scheme` 先決定 `document.documentElement.dataset.theme`,避免 FOUC;手動切換按鈕會更新 `data-theme`、寫 localStorage,並 `dispatchEvent(new CustomEvent('themechange'))`,讓元件與圖表重新取色/重繪。
- **明確不做(YAGNI)**:RSS、sitemap、留言、列表分頁、Tailwind。
- **新增目錄**:`src/lib/`(純資料函式,零 DOM,`.astro` 與 `.tsx` 共用)、
  `src/components/blog/`(跨文章的站台元件:目錄、進度條、繼續閱讀提示、收藏、搜尋)。
  閱讀進度與收藏的 localStorage 存取一律經過 `src/lib/reading-progress.ts`,
  元件不直接碰 localStorage。

## 寫一篇文章

1. 在 `src/content/blog/<slug>.mdx` 建檔,frontmatter 必填 `title`、`description`、`pubDate`,選填 `tags`、`draft`(見上面 schema)。
2. 內文用 Markdown/MDX,需要視覺化時從下面四種挑一種(可在同一篇混用),已裝好的套件見 `package.json`:

   | 需求 | 怎麼寫 |
   |---|---|
   | 靜態流程圖/時序圖 | 直接寫 ` ```mermaid ` code fence |
   | 心智圖 | 寫 ` ```markmap ` code fence,內容是巢狀 markdown 清單 |
   | 深度互動流程圖(可拖曳節點、逐步高亮等) | 跟 Claude 用自然語言描述需求,產生用 `@xyflow/react` 的 React 元件,放 `src/components/posts/<slug>/`,在 MDX 裡 import 並加 `client:visible` |
   | 資料圖表(可切參數、tooltip、legend) | 同上,用 `recharts` 產生元件 |

   可參考現有範例:`src/content/blog/rag-fundamentals.mdx` + `src/components/posts/rag-fundamentals/RagPipelineFlow.tsx`(xyflow)、`ChunkSizeChart.tsx`(recharts)。
3. `npm run dev` 即時預覽,深/淺主題各檢查一次(用 nav 上的主題切換鈕觸發 `themechange`)。
4. `npm run build` 必須通過再 commit。

## mermaid / markmap 是怎麼運作的

**不是** remark plugin 轉佔位元素。實際做法:

1. `astro.config.mjs` 把 `markdown.syntaxHighlight.excludeLangs: ['mermaid', 'markmap']`,讓這兩種語言的 code fence 完全跳過 shiki 語法高亮,原封不動輸出成 `<pre><code class="language-mermaid">...</code></pre>`(或 `language-markmap`)。
2. `src/scripts/diagrams.ts` 是一支純 DOM script(**不是元件**,`src/components/` 底下沒有圖表相關目錄),由 `PostLayout.astro` 在頁面上以 `<script>import { initDiagrams } from '../scripts/diagrams'; initDiagrams();</script>` 呼叫:
   - 掃描 `pre > code.language-mermaid` / `.language-markmap`,把整個 `<pre>` 換成 `<div class="diagram diagram-<type>">`
   - 只要頁面上有任一種區塊,才動態 `import('mermaid')` 或 `import('markmap-lib')` + `import('markmap-view')`(完全沒有圖表的文章不會載入這些套件、不進主 bundle)
   - mermaid 渲染完包一層縮放/平移/全螢幕 toolbar(`mountInteractive`,滾輪縮放、拖曳平移、reset、fullscreen 按鈕);markmap 用它自己內建的互動(拖曳、收合節點)
   - 監聽 `window` 的 `themechange` 事件,重新渲染 mermaid(帶對應 `theme: 'dark' | 'default'`);渲染失敗時整塊換成 `<pre class="diagram-error">` 顯示錯誤訊息 + 原始 source,不會讓整頁掛掉

## 元件約定

- 顏色一律透過 `useThemeTokens`(`src/components/shared/useThemeTokens.ts`)讀 CSS custom properties,並提供 fallback 色(例如 `const accent = t['accent'] || '#0e7c66'`,SSR/hydrate 前一瞬間或讀不到值時用);hook 內部已處理 `window` 的 `themechange` 監聽,元件本身不用再訂閱
- 重量級 library(`mermaid`、`markmap-lib`/`markmap-view`,以及日後其他視覺化套件)一律動態 `import()`,不要 static import 進主 bundle —— 參考 `src/scripts/diagrams.ts` 的寫法
- 不用 Tailwind;樣式集中寫在 `src/styles/global.css`,一律用既有 CSS tokens(`--bg`、`--bg-card`、`--text`、`--text-muted`、`--accent`、`--border`、`--radius`、`--danger`,定義在檔案開頭的 `:root` / `[data-theme='dark']`)取色,不要在 CSS 裡 hardcode 顏色值
- 文章專屬互動元件放 `src/components/posts/<slug>/`,只給該篇文章用;`src/components/shared/` 放跨文章共用的東西(目前只有 `useThemeTokens.ts`)
