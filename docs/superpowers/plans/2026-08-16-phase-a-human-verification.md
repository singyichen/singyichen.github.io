# 給人類的驗證清單(Needs human verification)

以下整合自 Task 3–8 報告與本任務 brief 的 Step 7,建議依序在一次瀏覽器 session 中做完。每一大項都要在 `npm run preview` 開站後、**深色與淺色主題各測一次**(除非該項目本身就是在測主題切換)。

## 0. 前置

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run preview
```

## 1. 閱讀進度條(`/blog/rag-fundamentals`)

1. 往下捲動頁面,確認畫面最頂端有一條 2px 高的細條,填色寬度隨捲動即時增加。
2. 捲到文章最底部,確認細條幾乎填滿整個寬度。
3. DevTools → Application → Local Storage,確認有 key `blog:progress:v1`,值含 `rag-fundamentals` 條目,內有 `pct`、`scrollY`、`at`。捲動後等 1 秒以上或離開頁面(觸發 `pagehide`)再檢查。
4. 切換主題:確認未讀部分(`--track`)與已讀部分(`--accent`)顏色皆隨主題改變。

## 2. 繼續閱讀提示

1. 開文章,捲到約 30–50%,離開(不要用瀏覽器上一頁,直接關分頁或換網址)。
2. 重新開啟同一篇文章:文章 header 下方應出現「上次讀到 XX%」提示,含「跳到上次位置」與「×」兩個按鈕。
3. 點「跳到上次位置」:平滑捲動到上次位置,提示消失。
4. 重開文章、點「×」:提示立即消失,不捲動。
5. 捲到 95%以上再離開、重開:**不應出現提示**(視為已讀完)。
6. 完全不捲動就離開、重開:**不應出現提示**;之後捲 5% 左右再離開、重開,應出現「上次讀到約 5%」的提示(驗證未捲動時不會用 0% 覆蓋舊進度)。
7. 捲到約 50% 離開、重開:提示應穩定出現「上次讀到 50%」(不受兩個 island 掛載順序影響),點擊後應精準跳到當初的位置。

## 3. 側邊目錄 TOC

1. 視窗寬度 ≥1200px:TOC 應固定顯示在文章右側,不遮住內文。
2. 往下捲動:目前所在段落對應的 TOC 項目應變成 accent 色高亮。
3. 點擊某個 TOC 項目:頁面應跳到對應標題。
4. 視窗寬度 <1200px:TOC 應收合成「目錄」按鈕;點擊展開清單;點清單內任一連結後應同時導航並自動收合。
5. 若某篇文章有 `###` 緊接在 `##` 下面(目前 `rag-fundamentals` 沒有,若之後有新文章可測):確認高亮的是視窗最上方那個標題,而不是同批同時進入觸發帶的標題中隨機一個。

## 4. 收藏按鈕

1. 初始狀態:顯示「☆ 收藏」,顏色為 muted。
2. 點擊收藏:文字變「★ 已收藏」,邊框與文字變成 accent 色。
3. 重新整理頁面:收藏狀態應保留(讀 localStorage `blog:favorites:v1`)。
4. 再點一次取消收藏:文字變回「☆ 收藏」,重整後確認確實已移除。
5. 開另一篇文章收藏,回到第一篇確認第一篇仍是收藏狀態(每篇獨立追蹤)。
6. **多分頁一致性**:同一篇文章開兩個分頁,分頁一收藏、分頁二再收藏(此時應變成取消收藏),重整分頁二,確認顯示「☆ 收藏」(狀態與 storage 一致,不是分頁二記憶體裡的舊值)。

## 5. 搜尋(Pagefind)——含五個中文查詢

### 5a. `npm run dev` 模式(**不是** preview)

1. 按 `⌘K`(或 Ctrl+K):對話框開啟,應**只**顯示「搜尋索引尚未產生。索引只在建置時建立,請先執行 `npm run build`,或到已部署的線上站台使用搜尋。」——沒有空白結果清單,瀏覽器 console **沒有**任何未捕捉的錯誤。

### 5b. `npm run preview` 模式——功能性檢查

1. 按 `⌘K`:對話框開啟,輸入框自動 focus。
2. 輸入「RAG」:應出現結果,命中的詞用 `<mark>` 標示(accent 底色)。
3. 點擊結果:應導航到該篇文章。
4. 按 `Esc`:關閉對話框。點擊背景遮罩(面板外側):也應關閉。
5. 輸入框有 focus 時按 `/`:**不應**重新觸發/關閉對話框,應該就是在輸入框打出一個 `/` 字元。
6. 對話框開啟或關閉時切換主題,再重新開啟:面板背景、邊框、輸入框、提示文字、`<mark>` 高亮顏色都應該正確跟著主題變。
7. 透過 nav 上的「搜尋 ⌘K」按鈕(不是鍵盤快捷鍵)開啟:行為應與鍵盤快捷鍵一致。
8. **鍵盤操作全流程**:Tab 到「搜尋 ⌘K」按鈕、按 Enter 開啟、按 Esc 關閉,確認焦點確實回到該按鈕上(不是掉到 `<body>`)。

### 5c. `npm run preview` 模式——五個繁體中文查詢(本任務的核心驗收項)

依序在搜尋框輸入以下五個詞(皆取自 `src/content/blog/rag-fundamentals.mdx` 的實際標題/內文,非本任務虛構),記錄是否命中 `rag-fundamentals` 這篇文章:

| 查詢 | 來源 |
| --- | --- |
| `向量檢索` | 標題「向量檢索(Top-K)」+ 內文出現 3 次 |
| `混合檢索` | 標題「混合檢索(+BM25)」 |
| `索引階段` | 標題「索引階段」 |
| `檢索階段` | 標題「檢索階段」 |
| `幻覺抑制` | 標題「幻覺抑制」 |

**判讀標準**(沿用 brief 原本的門檻,但去留判斷本身留給你決定,我不代為判斷):

- **5 個中至少命中 4 個** → Pagefind 中文可用,維持現狀,不用做任何退路。
- **命中 3 個** → 邊界情形,先別自己做決定,回報這個結果讓你決定要不要接受、或改走退路。
- **命中 2 個以下** → 建議走 brief 原本設計的退路:改用 `title + description + tags` 的前端子字串過濾(brief Step 3 已經寫好 `src/lib/posts.ts` 的 `filterPosts()`、`src/pages/search-index.json.ts` 的具體程式碼與改法,可直接照做,不需另外設計)。

**補充背景**(來自本任務 A 節的索引檢查,幫助你解讀結果):Pagefind 對 zh-hant 沒有詞幹/分詞模型,索引內容是逐字元切詞(每個中文字元之間插入詞界)。這代表即使「命中」,也可能是靠字元层级的比對而非真正的詞彙比對——如果你發現某個查詢「命中了但命中得莫名其妙」(例如命中了不相關的頁面),那也是值得記錄的資訊,不只是單純算命中或沒命中。

## 6. 部署後才能做的檢查(合併到 main、GitHub Actions 跑過一次之後)

1. 該次 Actions run 的 `npm run build` 步驟輸出中,應包含 Pagefind 的索引訊息(`Indexed N pages` / `Indexed N words`),頁面數應與本機一致(若文章數量有變動,以屆時 CI 實際輸出為準,只需確認訊息存在且合理)。
2. 部署完成後開啟 `https://singyichen.github.io/pagefind/pagefind.js`,應回傳 JavaScript 內容(而非 404)。

## 7. 整體收尾檢查

1. 清空 localStorage(DevTools → Application → Local Storage → 右鍵 Clear)後重新整理頁面,確認**不報錯**(無論是文章頁還是列表頁)。
2. 以上第 1–5 節,**深色與淺色主題各檢查一次**(用 nav 上的主題切換鈕觸發,確認沒有任何項目在切換後顏色沒跟上或殘留舊主題的硬編碼顏色)。

---

## 修正報告(Review 後追加)

### 發現

Review 指出 CLAUDE.md「新增目錄」段落描述 `src/components/blog/` 時只列了四個元件(目錄、進度條、收藏、搜尋),漏掉 `ResumePrompt.tsx`(繼續閱讀提示)——該目錄實際有五個元件。文件與實際目錄內容不符,讓之後查閱 CLAUDE.md 的人不會知道這個元件存在。

### 修改內容

`CLAUDE.md`,「新增目錄」段落,唯一一處字串修改:

```diff
-  `src/components/blog/`(跨文章的站台元件:目錄、進度條、收藏、搜尋)。
+  `src/components/blog/`(跨文章的站台元件:目錄、進度條、繼續閱讀提示、收藏、搜尋)。
```

保留原本的措辭與條列順序風格(依元件在頁面上出現的順序補進去),未動 review 明確排除範圍的「零 DOM,`.astro` 與 `.tsx` 共用」用語,也未動其他任何段落或檔案。

### 驗證指令與輸出

```
$ PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
 Test Files  1 passed (1)
      Tests  27 passed (27)
```

```
$ rm -rf dist && PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
...
[build] 6 page(s) built in ...s
[build] Complete!
Running Pagefind v1.5.2 (Extended)
...
  Indexed 1 language
  Indexed 6 pages
  Indexed 531 words
```

兩者皆通過,數字(27/27、6 頁/531 字)與修正前一致,無迴歸。

### Commit

```
0665b1c docs: 補上 CLAUDE.md 遺漏的繼續閱讀提示元件
```

`git status --porcelain` 於 commit 前後皆確認乾淨,僅 `CLAUDE.md` 一個檔案變更(`+1 -1`)。

---

## 6. 最終修復波新增的檢查項

以下是最終全分支審查後那一輪修復(commits 79b9a00..a9e5566)帶進來的,一併驗。

1. **Fix 1/2 UI states** — open the search dialog, type a query fast enough to
   land before `pagefind.js` resolves, and confirm "搜尋索引載入中…" appears
   briefly before results (or "找不到符合的文章。") replace it. Hard to
   trigger deliberately since the import is normally fast on a warm cache;
   throttling network in devtools may help.
2. **Fix 2 retry UX** — on the deployed site, simulate a transient failure
   (e.g. block `/pagefind/pagefind.js` once via devtools request blocking,
   open search, see the "尚未產生" message, unblock, close and reopen the
   dialog) and confirm a fresh `load()` attempt succeeds and search works
   without a page reload.
3. **Fix 3 search relevance** — after `npm run build` + `npm run preview`,
   search for a term that appears in the article body and confirm only the
   article page shows up, not `/blog`, tag pages, or `/`.
4. **Fix 7 reduced motion** — with the OS/browser "reduce motion" preference
   on, click "跳到上次位置" in the resume prompt and confirm the jump is
   instant (no smooth animation). With reduce-motion off, confirm it's still
   a smooth scroll (no regression).
5. **General regression pass** — reading progress bar, resume prompt, TOC, and
   favorite button on an article page in both light and dark themes, since
   Fix 6 changes what `readInitialProgress`/`readProgress` hand back (filtered
   now) — confirm normal (non-corrupted) localStorage data still round-trips
   and displays exactly as before.
