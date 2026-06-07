import React, { useState, useEffect } from 'react';
import { ClimateState, ClimateEvent, CLIMATE_ICONS } from '../types';

interface ClimateAlertProps {
  climate: ClimateState;
  currentTurn: number;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 20,
    pointerEvents: 'none',
  },
  alert: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px',
    borderRadius: '8px',
    backdropFilter: 'blur(8px)',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    animation: 'fadeIn 0.3s ease',
  },
  activeAlert: {
    background: 'rgba(231, 76, 60, 0.25)',
    border: '1px solid rgba(231, 76, 60, 0.5)',
    color: '#e74c3c',
  },
  warningAlert: {
    background: 'rgba(243, 156, 18, 0.2)',
    border: '1px solid rgba(243, 156, 18, 0.4)',
    color: '#f39c12',
  },
  icon: {
    fontSize: '18px',
  },
  countdown: {
    fontSize: '11px',
    opacity: 0.8,
    fontWeight: 400,
  },
  label: {
    fontSize: '11px',
    opacity: 0.6,
    fontWeight: 400,
  },
};

function getEventLabel(event: ClimateEvent): string {
  switch (event.type) {
    case 'Drought': return 'Drought';
    case 'Flood': return 'Flood';
    case 'Fire': return 'Wildfire';
    case 'PestOutbreak': return `Pest Outbreak (${event.target_trophic || 'All'})`;
    default: return 'Unknown';
  }
}

export default function ClimateAlert({ climate, currentTurn }: ClimateAlertProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
  }, [climate.active_events, climate.warning_events]);

  if (!visible) return null;
  if (climate.active_events.length === 0 && climate.warning_events.length === 0) return null;

  return (
    <div style={styles.container}>
      {climate.active_events.map((event, i) => (
        <div key={`active-${i}`} style={{ ...styles.alert, ...styles.activeAlert }}>
          <span style={styles.icon}>{CLIMATE_ICONS[event.type] || '⚡'}</span>
          <span>{getEventLabel(event)}</span>
          <span style={styles.label}>ACTIVE</span>
        </div>
      ))}

      {climate.warning_events.map((event, i) => {
        const turnsUntil = climate.next_event_turn - currentTurn;
        return (
          <div key={`warn-${i}`} style={{ ...styles.alert, ...styles.warningAlert }}>
            <span style={styles.icon}>{CLIMATE_ICONS[event.type] || '⚠️'}</span>
            <span>{getEventLabel(event)}</span>
            {turnsUntil > 0 && (
              <span style={styles.countdown}>in {turnsUntil} turn{turnsUntil > 1 ? 's' : ''}</span>
            )}
            <span style={styles.label}>WARNING</span>
          </div>
        );
      })}
    </div>
  );
}
