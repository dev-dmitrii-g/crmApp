import React, { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, Check, X, Pencil, Ban, Trash2, Plus, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import { Skeleton } from '../ui/Skeleton';
import type { Stage, TransitionRule, StageRequiredField, LossReason } from '../../types';
import { c, inp, btn } from '../../theme';

interface Props {
    stages: Stage[];
    onRefresh: () => void;
}

type Tab = 'stages' | 'transitions' | 'fields' | 'reasons';

interface EditState { name: string; color: string; wip_limit: number; is_fail: boolean; is_success: boolean }

// ─── Shared icon-button ────────────────────────────────────────────────────────
const IBtn: React.FC<{
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    disabled?: boolean;
    loading?: boolean;
}> = ({ onClick, icon, label, disabled, loading }) => (
    <button
        onClick={onClick}
        disabled={disabled || loading}
        aria-label={label}
        title={label}
        style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, border: 'none', borderRadius: 7,
            cursor: disabled || loading ? 'default' : 'pointer',
            background: 'rgba(255,255,255,0.06)',
            opacity: disabled ? 0.3 : 1,
            transition: 'background 0.15s, opacity 0.15s',
            flexShrink: 0,
        }}
    >
        {loading ? <Spinner size={12} color={c.text2} /> : icon}
    </button>
);

// ─── Submit button with loading ────────────────────────────────────────────────
const SubmitBtn: React.FC<{ loading: boolean; disabled?: boolean; color: string; children: React.ReactNode }> = ({ loading, disabled, color, children }) => (
    <button
        type="submit"
        disabled={loading || disabled}
        aria-busy={loading}
        style={{
            ...btn(color, { padding: '7px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }),
            opacity: loading || disabled ? 0.6 : 1,
            cursor: loading || disabled ? 'default' : 'pointer',
            alignSelf: 'end',
        }}
    >
        {loading ? <Spinner size={13} color="#fff" /> : children}
    </button>
);

export const StageManager: React.FC<Props> = ({ stages, onRefresh }) => {
    const toast = useToast();
    const [tab, setTab] = useState<Tab>('stages');
    const [loading, setLoading] = useState(false);

    const [newStageName, setNewStageName] = useState('');
    const [newStageCode, setNewStageCode] = useState('');
    const [newStageColor, setNewStageColor] = useState('#3b82f6');
    const [newStageWip, setNewStageWip] = useState(0);
    const [savingStage, setSavingStage] = useState(false);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editState, setEditState] = useState<EditState>({ name: '', color: '', wip_limit: 0, is_fail: false, is_success: false });
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const [rules, setRules] = useState<TransitionRule[]>([]);
    const [rulesLoading, setRulesLoading] = useState(true);
    const [newRuleFrom, setNewRuleFrom] = useState('');
    const [newRuleTo, setNewRuleTo] = useState('');
    const [savingRule, setSavingRule] = useState(false);
    const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);

    const [reqFields, setReqFields] = useState<StageRequiredField[]>([]);
    const [fieldsLoading, setFieldsLoading] = useState(true);
    const [newFieldStage, setNewFieldStage] = useState('');
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [savingField, setSavingField] = useState(false);
    const [deletingFieldId, setDeletingFieldId] = useState<number | null>(null);

    const [reasons, setReasons] = useState<LossReason[]>([]);
    const [reasonsLoading, setReasonsLoading] = useState(true);
    const [newReason, setNewReason] = useState('');
    const [savingReason, setSavingReason] = useState(false);
    const [deletingReasonId, setDeletingReasonId] = useState<number | null>(null);

    const loadRules = useCallback(async () => {
        setRulesLoading(true);
        try { const r = await api.get<TransitionRule[]>('/pipeline/transition-rules'); setRules(r.data || []); }
        catch { toast.error('Не удалось загрузить правила переходов'); }
        finally { setRulesLoading(false); }
    }, []);

    const loadReqFields = useCallback(async () => {
        setFieldsLoading(true);
        try { const r = await api.get<StageRequiredField[]>('/pipeline/stage-fields'); setReqFields(r.data || []); }
        catch { toast.error('Не удалось загрузить обязательные поля'); }
        finally { setFieldsLoading(false); }
    }, []);

    const loadReasons = useCallback(async () => {
        setReasonsLoading(true);
        try { const r = await api.get<LossReason[]>('/crm/loss-reasons'); setReasons(r.data || []); }
        catch { toast.error('Не удалось загрузить причины отказа'); }
        finally { setReasonsLoading(false); }
    }, []);

    useEffect(() => { void loadRules(); void loadReqFields(); void loadReasons(); }, []);

    // ── Stages ──────────────────────────────────────────────────────────────────
    const handleCreateStage = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingStage(true);
        try {
            await api.post('/admin/pipeline/stages', { name: newStageName, code: newStageCode, color: newStageColor, wip_limit: Number(newStageWip), sort_order: stages.length + 1 });
            setNewStageName(''); setNewStageCode(''); setNewStageWip(0);
            toast.success(`Этап «${newStageName}» добавлен`);
            onRefresh();
        } catch { toast.error('Ошибка при создании этапа — код уже занят'); }
        finally { setSavingStage(false); }
    };

    const startEdit = (s: Stage) => {
        setEditingId(s.id);
        setEditState({ name: s.name, color: s.color, wip_limit: s.wip_limit, is_fail: !!s.is_fail, is_success: !!s.is_success });
    };

    const saveEdit = async (id: number) => {
        setSavingEdit(true);
        try { await api.patch(`/admin/pipeline/stages/${id}`, editState); setEditingId(null); toast.success('Изменения сохранены'); onRefresh(); }
        catch { toast.error('Не удалось сохранить изменения'); }
        finally { setSavingEdit(false); }
    };

    const moveStage = async (index: number, dir: -1 | 1) => {
        const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
        const newIndex = index + dir;
        if (newIndex < 0 || newIndex >= ordered.length) return;
        [ordered[index], ordered[newIndex]] = [ordered[newIndex], ordered[index]];
        setLoading(true);
        try { await api.put('/admin/pipeline/stages/reorder', { ids: ordered.map(s => s.id) }); onRefresh(); }
        catch { toast.error('Ошибка при изменении порядка'); }
        finally { setLoading(false); }
    };

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Удалить этап «${name}»?`)) return;
        setDeletingId(id);
        try { await api.delete(`/admin/pipeline/stages/${id}`); toast.success(`Этап «${name}» удалён`); onRefresh(); }
        catch { toast.error('Нельзя удалить системный этап'); }
        finally { setDeletingId(null); }
    };

    // ── Transition rules ────────────────────────────────────────────────────────
    const handleAddRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRuleFrom || !newRuleTo || newRuleFrom === newRuleTo) { toast.error('Выберите два разных этапа'); return; }
        setSavingRule(true);
        try {
            await api.post('/admin/pipeline/transition-rules', { from_stage_code: newRuleFrom, to_stage_code: newRuleTo });
            setNewRuleFrom(''); setNewRuleTo('');
            toast.success('Переход заблокирован');
            await loadRules();
        } catch { toast.error('Такое правило уже существует'); }
        finally { setSavingRule(false); }
    };

    const handleDeleteRule = async (id: number) => {
        setDeletingRuleId(id);
        try { await api.delete(`/admin/pipeline/transition-rules/${id}`); toast.success('Переход разблокирован'); await loadRules(); }
        catch { toast.error('Не удалось удалить правило'); }
        finally { setDeletingRuleId(null); }
    };

    // ── Required fields ─────────────────────────────────────────────────────────
    const handleAddField = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingField(true);
        try {
            await api.post('/admin/pipeline/stage-fields', { stage_code: newFieldStage, field_name: newFieldName, field_label: newFieldLabel });
            setNewFieldName(''); setNewFieldLabel('');
            toast.success('Обязательное поле добавлено');
            await loadReqFields();
        } catch { toast.error('Такое поле уже добавлено для этого этапа'); }
        finally { setSavingField(false); }
    };

    const handleDeleteField = async (id: number) => {
        setDeletingFieldId(id);
        try { await api.delete(`/admin/pipeline/stage-fields/${id}`); toast.success('Поле удалено'); await loadReqFields(); }
        catch { toast.error('Не удалось удалить поле'); }
        finally { setDeletingFieldId(null); }
    };

    // ── Loss reasons ────────────────────────────────────────────────────────────
    const handleAddReason = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newReason.trim()) return;
        setSavingReason(true);
        try {
            await api.post('/admin/crm/loss-reasons', { name: newReason.trim() });
            toast.success(`Причина «${newReason.trim()}» добавлена`);
            setNewReason('');
            await loadReasons();
        } catch { toast.error('Такая причина уже существует'); }
        finally { setSavingReason(false); }
    };

    const handleDeleteReason = async (id: number, name: string) => {
        setDeletingReasonId(id);
        try { await api.delete(`/admin/crm/loss-reasons/${id}`); toast.success(`Причина «${name}» удалена`); await loadReasons(); }
        catch { toast.error('Не удалось удалить причину'); }
        finally { setDeletingReasonId(null); }
    };

    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const si: React.CSSProperties = inp({ fontSize: 12, padding: '6px 9px' });

    const TABS: { key: Tab; label: string }[] = [
        { key: 'stages', label: 'Этапы' },
        { key: 'transitions', label: 'Переходы' },
        { key: 'fields', label: 'Обяз. поля' },
        { key: 'reasons', label: 'Причины отказа' },
    ];

    return (
        <section aria-label="Управление воронкой" style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Tab bar */}
            <div role="tablist" style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, background: c.bgElevated, padding: '0 16px' }}>
                {TABS.map(t => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                            color: tab === t.key ? c.text1 : c.text2,
                            borderBottom: `2px solid ${tab === t.key ? c.blue : 'transparent'}`,
                            transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap',
                        }}
                    >{t.label}</button>
                ))}
            </div>

            <div role="tabpanel" style={{ padding: 20 }}>

                {/* ── Этапы ── */}
                {tab === 'stages' && (
                    <div>
                        <form onSubmit={e => { void handleCreateStage(e); }} aria-label="Добавить этап"
                            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto 1fr auto', gap: 8, marginBottom: 20, alignItems: 'end', padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                            <div>
                                <label style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600, display: 'block' }}>Название</label>
                                <input style={si} placeholder="Новый этап" value={newStageName} onChange={e => setNewStageName(e.target.value)} required aria-required="true" />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600, display: 'block' }}>Код (латиница)</label>
                                <input style={si} placeholder="new_stage" value={newStageCode} onChange={e => setNewStageCode(e.target.value)} required pattern="[a-z0-9_]+" title="Только латиница и _" aria-required="true" />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600, display: 'block' }}>Цвет</label>
                                <input type="color" value={newStageColor} onChange={e => setNewStageColor(e.target.value)} aria-label="Цвет этапа"
                                    style={{ height: 34, width: 42, padding: 2, border: `1px solid ${c.border}`, borderRadius: 6, background: c.bgInput, cursor: 'pointer', display: 'block' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600, display: 'block' }}>WIP лимит</label>
                                <input style={{ ...si, width: 80 }} type="number" placeholder="0=∞" value={newStageWip} min={0} onChange={e => setNewStageWip(Number(e.target.value))} aria-label="WIP лимит (0 — без ограничений)" />
                            </div>
                            <div />
                            <SubmitBtn loading={savingStage} color={c.blue}>
                                <Plus size={14} strokeWidth={2.5} /> Добавить
                            </SubmitBtn>
                        </form>

                        {stages.length === 0 ? (
                            <EmptyState
                                icon={<RefreshCw size={28} color={c.text3} strokeWidth={1.5} />}
                                title="Нет этапов"
                                desc="Добавьте первый этап воронки продаж"
                            />
                        ) : (
                            <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${c.border}` }}>
                                <table style={{ minWidth: 700, width: '100%', borderCollapse: 'collapse', fontSize: 13 }} aria-label="Список этапов воронки">
                                    <thead>
                                        <tr style={{ background: c.bgElevated }}>
                                            {['', 'Название', 'Код', 'WIP', 'Отказ', 'Успех', 'Тип', 'Порядок', 'Действия'].map(h => (
                                                <th key={h} scope="col" style={{ padding: '9px 12px', textAlign: 'left', color: c.text2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedStages.map((s, idx) => (
                                            <tr key={s.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {editingId === s.id
                                                        ? <input type="color" value={editState.color} onChange={e => setEditState(p => ({ ...p, color: e.target.value }))} aria-label="Цвет" style={{ width: 32, height: 28, padding: 1, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
                                                        : <div role="img" aria-label={`Цвет этапа: ${s.color}`} style={{ width: 14, height: 14, background: s.color, borderRadius: 4, boxShadow: `0 0 6px ${s.color}60` }} />
                                                    }
                                                </td>
                                                <td style={{ padding: '8px 12px', color: c.text1 }}>
                                                    {editingId === s.id
                                                        ? <input style={{ ...si, width: 130 }} value={editState.name} onChange={e => setEditState(p => ({ ...p, name: e.target.value }))} aria-label="Название этапа" />
                                                        : <strong>{s.name}</strong>}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <code style={{ background: 'rgba(255,255,255,0.06)', color: c.text2, padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{s.code}</code>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: c.text2 }}>
                                                    {editingId === s.id
                                                        ? <input style={{ ...si, width: 70 }} type="number" min={0} value={editState.wip_limit} onChange={e => setEditState(p => ({ ...p, wip_limit: Number(e.target.value) }))} aria-label="WIP лимит" />
                                                        : (s.wip_limit > 0 ? s.wip_limit : '∞')}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    {editingId === s.id
                                                        ? <input type="checkbox" checked={editState.is_fail} onChange={e => setEditState(p => ({ ...p, is_fail: e.target.checked }))} aria-label="Провальный этап" />
                                                        : s.is_fail ? <Check size={13} color={c.red} strokeWidth={2.5} aria-label="Да" /> : <span style={{ color: c.text3 }}>—</span>}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    {editingId === s.id
                                                        ? <input type="checkbox" checked={editState.is_success} onChange={e => setEditState(p => ({ ...p, is_success: e.target.checked }))} aria-label="Успешный этап" />
                                                        : s.is_success ? <Check size={13} color={c.green} strokeWidth={2.5} aria-label="Да" /> : <span style={{ color: c.text3 }}>—</span>}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{ background: s.is_system ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.06)', color: s.is_system ? c.blue : c.text3, padding: '2px 7px', borderRadius: 6, fontSize: 11 }}>
                                                        {s.is_system ? 'Системный' : 'Кастомный'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div role="group" aria-label="Изменить порядок" style={{ display: 'flex', gap: 3 }}>
                                                        <IBtn onClick={() => void moveStage(idx, -1)} icon={<ChevronUp size={13} color={c.text2} strokeWidth={2} />} label="Вверх" disabled={idx === 0 || loading} />
                                                        <IBtn onClick={() => void moveStage(idx, 1)} icon={<ChevronDown size={13} color={c.text2} strokeWidth={2} />} label="Вниз" disabled={idx === sortedStages.length - 1 || loading} />
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {editingId === s.id ? (
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <IBtn onClick={() => void saveEdit(s.id)} icon={<Check size={13} color={c.green} strokeWidth={2} />} label="Сохранить" loading={savingEdit} />
                                                            <IBtn onClick={() => setEditingId(null)} icon={<X size={13} color={c.text2} strokeWidth={2} />} label="Отмена" disabled={savingEdit} />
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: 4 }}>
                                                            <IBtn onClick={() => startEdit(s)} icon={<Pencil size={13} color={c.amber} strokeWidth={2} />} label={`Редактировать ${s.name}`} />
                                                            {!s.is_system && (
                                                                <IBtn onClick={() => void handleDelete(s.id, s.name)} icon={<Trash2 size={13} color={c.red} strokeWidth={2} />} label={`Удалить ${s.name}`} loading={deletingId === s.id} />
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Правила переходов ── */}
                {tab === 'transitions' && (
                    <div>
                        <p style={{ color: c.text2, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                            Заблокированные переходы скрываются в Канбан-доске и отклоняются сервером.
                        </p>
                        <form onSubmit={e => { void handleAddRule(e); }} aria-label="Добавить правило перехода"
                            style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                            <select value={newRuleFrom} onChange={e => setNewRuleFrom(e.target.value)} style={{ ...si, minWidth: 150 }} required aria-label="Из этапа">
                                <option value="">Из этапа...</option>
                                {stages.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                            </select>
                            <Ban size={16} color={c.red} strokeWidth={2} aria-hidden="true" />
                            <select value={newRuleTo} onChange={e => setNewRuleTo(e.target.value)} style={{ ...si, minWidth: 150 }} required aria-label="В этап">
                                <option value="">В этап...</option>
                                {stages.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                            </select>
                            <SubmitBtn loading={savingRule} color={c.red}>
                                <Ban size={13} strokeWidth={2} /> Заблокировать
                            </SubmitBtn>
                        </form>

                        {rulesLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {[1, 2].map(i => <Skeleton key={i} height={48} borderRadius={10} />)}
                            </div>
                        ) : rules.length === 0 ? (
                            <EmptyState icon={<Check size={28} color={c.text3} strokeWidth={1.5} />} title="Переходы не заблокированы" desc="Менеджеры могут перемещать карточки в любой этап" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="list">
                                {rules.map(r => {
                                    const fromS = stages.find(s => s.code === r.from_stage_code);
                                    const toS = stages.find(s => s.code === r.to_stage_code);
                                    return (
                                        <div key={r.id} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                                            {fromS && <span style={{ background: `${fromS.color}18`, color: fromS.color, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{fromS.name}</span>}
                                            <Ban size={14} color={c.red} strokeWidth={2} aria-label="заблокирован" />
                                            {toS && <span style={{ background: `${toS.color}18`, color: toS.color, padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{toS.name}</span>}
                                            <div style={{ flex: 1 }} />
                                            <button
                                                onClick={() => void handleDeleteRule(r.id)}
                                                disabled={deletingRuleId === r.id}
                                                aria-label={`Разблокировать переход из ${fromS?.name} в ${toS?.name}`}
                                                style={{ ...btn(c.green, { fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }), opacity: deletingRuleId === r.id ? 0.6 : 1 }}
                                            >
                                                {deletingRuleId === r.id ? <Spinner size={12} color="#fff" /> : null}
                                                Разблокировать
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Обязательные поля ── */}
                {tab === 'fields' && (
                    <div>
                        <p style={{ color: c.text2, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                            Менеджер обязан заполнить эти поля при переходе на указанный этап.
                        </p>
                        <form onSubmit={e => { void handleAddField(e); }} aria-label="Добавить обязательное поле"
                            style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                            <select value={newFieldStage} onChange={e => setNewFieldStage(e.target.value)} style={{ ...si, minWidth: 150 }} required aria-label="Этап">
                                <option value="">Этап...</option>
                                {stages.filter(s => !s.is_fail).map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                            </select>
                            <input style={{ ...si, width: 130 }} placeholder="Ключ (напр. inn)" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} required aria-label="Ключ поля" />
                            <input style={{ ...si, width: 150 }} placeholder="Метка (напр. ИНН)" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} required aria-label="Метка поля" />
                            <SubmitBtn loading={savingField} color={c.green} disabled={!newFieldStage}>
                                <Plus size={13} strokeWidth={2.5} /> Добавить
                            </SubmitBtn>
                        </form>

                        {fieldsLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} height={44} borderRadius={8} />)}
                            </div>
                        ) : reqFields.length === 0 ? (
                            <EmptyState icon={<Plus size={28} color={c.text3} strokeWidth={1.5} />} title="Нет обязательных полей" desc="Добавьте поля, которые нужно заполнить при смене этапа" />
                        ) : (
                            <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${c.border}` }}>
                                <table style={{ minWidth: 500, width: '100%', borderCollapse: 'collapse', fontSize: 13 }} aria-label="Обязательные поля по этапам">
                                    <thead>
                                        <tr>
                                            {['Этап', 'Ключ поля', 'Метка', ''].map(h => (
                                                <th key={h} scope="col" style={{ padding: '8px 12px', textAlign: 'left', color: c.text2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.03)', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reqFields.map(f => {
                                            const stage = stages.find(s => s.code === f.stage_code);
                                            return (
                                                <tr key={f.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                                    <td style={{ padding: '9px 12px' }}>
                                                        {stage && <span style={{ background: `${stage.color}18`, color: stage.color, padding: '2px 8px', borderRadius: 6, fontWeight: 600, fontSize: 12 }}>{stage.name}</span>}
                                                    </td>
                                                    <td style={{ padding: '9px 12px' }}>
                                                        <code style={{ background: 'rgba(255,255,255,0.06)', color: c.text2, padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{f.field_name}</code>
                                                    </td>
                                                    <td style={{ padding: '9px 12px', color: c.text1 }}>{f.field_label}</td>
                                                    <td style={{ padding: '9px 12px' }}>
                                                        <IBtn onClick={() => void handleDeleteField(f.id)} icon={<Trash2 size={13} color={c.red} strokeWidth={2} />} label={`Удалить поле ${f.field_label}`} loading={deletingFieldId === f.id} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Причины отказа ── */}
                {tab === 'reasons' && (
                    <div>
                        <p style={{ color: c.text2, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                            Менеджер выбирает причину при переводе клиента на провальный этап.
                        </p>
                        <form onSubmit={e => { void handleAddReason(e); }} aria-label="Добавить причину отказа"
                            style={{ display: 'flex', gap: 8, marginBottom: 20, padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                            <input style={{ ...si, flex: 1 }} placeholder="Название причины" value={newReason} onChange={e => setNewReason(e.target.value)} required aria-label="Причина отказа" />
                            <SubmitBtn loading={savingReason} color={c.blue}>
                                <Plus size={13} strokeWidth={2.5} /> Добавить
                            </SubmitBtn>
                        </form>

                        {reasonsLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {[1, 2, 3].map(i => <Skeleton key={i} height={48} borderRadius={10} />)}
                            </div>
                        ) : reasons.length === 0 ? (
                            <EmptyState icon={<X size={28} color={c.text3} strokeWidth={1.5} />} title="Нет причин отказа" desc="Добавьте причины, которые менеджер выбирает при отказе клиента" />
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="list">
                                {reasons.map(r => (
                                    <div key={r.id} role="listitem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}`, minHeight: 48 }}>
                                        <span style={{ fontSize: 13, color: c.text1 }}>{r.name}</span>
                                        <IBtn onClick={() => void handleDeleteReason(r.id, r.name)} icon={<Trash2 size={13} color={c.red} strokeWidth={2} />} label={`Удалить причину ${r.name}`} loading={deletingReasonId === r.id} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
};

// ─── Empty state component ─────────────────────────────────────────────────────
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; desc: string }> = ({ icon, title, desc }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 20px', gap: 10, textAlign: 'center' }}>
        {icon}
        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.text2 }}>{title}</p>
        <p style={{ margin: 0, fontSize: 12, color: c.text3, maxWidth: 280 }}>{desc}</p>
    </div>
);
