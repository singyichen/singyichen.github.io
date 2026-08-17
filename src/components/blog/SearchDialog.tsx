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
      const pagefindPath = '/pagefind/pagefind.js';
      const mod = await import(/* @vite-ignore */ pagefindPath);
      api.current = mod as PagefindApi;
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
