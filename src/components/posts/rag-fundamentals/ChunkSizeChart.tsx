import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useThemeTokens } from '../../shared/useThemeTokens';

type Point = { chunk: number; recall: number; faithfulness: number };

const DATA: Record<string, Point[]> = {
  '0': [
    { chunk: 128, recall: 0.58, faithfulness: 0.9 },
    { chunk: 256, recall: 0.7, faithfulness: 0.88 },
    { chunk: 512, recall: 0.79, faithfulness: 0.84 },
    { chunk: 1024, recall: 0.82, faithfulness: 0.76 },
    { chunk: 2048, recall: 0.8, faithfulness: 0.65 },
  ],
  '10': [
    { chunk: 128, recall: 0.63, faithfulness: 0.9 },
    { chunk: 256, recall: 0.75, faithfulness: 0.89 },
    { chunk: 512, recall: 0.83, faithfulness: 0.85 },
    { chunk: 1024, recall: 0.85, faithfulness: 0.77 },
    { chunk: 2048, recall: 0.82, faithfulness: 0.66 },
  ],
  '20': [
    { chunk: 128, recall: 0.66, faithfulness: 0.89 },
    { chunk: 256, recall: 0.78, faithfulness: 0.88 },
    { chunk: 512, recall: 0.85, faithfulness: 0.84 },
    { chunk: 1024, recall: 0.86, faithfulness: 0.75 },
    { chunk: 2048, recall: 0.83, faithfulness: 0.64 },
  ],
};

export default function ChunkSizeChart() {
  const [overlap, setOverlap] = useState('10');
  const t = useThemeTokens(['accent', 'text-muted', 'border', 'text', 'bg-card']);
  const accent = t['accent'] || '#0e7c66';
  const muted = t['text-muted'] || '#6b7280';

  return (
    <div className="chart-demo">
      <div className="chart-demo-controls">
        chunk overlap:
        {['0', '10', '20'].map((o) => (
          <button key={o} className={o === overlap ? 'active' : ''} onClick={() => setOverlap(o)}>
            {o}%
          </button>
        ))}
        <span className="chart-note">(示意資料,非實測)</span>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={DATA[overlap]} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={t['border'] || '#e5e7e6'} strokeDasharray="3 3" />
          <XAxis dataKey="chunk" stroke={muted} tick={{ fill: muted }} />
          <YAxis domain={[0.5, 1]} stroke={muted} tick={{ fill: muted }} />
          <Tooltip
            contentStyle={{
              background: t['bg-card'] || '#f4f4f2',
              border: `1px solid ${t['border'] || '#e5e7e6'}`,
              color: t['text'] || '#1f2328',
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="recall" name="Recall" stroke={accent} strokeWidth={2} />
          <Line
            type="monotone"
            dataKey="faithfulness"
            name="Faithfulness"
            stroke={muted}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
