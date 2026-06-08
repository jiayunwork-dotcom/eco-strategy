import React, { useMemo, useRef, useState } from 'react';
import { Species, GameState, TROPHIC_COLORS, TrophicLevel, GENE_NAMES, MutationHistoryEntry } from '../types';

interface EvolutionPanelProps {
  gameState: GameState;
  mutationHistory: MutationHistoryEntry[];
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
  detailCard: {
    position: 'absolute' as const,
    background: 'rgba(10, 22, 40, 0.97)',
    border: '1px solid #2ecc71',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '11px',
    color: '#e0e6ed',
    zIndex: 200,
    minWidth: '260px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    pointerEvents: 'none' as const,
  },
  detailTitle: {
    fontWeight: 700,
    fontSize: '13px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  geneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '3px',
  },
  geneLabel: {
    width: '90px',
    fontSize: '9px',
    color: '#8899aa',
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  geneBarBg: {
    width: '120px',
    height: '8px',
    background: '#0a1628',
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative' as const,
  },
  geneBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.2s',
  },
  geneValue: {
    fontSize: '9px',
    color: '#5a7a9a',
    width: '32px',
    textAlign: 'left' as const,
  },
  timelineContainer: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #1a3a5c',
  },
  timelineTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#8899aa',
    marginBottom: '4px',
  },
  tooltip: {
    position: 'absolute' as const,
    background: 'rgba(10, 22, 40, 0.97)',
    border: '1px solid #1a3a5c',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11px',
    color: '#e0e6ed',
    pointerEvents: 'none' as const,
    zIndex: 300,
    maxWidth: '250px',
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

function getAncestorPath(speciesId: string, speciesTree: Record<string, string | null>): string[] {
  const path: string[] = [speciesId];
  let current = speciesId;
  while (speciesTree[current] !== null && speciesTree[current] !== undefined) {
    const parent = speciesTree[current]!;
    path.unshift(parent);
    current = parent;
  }
  return path;
}

function getGeneBarColor(value: number): string {
  if (value > 0.5) return '#2ecc71';
  if (value > 0) return '#f39c12';
  if (value > -0.5) return '#e67e22';
  return '#e74c3c';
}

export default function EvolutionPanel({ gameState, mutationHistory }: EvolutionPanelProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [timelineHover, setTimelineHover] = useState<{ turn: number; idx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const ancestorPath = useMemo(() => {
    if (!selectedId) return new Set<string>();
    return new Set(getAncestorPath(selectedId, gameState.species_tree));
  }, [selectedId, gameState.species_tree]);

  const ancestorEdges = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const path = getAncestorPath(selectedId, gameState.species_tree);
    const edges = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      edges.add(`${path[i]}->${path[i + 1]}`);
    }
    return edges;
  }, [selectedId, gameState.species_tree]);

  const selectedSpecies = useMemo(() => {
    if (!selectedId) return null;
    return gameState.species_catalog.find(s => s.id === selectedId) || null;
  }, [selectedId, gameState.species_catalog]);

  const selectedNode = useMemo(() => {
    if (!selectedId) return null;
    return allNodes.find(n => n.species.id === selectedId) || null;
  }, [selectedId, allNodes]);

  if (treeNodes.length === 0) {
    return (
      <div style={styles.panel}>
        <div style={styles.header}>Evolution Tree</div>
        <div style={styles.empty}>No species evolution data yet</div>
      </div>
    );
  }

  const detailCardPos = (() => {
    if (!selectedId) return null;
    const pos = positions.get(selectedId);
    if (!pos) return null;
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return null;
    const rect = svgEl.getBoundingClientRect();
    const panelRect = containerRef.current.getBoundingClientRect();
    const x = pos.x + rect.left - panelRect.left + 20;
    const y = pos.y + rect.top - panelRect.top - 40;
    return {
      left: Math.min(x, panelRect.width - 280),
      top: Math.max(0, y),
    };
  })();

  return (
    <div style={styles.panel} ref={containerRef}>
      <div style={styles.header}>Evolution Tree</div>

      <div style={styles.svgContainer}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: 'block' }}
          onClick={(e) => {
            const target = e.target as SVGElement;
            if (target.tagName === 'circle') return;
            setSelectedId(null);
          }}
        >
          {allNodes.map(node => {
            const pos = positions.get(node.species.id);
            if (!pos) return null;

            const parentId = gameState.species_tree[node.species.id];
            const parentPos = parentId ? positions.get(parentId) : null;

            const trophicColor = TROPHIC_COLORS[node.species.trophic_level];
            const nodeRadius = Math.max(4, Math.min(16, Math.sqrt(node.totalPopulation / 50)));
            const isSelected = selectedId === node.species.id;
            const isInPath = ancestorPath.has(node.species.id);

            const edgeKey = parentId ? `${parentId}->${node.species.id}` : null;
            const isHighlightedEdge = edgeKey ? ancestorEdges.has(edgeKey) : false;

            return (
              <g key={node.species.id}>
                {parentPos && (
                  <path
                    d={`M ${parentPos.x} ${parentPos.y} C ${parentPos.x} ${(parentPos.y + pos.y) / 2}, ${pos.x} ${(parentPos.y + pos.y) / 2}, ${pos.x} ${pos.y}`}
                    fill="none"
                    stroke={isHighlightedEdge ? '#ffd700' : (node.isExtinct ? '#5a7a9a' : trophicColor)}
                    strokeWidth={isHighlightedEdge ? 3 : 1.5}
                    strokeOpacity={isHighlightedEdge ? 1 : (node.isExtinct ? 0.4 : 0.6)}
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isSelected ? nodeRadius + 3 : nodeRadius}
                  fill={node.isExtinct ? 'none' : (isSelected ? '#ffd700' : trophicColor)}
                  stroke={isSelected ? '#ffd700' : (node.isExtinct ? '#5a7a9a' : (isInPath ? '#ffd700' : trophicColor))}
                  strokeWidth={isSelected || isInPath ? 2.5 : 1.5}
                  strokeDasharray={node.isExtinct ? '3,3' : 'none'}
                  fillOpacity={node.isExtinct ? 0 : (isSelected ? 0.3 : 0.8)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(selectedId === node.species.id ? null : node.species.id);
                  }}
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
                    fill={isInPath ? '#ffd700' : '#8899aa'}
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

      {selectedId && selectedSpecies && selectedNode && detailCardPos && (
        <div style={{ ...styles.detailCard, left: detailCardPos.left, top: detailCardPos.top }}>
          <div style={{ ...styles.detailTitle, color: TROPHIC_COLORS[selectedSpecies.trophic_level] }}>
            {selectedSpecies.name}
            {selectedSpecies.is_artificial && <span style={{ color: '#f39c12' }}>&#x2692;</span>}
          </div>
          <div style={{ fontSize: '10px', color: '#8899aa', marginBottom: '8px' }}>
            Pop: {Math.round(selectedNode.totalPopulation)} · {selectedSpecies.trophic_level}
            {selectedNode.isExtinct && <span style={{ color: '#e74c3c', marginLeft: '6px' }}>Extinct</span>}
          </div>
          {selectedSpecies.genes.map((geneValue: number, i: number) => {
            const normalized = (geneValue + 2) / 4;
            const barWidth = Math.max(2, normalized * 120);
            return (
              <div key={i} style={styles.geneRow}>
                <span style={styles.geneLabel}>{GENE_NAMES[i]}</span>
                <div style={styles.geneBarBg}>
                  <div style={{
                    ...styles.geneBarFill,
                    width: barWidth,
                    background: getGeneBarColor(geneValue),
                  }} />
                </div>
                <span style={styles.geneValue}>{geneValue.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}

      {mutationHistory.length > 0 && (
        <div style={styles.timelineContainer}>
          <div style={styles.timelineTitle}>Mutation Timeline</div>
          <div style={{ position: 'relative', height: '36px', overflow: 'hidden' }}>
            <svg
              width="100%"
              height="36"
              viewBox={`0 0 ${Math.max(300, mutationHistory[mutationHistory.length - 1].turn * 12 + 20)} 36`}
              preserveAspectRatio="xMinYMin meet"
              style={{ display: 'block' }}
            >
              <line
                x1={0} y1={18}
                x2={Math.max(300, mutationHistory[mutationHistory.length - 1].turn * 12 + 20)}
                y2={18}
                stroke="#1a3a5c"
                strokeWidth={1}
              />
              {mutationHistory.map((entry, idx) => {
                const cx = entry.turn * 12 + 10;
                const isHovered = timelineHover?.turn === entry.turn && timelineHover?.idx === idx;
                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={18}
                    r={isHovered ? 5 : 3}
                    fill={entry.is_artificial ? '#f39c12' : '#3498db'}
                    stroke={isHovered ? '#fff' : 'none'}
                    strokeWidth={1}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setTimelineHover({ turn: entry.turn, idx })}
                    onMouseLeave={() => setTimelineHover(null)}
                  />
                );
              })}
            </svg>
          </div>
          {timelineHover && (() => {
            const entry = mutationHistory[timelineHover.idx];
            if (!entry) return null;
            const parentName = gameState.species_catalog.find(s => s.id === entry.parent_species_id)?.name || entry.parent_species_id.slice(0, 8);
            const geneNames = entry.mutated_genes.map(g => GENE_NAMES[g] || `Gene${g}`).join(', ');
            return (
              <div style={styles.tooltip}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                  Turn {entry.turn} · {entry.is_artificial ? '⚒ Artificial' : '🧬 Natural'}
                </div>
                <div style={{ fontSize: '10px', color: '#8899aa' }}>
                  <div>Parent: {parentName}</div>
                  <div>Child: {entry.child_name}</div>
                  <div>Genes: {geneNames}</div>
                </div>
              </div>
            );
          })()}
          <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#3498db' }} />
              Natural
            </div>
            <div style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: '#f39c12' }} />
              Artificial
            </div>
          </div>
        </div>
      )}

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
        <div style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: '#ffd700' }} />
          Selected Path
        </div>
      </div>
    </div>
  );
}
