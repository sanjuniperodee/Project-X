/** A trend line of the last 30 days in the project's colour, with the latest value marked. */
export function Sparkline({ values, color, label, width = 120, height = 36 }: { values: number[]; color: string; label: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 8)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = points.at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`-4 0 ${width + 8} ${height}`} role="img" aria-label={label} className="block overflow-visible">
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill={color} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
