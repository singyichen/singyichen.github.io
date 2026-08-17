import { useEffect, useState } from 'react';
import { isFavorite, toggleFavorite } from '../../lib/reading-progress';

export default function FavoriteButton({ slug }: { slug: string }) {
  // SSR 時讀不到 localStorage,一律先渲染未收藏狀態,掛載後再校正,
  // 否則 hydration 前後會不一致。
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setFav(isFavorite(slug));
  }, [slug]);

  return (
    <button
      type="button"
      className={fav ? 'fav-btn is-on' : 'fav-btn'}
      aria-pressed={fav}
      onClick={() => {
        setFav(toggleFavorite(slug).includes(slug));
      }}
    >
      {fav ? '★ 已收藏' : '☆ 收藏'}
    </button>
  );
}
