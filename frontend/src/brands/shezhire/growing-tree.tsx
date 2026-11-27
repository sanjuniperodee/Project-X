import type { CSSProperties } from 'react';

interface TreeNode {
  id: string;
  name: string;
  x: number;
  gen: number;
  parent?: string;
  self?: boolean;
}

const ROW = [44, 150, 256, 362];

const NODES: TreeNode[] = [
  { id: 'root', name: 'Жақсылық ата', x: 260, gen: 0 },
  { id: 'a', name: 'Сейтқали', x: 100, gen: 1, parent: 'root' },
  { id: 'b', name: 'Зейнеп', x: 260, gen: 1, parent: 'root' },
  { id: 'c', name: 'Мұрат', x: 420, gen: 1, parent: 'root' },
  { id: 'a1', name: 'Асқар', x: 50, gen: 2, parent: 'a' },
  { id: 'a2', name: 'Гүлнар', x: 150, gen: 2, parent: 'a' },
  { id: 'b1', name: 'Ерлан', x: 225, gen: 2, parent: 'b' },
  { id: 'b2', name: 'Айгүл', x: 300, gen: 2, parent: 'b' },
  { id: 'c1', name: 'Дана', x: 390, gen: 2, parent: 'c' },
  { id: 'c2', name: 'Нұрлан', x: 470, gen: 2, parent: 'c' },
  { id: 'b11', name: 'Алихан', x: 190, gen: 3, parent: 'b1' },
  { id: 'b12', name: 'Вы', x: 262, gen: 3, parent: 'b1', self: true },
  { id: 'b21', name: 'Томирис', x: 336, gen: 3, parent: 'b2' },
  { id: 'c21', name: 'Әлия', x: 470, gen: 3, parent: 'c2' },
];

const byId = new Map(NODES.map((n) => [n.id, n]));
const STAGGER = 0.55;

/**
 * The landing's single orchestrated animation: the family tree draws itself
 * generation by generation, from the eldest ancestor down to "you".
 * Pure SVG + CSS, so it renders on the server and respects reduced motion.
 */
export function GrowingTree() {
  return (
    <svg viewBox="0 0 520 400" className="w-full" role="img" aria-label="Пример семейного древа на четыре поколения">
      <g fill="none" stroke="var(--color-shezhire-gold)" strokeWidth="1.4" strokeLinecap="round">
        {NODES.filter((n) => n.parent).map((node) => {
          const parent = byId.get(node.parent!)!;
          // Below the parent's name (the root's name sits above its node).
          const y1 = ROW[parent.gen]! + (parent.gen === 0 ? 12 : 36);
          const y2 = ROW[node.gen]! - 12;
          const mid = (y1 + y2) / 2;
          return (
            <path
              key={node.id}
              d={`M${parent.x} ${y1}V${mid}H${node.x}V${y2}`}
              pathLength={1}
              strokeDasharray={1}
              className="animate-grow"
              style={{ '--len': 1, animationDelay: `${(node.gen - 1) * STAGGER + 0.2}s` } as CSSProperties}
            />
          );
        })}
      </g>
      {NODES.map((node) => {
        const y = ROW[node.gen]!;
        return (
          <g
            key={node.id}
            style={{
              animation: `fade-in 0.5s ease-out ${node.gen * STAGGER}s both`,
              transformOrigin: `${node.x}px ${y}px`,
            }}
          >
            <circle
              cx={node.x}
              cy={y}
              r={node.gen === 0 ? 9 : 6.5}
              fill={node.self ? 'var(--color-shezhire-gold)' : 'var(--color-shezhire-indigo)'}
              stroke="var(--color-shezhire-gold)"
              strokeWidth="1.6"
            />
            <text
              x={node.x}
              y={y + (node.gen === 0 ? -18 : 26)}
              textAnchor="middle"
              className="font-[family-name:var(--font-cormorant)]"
              fontSize={node.gen === 0 ? 24 : 19}
              fontWeight={node.self ? 700 : 500}
              fill={node.self ? 'var(--color-shezhire-gold)' : 'var(--color-shezhire-paper)'}
            >
              {node.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
