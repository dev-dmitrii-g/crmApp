import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { QRCodeSVG } from 'qrcode.react';
import {
    GitBranch, LayoutGrid, Users, MessageCircle, BarChart2,
    CheckCircle2, UserPlus,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import type { Stage, Manager, Analytics, FieldDefinition, FieldStageVisibility } from '../../types';
import { StageManager } from './StageManager';
import { FieldConstructor } from './FieldConstructor';
import { c, inp, btn } from '../../theme';

interface Props {
    stages: Stage[];
    fieldDefinitions: FieldDefinition[];
    fieldVisibility: FieldStageVisibility[];
    managers: Manager[];
    analytics: Analytics | null;
    onRefresh: () => void;
    onWAConnected: () => void;
}

type Section = 'pipeline' | 'fields' | 'team' | 'whatsapp' | 'analytics';

const NAV: { key: Section; Icon: React.FC<{ size?: number; strokeWidth?: number }>; label: string }[] = [
    { key: 'pipeline', Icon: GitBranch, label: 'Воронка продаж' },
    { key: 'fields', Icon: LayoutGrid, label: 'Поля карточки' },
    { key: 'team', Icon: Users, label: 'Сотрудники' },
    { key: 'whatsapp', Icon: MessageCircle, label: 'WhatsApp' },
    { key: 'analytics', Icon: BarChart2, label: 'Аналитика' },
];

export const AdminPanel: React.FC<Props> = ({
    stages, fieldDefinitions, fieldVisibility, managers, analytics, onRefresh, onWAConnected,
}) => {
    const toast = useToast();
    const [section, setSection] = useState<Section>('pipeline');

    const [newMgrName, setNewMgrName] = useState('');
    const [newMgrEmail, setNewMgrEmail] = useState('');
    const [newMgrPass, setNewMgrPass] = useState('');
    const [savingManager, setSavingManager] = useState(false);

    const [qrCode, setQrCode] = useState('');
    const [waStatus, setWaStatus] = useState<'idle' | 'checking' | 'connecting' | 'connected'>('idle');

    // Check WA status when the WhatsApp section is opened
    useEffect(() => {
        if (section !== 'whatsapp') return;
        setWaStatus('checking');
        api.get<{ connected: boolean }>('/whatsapp/status')
            .then(r => { setWaStatus(r.data.connected ? 'connected' : 'idle'); })
            .catch(() => { setWaStatus('idle'); });
    }, [section]);

    const handleCreateManager = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingManager(true);
        try {
            await api.post('/admin/managers', { name: newMgrName, email: newMgrEmail, password: newMgrPass });
            toast.success(`Сотрудник «${newMgrName}» создан`);
            setNewMgrName(''); setNewMgrEmail(''); setNewMgrPass('');
            onRefresh();
        } catch { toast.error('Ошибка при создании — такой email уже занят'); }
        finally { setSavingManager(false); }
    };

    const connectWA = () => {
        setWaStatus('connecting');
        setQrCode('');
        const ws = new WebSocket(`ws://localhost:8080/api/ws/whatsapp/qr?token=${localStorage.getItem('token')}`);
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data as string) as { type?: string; code?: string; status?: string };
            if (data.type === 'qr' && data.code) setQrCode(data.code);
            if (data.status === 'connected') {
                setWaStatus('connected');
                onWAConnected();
            }
        };
        ws.onerror = () => setWaStatus('idle');
    };

    const metricCards = analytics ? [
        { label: 'Всего клиентов', value: analytics.metrics.total_clients, color: c.blue, bg: 'rgba(59,130,246,0.08)' },
        { label: 'Завершённых сделок', value: analytics.metrics.done_clients, color: c.green, bg: 'rgba(16,185,129,0.08)' },
        { label: 'Всего сообщений', value: analytics.metrics.total_messages, color: c.amber, bg: 'rgba(245,158,11,0.08)' },
        { label: 'Исходящих', value: analytics.metrics.outgoing_messages, color: c.purple, bg: 'rgba(139,92,246,0.08)' },
    ] : [];

    return (
        <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
            {/* ── Sidebar ── */}
            <aside style={{
                width: 220, flexShrink: 0, borderRight: `1px solid ${c.border}`,
                background: c.bgCard, display: 'flex', flexDirection: 'column',
                padding: '16px 10px',
            }}>
                <p style={{ fontSize: 11, color: c.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 8px', marginBottom: 8 }}>
                    Настройки
                </p>
                {NAV.map(({ key, Icon, label }) => {
                    const active = section === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setSection(key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '9px 12px', border: 'none', borderRadius: 9, cursor: 'pointer',
                                background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                                color: active ? c.blue : c.text2,
                                fontSize: 13, fontWeight: active ? 600 : 400,
                                textAlign: 'left', width: '100%',
                                transition: 'all 0.15s',
                            }}
                        >
                            <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                            {label}
                        </button>
                    );
                })}
            </aside>

            {/* ── Main content ── */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '24px 28px' }}>

                {section === 'pipeline' && (
                    <PanelSection title="Воронка продаж" desc="Управляйте этапами, правилами переходов и причинами отказа">
                        <StageManager stages={stages} onRefresh={onRefresh} />
                    </PanelSection>
                )}

                {section === 'fields' && (
                    <PanelSection title="Поля карточки" desc="Создавайте кастомные поля и настраивайте их видимость на каждом этапе">
                        <FieldConstructor
                            stages={stages}
                            fieldDefinitions={fieldDefinitions}
                            fieldVisibility={fieldVisibility}
                            onRefresh={onRefresh}
                        />
                    </PanelSection>
                )}

                {section === 'team' && (
                    <PanelSection title="Сотрудники" desc="Добавляйте менеджеров и управляйте доступом">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
                            <Card>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                {['ID', 'Имя', 'Email', 'Роль'].map(h => <Th key={h}>{h}</Th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {managers.map(m => (
                                                <tr key={m.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                                    <Td dim>{m.id}</Td>
                                                    <Td><strong style={{ color: c.text1 }}>{m.name}</strong></Td>
                                                    <Td dim>{m.email}</Td>
                                                    <Td>
                                                        <span style={{
                                                            background: m.role === 'admin' ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.06)',
                                                            color: m.role === 'admin' ? c.blue : c.text2,
                                                            padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                                        }}>{m.role}</span>
                                                    </Td>
                                                </tr>
                                            ))}
                                            {managers.length === 0 && (
                                                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: c.text3 }}>Нет сотрудников</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>

                            <Card>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                                    <UserPlus size={16} color={c.text2} strokeWidth={1.8} />
                                    <span style={{ fontWeight: 700, fontSize: 15, color: c.text1 }}>Добавить сотрудника</span>
                                </div>
                                <form onSubmit={e => { void handleCreateManager(e); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <FormField label="Имя">
                                        <input placeholder="Иван Иванов" value={newMgrName} onChange={e => setNewMgrName(e.target.value)} style={inp()} required disabled={savingManager} />
                                    </FormField>
                                    <FormField label="Email">
                                        <input type="email" placeholder="ivan@company.ru" value={newMgrEmail} onChange={e => setNewMgrEmail(e.target.value)} style={inp()} required disabled={savingManager} />
                                    </FormField>
                                    <FormField label="Пароль">
                                        <input type="password" placeholder="Минимум 6 символов" value={newMgrPass} onChange={e => setNewMgrPass(e.target.value)} style={inp()} required minLength={6} disabled={savingManager} />
                                    </FormField>
                                    <button type="submit" disabled={savingManager} aria-busy={savingManager}
                                        style={{ ...btn(c.green, { padding: '10px', fontWeight: 700, borderRadius: 9, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }), opacity: savingManager ? 0.6 : 1, cursor: savingManager ? 'default' : 'pointer' }}>
                                        {savingManager ? <Spinner size={14} color="#fff" /> : null}
                                        Создать сотрудника
                                    </button>
                                </form>
                            </Card>
                        </div>
                    </PanelSection>
                )}

                {section === 'whatsapp' && (
                    <PanelSection title="WhatsApp" desc="Привяжите аккаунт для получения и отправки сообщений">
                        <Card style={{ maxWidth: 460 }}>
                            {waStatus === 'checking' ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '32px 0', color: c.text2, fontSize: 13 }}>
                                    <Spinner size={18} /> Проверка статуса...
                                </div>
                            ) : waStatus === 'connected' ? (
                                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                    <CheckCircle2 size={48} color={c.green} strokeWidth={1.5} style={{ marginBottom: 12 }} />
                                    <p style={{ color: c.green, fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>WhatsApp подключён</p>
                                    <p style={{ color: c.text2, fontSize: 13, margin: 0 }}>Аккаунт привязан и готов к работе</p>
                                    <button
                                        onClick={() => setWaStatus('idle')}
                                        style={{ ...btn('rgba(255,255,255,0.06)', { border: `1px solid ${c.border}`, color: c.text2, marginTop: 16, padding: '7px 20px' }) }}
                                    >
                                        Переподключить
                                    </button>
                                </div>
                            ) : waStatus === 'connecting' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div>
                                        <p style={{ color: c.text1, fontWeight: 600, margin: '0 0 4px' }}>Шаг 1 — Откройте WhatsApp на телефоне</p>
                                        <p style={{ color: c.text2, fontSize: 13, margin: 0 }}>Настройки → Связанные устройства → Привязать устройство</p>
                                    </div>
                                    <div>
                                        <p style={{ color: c.text1, fontWeight: 600, margin: '0 0 12px' }}>Шаг 2 — Отсканируйте QR-код</p>
                                        <div style={{ display: 'flex', justifyContent: 'center', padding: 20, background: '#fff', borderRadius: 12 }}>
                                            {qrCode
                                                ? <QRCodeSVG value={qrCode} size={220} />
                                                : <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13 }}>Генерация QR...</div>
                                            }
                                        </div>
                                    </div>
                                    <button onClick={() => setWaStatus('idle')} style={btn('rgba(255,255,255,0.07)', { padding: '9px', borderRadius: 9, border: `1px solid ${c.border}`, color: c.text1, width: '100%' })}>
                                        Отмена
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <p style={{ color: c.text2, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                                        После подключения CRM будет автоматически получать сообщения от клиентов и отображать их в карточках.
                                    </p>
                                    <button onClick={connectWA} style={btn('#25D366', { padding: '12px', fontWeight: 700, borderRadius: 10, width: '100%', fontSize: 14, boxShadow: '0 4px 14px rgba(37,211,102,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 })}>
                                        <MessageCircle size={18} strokeWidth={2} />
                                        Подключить WhatsApp
                                    </button>
                                </div>
                            )}
                        </Card>
                    </PanelSection>
                )}

                {section === 'analytics' && (
                    <PanelSection title="Аналитика" desc="Ключевые метрики и журнал событий">
                        {analytics ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                                    {metricCards.map(m => (
                                        <div key={m.label} style={{ background: m.bg, border: `1px solid ${m.color}25`, borderRadius: 14, padding: '20px 22px' }}>
                                            <div style={{ fontSize: 30, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
                                            <div style={{ fontSize: 12, color: c.text2, marginTop: 6 }}>{m.label}</div>
                                        </div>
                                    ))}
                                </div>

                                <div>
                                    <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Журнал событий</p>
                                    <Card style={{ padding: 0 }}>
                                        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                                            {(analytics.recent_activity || []).map((log, i) => (
                                                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < analytics.recent_activity.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                                                    <div style={{ fontSize: 13, minWidth: 0 }}>
                                                        <span style={{ color: c.blue, fontWeight: 600 }}>{log.user_name}</span>
                                                        <span style={{ color: c.text1 }}> {log.action}</span>
                                                        {log.details && <span style={{ color: c.text3 }}> ({log.details})</span>}
                                                    </div>
                                                    <span style={{ fontSize: 11, color: c.text3, flexShrink: 0, marginLeft: 16, whiteSpace: 'nowrap' }}>{log.timestamp}</span>
                                                </div>
                                            ))}
                                            {(!analytics.recent_activity || analytics.recent_activity.length === 0) && (
                                                <p style={{ padding: 20, color: c.text3, textAlign: 'center', margin: 0 }}>Нет событий</p>
                                            )}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        ) : (
                            <p style={{ color: c.text3, fontSize: 13 }}>Загрузка данных...</p>
                        )}
                    </PanelSection>
                )}
            </div>
        </div>
    );
};

// ─── Layout primitives ────────────────────────────────────────────────────────

const PanelSection: React.FC<{ title: string; desc: string; children: React.ReactNode }> = ({ title, desc, children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: c.text1 }}>{title}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: c.text2 }}>{desc}</p>
        </div>
        {children}
    </div>
);

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
    <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, padding: 20, ...style }}>
        {children}
    </div>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <th style={{ padding: '9px 14px', textAlign: 'left', color: c.text2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
        {children}
    </th>
);

const Td: React.FC<{ children: React.ReactNode; dim?: boolean }> = ({ children, dim }) => (
    <td style={{ padding: '11px 14px', color: dim ? c.text2 : c.text1, fontSize: 13 }}>{children}</td>
);

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: c.text2, marginBottom: 5 }}>{label}</div>
        {children}
    </div>
);
