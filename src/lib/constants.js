// Mirrors the strict enums on go_train_delays.incident_type / .status
export const INCIDENT_TYPES = [
  'signal',
  'track_work',
  'mechanical',
  'equipment',
  'weather',
  'medical',
  'police',
  'collision',
  'switch',
  'operational',
  'other',
];

export const INCIDENT_TYPE_LABELS = {
  signal: 'Signal',
  track_work: 'Track Work',
  mechanical: 'Mechanical',
  equipment: 'Equipment',
  weather: 'Weather',
  medical: 'Medical Emergency',
  police: 'Police Activity',
  collision: 'Collision',
  switch: 'Switch Issue',
  operational: 'Operational',
  other: 'Other',
};

export const STATUS_LABELS = {
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  modified: 'Modified',
  resolved: 'Resolved',
  advisory: 'Advisory',
};

export const DIRECTION_LABELS = {
  Northbound: 'NB',
  Southbound: 'SB',
};

export function directionLabel(direction) {
  if (!direction) return null;
  return DIRECTION_LABELS[direction] || direction.slice(0, 2).toUpperCase();
}

export function incidentTypeLabel(type) {
  return INCIDENT_TYPE_LABELS[type] || type || 'Unknown';
}

export function isRushHour(commutePeriod) {
  return typeof commutePeriod === 'string' && commutePeriod.toUpperCase().includes('PEAK');
}
