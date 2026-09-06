import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Spinner } from '../ui/Spinner';
import type { Analytics, FunnelResponse, ManagerStat, FinancialResponse } from '../../types';
import { c } from '../../theme';

interface Props {
    analytics: Analytics | null;
}

type Tab = 'funnel' | 'managers' | 'finance' | 'log';

const fmt = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M'
    : n >= 1_000 ? (n / 1_000).toFixed(0) + 'k'
    : n.toFixed(0);

const fmtHours = (h: number) =>
    h < 1 ? '< 1 ч' : h < 24 ? `${h.toFixed(1)} ч` : `${(h / 24).toFixed(1)} д`;

export const AnalyticsDashboard: React.FC<Props> = ({ analytics }) => {
    const [tab, setTab] = useState<Tab>('funnel');
    const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
    const [managers, setManagers] = useState<ManagerStat[] | null>(null);
    const [finance, setFinance] = useState<FinancialResponse | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                if (tab === 'funnel' && !funnel) {
                    const r = await api.get<FunnelResponse>('/analytics/funnel');
                    setFunnel(r.data);
                } else if (tab === 'managers' && !managers) {
                    const r = await api.get<ManagerStat[]>('/analytics/managers');
                    setManagers(r.data || []);
                } else if (tab === 'finance' && !finance) {
                    const r = await api.get<FinancialResponse>('/analytics/finance');
                    setFinance(r.data);
                }
            } catch { /* ignore */ }
            finally { setLoading(false); }
        };
        void load();
    }, [tab]);

    const tabs: { key: Tab; label: string }[] = [
        { key: 'funnel', label: 'Воронка' },
        { key: 'managers', label: 'Менеджеры' },
        { key: 'finance', label: 'Финансы' },
        { key: 'log', label: 'Журнал' },
    ];

    const metricCards = analytics ? [
        { label: 'Всего клиентов', value: analytics.metrics.total_clients, color: c.blue },
        { label: 'Завершённых сделок', value: analytics.metrics.done_clients, color: c.green },
        { label: 'Всего сообщений', value: analytics.metrics.total_messages, color: c.amber },
        { label: 'Исходящих', value: analytics.metrics.outgoing_messages, color: c.purple },
    ] : [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top metric cards */}
            {analytics && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
                    {metricCards.map(m => (
                        <div key={m.label} style={{ background: `${m.color}12`, border: `1px solid ${m.color}28`, borderRadius: 12, padding: '16px 18px' }}>
                            <div style={{ fontSize: 26, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                            <div style={{ fontSize: 11, color: c.text2, marginTop: 5 }}>{m.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${c.border}` }}>
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding: '8px 16px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                        fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                        background: tab === t.key ? c.bgElevated : 'transparent',
                        color: tab === t.key ? c.text1 : c.text3,
                        borderBottom: tab === t.key ? `2px solid ${c.blue}` : '2px solid transparent',
                    }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                    <Spinner size={20} />
                </div>
            )}

            {/* ── Funnel tab ── */}
            {!loading && tab === 'funnel' && funnel && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Summary */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        {[
                            { label: 'Всего сделок', v: funnel.total_clients, color: c.text1 },
                            { label: 'Выиграно', v: funnel.won_clients, color: c.green },
                            { label: 'Проиграно', v: funnel.lost_clients, color: '#f87171' },
                            { label: 'Конверсия', v: funnel.total_clients > 0 ? ((funnel.won_clients / funnel.total_clients) * 100).toFixed(1) + '%' : '—', color: c.blue },
                        ].map(m => (
                            <div key={m.label} style={{ flex: 1, background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 16px' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.v}</div>
                                <div style={{ fontSize: 11, color: c.text3, marginTop: 3 }}>{m.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Stage bars */}
                    <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '180px 80px 140px 120px 100px', padding: '8px 16px', background: 'rgba(255,255,255,0.03)', fontSize: 10, fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.06em', gap: 8 }}>
                            <span>Этап</span><span>Кол-во</span><span>Доля</span><span>Ср. время</span><span>Объём</span>
                        </div>
                        {funnel.stages.map(s => (
                            <div key={s.code} style={{ display: 'grid', gridTemplateColumns: '180px 80px 140px 120px 100px', padding: '10px 16px', borderTop: `1px solid ${c.border}`, alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: 13, color: c.text1, fontWeight: 500 }}>{s.name}</span>
                                    {s.is_success && <span style={{ fontSize: 9, background: 'rgba(16,185,129,0.15)', color: c.green, padding: '1px 5px', borderRadius: 4 }}>WIN</span>}
                                    {s.is_fail && <span style={{ fontSize: 9, background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '1px 5px', borderRadius: 4 }}>LOSS</span>}
                                </div>
                                <span style={{ fontSize: 14, fontWeight: 700, color: c.text1 }}>{s.count}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${s.pct_of_total}%`, height: '100%', background: s.color, borderRadius: 3 }} />
                                    </div>
                                    <span style={{ fontSize: 12, color: c.text2, minWidth: 36 }}>{s.pct_of_total.toFixed(1)}%</span>
                                </div>
                                <span style={{ fontSize: 12, color: c.text2 }}>{s.avg_hours > 0 ? fmtHours(s.avg_hours) : '—'}</span>
                                <span style={{ fontSize: 12, color: c.text2 }}>{s.amount > 0 ? fmt(s.amount) : '—'}</span>
                            </div>
                        ))}
                    </div>

                    {/* Loss reasons */}
                    {funnel.loss_reasons.length > 0 && (
                        <div>
                            <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Причины отказа</p>
                            <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                                {funnel.loss_reasons.map((lr, i) => {
                                    const max = funnel.loss_reasons[0]?.count || 1;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none' }}>
                                            <span style={{ flex: '0 0 160px', fontSize: 13, color: c.text1 }}>{lr.reason}</span>
                                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                                <div style={{ width: `${(lr.count / max) * 100}%`, height: '100%', background: '#f87171', borderRadius: 3 }} />
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: c.text2, minWidth: 24 }}>{lr.count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Managers tab ── */}
            {!loading && tab === 'managers' && managers && (
                <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    {['Менеджер', 'Сделки', 'Актив.', 'Выиграно', 'Проиграно', 'Win Rate', 'Сообщений', 'Просрочено'].map(h => (
                                        <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: c.text3, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {managers.map((m) => (
                                    <tr key={m.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                        <td style={{ padding: '10px 14px', fontWeight: 600, color: c.text1 }}>{m.name}</td>
                                        <td style={{ padding: '10px 14px', color: c.text2 }}>{m.total_deals}</td>
                                        <td style={{ padding: '10px 14px', color: c.amber }}>{m.active_deals}</td>
                                        <td style={{ padding: '10px 14px', color: c.green, fontWeight: 600 }}>{m.won_deals}</td>
                                        <td style={{ padding: '10px 14px', color: '#f87171' }}>{m.lost_deals}</td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{
                                                background: m.win_rate >= 50 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                                                color: m.win_rate >= 50 ? c.green : c.amber,
                                                padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                            }}>
                                                {m.win_rate.toFixed(0)}%
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: c.text2 }}>{m.messages_sent}</td>
                                        <td style={{ padding: '10px 14px' }}>
                                            {m.overdue_tasks > 0
                                                ? <span style={{ color: '#f87171', fontWeight: 600 }}>{m.overdue_tasks} ⚠</span>
                                                : <span style={{ color: c.text3 }}>—</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                                {managers.length === 0 && (
                                    <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: c.text3 }}>Нет данных</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Finance tab ── */}
            {!loading && tab === 'finance' && finance && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {finance.amount_field !== 'amount' && (
                        <p style={{ margin: 0, fontSize: 12, color: c.text3 }}>
                            Используется поле «{finance.amount_field}» (первое числовое поле)
                        </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                        {[
                            { label: 'Объём пайплайна', v: `${fmt(finance.pipeline_value)} ₽`, color: c.blue, desc: 'Все активные сделки' },
                            { label: 'Выиграно', v: `${fmt(finance.won_value)} ₽`, color: c.green, desc: `${finance.won_deals} выигранных сделок` },
                            { label: 'Средний чек (AOV)', v: `${fmt(finance.avg_deal)} ₽`, color: c.purple, desc: 'По всем активным' },
                            { label: 'Конверсия', v: `${finance.conversion_rate.toFixed(1)}%`, color: c.amber, desc: `${finance.won_deals} из ${finance.won_deals + finance.lost_deals} закрытых` },
                        ].map(m => (
                            <div key={m.label} style={{ background: `${m.color}10`, border: `1px solid ${m.color}28`, borderRadius: 14, padding: '20px 22px' }}>
                                <div style={{ fontSize: 26, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.v}</div>
                                <div style={{ fontSize: 13, color: c.text1, marginTop: 6, fontWeight: 600 }}>{m.label}</div>
                                <div style={{ fontSize: 11, color: c.text3, marginTop: 3 }}>{m.desc}</div>
                            </div>
                        ))}
                    </div>

                    {/* Pipeline bar */}
                    {finance.pipeline_value > 0 && finance.won_value >= 0 && (
                        <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, padding: 20 }}>
                            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: c.text2 }}>Структура пайплайна</p>
                            <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', background: 'rgba(239,68,68,0.15)', display: 'flex' }}>
                                <div style={{ width: `${finance.pipeline_value > 0 ? (finance.won_value / finance.pipeline_value) * 100 : 0}%`, background: c.green, transition: 'width 0.5s' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                                <span style={{ color: c.green }}>■ Выиграно: {fmt(finance.won_value)} ₽</span>
                                <span style={{ color: '#f87171' }}>■ Активно/потеряно: {fmt(finance.pipeline_value - finance.won_value)} ₽</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Log tab ── */}
            {!loading && tab === 'log' && (
                <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {(analytics?.recent_activity || []).map((log, i, arr) => (
                            <div key={log.id} style={{ padding: '10px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <div style={{ fontSize: 13 }}>
                                        <span style={{ color: c.blue, fontWeight: 600 }}>{log.user_name}</span>
                                        <span style={{ color: c.text1 }}> {log.action}</span>
                                        {log.details && <span style={{ color: c.text3 }}> — {log.details}</span>}
                                    </div>
                                    <span style={{ fontSize: 11, color: c.text3, flexShrink: 0, marginLeft: 12, whiteSpace: 'nowrap' }}>{log.timestamp}</span>
                                </div>
                                {(log.old_value || log.new_value) && (
                                    <div style={{ fontSize: 11, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {log.old_value && <span style={{ color: '#f87171', background: 'rgba(239,68,68,0.08)', padding: '1px 6px', borderRadius: 4 }}>{log.old_value}</span>}
                                        {log.old_value && log.new_value && <span style={{ color: c.text3 }}>→</span>}
                                        {log.new_value && <span style={{ color: c.green, background: 'rgba(16,185,129,0.08)', padding: '1px 6px', borderRadius: 4 }}>{log.new_value}</span>}
                                    </div>
                                )}
                            </div>
                        ))}
                        {!analytics?.recent_activity?.length && (
                            <p style={{ padding: 20, color: c.text3, textAlign: 'center', margin: 0 }}>Нет событий</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
