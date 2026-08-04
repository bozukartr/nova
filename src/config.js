/* NOVA · Kritik Kütle — sabitler ve ayar tanımları */

export const SIDES = {
  1: { id: 1, name: 'MAGMA',  rgb: [255, 59, 92],  css: '#FF3B5C' },
  2: { id: 2, name: 'AURORA', rgb: [61, 245, 192], css: '#3DF5C0' }
};

/** Çekirdeğin komşuya yolculuk süresi (ms). Zincir ritmini bu belirler. */
export const TRAVEL_MS = 175;
/** Komşuya düştükten sonraki nefes payı (ms). */
export const SETTLE_MS = 55;

/** Tahta seçenekleri — hepsi dikey telefon oranına göre ayarlı. */
export const BOARDS = [
  { key: 's', label: '5×4', rows: 5, cols: 4 },
  { key: 'm', label: '6×5', rows: 6, cols: 5 },
  { key: 'l', label: '8×6', rows: 8, cols: 6 }
];

/** Maç uzunluğu (kaç tur kazanan maçı alır). */
export const SERIES = [
  { key: 1, label: 'TEK' },
  { key: 3, label: 'İLK 3' },
  { key: 5, label: 'İLK 5' }
];

/** AI seviyeleri. -1 = iki oyuncu, tek telefon. */
export const AI_OFF = -1;
export const LEVELS = [
  { level: 0, label: 'KOLAY',  desc: 'Acemi rakip, hata yapar',      depth: 1, width: 12, noise: 0.42, budget: 30  },
  { level: 1, label: 'NORMAL', desc: 'Dengeli, fırsat kollar',       depth: 2, width: 10, noise: 0.10, budget: 60  },
  { level: 2, label: 'ZOR',    desc: 'Derin arama, affetmez',        depth: 4, width: 8,  noise: 0.00, budget: 160 }
];

/** AI hangi tarafı oynar. */
export const AI_SIDE = 2;

export const DEFAULTS = {
  level: AI_OFF,
  board: 'm',
  series: 3,
  sound: true,
  haptics: true
};

export const STORE_KEY = 'nova.kritikkutle.v1';
