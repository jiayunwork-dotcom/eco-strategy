import React, { useMemo } from 'react';
import { Species, GameState, TROPHIC_COLORS, TrophicLevel } from '../types';

interface EvolutionPanelProps {
  gameState: GameState;
}

interface TreeNode {
  species: Species;
  children: TreeNode[];
  depth: number;
  isExtinct: boolean;
  totalPopulation: number;
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'auto',
  },
  header: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#2ecc71',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #1a3a5c',
  },
  svgContainer: {
    flex: 1,
    overflow: 'auto',
    minHeight: '200px',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #1a3a5c',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: '#8899aa',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: '#5a7a9a',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  tooltip: {
    position: 'absolute' as const,
    background: 'rgba(10, 22, 40, 0.95)',
    border: '1px solid #1a3a5c',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11px',
    color: '#e0e6ed',
    pointerEvents: 'none' as const,
    zIndex: 100,
    maxWidth: '200px',
  },
};

function buildTree(gameState: GameState): TreeNode[] {
  const speciesMap = new Map(gameState.species_catalog.map(s => [s.id, s]));
  const populationMap = new Map<string, number>();

  for (const cell of Object.values(gameState.cells)) {
    for (const pop of cell.populations) {
      const cur = populationMap.get(pop.species_id) || 0;
      populationMap.set(pop.species_id, cur + pop.count);
    }
  }

  const childMap = new Map<string, string[]>();
  const roots: string[] = [];

  for (const [childId, parentId] of Object.entries(gameState.species_tree)) {
    if (parentId === null) {
      roots.push(childId);
    } else {
      const siblings = childMap.get(parentId) || [];
      siblings.push(childId);
      childMap.set(parentId, siblings);
    }
  }

  function buildNode(speciesId: string, depth: number): TreeNode | null {
    const species = speciesMap.get(speciesId);
    if (!species) return null;

    const totalPop = populationMap.get(speciesId) || 0;
    const isExtinct = totalPop <= 0;
    const childIds = childMap.get(speciesId) || [];
    const children = childIds
      .map(cid => buildNode(cid, depth + 1))
      .filter((n): n is TreeNode => n !== null);

    return { species, children, depth, isExtinct, totalPopulation: totalPop };
  }

  return roots
    .map(rid => buildNode(rid, 0))
    .filter((n): n is TreeNode => n !== null);
}

function getMaxDepth(nodes: TreeNode[]): number {
  let max = 0;
  for (const node of nodes) {
    max = Math.max(max, node.depth);
    max = Math.max(max, getMaxDepth(node.children));
  }
  return max;
}

function countLeaves(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.children.length === 0) {
      count++;
    } else {
      count += countLeaves(node.children);
    }
  }
  return count;
}

function layoutTree(
  nodes: TreeNode[],
  maxDepth: number,
  svgWidth: number,
  svgHeight: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const totalLeaves = countLeaves(nodes);
  if (totalLeaves === 0) return positions;

  const xSpacing = svgWidth / (totalLeaves + 1);
  const ySpacing = maxDepth > 0 ? svgHeight / (maxDepth + 1) : svgHeight / 2;
  let leafIndex = 0;

  function assignPositions(node: TreeNode) {
    if (node.children.length === 0) {
      leafIndex++;
      const x = leafIndex * xSpacing;
      const y = (node.depth + 1) * ySpacing;
      positions.set(node.species.id, { x, y });
    } else {
      for (const child of node.children) {
        assignPositions(child);
      }
      const childPositions = node.children.map(c => positions.get(c.species.id)!);
      const x = childPositions.reduce((s, p) => s + p.x, 0) / childPositions.length;
      const y = (node.depth + 1) * ySpacing;
      positions.set(node.species.id, { x, y });
    }
  }

  for (const root of nodes) {
    assignPositions(root);
  }

  return positions;
}

export default function EvolutionPanel({ gameState }: EvolutionPanelProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  const treeNodes = useMemo(() => buildTree(gameState), [gameState]);

  const svgWidth = 600;
  const svgHeight = Math.max(300, Math.min(600, countLeaves(treeNodes) * 25 + 60));

  const positions = useMemo(
    () => layoutTree(treeNodes, getMaxDepth(treeNodes), svgWidth, svgHeight),
    [treeNodes, svgWidth, svgHeight],
  );

  const allNodes = useMemo(() => {
    const result: TreeNode[] = [];
    function collect(nodes: TreeNode[]) {
      for (const n of nodes) {
        result.push(n);
        collect(n.children);
      }
    }
    collect(treeNodes);
    return result;
  }, [treeNodes]);

  if (treeNodes.length === 0) {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Evolution Tree</div>
        <div style={styles.empty}>No species evolution data yet</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>Evolution Tree</div>

      <div style={styles.svgContainer}>
        <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
          {allNodes.map(node => {
            const pos = positions.get(node.species.id);
            if (!pos) return null;

            const parentId = gameState.species_tree[node.species.id];
            const parentPos = parentId ? positions.get(parentId) : null;

            const trophicColor = TROPHIC_COLORS[node.species.trophic_level];
            const nodeRadius = Math.max(4, Math.min(16, Math.sqrt(node.totalPopulation / 50)));

            return (
              <g key={node.species.id}>
                {parentPos && (
                  <path
                    d={`M ${parentPos.x} ${parentPos.y} C ${parentPos.x} ${(parentPos.y + pos.y) / 2}, ${pos.x} ${(parentPos.y + pos.y) / 2}, ${pos.x} ${pos.y}`}
                    fill="none"
                    stroke={node.isExtinct ? '#5a7a9a' : trophicColor}
                    strokeWidth={1.5}
                    strokeOpacity={node.isExtinct ? 0.4 : 0.6}
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill={node.isExtinct ? 'none' : trophicColor}
                  stroke={node.isExtinct ? '#5a7a9a' : trophicColor}
                  strokeWidth={1.5}
                  strokeDasharray={node.isExtinct ? '3,3' : 'none'}
                  fillOpacity={node.isExtinct ? 0 : 0.8}
                  onMouseEnter={() => setHoveredId(node.species.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ cursor: 'pointer' }}
                />
                {node.species.is_artificial && (
                  <text
                    x={pos.x + nodeRadius + 2}
                    y={pos.y - nodeRadius - 2}
                    fontSize="9"
                    fill="#f39c12"
                  >
                    &#x2692;
                  </text>
                )}
                {node.children.length === 0 && (
                  <text
                    x={pos.x}
                    y={pos.y + nodeRadius + 10}
                    fontSize="8"
                    fill="#8899aa"
                    textAnchor="middle"
                  >
                    {node.species.name.length > 12
                      ? node.species.name.substring(0, 12) + '...'
                      : node.species.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredId && (() => {
        const species = gameState.species_catalog.find(s => s.id === hoveredId);
        if (!species) return null;
        const node = allNodes.find(n => n.species.id === hoveredId);
        if (!node) return null;
        return (
          <div style={styles.tooltip}>
            <div style={{ fontWeight: 600, color: TROPHIC_COLORS[species.trophic_level] }}>
              {species.name}
            </div>
            <div>Population: {Math.round(node.totalPopulation)}</div>
            <div>Trophic: {species.trophic_level}</div>
            {species.is_artificial && <div style={{ color: '#f39c12' }}>&#x2692; Artificially Bred</div>}
            {node.isExtinct && <div style={{ color: '#e74c3c' }}>Extinct</div>}
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#8899aa' }}>
              Genes: {species.genes.slice(0, 4).map((g, i) => `${g.toFixed(2)}`).join(', ')}...
            </div>
          </div>
        );
      })()}

      <div style={styles.legend}>
        {(['Producer', 'PrimaryConsumer', 'SecondaryConsumer', 'Decomposer'] as TrophicLevel[]).map(level => (
          <div key={level} style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: TROPHIC_COLORS[level] }} />
            {level}
          </div>
        ))}
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, border: '1.5px dashed #5a7a9a', background: 'none' }} />
          Extinct
        </div>
        <div style={styles.legendItem}>
          <span style={{ color: '#f39c12', fontSize: '12px' }}>&#x2692;</span>
          Bred
        </div>
      </div>
    </div>
  );
}
