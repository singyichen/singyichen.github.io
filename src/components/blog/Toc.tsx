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

    // 不用 IntersectionObserver:把觀察區縮到視窗頂端一小條時,文件末尾的標題
    // 永遠進不了那條區帶(頁面已經捲到底,它們還在下方),最後幾項就再也不會
    // 高亮。實測整篇捲到底,7 項只推進到第 5 項就停住。
    //
    // 改成每幀直接算「最後一個已經捲過頂端門檻的標題」。這個判斷永遠有答案,
    // 能一路推到最後一項,也不受標題密集或捲動速度影響。
    const ACTIVE_LINE = 140;

    let frame = 0;
    const compute = () => {
      const doc = document.documentElement;
      const remaining = doc.scrollHeight - window.innerHeight - window.scrollY;

      // 文章末尾的標題後面通常沒有整整一個視窗的內容,固定的門檻線它們永遠跨不過,
      // 最後幾項就再也輪不到高亮。剩餘捲動不足一屏時,把判定線從 ACTIVE_LINE 平滑
      // 掃到視窗底部,擠在最後一屏的標題便能依序輪到,捲到底時最後一項必定成立。
      const vh = window.innerHeight;
      const line =
        remaining < vh
          ? ACTIVE_LINE + (vh - ACTIVE_LINE) * (1 - Math.max(0, remaining) / vh)
          : ACTIVE_LINE;

      let current = els[0];
      for (const el of els) {
        if (el.getBoundingClientRect().top < line) current = el;
      }
      setActive(current.id);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        compute();
      });
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
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
