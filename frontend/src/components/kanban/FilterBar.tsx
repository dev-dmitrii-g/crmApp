import React, { useState } from 'react';
import { Filter, X, Bookmark, BookmarkCheck, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import type { ClientFilters, SavedFilter, Stage, Manager } from '../../types';
import { emptyFilters } from '../../types';
import { c, inp, btn } from '../../theme';

interface Props {
    stages: Stage[];
    managers: Manager[];
    filters: ClientFilters;
    savedFilters: SavedFilter[];
    onApply: (f: ClientFilters) => void;
    onSavedFiltersChange: (sf: SavedFilter[]) => void;
}

const isActive = (f: ClientFilters) =>
    Object.values(f).some(v => v !== '');

export const FilterBar: React.FC<Props> = ({
    stages, managers, filters, savedFilters, onApply, onSavedFiltersChange,
}) => {
    const toast = useToast();
    const [open, setOpen] = useState(false);
    const [local, setLocal] = useState<ClientFilters>(filters);
    const [saveName, setSaveName] = useState('');
    const [saving, setSaving] = useState(false);

    const set = (k: keyof ClientFilters, v: string) =>
        setLocal(prev => ({ ...prev, [k]: v }));

    const apply = () => { onApply(local); setOpen(false); };
    const reset = () => { setLocal(emptyFilters()); onApply(emptyFilters()); };

    const handleSave = async () => {
        if (!saveName.trim()) return;
        setSaving(true);
        try {
            const r = await api.post<SavedFilter>('/saved-filters', { name: saveName.trim(), params: local });
            onSavedFiltersChange([r.data, ...savedFilters]);
            setSaveName('');
            toast.success('Фильтр сохранён');
        } catch { toast.error('Не удалось сохранить'); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: number) => {
        await api.delete(`/saved-filters/${id}`);
        onSavedFiltersChange(savedFilters.filter(f => f.id !== id));
    };

    const activeCount = Object.values(local).filter(v => v !== '').length;

    return (
        <div style={{ borderBottom: `1px solid ${c.border}`, background: c.bgCard, flexShrink: 0 }}>
            {/* Toggle row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px' }}>
                <button
                    onClick={() => setOpen(o => !o)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: isActive(filters) ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isActive(filters) ? 'rgba(59,130,246,0.4)' : c.border}`,
                        borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
                        color: isActive(filters) ? c.blue : c.text2, fontSize: 12, fontWeight: 600,
                    }}
                >
                    <Filter size={13} strokeWidth={2} />
                    Фильтры
                    {activeCount > 0 && (
                        <span style={{ background: c.blue, color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {activeCount}
                        </span>
                    )}
                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {/* Saved filter chips */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
                    {savedFilters.map(sf => (
                        <div key={sf.id} style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                            <button
                                onClick={() => { setLocal(sf.params); onApply(sf.params); }}
                                style={{
                                    padding: '3px 10px', border: `1px solid ${c.border}`, borderRadius: '6px 0 0 6px',
                                    background: 'rgba(255,255,255,0.04)', color: c.text2,
                                    fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                            >
                                <BookmarkCheck size={10} style={{ marginRight: 4 }} />
                                {sf.name}
                            </button>
                            <button
                                onClick={() => { void handleDelete(sf.id); }}
                                style={{
                                    padding: '3px 6px', border: `1px solid ${c.border}`, borderLeft: 'none',
                                    borderRadius: '0 6px 6px 0', background: 'rgba(255,255,255,0.04)',
                                    color: c.text3, cursor: 'pointer', fontSize: 11,
                                }}
                            >✕</button>
                        </div>
                    ))}
                </div>

                {isActive(filters) && (
                    <button onClick={reset} style={{ ...btn('transparent', { border: 'none', color: c.text3, fontSize: 11, padding: '4px 8px', cursor: 'pointer' }) }}>
                        <X size={12} /> Сбросить
                    </button>
                )}
            </div>

            {/* Expanded filter panel */}
            {open && (
                <div style={{ padding: '12px 16px 14px', borderTop: `1px solid ${c.border}` }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <FilterField label="Поиск">
                            <input
                                placeholder="Имя или телефон..."
                                value={local.search}
                                onChange={e => set('search', e.target.value)}
                                style={{ ...inp(), width: 180, fontSize: 12 }}
                            />
                        </FilterField>

                        {managers.length > 0 && (
                            <FilterField label="Менеджер">
                                <Select value={local.manager_id} onChange={v => set('manager_id', v)}>
                                    <option value="">Все</option>
                                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </Select>
                            </FilterField>
                        )}

                        <FilterField label="Этап">
                            <Select value={local.stage} onChange={v => set('stage', v)}>
                                <option value="">Все этапы</option>
                                {stages.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                            </Select>
                        </FilterField>

                        <FilterField label="Задачи">
                            <Select value={local.has_tasks} onChange={v => set('has_tasks', v)}>
                                <option value="">Любые</option>
                                <option value="1">Есть открытые</option>
                                <option value="0">Без задач</option>
                            </Select>
                        </FilterField>

                        <FilterField label="Дата от">
                            <input
                                type="date" value={local.date_from}
                                onChange={e => set('date_from', e.target.value)}
                                style={{ ...inp(), fontSize: 12 }}
                            />
                        </FilterField>

                        <FilterField label="Дата до">
                            <input
                                type="date" value={local.date_to}
                                onChange={e => set('date_to', e.target.value)}
                                style={{ ...inp(), fontSize: 12 }}
                            />
                        </FilterField>

                        <FilterField label="Сумма от">
                            <input
                                type="number" placeholder="0" value={local.min_amount}
                                onChange={e => set('min_amount', e.target.value)}
                                style={{ ...inp(), width: 100, fontSize: 12 }}
                            />
                        </FilterField>

                        <FilterField label="Сумма до">
                            <input
                                type="number" placeholder="∞" value={local.max_amount}
                                onChange={e => set('max_amount', e.target.value)}
                                style={{ ...inp(), width: 100, fontSize: 12 }}
                            />
                        </FilterField>

                        <button onClick={apply} style={btn(c.blue, { padding: '7px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8 })}>
                            Применить
                        </button>
                        <button onClick={reset} style={btn('rgba(255,255,255,0.06)', { padding: '7px 12px', fontSize: 12, borderRadius: 8, border: `1px solid ${c.border}`, color: c.text2 })}>
                            Сбросить
                        </button>
                    </div>

                    {/* Save filter row */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.border}` }}>
                        <Bookmark size={13} color={c.text3} />
                        <input
                            placeholder='Название фильтра (напр. "Без задач")'
                            value={saveName}
                            onChange={e => setSaveName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
                            style={{ ...inp(), flex: 1, maxWidth: 280, fontSize: 12 }}
                        />
                        <button
                            onClick={() => { void handleSave(); }}
                            disabled={!saveName.trim() || saving}
                            style={{ ...btn(c.green, { padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, opacity: (!saveName.trim() || saving) ? 0.5 : 1 }) }}
                        >
                            Сохранить
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
        {children}
    </div>
);

const Select: React.FC<{ value: string; onChange: (v: string) => void; children: React.ReactNode }> = ({ value, onChange, children }) => (
    <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${c.border}`,
            borderRadius: 8, color: c.text1, fontSize: 12, padding: '7px 10px', cursor: 'pointer',
        }}
    >
        {children}
    </select>
);
