import React from 'react';

interface Props {
    size?: number;
    color?: string;
}

export const Spinner: React.FC<Props> = ({ size = 14, color = 'currentColor' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ animation: 'spin 0.65s linear infinite', flexShrink: 0 }}
    >
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" strokeDasharray="45 15" strokeLinecap="round" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
);
