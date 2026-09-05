import React, { useState } from 'react';
import api from '../../services/api';
import type { FieldDefinition, FieldStageVisibility, Stage, FieldVisibilityMode } from '../../types';

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

const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 };
const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '5px 12px', background: bg, color, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
});

const VISIBILITY_OPTIONS: { value: FieldVisibilityMode; label: string; color: string }[] = [
    { value: 'normal', label: 'Обычное', color: '#6b7280' },
    { value: 'required', label: 'Обязательное', color: '#dc2626' },
    { value: 'hidden', label: 'Скрытое', color: '#9ca3af' },
];

export const FieldConstructor: React.FC<Props> = ({ stages, fieldDefinitions, fieldVisibility, onRefresh }) => {
    const [tab, setTab] = useState<Tab>('fields');

    // New field form
    const [name, setName] = useState('');
    const [key, setKey] = useState('');
    const [type, setType] = useState('text');
    const [options, setOptions] = useState(''); // comma-separated
    const [formula, setFormula] = useState('');

    // Edit
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editOptions, setEditOptions] = useState('');
    const [editFormula, setEditFormula] = useState('');

    const autoKey = (n: string) =>
        n.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/admin/pipeline/field-definitions', {
                name, key,
                type,
                options: type === 'list' ? options.split(',').map(o => o.trim()).filter(Boolean) : [],
                formula: type === 'formula' ? formula : '',
                sort_order: fieldDefinitions.length + 1,
            });
            setName(''); setKey(''); setType('text'); setOptions(''); setFormula('');
            onRefresh();
        } catch { alert('Поле с таким кодом уже существует'); }
    };

    const startEdit = (f: FieldDefinition) => {
        setEditingId(f.id);
        setEditName(f.name);
        setEditOptions(f.options.join(', '));
        setEditFormula(f.formula);
    };

    const saveEdit = async (id: number) => {
        const field = fieldDefinitions.find(f => f.id === id);
        await api.patch(`/admin/pipeline/field-definitions/${id}`, {
            name: editName,
            options: field?.type === 'list' ? editOptions.split(',').map(o => o.trim()).filter(Boolean) : [],
            formula: field?.type === 'formula' ? editFormula : '',
        });
        setEditingId(null);
        onRefresh();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить поле? Данные в карточках клиентов сохранятся.')) return;
        await api.delete(`/admin/pipeline/field-definitions/${id}`);
        onRefresh();
    };

    const getVisibilityMode = (fieldKey: string, stageCode: string): FieldVisibilityMode => {
        const rule = fieldVisibility.find(v => v.field_key === fieldKey && v.stage_code === stageCode);
        return rule?.mode ?? 'normal';
    };

    const handleVisibilityChange = async (fieldKey: string, stageCode: string, mode: FieldVisibilityMode) => {
        await api.put('/admin/pipeline/field-visibility', { field_key: fieldKey, stage_code: stageCode, mode });
        onRefresh();
    };

    const tabStyle = (t: Tab): React.CSSProperties => ({
        padding: '7px 16px', border: 'none',
        borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent',
        background: 'none', cursor: 'pointer',
        fontWeight: tab === t ? 600 : 400,
        color: tab === t ? '#7c3aed' : '#6b7280', fontSize: 13,
    });

    const sortedStages = [...stages].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0 8px', background: '#faf5ff' }}>
                <button style={tabStyle('fields')} onClick={() => setTab('fields')}>Конструктор полей</button>
                <button style={tabStyle('visibility')} onClick={() => setTab('visibility')}>Видимость по этапам</button>
            </div>

            <div style={{ padding: 20 }}>

                {tab === 'fields' && (
                    <div>
                        <form onSubmit={e => { void handleCreate(e); }} style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div>
                                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Название</div>
                                <input style={{ ...inp, width: 160 }} value={name} onChange={e => { setName(e.target.value); if (!editingId) setKey(autoKey(e.target.value)); }} required />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Ключ (латиница)</div>
                                <input style={{ ...inp, width: 120 }} value={key} onChange={e => setKey(e.target.value)} placeholder="auto" required />
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Тип</div>
                                <select style={{ ...inp, minWidth: 120 }} value={type} onChange={e => setType(e.target.value)}>
                                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            {type === 'list' && (
                                <div>
                                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Варианты (через запятую)</div>
                                    <input style={{ ...inp, width: 200 }} value={options} onChange={e => setOptions(e.target.value)} placeholder="Вариант 1, Вариант 2" />
                                </div>
                            )}
                            {type === 'formula' && (
                                <div>
                                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>Формула (ключи полей)</div>
                                    <input style={{ ...inp, width: 200 }} value={formula} onChange={e => setFormula(e.target.value)} placeholder="price * count" />
                                </div>
                            )}
                            <button type="submit" style={btn('#7c3aed')}>+ Добавить поле</button>
                        </form>

                        {fieldDefinitions.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13 }}>Нет настроенных полей</p>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#faf5ff', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 10px' }}>Название</th>
                                        <th style={{ padding: '8px 10px' }}>Ключ</th>
                                        <th style={{ padding: '8px 10px' }}>Тип</th>
                                        <th style={{ padding: '8px 10px' }}>Параметры</th>
                                        <th style={{ padding: '8px 10px' }}>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fieldDefinitions.map(f => (
                                        <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '8px 10px' }}>
                                                {editingId === f.id
                                                    ? <input style={{ ...inp, width: 140 }} value={editName} onChange={e => setEditName(e.target.value)} />
                                                    : <strong>{f.name}</strong>
                                                }
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <code style={{ background: '#f3f4f6', padding: '2px 5px', borderRadius: 3 }}>{f.key}</code>
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <span style={{ background: '#ede9fe', color: '#7c3aed', padding: '2px 7px', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>
                                                    {FIELD_TYPES.find(t => t.value === f.type)?.label ?? f.type}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px', color: '#6b7280', fontSize: 12 }}>
                                                {editingId === f.id ? (
                                                    f.type === 'list'
                                                        ? <input style={{ ...inp, width: 180 }} value={editOptions} onChange={e => setEditOptions(e.target.value)} placeholder="Вариант 1, Вариант 2" />
                                                        : f.type === 'formula'
                                                            ? <input style={{ ...inp, width: 180 }} value={editFormula} onChange={e => setEditFormula(e.target.value)} placeholder="price * count" />
                                                            : <span style={{ color: '#9ca3af' }}>—</span>
                                                ) : (
                                                    f.type === 'list' ? f.options.join(', ') || '—'
                                                        : f.type === 'formula' ? <code>{f.formula || '—'}</code>
                                                            : '—'
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                {editingId === f.id ? (
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button onClick={() => void saveEdit(f.id)} style={btn('#10b981')}>Сохранить</button>
                                                        <button onClick={() => setEditingId(null)} style={btn('#6b7280')}>Отмена</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button onClick={() => startEdit(f)} style={btn('#f59e0b')}>Изменить</button>
                                                        <button onClick={() => void handleDelete(f.id)} style={btn('#ef4444')}>Удалить</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {tab === 'visibility' && (
                    <div>
                        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
                            Настройте как поле отображается на каждом этапе воронки. «Обязательное» блокирует переход на этап без заполнения поля.
                        </p>
                        {fieldDefinitions.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: 13 }}>Сначала создайте поля на вкладке «Конструктор полей»</p>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                                    <thead>
                                        <tr style={{ background: '#faf5ff' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', minWidth: 160 }}>Поле</th>
                                            {sortedStages.map(s => (
                                                <th key={s.id} style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '2px solid #e5e7eb', minWidth: 120 }}>
                                                    <div style={{ width: 8, height: 8, background: s.color, borderRadius: '50%', display: 'inline-block', marginRight: 4 }} />
                                                    {s.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fieldDefinitions.map(f => (
                                            <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontWeight: 600 }}>{f.name}</div>
                                                    <div style={{ color: '#9ca3af', fontSize: 11 }}>{f.key}</div>
                                                </td>
                                                {sortedStages.map(s => {
                                                    const mode = getVisibilityMode(f.key, s.code);
                                                    const opt = VISIBILITY_OPTIONS.find(o => o.value === mode)!;
                                                    return (
                                                        <td key={s.id} style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                            <select
                                                                value={mode}
                                                                onChange={e => void handleVisibilityChange(f.key, s.code, e.target.value as FieldVisibilityMode)}
                                                                style={{
                                                                    fontSize: 11, padding: '3px 6px', borderRadius: 4,
                                                                    border: `1px solid ${opt.color}`,
                                                                    color: opt.color, background: '#fff', cursor: 'pointer',
                                                                }}
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
