
export const DAYS_OF_WEEK = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
export const VR_SLOTS_COUNT = 6;
export const ROW_HEIGHT_PX = 128; // 28px (Bannière) + 100px (Contenu)

export const STATUS_CONFIG: Record<string, { label: string; color: string; border: string; bg: string }> = {
  'NON PLANIFIE': { label: 'NON PLANIFIE', color: 'text-slate-500', border: 'border-slate-300', bg: 'bg-slate-100' },
  'PLANIFIE': { label: 'PLANIFIE', color: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' },
  'EN COURS': { label: 'EN COURS', color: 'text-orange-600', border: 'border-orange-200', bg: 'bg-orange-50' },
  'LIVRE': { label: 'LIVRE', color: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  'LIVRE NON TERMINE': { label: 'LIVRE NON TERMINE', color: 'text-rose-600', border: 'border-rose-200', bg: 'bg-rose-50' },
  'FACTURE': { label: 'FACTURE', color: 'text-purple-600', border: 'border-purple-200', bg: 'bg-purple-50' },
  'PAYE': { label: 'PAYE', color: 'text-slate-600', border: 'border-slate-200', bg: 'bg-slate-100' },
  'ANNULE': { label: 'ANNULE', color: 'text-rose-900', border: 'border-rose-300', bg: 'bg-rose-100/50' }
};

export const CATEGORY_COLORS = {
  header: 'bg-[#0f172a]',
  summary: 'bg-blue-100',
  appointment: 'bg-pink-500',
  vr: 'bg-[#fbbf24]',
  border: 'border-slate-700'
};

export const FRENCH_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': "Jour de l'An",
  '2026-04-06': "Lundi de Pâques",
  '2026-05-01': "Fête du Travail",
  '2026-05-08': "Victoire 1945",
  '2026-05-14': "Ascension",
  '2026-05-25': "Lundi de Pentecôte",
  '2026-07-14': "Fête Nationale",
  '2026-08-15': "Assomption",
  '2026-11-01': "Toussaint",
  '2026-11-11': "Armistice 1918",
  '2026-12-25': "Noël"
};
