import React, { useState, MutableRefObject } from 'react';
import { GameState, HexCell, Biome, PlayerActionType, ACTION_COSTS, TrophicLevel, GENE_NAMES } from '../types';
import { WebSocketManager, submitAction } from '../api';

interface ActionPanelProps {
  gameState: GameState;
  playerId: string;
  selectedCell: HexCell | null;
  wsRef: MutableRefObject<WebSocketManager | null>;
  onRefresh: () => void;
}

const BIOME_OPTIONS: Biome[] = ['Forest', 'Grassland', 'Wetland', 'Desert'];

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    alignItems: 'stretch',
    padding: '10px 16px',
    gap: '12px',
    overflowX: 'auto',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '140px',
  },
  groupLabel: {
    fontSize: '10px',
    color: '#5a7a9a',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  select: {
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#e0e6ed',
    fontSize: '12px',
    outline: 'none',
    appearance: 'none',
    cursor: 'pointer',
  },
  input: {
    background: '#0a1628',
    border: '1px solid #1a3a5c',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#e0e6ed',
    fontSize: '12px',
    outline: 'none',
    width: '60px',
  },
  btn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  btnEnabled: {
    background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
    color: '#0a1628',
  },
  btnDisabled: {
    background: '#1a3a5c',
    color: '#5a7a9a',
    cursor: 'not-allowed',
  },
  btnDanger: {
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    color: '#fff',
  },
  btnWarn: {
    background: 'linear-gradient(135deg, #f39c12, #e67e22)',
    color: '#0a1628',
  },
  cost: {
    fontSize: '10px',
    color: '#5a7a9a',
  },
  remaining: {
    fontSize: '10px',
    color: '#f39c12',
    fontWeight: 600,
  },
  noCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    color: '#5a7a9a',
    fontSize: '12px',
    width: '100%',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  divider: {
    width: '1px',
    background: '#1a3a5c',
    alignSelf: 'stretch',
    margin: '0 4px',
  },
};

export default function ActionPanel({ gameState, playerId, selectedCell, wsRef, onRefresh }: ActionPanelProps) {
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [selectedBiome, setSelectedBiome] = useState<Biome>('Grassland');
  const [quotaValue, setQuotaValue] = useState('5');
  const [actionError, setActionError] = useState<string | null>(null);
  const [breedGene1, setBreedGene1] = useState<number>(0);
  const [breedGene2, setBreedGene2] = useState<number | null>(null);

  const player = gameState.players[playerId];
  if (!player) return null;

  const remaining = player.actions_remaining;
  const resources = player.resource_points;
  const cellKey = selectedCell ? `${selectedCell.q},${selectedCell.r}` : '';

  const canAfford = (actionType: PlayerActionType) => {
    return remaining[actionType] > 0 && resources >= ACTION_COSTS[actionType];
  };

  const isOwnCell = selectedCell?.owner_id === playerId;

  const executeAction = async (actionType: string) => {
    if (!selectedCell) return;
    setActionError(null);

    try {
      if (actionType === 'introduce_species' && selectedSpecies) {
        const action = {
          type: 'introduce_species' as const,
          cell: [selectedCell.q, selectedCell.r] as [number, number],
          species_id: selectedSpecies,
        };
        if (wsRef.current) {
          wsRef.current.sendAction(action);
        } else {
          await submitAction(gameState.id, playerId, action);
        }
      } else if (actionType === 'convert_habitat') {
        const action = {
          type: 'convert_habitat' as const,
          cell: [selectedCell.q, selectedCell.r] as [number, number],
          target_biome: selectedBiome,
        };
        if (wsRef.current) {
          wsRef.current.sendAction(action);
        } else {
          await submitAction(gameState.id, playerId, action);
        }
      } else if (actionType === 'set_hunting_quota' && selectedSpecies) {
        const action = {
          type: 'set_hunting_quota' as const,
          cell: [selectedCell.q, selectedCell.r] as [number, number],
          species_id: selectedSpecies,
          quota: parseInt(quotaValue) || 0,
        };
        if (wsRef.current) {
          wsRef.current.sendAction(action);
        } else {
          await submitAction(gameState.id, playerId, action);
        }
      } else if (actionType === 'protect_species' && selectedSpecies) {
        const action = {
          type: 'protect_species' as const,
          cell: [selectedCell.q, selectedCell.r] as [number, number],
          species_id: selectedSpecies,
        };
        if (wsRef.current) {
          wsRef.current.sendAction(action);
        } else {
          await submitAction(gameState.id, playerId, action);
        }
      } else if (actionType === 'bio_invasion' && selectedSpecies) {
        const action = {
          type: 'bio_invasion' as const,
          cell: [selectedCell.q, selectedCell.r] as [number, number],
          species_id: selectedSpecies,
        };
        if (wsRef.current) {
          wsRef.current.sendAction(action);
        } else {
          await submitAction(gameState.id, playerId, action);
        }
      } else if (actionType === 'directed_breeding' && selectedSpecies) {
        const enhanceGenes = breedGene2 !== null
          ? [breedGene1, breedGene2]
          : [breedGene1];
        const action = {
          type: 'directed_breeding' as const,
          cell: [selectedCell.q, selectedCell.r] as [number, number],
          species_id: selectedSpecies,
          enhance_genes: enhanceGenes,
        };
        if (wsRef.current) {
          wsRef.current.sendAction(action);
        } else {
          await submitAction(gameState.id, playerId, action);
        }
      }
      onRefresh();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  if (!selectedCell) {
    return <div style={styles.panel}><div style={styles.noCell}>Select a cell to perform actions</div></div>;
  }

  const cellPops = selectedCell.populations;
  const cellPopSpeciesIds = new Set(cellPops.map(p => p.species_id));
  const availableSpecies = gameState.species_catalog.filter(s => !cellPopSpeciesIds.has(s.id));
  const allSpeciesInCell = gameState.species_catalog.filter(s => cellPopSpeciesIds.has(s.id));

  return (
    <div style={styles.panel}>
      <div style={styles.group}>
        <span style={styles.groupLabel}>Introduce Species</span>
        <select
          style={styles.select}
          value={selectedSpecies}
          onChange={e => setSelectedSpecies(e.target.value)}
        >
          <option value="">Select species...</option>
          {availableSpecies.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.trophic_level})</option>
          ))}
        </select>
        <div style={styles.row}>
          <button
            style={{
              ...styles.btn,
              ...(canAfford('IntroduceSpecies') && selectedSpecies ? styles.btnEnabled : styles.btnDisabled),
            }}
            onClick={() => executeAction('introduce_species')}
            disabled={!canAfford('IntroduceSpecies') || !selectedSpecies}
          >
            Introduce
          </button>
          <span style={styles.cost}>💰 {ACTION_COSTS.IntroduceSpecies}</span>
          <span style={styles.remaining}>×{remaining.IntroduceSpecies}</span>
        </div>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.groupLabel}>Convert Habitat</span>
        <select
          style={styles.select}
          value={selectedBiome}
          onChange={e => setSelectedBiome(e.target.value as Biome)}
        >
          {BIOME_OPTIONS.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <div style={styles.row}>
          <button
            style={{
              ...styles.btn,
              ...(canAfford('HabitatConversion') && isOwnCell ? styles.btnWarn : styles.btnDisabled),
            }}
            onClick={() => executeAction('convert_habitat')}
            disabled={!canAfford('HabitatConversion') || !isOwnCell}
          >
            Convert
          </button>
          <span style={styles.cost}>💰 {ACTION_COSTS.HabitatConversion}</span>
          <span style={styles.remaining}>×{remaining.HabitatConversion}</span>
        </div>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.groupLabel}>Hunting Quota</span>
        <select
          style={styles.select}
          value={selectedSpecies}
          onChange={e => setSelectedSpecies(e.target.value)}
        >
          <option value="">Select species...</option>
          {allSpeciesInCell.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div style={styles.row}>
          <input
            style={styles.input}
            type="number"
            min="0"
            value={quotaValue}
            onChange={e => setQuotaValue(e.target.value)}
          />
          <button
            style={{
              ...styles.btn,
              ...(canAfford('HuntingQuota') && selectedSpecies ? styles.btnEnabled : styles.btnDisabled),
            }}
            onClick={() => executeAction('set_hunting_quota')}
            disabled={!canAfford('HuntingQuota') || !selectedSpecies}
          >
            Set Quota
          </button>
        </div>
        <span style={styles.remaining}>×{remaining.HuntingQuota} remaining</span>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.groupLabel}>Protect Species</span>
        <div style={styles.row}>
          <button
            style={{
              ...styles.btn,
              ...(canAfford('SpeciesProtection') && selectedSpecies ? styles.btnEnabled : styles.btnDisabled),
            }}
            onClick={() => executeAction('protect_species')}
            disabled={!canAfford('SpeciesProtection') || !selectedSpecies}
          >
            🛡 Protect
          </button>
          <span style={styles.cost}>💰 {ACTION_COSTS.SpeciesProtection}</span>
          <span style={styles.remaining}>×{remaining.SpeciesProtection}</span>
        </div>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.groupLabel}>Bio Invasion</span>
        <div style={styles.row}>
          <button
            style={{
              ...styles.btn,
              ...(canAfford('BioInvasion') && selectedSpecies ? styles.btnDanger : styles.btnDisabled),
            }}
            onClick={() => executeAction('bio_invasion')}
            disabled={!canAfford('BioInvasion') || !selectedSpecies}
          >
            ☣ Invasion
          </button>
          <span style={styles.cost}>💰 {ACTION_COSTS.BioInvasion}</span>
          <span style={styles.remaining}>×{remaining.BioInvasion}</span>
        </div>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <span style={styles.groupLabel}>Directed Breeding</span>
        <select
          style={{ ...styles.select, minWidth: '120px' }}
          value={selectedSpecies}
          onChange={e => setSelectedSpecies(e.target.value)}
        >
          <option value="">Select species...</option>
          {allSpeciesInCell.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div style={styles.row}>
          <select
            style={{ ...styles.select, fontSize: '10px', padding: '4px 6px' }}
            value={breedGene1}
            onChange={e => setBreedGene1(parseInt(e.target.value))}
          >
            {GENE_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
          <select
            style={{ ...styles.select, fontSize: '10px', padding: '4px 6px', width: '50px' }}
            value={breedGene2 === null ? '' : breedGene2}
            onChange={e => setBreedGene2(e.target.value === '' ? null : parseInt(e.target.value))}
          >
            <option value="">(none)</option>
            {GENE_NAMES.map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        </div>
        <div style={styles.row}>
          <button
            style={{
              ...styles.btn,
              ...(canAfford('DirectedBreeding') && selectedSpecies && isOwnCell ? styles.btnWarn : styles.btnDisabled),
            }}
            onClick={() => executeAction('directed_breeding')}
            disabled={!canAfford('DirectedBreeding') || !selectedSpecies || !isOwnCell}
          >
            &#x2692; Breed
          </button>
          <span style={styles.cost}>💰 {ACTION_COSTS.DirectedBreeding}</span>
          <span style={styles.remaining}>×{remaining.DirectedBreeding || 0}</span>
        </div>
      </div>

      {actionError && (
        <div style={{ fontSize: '11px', color: '#e74c3c', alignSelf: 'center' }}>
          {actionError}
        </div>
      )}
    </div>
  );
}
