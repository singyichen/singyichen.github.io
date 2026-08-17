import { useEffect, useRef, useState } from 'react';
import { saveProgress } from '../../lib/reading-progress';

/** 兩次寫入 localStorage 的最小間隔(ms),避免捲動時狂寫 */
const SAVE_INTERVAL = 1000;

export default function ReadingProgressBar({ slug }: { slug: string }) {
  const [pct, setPct] = useState(0);
  const frame = useRef(0);
  const lastSaved = useRef(0);
  const hasScrolled = useRef(false);

  useEffect(() => {
    const compute = (force: boolean) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      // 內容不足一屏時視為已讀完,否則進度永遠停在 0
      const next = max <= 0 ? 100 : Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      setPct(next);

      // 使用者還沒真的捲動過就不寫入:一開啟文章就寫會用 0% 覆蓋掉上次的
      // 進度,把「讀到一半」的紀錄清掉,繼續閱讀提示也就永遠不會出現。
      if (!hasScrolled.current) return;

      const now = Date.now();
      if (force || now - lastSaved.current >= SAVE_INTERVAL) {
        lastSaved.current = now;
        saveProgress(slug, { pct: next, scrollY: window.scrollY, at: now });
      }
    };

    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        compute(false);
      });
    };

    const onScroll = () => {
      hasScrolled.current = true;
      schedule();
    };

    // 離開頁面時強制寫一次,確保最後的位置有被記住
    const onLeave = () => compute(true);

    compute(false);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pagehide', onLeave);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pagehide', onLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [slug]);

  return (
    <div className="reading-bar" role="presentation">
      {/*
        用 transform: scaleX 而不是 width:改 width 每一幀都會觸發 layout + paint,
        文章頁還掛著 mermaid / xyflow / recharts 等重元件,容易掉幀而看起來一頓一頓。
        transform 由合成層處理,不動 layout。
      */}
      <div className="reading-bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}
