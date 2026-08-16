import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只測 src/lib/ 的純函式;元件與頁面靠 astro build 與人工檢查把關
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
