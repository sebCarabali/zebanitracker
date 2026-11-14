type P = { size?: number; className?: string };

const base = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const PlayIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
);
export const PlusIcon = ({ size }: P) => <svg {...base(size)} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>;
export const SearchIcon = ({ size }: P) => <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const BackIcon = ({ size }: P) => <svg {...base(size)}><path d="m15 18-6-6 6-6" /></svg>;
export const CheckIcon = ({ size }: P) => <svg {...base(size)} strokeWidth={2.4}><path d="M20 6 9 17l-5-5" /></svg>;
export const TagIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
);
export const RefreshIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" /></svg>
);
export const StarIcon = ({ size = 20, filled }: P & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
  </svg>
);

export const SEASON_ICONS: Record<string, string> = {
  '': 'M4 12h16M12 4v16',
  WINTER: 'M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9',
  SPRING: 'M12 22c0-6 4-10 9-11-1 6-4 10-9 11zM12 22C12 16 8 12 3 11c1 6 4 10 9 11z',
  SUMMER: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M1 12h2M21 12h2',
  FALL: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14zM5 19l7-7',
};
export const SeasonIcon = ({ season, size = 14 }: { season: string; size?: number }) => (
  <svg {...base(size)}><path d={SEASON_ICONS[season] ?? SEASON_ICONS['']} /></svg>
);
