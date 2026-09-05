import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ToastCtx {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
}

const Ctx = createContext<ToastCtx>({ success: () => {}, error: () => {}, info: () => {} });

export const useToast = () => useContext(Ctx);

const CONFIG: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
    success: {
        bg: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.3)',
        icon: <CheckCircle2 size={15} color="#10b981" strokeWidth={2} />,
    },
    error: {
        bg: 'rgba(239,68,68,0.12)',
        border: 'rgba(239,68,68,0.3)',
        icon: <XCircle size={15} color="#ef4444" strokeWidth={2} />,
    },
    info: {
        bg: 'rgba(59,130,246,0.12)',
        border: 'rgba(59,130,246,0.3)',
        icon: <Info size={15} color="#3b82f6" strokeWidth={2} />,
    },
};

const DURATION = 3500;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const add = useCallback((message: string, type: ToastType) => {
        const id = Date.now() + Math.random();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), DURATION);
    }, []);

    const remove = (id: number) => setToasts(t => t.filter(x => x.id !== id));

    const ctx: ToastCtx = {
        success: (msg) => add(msg, 'success'),
        error: (msg) => add(msg, 'error'),
        info: (msg) => add(msg, 'info'),
    };

    return (
        <Ctx.Provider value={ctx}>
            {children}
            {/* Toast container */}
            <div
                aria-live="polite"
                aria-atomic="false"
                style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999,
                    pointerEvents: 'none', alignItems: 'center',
                }}
            >
                {toasts.map(t => {
                    const cfg = CONFIG[t.type];
                    return (
                        <div
                            key={t.id}
                            role="alert"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px', borderRadius: 10,
                                background: '#1e1e22', border: `1px solid ${cfg.border}`,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                fontSize: 13, color: '#f0f0f0', minWidth: 260, maxWidth: 420,
                                pointerEvents: 'all',
                                animation: 'toastIn 0.2s ease',
                            }}
                        >
                            {cfg.icon}
                            <span style={{ flex: 1 }}>{t.message}</span>
                            <button
                                onClick={() => remove(t.id)}
                                aria-label="Закрыть уведомление"
                                style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', padding: 2, borderRadius: 4, color: '#6b6b70', flexShrink: 0 }}
                            >
                                <X size={13} strokeWidth={2} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <style>{`
                @keyframes toastIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </Ctx.Provider>
    );
};
