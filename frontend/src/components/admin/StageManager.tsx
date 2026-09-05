import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Stage, TransitionRule, StageRequiredField, LossReason } from '../../types';

interface Props {
    stages: Stage[];
    onRefresh: () => void;
}

type Tab = 'stages' | 'transitions' | 'fields' | 'reasons';

interface EditState {
    name: string;
    color: string;
    wip_limit: number;
    is_fail: boolean;
    is_success: boolean;
}

const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '5px 10px', background: bg, color, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
});

const inputStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 };

export const StageManager: React.FC<Props> = ({ stages, onRefresh }) => {
    const [tab, setTab] = useState<Tab>('stages');

    // --- Этапы ---
    const [newStageName, setNewStageName] = useState('');
    const [newStageCode, setNewStageCode] = useState('');
    const [newStageColor, setNewStageColor] = useState('#3b82f6');
    const [newStageWip, setNewStageWip] = useState(0);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editState, setEditState] = useState<EditState>({ name: '', color: '', wip_limit: 0, is_fail: false, is_success: false });

    // --- Правила переходов ---
    const [rules, setRules] = useState<TransitionRule[]>([]);
    const [newRuleFrom, setNewRuleFrom] = useState('');
    const [newRuleTo, setNewRuleTo] = useState('');

    // --- Обязательные поля ---
    const [reqFields, setReqFields] = useState<StageRequiredField[]>([]);
    const [newFieldStage, setNewFieldStage] = useState('');
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldLabel, setNewFieldLabel] = useState('');

    // --- Причины отказа ---
    const [reasons, setReasons] = useState<LossReason[]>([]);
    const [newReason, setNewReason] = useState('');

    useEffect(() => {
        void loadRules();
        void loadReqFields();
        void loadReasons();
    }, []);

    const loadRules = async () => {
        const res = await api.get<TransitionRule[]>('/pipeline/transition-rules');
        setRules(res.data || []);
    };

    const loadReqFields = async () => {
        const res = await api.get<StageRequiredField[]>('/pipeline/stage-fields');
        setReqFields(res.data || []);
    };

    const loadReasons = async () => {
        const res = await api.get<LossReason[]>('/crm/loss-reasons');
        setReasons(res.data || []);
    };

    // === Этапы ===
    const handleCreateStage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/admin/pipeline/stages', {
                name: newStageName, code: newStageCode, color: newStageColor,
                wip_limit: Number(newStageWip), sort_order: stages.length + 1,
            });
            setNewStageName(''); setNewStageCode(''); setNewStageWip(0);
            onRefresh();
        } catch { alert('Ошибка при создании этапа'); }
    };

    const startEdit = (s: Stage) => {
        setEditingId(s.id);
        setEditState({ name: s.name, color: s.color, wip_limit: s.wip_limit, is_fail: !!s.is_fail, is_success: !!s.is_success });
    };

    const saveEdit = async (id: number) => {
        try {
            await api.patch(`/admin/pipeline/stages/${id}`, editState);
            setEditingId(null);
            onRefresh();
        } catch { alert('Ошибка при сохранении'); }
    };

    const moveStage = async (index: number, dir: -1 | 1) => {
        const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
        const newIndex = index + dir;
        if (newIndex < 0 || newIndex >= ordered.length) return;
        [ordered[index], ordered[newIndex]] = [ordered[newIndex], ordered[index]];
        try {
            await api.put('/admin/pipeline/stages/reorder', { ids: ordered.map(s => s.id) });
            onRefresh();
        } catch { alert('Ошибка при изменении порядка'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить этап?')) return;
        try {
            await api.delete(`/admin/pipeline/stages/${id}`);
            onRefresh();
        } catch { alert('Нельзя удалить системный этап'); }
    };

    // === Правила переходов ===
    const handleAddRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRuleFrom || !newRuleTo || newRuleFrom === newRuleTo) { alert('Выберите разные этапы'); return; }
        try {
            await api.post('/admin/pipeline/transition-rules', { from_stage_code: newRuleFrom, to_stage_code: newRuleTo });
            setNewRuleFrom(''); setNewRuleTo('');
            await loadRules();
        } catch { alert('Правило уже существует'); }
    };

    const handleDeleteRule = async (id: number) => {
        await api.delete(`/admin/pipeline/transition-rules/${id}`);
        await loadRules();
    };

    // === Обязательные поля ===
    const handleAddField = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFieldStage || !newFieldName || !newFieldLabel) return;
        try {
            await api.post('/admin/pipeline/stage-fields', { stage_code: newFieldStage, field_name: newFieldName, field_label: newFieldLabel });
            setNewFieldName(''); setNewFieldLabel('');
            await loadReqFields();
        } catch { alert('Такое поле уже добавлено для этого этапа'); }
    };

    const handleDeleteField = async (id: number) => {
        await api.delete(`/admin/pipeline/stage-fields/${id}`);
        await loadReqFields();
    };

    // === Причины отказа ===
    const handleAddReason = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newReason.trim()) return;
        try {
            await api.post('/admin/crm/loss-reasons', { name: newReason.trim() });
            setNewReason('');
            await loadReasons();
        } catch { alert('Причина уже существует'); }
    };

    const handleDeleteReason = async (id: number) => {
        await api.delete(`/admin/crm/loss-reasons/${id}`);
        await loadReasons();
    };

    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

    const tabStyle = (t: Tab): React.CSSProperties => ({
        padding: '8px 18px', border: 'none', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
        background: 'none', cursor: 'pointer', fontWeight: tab === t ? 600 : 400,
        color: tab === t ? '#1d4ed8' : '#6b7280', fontSize: 14,
    });

    return (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0 8px' }}>
                <button style={tabStyle('stages')} onClick={() => setTab('stages')}>Этапы воронки</button>
                <button style={tabStyle('transitions')} onClick={() => setTab('transitions')}>Правила переходов</button>
                <button style={tabStyle('fields')} onClick={() => setTab('fields')}>Обязательные поля</button>
                <button style={tabStyle('reasons')} onClick={() => setTab('reasons')}>Причины отказа</button>
            </div>

            <div style={{ padding: 20 }}>

                {/* === ВКЛ: ЭТАПЫ === */}
                {tab === 'stages' && (
                    <div>
                        <form onSubmit={(e) => { void handleCreateStage(e); }} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input style={inputStyle} type="text" placeholder="Название" value={newStageName} onChange={e => setNewStageName(e.target.value)} required />
                            <input style={{ ...inputStyle, width: 120 }} type="text" placeholder="Код (латиница)" value={newStageCode} onChange={e => setNewStageCode(e.target.value)} required />
                            <input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)} style={{ padding: 2, height: 34, width: 40, border: '1px solid #d1d5db', borderRadius: 4 }} title="Цвет" />
                            <input style={{ ...inputStyle, width: 120 }} type="number" placeholder="WIP-лимит (0=∞)" value={newStageWip} min={0} onChange={e => setNewStageWip(Number(e.target.value))} />
                            <button type="submit" style={btn('#3b82f6')}>+ Добавить этап</button>
                        </form>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 6px' }}>Цвет</th>
                                    <th style={{ padding: '8px 6px' }}>Название</th>
                                    <th style={{ padding: '8px 6px' }}>Код</th>
                                    <th style={{ padding: '8px 6px' }}>WIP</th>
                                    <th style={{ padding: '8px 6px' }}>Отказ</th>
                                    <th style={{ padding: '8px 6px' }}>Успех</th>
                                    <th style={{ padding: '8px 6px' }}>Тип</th>
                                    <th style={{ padding: '8px 6px' }}>Порядок</th>
                                    <th style={{ padding: '8px 6px' }}>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedStages.map((s, idx) => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '8px 6px' }}>
                                            {editingId === s.id
                                                ? <input type="color" value={editState.color} onChange={e => setEditState(p => ({ ...p, color: e.target.value }))} style={{ width: 30, height: 26, padding: 1 }} />
                                                : <div style={{ width: 16, height: 16, background: s.color, borderRadius: 4 }} />
                                            }
                                        </td>
                                        <td style={{ padding: '8px 6px' }}>
                                            {editingId === s.id
                                                ? <input style={{ ...inputStyle, width: 130 }} value={editState.name} onChange={e => setEditState(p => ({ ...p, name: e.target.value }))} />
                                                : <strong>{s.name}</strong>
                                            }
                                        </td>
                                        <td style={{ padding: '8px 6px' }}><code style={{ background: '#f3f4f6', padding: '2px 5px', borderRadius: 3 }}>{s.code}</code></td>
                                        <td style={{ padding: '8px 6px' }}>
                                            {editingId === s.id
                                                ? <input style={{ ...inputStyle, width: 70 }} type="number" min={0} value={editState.wip_limit} onChange={e => setEditState(p => ({ ...p, wip_limit: Number(e.target.value) }))} />
                                                : (s.wip_limit > 0 ? s.wip_limit : '∞')
                                            }
                                        </td>
                                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                            {editingId === s.id
                                                ? <input type="checkbox" checked={editState.is_fail} onChange={e => setEditState(p => ({ ...p, is_fail: e.target.checked }))} />
                                                : (s.is_fail ? '✓' : '')
                                            }
                                        </td>
                                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                                            {editingId === s.id
                                                ? <input type="checkbox" checked={editState.is_success} onChange={e => setEditState(p => ({ ...p, is_success: e.target.checked }))} />
                                                : (s.is_success ? '✓' : '')
                                            }
                                        </td>
                                        <td style={{ padding: '8px 6px' }}>
                                            <span style={{ background: s.is_system ? '#dbeafe' : '#f3f4f6', color: s.is_system ? '#1e40af' : '#374151', padding: '2px 6px', borderRadius: 3, fontSize: 11 }}>
                                                {s.is_system ? 'Системный' : 'Кастомный'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 6px' }}>
                                            <div style={{ display: 'flex', gap: 2 }}>
                                                <button onClick={() => void moveStage(idx, -1)} disabled={idx === 0} style={{ ...btn('#e5e7eb', '#374151'), opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                                                <button onClick={() => void moveStage(idx, 1)} disabled={idx === sortedStages.length - 1} style={{ ...btn('#e5e7eb', '#374151'), opacity: idx === sortedStages.length - 1 ? 0.4 : 1 }}>↓</button>
                                            </div>
                                        </td>
                                        <td style={{ padding: '8px 6px' }}>
                                            {editingId === s.id ? (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button onClick={() => void saveEdit(s.id)} style={btn('#10b981')}>Сохранить</button>
                                                    <button onClick={() => setEditingId(null)} style={btn('#6b7280')}>Отмена</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button onClick={() => startEdit(s)} style={btn('#f59e0b')}>Изменить</button>
                                                    {!s.is_system && <button onClick={() => void handleDelete(s.id)} style={btn('#ef4444')}>Удалить</button>}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* === ВКЛ: ПРАВИЛА ПЕРЕХОДОВ === */}
                {tab === 'transitions' && (
                    <div>
                        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
                            Заблокированные переходы скрываются в Канбан-доске и отклоняются сервером.
                        </p>
                        <form onSubmit={(e) => { void handleAddRule(e); }} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
                            <select value={newRuleFrom} onChange={e => setNewRuleFrom(e.target.value)} style={{ ...inputStyle, minWidth: 160 }} required>
                                <option value="">Из этапа...</option>
                                {stages.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                            </select>
                            <span style={{ color: '#9ca3af' }}>→</span>
                            <select value={newRuleTo} onChange={e => setNewRuleTo(e.target.value)} style={{ ...inputStyle, minWidth: 160 }} required>
                                <option value="">В этап...</option>
                                {stages.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                            </select>
                            <button type="submit" style={btn('#ef4444')}>Заблокировать переход</button>
                        </form>

                        {rules.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13 }}>Нет заблокированных переходов</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#fef2f2', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 10px' }}>Из этапа</th>
                                        <th style={{ padding: '8px 10px' }}></th>
                                        <th style={{ padding: '8px 10px' }}>В этап</th>
                                        <th style={{ padding: '8px 10px' }}>Действие</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rules.map(r => {
                                        const fromStage = stages.find(s => s.code === r.from_stage_code);
                                        const toStage = stages.find(s => s.code === r.to_stage_code);
                                        return (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {fromStage && <span style={{ background: fromStage.color + '22', color: fromStage.color, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{fromStage.name}</span>}
                                                </td>
                                                <td style={{ padding: '8px 10px', color: '#ef4444', fontWeight: 'bold' }}>⛔</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {toStage && <span style={{ background: toStage.color + '22', color: toStage.color, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{toStage.name}</span>}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <button onClick={() => void handleDeleteRule(r.id)} style={btn('#ef4444')}>Разблокировать</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* === ВКЛ: ОБЯЗАТЕЛЬНЫЕ ПОЛЯ === */}
                {tab === 'fields' && (
                    <div>
                        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
                            При переходе на этап менеджер должен заполнить указанные поля. Они сохраняются в карточке клиента.
                        </p>
                        <form onSubmit={(e) => { void handleAddField(e); }} style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select value={newFieldStage} onChange={e => setNewFieldStage(e.target.value)} style={{ ...inputStyle, minWidth: 160 }} required>
                                <option value="">Этап...</option>
                                {stages.filter(s => !s.is_fail).map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                            </select>
                            <input style={{ ...inputStyle, width: 140 }} type="text" placeholder="Ключ (напр. inn)" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} required />
                            <input style={{ ...inputStyle, width: 160 }} type="text" placeholder="Метка (напр. ИНН)" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} required />
                            <button type="submit" style={btn('#10b981')}>+ Добавить поле</button>
                        </form>

                        {reqFields.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13 }}>Нет обязательных полей</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f0fdf4', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 10px' }}>Этап</th>
                                        <th style={{ padding: '8px 10px' }}>Ключ поля</th>
                                        <th style={{ padding: '8px 10px' }}>Метка для менеджера</th>
                                        <th style={{ padding: '8px 10px' }}>Действие</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reqFields.map(f => {
                                        const stage = stages.find(s => s.code === f.stage_code);
                                        return (
                                            <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '8px 10px' }}>
                                                    {stage && <span style={{ background: stage.color + '22', color: stage.color, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{stage.name}</span>}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}><code style={{ background: '#f3f4f6', padding: '2px 5px', borderRadius: 3 }}>{f.field_name}</code></td>
                                                <td style={{ padding: '8px 10px' }}>{f.field_label}</td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <button onClick={() => void handleDeleteField(f.id)} style={btn('#ef4444')}>Удалить</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* === ВКЛ: ПРИЧИНЫ ОТКАЗА === */}
                {tab === 'reasons' && (
                    <div>
                        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
                            Список причин отказа, которые менеджер выбирает при переводе клиента на провальный этап.
                        </p>
                        <form onSubmit={(e) => { void handleAddReason(e); }} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                            <input style={{ ...inputStyle, flex: 1 }} type="text" placeholder="Название причины" value={newReason} onChange={e => setNewReason(e.target.value)} required />
                            <button type="submit" style={btn('#3b82f6')}>+ Добавить</button>
                        </form>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {reasons.map(r => (
                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f9fafb', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                                    <span style={{ fontSize: 13 }}>{r.name}</span>
                                    <button onClick={() => void handleDeleteReason(r.id)} style={btn('#ef4444')}>Удалить</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
