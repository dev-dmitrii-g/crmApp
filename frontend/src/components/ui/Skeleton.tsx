import React from 'react';

interface Props {
    width?: string | number;
    height?: string | number;
    borderRadius?: number;
    style?: React.CSSProperties;
}

export const Skeleton: React.FC<Props> = ({ width = '100%', height = 16, borderRadius = 6, style }) => (
    <div
        aria-hidden="true"
        style={{
            width, height, borderRadius,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
            flexShrink: 0,
            ...style,
        }}
    />
);

export const SkeletonCard: React.FC = () => (
    <div style={{ background: '#212125', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width="60%" height={13} />
        <Skeleton width="40%" height={11} />
        <style>{`@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }`}</style>
    </div>
);

export const SkeletonColumn: React.FC = () => (
    <div style={{ flex: '0 0 272px', background: '#18181b', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', background: '#212125', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Skeleton width={8} height={8} borderRadius={99} />
            <Skeleton width="50%" height={12} />
        </div>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[80, 60, 70].map((w, i) => (
                <div key={i} style={{ background: '#212125', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton width={`${w}%`} height={13} />
                    <Skeleton width="40%" height={11} />
                </div>
            ))}
        </div>
        <style>{`@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }`}</style>
    </div>
);
