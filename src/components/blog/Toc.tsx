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
        // 一次回呼可能同時有多個標題落在觸發帶內(例如 ## 後面緊接 ###),
        // 而 entries 的順序由實作決定、不保證是文件順序。取最靠近視窗頂端
        // 的那一個,才是讀者實際所在的段落。
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
        );
        setActive(topmost.target.id);
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
