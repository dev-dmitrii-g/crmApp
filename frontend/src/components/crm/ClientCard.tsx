import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, Check, X, Plus, CheckSquare, Square, Clock } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import { c, inp as themeInp, btn } from '../../theme';
import { formatPhone } from '../../utils';
import type { Client, Stage, FieldDefinition, FieldStageVisibility, Contact, Company, ClientCounterparties, Task } from '../../types';

interface Props {
    client: Client;
    stages: Stage[];
    fieldDefinitions: FieldDefinition[];
    fieldVisibility: FieldStageVisibility[];
    onClose: () => void;
    onRefresh: () => void;
}

type CardTab = 'fields' | 'counterparties' | 'tasks';

const inp: React.CSSProperties = themeInp();

const evaluateFormula = (formula: string, values: Record<string, string>): string => {
    try {
        const expr = formula.replace(/\b([a-z_][a-z0-9_]*)\b/g, (match) => {
            const v = values[match];
            return v && !isNaN(Number(v)) ? v : '0';
        });
        // eslint-disable-next-line no-new-func
        return String(new Function('return (' + expr + ')')());
    } catch {
        return '—';
    }
};


export const ClientCard: React.FC<Props> = ({
    client, stages, fieldDefinitions, fieldVisibility, onClose, onRefresh,
}) => {
    const toast = useToast();
    const [tab, setTab] = useState<CardTab>('fields');
    const [fieldValues, setFieldValues] = useState<Record<string, string>>(client.custom_fields ?? {});
    const [saving, setSaving] = useState(false);

    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(client.name);
    const [editPhone, setEditPhone] = useState(client.phone);
    const [savingEdit, setSavingEdit] = useState(false);

    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [counterparties, setCounterparties] = useState<ClientCounterparties>({ contacts: [], companies: [] });
    const [allContacts, setAllContacts] = useState<Contact[]>([]);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [contactSearch, setContactSearch] = useState('');
    const [companySearch, setCompanySearch] = useState('');

    const [tasks, setTasks] = useState<Task[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskDue, setNewTaskDue] = useState('');
    const [addingTask, setAddingTask] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadFieldKey, setUploadFieldKey] = useState('');

    const currentStage = stages.find(s => s.code === client.status);

    useEffect(() => {
        void loadCounterparties();
        void loadAllContacts();
        void loadAllCompanies();
    }, []);

    useEffect(() => {
        if (tab === 'tasks') void loadTasks();
    }, [tab]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (confirmDelete) { setConfirmDelete(false); return; }
                if (editing) { setEditing(false); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [confirmDelete, editing, onClose]);

    const loadTasks = async () => {
        setLoadingTasks(true);
        try {
            const r = await api.get<Task[]>(`/automation/tasks?client_id=${client.id}`);
            setTasks(r.data || []);
        } catch { toast.error('Ошибка загрузки задач'); }
        finally { setLoadingTasks(false); }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;
        setAddingTask(true);
        try {
            await api.post('/automation/tasks', { client_id: client.id, title: newTaskTitle.trim(), due_at: newTaskDue });
            setNewTaskTitle(''); setNewTaskDue('');
            await loadTasks();
            onRefresh();
        } catch { toast.error('Ошибка создания задачи'); }
        finally { setAddingTask(false); }
    };

    const handleToggleTask = async (task: Task) => {
        try {
            await api.patch(`/automation/tasks/${task.id}`, { completed: !task.completed });
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
            onRefresh();
        } catch { toast.error('Ошибка'); }
    };

    const handleDeleteTask = async (taskId: number) => {
        try {
            await api.delete(`/automation/tasks/${taskId}`);
            setTasks(prev => prev.filter(t => t.id !== taskId));
            onRefresh();
        } catch { toast.error('Ошибка удаления'); }
    };

    const loadCounterparties = async () => {
        const res = await api.get<ClientCounterparties>(`/clients/${client.id}/counterparties`);
        setCounterparties(res.data);
    };
    const loadAllContacts = async () => {
        const res = await api.get<Contact[]>('/contacts');
        setAllContacts(res.data || []);
    };
    const loadAllCompanies = async () => {
        const res = await api.get<Company[]>('/companies');
        setAllCompanies(res.data || []);
    };

    const visibleFields = fieldDefinitions.filter(f => {
        const rule = fieldVisibility.find(v => v.field_key === f.key && v.stage_code === client.status);
        return rule?.mode !== 'hidden';
    });

    const isRequired = (fieldKey: string): boolean => {
        const rule = fieldVisibility.find(v => v.field_key === fieldKey && v.stage_code === client.status);
        return rule?.mode === 'required';
    };

    const handleSaveFields = async () => {
        setSaving(true);
        try {
            await api.patch(`/clients/${client.id}/fields`, { custom_fields: fieldValues });
            toast.success('Поля сохранены');
            onRefresh();
        } catch {
            toast.error('Ошибка сохранения полей');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!editName.trim()) { toast.error('Имя не может быть пустым'); return; }
        setSavingEdit(true);
        try {
            await api.patch(`/clients/${client.id}`, { name: editName.trim(), phone: editPhone.trim() });
            toast.success('Карточка обновлена');
            setEditing(false);
            onRefresh();
        } catch {
            toast.error('Ошибка сохранения');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/clients/${client.id}`);
            toast.success(`Клиент «${client.name}» удалён`);
            onClose();
            onRefresh();
        } catch {
            toast.error('Ошибка удаления клиента');
            setDeleting(false);
        }
    };

    const triggerFileUpload = (fieldKey: string) => {
        setUploadFieldKey(fieldKey);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadFieldKey) return;
        const formData = new FormData();
        formData.append('field_key', uploadFieldKey);
        formData.append('file', file);
        try {
            const res = await api.post<{ url: string }>(`/clients/${client.id}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setFieldValues(prev => ({ ...prev, [uploadFieldKey]: res.data.url }));
        } catch {
            toast.error('Ошибка загрузки файла');
        }
        e.target.value = '';
    };

    const renderFieldInput = (f: FieldDefinition) => {
        const val = fieldValues[f.key] ?? '';
        const required = isRequired(f.key);
        const labelStyle: React.CSSProperties = {
            fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
            color: required ? c.red : c.text2,
        };

        switch (f.type) {
            case 'text':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{f.name}{required ? ' *' : ''}</label>
                        <input style={inp} type="text" value={val}
                            onChange={e => setFieldValues(p => ({ ...p, [f.key]: e.target.value }))} />
                    </div>
                );
            case 'number':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{f.name}{required ? ' *' : ''}</label>
                        <input style={inp} type="number" value={val}
                            onChange={e => setFieldValues(p => ({ ...p, [f.key]: e.target.value }))} />
                    </div>
                );
            case 'list':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{f.name}{required ? ' *' : ''}</label>
                        <select style={inp} value={val}
                            onChange={e => setFieldValues(p => ({ ...p, [f.key]: e.target.value }))}>
                            <option value="">— Выберите —</option>
                            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                );
            case 'date':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{f.name}{required ? ' *' : ''}</label>
                        <input style={inp} type="date" value={val}
                            onChange={e => setFieldValues(p => ({ ...p, [f.key]: e.target.value }))} />
                    </div>
                );
            case 'file':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{f.name}{required ? ' *' : ''}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {val
                                ? <a href={val} target="_blank" rel="noreferrer" style={{ color: c.blue, fontSize: 12, textDecoration: 'underline' }}>Открыть файл</a>
                                : <span style={{ color: c.text3, fontSize: 12 }}>Файл не загружен</span>
                            }
                            <button onClick={() => triggerFileUpload(f.key)}
                                style={btn(c.bgElevated, { border: `1px solid ${c.border}`, color: c.text1, fontSize: 12 })}>
                                Загрузить
                            </button>
                        </div>
                    </div>
                );
            case 'formula':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={{ ...labelStyle, color: c.purple }}>{f.name} (авто)</label>
                        <div style={{ padding: '7px 9px', background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.25)`, borderRadius: 6, fontSize: 14, fontWeight: 'bold', color: c.purple }}>
                            {evaluateFormula(f.formula, fieldValues)}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    const linkedContactIds = new Set(counterparties.contacts.map(ct => ct.id));
    const linkedCompanyIds = new Set(counterparties.companies.map(co => co.id));

    const filteredContacts = allContacts.filter(ct =>
        !linkedContactIds.has(ct.id) &&
        (ct.name.toLowerCase().includes(contactSearch.toLowerCase()) || ct.phone.includes(contactSearch))
    );
    const filteredCompanies = allCompanies.filter(co =>
        !linkedCompanyIds.has(co.id) &&
        (co.name.toLowerCase().includes(companySearch.toLowerCase()) || co.inn.includes(companySearch))
    );

    const linkContact = async (contactId: number) => {
        await api.post(`/clients/${client.id}/contacts`, { contact_id: contactId });
        await loadCounterparties();
        setContactSearch('');
    };
    const unlinkContact = async (contactId: number) => {
        await api.delete(`/clients/${client.id}/contacts/${contactId}`);
        await loadCounterparties();
    };
    const linkCompany = async (companyId: number) => {
        await api.post(`/clients/${client.id}/companies`, { company_id: companyId });
        await loadCounterparties();
        setCompanySearch('');
    };
    const unlinkCompany = async (companyId: number) => {
        await api.delete(`/clients/${client.id}/companies/${companyId}`);
        await loadCounterparties();
    };

    const tabStyle = (t: CardTab): React.CSSProperties => ({
        flex: 1, padding: '10px', border: 'none',
        borderBottom: tab === t ? `2px solid ${c.blue}` : `2px solid transparent`,
        background: 'none', cursor: 'pointer',
        fontWeight: tab === t ? 600 : 400,
        color: tab === t ? c.blue : c.text2, fontSize: 13,
        whiteSpace: 'nowrap',
    });

    const counterpartyRow: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 10px', background: c.bgElevated, border: `1px solid ${c.border}`,
        borderRadius: 6, marginBottom: 6,
    };

    const iconBtn = (hoverColor: string): React.CSSProperties => ({
        background: 'none', border: 'none', cursor: 'pointer',
        color: c.text3, padding: 6, borderRadius: 6,
        display: 'flex', alignItems: 'center', transition: 'color 0.15s',
    });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
            role="dialog" aria-modal="true">
            <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 10, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${c.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {editing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <input
                                    style={{ ...inp, fontSize: 15, fontWeight: 600 }}
                                    value={editName}
                                    placeholder="Имя клиента"
                                    onChange={e => setEditName(e.target.value)}
                                    autoFocus
                                />
                                <input
                                    style={{ ...inp, opacity: client.phone.startsWith('lid_') ? 0.5 : 1 }}
                                    value={editPhone}
                                    placeholder="Телефон"
                                    onChange={e => setEditPhone(e.target.value)}
                                    disabled={client.phone.startsWith('lid_')}
                                    title={client.phone.startsWith('lid_') ? 'Телефон LID нельзя изменить' : undefined}
                                />
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => void handleSaveEdit()} disabled={savingEdit}
                                        style={btn(c.blue, { display: 'flex', alignItems: 'center', gap: 4, opacity: savingEdit ? 0.7 : 1 })}>
                                        {savingEdit ? <Spinner size={12} /> : <Check size={13} />} Сохранить
                                    </button>
                                    <button onClick={() => { setEditing(false); setEditName(client.name); setEditPhone(client.phone); }}
                                        style={btn(c.bgElevated, { border: `1px solid ${c.border}`, color: c.text2, display: 'flex', alignItems: 'center', gap: 4 })}>
                                        <X size={13} /> Отмена
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <h3 style={{ margin: 0, fontSize: 17, color: c.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</h3>
                                <div style={{ color: c.text2, fontSize: 13, marginTop: 3 }}>{formatPhone(client.phone)}</div>
                                {currentStage && (
                                    <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 8px', background: currentStage.color + '22', color: currentStage.color, borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                                        {currentStage.name}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {!editing && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                            <button onClick={() => setEditing(true)} title="Редактировать" style={iconBtn(c.blue)}
                                onMouseEnter={e => (e.currentTarget.style.color = c.blue)}
                                onMouseLeave={e => (e.currentTarget.style.color = c.text3)}>
                                <Pencil size={15} />
                            </button>
                            <button onClick={() => setConfirmDelete(true)} title="Удалить клиента" style={iconBtn(c.red)}
                                onMouseEnter={e => (e.currentTarget.style.color = c.red)}
                                onMouseLeave={e => (e.currentTarget.style.color = c.text3)}>
                                <Trash2 size={15} />
                            </button>
                            <button onClick={onClose} style={{ ...iconBtn(c.text1), fontSize: 18, lineHeight: 1 }}
                                onMouseEnter={e => (e.currentTarget.style.color = c.text1)}
                                onMouseLeave={e => (e.currentTarget.style.color = c.text3)}>
                                ✕
                            </button>
                        </div>
                    )}
                </div>

                {/* Delete confirmation banner */}
                {confirmDelete && (
                    <div style={{ padding: '12px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: `1px solid rgba(239,68,68,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ color: c.red, fontSize: 13, fontWeight: 500 }}>
                            Удалить клиента «{client.name}»? Это нельзя отменить.
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => void handleDelete()} disabled={deleting}
                                style={btn(c.red, { display: 'flex', alignItems: 'center', gap: 4, opacity: deleting ? 0.7 : 1 })}>
                                {deleting && <Spinner size={12} />} Удалить
                            </button>
                            <button onClick={() => setConfirmDelete(false)}
                                style={btn(c.bgElevated, { border: `1px solid ${c.border}`, color: c.text2 })}>
                                Отмена
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}` }}>
                    <button style={tabStyle('fields')} onClick={() => setTab('fields')}>Поля карточки</button>
                    <button style={tabStyle('counterparties')} onClick={() => setTab('counterparties')}>
                        Контрагенты {(counterparties.contacts.length + counterparties.companies.length) > 0
                            ? `(${counterparties.contacts.length + counterparties.companies.length})`
                            : ''}
                    </button>
                    <button style={tabStyle('tasks')} onClick={() => setTab('tasks')}>
                        Задачи {(client.open_tasks_count ?? 0) > 0 ? `(${client.open_tasks_count})` : ''}
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

                    {tab === 'fields' && (
                        <div>
                            {visibleFields.length === 0 ? (
                                <p style={{ color: c.text3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                                    Нет полей для этого этапа.<br />Настройте поля в Админке → Конструктор полей.
                                </p>
                            ) : (
                                visibleFields.map(f => renderFieldInput(f))
                            )}
                            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => { void handleFileChange(e); }} />
                        </div>
                    )}

                    {tab === 'counterparties' && (
                        <div>
                            <h4 style={{ margin: '0 0 10px', fontSize: 14, color: c.text1 }}>Контакты</h4>
                            {counterparties.contacts.length === 0
                                ? <p style={{ color: c.text3, fontSize: 13 }}>Нет связанных контактов</p>
                                : counterparties.contacts.map(ct => (
                                    <div key={ct.id} style={counterpartyRow}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: c.text1 }}>{ct.name}</div>
                                            <div style={{ fontSize: 12, color: c.text2 }}>{ct.phone}{ct.company_name ? ` · ${ct.company_name}` : ''}</div>
                                        </div>
                                        <button onClick={() => void unlinkContact(ct.id)}
                                            style={{ background: 'none', border: 'none', color: c.text3, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
                                            onMouseEnter={e => (e.currentTarget.style.color = c.red)}
                                            onMouseLeave={e => (e.currentTarget.style.color = c.text3)}>×</button>
                                    </div>
                                ))
                            }
                            <div style={{ marginTop: 8 }}>
                                <input style={{ ...inp, marginBottom: 6 }} type="text" placeholder="Поиск контакта..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
                                {contactSearch && filteredContacts.slice(0, 5).map(ct => (
                                    <div key={ct.id} onClick={() => void linkContact(ct.id)}
                                        style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 13, background: 'rgba(59,130,246,0.08)', border: `1px solid rgba(59,130,246,0.18)`, marginBottom: 3, color: c.text1 }}>
                                        <strong>{ct.name}</strong> {ct.phone && `· ${ct.phone}`} {ct.company_name && `· ${ct.company_name}`}
                                    </div>
                                ))}
                            </div>

                            <hr style={{ margin: '16px 0', border: 'none', borderTop: `1px solid ${c.border}` }} />

                            <h4 style={{ margin: '0 0 10px', fontSize: 14, color: c.text1 }}>Компании</h4>
                            {counterparties.companies.length === 0
                                ? <p style={{ color: c.text3, fontSize: 13 }}>Нет связанных компаний</p>
                                : counterparties.companies.map(co => (
                                    <div key={co.id} style={counterpartyRow}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: c.text1 }}>{co.name}</div>
                                            <div style={{ fontSize: 12, color: c.text2 }}>{co.inn ? `ИНН: ${co.inn}` : ''}{co.phone ? ` · ${co.phone}` : ''}</div>
                                        </div>
                                        <button onClick={() => void unlinkCompany(co.id)}
                                            style={{ background: 'none', border: 'none', color: c.text3, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
                                            onMouseEnter={e => (e.currentTarget.style.color = c.red)}
                                            onMouseLeave={e => (e.currentTarget.style.color = c.text3)}>×</button>
                                    </div>
                                ))
                            }
                            <div style={{ marginTop: 8 }}>
                                <input style={{ ...inp, marginBottom: 6 }} type="text" placeholder="Поиск компании по ИНН или названию..." value={companySearch} onChange={e => setCompanySearch(e.target.value)} />
                                {companySearch && filteredCompanies.slice(0, 5).map(co => (
                                    <div key={co.id} onClick={() => void linkCompany(co.id)}
                                        style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 13, background: 'rgba(16,185,129,0.08)', border: `1px solid rgba(16,185,129,0.18)`, marginBottom: 3, color: c.text1 }}>
                                        <strong>{co.name}</strong> {co.inn && `· ИНН: ${co.inn}`}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'tasks' && (
                        <div>
                            {/* Add task form */}
                            <form onSubmit={e => { void handleAddTask(e); }}
                                style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: c.text2, marginBottom: 4 }}>Новая задача</div>
                                    <input
                                        style={inp}
                                        placeholder="Название задачи..."
                                        value={newTaskTitle}
                                        onChange={e => setNewTaskTitle(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: c.text2, marginBottom: 4 }}>Срок</div>
                                    <input
                                        type="datetime-local"
                                        style={{ ...inp, fontSize: 12 }}
                                        value={newTaskDue}
                                        onChange={e => setNewTaskDue(e.target.value)}
                                    />
                                </div>
                                <button type="submit" disabled={addingTask || !newTaskTitle.trim()}
                                    style={{ ...btn(c.blue, { display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px' }), opacity: addingTask || !newTaskTitle.trim() ? 0.5 : 1 }}>
                                    {addingTask ? <Spinner size={13} /> : <Plus size={14} />}
                                </button>
                            </form>

                            {loadingTasks ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><Spinner size={20} /></div>
                            ) : tasks.length === 0 ? (
                                <p style={{ color: c.text3, fontSize: 13, textAlign: 'center', marginTop: 20 }}>Нет задач</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {tasks.map(task => (
                                        <div key={task.id} style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 10,
                                            padding: '10px 12px',
                                            background: task.completed ? 'rgba(255,255,255,0.02)' : c.bgElevated,
                                            border: `1px solid ${c.border}`,
                                            borderRadius: 8,
                                            opacity: task.completed ? 0.55 : 1,
                                        }}>
                                            <button onClick={() => { void handleToggleTask(task); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: task.completed ? c.green : c.text3, flexShrink: 0, marginTop: 1 }}>
                                                {task.completed ? <CheckSquare size={16} strokeWidth={2} /> : <Square size={16} strokeWidth={1.8} />}
                                            </button>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, color: task.completed ? c.text3 : c.text1, textDecoration: task.completed ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                                                    {task.title}
                                                </div>
                                                {task.due_at && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: c.text3, marginTop: 3 }}>
                                                        <Clock size={10} strokeWidth={2} />
                                                        {new Date(task.due_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                )}
                                                {task.automation_id && (
                                                    <div style={{ fontSize: 10, color: c.amber, marginTop: 2 }}>авто</div>
                                                )}
                                            </div>
                                            <button onClick={() => { void handleDeleteTask(task.id); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text3, padding: 2, borderRadius: 4, flexShrink: 0 }}
                                                onMouseEnter={e => (e.currentTarget.style.color = c.red)}
                                                onMouseLeave={e => (e.currentTarget.style.color = c.text3)}>
                                                <X size={13} strokeWidth={2} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {tab === 'fields' && visibleFields.length > 0 && (
                    <div style={{ padding: '12px 20px', borderTop: `1px solid ${c.border}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={onClose}
                            style={btn(c.bgElevated, { border: `1px solid ${c.border}`, color: c.text2 })}>
                            Закрыть
                        </button>
                        <button onClick={() => void handleSaveFields()} disabled={saving}
                            style={btn(c.blue, { display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 })}>
                            {saving && <Spinner size={13} />} Сохранить
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
