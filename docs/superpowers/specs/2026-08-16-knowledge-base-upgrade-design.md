# 部落格升級成知識庫:設計文件

- 日期:2026-08-16
- 狀態:已確認,待轉實作計畫
- 參考來源:[notecraft](https://github.com/SteveLin100132/notecraft) v0.5.1(已 clone 讀過原始碼)

## 背景

現況是一個 Astro 6 靜態站,`/` 是 portfolio、`/blog` 是純文章列表,站上有一篇文章。
notecraft 是一套把任意 md/mdx 資料夾變成筆記 App 的 npm CLI 工具,它的閱讀體驗、內容組織與
AI 視覺化工作流值得移植,但它的工具性質(CLI、寫入 API、npm 發佈)對個人網站沒有意義。

本文件定義移植哪些、怎麼移植,以及不做什麼。

## 目標

把 `/blog` 從「文章列表」升級成「可操作的知識庫」:讀者(主要是作者本人)能追蹤讀到哪、
把多篇文章串成有順序的連載、全文搜尋,並讓文章內的互動元件可以全螢幕操作。

視覺方向已定案為**儀表 Instrument**:先給總覽再給細節,狀態用形狀而非僅用文字表達,
語意色與 accent 分離。

## 範圍

### 納入

| 層 | 內容 |
| --- | --- |
| A 閱讀 | 側邊 TOC、頂部閱讀進度條、繼續閱讀、收藏、Pagefind 全文搜尋 |
| B 組織 | Dashboard 式 `/blog`、系列連載、標籤總覽、巢狀資料夾路由 |
| C 視覺化 | 元件放大檢視 + PNG 匯出、`@ai-visualize` 標記與待生成卡片、import 白名單 |

### 明確排除

| 排除項 | 原因 |
| --- | --- |
| CLI(`npx` 啟動器)、npm 發佈 | 那是為了給別人用;本站只有作者一人寫作 |
| 寫入 UI(新增/編輯/刪除筆記 API)、SSE 背景 rebuild | GitHub Pages 是靜態託管,線上不可能寫入;本機 `npm run dev` 的 HMR 已足夠 |
| frontmatter 全 optional 的 fallback 機制 | 現有 zod schema 的嚴格驗證是優點,不應放寬 |
| 簡報層(筆記轉簡報、`/present` 路由) | 對個人部落格過重,擱置;A/B/C 落地後再單獨評估 |
| Tailwind | CLAUDE.md 既有決策,沿用 CSS tokens |
| 帳號系統 / 跨裝置同步 | 為了閱讀進度不值得,靜態站的固有限制照實接受 |

### 已確認的前提

- **部署不變**:維持 GitHub Pages。notecraft 的公開站(Netlify)同樣是 `output: "static"`,
  `netlify.toml` 明寫 "Static deploy only — no functions, no runtime API",本設計的所有功能
  都不需要後端。
- **首頁定位**:`/` 維持 portfolio 不動,Dashboard 放在 `/blog`。
- **巢狀路由已可用**:`content.config.ts` 的 glob pattern 是 `**/*.mdx`(已遞迴),
  `[...slug].astro` 用 rest 參數且 `params.slug` 直接吃 `post.id`,
  故 `src/content/blog/rag/chunking.mdx` → `/blog/rag/chunking` 現在就會生效。
  本項只需寫一篇巢狀文章驗證,不需改程式碼。
- **TOC 資料來源**:Astro 的 `render(post)` 回傳 `headings`(含 `depth` / `slug` / `text`),
  heading 的 `id` 由 Astro 自動加,不需自行解析 HTML 或加 rehype plugin。

## 資料模型

### schema 擴充(`src/content.config.ts`)

在現有 `title` / `description` / `pubDate` / `tags` / `draft` 之外新增三個選填欄位:

| 欄位 | 型別 | 用途 |
| --- | --- | --- |
| `series` | `string?` | 系列 id,對應 `src/data/series.ts` 的 key |
| `seriesOrder` | `number?` | 章節序,決定「第 N 章」 |
| `updatedAt` | `z.coerce.date()?` | Dashboard「最近更新」排序用;未填則視為等同 `pubDate` |

加一條 zod `superRefine`:`series` 與 `seriesOrder` **必須同時存在或同時不存在**,
違反則 build 失敗。避免章節亂序到頁面上才發現。

### 系列元資料(`src/data/series.ts`)

系列的標題與描述不重複寫在每篇 frontmatter,集中一處:

```ts
export const SERIES = {
  'rag-101': {
    title: 'RAG 從零到一',
    description: '把外部知識接進 LLM 的完整路徑',
  },
} as const;
```

zod 無法跨檔驗證 `series` 是否有對應項,故改在 `src/lib/series.ts` 組資料時檢查:
查無對應 key,或同一系列出現重複 `seriesOrder`,一律在 build 階段 `throw`。

### 客戶端狀態(localStorage)

| key | 形狀 |
| --- | --- |
| `blog:progress:v1` | `Record<slug, { pct: number; scrollY: number; at: number }>` |
| `blog:favorites:v1` | `string[]`(slug 陣列) |

key 帶 `:v1` 後綴,日後改形狀時直接換版號,不必寫遷移邏輯。

判定規則(需明確,否則各元件會各自解讀):

- `pct >= 90` 視為**已讀完**
- `pct` 落在 `5 <= pct < 90` 視為**閱讀中**
- 「繼續閱讀」顯示**閱讀中且 `at` 最新**的那一筆;沒有符合的就不顯示這個區塊

## 閱讀層元件行為(A)

以下三項在對話中提過但需要寫死,否則實作時會有第二種解讀:

- **TOC** — 只收 `depth` 2 與 3 的 heading;數量少於 3 個時整個不顯示。
  用 `IntersectionObserver` 高亮當前段落。視窗寬度 ≥ 1200px 時固定在文章右側,
  窄於此則收合成文章開頭的可展開區塊(不能擠壓 720px 的閱讀寬度)。
- **進度條** — 頁面頂部 2px,`scrollY / (documentHeight - viewportHeight)`,
  用 `requestAnimationFrame` 節流。捲動位置與百分比寫回 `reading-progress.ts`。
- **收藏** — 文章頁 header 一顆按鈕切換;收藏的文章在 Dashboard 有獨立區塊,
  沒有收藏任何文章時該區塊不顯示(不留空殼)。

## 路由地圖

| 路徑 | 狀態 | 說明 |
| --- | --- | --- |
| `/` | 不動 | Portfolio |
| `/blog` | 改寫 | 現有列表 → Dashboard |
| `/blog/[...slug]` | 擴充 | 加 TOC、進度條、系列導航、收藏 |
| `/blog/series` | 新增 | 系列列表 |
| `/blog/series/[id]` | 新增 | 單一系列的章節路徑 |
| `/blog/tags` | 新增 | 標籤總覽(目前只有單標籤頁) |
| `/blog/tags/[tag]` | 不動 | 現有 |

## 模組邊界

```
src/lib/                     純資料函式,零 DOM,.astro 與 .tsx 共用
  posts.ts                   排序、統計、標籤計數
  series.ts                  組系列資料、build 期驗證、算前後章
  reading-progress.ts        localStorage 讀寫的唯一入口
src/data/
  series.ts                  系列元資料常數
src/components/blog/         跨文章的站台元件(KPI、文章列、進度環、TOC、搜尋…)
src/components/shared/       useThemeTokens(現有)
src/components/posts/<slug>/ 文章專屬(現有慣例不變)
src/scripts/
  diagrams.ts                現有,mermaid / markmap
  zoomable.ts                新增,從 diagrams.ts 抽出的平移縮放全螢幕邏輯
```

兩條界線是這份設計的重點:

1. **元件不直接碰 `localStorage`**,一律經過 `reading-progress.ts`。SSR 時 `window` 不存在,
   散在各元件會到處要 guard;集中一處只寫一次,也讓判定規則(已讀/閱讀中)只有一個定義。
2. **`zoomable.ts` 由 mermaid 與 React 元件共用**。現有 `diagrams.ts` 的 `mountInteractive`
   已經實作了滾輪縮放、拖曳平移、reset、fullscreen,抽出來讓 C 階段的元件放大檢視直接複用,
   不寫第二套。

## 樣式

沿用 `src/styles/global.css` 的 CSS tokens,不引入 Tailwind。

新增語意色 token,與 `--accent` 分離——狀態色不拿來當裝飾:

| token | 淺色 | 深色 | 語意 |
| --- | --- | --- | --- |
| `--series` | `#3b5bdb` | `#7d95f0` | 系列、新文章 |
| `--pending` | `#b0810f` | `#d9b45e` | 待生成視覺化 |
| `--track` | `#e9ecef` | `#262b33` | 進度條底色 |

版面寬度分兩種:文章頁維持 **720px**(閱讀寬度不動),Dashboard 與系列頁放寬到 **1080px**。
由 `BaseLayout` 新增 `wide` prop 控制,不讓各頁自己覆寫 `main` 的寬度——否則寬度會散落各處。

雙主題是現有優勢,所有新元件一律透過 `useThemeTokens` 取色,深淺兩版都要檢查。

## 搜尋

Pagefind,build 後產生索引,純靜態無後端。

- build 指令改為 `astro build && pagefind --site dist`
- UI:`⌘K` 或 `/` 叫出搜尋 modal
- **dev 模式沒有索引**,此時 modal 顯示「搜尋索引需先執行 npm run build」的提示,
  不得拋錯或顯示空結果誤導
- `draft: true` 的文章不會被建置出來,自然不進索引
- 索引範圍限縮在文章內文:`PostLayout.astro` 的 `<article>` 帶 `data-pagefind-body`。
  沒有這個屬性時 Pagefind 會索引全部建置產物,搜尋結果會混入首頁、部落格列表與標籤頁

**繁體中文檢索:已於 2026-08-17 實測通過,不啟用退路。**

原本列為待驗證項。實測五個取自現有文章的查詢(向量檢索、混合檢索、索引階段、檢索階段、
幻覺抑制),**五個全部命中**,故維持 Pagefind,不改用前端過濾。

一併查明的機制:Pagefind **沒有** `zh-hant` 的斷詞模型,退回逐字元 tokenization
(索引 fragment 中每個漢字之間插入 U+200B)。中文查詢因此實際上是以字元序列比對,
這也是它能命中的原因。副作用是查詢愈短、雜訊愈多——單一漢字的查詢預期精確度不高,
但這對本站的使用情境可以接受。

退路的完整程式碼仍保留在 Phase A 的實作計畫中(`filterPosts()` 與 `search-index.json.ts`),
若日後文章量增加導致檢索品質下降,可直接取用。

## 視覺化層(C)

### 元件放大檢視

每個互動元件外框加一顆「放大」按鈕,進全螢幕畫布:拖曳平移、滾輪縮放、`Esc` 關閉,
**元件互動完整保留**(指標在元件上時事件交給元件,不誤觸畫布平移)。
另提供匯出 PNG,固定寬度與白底,不受當下縮放平移影響。

新增依賴:`html-to-image`。

### `@ai-visualize` 標記

沿用 notecraft 的 MDX 註解格式:

```mdx
{/* @ai-visualize
id: rag-pipeline
type: diagram
status: pending
prompt: |
  畫一張 RAG 檢索流程圖,含切塊、嵌入、檢索、重排、生成五段
*/}
```

需自寫一支 remark plugin 掃出這些註解:`status: pending` 的渲染成「待生成」卡片
(顯示 prompt 摘要),`status: generated` 的不渲染卡片(元件本身已由 import 插入)。

### import 白名單

`src/lib/generated-component-whitelist.ts` 匯出單一常數,消費端兩處:
`astro.config.mjs` 的 `vite.resolve.dedupe`,以及產生元件的 subagent 的 lint 規則。
白名單外的套件在產出前就擋下,不等到 build 才失敗。

## 分階段交付

| 階段 | 內容 | 交付後看得到什麼 |
| --- | --- | --- |
| A 閱讀 | TOC、進度條、繼續閱讀、收藏、Pagefind | 文章頁完整升級;`/blog` 仍是舊列表 |
| B 組織 | Dashboard、系列頁、標籤總覽、`BaseLayout` 寬版 | `/blog` 變成儀表板 |
| C 視覺化 | 放大檢視 + PNG、`@ai-visualize`、白名單 | 文章內互動元件可全螢幕操作 |

A 必須先於 B:Dashboard 的「繼續閱讀」與進度環要吃 A 產生的 localStorage 資料。
C 獨立於 A/B,但排在最後因為它對日常閱讀體驗的影響最小。

每階段各自跑一次 `npm run build` 並人工檢查深淺兩主題,通過才進下一階段。

## 連帶變更

- **`.github/workflows/deploy.yml`** — Pagefind 索引要在 `astro build` 之後產生,
  而 `withastro/action@v3` 預設只跑 `astro build`,需改為自訂 build 指令。
  這是唯一的部署設定變更,無需更換託管。
- **`CLAUDE.md`** — YAGNI 清單目前寫「不做全文搜尋」,與 A 階段直接衝突,必須改寫;
  另需補上新增的目錄結構(`src/lib/`、`src/data/`、`src/components/blog/`)、
  新的 frontmatter 欄位、以及 build 指令的變化。

## 驗收

- `npm run build` 通過(含 Pagefind 索引產生)
- 每個新頁面與元件在深、淺主題各檢查一次
- 巢狀資料夾:實際新增一篇 `<資料夾>/<檔名>.mdx` 驗證路由生效
- schema 驗證:故意寫一篇只有 `series` 沒有 `seriesOrder` 的草稿,確認 build 失敗
- 進度與收藏:重新整理後狀態保留;清空 localStorage 後不報錯

## 已知限制

- 閱讀進度與收藏存 localStorage,**每個瀏覽器各自獨立,換裝置不同步**。這是靜態站的
  固有限制,已評估後接受(做帳號系統的成本遠高於此功能的價值)。
- 搜尋索引只在 build 時產生,`npm run dev` 下不可用。
- 文章少時 Dashboard 的統計與 sparkline 會顯得單薄,這是內容量問題不是設計問題。
