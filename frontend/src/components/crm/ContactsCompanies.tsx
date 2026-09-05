import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import type { Contact, Company } from '../../types';

type TabType = 'contacts' | 'companies';

const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 };
const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '6px 12px', background: bg, color, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
});

export const ContactsCompanies: React.FC = () => {
    const [tab, setTab] = useState<TabType>('contacts');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [search, setSearch] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);

    // Contact form
    const [ctName, setCtName] = useState('');
    const [ctPhone, setCtPhone] = useState('');
    const [ctEmail, setCtEmail] = useState('');
    const [ctCompanyId, setCtCompanyId] = useState('');

    // Company form
    const [coName, setCoName] = useState('');
    const [coInn, setCoInn] = useState('');
    const [coPhone, setCoPhone] = useState('');
    const [coEmail, setCoEmail] = useState('');
    const [coWebsite, setCoWebsite] = useState('');

    // Edit state
    const [editValues, setEditValues] = useState<Record<string, string>>({});

    useEffect(() => {
        void load();
    }, [tab]);

    const load = async () => {
        if (tab === 'contacts') {
            const res = await api.get<Contact[]>('/contacts');
            setContacts(res.data || []);
        } else {
            const res = await api.get<Company[]>('/companies');
            setCompanies(res.data || []);
        }
    };

    // === Contacts ===
    const createContact = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.post('/contacts', {
            name: ctName, phone: ctPhone, email: ctEmail,
            company_id: ctCompanyId ? Number(ctCompanyId) : null,
        });
        setCtName(''); setCtPhone(''); setCtEmail(''); setCtCompanyId('');
        await load();
    };

    const deleteContact = async (id: number) => {
        if (!confirm('Удалить контакт?')) return;
        await api.delete(`/contacts/${id}`);
        await load();
    };

    // === Companies ===
    const createCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        await api.post('/companies', { name: coName, inn: coInn, phone: coPhone, email: coEmail, website: coWebsite });
        setCoName(''); setCoInn(''); setCoPhone(''); setCoEmail(''); setCoWebsite('');
        await load();
    };

    const deleteCompany = async (id: number) => {
        if (!confirm('Удалить компанию?')) return;
        await api.delete(`/companies/${id}`);
        await load();
    };

    const saveEdit = async (id: number) => {
        if (tab === 'contacts') {
            await api.patch(`/contacts/${id}`, editValues);
        } else {
            await api.patch(`/companies/${id}`, editValues);
        }
        setEditingId(null);
        await load();
    };

    const tabStyle = (t: TabType): React.CSSProperties => ({
        padding: '9px 24px', border: 'none',
        borderBottom: tab === t ? '2px solid #10b981' : '2px solid transparent',
        background: 'none', cursor: 'pointer',
        fontWeight: tab === t ? 600 : 400,
        color: tab === t ? '#059669' : '#6b7280', fontSize: 14,
    });

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) || c.email.toLowerCase().includes(search.toLowerCase())
    );
    const filteredCompanies = companies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.inn.includes(search) || c.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                <button style={tabStyle('contacts')} onClick={() => { setTab('contacts'); setSearch(''); setEditingId(null); }}>
                    Контакты ({contacts.length})
                </button>
                <button style={tabStyle('companies')} onClick={() => { setTab('companies'); setSearch(''); setEditingId(null); }}>
                    Компании ({companies.length})
                </button>
            </div>

            <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Search */}
                <input style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
                    placeholder={tab === 'contacts' ? 'Поиск по имени, телефону...' : 'Поиск по названию, ИНН...'}
                    value={search} onChange={e => setSearch(e.target.value)} />

                {/* Add form */}
                {tab === 'contacts' && (
                    <form onSubmit={e => { void createContact(e); }}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px', background: '#f0fdf4', borderRadius: 6 }}>
                        <input style={{ ...inp, flex: '1 0 130px' }} placeholder="Имя *" value={ctName} onChange={e => setCtName(e.target.value)} required />
                        <input style={{ ...inp, flex: '1 0 120px' }} placeholder="Телефон" value={ctPhone} onChange={e => setCtPhone(e.target.value)} />
                        <input style={{ ...inp, flex: '1 0 150px' }} placeholder="Email" value={ctEmail} onChange={e => setCtEmail(e.target.value)} />
                        <select style={{ ...inp, flex: '1 0 160px' }} value={ctCompanyId} onChange={e => setCtCompanyId(e.target.value)}>
                            <option value="">— Компания —</option>
                            {companies.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
                        </select>
                        <button type="submit" style={btn('#10b981')}>+ Добавить</button>
                    </form>
                )}

                {tab === 'companies' && (
                    <form onSubmit={e => { void createCompany(e); }}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px', background: '#f0fdf4', borderRadius: 6 }}>
                        <input style={{ ...inp, flex: '1 0 150px' }} placeholder="Название *" value={coName} onChange={e => setCoName(e.target.value)} required />
                        <input style={{ ...inp, flex: '1 0 120px' }} placeholder="ИНН" value={coInn} onChange={e => setCoInn(e.target.value)} />
                        <input style={{ ...inp, flex: '1 0 120px' }} placeholder="Телефон" value={coPhone} onChange={e => setCoPhone(e.target.value)} />
                        <input style={{ ...inp, flex: '1 0 150px' }} placeholder="Email" value={coEmail} onChange={e => setCoEmail(e.target.value)} />
                        <input style={{ ...inp, flex: '1 0 150px' }} placeholder="Сайт" value={coWebsite} onChange={e => setCoWebsite(e.target.value)} />
                        <button type="submit" style={btn('#10b981')}>+ Добавить</button>
                    </form>
                )}

                {/* List */}
                {tab === 'contacts' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                                <th style={{ padding: '8px 10px' }}>Имя</th>
                                <th style={{ padding: '8px 10px' }}>Телефон</th>
                                <th style={{ padding: '8px 10px' }}>Email</th>
                                <th style={{ padding: '8px 10px' }}>Компания</th>
                                <th style={{ padding: '8px 10px' }}>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredContacts.map(ct => (
                                <tr key={ct.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === ct.id
                                            ? <input style={{ ...inp, width: 130 }} value={editValues['name'] ?? ct.name} onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))} />
                                            : <strong>{ct.name}</strong>}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === ct.id
                                            ? <input style={{ ...inp, width: 120 }} value={editValues['phone'] ?? ct.phone} onChange={e => setEditValues(p => ({ ...p, phone: e.target.value }))} />
                                            : ct.phone || '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === ct.id
                                            ? <input style={{ ...inp, width: 150 }} value={editValues['email'] ?? ct.email} onChange={e => setEditValues(p => ({ ...p, email: e.target.value }))} />
                                            : ct.email || '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', color: '#6b7280' }}>{ct.company_name || '—'}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === ct.id ? (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => void saveEdit(ct.id)} style={btn('#10b981')}>✓</button>
                                                <button onClick={() => setEditingId(null)} style={btn('#6b7280')}>✕</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => { setEditingId(ct.id); setEditValues({ name: ct.name, phone: ct.phone, email: ct.email }); }} style={btn('#f59e0b')}>✎</button>
                                                <button onClick={() => void deleteContact(ct.id)} style={btn('#ef4444')}>✕</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredContacts.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Контактов не найдено</td></tr>
                            )}
                        </tbody>
                    </table>
                )}

                {tab === 'companies' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                                <th style={{ padding: '8px 10px' }}>Название</th>
                                <th style={{ padding: '8px 10px' }}>ИНН</th>
                                <th style={{ padding: '8px 10px' }}>Телефон</th>
                                <th style={{ padding: '8px 10px' }}>Email</th>
                                <th style={{ padding: '8px 10px' }}>Сайт</th>
                                <th style={{ padding: '8px 10px' }}>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCompanies.map(co => (
                                <tr key={co.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === co.id
                                            ? <input style={{ ...inp, width: 140 }} value={editValues['name'] ?? co.name} onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))} />
                                            : <strong>{co.name}</strong>}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === co.id
                                            ? <input style={{ ...inp, width: 110 }} value={editValues['inn'] ?? co.inn} onChange={e => setEditValues(p => ({ ...p, inn: e.target.value }))} />
                                            : co.inn || '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === co.id
                                            ? <input style={{ ...inp, width: 120 }} value={editValues['phone'] ?? co.phone} onChange={e => setEditValues(p => ({ ...p, phone: e.target.value }))} />
                                            : co.phone || '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === co.id
                                            ? <input style={{ ...inp, width: 150 }} value={editValues['email'] ?? co.email} onChange={e => setEditValues(p => ({ ...p, email: e.target.value }))} />
                                            : co.email || '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {co.website
                                            ? <a href={co.website} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', fontSize: 12 }}>{co.website}</a>
                                            : '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {editingId === co.id ? (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => void saveEdit(co.id)} style={btn('#10b981')}>✓</button>
                                                <button onClick={() => setEditingId(null)} style={btn('#6b7280')}>✕</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => { setEditingId(co.id); setEditValues({ name: co.name, inn: co.inn, phone: co.phone, email: co.email, website: co.website }); }} style={btn('#f59e0b')}>✎</button>
                                                <button onClick={() => void deleteCompany(co.id)} style={btn('#ef4444')}>✕</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredCompanies.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Компаний не найдено</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
