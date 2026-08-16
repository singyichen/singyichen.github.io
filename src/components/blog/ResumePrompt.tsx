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
