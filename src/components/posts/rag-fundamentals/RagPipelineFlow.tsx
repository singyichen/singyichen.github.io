import { useMemo, useState } from 'react';
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useThemeTokens } from '../../shared/useThemeTokens';

const STEPS = [
  { id: 'query', label: '使用者問題', desc: '一切從一個自然語言問題開始。' },
  { id: 'embed', label: 'Embedding', desc: '問題被轉成向量,準備跟知識庫比對相似度。' },
  { id: 'retrieve', label: '向量檢索', desc: '從向量資料庫撈出最相近的 Top-K 個 chunk。' },
  { id: 'rerank', label: 'Rerank', desc: '用更精準(也更貴)的模型重排,把真正相關的排到前面。' },
  { id: 'prompt', label: 'Prompt 組裝', desc: '把篩選後的 chunk 塞進 prompt,附上引用規則。' },
  { id: 'generate', label: 'LLM 生成', desc: '模型基於檢索到的內容作答,並標註來源。' },
];

export default function RagPipelineFlow() {
  const [step, setStep] = useState(0);
  const t = useThemeTokens(['bg-card', 'text', 'accent', 'border']);
  const accent = t['accent'] || '#0e7c66';

  const nodes: Node[] = useMemo(
    () =>
      STEPS.map((s, i) => ({
        id: s.id,
        position: { x: (i % 3) * 220, y: Math.floor(i / 3) * 140 },
        data: { label: s.label },
        style: {
          background: t['bg-card'] || '#f4f4f2',
          color: t['text'] || '#1f2328',
          border: `2px solid ${i <= step ? accent : t['border'] || '#e5e7e6'}`,
          borderRadius: 10,
          opacity: i <= step ? 1 : 0.5,
          fontWeight: i === step ? 700 : 400,
        },
      })),
    [step, t]
  );

  const edges: Edge[] = useMemo(
    () =>
      STEPS.slice(1).map((s, i) => ({
        id: `e${i}`,
        source: STEPS[i].id,
        target: s.id,
        animated: i + 1 === step,
        style: { stroke: i < step ? accent : t['border'] || '#e5e7e6', strokeWidth: 2 },
      })),
    [step, t]
  );

  return (
    <div className="flow-demo">
      <div style={{ height: 340 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="flow-demo-panel">
        <p>
          <strong>
            {step + 1}/{STEPS.length}:{STEPS[step].label}
          </strong>
          {' — '}
          {STEPS[step].desc}
        </p>
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ← 上一步
        </button>{' '}
        <button
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={step === STEPS.length - 1}
        >
          下一步 →
        </button>{' '}
        <button onClick={() => setStep(0)}>重播</button>
      </div>
    </div>
  );
}
