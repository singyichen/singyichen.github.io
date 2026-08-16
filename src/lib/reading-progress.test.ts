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
