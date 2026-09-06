import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Zap, Clock, ToggleLeft, ToggleRight, ChevronUp } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import { c, inp, btn } from '../../theme';
import type { AutomationRule, SLASetting, Stage, Manager } from '../../types';

interface Props {
    stages: Stage[];
    managers: Manager[];
    onSLAUpdated: () => void;
}

const ACTION_LABELS: Record<string, string> = {
    send_whatsapp: 'Отправить WA-сообщение',
    assign_manager: 'Назначить менеджера',
    create_task: 'Создать задачу',
};

export const AutomationManager: React.FC<Props> = ({ stages, managers, onSLAUpdated }) => {
    const toast = useToast();
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [sla, setSla] = useState<SLASetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [toggling, setToggling] = useState<number | null>(null);
    const [deleting, setDeleting] = useState<number | null>(null);

    // Add-rule form state
    const [newName, setNewName] = useState('');
    const [newStage, setNewStage] = useState('');
    const [newActionType, setNewActionType] = useState<AutomationRule['action_type']>('create_task');
    const [newMsg, setNewMsg] = useState('');
    const [newManagerId, setNewManagerId] = useState('');
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newDueHours, setNewDueHours] = useState('');
    const [saving, setSaving] = useState(false);

    // SLA edit state: stage_code → {warn, crit, saving}
    const [slaEdits, setSlaEdits] = useState<Record<string, { warn: string; crit: string; saving: boolean }>>({});

    const fetchAll = useCallback(async () => {
        try {
            const [rR, slaR] = await Promise.all([
                api.get<AutomationRule[]>('/admin/automation/rules'),
                api.get<SLASetting[]>('/automation/sla'),
            ]);
            setRules(rR.data || []);
            const slaData = slaR.data || [];
            setSla(slaData);
            const edits: Record<string, { warn: string; crit: string; saving: boolean }> = {};
            slaData.forEach(s => {
                edits[s.stage_code] = { warn: String(s.warn_hours), crit: String(s.crit_hours), saving: false };
            });
            setSlaEdits(edits);
        } catch { toast.error('Ошибка загрузки'); }
        finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { void fetchAll(); }, [fetchAll]);

    // Pre-populate SLA edits for stages that have no setting yet
    useEffect(() => {
        setSlaEdits(prev => {
            const next = { ...prev };
            stages.forEach(s => {
                if (!next[s.code]) next[s.code] = { warn: '0', crit: '0', saving: false };
            });
            return next;
        });
    }, [stages, sla]);

    const buildActionData = (): Record<string, unknown> => {
        if (newActionType === 'send_whatsapp') return { message: newMsg };
        if (newActionType === 'assign_manager') return { manager_id: Number(newManagerId) };
        if (newActionType === 'create_task') {
            const d: Record<string, unknown> = { title: newTaskTitle };
            if (newDueHours) d.due_in_hours = Number(newDueHours);
            return d;
        }
        return {};
    };

    const handleAddRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newStage) return;
        setSaving(true);
        try {
            await api.post('/admin/automation/rules', {
                name: newName,
                trigger_stage_code: newStage,
                action_type: newActionType,
                action_data: buildActionData(),
            });
            toast.success('Правило создано');
            setShowAddForm(false);
            setNewName(''); setNewStage(''); setNewMsg(''); setNewManagerId(''); setNewTaskTitle(''); setNewDueHours('');
            void fetchAll();
        } catch { toast.error('Ошибка при создании'); }
        finally { setSaving(false); }
    };

    const toggleRule = async (rule: AutomationRule) => {
        setToggling(rule.id);
        try {
            await api.patch(`/admin/automation/rules/${rule.id}`, { is_active: !rule.is_active });
            setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
        } catch { toast.error('Ошибка'); }
        finally { setToggling(null); }
    };

    const deleteRule = async (id: number) => {
        setDeleting(id);
        try {
            await api.delete(`/admin/automation/rules/${id}`);
            setRules(prev => prev.filter(r => r.id !== id));
            toast.success('Правило удалено');
        } catch { toast.error('Ошибка при удалении'); }
        finally { setDeleting(null); }
    };

    const saveSLA = async (stageCode: string) => {
        setSlaEdits(prev => ({ ...prev, [stageCode]: { ...prev[stageCode], saving: true } }));
        try {
            await api.put('/admin/automation/sla', {
                stage_code: stageCode,
                warn_hours: Number(slaEdits[stageCode]?.warn ?? 0),
                crit_hours: Number(slaEdits[stageCode]?.crit ?? 0),
            });
            toast.success('SLA сохранён');
            onSLAUpdated();
        } catch { toast.error('Ошибка при сохранении SLA'); }
        finally { setSlaEdits(prev => ({ ...prev, [stageCode]: { ...prev[stageCode], saving: false } })); }
    };

    const actionSummary = (rule: AutomationRule): string => {
        const d = rule.action_data as Record<string, unknown>;
        if (rule.action_type === 'send_whatsapp') {
            const m = String(d.message ?? '');
            return m.length > 40 ? m.slice(0, 40) + '…' : m;
        }
        if (rule.action_type === 'assign_manager') {
            const mgr = managers.find(m => m.id === Number(d.manager_id));
            return mgr ? mgr.name : `Менеджер #${String(d.manager_id)}`;
        }
        if (rule.action_type === 'create_task') {
            const h = d.due_in_hours ? ` (через ${String(d.due_in_hours)} ч)` : '';
            return `«${String(d.title ?? '')}»${h}`;
        }
        return '';
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={24} /></div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* ── Automation rules ────────────────────────────────────────── */}
            <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={16} color={c.amber} strokeWidth={1.8} />
                        <span style={{ fontWeight: 700, fontSize: 15, color: c.text1 }}>Триггеры и автодействия</span>
                    </div>
                    <button
                        onClick={() => setShowAddForm(v => !v)}
                        style={btn(c.blue, { padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 })}
                    >
                        {showAddForm ? <ChevronUp size={14} /> : <Plus size={14} />}
                        {showAddForm ? 'Свернуть' : 'Добавить правило'}
                    </button>
                </div>

                {/* Add form */}
                {showAddForm && (
                    <form onSubmit={e => { void handleAddRule(e); }}
                        style={{ background: c.bgElevated, border: `1px solid ${c.border}`, borderRadius: 12, padding: 18, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <Field label="Название правила">
                                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Напр.: Сообщение при старте" style={inp()} required />
                            </Field>
                            <Field label="Триггер — при входе на этап">
                                <select value={newStage} onChange={e => setNewStage(e.target.value)} style={inp()} required>
                                    <option value="">— Выберите этап —</option>
                                    {stages.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                                </select>
                            </Field>
                        </div>
                        <Field label="Действие">
                            <select value={newActionType} onChange={e => setNewActionType(e.target.value as AutomationRule['action_type'])} style={inp()}>
                                <option value="create_task">Создать задачу</option>
                                <option value="send_whatsapp">Отправить WA-сообщение</option>
                                <option value="assign_manager">Назначить менеджера</option>
                            </select>
                        </Field>

                        {newActionType === 'send_whatsapp' && (
                            <Field label="Текст сообщения (можно использовать {name}, {phone})">
                                <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)} rows={3}
                                    placeholder="Здравствуйте, {name}! Ваша заявка принята." style={{ ...inp(), resize: 'vertical' }} required />
                            </Field>
                        )}
                        {newActionType === 'assign_manager' && (
                            <Field label="Назначить менеджера">
                                <select value={newManagerId} onChange={e => setNewManagerId(e.target.value)} style={inp()} required>
                                    <option value="">— Выберите —</option>
                                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </Field>
                        )}
                        {newActionType === 'create_task' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                                <Field label="Название задачи (можно {name})">
                                    <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                                        placeholder="Позвонить клиенту {name}" style={inp()} required />
                                </Field>
                                <Field label="Срок (ч)">
                                    <input type="number" min="0" value={newDueHours} onChange={e => setNewDueHours(e.target.value)}
                                        placeholder="2" style={{ ...inp(), width: 80 }} />
                                </Field>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowAddForm(false)}
                                style={btn('rgba(255,255,255,0.06)', { border: `1px solid ${c.border}`, color: c.text2, padding: '8px 16px' })}>
                                Отмена
                            </button>
                            <button type="submit" disabled={saving}
                                style={{ ...btn(c.blue, { padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6 }), opacity: saving ? 0.6 : 1 }}>
                                {saving && <Spinner size={13} color="#fff" />} Сохранить
                            </button>
                        </div>
                    </form>
                )}

                {/* Rules table */}
                {rules.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', color: c.text3, fontSize: 13 }}>
                        Нет правил — добавьте первое выше
                    </div>
                ) : (
                    <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                        {rules.map((rule, i) => {
                            const stageName = stages.find(s => s.code === rule.trigger_stage_code)?.name ?? rule.trigger_stage_code;
                            return (
                                <div key={rule.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                                    borderTop: i > 0 ? `1px solid ${c.border}` : 'none',
                                    opacity: rule.is_active ? 1 : 0.5,
                                }}>
                                    {/* Toggle */}
                                    <button onClick={() => { void toggleRule(rule); }} disabled={toggling === rule.id}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: rule.is_active ? c.green : c.text3 }}>
                                        {toggling === rule.id ? <Spinner size={18} /> :
                                            rule.is_active ? <ToggleRight size={22} strokeWidth={1.8} /> : <ToggleLeft size={22} strokeWidth={1.8} />}
                                    </button>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: c.text1 }}>{rule.name}</div>
                                        <div style={{ fontSize: 11, color: c.text2, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ background: 'rgba(59,130,246,0.1)', color: c.blue, padding: '1px 7px', borderRadius: 4 }}>
                                                При входе: {stageName}
                                            </span>
                                            <span style={{ background: 'rgba(245,158,11,0.1)', color: c.amber, padding: '1px 7px', borderRadius: 4 }}>
                                                {ACTION_LABELS[rule.action_type]}
                                            </span>
                                            <span style={{ color: c.text3 }}>{actionSummary(rule)}</span>
                                        </div>
                                    </div>

                                    <button onClick={() => { void deleteRule(rule.id); }} disabled={deleting === rule.id}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text3, padding: 4, borderRadius: 6 }}
                                        title="Удалить правило">
                                        {deleting === rule.id ? <Spinner size={14} /> : <Trash2 size={14} strokeWidth={1.8} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── SLA settings ────────────────────────────────────────────── */}
            <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <Clock size={16} color={c.red} strokeWidth={1.8} />
                    <span style={{ fontWeight: 700, fontSize: 15, color: c.text1 }}>SLA — контроль сроков</span>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: c.text2 }}>
                    Задайте время предупреждения и критического нарушения для каждого этапа.
                    При нарушении системный лог появится в Аналитике. 0 = отключено.
                </p>

                <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 80px', gap: 0 }}>
                        {['Этап', 'Предупр. (ч)', 'Критично (ч)', ''].map(h => (
                            <div key={h} style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: c.text3, textTransform: 'uppercase', borderBottom: `1px solid ${c.border}` }}>{h}</div>
                        ))}
                        {stages.filter(s => !s.is_success && !s.is_fail).map((stage, i) => {
                            const ed = slaEdits[stage.code] ?? { warn: '0', crit: '0', saving: false };
                            return (
                                <React.Fragment key={stage.code}>
                                    <div style={{ padding: '10px 14px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                                        <span style={{ fontSize: 13, color: c.text1 }}>{stage.name}</span>
                                    </div>
                                    <div style={{ padding: '6px 10px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', display: 'flex', alignItems: 'center' }}>
                                        <input type="number" min="0" value={ed.warn}
                                            onChange={e => setSlaEdits(p => ({ ...p, [stage.code]: { ...p[stage.code], warn: e.target.value } }))}
                                            style={{ ...inp(), padding: '5px 8px', width: '100%', textAlign: 'center' }} />
                                    </div>
                                    <div style={{ padding: '6px 10px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', display: 'flex', alignItems: 'center' }}>
                                        <input type="number" min="0" value={ed.crit}
                                            onChange={e => setSlaEdits(p => ({ ...p, [stage.code]: { ...p[stage.code], crit: e.target.value } }))}
                                            style={{ ...inp(), padding: '5px 8px', width: '100%', textAlign: 'center' }} />
                                    </div>
                                    <div style={{ padding: '6px 10px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', display: 'flex', alignItems: 'center' }}>
                                        <button onClick={() => { void saveSLA(stage.code); }} disabled={ed.saving}
                                            style={{ ...btn(c.blue, { padding: '5px 12px', fontSize: 12 }), opacity: ed.saving ? 0.6 : 1 }}>
                                            {ed.saving ? <Spinner size={12} color="#fff" /> : 'OK'}
                                        </button>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </section>
        </div>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: c.text2, marginBottom: 5 }}>{label}</div>
        {children}
    </div>
);
