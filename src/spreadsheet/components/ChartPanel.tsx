import React, { useMemo, useRef, useState } from 'react';
import { columnToLetter } from '../utils/columnUtils';
import { evaluateFormula } from '../utils/formulaUtils';
import { keyOf, CellData, SelectionRect } from '../types/spreadsheet';
import { CloseIcon, BarChartIcon, LineChartIcon, PieChartIcon } from './icons';
import styles from './ChartPanel.module.css';

export type ChartType = 'bar' | 'line' | 'pie';

/*
 * Floating SVG chart built from a selected range: the first column (or row)
 * provides labels, the remaining numeric columns/rows are series. Pure SVG,
 * no chart dependency.
 */
export interface ChartPanelState {
  type: ChartType;
  pos: { x: number; y: number };
}

export const ChartPanel: React.FC<{
  range: SelectionRect;
  data: Map<string, CellData>;
  onClose: () => void;
  initial?: ChartPanelState;
  onStateChange?: (state: ChartPanelState) => void;
}> = ({ range, data, onClose, initial, onStateChange }) => {
  const [type, setType] = useState<ChartType>(initial?.type ?? 'bar');
  const [pos, setPos] = useState(initial?.pos ?? { x: 80, y: 120 });
  const reportRef = useRef(onStateChange);
  reportRef.current = onStateChange;

  const changeType = (t: ChartType) => {
    setType(t);
    reportRef.current?.({ type: t, pos });
  };

  const { labels, series } = useMemo(() => {
    const startRow = Math.min(range.startRow, range.endRow);
    const endRow = Math.max(range.startRow, range.endRow);
    const startCol = Math.min(range.startCol, range.endCol);
    const endCol = Math.max(range.startCol, range.endCol);
    const numRows = endRow - startRow + 1;
    const numCols = endCol - startCol + 1;

    const valueOf = (r: number, c: number): number | null => {
      const cell = data.get(keyOf(r, c));
      if (!cell) return null;
      if (cell.formula && String(cell.formula).startsWith('=')) {
        const v = evaluateFormula(cell.formula, (rr, cc) => data.get(keyOf(rr, cc)));
        return typeof v === 'number' && isFinite(v) ? v : null;
      }
      return typeof cell.value === 'number' ? cell.value : null;
    };

    // Columns become series; the first column is labels. If the range is a
    // single column of numbers with no text labels, index it 1..n.
    const useFirstColAsLabels =
      numCols > 1 &&
      Array.from({ length: numRows }, (_, i) => valueOf(startRow + i, startCol))
        .every((v) => v === null);

    const colOffset = useFirstColAsLabels ? 1 : 0;
    const labels: string[] = [];
    for (let r = startRow; r <= endRow; r++) {
      if (useFirstColAsLabels) {
        const cell = data.get(keyOf(r, startCol));
        labels.push(String(cell?.value ?? ''));
      } else {
        labels.push(String(r - startRow + 1));
      }
    }

    const series: Array<{ name: string; values: number[] }> = [];
    if (numCols - colOffset >= 1 && numRows >= 2) {
      // vertical series: one series per data column
      for (let c = startCol + colOffset; c <= endCol; c++) {
        const values: number[] = [];
        let any = false;
        for (let r = startRow; r <= endRow; r++) {
          const v = valueOf(r, c);
          if (v !== null) any = true;
          values.push(v ?? 0);
        }
        if (any) series.push({ name: columnToLetter(c), values });
      }
    }
    return { labels, series };
  }, [range, data]);

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    let latest = pos;
    const move = (ev: MouseEvent) => {
      latest = { x: ev.clientX - startX, y: ev.clientY - startY };
      setPos(latest);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      reportRef.current?.({ type, pos: latest });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const W = 380;
  const H = 240;
  const pad = { l: 40, r: 12, t: 16, b: 34 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const allValues = series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...allValues);
  const minV = Math.min(0, ...allValues);
  const span = maxV - minV || 1;
  const n = labels.length || 1;
  const y = (v: number) => pad.t + ih - ((v - minV) / span) * ih;
  const colors = ['#0284c7', '#16a34a', '#ea580c', '#9333ea', '#0d9488', '#dc2626'];

  let chart: React.ReactNode = null;
  if (!series.length) {
    chart = (
      <text x={W / 2} y={H / 2} textAnchor="middle" className={styles.emptyText}>
        Select cells with numbers to chart
      </text>
    );
  } else if (type === 'bar') {
    chart = (
      <>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = minV + f * span;
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className={styles.tick}>
                {Math.round(v * 100) / 100}
              </text>
            </g>
          );
        })}
        {series.map((s, si) =>
          s.values.map((v, i) => {
            const groupW = iw / n;
            const barW = Math.min(18, (groupW - 4) / series.length);
            const x = pad.l + i * groupW + 2 + si * barW;
            const top = Math.min(y(v), y(0));
            const h = Math.abs(y(v) - y(0));
            return <rect key={`${si}-${i}`} x={x} y={top} width={barW - 1.5} height={h} fill={colors[si % colors.length]} rx={1} />;
          })
        )}
        {labels.map((l, i) => (
          <text key={i} x={pad.l + (i + 0.5) * (iw / n)} y={H - pad.b + 14} textAnchor="middle" className={styles.tick}>
            {l.length > 6 ? l.slice(0, 6) + '…' : l}
          </text>
        ))}
      </>
    );
  } else if (type === 'line') {
    chart = (
      <>
        {[0, 0.5, 1].map((f) => {
          const v = minV + f * span;
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className={styles.tick}>
                {Math.round(v * 100) / 100}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => (
          <polyline
            key={si}
            className={styles.line}
            stroke={colors[si % colors.length]}
            points={s.values.map((v, i) => `${pad.l + (i + 0.5) * (iw / n)},${y(v)}`).join(' ')}
          />
        ))}
        {labels.map((l, i) => (
          <text key={i} x={pad.l + (i + 0.5) * (iw / n)} y={H - pad.b + 14} textAnchor="middle" className={styles.tick}>
            {l.length > 6 ? l.slice(0, 6) + '…' : l}
          </text>
        ))}
      </>
    );
  } else {
    // pie: first series only
    const values = series[0].values.map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2 - 40;
    const cy = H / 2 + 4;
    const r = Math.min(ih, iw) / 2 - 8;
    let angle = -Math.PI / 2;
    chart = (
      <>
        {values.map((v, i) => {
          const frac = v / total;
          const a2 = angle + frac * Math.PI * 2;
          const x1 = cx + r * Math.cos(angle);
          const y1 = cy + r * Math.sin(angle);
          const x2 = cx + r * Math.cos(a2);
          const y2 = cy + r * Math.sin(a2);
          const large = frac > 0.5 ? 1 : 0;
          const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
          const mid = (angle + a2) / 2;
          angle = a2;
          return (
            <g key={i}>
              <path d={d} fill={colors[i % colors.length]} opacity={0.9} />
              {frac > 0.05 && (
                <text x={cx + (r * 0.65) * Math.cos(mid)} y={cy + (r * 0.65) * Math.sin(mid)} textAnchor="middle" className={styles.pieLabel}>
                  {labels[i] ? labels[i].slice(0, 5) : i + 1}
                </text>
              )}
            </g>
          );
        })}
        {labels.slice(0, 6).map((l, i) => (
          <g key={i} transform={`translate(${W - 92}, ${24 + i * 18})`}>
            <rect width={9} height={9} rx={2} fill={colors[i % colors.length]} />
            <text x={14} y={8} className={styles.tick}>{l.length > 10 ? l.slice(0, 10) + '…' : l}</text>
          </g>
        ))}
      </>
    );
  }

  return (
    <div className={styles.panel} style={{ left: pos.x, top: pos.y }} onMouseDown={startDrag}>
      <div className={styles.header}>
        <span className={styles.title}>Chart</span>
        <div className={styles.typeSwitch}>
          {(['bar', 'line', 'pie'] as ChartType[]).map((t) => (
            <button key={t} className={type === t ? styles.typeActive : ''} onClick={() => changeType(t)} title={`${t} chart`} aria-label={`${t} chart`}>
              {t === 'bar' ? <BarChartIcon /> : t === 'line' ? <LineChartIcon /> : <PieChartIcon />}
            </button>
          ))}
        </div>
        <button className={styles.close} onClick={onClose} title="Close"><CloseIcon /></button>
      </div>
      <svg width={W} height={H} className={styles.svg}>
        <rect x={0} y={0} width={W} height={H} className={styles.bg} />
        {chart}
      </svg>
      {series.length > 1 && type !== 'pie' && (
        <div className={styles.legend}>
          {series.map((s, i) => (
            <span key={i} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: colors[i % colors.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
