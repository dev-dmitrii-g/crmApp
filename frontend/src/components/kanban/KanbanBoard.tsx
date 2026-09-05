import React, { useState } from 'react';
import type { Stage, Client, TransitionRule, StageRequiredField, LossReason } from '../../types';

interface Props {
    stages: Stage[];
    clients: Client[];
    transitionRules: TransitionRule[];
    stageRequiredFields: StageRequiredField[];
    lossReasons: LossReason[];
    onOpenChat: (client: Client) => void;
    onUpdateStatus: (id: number, status: string, lossReason?: string, customFields?: Record<string, string>) => void;
}

interface RejectModal {
    clientId: number;
    targetStatus: string;
}

interface RequiredFieldsModal {
    client: Client;
    targetStage: Stage;
    fields: StageRequiredField[];
    values: Record<string, string>;
}

export const KanbanBoard: React.FC<Props> = ({
    stages, clients, transitionRules, stageRequiredFields, lossReasons,
    onOpenChat, onUpdateStatus,
}) => {
    const [rejectModal, setRejectModal] = useState<RejectModal | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [reqModal, setReqModal] = useState<RequiredFieldsModal | null>(null);

    const isBlocked = (fromCode: string, toCode: string) =>
        transitionRules.some(r => r.from_stage_code === fromCode && r.to_stage_code === toCode);

    const getMissingFields = (client: Client, targetCode: string): StageRequiredField[] => {
        const fields = stageRequiredFields.filter(f => f.stage_code === targetCode);
        return fields.filter(f => {
            const val = client.custom_fields?.[f.field_name] ?? '';
            return val.trim() === '';
        });
    };

    const handleMove = (client: Client, targetStage: Stage) => {
        // Check blocked transition
        if (isBlocked(client.status, targetStage.code)) {
            alert(`Переход «${stages.find(s => s.code === client.status)?.name} → ${targetStage.name}» заблокирован правилами воронки`);
            return;
        }

        // Check WIP limit (visual pre-check; server also validates)
        const stageClients = clients.filter(c => c.status === targetStage.code && c.id !== client.id);
        if (targetStage.wip_limit > 0 && stageClients.length >= targetStage.wip_limit) {
            alert(`WIP-лимит превышен: в этапе «${targetStage.name}» уже ${stageClients.length} карточек (максимум: ${targetStage.wip_limit})`);
            return;
        }

        // Check required fields
        const missing = getMissingFields(client, targetStage.code);
        if (missing.length > 0) {
            const initialValues: Record<string, string> = {};
            missing.forEach(f => { initialValues[f.field_name] = client.custom_fields?.[f.field_name] ?? ''; });
            setReqModal({ client, targetStage, fields: missing, values: initialValues });
            return;
        }

        // Fail stage → show rejection modal
        if (targetStage.is_fail) {
            setRejectModal({ clientId: client.id, targetStatus: targetStage.code });
            setRejectReason('');
            return;
        }

        onUpdateStatus(client.id, targetStage.code);
    };

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

        // After collecting required fields, check for fail stage
        if (targetStage.is_fail) {
            setRejectModal({ clientId: client.id, targetStatus: targetStage.code });
            setRejectReason('');
        } else {
            onUpdateStatus(client.id, targetStage.code, undefined, values);
        }
    };

    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10 }}>
            {sortedStages.map((stage) => {
                const stageClients = clients.filter(c => c.status === stage.code);
                const isExceeded = stage.wip_limit > 0 && stageClients.length > stage.wip_limit;

                return (
                    <div
                        key={stage.id}
                        style={{
                            flex: '1 0 260px',
                            background: isExceeded ? '#fef2f2' : '#f3f4f6',
                            padding: 14,
                            borderRadius: 8,
                            minHeight: 450,
                            borderTop: `4px solid ${stage.color}`,
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <h3 style={{ fontSize: 13, color: '#374151', margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>{stage.name}</h3>
                                {stage.is_success && <span title="Финальный успешный этап" style={{ fontSize: 10, background: '#d1fae5', color: '#065f46', padding: '1px 5px', borderRadius: 3 }}>Успех</span>}
                                {stage.is_fail && <span title="Этап отказа" style={{ fontSize: 10, background: '#fee2e2', color: '#7f1d1d', padding: '1px 5px', borderRadius: 3 }}>Отказ</span>}
                            </div>
                            <span style={{
                                fontSize: 12, fontWeight: 'bold', padding: '2px 8px', borderRadius: 10,
                                background: isExceeded ? '#ef4444' : '#e5e7eb',
                                color: isExceeded ? '#fff' : '#374151',
                            }} title={isExceeded ? 'WIP-лимит превышен!' : ''}>
                                {stageClients.length}{stage.wip_limit > 0 ? ` / ${stage.wip_limit}` : ''}
                            </span>
                        </div>

                        {stageClients.map(client => (
                            <div
                                key={client.id}
                                onClick={() => onOpenChat(client)}
                                style={{ background: '#fff', padding: 11, margin: '8px 0', borderRadius: 6, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                            >
                                <strong style={{ fontSize: 13 }}>{client.name}</strong>
                                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>{client.phone}</p>
                                {client.loss_reason && (
                                    <p style={{ margin: '4px 0 0', color: '#ef4444', fontSize: 11 }}>Причина: {client.loss_reason}</p>
                                )}
                                {client.custom_fields && Object.keys(client.custom_fields).length > 0 && (
                                    <div style={{ marginTop: 5 }}>
                                        {Object.entries(client.custom_fields).map(([k, v]) => v ? (
                                            <span key={k} style={{ fontSize: 10, background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>
                                                {k}: {v}
                                            </span>
                                        ) : null)}
                                    </div>
                                )}

                                <div style={{ marginTop: 9, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                    {sortedStages
                                        .filter(t => t.code !== stage.code && !isBlocked(client.status, t.code))
                                        .map(targetStage => {
                                            const wipFull = targetStage.wip_limit > 0 &&
                                                clients.filter(c => c.status === targetStage.code && c.id !== client.id).length >= targetStage.wip_limit;
                                            return (
                                                <button
                                                    key={targetStage.id}
                                                    onClick={e => { e.stopPropagation(); handleMove(client, targetStage); }}
                                                    title={wipFull ? `WIP-лимит этапа «${targetStage.name}» достигнут` : ''}
                                                    style={{
                                                        fontSize: 10,
                                                        border: `1px solid ${targetStage.color}`,
                                                        background: wipFull ? '#f3f4f6' : '#fff',
                                                        color: wipFull ? '#9ca3af' : targetStage.color,
                                                        borderRadius: 3,
                                                        cursor: wipFull ? 'not-allowed' : 'pointer',
                                                        padding: '2px 6px',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    → {targetStage.name}{wipFull ? ' ⚠' : ''}
                                                </button>
                                            );
                                        })}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })}

            {/* === Модалка: Обязательные поля === */}
            {reqModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 360, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                        <h4 style={{ marginTop: 0, marginBottom: 4 }}>Обязательные поля</h4>
                        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                            Для перехода в «{reqModal.targetStage.name}» заполните:
                        </p>
                        {reqModal.fields.map(f => (
                            <div key={f.field_name} style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>{f.field_label}</label>
                                <input
                                    style={{ width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                                    type="text"
                                    value={reqModal.values[f.field_name] ?? ''}
                                    onChange={e => setReqModal(m => m ? ({ ...m, values: { ...m.values, [f.field_name]: e.target.value } }) : null)}
                                    placeholder={f.field_label}
                                />
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button
                                onClick={confirmRequiredFields}
                                disabled={reqModal.fields.some(f => !reqModal.values[f.field_name]?.trim())}
                                style={{ flex: 1, padding: 9, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, opacity: reqModal.fields.some(f => !reqModal.values[f.field_name]?.trim()) ? 0.5 : 1 }}
                            >
                                Продолжить
                            </button>
                            <button onClick={() => setReqModal(null)} style={{ flex: 1, padding: 9, background: '#e5e7eb', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* === Модалка: Причина отказа === */}
            {rejectModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 320 }}>
                        <h4 style={{ marginTop: 0 }}>Причина отказа</h4>
                        <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 15, border: '1px solid #d1d5db', borderRadius: 4 }}>
                            <option value="">-- Выберите причину --</option>
                            {lossReasons.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={confirmRejection} disabled={!rejectReason} style={{ flex: 1, padding: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: !rejectReason ? 0.5 : 1 }}>Подтвердить</button>
                            <button onClick={() => setRejectModal(null)} style={{ flex: 1, padding: 8, background: '#e5e7eb', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Отмена</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
