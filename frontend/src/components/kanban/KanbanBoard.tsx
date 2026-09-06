import React, { useState, useEffect } from 'react';
import { GripVertical, FileText, MessageCircle, X, Check, Clock, CheckSquare } from 'lucide-react';
import type { Stage, Client, TransitionRule, StageRequiredField, LossReason, SLASetting } from '../../types';
import { c } from '../../theme';
import { useToast } from '../../hooks/useToast';
import { SkeletonColumn } from '../ui/Skeleton';
import { formatPhone } from '../../utils';

interface Props {
    stages: Stage[];
    clients: Client[];
    transitionRules: TransitionRule[];
    stageRequiredFields: StageRequiredField[];
    lossReasons: LossReason[];
    slaSettings?: SLASetting[];
    isAdmin: boolean;
    loading?: boolean;
    waConnected?: boolean;
    onOpenChat: (client: Client) => void;
    onOpenCard: (client: Client) => void;
    onUpdateStatus: (id: number, status: string, lossReason?: string, customFields?: Record<string, string>) => void;
    onReorderStages?: (draggedId: number, targetId: number) => void;
}

interface RejectModal { clientId: number; targetStatus: string }
interface RequiredFieldsModal {
    client: Client; targetStage: Stage;
    fields: StageRequiredField[];
    values: Record<string, string>;
}

export const KanbanBoard: React.FC<Props> = ({
    stages, clients, transitionRules, stageRequiredFields, lossReasons, slaSettings,
    isAdmin, loading, waConnected, onOpenChat, onOpenCard, onUpdateStatus, onReorderStages,
}) => {
    const toast = useToast();
    const [rejectModal, setRejectModal] = useState<RejectModal | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reqModal, setReqModal] = useState<RequiredFieldsModal | null>(null);

    // Close modals on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setRejectModal(null);
                setReqModal(null);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // DnD state
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    const [dragType, setDragType] = useState<'card' | 'stage' | null>(null);

    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

    const isBlocked = (from: string, to: string) =>
        transitionRules.some(r => r.from_stage_code === from && r.to_stage_code === to);

    const getMissingFields = (client: Client, targetCode: string): StageRequiredField[] =>
        stageRequiredFields
            .filter(f => f.stage_code === targetCode)
            .filter(f => (client.custom_fields?.[f.field_name] ?? '').trim() === '');

    const handleMove = (client: Client, targetStage: Stage) => {
        if (isBlocked(client.status, targetStage.code)) {
            const fromName = stages.find(s => s.code === client.status)?.name ?? client.status;
            toast.error(`Переход «${fromName} → ${targetStage.name}» заблокирован`);
            return;
        }
        const stageClients = clients.filter(c => c.status === targetStage.code && c.id !== client.id);
        if (targetStage.wip_limit > 0 && stageClients.length >= targetStage.wip_limit) {
            toast.error(`WIP-лимит: в «${targetStage.name}» уже ${stageClients.length} / ${targetStage.wip_limit} карточек`);
            return;
        }
        const missing = getMissingFields(client, targetStage.code);
        if (missing.length > 0) {
            const initial: Record<string, string> = {};
            missing.forEach(f => { initial[f.field_name] = client.custom_fields?.[f.field_name] ?? ''; });
            setReqModal({ client, targetStage, fields: missing, values: initial });
            return;
        }
        if (targetStage.is_fail) {
            setRejectModal({ clientId: client.id, targetStatus: targetStage.code });
            setRejectReason('');
            return;
        }
        onUpdateStatus(client.id, targetStage.code);
    };

    // === DnD handlers ===
    const onCardDragStart = (e: React.DragEvent, clientId: number) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('drag-type', 'card');
        e.dataTransfer.setData('client-id', String(clientId));
        setDragType('card');
    };

    const onStageDragStart = (e: React.DragEvent, stageId: number) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('drag-type', 'stage');
        e.dataTransfer.setData('stage-id', String(stageId));
        setDragType('stage');
    };

    const onColumnDragOver = (e: React.DragEvent, stageCode: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(stageCode);
    };

    const onColumnDragLeave = (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTarget(null);
        }
    };

    const onColumnDrop = (e: React.DragEvent, targetStage: Stage) => {
        e.preventDefault();
        setDropTarget(null);
        setDragType(null);

        const type = e.dataTransfer.getData('drag-type');
        if (type === 'card') {
            const clientId = Number(e.dataTransfer.getData('client-id'));
            const client = clients.find(c => c.id === clientId);
            if (client && client.status !== targetStage.code) handleMove(client, targetStage);
        } else if (type === 'stage' && isAdmin) {
            const stageId = Number(e.dataTransfer.getData('stage-id'));
            if (stageId !== targetStage.id) onReorderStages?.(stageId, targetStage.id);
        }
    };

    const onDragEnd = () => { setDragType(null); setDropTarget(null); };

    const confirmRejection = () => {
        if (!rejectModal) return;
        onUpdateStatus(rejectModal.clientId, rejectModal.targetStatus, rejectReason);
        setRejectModal(null);
        setRejectReason('');
    };

    const confirmRequiredFields = () => {
        if (!reqModal) return;
        const { client, targetStage, values } = reqModal;
        setReqModal(null);
        if (targetStage.is_fail) {
            setRejectModal({ clientId: client.id, targetStatus: targetStage.code });
            setRejectReason('');
        } else {
            onUpdateStatus(client.id, targetStage.code, undefined, values);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start', minHeight: '100%' }}>
                {[1, 2, 3, 4].map(i => <SkeletonColumn key={i} />)}
            </div>
        );
    }

    if (stages.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: 40, textAlign: 'center' }}>
                <GripVertical size={36} color={c.text3} strokeWidth={1.5} />
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.text2 }}>Воронка пуста</p>
                <p style={{ margin: 0, fontSize: 13, color: c.text3 }}>Создайте этапы в разделе Настройки → Воронка продаж</p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12, alignItems: 'flex-start', minHeight: '100%' }}>
            {sortedStages.map((stage) => {
                const stageClients = clients.filter(cl => cl.status === stage.code);
                const isExceeded = stage.wip_limit > 0 && stageClients.length > stage.wip_limit;
                const isDropHere = dropTarget === stage.code;
                const isCardDrop = isDropHere && dragType === 'card';
                const isStageDrop = isDropHere && dragType === 'stage';

                return (
                    <div
                        key={stage.id}
                        onDragOver={e => onColumnDragOver(e, stage.code)}
                        onDragLeave={onColumnDragLeave}
                        onDrop={e => onColumnDrop(e, stage)}
                        style={{
                            flex: '0 0 272px',
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: 14,
                            background: isCardDrop ? `${stage.color}08` : c.bgCard,
                            border: `1px solid ${isStageDrop ? stage.color : isCardDrop ? `${stage.color}40` : c.border}`,
                            transition: 'border-color 0.2s, background 0.2s',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Column Header */}
                        <div
                            draggable={isAdmin}
                            onDragStart={e => onStageDragStart(e, stage.id)}
                            onDragEnd={onDragEnd}
                            style={{
                                padding: '12px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                borderBottom: `1px solid ${c.border}`,
                                background: c.bgElevated,
                                cursor: isAdmin ? 'grab' : 'default',
                                userSelect: 'none',
                            }}
                        >
                            {isAdmin && (
                                <GripVertical size={14} color={c.text3} strokeWidth={1.8} style={{ flexShrink: 0, cursor: 'grab' }} />
                            )}
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0, boxShadow: `0 0 6px ${stage.color}80` }} />
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', color: c.text2 }}>
                                {stage.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {stage.is_success && <Check size={11} color={c.green} strokeWidth={2.5} />}
                                {stage.is_fail && <X size={11} color={c.red} strokeWidth={2.5} />}
                                <span style={{
                                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                                    background: isExceeded ? `${c.red}20` : `${stage.color}15`,
                                    color: isExceeded ? c.red : stage.color,
                                    border: `1px solid ${isExceeded ? `${c.red}40` : `${stage.color}30`}`,
                                }}>
                                    {stageClients.length}{stage.wip_limit > 0 ? `/${stage.wip_limit}` : ''}
                                </span>
                            </div>
                        </div>

                        {/* Cards area */}
                        <div style={{ flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120, overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                            {stageClients.map(client => (
                                <ClientCardItem
                                    key={client.id}
                                    client={client}
                                    slaSettings={slaSettings}
                                    waConnected={waConnected}
                                    onOpenChat={() => onOpenChat(client)}
                                    onOpenCard={() => onOpenCard(client)}
                                    onDragStart={e => onCardDragStart(e, client.id)}
                                    onDragEnd={onDragEnd}
                                />
                            ))}

                            {/* Drop placeholder */}
                            {isCardDrop && (
                                <div style={{
                                    height: 64, borderRadius: 10, border: `2px dashed ${stage.color}50`,
                                    background: `${stage.color}08`, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }} >
                                    <span style={{ fontSize: 11, color: stage.color, opacity: 0.7 }}>Переместить сюда</span>
                                </div>
                            )}

                            {stageClients.length === 0 && !isCardDrop && (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
                                    <span style={{ fontSize: 12, color: c.text3 }}>Пусто</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* === Модалка: Обязательные поля === */}
            {reqModal && (
                <Modal onClose={() => setReqModal(null)}>
                    <h3 style={{ margin: '0 0 6px', fontSize: 16, color: c.text1 }}>Обязательные поля</h3>
                    <p style={{ color: c.text2, fontSize: 13, margin: '0 0 20px' }}>
                        Для перехода в «{reqModal.targetStage.name}» заполните:
                    </p>
                    {reqModal.fields.map(f => (
                        <div key={f.field_name} style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: c.red, display: 'block', marginBottom: 5 }}>{f.field_label} *</label>
                            <input
                                style={{ ...modalInput }}
                                value={reqModal.values[f.field_name] ?? ''}
                                onChange={e => setReqModal(m => m ? ({ ...m, values: { ...m.values, [f.field_name]: e.target.value } }) : null)}
                                placeholder={f.field_label}
                            />
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                        <button
                            onClick={confirmRequiredFields}
                            disabled={reqModal.fields.some(f => !reqModal.values[f.field_name]?.trim())}
                            style={{ flex: 1, ...primaryBtn, opacity: reqModal.fields.some(f => !reqModal.values[f.field_name]?.trim()) ? 0.4 : 1 }}
                        >Продолжить</button>
                        <button onClick={() => setReqModal(null)} style={{ flex: 1, ...ghostBtn }}>Отмена</button>
                    </div>
                </Modal>
            )}

            {/* === Модалка: Причина отказа === */}
            {rejectModal && (
                <Modal onClose={() => setRejectModal(null)}>
                    <h3 style={{ margin: '0 0 16px', fontSize: 16, color: c.text1 }}>Причина отказа</h3>
                    <select
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        style={{ ...modalInput }}
                    >
                        <option value="">— Выберите причину —</option>
                        {lossReasons.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                        <button onClick={confirmRejection} disabled={!rejectReason}
                            style={{ flex: 1, ...primaryBtn, background: c.red, opacity: !rejectReason ? 0.4 : 1 }}>
                            Подтвердить
                        </button>
                        <button onClick={() => setRejectModal(null)} style={{ flex: 1, ...ghostBtn }}>Отмена</button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

// === Sub-components ===

interface CardItemProps {
    client: Client;
    slaSettings?: SLASetting[];
    waConnected?: boolean;
    onOpenChat: () => void;
    onOpenCard: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
}

function hoursAgo(ts: string): number {
    const diff = Date.now() - new Date(ts).getTime();
    return Math.floor(diff / 3_600_000);
}

function fmtDuration(h: number): string {
    if (h < 24) return `${h} ч`;
    const d = Math.floor(h / 24);
    return `${d} д ${h % 24} ч`;
}

const ClientCardItem: React.FC<CardItemProps> = ({ client, slaSettings, waConnected, onOpenChat, onOpenCard, onDragStart, onDragEnd }) => {
    const toast = useToast();
    const [hovered, setHovered] = useState(false);

    const customEntries = Object.entries(client.custom_fields ?? {}).filter(([, v]) => v);

    // SLA calculation
    const sla = slaSettings?.find(s => s.stage_code === client.status);
    const hoursInStage = client.stage_changed_at ? hoursAgo(client.stage_changed_at) : 0;
    const slaCrit = sla && sla.crit_hours > 0 && hoursInStage >= sla.crit_hours;
    const slaWarn = !slaCrit && sla && sla.warn_hours > 0 && hoursInStage >= sla.warn_hours;
    const slaColor = slaCrit ? c.red : slaWarn ? c.amber : null;
    const showSLA = slaColor !== null;

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                background: hovered ? c.bgHover : c.bgElevated,
                border: slaCrit
                    ? `1px solid ${c.red}50`
                    : slaWarn
                        ? `1px solid ${c.amber}40`
                        : `1px solid ${hovered ? c.borderMd : c.border}`,
                borderRadius: 10,
                padding: '11px 12px',
                cursor: 'grab',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.35)' : '0 1px 4px rgba(0,0,0,0.2)',
                flexShrink: 0,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <GripVertical size={14} color={c.text3} strokeWidth={1.8} style={{ flexShrink: 0, cursor: 'grab', opacity: hovered ? 1 : 0.35, transition: 'opacity 0.15s' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: c.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {client.name}
                    </div>
                    <div style={{ fontSize: 11, color: c.text2, marginTop: 2 }}>{formatPhone(client.phone)}</div>
                    {client.loss_reason && (
                        <div style={{ fontSize: 11, color: c.red, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <X size={10} strokeWidth={2.5} /> {client.loss_reason}
                        </div>
                    )}
                    {customEntries.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                            {customEntries.slice(0, 3).map(([k, v]) => (
                                <span key={k} style={{ fontSize: 10, background: 'rgba(59,130,246,0.12)', color: '#60a5fa', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(59,130,246,0.2)' }}>
                                    {k}: {v}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* SLA + tasks footer */}
                    {(showSLA || (client.open_tasks_count ?? 0) > 0) && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                            {showSLA && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    fontSize: 10, fontWeight: 600,
                                    background: `${slaColor}18`, color: slaColor!,
                                    border: `1px solid ${slaColor}35`,
                                    padding: '2px 7px', borderRadius: 99,
                                }}>
                                    <Clock size={9} strokeWidth={2.5} />
                                    {fmtDuration(hoursInStage)}
                                    {slaCrit && ' — просрочено!'}
                                </span>
                            )}
                            {(client.open_tasks_count ?? 0) > 0 && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    fontSize: 10, fontWeight: 600,
                                    background: 'rgba(139,92,246,0.12)', color: c.purple,
                                    border: '1px solid rgba(139,92,246,0.25)',
                                    padding: '2px 7px', borderRadius: 99,
                                }}>
                                    <CheckSquare size={9} strokeWidth={2.5} />
                                    {client.open_tasks_count}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
                    <button
                        onClick={e => { e.stopPropagation(); onOpenCard(); }}
                        title="Карточка"
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    ><FileText size={13} color={c.text2} strokeWidth={1.8} /></button>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            if (!waConnected) {
                                toast.info('WhatsApp не подключён — обратитесь к администратору');
                                return;
                            }
                            onOpenChat();
                        }}
                        title={waConnected ? 'Чат' : 'WhatsApp не подключён'}
                        style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 26, height: 26, background: 'rgba(255,255,255,0.08)', border: 'none',
                            borderRadius: 6, cursor: waConnected ? 'pointer' : 'not-allowed',
                            opacity: waConnected ? 1 : 0.38,
                        }}
                    ><MessageCircle size={13} color={waConnected ? c.text2 : c.text3} strokeWidth={1.8} /></button>
                </div>
            </div>
        </div>
    );
};

// === Shared modal styles & components ===
const modalInput: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: '#0f0f13',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
    color: '#f0f0f0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
    padding: '9px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
};
const ghostBtn: React.CSSProperties = {
    padding: '9px 18px', background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', fontSize: 13,
};

const Modal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background: '#1a1a1d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', maxHeight: '85vh', overflowY: 'auto' }}>
            {children}
        </div>
    </div>
);
