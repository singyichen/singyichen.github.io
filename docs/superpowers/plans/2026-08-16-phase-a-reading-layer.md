# Phase A 閱讀層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓文章頁具備側邊目錄、頂部閱讀進度條、重開文章時可跳回上次位置、收藏,以及全站 Pagefind 全文搜尋。

**Architecture:** 判定規則(已讀完 / 閱讀中 / 挑哪一筆繼續讀)全部收在 `src/lib/reading-progress.ts` 的純函式裡並以 vitest 覆蓋;localStorage 存取包在同一個模組的薄殼中,接受注入的 storage 以便測試。UI 是四個 React island,透過 CSS custom properties 取色,不在 JS 裡寫顏色。搜尋用 Pagefind 在 build 後產生靜態索引,執行期以動態 import 載入,dev 模式載入失敗時顯示提示而非報錯。

**Tech Stack:** Astro 6(static output)、React 19 islands、vitest(僅測 `src/lib/`)、Pagefind、原生 CSS custom properties(不用 Tailwind)。

## Global Constraints

- Node 版本:所有指令前加 `PATH="/opt/homebrew/opt/node@22/bin:$PATH"`。Astro 6 要求 Node >= 22.12,本機預設 `node` 是 v20。
- 本工作目錄目前**沒有 `node_modules/`**,Task 0 必須先安裝。
- 不引入 Tailwind。所有顏色取自 `src/styles/global.css` 的 CSS tokens(`--bg`、`--bg-card`、`--text`、`--text-muted`、`--accent`、`--border`、`--radius`、`--danger`),不在 CSS 或 JS 裡 hardcode 色值。
- **`useThemeTokens` 只用在需要把顏色當 JS 值傳給繪圖庫的元件**(recharts、xyflow)。本階段的元件都是純 DOM,一律用 CSS class + `var(--token)`,不要為了遵守慣例而繞道 JS 取色。
- 文章閱讀寬度維持 **720px**,本階段不得更動 `main` 的寬度。
- 每個 task 結束前 `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build` 必須通過。
- 深、淺兩種主題各檢查一次,用 nav 上的主題切換鈕觸發 `themechange`。
- localStorage key 固定為 `blog:progress:v1` 與 `blog:favorites:v1`。
- 判定門檻:`pct >= 90` 為已讀完;`5 <= pct < 90` 為閱讀中。
- Commit 訊息用繁體中文描述,結尾加 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。

## 本階段的交付邊界

Spec 的 A 層列了「繼續閱讀」,但 Dashboard 屬於 B 階段。切法如下,避免兩階段互卡:

- **A 做**:記錄進度、重開文章時顯示「上次讀到 62%,跳過去」的提示、`pickResume()` API。
- **B 做**:Dashboard 上的「繼續閱讀」卡片(消費 A 的 `pickResume()`)。

同理,收藏按鈕在 A(文章頁),Dashboard 的收藏區塊在 B。

## File Structure

| 檔案 | 責任 |
| --- | --- |
| `src/lib/reading-progress.ts` | 判定規則純函式 + localStorage 薄殼,**唯一**碰 storage 的地方 |
| `src/lib/reading-progress.test.ts` | 上者的 vitest 測試 |
| `src/components/blog/ReadingProgressBar.tsx` | 頂部進度條,並負責寫入進度 |
| `src/components/blog/ResumePrompt.tsx` | 「上次讀到 X%」提示 |
| `src/components/blog/Toc.tsx` | 側邊目錄 |
| `src/components/blog/FavoriteButton.tsx` | 收藏切換 |
| `src/components/blog/SearchDialog.tsx` | Pagefind 搜尋 modal |
| `src/layouts/PostLayout.astro` | 掛上前四個 island,新增 `slug` / `headings` props |
| `src/layouts/BaseLayout.astro` | 掛搜尋入口與 modal |
| `src/pages/blog/[...slug].astro` | 傳 `slug` 與 `headings` 給 PostLayout |
| `src/styles/global.css` | 新增 `--track` token 與本階段所有元件樣式 |
| `package.json` | 新增 vitest、pagefind、`test` script、改 `build` script |
| `.github/workflows/deploy.yml` | build 指令改為含 pagefind |
| `CLAUDE.md` | 移除「不做全文搜尋」的 YAGNI 條目,補新目錄與指令 |

---

### Task 0: 安裝依賴與測試工具

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: 無
- Produces: 可執行的 `npm test`;`node_modules/` 就位

- [ ] **Step 1: 安裝現有依賴**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm install
```

預期:產生 `node_modules/`,無錯誤。

- [ ] **Step 2: 確認基準線可建置**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

預期:成功,`dist/` 產生。若此步失敗,先修好再往下,不要把既有問題混進本階段的變更。

- [ ] **Step 3: 安裝 vitest**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm install -D vitest
```

- [ ] **Step 4: 建立 vitest 設定**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只測 src/lib/ 的純函式;元件與頁面靠 astro build 與人工檢查把關
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: 加上 test script**

在 `package.json` 的 `scripts` 中新增(保留既有 `dev` / `build` / `preview`):

```json
"test": "vitest run"
```

- [ ] **Step 6: 確認測試指令可執行**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
```

預期:vitest 啟動並回報 `No test files found`,離開碼非致命錯誤即可(此時尚無測試檔)。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: 加入 vitest 供 src/lib 純函式測試

只涵蓋 src/lib/,元件與頁面仍以 astro build 與人工檢查把關。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: 進度判定純函式

**Files:**
- Create: `src/lib/reading-progress.ts`
- Test: `src/lib/reading-progress.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `interface ProgressEntry { pct: number; scrollY: number; at: number }`
  - `type ProgressMap = Record<string, ProgressEntry>`
  - `const FINISHED_PCT = 90`、`const STARTED_PCT = 5`
  - `isFinished(entry: ProgressEntry): boolean`
  - `isReading(entry: ProgressEntry): boolean`
  - `pickResume(map: ProgressMap): { slug: string; entry: ProgressEntry } | null`

- [ ] **Step 1: 寫失敗的測試**

`src/lib/reading-progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isFinished,
  isReading,
  pickResume,
  type ProgressMap,
} from './reading-progress';

const entry = (pct: number, at = 1000) => ({ pct, scrollY: 0, at });

describe('isFinished', () => {
  it('90% 整視為已讀完', () => {
    expect(isFinished(entry(90))).toBe(true);
  });

  it('89.9% 尚未讀完', () => {
    expect(isFinished(entry(89.9))).toBe(false);
  });
});

describe('isReading', () => {
  it('5% 整算閱讀中', () => {
    expect(isReading(entry(5))).toBe(true);
  });

  it('4.9% 不算開始讀', () => {
    expect(isReading(entry(4.9))).toBe(false);
  });

  it('已讀完就不算閱讀中', () => {
    expect(isReading(entry(90))).toBe(false);
  });
});

describe('pickResume', () => {
  it('沒有任何紀錄時回傳 null', () => {
    expect(pickResume({})).toBeNull();
  });

  it('只有讀完的文章時回傳 null', () => {
    const map: ProgressMap = { a: entry(95) };
    expect(pickResume(map)).toBeNull();
  });

  it('只有剛開頭(未達 5%)的文章時回傳 null', () => {
    const map: ProgressMap = { a: entry(2) };
    expect(pickResume(map)).toBeNull();
  });

  it('多筆閱讀中時挑 at 最新的那筆', () => {
    const map: ProgressMap = {
      old: entry(30, 1000),
      newest: entry(60, 3000),
      middle: entry(45, 2000),
    };
    expect(pickResume(map)).toEqual({ slug: 'newest', entry: entry(60, 3000) });
  });

  it('忽略已讀完的文章,即使它最新', () => {
    const map: ProgressMap = {
      reading: entry(30, 1000),
      done: entry(99, 9000),
    };
    expect(pickResume(map)).toEqual({ slug: 'reading', entry: entry(30, 1000) });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
```

預期:FAIL,錯誤訊息為找不到 `./reading-progress` 模組。

- [ ] **Step 3: 寫最小實作**

`src/lib/reading-progress.ts`:

```ts
export interface ProgressEntry {
  /** 0–100 的閱讀百分比 */
  pct: number;
  /** 上次離開時的捲動位置,用來跳回原處 */
  scrollY: number;
  /** 更新時間(epoch ms),決定「繼續閱讀」挑哪一筆 */
  at: number;
}

export type ProgressMap = Record<string, ProgressEntry>;

/** 達到此百分比視為已讀完 */
export const FINISHED_PCT = 90;
/** 達到此百分比才算開始讀 */
export const STARTED_PCT = 5;

export function isFinished(entry: ProgressEntry): boolean {
  return entry.pct >= FINISHED_PCT;
}

export function isReading(entry: ProgressEntry): boolean {
  return entry.pct >= STARTED_PCT && entry.pct < FINISHED_PCT;
}

export function pickResume(
  map: ProgressMap
): { slug: string; entry: ProgressEntry } | null {
  let best: { slug: string; entry: ProgressEntry } | null = null;

  for (const [slug, entry] of Object.entries(map)) {
    if (!isReading(entry)) continue;
    if (best === null || entry.at > best.entry.at) {
      best = { slug, entry };
    }
  }

  return best;
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
```

預期:PASS,10 個測試全綠。

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading-progress.ts src/lib/reading-progress.test.ts
git commit -m "feat: 閱讀進度判定純函式與測試

已讀完 >=90%、閱讀中 5-90%,繼續閱讀挑 at 最新的一筆。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: localStorage 存取層

**Files:**
- Modify: `src/lib/reading-progress.ts`
- Modify: `src/lib/reading-progress.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ProgressEntry` / `ProgressMap`
- Produces:
  - `const PROGRESS_KEY = 'blog:progress:v1'`、`const FAVORITES_KEY = 'blog:favorites:v1'`
  - `type StorageLike = Pick<Storage, 'getItem' | 'setItem'>`
  - `readProgress(store?: StorageLike | null): ProgressMap`
  - `saveProgress(slug: string, entry: ProgressEntry, store?: StorageLike | null): void`
  - `readFavorites(store?: StorageLike | null): string[]`
  - `toggleFavorite(slug: string, store?: StorageLike | null): string[]`
  - `isFavorite(slug: string, store?: StorageLike | null): boolean`

所有函式的 `store` 參數預設取 `localStorage`,取不到(SSR、Safari 隱私模式)時回傳安全值而不拋錯。

- [ ] **Step 1: 寫失敗的測試**

在 `src/lib/reading-progress.test.ts` 檔尾追加:

```ts
import {
  readProgress,
  saveProgress,
  readFavorites,
  toggleFavorite,
  isFavorite,
  PROGRESS_KEY,
  FAVORITES_KEY,
  type StorageLike,
} from './reading-progress';

function fakeStore(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('readProgress', () => {
  it('沒有資料時回傳空物件', () => {
    expect(readProgress(fakeStore())).toEqual({});
  });

  it('資料損毀時回傳空物件而不拋錯', () => {
    const store = fakeStore({ [PROGRESS_KEY]: '{ not json' });
    expect(readProgress(store)).toEqual({});
  });

  it('store 為 null 時回傳空物件', () => {
    expect(readProgress(null)).toEqual({});
  });

  it('讀得回寫進去的內容', () => {
    const store = fakeStore();
    saveProgress('a', { pct: 42, scrollY: 500, at: 123 }, store);
    expect(readProgress(store)).toEqual({ a: { pct: 42, scrollY: 500, at: 123 } });
  });
});

describe('saveProgress', () => {
  it('寫第二篇不會蓋掉第一篇', () => {
    const store = fakeStore();
    saveProgress('a', { pct: 10, scrollY: 1, at: 1 }, store);
    saveProgress('b', { pct: 20, scrollY: 2, at: 2 }, store);
    expect(Object.keys(readProgress(store)).sort()).toEqual(['a', 'b']);
  });

  it('同一篇再寫會覆蓋', () => {
    const store = fakeStore();
    saveProgress('a', { pct: 10, scrollY: 1, at: 1 }, store);
    saveProgress('a', { pct: 80, scrollY: 9, at: 5 }, store);
    expect(readProgress(store).a.pct).toBe(80);
  });

  it('store 為 null 時不拋錯', () => {
    expect(() => saveProgress('a', { pct: 1, scrollY: 0, at: 0 }, null)).not.toThrow();
  });
});

describe('favorites', () => {
  it('預設為空陣列', () => {
    expect(readFavorites(fakeStore())).toEqual([]);
  });

  it('資料損毀時回傳空陣列', () => {
    expect(readFavorites(fakeStore({ [FAVORITES_KEY]: 'nope' }))).toEqual([]);
  });

  it('內容不是陣列時回傳空陣列', () => {
    expect(readFavorites(fakeStore({ [FAVORITES_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it('toggle 一次加入、兩次移除', () => {
    const store = fakeStore();
    expect(toggleFavorite('a', store)).toEqual(['a']);
    expect(toggleFavorite('a', store)).toEqual([]);
  });

  it('isFavorite 反映 toggle 結果', () => {
    const store = fakeStore();
    expect(isFavorite('a', store)).toBe(false);
    toggleFavorite('a', store);
    expect(isFavorite('a', store)).toBe(true);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
```

預期:FAIL,`readProgress` 等 export 不存在。

- [ ] **Step 3: 寫最小實作**

在 `src/lib/reading-progress.ts` 檔尾追加:

```ts
export const PROGRESS_KEY = 'blog:progress:v1';
export const FAVORITES_KEY = 'blog:favorites:v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * 取得預設 storage。SSR 時沒有 localStorage,Safari 隱私模式存取會直接拋錯,
 * 兩種情況都回傳 null,由呼叫端走安全預設值。
 */
function defaultStore(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(store: StorageLike | null, key: string, fallback: T): T {
  if (!store) return fallback;
  const raw = store.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(store: StorageLike | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // 配額滿或隱私模式,靜默放棄:記不住進度不該讓頁面壞掉
  }
}

export function readProgress(store: StorageLike | null = defaultStore()): ProgressMap {
  const parsed = readJson<ProgressMap>(store, PROGRESS_KEY, {});
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

export function saveProgress(
  slug: string,
  entry: ProgressEntry,
  store: StorageLike | null = defaultStore()
): void {
  const map = readProgress(store);
  map[slug] = entry;
  writeJson(store, PROGRESS_KEY, map);
}

export function readFavorites(store: StorageLike | null = defaultStore()): string[] {
  const parsed = readJson<unknown>(store, FAVORITES_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === 'string');
}

export function toggleFavorite(
  slug: string,
  store: StorageLike | null = defaultStore()
): string[] {
  const current = readFavorites(store);
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
  writeJson(store, FAVORITES_KEY, next);
  return next;
}

export function isFavorite(
  slug: string,
  store: StorageLike | null = defaultStore()
): boolean {
  return readFavorites(store).includes(slug);
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
```

預期:PASS,全部測試綠燈。

- [ ] **Step 5: Commit**

```bash
git add src/lib/reading-progress.ts src/lib/reading-progress.test.ts
git commit -m "feat: 閱讀進度與收藏的 localStorage 存取層

storage 可注入以便測試;SSR、隱私模式、資料損毀一律回退安全值不拋錯。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 頂部閱讀進度條

**Files:**
- Create: `src/components/blog/ReadingProgressBar.tsx`
- Modify: `src/styles/global.css`(檔尾追加樣式;`--track` token 加在 `:root` 與 `[data-theme='dark']`)
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Consumes: Task 2 的 `saveProgress`
- Produces:
  - `ReadingProgressBar` 預設匯出,props `{ slug: string }`
  - `PostLayout` 新增必填 prop `slug: string`

- [ ] **Step 1: 新增 `--track` token**

在 `src/styles/global.css` 的 `:root` 區塊末尾(`--danger` 之後)加入:

```css
  --track: #e9ecef;
```

在 `[data-theme='dark']` 區塊末尾(`--danger` 之後)加入:

```css
  --track: #262b33;
```

- [ ] **Step 2: 建立元件**

`src/components/blog/ReadingProgressBar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { saveProgress } from '../../lib/reading-progress';

/** 兩次寫入 localStorage 的最小間隔(ms),避免捲動時狂寫 */
const SAVE_INTERVAL = 1000;

export default function ReadingProgressBar({ slug }: { slug: string }) {
  const [pct, setPct] = useState(0);
  const frame = useRef(0);
  const lastSaved = useRef(0);

  useEffect(() => {
    const compute = (force: boolean) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      // 內容不足一屏時視為已讀完,否則進度永遠停在 0
      const next = max <= 0 ? 100 : Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      setPct(next);

      const now = Date.now();
      if (force || now - lastSaved.current >= SAVE_INTERVAL) {
        lastSaved.current = now;
        saveProgress(slug, { pct: next, scrollY: window.scrollY, at: now });
      }
    };

    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        compute(false);
      });
    };

    // 離開頁面時強制寫一次,確保最後的位置有被記住
    const onLeave = () => compute(true);

    compute(false);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('pagehide', onLeave);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pagehide', onLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [slug]);

  return (
    <div className="reading-bar" role="presentation">
      <div className="reading-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
```

- [ ] **Step 3: 加樣式**

在 `src/styles/global.css` 檔尾追加:

```css
/* ── 閱讀進度條 ───────────────────────────────────────────── */
.reading-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--track);
  z-index: 50;
}
.reading-bar-fill {
  height: 100%;
  background: var(--accent);
}
```

- [ ] **Step 4: PostLayout 接上元件**

`src/layouts/PostLayout.astro` — frontmatter 的 `interface Props` 新增 `slug: string`,解構加入 `slug`,並 import 元件:

```astro
---
import BaseLayout from './BaseLayout.astro';
import ReadingProgressBar from '../components/blog/ReadingProgressBar.tsx';

interface Props {
  title: string;
  description: string;
  pubDate: Date;
  tags: string[];
  slug: string;
}
const { title, description, pubDate, tags, slug } = Astro.props;
const dateStr = pubDate.toISOString().slice(0, 10);
---
```

在 `<BaseLayout ...>` 內、`<article>` 之前插入:

```astro
  <ReadingProgressBar slug={slug} client:load />
```

用 `client:load` 而非 `client:visible`:進度條在畫面最頂端且必須從進站就開始記錄,不能等它進入視窗。

- [ ] **Step 5: 頁面傳入 slug**

`src/pages/blog/[...slug].astro` 的 `<PostLayout>` 改為:

```astro
<PostLayout {...post.data} slug={post.id}>
  <Content />
</PostLayout>
```

- [ ] **Step 6: 建置並人工驗證**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

在瀏覽器開 `/blog/rag-fundamentals`,確認:
1. 捲動時頂部細條跟著長
2. 捲到底時接近 100%
3. DevTools → Application → Local Storage 有 `blog:progress:v1`,內容含該篇 slug
4. 切換深淺主題,進度條底色與填色都跟著變

- [ ] **Step 7: Commit**

```bash
git add src/components/blog/ReadingProgressBar.tsx src/styles/global.css \
        src/layouts/PostLayout.astro "src/pages/blog/[...slug].astro"
git commit -m "feat: 文章頁頂部閱讀進度條

rAF 節流,每秒最多寫一次 localStorage,離開頁面時強制寫入。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 繼續閱讀提示

**Files:**
- Create: `src/components/blog/ResumePrompt.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/layouts/PostLayout.astro`

**Interfaces:**
- Consumes: Task 2 的 `readProgress`、Task 1 的 `isReading`
- Produces: `ResumePrompt` 預設匯出,props `{ slug: string }`

- [ ] **Step 1: 建立元件**

`src/components/blog/ResumePrompt.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { isReading, readProgress } from '../../lib/reading-progress';

export default function ResumePrompt({ slug }: { slug: string }) {
  const [target, setTarget] = useState<{ pct: number; scrollY: number } | null>(null);

  useEffect(() => {
    // 只在掛載當下讀一次:此時 ReadingProgressBar 尚未寫入本次的進度,
    // 讀到的是上次離開時的狀態。
    const entry = readProgress()[slug];
    if (!entry || !isReading(entry) || entry.scrollY <= 0) return;
    // 已經捲到該位置附近就不用提示了(例如瀏覽器自己還原了捲動位置)
    if (Math.abs(window.scrollY - entry.scrollY) < 200) return;
    setTarget({ pct: entry.pct, scrollY: entry.scrollY });
  }, [slug]);

  if (!target) return null;

  return (
    <div className="resume-prompt" role="status">
      <span>上次讀到 {Math.round(target.pct)}%</span>
      <button
        type="button"
        className="resume-go"
        onClick={() => {
          window.scrollTo({ top: target.scrollY, behavior: 'smooth' });
          setTarget(null);
        }}
      >
        跳到上次位置
      </button>
      <button
        type="button"
        className="resume-dismiss"
        aria-label="關閉提示"
        onClick={() => setTarget(null)}
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 加樣式**

在 `src/styles/global.css` 檔尾追加:

```css
/* ── 繼續閱讀提示 ─────────────────────────────────────────── */
.resume-prompt {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 14px;
  margin-bottom: 28px;
  font-size: 14px;
  color: var(--text-muted);
}
.resume-go {
  font: inherit;
  background: none;
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 999px;
  padding: 2px 12px;
  cursor: pointer;
}
.resume-go:hover { background: var(--accent); color: var(--bg); }
.resume-dismiss {
  font: inherit;
  font-size: 18px;
  line-height: 1;
  background: none;
  border: 0;
  color: var(--text-muted);
  cursor: pointer;
  margin-left: auto;
  padding: 0 4px;
}
.resume-go:focus-visible,
.resume-dismiss:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: PostLayout 接上元件**

`src/layouts/PostLayout.astro` 新增 import:

```astro
import ResumePrompt from '../components/blog/ResumePrompt.tsx';
```

在 `<article>` 內、`</header>` 之後、`<slot />` 之前插入:

```astro
    <ResumePrompt slug={slug} client:load />
```

- [ ] **Step 4: 建置並人工驗證**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

驗證流程:
1. 開 `/blog/rag-fundamentals`,捲到文章中段(約 30–50%),離開頁面
2. 重新進入該文章 → 出現「上次讀到 XX%」
3. 按「跳到上次位置」→ 平滑捲到該處,提示消失
4. 按 × → 提示消失
5. 捲到 95% 以上離開再進入 → **不應**出現提示(已讀完)
6. 深淺主題各看一次

- [ ] **Step 5: Commit**

```bash
git add src/components/blog/ResumePrompt.tsx src/styles/global.css src/layouts/PostLayout.astro
git commit -m "feat: 重開文章時顯示繼續閱讀提示

只在上次為閱讀中(5-90%)且捲動位置差距夠大時顯示。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 側邊目錄 TOC

**Files:**
- Create: `src/components/blog/Toc.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Consumes: Astro `render(post)` 回傳的 `headings`
- Produces:
  - `interface TocHeading { depth: number; slug: string; text: string }`
  - `Toc` 預設匯出,props `{ headings: TocHeading[] }`
  - `PostLayout` 新增必填 prop `headings: TocHeading[]`

- [ ] **Step 1: 建立元件**

`src/components/blog/Toc.tsx`:

```tsx
import { useEffect, useState } from 'react';

export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

/** 少於這個數量就不顯示目錄——三兩條目錄比沒有還礙眼 */
const MIN_HEADINGS = 3;

export default function Toc({ headings }: { headings: TocHeading[] }) {
  const items = headings.filter((h) => h.depth === 2 || h.depth === 3);
  const [active, setActive] = useState<string>('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (items.length < MIN_HEADINGS) return;

    const els = items
      .map((h) => document.getElementById(h.slug))
      .filter((el): el is HTMLElement => el !== null);

    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      // 只讓靠近視窗頂端的標題算「當前」,否則整頁的標題都會是 intersecting
      { rootMargin: '0px 0px -75% 0px', threshold: 0 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  if (items.length < MIN_HEADINGS) return null;

  return (
    <nav className="toc" aria-label="目錄">
      <button
        type="button"
        className="toc-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        目錄
      </button>
      <ol className={open ? 'toc-list is-open' : 'toc-list'}>
        {items.map((h) => (
          <li key={h.slug} className={`toc-item toc-d${h.depth}`}>
            <a
              href={`#${h.slug}`}
              className={h.slug === active ? 'toc-link is-active' : 'toc-link'}
              onClick={() => setOpen(false)}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: 加樣式**

在 `src/styles/global.css` 檔尾追加。**寬螢幕固定在右側、窄螢幕收合**,且不得改動 `main` 的 720px:

```css
/* ── 文章目錄 ─────────────────────────────────────────────── */
.toc { margin-bottom: 28px; }

.toc-toggle {
  font: inherit;
  font-size: 13px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.toc-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.toc-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: none;
  flex-direction: column;
  gap: 6px;
  border-left: 1px solid var(--border);
}
.toc-list.is-open { display: flex; }

.toc-item { padding-left: 14px; }
.toc-d3 { padding-left: 30px; }

.toc-link {
  color: var(--text-muted);
  font-size: 13.5px;
  line-height: 1.5;
  text-decoration: none;
}
.toc-link:hover { color: var(--text); text-decoration: none; }
.toc-link.is-active { color: var(--accent); }

/* 視窗夠寬時移到右側固定欄,不擠壓 720px 的閱讀寬度 */
@media (min-width: 1200px) {
  .toc {
    position: fixed;
    top: 96px;
    left: calc(50% + 380px);
    width: 220px;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
    margin-bottom: 0;
  }
  .toc-toggle { display: none; }
  .toc-list { display: flex; margin-top: 0; }
}
```

- [ ] **Step 3: PostLayout 接上元件**

`src/layouts/PostLayout.astro` — import 並擴充 Props:

```astro
import Toc from '../components/blog/Toc.tsx';
import type { TocHeading } from '../components/blog/Toc.tsx';
```

`interface Props` 新增:

```ts
  headings: TocHeading[];
```

解構加入 `headings`。在 `<article>` 內、`</header>` 之後、`<ResumePrompt ... />` 之前插入:

```astro
    <Toc headings={headings} client:load />
```

- [ ] **Step 4: 頁面傳入 headings**

`src/pages/blog/[...slug].astro` 改為:

```astro
const { post } = Astro.props;
const { Content, headings } = await render(post);
---

<PostLayout {...post.data} slug={post.id} headings={headings}>
  <Content />
</PostLayout>
```

- [ ] **Step 5: 建置並人工驗證**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

驗證:
1. 視窗拉寬至 1200px 以上 → 目錄固定在文章右側,不遮住內文
2. 捲動 → 當前段落的項目變成 accent 色
3. 點目錄項目 → 跳到對應段落
4. 視窗縮到 1200px 以下 → 變成「目錄」按鈕,點開才展開,點項目後自動收合
5. 深淺主題各看一次

- [ ] **Step 6: Commit**

```bash
git add src/components/blog/Toc.tsx src/styles/global.css \
        src/layouts/PostLayout.astro "src/pages/blog/[...slug].astro"
git commit -m "feat: 文章側邊目錄

取 Astro render() 的 headings,只收 h2/h3,少於三條不顯示;
寬螢幕固定右側、窄螢幕收合成可展開區塊。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 收藏按鈕

**Files:**
- Create: `src/components/blog/FavoriteButton.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/layouts/PostLayout.astro`

**Interfaces:**
- Consumes: Task 2 的 `isFavorite`、`toggleFavorite`
- Produces: `FavoriteButton` 預設匯出,props `{ slug: string }`

- [ ] **Step 1: 建立元件**

`src/components/blog/FavoriteButton.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { isFavorite, toggleFavorite } from '../../lib/reading-progress';

export default function FavoriteButton({ slug }: { slug: string }) {
  // SSR 時讀不到 localStorage,一律先渲染未收藏狀態,掛載後再校正,
  // 否則 hydration 前後會不一致。
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setFav(isFavorite(slug));
  }, [slug]);

  return (
    <button
      type="button"
      className={fav ? 'fav-btn is-on' : 'fav-btn'}
      aria-pressed={fav}
      onClick={() => {
        toggleFavorite(slug);
        setFav((v) => !v);
      }}
    >
      {fav ? '★ 已收藏' : '☆ 收藏'}
    </button>
  );
}
```

- [ ] **Step 2: 加樣式**

在 `src/styles/global.css` 檔尾追加:

```css
/* ── 收藏按鈕 ─────────────────────────────────────────────── */
.fav-btn {
  font: inherit;
  font-size: 13px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.fav-btn:hover { color: var(--text); }
.fav-btn.is-on { color: var(--accent); border-color: var(--accent); }
.fav-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 3: PostLayout 接上元件**

新增 import:

```astro
import FavoriteButton from '../components/blog/FavoriteButton.tsx';
```

在 `.post-meta` 的 `</div>` 之前(標籤之後)插入:

```astro
        <FavoriteButton slug={slug} client:load />
```

- [ ] **Step 4: 建置並人工驗證**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

驗證:
1. 點「☆ 收藏」→ 變成「★ 已收藏」且轉為 accent 色
2. 重新整理 → 維持已收藏
3. 再點一次 → 取消,重新整理後仍是未收藏
4. DevTools 確認 `blog:favorites:v1` 內容正確
5. 深淺主題各看一次

- [ ] **Step 5: Commit**

```bash
git add src/components/blog/FavoriteButton.tsx src/styles/global.css src/layouts/PostLayout.astro
git commit -m "feat: 文章收藏按鈕

SSR 先渲染未收藏、掛載後校正,避免 hydration 不一致。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Pagefind 索引與部署設定

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 無
- Produces: `dist/pagefind/pagefind.js` 於 build 後存在,供 Task 8 動態載入

- [ ] **Step 1: 安裝 pagefind**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm install -D pagefind
```

- [ ] **Step 2: 改 build script**

`package.json` 的 `scripts.build` 由 `"astro build"` 改為:

```json
"build": "astro build && pagefind --site dist"
```

- [ ] **Step 3: 建置並確認索引產生**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
ls dist/pagefind/
```

預期:`dist/pagefind/` 存在,內含 `pagefind.js` 與 `pagefind-entry.json` 等檔案。
Pagefind 的輸出會印出索引了幾個頁面、幾個字詞,記下這個數字供 Step 6 對照。

- [ ] **Step 4: 忽略 Pagefind 的本機產物**

`dist/` 已在 `.gitignore` 中,`dist/pagefind/` 隨之被忽略,無需額外設定。
確認一次:

```bash
git status --porcelain
```

預期:沒有 `dist/` 相關的未追蹤檔案。若有,才需要處理。

- [ ] **Step 5: 改部署 workflow**

`.github/workflows/deploy.yml` 的 build job 改為明確步驟,不再依賴 `withastro/action` 的預設建置行為
——因為 build 現在包含 `astro build` 之後的 pagefind 步驟,必須確保跑的是 `npm run build`:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

`deploy` job 維持不變。

- [ ] **Step 6: Commit 並驗證線上部署**

```bash
git add package.json package-lock.json .github/workflows/deploy.yml
git commit -m "build: 加入 Pagefind 索引產生並改寫部署 workflow

build 改為 astro build && pagefind --site dist;workflow 改用明確步驟
以確保跑的是 npm run build 而非只有 astro build。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push origin main
```

推送後到 GitHub Actions 看該次 run 的 `npm run build` 步驟輸出,確認有 Pagefind 的索引訊息
且頁面數與 Step 3 一致。部署完成後開 `https://singyichen.github.io/pagefind/pagefind.js`,
應回傳 JS 而非 404。

---

### Task 8: 搜尋 UI

**Files:**
- Create: `src/components/blog/SearchDialog.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Consumes: Task 7 產生的 `/pagefind/pagefind.js`
- Produces: `SearchDialog` 預設匯出,無 props;自行監聽 `⌘K` / `Ctrl+K` / `/`

- [ ] **Step 1: 建立元件**

`src/components/blog/SearchDialog.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

interface Result {
  url: string;
  meta: { title?: string };
  excerpt: string;
}

interface PagefindApi {
  search(term: string): Promise<{ results: { data(): Promise<Result> }[] }>;
}

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const api = useRef<PagefindApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (api.current || unavailable) return;
    try {
      // dev 模式下 /pagefind/ 不存在(索引只在 build 時產生),
      // @vite-ignore 讓 Vite 不要在建置階段嘗試解析這個路徑。
      const mod = (await import(/* @vite-ignore */ '/pagefind/pagefind.js')) as PagefindApi;
      api.current = mod;
    } catch {
      setUnavailable(true);
    }
  }, [unavailable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen(true);
        void load();
      }
      if (e.key === 'Escape') setOpen(false);
    };

    // nav 上的按鈕透過自訂事件開啟,兩個監聽器都必須在 cleanup 移除:
    // 這個 effect 的相依是 load,而 load 會隨 unavailable 改變而重建,
    // 只移除其中一個會在重跑時累積出重複的監聽器。
    const onOpenRequest = () => {
      setOpen(true);
      void load();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('blog:open-search', onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blog:open-search', onOpenRequest);
    };
  }, [load]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !term.trim() || !api.current) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const search = await api.current!.search(term);
      const data = await Promise.all(search.results.slice(0, 8).map((r) => r.data()));
      if (!cancelled) setResults(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [term, open]);

  if (!open) return null;

  return (
    <div className="search-backdrop" onClick={() => setOpen(false)}>
      <div
        className="search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="搜尋文章"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          placeholder="搜尋文章…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />

        {unavailable && (
          <p className="search-hint">
            搜尋索引尚未產生。索引只在建置時建立,請先執行 <code>npm run build</code>,
            或到已部署的線上站台使用搜尋。
          </p>
        )}

        {!unavailable && term.trim() !== '' && results.length === 0 && (
          <p className="search-hint">找不到符合的文章。</p>
        )}

        <ul className="search-results">
          {results.map((r) => (
            <li key={r.url}>
              <a href={r.url}>
                <strong>{r.meta.title ?? r.url}</strong>
                <span dangerouslySetInnerHTML={{ __html: r.excerpt }} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

`dangerouslySetInnerHTML` 在此是必要的:Pagefind 的 `excerpt` 回傳含 `<mark>` 標記的 HTML,
內容來自本站自己建置出的索引,非使用者輸入。

- [ ] **Step 2: 加樣式**

在 `src/styles/global.css` 檔尾追加:

```css
/* ── 搜尋 ─────────────────────────────────────────────────── */
.search-trigger {
  font: inherit;
  font-size: 13px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.search-trigger:hover { color: var(--text); }
.search-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.search-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.4);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 16px 16px;
  z-index: 100;
}
.search-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: min(560px, 100%);
  max-height: 70vh;
  overflow-y: auto;
  padding: 16px;
}
.search-input {
  font: inherit;
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 12px;
  color: var(--text);
}
.search-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.search-hint { font-size: 13px; color: var(--text-muted); margin: 14px 2px 0; }

.search-results { list-style: none; margin: 14px 0 0; padding: 0; }
.search-results li { border-top: 1px solid var(--border); }
.search-results a {
  display: block;
  padding: 11px 2px;
  color: var(--text);
  text-decoration: none;
}
.search-results a:hover { background: var(--bg-card); text-decoration: none; }
.search-results strong { display: block; font-size: 14.5px; margin-bottom: 3px; }
.search-results span { font-size: 12.5px; color: var(--text-muted); line-height: 1.6; }
.search-results mark { background: var(--accent); color: var(--bg); padding: 0 2px; }
```

- [ ] **Step 3: BaseLayout 接上搜尋入口**

`src/layouts/BaseLayout.astro` — frontmatter 新增 import:

```astro
import SearchDialog from '../components/blog/SearchDialog.tsx';
```

nav 中,`<a href="/blog">Blog</a>` 與主題切換鈕之間插入觸發鈕:

```astro
      <button
        class="search-trigger"
        onclick="window.dispatchEvent(new CustomEvent('blog:open-search'))"
      >搜尋 <kbd>⌘K</kbd></button>
```

`<main>` 之後、`<footer>` 之前插入:

```astro
    <SearchDialog client:idle />
```

用 `client:idle`:搜尋不是進站就要用的功能,但也不能等捲到才載入(它在 nav 上)。

- [ ] **Step 4: 建置並人工驗證**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run preview
```

**必須用 `preview` 而非 `dev`**:`dev` 沒有 `dist/pagefind/`,搜尋一定不可用。

驗證:
1. 按 `⌘K` → modal 開啟,輸入框自動聚焦
2. 輸入「RAG」→ 出現結果,關鍵字有 `<mark>` 高亮
3. 點結果 → 跳到該文章
4. `Esc` 關閉;點背景關閉
5. 在輸入框裡按 `/` → 不應觸發第二次開啟(打字時不搶鍵)
6. 深淺主題各看一次

接著驗證 dev 模式的退路:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev
```

按 `⌘K` → 應顯示「搜尋索引尚未產生…」的提示,**不得**出現空白 modal 或 console 未捕捉的錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/components/blog/SearchDialog.tsx src/styles/global.css src/layouts/BaseLayout.astro
git commit -m "feat: Pagefind 全文搜尋 UI

⌘K / Ctrl+K / 單獨按 / 開啟;dev 模式索引不存在時顯示提示而非報錯。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 繁體中文檢索驗證與文件更新

**Files:**
- Create: `src/content/blog/搜尋測試.mdx`(驗證後刪除)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Task 7、Task 8 的成果
- Produces: 對 Pagefind 中文斷詞品質的明確結論;更新後的 CLAUDE.md

Spec 把「Pagefind 對繁體中文的斷詞品質」列為待驗證項,這個 task 就是驗證它。

- [ ] **Step 1: 建立測試文章**

`src/content/blog/搜尋測試.mdx`:

```mdx
---
title: 搜尋測試專用文章
description: 驗證 Pagefind 對繁體中文的斷詞與檢索品質,驗證後刪除。
pubDate: 2026-08-16
tags: [測試]
---

## 向量檢索與重排序

這篇文章用來測試中文全文搜尋。關鍵詞包含:向量資料庫、語意檢索、
重排序模型、切塊策略、嵌入模型維度、混合檢索。

## 一段較長的敘述

當使用者的問題進來之後,系統先做語意檢索取出候選片段,再交給重排序模型
決定最終順序。這一整段的目的是提供足夠長的中文內文,讓斷詞結果可被觀察。
```

- [ ] **Step 2: 建置並實測**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run preview
```

按 `⌘K`,依序搜尋這五個詞並記錄是否命中該文章:

| 查詢 | 期望 |
| --- | --- |
| `向量` | 命中 |
| `重排序` | 命中 |
| `語意檢索` | 命中 |
| `切塊` | 命中 |
| `嵌入模型` | 命中 |

- [ ] **Step 3: 依結果決定去留**

- **五個查詢至少命中四個** → Pagefind 中文可用,繼續 Step 4。
- **命中兩個以下** → 走 spec 定義的退路,改用 `title + description + tags` 的前端過濾。
  **不要**在此擴大範圍去嘗試其他搜尋引擎。具體做法:

  建立 `src/lib/posts.ts`:

  ```ts
  export interface SearchablePost {
    slug: string;
    title: string;
    description: string;
    tags: string[];
  }

  /**
   * Pagefind 的中文斷詞不堪用時的退路:對標題、描述、標籤做不分大小寫的子字串比對。
   * 刻意不做模糊比對——寧可漏,也不要給出看不懂為什麼會命中的結果。
   */
  export function filterPosts(posts: SearchablePost[], term: string): SearchablePost[] {
    const q = term.trim().toLowerCase();
    if (q === '') return [];
    return posts.filter((p) =>
      [p.title, p.description, ...p.tags].some((field) => field.toLowerCase().includes(q))
    );
  }
  ```

  在 `src/pages/blog/index.astro` 之外另建 `src/pages/search-index.json.ts`,
  於 build 時輸出所有非草稿文章的 `SearchablePost[]`:

  ```ts
  import type { APIRoute } from 'astro';
  import { getCollection } from 'astro:content';

  export const GET: APIRoute = async () => {
    const posts = await getCollection('blog', ({ data }) => !data.draft);
    const payload = posts.map((p) => ({
      slug: p.id,
      title: p.data.title,
      description: p.data.description,
      tags: p.data.tags,
    }));
    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  ```

  `SearchDialog` 改為 `fetch('/search-index.json')` 取得清單後用 `filterPosts` 過濾,
  移除 Pagefind 的動態 import 與 `unavailable` 分支;`package.json` 的 build script
  改回 `astro build`,並從 devDependencies 移除 pagefind。

  最後把此決策與實測結果寫回
  `docs/superpowers/specs/2026-08-16-knowledge-base-upgrade-design.md` 的「搜尋」段落。
- **命中三個** → 屬邊界情形,停下來把實測結果回報給使用者決定,不要自行判斷。

- [ ] **Step 4: 刪除測試文章**

```bash
rm "src/content/blog/搜尋測試.mdx"
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

預期:build 通過,該文章不再出現在索引中。

- [ ] **Step 5: 更新 CLAUDE.md**

三處修改:

1. 「明確不做(YAGNI)」那一行目前是:
   `全文搜尋、RSS、sitemap、留言、列表分頁、Tailwind`
   改為(移除全文搜尋):
   `RSS、sitemap、留言、列表分頁、Tailwind`

2. 「常用指令」區塊補上測試指令,並更新 build 的說明:

```markdown
npm run test      # vitest,只涵蓋 src/lib/ 的純函式
npm run build     # astro build + pagefind 索引;通過 = frontmatter、MDX、元件、路由皆合法 —— commit 前必須跑過
```

   同時把「沒有測試指令」那句改為:
   `測試只涵蓋 src/lib/ 的純函式(vitest);元件與頁面仍以 npm run build 加人工檢查把關。`

3. 「架構總覽」補上新目錄:

```markdown
- **新增目錄**:`src/lib/`(純資料函式,零 DOM,`.astro` 與 `.tsx` 共用)、
  `src/components/blog/`(跨文章的站台元件:目錄、進度條、收藏、搜尋)。
  閱讀進度與收藏的 localStorage 存取一律經過 `src/lib/reading-progress.ts`,
  元件不直接碰 localStorage。
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新 CLAUDE.md 反映 Phase A 的變更

移除全文搜尋的 YAGNI 條目、補測試指令與 src/lib、src/components/blog 的說明。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: 全階段驗收**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

兩者皆須通過。接著 `npm run preview` 開站,對照 spec 的驗收清單逐項確認:

- [ ] 進度條隨捲動變化,localStorage 有紀錄
- [ ] 重開文章出現繼續閱讀提示;讀完的不出現
- [ ] TOC 寬螢幕固定右側、窄螢幕收合、當前段落高亮
- [ ] 收藏可切換且重整後保留
- [ ] 搜尋在 preview 下可用、在 dev 下顯示提示
- [ ] 以上全部在深、淺兩主題各檢查一次
- [ ] 清空 localStorage 後重整,頁面不報錯

---

## 本階段不做(留給 B / C)

- Dashboard、系列頁、標籤總覽、`BaseLayout` 的寬版 → Phase B
- Dashboard 上的「繼續閱讀」卡片與收藏區塊 → Phase B(消費本階段的 `pickResume()` 與 `readFavorites()`)
- 元件放大檢視、PNG 匯出、`@ai-visualize`、import 白名單 → Phase C
- `series` / `seriesOrder` / `updatedAt` 三個 frontmatter 欄位 → Phase B(本階段不動 schema)
