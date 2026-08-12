import { useEffect, useState } from 'react';

function read(names: string[]): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    names.map((n) => [n, style.getPropertyValue(`--${n}`).trim()])
  );
}

export function useThemeTokens(names: string[]): Record<string, string> {
  const [tokens, setTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    const update = () => setTokens(read(names));
    update();
    window.addEventListener('themechange', update);
    return () => window.removeEventListener('themechange', update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return tokens;
}
