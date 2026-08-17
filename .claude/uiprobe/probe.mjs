#!/usr/bin/env node
/*
 * uiprobe — 用 Playwright 量測「頁面實際跑起來是什麼行為」。
 *
 * 存在的理由:這個專案的閱讀層(目錄高亮、進度條、錨點捲動、圖表互動)全都是
 * 只有在真的瀏覽器裡捲動才會顯形的行為。看程式碼推論不出來,build 通過也證明
 * 不了。所有指令一律輸出「量到的數字」而不是「看起來沒問題」。
 *
 * 用法:node probe.mjs <command> --url <URL> [選項]
 * 跑 `node probe.mjs help` 看完整說明。
 */

import { chromium } from 'playwright';

/* ---------- 參數 ---------- */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

const num = (v, dflt) => (v === undefined ? dflt : Number(v));

/* ---------- 瀏覽器 ---------- */

async function open(args) {
  if (!args.url) fail('缺少 --url');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    fail(
      `無法啟動 Chromium:${err.message}\n` +
        '若是瀏覽器沒裝,在 .claude/uiprobe/ 執行:npm install && npx playwright install chromium'
    );
  }
  const page = await browser.newPage({
    viewport: { width: num(args.vw, 1440), height: num(args.vh, 900) },
  });

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isDevNoise(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (!isDevNoise(e.message)) consoleErrors.push(`pageerror: ${e.message}`);
  });
  page.on('requestfailed', (r) => {
    if (!isDevNoise(r.url())) failedRequests.push(`${r.url()} — ${r.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !isDevNoise(r.url())) failedRequests.push(`${r.url()} — HTTP ${r.status()}`);
  });

  try {
    await page.goto(args.url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (err) {
    await browser.close();
    fail(`開不了 ${args.url}:${err.message}\n本機網址請先確認 dev / preview server 有在跑。`);
  }

  if (args.theme === 'dark' || args.theme === 'light') {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      window.dispatchEvent(new CustomEvent('themechange'));
    }, args.theme);
  }

  // networkidle 之後仍要等:client:visible 的 island 與 mermaid / markmap 是動態
  // import 進來的,DOM 要再過一段時間才長成最終樣子。
  await page.waitForTimeout(num(args.wait, 2500));

  return { browser, page, consoleErrors, failedRequests };
}

/* Vite / Astro dev server 自己的雜訊(dev toolbar、HMR、相依重新打包),不是站台
   的問題,量到就當沒看到,免得每次 health 都紅一片而讓人習慣忽略真的錯誤。 */
const DEV_NOISE = [
  'dev-toolbar',
  '@vite/client',
  '__vite_ping',
  'Outdated Optimize Dep',
  'Re-optimizing dependencies',
];
function isDevNoise(text) {
  return DEV_NOISE.some((n) => String(text).includes(n));
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/* 把「哪一項是 active」的判斷送進頁面。三種偵測方式,因為不同站台標記法不同,
   而且不能用 borderColor 這種在沒設定時會回傳 currentColor 的屬性去猜。 */
function activeProbe(args) {
  if (args['active-weight']) return { mode: 'weight', value: Number(args['active-weight']) };
  if (args['active-attr']) return { mode: 'attr', value: String(args['active-attr']) };
  return { mode: 'class', value: String(args['active-class'] ?? 'is-active') };
}

/* ---------- 共用輸出 ---------- */

function head(title) {
  console.log(`\n=== ${title} ===`);
}

function verdict(ok, msg) {
  console.log(`\n${ok ? '✓ PASS' : '✗ FAIL'} — ${msg}`);
  if (!ok) process.exitCode = 2;
}

function reportNoise(consoleErrors, failedRequests) {
  if (consoleErrors.length) {
    console.log(`\nconsole 錯誤 ${consoleErrors.length} 筆:`);
    consoleErrors.slice(0, 10).forEach((e) => console.log('  ·', e));
  }
  if (failedRequests.length) {
    console.log(`\n失敗請求 ${failedRequests.length} 筆:`);
    failedRequests.slice(0, 10).forEach((e) => console.log('  ·', e));
  }
}

/* ---------- scrollspy:目錄高亮跟著捲動推進 ---------- */

async function cmdScrollspy(args) {
  const { browser, page, consoleErrors, failedRequests } = await open(args);
  const sel = String(args.items ?? '.toc-link');
  const probe = activeProbe(args);

  const data = await page.evaluate(
    async ({ sel, probe, steps }) => {
      const sc = document.scrollingElement || document.documentElement;
      const links = Array.from(document.querySelectorAll(sel));
      if (!links.length) return { error: `選擇器 ${sel} 找不到任何元素` };

      const activeIndex = () => {
        for (let i = 0; i < links.length; i++) {
          const a = links[i];
          if (probe.mode === 'class' && a.classList.contains(probe.value)) return i;
          if (probe.mode === 'attr' && a.hasAttribute(probe.value)) return i;
          if (probe.mode === 'weight') {
            const w = parseInt(getComputedStyle(a).fontWeight, 10);
            if (w >= probe.value) return i;
          }
        }
        return -1;
      };

      const samples = [];
      let running = true;
      (function tick() {
        samples.push({ y: Math.round(sc.scrollTop), a: activeIndex() });
        if (running) requestAnimationFrame(tick);
      })();

      // 用程式捲而不是 mouse.wheel:這裡量的是「高亮邏輯」,不是滾輪是否被攔截
      // (那是 wheel 指令的事)。均勻掃過整份文件,每一格都停一幀讓監聽器跑完。
      //
      // 一定要 behavior:'instant':全站 html 設了 scroll-behavior: smooth,直接寫
      // scrollTop 會變成動畫,取樣到的是動畫中途的位置,量出來永遠到不了文件末尾
      // ——會誤判成「目錄推不到最後一項」。
      const max = sc.scrollHeight - sc.clientHeight;
      for (let i = 0; i <= steps; i++) {
        sc.scrollTo({ top: (max * i) / steps, behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => setTimeout(r, 400));
      running = false;

      return { samples, count: links.length, max: Math.round(max), finalActive: activeIndex() };
    },
    { sel, probe, steps: num(args.steps, 300) }
  );

  head('目錄高亮 scroll-spy');
  if (data.error) {
    console.log(data.error);
    await browser.close();
    return verdict(false, '量不到,先確認 --items 選擇器');
  }

  const s = data.samples;
  const changes = [];
  for (let i = 1; i < s.length; i++) {
    if (s[i].a !== s[i - 1].a) changes.push({ from: s[i - 1].a, to: s[i].a, y: s[i].y });
  }
  const reached = new Set(s.map((x) => x.a).filter((x) => x >= 0));
  const dead = s.filter((x) => x.a < 0).length;
  const deadPct = (dead / s.length) * 100;
  const skips = changes.filter((c) => c.from >= 0 && c.to > c.from + 1);
  const lastIdx = data.count - 1;

  console.log('目錄項目數        ', data.count);
  console.log('可捲動距離        ', data.max, 'px');
  console.log('取樣幀數          ', s.length);
  console.log('沒有任何 active   ', dead, `幀 (${deadPct.toFixed(0)}%)`);
  console.log('曾經高亮過的項目  ', reached.size, '/', data.count, `[${[...reached].sort((a, b) => a - b).join(',')}]`);
  console.log('推進軌跡          ', changes.map((c) => `${c.from}→${c.to}`).join(' ') || '(從未變更)');
  console.log('一次跳過一項以上  ', skips.length, skips.length ? skips.map((c) => `${c.from}→${c.to}@${c.y}px`).join(' ') : '');
  console.log('捲到底時的 active ', data.finalActive, `(應為 ${lastIdx})`);

  reportNoise(consoleErrors, failedRequests);
  await browser.close();

  const problems = [];
  if (data.finalActive !== lastIdx) problems.push(`捲到底停在第 ${data.finalActive} 項而非最後一項`);
  if (reached.size < data.count) problems.push(`有 ${data.count - reached.size} 項從頭到尾沒被高亮過`);
  if (deadPct > 2) problems.push(`${deadPct.toFixed(0)}% 的幀完全沒有高亮`);
  if (skips.length) problems.push(`${skips.length} 次一口氣跳過中間項目`);
  verdict(problems.length === 0, problems.length ? problems.join(';') : '每一項都依序輪到,捲到底停在最後一項');
}

/* ---------- anchor:點錨點是滑動還是瞬移 ---------- */

async function cmdAnchor(args) {
  const { browser, page, consoleErrors, failedRequests } = await open(args);
  const sel = String(args.link ?? '.toc-link');
  const index = args.index === undefined ? -1 : Number(args.index);

  const data = await page.evaluate(
    async ({ sel, index }) => {
      const links = Array.from(document.querySelectorAll(sel));
      if (!links.length) return { error: `選擇器 ${sel} 找不到任何元素` };
      const target = index < 0 ? links[links.length + index] : links[index];
      if (!target) return { error: `索引 ${index} 超出範圍(共 ${links.length} 項)` };

      const sc = document.scrollingElement || document.documentElement;
      const samples = [];
      let running = true;
      (function tick() {
        samples.push(Math.round(sc.scrollTop));
        if (running) requestAnimationFrame(tick);
      })();

      const before = sc.scrollTop;
      target.click();
      await new Promise((r) => setTimeout(r, 1800));
      running = false;

      const href = target.getAttribute('href') || '';
      const id = decodeURIComponent(href.replace(/^.*#/, ''));
      const el = id ? document.getElementById(id) : null;

      return {
        before: Math.round(before),
        after: Math.round(sc.scrollTop),
        samples,
        label: (target.textContent || '').trim().slice(0, 40),
        headingTop: el ? Math.round(el.getBoundingClientRect().top) : null,
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        scrollPaddingTop: getComputedStyle(document.documentElement).scrollPaddingTop,
      };
    },
    { sel, index }
  );

  head('錨點捲動');
  if (data.error) {
    console.log(data.error);
    await browser.close();
    return verdict(false, '量不到,先確認 --link 選擇器');
  }

  const s = data.samples;
  const distinct = new Set(s).size;
  let maxStep = 0;
  for (let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i] - s[i - 1]));
  const moved = Math.abs(data.after - data.before);

  console.log('點擊項目          ', data.label);
  console.log('捲動位置          ', data.before, '→', data.after, `(移動 ${moved}px)`);
  console.log('取樣幀數          ', s.length);
  console.log('相異捲動位置      ', distinct, distinct > 10 ? '← 逐幀補間(滑動)' : '← 一步到位(瞬移)');
  console.log('單幀最大位移      ', maxStep, 'px');
  console.log('標題落點距頂端    ', data.headingTop, 'px');
  console.log('scroll-behavior   ', data.scrollBehavior);
  console.log('scroll-padding-top', data.scrollPaddingTop);

  reportNoise(consoleErrors, failedRequests);
  await browser.close();

  const problems = [];
  if (moved < 10) problems.push('幾乎沒有捲動,可能點到的位置本來就在附近,換 --index 再試');
  else if (distinct <= 10) problems.push(`只有 ${distinct} 個相異位置,是瞬移不是滑動`);
  if (data.headingTop !== null && data.headingTop < 4)
    problems.push(`標題貼齊視窗最頂端(${data.headingTop}px),應留 scroll-padding-top 的間距`);
  verdict(problems.length === 0, problems.length ? problems.join(';') : `${distinct} 個補間位置,落點 ${data.headingTop}px`);
}

/* ---------- wheel:滾輪滑過元件時頁面還捲不捲得動 ---------- */

async function cmdWheel(args) {
  const { browser, page, consoleErrors, failedRequests } = await open(args);
  const sel = String(args.over ?? '.diagram, .flow-demo, .recharts-wrapper');
  const delta = num(args.delta, 400);
  const ticks = num(args.ticks, 5);

  const targets = await page.evaluate((sel) => {
    return Array.from(document.querySelectorAll(sel))
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          i,
          tag: el.className || el.tagName,
          h: Math.round(r.height),
          top: Math.round(r.top + window.scrollY),
        };
      })
      .filter((t) => t.h > 60);
  }, sel);

  head('滾輪穿透(元件會不會吃掉頁面捲動)');
  if (!targets.length) {
    console.log(`選擇器 ${sel} 找不到夠大的元件`);
    await browser.close();
    return verdict(true, '頁面上沒有這類元件,無需檢查');
  }

  const rows = [];
  for (const t of targets) {
    // 把元件捲到視窗中央,游標放正中心,再送 wheel。若元件監聽了 wheel 並
    // preventDefault,頁面捲動量會明顯小於預期。
    await page.evaluate(
      (top) => window.scrollTo({ top: top - window.innerHeight / 2, behavior: 'instant' }),
      t.top
    );
    await page.waitForTimeout(250);
    const box = await page.evaluate(
      ({ sel, i }) => {
        const el = document.querySelectorAll(sel)[i];
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
      { sel, i: t.i }
    );
    // 預期捲動量要以「這個方向還剩多少可捲」為上限。文件末尾的元件下方常常剩不到
    // 一次滾輪的距離,拿固定值當分母會把 100% 讓路的元件誤判成攔截滾輪。剩餘空間
    // 不足就改往上捲。
    const room = await page.evaluate(() => {
      const sc = document.scrollingElement;
      return { down: sc.scrollHeight - sc.clientHeight - sc.scrollTop, up: sc.scrollTop };
    });
    const requested = delta * ticks;
    const dir = room.down >= Math.min(requested, room.up) ? 1 : -1;
    const expected = Math.round(Math.min(requested, dir > 0 ? room.down : room.up));

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(box.x, box.y);
    for (let k = 0; k < ticks; k++) {
      await page.mouse.wheel(0, delta * dir);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.scrollY);
    const actual = Math.abs(after - before);
    rows.push({
      ...t,
      actual,
      expected,
      dir,
      pct: expected < 50 ? null : Math.round((actual / expected) * 100),
    });
  }

  console.log('每個元件送出    ', `${ticks} × ${delta}px = ${delta * ticks}px(預期值以剩餘可捲距離為上限)`);
  for (const r of rows) {
    const arrow = r.dir > 0 ? '↓' : '↑';
    const pct = r.pct === null ? '可捲空間不足,略過' : `${r.pct}%`;
    console.log(
      `  · ${String(r.tag).slice(0, 38).padEnd(40)} ${arrow} 實際 ${String(r.actual).padStart(5)}px / 預期 ${String(r.expected).padStart(5)}px  (${pct})` +
        (r.pct !== null && r.pct < 60 ? '  ← 被吃掉' : '')
    );
  }

  reportNoise(consoleErrors, failedRequests);
  await browser.close();

  const eaten = rows.filter((r) => r.pct !== null && r.pct < 60);
  verdict(
    eaten.length === 0,
    eaten.length
      ? `${eaten.length} 個元件攔截滾輪,游標掃過時頁面會停住(應改成只在按住 ⌘/Ctrl 時才縮放)`
      : '所有元件都讓滾輪穿透,頁面照常捲動'
  );
}

/* ---------- track:捲動連動元素每幀動得順不順 ---------- */

async function cmdTrack(args) {
  const { browser, page, consoleErrors, failedRequests } = await open(args);
  const sel = String(args.el ?? '.reading-bar-fill');
  const prop = String(args.prop ?? 'transform');

  const data = await page.evaluate(
    async ({ sel, prop, steps }) => {
      const el = document.querySelector(sel);
      if (!el) return { error: `選擇器 ${sel} 找不到元素` };
      const sc = document.scrollingElement || document.documentElement;

      const readValue = () => {
        const cs = getComputedStyle(el);
        if (prop === 'transform') {
          const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
          return m.a; // scaleX
        }
        return parseFloat(cs[prop]) || 0;
      };

      const samples = [];
      let running = true;
      (function tick() {
        samples.push({ y: Math.round(sc.scrollTop), v: readValue() });
        if (running) requestAnimationFrame(tick);
      })();

      // behavior:'instant' 的理由同 scrollspy:全站有 scroll-behavior: smooth。
      const max = sc.scrollHeight - sc.clientHeight;
      for (let i = 0; i <= steps; i++) {
        sc.scrollTo({ top: (max * i) / steps, behavior: 'instant' });
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => setTimeout(r, 300));
      running = false;

      return { samples, willChange: getComputedStyle(el).willChange, usedProp: prop };
    },
    { sel, prop, steps: num(args.steps, 300) }
  );

  head(`捲動連動元素 ${sel} 的 ${prop}`);
  if (data.error) {
    console.log(data.error);
    await browser.close();
    return verdict(false, '量不到,先確認 --el 選擇器');
  }

  const s = data.samples;
  const vals = s.map((x) => x.v);
  const distinct = new Set(vals.map((v) => v.toFixed(4))).size;
  const range = Math.max(...vals) - Math.min(...vals);
  let stuck = 0;
  let maxStuck = 0;
  for (let i = 1; i < s.length; i++) {
    if (s[i].y !== s[i - 1].y && Math.abs(s[i].v - s[i - 1].v) < 1e-6) {
      stuck++;
      maxStuck = Math.max(maxStuck, stuck);
    } else stuck = 0;
  }

  console.log('取樣幀數        ', s.length);
  console.log('值的範圍        ', vals[0].toFixed(3), '→', vals[vals.length - 1].toFixed(3), `(跨度 ${range.toFixed(3)})`);
  console.log('相異值          ', distinct, distinct > 20 ? '← 連續變化' : '← 階梯狀');
  console.log('捲動了但值不動  ', `連續最長 ${maxStuck} 幀`);
  console.log('will-change     ', data.willChange);

  reportNoise(consoleErrors, failedRequests);
  await browser.close();

  const problems = [];
  if (range < 0.05) problems.push('整趟捲動下來幾乎沒變化,可能沒接上捲動事件');
  else if (distinct <= 20) problems.push(`只有 ${distinct} 個相異值,看起來會是一格一格跳`);
  if (maxStuck > 8) problems.push(`有連續 ${maxStuck} 幀捲動了但值沒動,掉幀`);
  verdict(problems.length === 0, problems.length ? problems.join(';') : `${distinct} 個相異值,連續平滑`);
}

/* ---------- health:console 錯誤、失敗請求、島是否 hydrate ---------- */

async function cmdHealth(args) {
  const { browser, page, consoleErrors, failedRequests } = await open(args);

  const info = await page.evaluate(() => ({
    title: document.title,
    theme: document.documentElement.dataset.theme || '(未設定)',
    islands: document.querySelectorAll('astro-island').length,
    hydrated: Array.from(document.querySelectorAll('astro-island')).filter(
      (el) => el.getAttribute('ssr') === null
    ).length,
    diagrams: document.querySelectorAll('.diagram').length,
    diagramErrors: document.querySelectorAll('.diagram-error').length,
    unrenderedFence: document.querySelectorAll(
      'pre > code.language-mermaid, pre > code.language-markmap'
    ).length,
    bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));

  head('頁面健康度');
  console.log('標題            ', info.title);
  console.log('主題            ', info.theme);
  console.log('astro-island    ', info.islands, `(已 hydrate ${info.hydrated})`);
  console.log('圖表區塊        ', info.diagrams, `(渲染失敗 ${info.diagramErrors},未被接手 ${info.unrenderedFence})`);
  console.log('橫向溢出        ', info.bodyScrollX ? '有 ← 版面破了' : '無');

  reportNoise(consoleErrors, failedRequests);
  await browser.close();

  const problems = [];
  if (consoleErrors.length) problems.push(`${consoleErrors.length} 筆 console 錯誤`);
  if (failedRequests.length) problems.push(`${failedRequests.length} 筆失敗請求`);
  if (info.diagramErrors) problems.push(`${info.diagramErrors} 個圖表渲染失敗`);
  if (info.unrenderedFence) problems.push(`${info.unrenderedFence} 個圖表 code fence 沒被 initDiagrams 接手`);
  if (info.bodyScrollX) problems.push('頁面橫向溢出');
  verdict(problems.length === 0, problems.length ? problems.join(';') : '無錯誤、無失敗請求、圖表都渲染成功');
}

/* ---------- shot:兩個主題各截一張,交給人眼或 Read 工具看 ---------- */

async function cmdShot(args) {
  const out = String(args.out ?? 'shot.png');
  const { browser, page } = await open(args);
  if (args.scroll) {
    await page.evaluate((y) => window.scrollTo(0, Number(y)), args.scroll);
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: out, fullPage: args.full === true || args.full === 'true' });
  head('截圖');
  console.log('主題            ', args.theme ?? '(沿用預設)');
  console.log('輸出            ', out);
  await browser.close();
  verdict(true, `已存到 ${out},用 Read 工具開起來看`);
}

/* ---------- help ---------- */

function cmdHelp() {
  console.log(`
uiprobe — 量測頁面實際行為,不做程式碼推論

  node probe.mjs <command> --url <URL> [選項]

共用選項
  --url <URL>         必填。本機通常是 http://localhost:4321/blog/<slug>/
  --vw / --vh <px>    視窗大小,預設 1440 × 900
  --wait <ms>         networkidle 之後再等多久讓 island / 圖表長好,預設 2500
  --theme light|dark  載入後切主題並派送 themechange

command
  scrollspy   目錄高亮有沒有跟著捲動一路推進到最後一項
              --items <sel>          目錄連結選擇器,預設 .toc-link
              --active-class <cls>   高亮判斷:class,預設 is-active
              --active-attr <attr>   高亮判斷:屬性(例如 aria-current)
              --active-weight <n>    高亮判斷:computed fontWeight >= n(量別人的站用)
              --steps <n>            掃過整份文件的取樣格數,預設 300

  anchor      點目錄連結是滑動還是瞬移、落點對不對
              --link <sel>           預設 .toc-link
              --index <n>            第幾項,負數從後數,預設 -1(最後一項)

  wheel       滾輪滑過互動元件時頁面還捲不捲得動
              --over <sel>           預設 .diagram, .flow-demo, .recharts-wrapper
              --delta <px> --ticks <n>  每次滾輪量與次數,預設 400 × 5

  track       捲動連動元素(進度條)每幀動得順不順
              --el <sel>             預設 .reading-bar-fill
              --prop transform|width 預設 transform(讀 scaleX)

  health      console 錯誤、失敗請求、island hydrate、圖表渲染、橫向溢出

  shot        截圖給人眼看
              --out <path> --scroll <px> --full

離開碼:0 = 通過,2 = 量到問題,1 = 量不成(選擇器錯、開不了頁)
`);
}

/* ---------- 入口 ---------- */

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0] ?? 'help';
const table = {
  scrollspy: cmdScrollspy,
  anchor: cmdAnchor,
  wheel: cmdWheel,
  track: cmdTrack,
  health: cmdHealth,
  shot: cmdShot,
  help: cmdHelp,
};
if (!table[cmd]) fail(`未知指令 ${cmd},跑 \`node probe.mjs help\` 看清單`);
await table[cmd](args);
