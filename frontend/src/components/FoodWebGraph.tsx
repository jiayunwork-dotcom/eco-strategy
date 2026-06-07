import React, { useMemo } from 'react';
import { Species, TROPHIC_COLORS, TROPHIC_ICONS, PredationEntry, Population } from '../types';

interface FoodWebGraphProps {
  speciesCatalog: Species[];
  populations: Population[];
  predationMatrix: Record<string, PredationEntry>;
}

const NODE_RADIUS_BASE = 12;
const NODE_RADIUS_MAX = 28;
const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 280;

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px',
  },
  header: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#2ecc71',
    marginBottom: '8px',
  },
  svgContainer: {
    background: '#0a1628',
    borderRadius: '8px',
    border: '1px solid #1a3a5c',
  },
  legend: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    flexWrap: 'wrap' as const,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: '#8899aa',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
};

export default function FoodWebGraph({ speciesCatalog, populations, predationMatrix }: FoodWebGraphProps) {
  const relevantSpecies = useMemo(() => {
    const popIds = new Set(populations.map(p => p.species_id));
    return speciesCatalog.filter(s => popIds.has(s.id));
  }, [speciesCatalog, populations]);

  const popMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of populations) {
      m.set(p.species_id, (m.get(p.species_id) || 0) + p.count);
    }
    return m;
  }, [populations]);

  const nodes = useMemo(() => {
    const trophicOrder = ['Producer', 'PrimaryConsumer', 'SecondaryConsumer', 'Decomposer'] as const;
    const byLevel = new Map<string, Species[]>();
    for (const s of relevantSpecies) {
      const list = byLevel.get(s.trophic_level) || [];
      list.push(s);
      byLevel.set(s.trophic_level, list);
    }

    const result: { id: string; name: string; trophic: string; x: number; y: number; r: number; count: number }[] = [];
    const presentLevels = trophicOrder.filter(l => byLevel.has(l));
    const levelY = (level: number) => {
      const total = presentLevels.length;
      if (total <= 1) return GRAPH_HEIGHT / 2;
      return 30 + (GRAPH_HEIGHT - 60) * (level / (total - 1));
    };

    let levelIdx = 0;
    for (const level of trophicOrder) {
      const speciesList = byLevel.get(level);
      if (!speciesList) continue;
      const y = levelY(levelIdx);
      const count = speciesList.length;
      for (let i = 0; i < count; i++) {
        const s = speciesList[i];
        const xSpacing = (GRAPH_WIDTH - 60) / Math.max(count, 1);
        const x = 30 + xSpacing * i + xSpacing / 2;
        const popCount = popMap.get(s.id) || 0;
        const maxPop = s.max_population || 100;
        const ratio = Math.min(popCount / maxPop, 1);
        const r = NODE_RADIUS_BASE + ratio * (NODE_RADIUS_MAX - NODE_RADIUS_BASE);
        result.push({
          id: s.id,
          name: s.name,
          trophic: s.trophic_level,
          x,
          y,
          r: Math.max(r, NODE_RADIUS_BASE),
          count: popCount,
        });
      }
      levelIdx++;
    }
    return result;
  }, [relevantSpecies, popMap]);

  const edges = useMemo(() => {
    const nodeIds = new Set(nodes.map(n => n.id));
    const result: { from: { x: number; y: number }; to: { x: number; y: number }; weight: number }[] = [];
    for (const [key, entry] of Object.entries(predationMatrix)) {
      const [fromId, toId] = key.split(',');
      if (nodeIds.has(fromId) && nodeIds.has(toId)) {
        const fromNode = nodes.find(n => n.id === fromId);
        const toNode = nodes.find(n => n.id === toId);
        if (fromNode && toNode) {
          result.push({
            from: { x: fromNode.x, y: fromNode.y },
            to: { x: toNode.x, y: toNode.y },
            weight: entry.preference_weight,
          });
        }
      }
    }
    return result;
  }, [nodes, predationMatrix]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div style={styles.container}>
      <div style={styles.header}>Food Web</div>
      <div style={styles.svgContainer}>
        <svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#5a7a9a" />
            </marker>
          </defs>

          {edges.map((edge, i) => {
            const dx = edge.to.x - edge.from.x;
            const dy = edge.to.y - edge.from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return null;
            const fromNode = nodes.find(n => n.x === edge.from.x && n.y === edge.from.y);
            const offset = fromNode ? fromNode.r : 12;
            const ux = dx / dist;
            const uy = dy / dist;
            const sx = edge.from.x + ux * offset;
            const sy = edge.from.y + uy * offset;
            const ex = edge.to.x - ux * offset;
            const ey = edge.to.y - uy * offset;

            return (
              <line
                key={`e${i}`}
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke="#5a7a9a"
                strokeWidth={1 + edge.weight * 3}
                strokeOpacity={0.4 + edge.weight * 0.4}
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {nodes.map(node => {
            const color = TROPHIC_COLORS[node.trophic as keyof typeof TROPHIC_COLORS] || '#8899aa';
            const icon = TROPHIC_ICONS[node.trophic as keyof typeof TROPHIC_ICONS] || '?';
            return (
              <g key={node.id}>
                <circle cx={node.x} cy={node.y} r={node.r} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2} />
                <text x={node.x} y={node.y - 2} textAnchor="middle" fontSize="12">{icon}</text>
                <text x={node.x} y={node.y + 10} textAnchor="middle" fontSize="8" fill="#8899aa">
                  {node.name.slice(0, 8)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={styles.legend}>
        {(['Producer', 'PrimaryConsumer', 'SecondaryConsumer', 'Decomposer'] as const).map(level => (
          <div key={level} style={styles.legendItem}>
            <div style={{ ...styles.legendDot, background: TROPHIC_COLORS[level] }} />
            <span>{TROPHIC_ICONS[level]} {level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
