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
