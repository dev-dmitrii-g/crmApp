import React from 'react';
import type { Stage, Client } from '../../types';

interface Props {
    stages: Stage[];
    clients: Client[];
    onOpenChat: (client: Client) => void;
    onUpdateStatus: (id: number, status: string) => void;
}

export const KanbanBoard: React.FC<Props> = ({ stages, clients, onOpenChat, onUpdateStatus }) => {
    return (
        <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 10 }}>
            {stages.map((stage) => {
                const stageClients = clients.filter((c) => c.status === stage.code);
                const isExceeded = stage.wip_limit > 0 && stageClients.length > stage.wip_limit;

                return (
                    <div
                        key={stage.id}
                        style={{
                            flex: '1 0 280px',
                            background: isExceeded ? '#fef2f2' : '#f3f4f6',
                            padding: 15,
                            borderRadius: 8,
                            minHeight: 450,
                            borderTop: `4px solid ${stage.color}`,
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ fontSize: 14, color: '#374151', margin: 0, textTransform: 'uppercase' }}>{stage.name}</h3>
                            <span style={{ fontSize: 12, fontWeight: 'bold', padding: '2px 8px', borderRadius: 10, background: isExceeded ? '#ef4444' : '#e5e7eb', color: isExceeded ? '#fff' : '#374151' }}>
                {stageClients.length} {stage.wip_limit > 0 && `/ ${stage.wip_limit}`}
              </span>
                        </div>

                        {stageClients.map((client) => (
                            <div key={client.id} onClick={() => onOpenChat(client)} style={{ background: '#fff', padding: 12, margin: '10px 0', borderRadius: 6, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                <strong>{client.name}</strong>
                                <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: 12 }}>{client.phone}</p>

                                <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {stages.filter((s) => s.code !== stage.code).map((targetStage) => (
                                        <button
                                            key={targetStage.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onUpdateStatus(client.id, targetStage.code);
                                            }}
                                            style={{ fontSize: 10, border: '1px solid #ccc', background: '#fff', borderRadius: 3, cursor: 'pointer' }}
                                        >
                                            → {targetStage.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
};