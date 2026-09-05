import React, { useState, useEffect } from 'react';
import { Pencil, Trash2, Check, X, Plus, ExternalLink, Users } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import { Skeleton } from '../ui/Skeleton';
import type { Contact, Company } from '../../types';
import { c, inp, btn } from '../../theme';

type TabType = 'contacts' | 'companies';

const IBtn = ({
    onClick, Icon, color, title, disabled, loading,
}: {
    onClick: () => void;
    Icon: React.FC<{ size?: number; strokeWidth?: number; color?: string }>;
    color?: string;
    title?: string;
    disabled?: boolean;
    loading?: boolean;
}) => (
    <button
        onClick={onClick}
        title={title}
        disabled={disabled || loading}
        style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, border: 'none', borderRadius: 7,
            cursor: disabled || loading ? 'default' : 'pointer',
            background: 'rgba(255,255,255,0.06)',
            transition: 'background 0.15s',
            opacity: disabled ? 0.3 : 1,
            flexShrink: 0,
        }}
    >
        {loading ? <Spinner size={12} color={c.text2} /> : <Icon size={13} color={color ?? c.text2} strokeWidth={2} />}
    </button>
);

export const ContactsCompanies: React.FC = () => {
    const toast = useToast();
    const [tab, setTab] = useState<TabType>('contacts');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [search, setSearch] = useState('');
    const [loadingData, setLoadingData] = useState(true);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [savingEdit, setSavingEdit] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const [ctName, setCtName] = useState('');
    const [ctPhone, setCtPhone] = useState('');
    const [ctEmail, setCtEmail] = useState('');
    const [ctCompanyId, setCtCompanyId] = useState('');
    const [savingContact, setSavingContact] = useState(false);

    const [coName, setCoName] = useState('');
    const [coInn, setCoInn] = useState('');
    const [coPhone, setCoPhone] = useState('');
    const [coEmail, setCoEmail] = useState('');
    const [coWebsite, setCoWebsite] = useState('');
    const [savingCompany, setSavingCompany] = useState(false);

    useEffect(() => { void load(); }, [tab]);

    const load = async () => {
        setLoadingData(true);
        try {
            if (tab === 'contacts') {
                const [ctRes, coRes] = await Promise.all([
                    api.get<Contact[]>('/contacts'),
                    api.get<Company[]>('/companies'),
                ]);
                setContacts(ctRes.data || []);
                setCompanies(coRes.data || []);
            } else {
                const res = await api.get<Company[]>('/companies');
                setCompanies(res.data || []);
            }
        } catch { toast.error('Не удалось загрузить данные'); }
        finally { setLoadingData(false); }
    };

    const createContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingContact(true);
        try {
            await api.post('/contacts', { name: ctName, phone: ctPhone, email: ctEmail, company_id: ctCompanyId ? Number(ctCompanyId) : null });
            toast.success(`Контакт «${ctName}» добавлен`);
            setCtName(''); setCtPhone(''); setCtEmail(''); setCtCompanyId('');
            await load();
        } catch { toast.error('Не удалось создать контакт'); }
        finally { setSavingContact(false); }
    };

    const createCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingCompany(true);
        try {
            await api.post('/companies', { name: coName, inn: coInn, phone: coPhone, email: coEmail, website: coWebsite });
            toast.success(`Компания «${coName}» добавлена`);
            setCoName(''); setCoInn(''); setCoPhone(''); setCoEmail(''); setCoWebsite('');
            await load();
        } catch { toast.error('Не удалось создать компанию'); }
        finally { setSavingCompany(false); }
    };

    const saveEdit = async (id: number) => {
        setSavingEdit(true);
        try {
            if (tab === 'contacts') await api.patch(`/contacts/${id}`, editValues);
            else await api.patch(`/companies/${id}`, editValues);
            setEditingId(null);
            toast.success('Изменения сохранены');
            await load();
        } catch { toast.error('Не удалось сохранить изменения'); }
        finally { setSavingEdit(false); }
    };

    const deleteContact = async (id: number, name: string) => {
        if (!confirm(`Удалить контакт «${name}»?`)) return;
        setDeletingId(id);
        try { await api.delete(`/contacts/${id}`); toast.success(`Контакт «${name}» удалён`); await load(); }
        catch { toast.error('Не удалось удалить контакт'); }
        finally { setDeletingId(null); }
    };

    const deleteCompany = async (id: number, name: string) => {
        if (!confirm(`Удалить компанию «${name}»?`)) return;
        setDeletingId(id);
        try { await api.delete(`/companies/${id}`); toast.success(`Компания «${name}» удалена`); await load(); }
        catch { toast.error('Не удалось удалить компанию'); }
        finally { setDeletingId(null); }
    };

    const filteredContacts = contacts.filter(ct =>
        ct.name.toLowerCase().includes(search.toLowerCase()) ||
        ct.phone.includes(search) ||
        ct.email.toLowerCase().includes(search.toLowerCase())
    );
    const filteredCompanies = companies.filter(co =>
        co.name.toLowerCase().includes(search.toLowerCase()) ||
        co.inn.includes(search) ||
        co.email.toLowerCase().includes(search.toLowerCase())
    );

    const si: React.CSSProperties = inp({ fontSize: 12, padding: '6px 9px' });

    const TabBtn = ({ t, label, count }: { t: TabType; label: string; count: number }) => (
        <button onClick={() => { setTab(t); setSearch(''); setEditingId(null); }} style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13,
            fontWeight: tab === t ? 600 : 400,
            color: tab === t ? c.text1 : c.text2,
            borderBottom: `2px solid ${tab === t ? c.blue : 'transparent'}`,
            transition: 'color 0.15s, border-color 0.15s',
            display: 'flex', alignItems: 'center', gap: 7,
        }}>
            {label}
            <span style={{ fontSize: 11, background: tab === t ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)', color: tab === t ? c.blue : c.text3, padding: '1px 7px', borderRadius: 99 }}>{count}</span>
        </button>
    );

    return (
        <div style={{ background: c.bgCard, border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, background: c.bgElevated, padding: '0 16px' }}>
                <TabBtn t="contacts" label="Контакты" count={contacts.length} />
                <TabBtn t="companies" label="Компании" count={companies.length} />
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Search */}
                <input
                    style={inp()}
                    placeholder={tab === 'contacts' ? 'Поиск по имени, телефону, email...' : 'Поиск по названию, ИНН, email...'}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                {/* Add contact form */}
                {tab === 'contacts' && (
                    <form onSubmit={e => { void createContact(e); }}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}`, alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 0 130px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Имя *</div>
                            <input style={si} placeholder="Иван Иванов" value={ctName} onChange={e => setCtName(e.target.value)} required />
                        </div>
                        <div style={{ flex: '1 0 120px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Телефон</div>
                            <input style={si} placeholder="+7 900..." value={ctPhone} onChange={e => setCtPhone(e.target.value)} />
                        </div>
                        <div style={{ flex: '1 0 150px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Email</div>
                            <input style={si} placeholder="mail@example.com" value={ctEmail} onChange={e => setCtEmail(e.target.value)} />
                        </div>
                        <div style={{ flex: '1 0 160px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Компания</div>
                            <select style={si} value={ctCompanyId} onChange={e => setCtCompanyId(e.target.value)}>
                                <option value="">— Не выбрана —</option>
                                {companies.map(co => <option key={co.id} value={co.id}>{co.name}</option>)}
                            </select>
                        </div>
                        <button type="submit" disabled={savingContact} aria-busy={savingContact}
                            style={{ ...btn(c.green, { padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }), opacity: savingContact ? 0.6 : 1, cursor: savingContact ? 'default' : 'pointer', alignSelf: 'end' }}>
                            {savingContact ? <Spinner size={13} color="#fff" /> : <Plus size={13} strokeWidth={2.5} />} Добавить
                        </button>
                    </form>
                )}

                {/* Add company form */}
                {tab === 'companies' && (
                    <form onSubmit={e => { void createCompany(e); }}
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 14, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}`, alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 0 150px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Название *</div>
                            <input style={si} placeholder="ООО Компания" value={coName} onChange={e => setCoName(e.target.value)} required />
                        </div>
                        <div style={{ flex: '1 0 110px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>ИНН</div>
                            <input style={si} placeholder="7700000000" value={coInn} onChange={e => setCoInn(e.target.value)} />
                        </div>
                        <div style={{ flex: '1 0 120px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Телефон</div>
                            <input style={si} placeholder="+7 495..." value={coPhone} onChange={e => setCoPhone(e.target.value)} />
                        </div>
                        <div style={{ flex: '1 0 150px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Email</div>
                            <input style={si} placeholder="info@co.ru" value={coEmail} onChange={e => setCoEmail(e.target.value)} />
                        </div>
                        <div style={{ flex: '1 0 150px' }}>
                            <div style={{ fontSize: 11, color: c.text2, fontWeight: 600, marginBottom: 4 }}>Сайт</div>
                            <input style={si} placeholder="https://site.ru" value={coWebsite} onChange={e => setCoWebsite(e.target.value)} />
                        </div>
                        <button type="submit" disabled={savingCompany} aria-busy={savingCompany}
                            style={{ ...btn(c.green, { padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }), opacity: savingCompany ? 0.6 : 1, cursor: savingCompany ? 'default' : 'pointer', alignSelf: 'end' }}>
                            {savingCompany ? <Spinner size={13} color="#fff" /> : <Plus size={13} strokeWidth={2.5} />} Добавить
                        </button>
                    </form>
                )}

                {/* Contacts table */}
                {tab === 'contacts' && (loadingData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} height={40} borderRadius={6} />)}
                    </div>
                ) : filteredContacts.length === 0 && !search ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10, textAlign: 'center', background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                        <Users size={28} color={c.text3} strokeWidth={1.5} />
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.text2 }}>Нет контактов</p>
                        <p style={{ margin: 0, fontSize: 12, color: c.text3 }}>Добавьте первый контакт с помощью формы выше</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                        <table style={{ minWidth: 560, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    {['Имя', 'Телефон', 'Email', 'Компания', ''].map(h => (
                                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: c.text2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredContacts.map(ct => (
                                    <tr key={ct.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                        <td style={{ padding: '9px 12px', color: c.text1, fontWeight: 500 }}>
                                            {editingId === ct.id
                                                ? <input style={{ ...si, width: 130 }} value={editValues['name'] ?? ct.name} onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))} />
                                                : ct.name}
                                        </td>
                                        <td style={{ padding: '9px 12px', color: c.text2 }}>
                                            {editingId === ct.id
                                                ? <input style={{ ...si, width: 120 }} value={editValues['phone'] ?? ct.phone} onChange={e => setEditValues(p => ({ ...p, phone: e.target.value }))} />
                                                : ct.phone || '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', color: c.text2 }}>
                                            {editingId === ct.id
                                                ? <input style={{ ...si, width: 150 }} value={editValues['email'] ?? ct.email} onChange={e => setEditValues(p => ({ ...p, email: e.target.value }))} />
                                                : ct.email || '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', color: c.text3, fontSize: 12 }}>{ct.company_name || '—'}</td>
                                        <td style={{ padding: '9px 12px' }}>
                                            {editingId === ct.id ? (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <IBtn onClick={() => void saveEdit(ct.id)} Icon={Check} color={c.green} title="Сохранить" loading={savingEdit} />
                                                    <IBtn onClick={() => setEditingId(null)} Icon={X} title="Отмена" disabled={savingEdit} />
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <IBtn onClick={() => { setEditingId(ct.id); setEditValues({ name: ct.name, phone: ct.phone, email: ct.email }); }} Icon={Pencil} color={c.amber} title="Изменить контакт" />
                                                    <IBtn onClick={() => void deleteContact(ct.id, ct.name)} Icon={Trash2} color={c.red} title="Удалить контакт" loading={deletingId === ct.id} />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredContacts.length === 0 && search && (
                                    <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: c.text3 }}>Контактов по запросу не найдено</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ))}

                {/* Companies table */}
                {tab === 'companies' && (loadingData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} height={40} borderRadius={6} />)}
                    </div>
                ) : filteredCompanies.length === 0 && !search ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 20px', gap: 10, textAlign: 'center', background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                        <Users size={28} color={c.text3} strokeWidth={1.5} />
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.text2 }}>Нет компаний</p>
                        <p style={{ margin: 0, fontSize: 12, color: c.text3 }}>Добавьте первую компанию с помощью формы выше</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', background: c.bgElevated, borderRadius: 10, border: `1px solid ${c.border}` }}>
                        <table style={{ minWidth: 620, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                    {['Название', 'ИНН', 'Телефон', 'Email', 'Сайт', ''].map(h => (
                                        <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: c.text2, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCompanies.map(co => (
                                    <tr key={co.id} style={{ borderTop: `1px solid ${c.border}` }}>
                                        <td style={{ padding: '9px 12px', color: c.text1, fontWeight: 500 }}>
                                            {editingId === co.id
                                                ? <input style={{ ...si, width: 140 }} value={editValues['name'] ?? co.name} onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))} />
                                                : co.name}
                                        </td>
                                        <td style={{ padding: '9px 12px', color: c.text2 }}>
                                            {editingId === co.id
                                                ? <input style={{ ...si, width: 110 }} value={editValues['inn'] ?? co.inn} onChange={e => setEditValues(p => ({ ...p, inn: e.target.value }))} />
                                                : co.inn || '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', color: c.text2 }}>
                                            {editingId === co.id
                                                ? <input style={{ ...si, width: 120 }} value={editValues['phone'] ?? co.phone} onChange={e => setEditValues(p => ({ ...p, phone: e.target.value }))} />
                                                : co.phone || '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', color: c.text2 }}>
                                            {editingId === co.id
                                                ? <input style={{ ...si, width: 150 }} value={editValues['email'] ?? co.email} onChange={e => setEditValues(p => ({ ...p, email: e.target.value }))} />
                                                : co.email || '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            {co.website
                                                ? <a href={co.website} target="_blank" rel="noreferrer" title={co.website} style={{ color: c.blue, display: 'inline-flex', alignItems: 'center' }}>
                                                    <ExternalLink size={13} strokeWidth={2} />
                                                  </a>
                                                : <span style={{ color: c.text3 }}>—</span>}
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            {editingId === co.id ? (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <IBtn onClick={() => void saveEdit(co.id)} Icon={Check} color={c.green} title="Сохранить" loading={savingEdit} />
                                                    <IBtn onClick={() => setEditingId(null)} Icon={X} title="Отмена" disabled={savingEdit} />
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <IBtn onClick={() => { setEditingId(co.id); setEditValues({ name: co.name, inn: co.inn, phone: co.phone, email: co.email, website: co.website }); }} Icon={Pencil} color={c.amber} title="Изменить компанию" />
                                                    <IBtn onClick={() => void deleteCompany(co.id, co.name)} Icon={Trash2} color={c.red} title="Удалить компанию" loading={deletingId === co.id} />
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredCompanies.length === 0 && search && (
                                    <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: c.text3 }}>Компаний по запросу не найдено</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );
};
