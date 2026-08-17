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

  // 此函式接收來自 localStorage 解析的資料,無型別保證。
  // 即使 pct 或 at 符合 isReading() 邏輯,仍需驗證它們是有效的數值,
  // 否則 NaN 會導致 tie-break 比較永久失效、無法再被新的有效資料取代。
  for (const [slug, entry] of Object.entries(map)) {
    if (!isReading(entry)) continue;
    if (!Number.isFinite(entry.pct) || !Number.isFinite(entry.at)) continue;
    if (best === null || entry.at > best.entry.at) {
      best = { slug, entry };
    }
  }

  return best;
}

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

/**
 * 模組載入後第一次呼叫時把進度表快照起來,之後一律回傳同一份。
 *
 * 為什麼需要:進度條與繼續閱讀提示是兩個各自獨立的 client:load island,
 * 誰先掛載沒有保證。提示必須看到「這次造訪之前」的進度;若它直接讀
 * localStorage,可能讀到進度條剛寫入的本次資料。快照讓讀取結果與掛載
 * 順序完全無關。
 */
let initialProgress: ProgressMap | null = null;

export function readInitialProgress(
  store: StorageLike | null = defaultStore()
): ProgressMap {
  if (initialProgress === null) {
    initialProgress = readProgress(store);
  }
  return initialProgress;
}

/** 僅供測試:清除快照,讓下一次 readInitialProgress 重新讀取。 */
export function resetInitialProgress(): void {
  initialProgress = null;
}
