import React, { useState } from 'react';
import api from '../../services/api';
import type { Stage } from '../../types';

interface Props {
    stages: Stage[];
    onRefresh: () => void;
}

export const StageManager: React.FC<Props> = ({ stages, onRefresh }) => {
    const [newStageName, setNewStageName] = useState('');
    const [newStageCode, setNewStageCode] = useState('');
    const [newStageColor, setNewStageColor] = useState('#3b82f6');
    const [newStageWip, setNewStageWip] = useState(0);

    const handleCreateStage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/admin/pipeline/stages', {
                name: newStageName,
                code: newStageCode,
                color: newStageColor,
                wip_limit: Number(newStageWip),
                sort_order: stages.length + 1,
            });
            setNewStageName('');
            setNewStageCode('');
            setNewStageWip(0);
            onRefresh();
        } catch {
            alert('Ошибка при создании этапа');
        }
    };

    const handleDeleteStage = async (id: number) => {
        if (!confirm('Удалить этап воронки?')) return;
        try {
            await api.delete(`/admin/pipeline/stages/${id}`);
            onRefresh();
        } catch {
            alert('Нельзя удалить системный этап');
        }
    };

    return (
        <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <h3>Настройка Воронки Продаж (Этапы и WIP-лимиты)</h3>
            <form onSubmit={handleCreateStage} style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                <input type="text" placeholder="Название" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} required style={{ padding: 8 }} />
                <input type="text" placeholder="Код" value={newStageCode} onChange={(e) => setNewStageCode(e.target.value)} required style={{ padding: 8 }} />
                <input type="color" value={newStageColor} onChange={(e) => setNewStageColor(e.target.value)} style={{ padding: 2, height: 35, width: 40 }} />
                <input type="number" placeholder="WIP Лимит" value={newStageWip} onChange={(e) => setNewStageWip(Number(e.target.value))} style={{ padding: 8, width: 150 }} />
                <button type="submit" style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>+ Добавить этап</button>
            </form>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Цвет</th>
                    <th style={{ padding: 8 }}>Название</th>
                    <th style={{ padding: 8 }}>Код</th>
                    <th style={{ padding: 8 }}>WIP Лимит</th>
                    <th style={{ padding: 8 }}>Тип</th>
                    <th style={{ padding: 8 }}>Действие</th>
                </tr>
                </thead>
                <tbody>
                {stages.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 8 }}><div style={{ width: 16, height: 16, background: s.color, borderRadius: 4 }} /></td>
                        <td style={{ padding: 8 }}><strong>{s.name}</strong></td>
                        <td style={{ padding: 8 }}><code>{s.code}</code></td>
                        <td style={{ padding: 8 }}>{s.wip_limit > 0 ? s.wip_limit : '∞'}</td>
                        <td style={{ padding: 8 }}>{s.is_system ? 'Системный' : 'Кастомный'}</td>
                        <td style={{ padding: 8 }}>
                            {!s.is_system && <button onClick={() => handleDeleteStage(s.id)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>Удалить</button>}
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
};