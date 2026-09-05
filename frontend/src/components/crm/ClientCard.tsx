import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import type { Client, Stage, FieldDefinition, FieldStageVisibility, Contact, Company, ClientCounterparties } from '../../types';

interface Props {
    client: Client;
    stages: Stage[];
    fieldDefinitions: FieldDefinition[];
    fieldVisibility: FieldStageVisibility[];
    onClose: () => void;
    onRefresh: () => void;
}

type CardTab = 'fields' | 'counterparties';

const inp: React.CSSProperties = {
    width: '100%', padding: '7px 9px', border: '1px solid #d1d5db',
    borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
};

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
    const [tab, setTab] = useState<CardTab>('fields');
    const [fieldValues, setFieldValues] = useState<Record<string, string>>(client.custom_fields ?? {});
    const [saving, setSaving] = useState(false);

    const [counterparties, setCounterparties] = useState<ClientCounterparties>({ contacts: [], companies: [] });
    const [allContacts, setAllContacts] = useState<Contact[]>([]);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [contactSearch, setContactSearch] = useState('');
    const [companySearch, setCompanySearch] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadFieldKey, setUploadFieldKey] = useState('');

    const currentStage = stages.find(s => s.code === client.status);

    useEffect(() => {
        void loadCounterparties();
        void loadAllContacts();
        void loadAllCompanies();
    }, []);

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

    // Fields visible for current stage
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
            onRefresh();
        } catch { alert('Ошибка сохранения'); }
        finally { setSaving(false); }
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
        } catch { alert('Ошибка загрузки файла'); }
        e.target.value = '';
    };

    const renderFieldInput = (f: FieldDefinition) => {
        const val = fieldValues[f.key] ?? '';
        const required = isRequired(f.key);
        const labelStyle: React.CSSProperties = {
            fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4,
            color: required ? '#dc2626' : '#374151',
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
                                ? <a href={val} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: 12, textDecoration: 'underline' }}>Открыть файл</a>
                                : <span style={{ color: '#9ca3af', fontSize: 12 }}>Файл не загружен</span>
                            }
                            <button onClick={() => triggerFileUpload(f.key)}
                                style={{ padding: '4px 10px', background: '#e5e7eb', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                                Загрузить
                            </button>
                        </div>
                    </div>
                );
            case 'formula':
                return (
                    <div key={f.key} style={{ marginBottom: 12 }}>
                        <label style={{ ...labelStyle, color: '#7c3aed' }}>{f.name} (авто)</label>
                        <div style={{ padding: '7px 9px', background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 4, fontSize: 14, fontWeight: 'bold', color: '#7c3aed' }}>
                            {evaluateFormula(f.formula, fieldValues)}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    const linkedContactIds = new Set(counterparties.contacts.map(c => c.id));
    const linkedCompanyIds = new Set(counterparties.companies.map(c => c.id));

    const filteredContacts = allContacts.filter(c =>
        !linkedContactIds.has(c.id) &&
        (c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone.includes(contactSearch))
    );
    const filteredCompanies = allCompanies.filter(c =>
        !linkedCompanyIds.has(c.id) &&
        (c.name.toLowerCase().includes(companySearch.toLowerCase()) || c.inn.includes(companySearch))
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
        borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent',
        background: 'none', cursor: 'pointer',
        fontWeight: tab === t ? 600 : 400,
        color: tab === t ? '#1d4ed8' : '#6b7280', fontSize: 13,
    });

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: '#fff', borderRadius: 8, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: 17 }}>{client.name}</h3>
                        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 3 }}>{client.phone}</div>
                        {currentStage && (
                            <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 8px', background: currentStage.color + '20', color: currentStage.color, borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                                {currentStage.name}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>✕</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                    <button style={tabStyle('fields')} onClick={() => setTab('fields')}>Поля карточки</button>
                    <button style={tabStyle('counterparties')} onClick={() => setTab('counterparties')}>
                        Контрагенты {(counterparties.contacts.length + counterparties.companies.length) > 0
                            ? `(${counterparties.contacts.length + counterparties.companies.length})`
                            : ''}
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

                    {tab === 'fields' && (
                        <div>
                            {visibleFields.length === 0 ? (
                                <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
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
                            {/* Contacts */}
                            <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Контакты</h4>
                            {counterparties.contacts.length === 0
                                ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Нет связанных контактов</p>
                                : counterparties.contacts.map(ct => (
                                    <div key={ct.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: 4, marginBottom: 6 }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{ct.name}</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>{ct.phone}{ct.company_name ? ` · ${ct.company_name}` : ''}</div>
                                        </div>
                                        <button onClick={() => void unlinkContact(ct.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>×</button>
                                    </div>
                                ))
                            }
                            <div style={{ marginTop: 8 }}>
                                <input style={{ ...inp, marginBottom: 6 }} type="text" placeholder="Поиск контакта..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
                                {contactSearch && filteredContacts.slice(0, 5).map(ct => (
                                    <div key={ct.id} onClick={() => void linkContact(ct.id)} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 4, fontSize: 13, background: '#eff6ff', marginBottom: 3 }}>
                                        <strong>{ct.name}</strong> {ct.phone && `· ${ct.phone}`} {ct.company_name && `· ${ct.company_name}`}
                                    </div>
                                ))}
                            </div>

                            <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

                            {/* Companies */}
                            <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Компании</h4>
                            {counterparties.companies.length === 0
                                ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Нет связанных компаний</p>
                                : counterparties.companies.map(co => (
                                    <div key={co.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9fafb', borderRadius: 4, marginBottom: 6 }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{co.name}</div>
                                            <div style={{ fontSize: 12, color: '#6b7280' }}>{co.inn ? `ИНН: ${co.inn}` : ''}{co.phone ? ` · ${co.phone}` : ''}</div>
                                        </div>
                                        <button onClick={() => void unlinkCompany(co.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}>×</button>
                                    </div>
                                ))
                            }
                            <div style={{ marginTop: 8 }}>
                                <input style={{ ...inp, marginBottom: 6 }} type="text" placeholder="Поиск компании по ИНН или названию..." value={companySearch} onChange={e => setCompanySearch(e.target.value)} />
                                {companySearch && filteredCompanies.slice(0, 5).map(co => (
                                    <div key={co.id} onClick={() => void linkCompany(co.id)} style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 4, fontSize: 13, background: '#f0fdf4', marginBottom: 3 }}>
                                        <strong>{co.name}</strong> {co.inn && `· ИНН: ${co.inn}`}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {tab === 'fields' && visibleFields.length > 0 && (
                    <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={onClose} style={{ padding: '8px 18px', background: '#e5e7eb', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Закрыть</button>
                        <button onClick={() => void handleSaveFields()} disabled={saving}
                            style={{ padding: '8px 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                            {saving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
