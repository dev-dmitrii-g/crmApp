import React, { useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../ui/Spinner';
import type { Role } from '../../types';
import { c, btn } from '../../theme';

const PERMS: { key: string; label: string; desc: string }[] = [
    { key: 'view_all',  label: 'Все сделки',    desc: 'Видеть все сделки, не только свои' },
    { key: 'edit',      label: 'Редактировать',  desc: 'Создавать и изменять сделки и поля' },
    { key: 'delete',    label: 'Удалять',        desc: 'Удалять клиентов и записи' },
    { key: 'export',    label: 'Экспорт',        desc: 'Скачивать данные из системы' },
    { key: 'settings',  label: 'Настройки',      desc: 'Доступ к админ-панели' },
    { key: 'chat',      label: 'Чат',            desc: 'Отправлять сообщения через WhatsApp' },
];

interface Props {
    roles: Role[];
    onSaved: () => void;
}

export const RoleMatrix: React.FC<Props> = ({ roles, onSaved }) => {
    const toast = useToast();
    const [local, setLocal] = useState<Role[]>(roles);
    const [saving, setSaving] = useState<string | null>(null);

    // Keep local state in sync when parent passes new roles
    React.useEffect(() => { setLocal(roles); }, [roles]);

    const toggle = (code: string, perm: string) => {
        if (code === 'admin' && (perm === 'settings' || perm === 'view_all')) return; // locked
        setLocal(prev => prev.map(r => {
            if (r.code !== code) return r;
            const cur = r.permissions[perm] ?? 0;
            return { ...r, permissions: { ...r.permissions, [perm]: cur ? 0 : 1 } };
        }));
    };

    const save = async (code: string) => {
        const role = local.find(r => r.code === code);
        if (!role) return;
        setSaving(code);
        try {
            await api.put(`/admin/roles/${code}/permissions`, { permissions: role.permissions });
            toast.success(`Права роли «${role.name}» сохранены`);
            onSaved();
        } catch { toast.error('Ошибка при сохранении'); }
        finally { setSaving(null); }
    };

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <th style={thStyle}>Роль</th>
                        {PERMS.map(p => (
                            <th key={p.key} style={{ ...thStyle, textAlign: 'center' }} title={p.desc}>{p.label}</th>
                        ))}
                        <th style={{ ...thStyle, width: 90 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {local.map(role => (
                        <tr key={role.code} style={{ borderTop: `1px solid ${c.border}` }}>
                            <td style={{ padding: '12px 14px', fontWeight: 600, color: c.text1 }}>
                                {role.name}
                                <div style={{ fontSize: 10, color: c.text3, fontWeight: 400 }}>{role.code}</div>
                            </td>
                            {PERMS.map(p => {
                                const on = (role.permissions[p.key] ?? 0) === 1;
                                const locked = role.code === 'admin' && (p.key === 'settings' || p.key === 'view_all');
                                return (
                                    <td key={p.key} style={{ padding: '12px 14px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => toggle(role.code, p.key)}
                                            disabled={locked}
                                            title={locked ? 'Заблокировано для администратора' : (on ? 'Отключить' : 'Включить')}
                                            style={{
                                                width: 28, height: 28,
                                                borderRadius: 7,
                                                border: `1.5px solid ${on ? c.green : c.border}`,
                                                background: on ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.04)',
                                                color: on ? c.green : c.text3,
                                                cursor: locked ? 'default' : 'pointer',
                                                fontSize: 14, fontWeight: 700,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                margin: '0 auto',
                                                opacity: locked ? 0.5 : 1,
                                                transition: 'all 0.12s',
                                            }}
                                        >
                                            {on ? '✓' : ''}
                                        </button>
                                    </td>
                                );
                            })}
                            <td style={{ padding: '12px 14px' }}>
                                <button
                                    onClick={() => { void save(role.code); }}
                                    disabled={saving === role.code}
                                    style={{
                                        ...btn(c.blue, { padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 5 }),
                                        opacity: saving === role.code ? 0.6 : 1,
                                    }}
                                >
                                    {saving === role.code ? <Spinner size={11} color="#fff" /> : null}
                                    Сохранить
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p style={{ fontSize: 11, color: c.text3, marginTop: 12, lineHeight: 1.6 }}>
                Изменение прав роли вынуждает всех её пользователей заново войти в систему.
            </p>
        </div>
    );
};

const thStyle: React.CSSProperties = {
    padding: '9px 14px',
    textAlign: 'left',
    color: c.text2,
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
};
