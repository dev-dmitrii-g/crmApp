import type { CSSProperties } from 'react';

export const c = {
  bgBase:    '#0c0c0e',
  bgCard:    '#18181b',
  bgElevated:'#212125',
  bgHover:   '#1d1d21',
  bgInput:   '#0f0f13',
  border:    'rgba(255,255,255,0.07)',
  borderMd:  'rgba(255,255,255,0.11)',
  borderFocus:'rgba(255,255,255,0.24)',
  text1: '#f0f0f0',
  text2: '#8a8a8a',
  text3: '#4a4a4f',
  blue:   '#3b82f6',
  green:  '#10b981',
  purple: '#8b5cf6',
  red:    '#ef4444',
  amber:  '#f59e0b',
  teal:   '#14b8a6',
} as const;

export const dotGrid: CSSProperties = {
  backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

export const card: CSSProperties = {
  background: c.bgCard,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
};

export const inp = (override?: CSSProperties): CSSProperties => ({
  padding: '8px 11px',
  background: c.bgInput,
  border: `1px solid ${c.border}`,
  borderRadius: 8,
  color: c.text1,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
  ...override,
});

export const btn = (bg: string, override?: CSSProperties): CSSProperties => ({
  padding: '6px 14px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
  ...override,
});

export const sectionTitle = (label: string) =>
  `${label}`;
