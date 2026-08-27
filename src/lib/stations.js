// Geographic-proportional station points, Barrie Line north (Allandale) -> south (Union)
export const STATIONS = [
  { id: 'allandale', name: 'Allandale Waterfront', x: 120, y: 40, isTerminal: true },
  { id: 'barrie_south', name: 'Barrie South', x: 165, y: 90 },
  { id: 'bradford', name: 'Bradford', x: 175, y: 220 },
  { id: 'east_gwillimbury', name: 'East Gwillimbury', x: 235, y: 280 },
  { id: 'newmarket', name: 'Newmarket', x: 230, y: 340 },
  { id: 'aurora', name: 'Aurora', x: 230, y: 400 },
  { id: 'king_city', name: 'King City', x: 195, y: 460 },
  { id: 'maple', name: 'Maple', x: 200, y: 520 },
  { id: 'rutherford', name: 'Rutherford', x: 210, y: 570 },
  { id: 'downsview_park', name: 'Downsview Park', x: 220, y: 640 },
  { id: 'union', name: 'Union Station', x: 240, y: 720, isTerminal: true },
];

export const RAIL_PATH =
  'M 120,40 Q 150,65 165,90 L 175,220 Q 185,260 235,280 L 230,340 L 230,400 Q 200,430 195,460 L 200,520 L 210,570 Q 215,610 220,640 L 240,720';
