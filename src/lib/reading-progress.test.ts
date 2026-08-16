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

  it('跳過 at 是 NaN 的條目,選有效的舊條目', () => {
    const map: ProgressMap = {
      corrupted: { pct: 50, scrollY: 0, at: NaN },
      valid: entry(40, 1000),
    };
    expect(pickResume(map)).toEqual({ slug: 'valid', entry: entry(40, 1000) });
  });

  it('跳過 pct 非有限數值的條目', () => {
    const map: ProgressMap = {
      corrupted: { pct: NaN, scrollY: 0, at: 1000 },
      valid: entry(50, 2000),
    };
    expect(pickResume(map)).toEqual({ slug: 'valid', entry: entry(50, 2000) });
  });
});

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
