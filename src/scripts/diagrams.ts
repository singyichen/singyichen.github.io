type DiagramType = 'mermaid' | 'markmap';

interface Block {
  container: HTMLElement;
  source: string;
  type: DiagramType;
}

const blocks: Block[] = [];
let mermaidSeq = 0;

export function initDiagrams(): void {
  document.querySelectorAll('pre > code').forEach((code) => {
    const cls = Array.from(code.classList).find(
      (c) => c === 'language-mermaid' || c === 'language-markmap'
    );
    if (!cls) return;
    const type = cls.slice('language-'.length) as DiagramType;
    const container = document.createElement('div');
    container.className = `diagram diagram-${type}`;
    code.parentElement!.replaceWith(container);
    blocks.push({ container, source: code.textContent ?? '', type });
  });
  if (blocks.length === 0) return;
  void renderAll();
  // Markmap's link colors come from a theme-independent d3 ordinal scale and
  // its labels are foreignObject HTML that inherit `color` from the page, so
  // it never needs to be re-rendered on theme change. Re-rendering it here
  // would replace the SVG out from under the live Markmap instance (which is
  // never destroyed), leaving its d3-zoom/d3-transition callbacks to fire
  // against a detached node and throw — and it'd also discard the reader's
  // collapse/pan state. Only mermaid depends on the theme, so only it
  // re-renders.
  window.addEventListener('themechange', () => void renderMermaidOnly());
}

async function renderAll(): Promise<void> {
  const dark = document.documentElement.dataset.theme === 'dark';
  if (blocks.some((b) => b.type === 'mermaid')) await renderMermaid(dark);
  if (blocks.some((b) => b.type === 'markmap')) await renderMarkmap();
}

async function renderMermaidOnly(): Promise<void> {
  if (!blocks.some((b) => b.type === 'mermaid')) return;
  const dark = document.documentElement.dataset.theme === 'dark';
  await renderMermaid(dark);
}

async function renderMermaid(dark: boolean): Promise<void> {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
  for (const b of blocks.filter((x) => x.type === 'mermaid')) {
    try {
      const { svg } = await mermaid.render(`mmd-${mermaidSeq++}`, b.source);
      mountInteractive(b.container, svg);
    } catch (err) {
      b.container.innerHTML = `<pre class="diagram-error">Mermaid 渲染失敗:${escapeHtml(
        String(err)
      )}\n\n${escapeHtml(b.source)}</pre>`;
    }
  }
}

async function renderMarkmap(): Promise<void> {
  const [{ Transformer }, { Markmap }] = await Promise.all([
    import('markmap-lib'),
    import('markmap-view'),
  ]);
  const transformer = new Transformer();
  for (const b of blocks.filter((x) => x.type === 'markmap')) {
    try {
      b.container.innerHTML = '<svg class="markmap-svg"></svg>';
      const svg = b.container.querySelector<SVGSVGElement>('svg')!;
      const { root } = transformer.transform(b.source);
      Markmap.create(svg, { autoFit: true }, root);
    } catch (err) {
      b.container.innerHTML = `<pre class="diagram-error">Markmap 渲染失敗:${escapeHtml(
        String(err)
      )}\n\n${escapeHtml(b.source)}</pre>`;
    }
  }
}

function mountInteractive(container: HTMLElement, svg: string): void {
  container.innerHTML = `
    <div class="diagram-toolbar">
      <button class="diagram-btn" data-action="reset" title="重設縮放">⟲</button>
      <button class="diagram-btn" data-action="fullscreen" title="全螢幕">⛶</button>
    </div>
    <div class="diagram-viewport"><div class="diagram-canvas">${svg}</div></div>`;
  const viewport = container.querySelector<HTMLElement>('.diagram-viewport')!;
  const canvas = container.querySelector<HTMLElement>('.diagram-canvas')!;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      scale = Math.min(8, Math.max(0.3, scale * (e.deltaY < 0 ? 1.15 : 0.87)));
      apply();
    },
    { passive: false }
  );
  let dragging = false;
  let sx = 0;
  let sy = 0;
  viewport.addEventListener('pointerdown', (e) => {
    dragging = true;
    sx = e.clientX - tx;
    sy = e.clientY - ty;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx = e.clientX - sx;
    ty = e.clientY - sy;
    apply();
  });
  viewport.addEventListener('pointerup', () => {
    dragging = false;
  });
  container
    .querySelector('[data-action="reset"]')!
    .addEventListener('click', () => {
      scale = 1;
      tx = 0;
      ty = 0;
      apply();
    });
  container
    .querySelector('[data-action="fullscreen"]')!
    .addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void container.requestFullscreen();
    });
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
