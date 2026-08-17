# 部落格升級成知識庫:設計文件

- 日期:2026-08-16(2026-08-17 修訂:回寫 A 階段的實作決策,補齊 B / C 的規格細節)
- 狀態:A 已交付並部署;B、C 待轉實作計畫
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
| Dashboard 的發文頻率 sparkline | 2026-08-17 決定移除。原本只出現在「已知限制」裡,從未正式納入範圍。站上目前一篇文章,折線圖畫不出趨勢只會變成裝飾;要看趨勢至少得有數十篇。等內容量到了再單獨評估 |

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

**本節已於 2026-08-17 依實際交付的程式碼回寫。** 原本規定的 `IntersectionObserver`
在實作中被推翻,下面是現況,B、C 階段以此為準。

- **TOC** — 只收 `depth` 2 與 3 的 heading;數量少於 3 個時整個不顯示。
  視窗寬度 ≥ 1200px 時固定在文章右側,窄於此則收合成文章開頭的可展開區塊
  (不能擠壓 720px 的閱讀寬度)。
- **進度條** — 頁面頂部 2px,`scrollY / (documentHeight - viewportHeight)`,
  用 `requestAnimationFrame` 節流。捲動位置與百分比寫回 `reading-progress.ts`。
- **收藏** — 文章頁 header 一顆按鈕切換;收藏的文章在 Dashboard 有獨立區塊,
  沒有收藏任何文章時該區塊不顯示(不留空殼)。

### 已推翻的原規定與現行做法

| 原規定 | 現行做法 | 理由 |
| --- | --- | --- |
| TOC 用 `IntersectionObserver` 高亮 | 每幀直接算「最後一個已捲過門檻線的標題」,門檻線在剩餘捲動不足一屏時從 140px 平滑掃到視窗底部 | 觀察區縮到視窗頂端一小條時,文件末尾的標題永遠進不了那條區帶。實測整篇捲到底,7 項只推進到第 5 項就停住。詳見 `src/components/blog/Toc.tsx` 的註解 |
| 進度條用 `width` 呈現 | `transform: scaleX()` | `width` 每幀觸發 layout + paint;文章頁還掛著 mermaid / xyflow / recharts,容易掉幀 |

### A 階段額外定案、B/C 必須遵守的兩條

這兩條不在原規格裡,是除錯過程中定案的,已經是其他程式碼的前提:

1. **全站錨點捲動用 CSS 完成。** `html` 設 `scroll-behavior: smooth` 與
   `scroll-padding-top: 24px`,並在 `prefers-reduced-motion: reduce` 下退回 `auto`。
   **連帶效應**:程式化捲動若直接寫 `scrollTop = X` 會變成動畫,量測時會取樣到動畫
   中途的位置。任何自動化量測一律用 `scrollTo({ behavior: 'instant' })`
   (`.claude/uiprobe/` 已照此實作)。
2. **互動元件不得無條件吃掉滾輪。** mermaid 的 `mountInteractive`、markmap、
   xyflow 一律只在按住 ⌘/Ctrl 時才縮放,其餘情況讓頁面照常捲動。理由是游標掃過圖表
   時整頁停住,讀者會以為頁面卡住。macOS 觸控板的雙指捏合本身就送出 `ctrlKey=true`
   的 wheel 事件,所以捏合縮放仍然自然可用。
   **C 階段的 `zoomable.ts` 抽取不得回退這條行為**,`uiprobe wheel` 必須維持三個元件
   都 100% 讓路。

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
  reading-progress.ts        A:localStorage 讀寫的唯一入口(現有)
  posts.ts                   B:排序、統計、標籤計數
  series.ts                  B:組系列資料、build 期驗證、算前後章
  generated-component-whitelist.ts  C:可用 import 清單
src/data/
  series.ts                  B:系列元資料常數
src/components/blog/         跨文章的站台元件(狀態記號、文章列、系列、TOC、搜尋…)
src/components/shared/       useThemeTokens(現有)、ZoomFrame.tsx(C)
src/components/posts/<slug>/ 文章專屬(現有慣例不變)
src/scripts/
  diagrams.ts                現有,mermaid / markmap
  zoomable.ts                C:從 diagrams.ts 抽出的平移縮放全螢幕邏輯
src/plugins/
  remark-ai-visualize.ts     C:掃 @ai-visualize 註解
scripts/
  check-imports.mjs          C:白名單檢查
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

| token | 淺色 | 深色 | 語意 | 何時加 |
| --- | --- | --- | --- | --- |
| `--track` | `#e9ecef` | `#262b33` | 進度條底色 | A,已加 |
| `--series` | `#3b5bdb` | `#7d95f0` | 系列、新文章 | B |
| `--pending` | `#b0810f` | `#d9b45e` | 待生成視覺化 | C |

版面寬度分兩種:文章頁維持 **720px**(閱讀寬度不動),Dashboard 與系列頁放寬到 **1080px**。
由 `BaseLayout` 新增 `wide` prop 控制,不讓各頁自己覆寫 `main` 的寬度——否則寬度會散落各處。

**取色方式依元件型態而定**,兩者不可混用:

- 一般 DOM 元件(B 的全部元件)——寫 CSS class,顏色一律 `var(--…)`,樣式集中在
  `global.css`。**不要用 `useThemeTokens`**,那會把顏色搬進 JS,主題切換時還要自己重繪。
- 需要把顏色當成 JS 值傳給繪圖 library 的元件(recharts、xyflow,C 的部分元件)——
  才用 `useThemeTokens`,並帶 fallback 色。這是 CLAUDE.md 既有規定。

深淺兩版都要檢查。靜態的 token 使用是否合規交給 `theme-design-reviewer`,
切完主題頁面實際長什麼樣交給 `ui-behavior-verifier`。

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

## 內容組織層(B)

### 一條貫穿全層的規則:靜態資料在伺服器算,個人狀態在客戶端疊

Dashboard 的每個區塊都同時需要兩種資料:**文章元資料**(build 期就確定)與
**閱讀狀態**(只存在讀者的 localStorage)。混著寫會出現 SSR 與 hydrate 後不一致的閃爍。

因此定死:**任何需要疊閱讀狀態的區塊,整塊做成一個 island,props 只吃 build 期算好的
純資料(可 JSON 序列化),localStorage 完全在元件內部讀。** 不需要閱讀狀態的區塊
(標籤雲)維持純 Astro 靜態渲染,不進 JS bundle。

一律 `client:load` 而非 `client:visible`:Dashboard 首屏就會看到這些區塊,
等進視窗才掛載會看到內容跳動。

### `/blog` Dashboard 版面

視覺方向「儀表 Instrument」落實成三件事:**先總覽再細節**(KPI 在最上)、
**狀態用形狀表達**(不只靠顏色)、**語意色與 accent 分離**(`--series` / `--pending`
不拿來當裝飾色)。

區塊由上而下,**任一區塊無資料就整塊不顯示,不留空殼**:

| # | 區塊 | 型態 | 資料來源 | 無資料時 |
| --- | --- | --- | --- | --- |
| 1 | KPI 列 | 靜態 + 一顆小 island | 文章數 / 系列數 / 標籤數為靜態;「已讀完 N 篇」為 island | 永遠顯示 |
| 2 | 繼續閱讀 | island | `pickResume()` | 沒有閱讀中的文章 → 不顯示 |
| 3 | 收藏 | island | `readFavorites()` | 沒有收藏 → 不顯示 |
| 4 | 系列 | island | `buildSeries()` + 各系列已讀完章節數 | 沒有任何系列 → 不顯示 |
| 5 | 標籤 | 純靜態 | `countTags()` | 沒有標籤 → 不顯示 |
| 6 | 全部文章 | island | 依 `updatedAt ?? pubDate` 倒序 | 永遠顯示(沒有文章時整個 Dashboard 就不成立) |

**狀態記號**(區塊 3、4、6 共用一個元件,不各寫一套)——三種狀態各有各的形狀,
不是同一個圓形換三種顏色:

| 狀態 | 判定 | 形狀 |
| --- | --- | --- |
| 未讀 | 沒有紀錄,或 `pct < 5` | 空心圓(1px 邊框、透明填色) |
| 閱讀中 | `5 <= pct < 90` | 半填圓(用 `conic-gradient` 依實際 `pct` 填,兼作進度環) |
| 已讀完 | `pct >= 90` | 實心圓 + 內嵌勾號 |

判定門檻一律取自 `reading-progress.ts` 的 `STARTED_PCT` / `FINISHED_PCT`,不在元件裡
重寫數字。

**KPI 列的切法**:前三個數字由 Astro 直接 SSR 出來(不需要 JS);第四個「已讀完 N 篇」
單獨做成 `<ReadCount slugs={[...]} client:load />`,hydrate 前顯示 `—` 而不是 `0`,
避免從 0 跳到實際值。

### `/blog/series` 系列列表

每個系列一張卡:標題、描述、章節數、整體進度條(已讀完章節 / 總章節)、最前面三章的
連結。整頁一個 island(需要進度)。

### `/blog/series/[id]` 單一系列

`getStaticPaths` 只吐**「`SERIES` 有登記」且「至少有一篇文章掛在上面」**的 id。
章節依 `seriesOrder` 升冪列出,每列:序號、標題、狀態記號、`description`。

反向的空系列(`SERIES` 登記了但一篇文章都沒有)**略過,不產生路由,不報錯**——
那只是先登記了系列還沒開始寫,不該擋 build。這與「文章的 `series` 指向不存在的 key
要 throw」是兩個不同方向,別搞混。

### `/blog/tags` 標籤總覽

純靜態。所有標籤依文章數倒序、同數依字母序,每個標籤顯示名稱與篇數,連到現有的
`/blog/tags/[tag]`。`/blog/tags/[tag]` 本身不動。

### 文章頁的系列導航

`/blog/[...slug]` 在文章結尾加一條:「第 N 章 / 共 M 章」與上一章 / 下一章連結。
文章沒有 `series` 就整條不顯示。這塊是純靜態(不需要閱讀狀態),由 Astro 渲染。

### `BaseLayout` 寬版

新增 `wide?: boolean`(預設 `false`)。`<main>` 在 `wide` 時多帶一個 class,CSS:

```css
main { max-width: 720px; }        /* 現有第 47 行,不動 */
main.is-wide { max-width: 1080px; }
```

寬度只在這一處定義,各頁不得自己覆寫 `main` 的寬度。用 `wide` 的頁面:`/blog`、
`/blog/series`、`/blog/series/[id]`、`/blog/tags`。文章頁維持 720px。

### 新增的 `src/lib/` 函式

全部是純函式、零 DOM,可用 vitest 直接測(這是 `src/lib/` 存在的理由)。

```ts
// src/lib/posts.ts
export interface PostSummary {
  slug: string;          // = entry.id
  title: string;
  description: string;
  pubDate: Date;
  updatedAt: Date;       // 未填 updatedAt 時等同 pubDate,在此處補齊,下游不再判斷
  tags: string[];
  series?: string;
  seriesOrder?: number;
}
export function toSummary(entry: CollectionEntry<'blog'>): PostSummary;
export function sortByDate(posts: PostSummary[], key?: 'pubDate' | 'updatedAt'): PostSummary[];
export function countTags(posts: PostSummary[]): Array<{ tag: string; count: number }>;
export function stats(posts: PostSummary[]): { total: number; seriesCount: number; tagCount: number };
```

```ts
// src/lib/series.ts
export interface SeriesChapter { slug: string; title: string; description: string; order: number }
export interface SeriesInfo { id: string; title: string; description: string; chapters: SeriesChapter[] }

/** 組系列資料並在 build 期驗證。章節已依 order 升冪排好。 */
export function buildSeries(posts: PostSummary[]): SeriesInfo[];

/** 算某篇文章在系列中的位置與前後章。slug 不在此系列則回傳 null。 */
export function neighbors(
  series: SeriesInfo,
  slug: string
): { prev?: SeriesChapter; next?: SeriesChapter; index: number; total: number } | null;
```

`buildSeries` 的 build 期驗證,兩種情況一律 `throw`(訊息要帶得出是哪篇文章、哪個
系列,否則 build 失敗時找不到源頭):

1. 文章的 `series` 在 `src/data/series.ts` 查無對應 key
2. 同一系列出現重複的 `seriesOrder`

```ts
// src/lib/reading-progress.ts — 在現有匯出之外新增
export type ReadStatus = 'unread' | 'reading' | 'finished';
export function statusOf(slug: string, map: ProgressMap): ReadStatus;
export function summarize(
  slugs: string[],
  map: ProgressMap
): { finished: number; reading: number; unread: number };
```

`statusOf` 是狀態記號元件的唯一判定來源,`summarize` 給 KPI 與系列進度用。
兩者都必須沿用既有的 `STARTED_PCT` / `FINISHED_PCT` 與 `isValidEntry`,不重寫門檻。

### 新增的元件

放 `src/components/blog/`(跨文章的站台元件,沿用現有慣例):

| 元件 | 用在 | 說明 |
| --- | --- | --- |
| `ReadStatusDot.tsx` | 3、4、6 與系列頁 | 三種形狀的狀態記號,吃 `status` 與 `pct` |
| `ReadCount.tsx` | KPI 列 | 「已讀完 N 篇」 |
| `ResumeCard.tsx` | Dashboard 區塊 2 | 與文章頁既有的 `ResumePrompt.tsx` **不共用**:一個是列表卡片、一個是文章內橫幅,版面與文案都不同,強行共用只會塞滿 props |
| `FavoriteList.tsx` | Dashboard 區塊 3 | |
| `SeriesRail.tsx` | Dashboard 區塊 4、`/blog/series` | |
| `PostList.tsx` | Dashboard 區塊 6 | 帶狀態記號的文章列 |

## 視覺化層(C)

### `zoomable.ts`:把既有的縮放平移邏輯抽出來

現有 `src/scripts/diagrams.ts` 的 `mountInteractive` 已經實作了滾輪縮放、拖曳平移、
reset、fullscreen。抽成 `src/scripts/zoomable.ts` 讓 mermaid 與 React 元件共用,不寫第二套。

```ts
export interface ZoomableOptions {
  /** toolbar 左側的提示文字。預設「⌘/Ctrl + 滾輪縮放,拖曳平移」 */
  hint?: string;
  /** 有值才顯示匯出按鈕;點擊時呼叫 */
  onExport?: () => void | Promise<void>;
  /** 縮放範圍,預設 [0.3, 8] */
  scaleRange?: [number, number];
}
export interface ZoomableHandle {
  reset(): void;
  destroy(): void;
}
/** 在 container 內建出 toolbar + viewport + canvas,把 content 掛進 canvas。 */
export function mountZoomable(
  container: HTMLElement,
  content: HTMLElement | string,
  opts?: ZoomableOptions
): ZoomableHandle;
```

抽取時**必須原樣保留**下列既有行為,任何一條回退都算實作失敗:

- 滾輪只有 `e.ctrlKey || e.metaKey` 時才縮放並 `preventDefault`;否則直接 `return`,
  讓頁面照常捲動。監聽一律 `{ passive: false }`。
- markmap 走的是另一條路:它的 d3-zoom 監聽掛在自己的 svg 上,`zoomable` 管不到,
  現行做法是在外層 container 的 **capture 階段** `stopPropagation`(不呼叫
  `preventDefault`)。這條不併進 `zoomable.ts`,留在 `diagrams.ts` 的 markmap 分支。
- toolbar 有 reset(`⟲`)與 fullscreen(`⛶`)按鈕,以及 hint 文字。
- 渲染失敗時整塊換成 `<pre class="diagram-error">` 顯示錯誤訊息 + 原始 source,
  不讓整頁掛掉。

`diagrams.ts` 抽完之後只留「找 code fence、動態 import、渲染、主題重繪」,
互動一律轉呼叫 `mountZoomable`。

### 元件放大檢視

React 元件外框元件 `src/components/shared/ZoomFrame.tsx`,包住任意 children,
右上角 toolbar 兩顆按鈕:放大、匯出 PNG。

- **放大**:對外框呼叫 `requestFullscreen()`(沿用 `diagrams.ts` 既有做法,不自製
  overlay);`Esc` 由瀏覽器原生處理,不自寫鍵盤監聽。
- **平移只在指標按在畫布本身時啟動**:`pointerdown` 的 `e.target === canvas` 才開始
  拖曳。落在子元素(xyflow 的節點、recharts 的圖元、按鈕)上時不啟動,元件互動完整
  保留。這條規則要寫死,不要用「猜測哪些子元素算互動」的啟發式判斷。
- **縮放**沿用 `zoomable` 的 ⌘/Ctrl 規則,不另開一套。

### PNG 匯出

新增依賴:`html-to-image`,動態 `import()`(不進主 bundle,沿用 CLAUDE.md 對重量級
library 的既有規定)。

- 匯出前先在離畫面的 clone 上把 transform 歸零,**不受當下縮放平移影響**;固定輸出
  寬度 1200px、`pixelRatio: 2`。
- **背景色跟隨當下主題**(讀 `--bg`),不是原規格寫的固定白底。原規定會讓深色主題下的
  mermaid 匯出成白底淺字,幾乎看不見。這是 2026-08-17 的修訂。
- 檔名 `<post-slug>-<component-id>.png`。

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

自寫一支 remark plugin `src/plugins/remark-ai-visualize.ts`,掃 MDX 的
`mdxFlowExpression` 節點,內容以 `@ai-visualize` 開頭者取其後的 YAML 解析
(新增 `yaml` 依賴,明確宣告而不倚賴 Astro 的間接相依)。

欄位:

| 欄位 | 必填 | 值 |
| --- | --- | --- |
| `id` | 是 | 同一檔案內不得重複 |
| `type` | 是 | `diagram` / `chart` / `flow` |
| `status` | 是 | `pending` / `generated` |
| `prompt` | `status: pending` 時必填 | 自然語言描述 |

行為:

- `status: pending` → 節點換成待生成卡片 `<div class="ai-pending" data-id="…">`,
  顯示 type 標記與 prompt 前 120 字。卡片用 `--pending` 語意色,不用 `--accent`。
- `status: generated` → 節點整個移除(元件本身已由 MDX 的 import 插入)。
- 欄位缺漏、值不合法、`id` 重複 → **build 期 `throw`**,訊息要帶檔案路徑與 `id`。

### import 白名單

`src/lib/generated-component-whitelist.ts` 匯出單一常數:

```ts
export const ALLOWED_IMPORTS = [
  'react',
  'recharts',
  '@xyflow/react',
  'motion',
  '../../shared/useThemeTokens',
] as const;
```

消費端兩處:

1. **`interactive-component-builder` agent 的規則** — 產生元件時只能用清單內的 import。
2. **`scripts/check-imports.mjs`** — 掃 `src/components/posts/**/*.tsx` 的 import,
   有清單外的就非零離開。掛成 `npm run lint:imports`,並加進
   `.github/workflows/deploy.yml`(與現有的 `npm test` 並列)。

原規格寫消費端是 `astro.config.mjs` 的 `vite.resolve.dedupe`,**那是錯的**:`dedupe`
解決的是同一套件被打包多份實例的問題,跟限制可用套件無關。2026-08-17 更正。

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

- **`.github/workflows/deploy.yml`** — A 已完成:改為明確步驟並加跑 `npm test`。
  C 階段再加一步 `npm run lint:imports`。
- **`CLAUDE.md`** — A 已完成(YAGNI 清單移除全文搜尋、補上新目錄與 uiprobe)。
  B 要補 `series` / `seriesOrder` / `updatedAt` 三個 frontmatter 欄位與
  `src/data/series.ts` 的維護方式;C 要補 `@ai-visualize` 的寫法與白名單規則。
- **`package.json`** — B 不新增依賴;C 新增 `html-to-image` 與 `yaml`,
  並新增 `lint:imports` script。
- **`.claude/uiprobe/`** — B、C 的互動驗證用既有探針;若 Dashboard 需要新的量測維度
  (例如狀態記號是否隨 localStorage 正確更新),在 `probe.mjs` 補指令而不是又寫一次性腳本。

## 驗收

### 全階段共通

- `npm run build` 通過(含 Pagefind 索引產生)
- `npm test` 通過
- 每個新頁面與元件在深、淺主題各檢查一次
- `uiprobe health` 在所有新頁面回 PASS(0 console 錯誤、0 失敗請求、無橫向溢出)

### A(已交付)

- 進度與收藏:重新整理後狀態保留;清空 localStorage 後不報錯
- `uiprobe scrollspy / anchor / track / wheel` 全數 PASS

### B

- 巢狀資料夾:實際新增一篇 `<資料夾>/<檔名>.mdx` 驗證路由生效
- schema 驗證:故意寫一篇只有 `series` 沒有 `seriesOrder` 的草稿,確認 **build 失敗**
- 跨檔驗證:故意把某篇的 `series` 指向 `src/data/series.ts` 沒有的 key,確認 build 失敗
  且錯誤訊息指得出是哪一篇
- 重複序號:兩篇同系列同 `seriesOrder`,確認 build 失敗
- 空系列:`SERIES` 登記一個沒有任何文章的 key,確認 **build 成功**且不產生該路由
- 空狀態:清空 localStorage 後開 `/blog`,確認繼續閱讀、收藏兩個區塊完全不出現
  (不是出現空框)
- KPI 的「已讀完」在 hydrate 前顯示 `—`,不是先顯示 `0` 再跳

### C

- `zoomable.ts` 抽取後,`uiprobe wheel` 仍維持 mermaid / xyflow / markmap 三者 100% 讓路
  ——**這是 C 最容易回退的一項**
- 放大檢視內,xyflow 的節點仍可拖曳、recharts 的 tooltip 仍會出現(平移沒有蓋掉元件互動)
- PNG 匯出:深、淺主題各匯一張,確認背景色跟隨主題且內容不受當下縮放平移影響
- `@ai-visualize`:`status: pending` 出現待生成卡片;`status: generated` 不出現卡片;
  缺 `prompt` 的 pending、重複 `id`、不合法的 `type` 三種情況各自 build 失敗
- `npm run lint:imports`:故意在文章元件裡 import 白名單外的套件,確認非零離開

## 已知限制

- 閱讀進度與收藏存 localStorage,**每個瀏覽器各自獨立,換裝置不同步**。這是靜態站的
  固有限制,已評估後接受(做帳號系統的成本遠高於此功能的價值)。
- 搜尋索引只在 build 時產生,`npm run dev` 下不可用。
- 文章少時 Dashboard 的統計會顯得單薄,這是內容量問題不是設計問題(sparkline 已因此
  移出範圍,見「明確排除」)。
- 匯出的 PNG 只含元件本身,不含頁面上下文與文章標題。要帶標題的圖得自己組。
