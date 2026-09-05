import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, LayoutGrid } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import type { FieldDefinition, FieldStageVisibility, Stage, FieldVisibilityMode } from '../../types';
import { c, inp, btn } from '../../theme';

interface Props {
    stages: Stage[];
    fieldDefinitions: FieldDefinition[];
    fieldVisibility: FieldStageVisibility[];
    onRefresh: () => void;
}

type Tab = 'fields' | 'visibility';

const FIELD_TYPES = [
    { value: 'text', label: 'Текст' },
    { value: 'number', label: 'Число' },
    { value: 'list', label: 'Список' },
    { value: 'date', label: 'Дата' },
    { value: 'file', label: 'Файл' },
    { value: 'formula', label: 'Калькулятор' },
];

const VISIBILITY_OPTIONS: { value: FieldVisibilityMode; label: string; color: string; bg: string }[] = [
    { value: 'normal', label: 'Обычное', color: '#8a8a8a', bg: 'rgba(255,255,255,0.06)' },
    { value: 'required', label: 'Обязательное', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    { value: 'hidden', label: 'Скрытое', color: '#4a4a4f', bg: 'rgba(255,255,255,0.03)' },
];

export const FieldConstructor: React.FC<Props> = ({ stages, fieldDefinitions, fieldVisibility, onRefresh }) => {
    const toast = useToast();
    const [tab, setTab] = useState<Tab>('fields');

    const [name, setName] = useState('');
    const [key, setKey] = useState('');
    const [type, setType] = useState('text');
    const [options, setOptions] = useState('');
    const [formula, setFormula] = useState('');
    const [savingCreate, setSavingCreate] = useState(false);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editOptions, setEditOptions] = useState('');
    const [editFormula, setEditFormula] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const autoKey = (n: string) => n.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingCreate(true);
        try {
            await api.post('/admin/pipeline/field-definitions', {
                name, key, type,
                options: type === 'list' ? options.split(',').map(o => o.trim()).filter(Boolean) : [],
                formula: type === 'formula' ? formula : '',
                sort_order: fieldDefinitions.length + 1,
            });
            setName(''); setKey(''); setType('text'); setOptions(''); setFormula('');
            toast.success(`Поле «${name}» добавлено`);
            onRefresh();
        } catch { toast.error('Поле с таким кодом уже существует'); }
        finally { setSavingCreate(false); }
    };

    const startEdit = (f: FieldDefinition) => {
        setEditingId(f.id); setEditName(f.name);
        setEditOptions(f.options.join(', ')); setEditFormula(f.formula);
    };

    const saveEdit = async (id: number) => {
        setSavingEdit(true);
        try {
            const field = fieldDefinitions.find(f => f.id === id);
            await api.patch(`/admin/pipeline/field-definitions/${id}`, {
                name: editName,
                options: field?.type === 'list' ? editOptions.split(',').map(o => o.trim()).filter(Boolean) : [],
                formula: field?.type === 'formula' ? editFormula : '',
            });
            setEditingId(null);
            toast.success('Изменения сохранены');
            onRefresh();
        } catch { toast.error('Не удалось сохранить изменения'); }
        finally { setSavingEdit(false); }
    };

    const handleDelete = async (id: number, fieldName: string) => {
        if (!confirm('Удалить поле? Данные в карточках клиентов сохранятся.')) return;
        setDeletingId(id);
        try {
            await api.delete(`/admin/pipeline/field-definitions/${id}`);
            toast.success(`Поле «${fieldName}» удалено`);
            onRefresh();
        } catch { toast.error('Не удалось удалить поле'); }
        finally { setDeletingId(null); }
    };

    const getVisibilityMode = (fieldKey: string, stageCode: string): FieldVisibilityMode =>
        fieldVisibility.find(v => v.field_key === fieldKey && v.stage_code === stageCode)?.mode ?? 'normal';

    const handleVisibilityChange = async (fieldKey: string, stageCode: string, mode: FieldVisibilityMode) => {
        await api.put('/admin/pipeline/field-visibility', { field_key: fieldKey, stage_code: stageCode, mode });
        onRefresh();
    };

    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const si: React.CSSProperties = inp({ fontSize: 12, padding: '6px 9px' });

    const IBtn = ({ onClick, Icon, color, disabled, loading, label }: { onClick: () => void; Icon: React.FC<{ size?: number; strokeWidth?: number; color?: string }>; color?: string; disabled?: boolean; loading?: boolean; label?: string }) => (
        <button onClick={onClick} disabled={disabled || loading} aria-label={label} title={label}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: 'none', borderRadius: 7, cursor: disabled || loading ? 'default' : 'pointer', background: 'rgba(255,255,255,0.06)', transition: 'background 0.15s', opacity: disabled ? 0.3 : 1, flexShrink: 0 }}>
            {loading ? <Spinner size={12} color={c.text2} /> : <Icon size={13} color={color ?? c.text2} strokeWidth={2} />}
        </button>
    );

    return (
        <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, background: c.bgElevated, padding: '0 16px' }}>
                {(['fields', 'visibility'] as Tab[]).map(t => {
                    const labels: Record<Tab, string> = { fields: 'Конструктор полей', visibility: 'Видимость по этапам' };
                    return (
                        <button key={t} onClick={() => setTab(t)} style={{
                            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13,
                            fontWeight: tab === t ? 600 : 400,
                            color: tab === t ? c.text1 : c.text2,
                            borderBottom: `2px solid ${tab === t ? c.purple : 'transparent'}`,
                            transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap',
                        }}>{labels[t]}</button>
                    );
                })}
            </div>

            <div style={{ padding: 20 }}>

                {tab === 'fields' && (
                    <div>
                        <form onSubmit={e => { void handleCreate(e); }}
                            style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end', padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                            <div>
                                <div style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600 }}>Название</div>
                                <input style={{ ...si, width: 150 }} value={name} onChange={e => { setName(e.target.value); setKey(autoKey(e.target.value)); }} required />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600 }}>Ключ</div>
                                <input style={{ ...si, width: 120 }} value={key} onChange={e => setKey(e.target.value)} placeholder="auto" required />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600 }}>Тип</div>
                                <select style={{ ...si, minWidth: 120 }} value={type} onChange={e => setType(e.target.value)}>
                                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            {type === 'list' && (
                                <div>
                                    <div style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600 }}>Варианты (через запятую)</div>
                                    <input style={{ ...si, width: 200 }} value={options} onChange={e => setOptions(e.target.value)} placeholder="Вариант 1, Вариант 2" />
                                </div>
                            )}
                            {type === 'formula' && (
                                <div>
                                    <div style={{ fontSize: 11, color: c.text2, marginBottom: 4, fontWeight: 600 }}>Формула</div>
                                    <input style={{ ...si, width: 200 }} value={formula} onChange={e => setFormula(e.target.value)} placeholder="price * count" />
                                </div>
                            )}
                            <button type="submit" disabled={savingCreate} aria-busy={savingCreate}
                                style={{ ...btn(c.purple, { padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }), opacity: savingCreate ? 0.6 : 1, cursor: savingCreate ? 'default' : 'pointer', alignSelf: 'end' }}>
                                {savingCreate ? <Spinner size={13} color="#fff" /> : <Plus size={13} strokeWidth={2.5} />} Добавить поле
                            </button>
                        </form>

                        {fieldDefinitions.length === 0
                            ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10, textAlign: 'center' }}>
                                    <LayoutGrid size={28} color={c.text3} strokeWidth={1.5} />
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.text2 }}>Нет настроенных полей</p>
                                    <p style={{ margin: 0, fontSize: 12, color: c.text3 }}>Создайте первое поле карточки с помощью формы выше</p>
                                </div>
                            )
                            : (
                                <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${c.border}` }}>
                                    <table style={{ minWidth: 580, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                        <thead>
                                            <tr>
                                                {['Название', 'Ключ', 'Тип', 'Параметры', ''].map(h => (
                                                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: c.text2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(255,255,255,0.03)', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {fieldDefinitions.map(f => (
                                                <tr key={f.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                                    <td style={{ padding: '8px 12px', color: c.text1, fontWeight: 500 }}>
                                                        {editingId === f.id
                                                            ? <input style={{ ...si, width: 130 }} value={editName} onChange={e => setEditName(e.target.value)} />
                                                            : f.name}
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <code style={{ background: 'rgba(255,255,255,0.06)', color: c.text2, padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{f.key}</code>
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        <span style={{ background: 'rgba(139,92,246,0.15)', color: c.purple, padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                                            {FIELD_TYPES.find(t => t.value === f.type)?.label ?? f.type}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', color: c.text2, fontSize: 12 }}>
                                                        {editingId === f.id ? (
                                                            f.type === 'list'
                                                                ? <input style={{ ...si, width: 180 }} value={editOptions} onChange={e => setEditOptions(e.target.value)} />
                                                                : f.type === 'formula'
                                                                    ? <input style={{ ...si, width: 180 }} value={editFormula} onChange={e => setEditFormula(e.target.value)} />
                                                                    : <span style={{ color: c.text3 }}>—</span>
                                                        ) : (
                                                            f.type === 'list' ? (f.options.join(', ') || '—')
                                                                : f.type === 'formula' ? <code style={{ color: c.text2 }}>{f.formula || '—'}</code>
                                                                    : '—'
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '8px 12px' }}>
                                                        {editingId === f.id ? (
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                <IBtn onClick={() => void saveEdit(f.id)} Icon={Check} color={c.green} loading={savingEdit} label="Сохранить" />
                                                                <IBtn onClick={() => setEditingId(null)} Icon={X} disabled={savingEdit} label="Отмена" />
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                <IBtn onClick={() => startEdit(f)} Icon={Pencil} color={c.amber} label={`Редактировать ${f.name}`} />
                                                                <IBtn onClick={() => void handleDelete(f.id, f.name)} Icon={Trash2} color={c.red} loading={deletingId === f.id} label={`Удалить ${f.name}`} />
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

                {tab === 'visibility' && (
                    <div>
                        <p style={{ color: c.text2, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                            «Обязательное» блокирует переход на этап без заполнения поля.
                        </p>
                        {fieldDefinitions.length === 0
                            ? <p style={{ color: c.text3, fontSize: 13 }}>Сначала создайте поля на вкладке «Конструктор полей»</p>
                            : (
                                <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${c.border}` }}>
                                    <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 500, width: '100%' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                <th style={{ padding: '10px 14px', textAlign: 'left', color: c.text2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 160, borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>Поле</th>
                                                {sortedStages.map(s => (
                                                    <th key={s.id} style={{ padding: '10px 12px', textAlign: 'center', borderBottom: `1px solid ${c.border}`, minWidth: 120 }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                                            <div style={{ width: 8, height: 8, background: s.color, borderRadius: '50%', boxShadow: `0 0 6px ${s.color}80` }} />
                                                            <span style={{ fontSize: 11, color: c.text2, fontWeight: 600 }}>{s.name}</span>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {fieldDefinitions.map(f => (
                                                <tr key={f.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                                    <td style={{ padding: '8px 14px' }}>
                                                        <div style={{ fontWeight: 600, color: c.text1 }}>{f.name}</div>
                                                        <div style={{ color: c.text3, fontSize: 11 }}>{f.key}</div>
                                                    </td>
                                                    {sortedStages.map(s => {
                                                        const mode = getVisibilityMode(f.key, s.code);
                                                        const opt = VISIBILITY_OPTIONS.find(o => o.value === mode)!;
                                                        return (
                                                            <td key={s.id} style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                                <select
                                                                    value={mode}
                                                                    onChange={e => void handleVisibilityChange(f.key, s.code, e.target.value as FieldVisibilityMode)}
                                                                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${opt.color}40`, color: opt.color, background: opt.bg }}
                                                                >
                                                                    {VISIBILITY_OPTIONS.map(o => (
                                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                    </div>
                )}
            </div>
        </div>
    );
};
