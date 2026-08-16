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
