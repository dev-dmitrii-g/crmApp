import React, { useState, useEffect } from 'react';
import api from './services/api';
import type { Client, Stage, Manager, Analytics, Message, TransitionRule, StageRequiredField, LossReason } from './types';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { StageManager } from './components/admin/StageManager';
import { QRCodeSVG } from 'qrcode.react';

export default function App() {
  const [token, setToken] = useState<string>(localStorage.getItem('token') || '');
  const [email, setEmail] = useState<string>('manager@test.com');
  const [password, setPassword] = useState<string>('password123');
  const [userRole, setUserRole] = useState<string>(localStorage.getItem('role') || 'manager');

  const [activeTab, setActiveTab] = useState<'kanban' | 'admin'>('kanban');

  const [stages, setStages] = useState<Stage[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transitionRules, setTransitionRules] = useState<TransitionRule[]>([]);
  const [stageRequiredFields, setStageRequiredFields] = useState<StageRequiredField[]>([]);
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [qrCode, setQrCode] = useState<string>('');
  const [showQR, setShowQR] = useState<boolean>(false);

  const [showAddClient, setShowAddClient] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState<string>('');

  const [managers, setManagers] = useState<Manager[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [newMgrName, setNewMgrName] = useState('');
  const [newMgrEmail, setNewMgrEmail] = useState('');
  const [newMgrPass, setNewMgrPass] = useState('');

  useEffect(() => {
    if (!token) return;

    const chatWs = new WebSocket(`ws://localhost:8080/api/ws/chat?token=${token}`);
    chatWs.onmessage = () => {
      void fetchClients();
      void fetchStages();
      if (selectedClient) void openChat(selectedClient);
      if (activeTab === 'admin') void fetchAdminData();
    };

    const pingInterval = setInterval(() => {
      if (chatWs.readyState === WebSocket.OPEN) {
        chatWs.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (chatWs.readyState === WebSocket.OPEN || chatWs.readyState === WebSocket.CONNECTING) {
        chatWs.close();
      }
    };
  }, [token, selectedClient, activeTab]);

  useEffect(() => {
    if (token) {
      void fetchStages();
      void fetchClients();
      if (activeTab === 'admin') void fetchAdminData();
    }
  }, [token, activeTab]);

  const fetchStages = async () => {
    try {
      const [stagesRes, rulesRes, fieldsRes, reasonsRes] = await Promise.all([
        api.get<Stage[]>('/pipeline/stages'),
        api.get<TransitionRule[]>('/pipeline/transition-rules'),
        api.get<StageRequiredField[]>('/pipeline/stage-fields'),
        api.get<LossReason[]>('/crm/loss-reasons'),
      ]);
      setStages(stagesRes.data || []);
      setTransitionRules(rulesRes.data || []);
      setStageRequiredFields(fieldsRes.data || []);
      setLossReasons(reasonsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch stages', err);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await api.get<Client[]>('/clients');
      setClients(res.data || []);
    } catch (err) {
      console.error('Failed to fetch clients', err);
    }
  };

  const fetchAdminData = async () => {
    try {
      const [mgrRes, analyticsRes] = await Promise.all([
        api.get<Manager[]>('/admin/managers'),
        api.get<Analytics>('/admin/analytics')
      ]);
      setManagers(mgrRes.data || []);
      setAnalytics(analyticsRes.data);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/login', { email, password });
      const newToken = res.data.token;
      const role = res.data.user?.role || (email === 'manager@test.com' ? 'admin' : 'manager');

      localStorage.setItem('token', newToken);
      localStorage.setItem('role', role);

      setToken(newToken);
      setUserRole(role);
    } catch {
      try {
        const regRes = await api.post('/auth/register', { name: 'Manager', email, password });
        const newToken = regRes.data.token;
        const role = regRes.data.user?.role || 'manager';

        localStorage.setItem('token', newToken);
        localStorage.setItem('role', role);

        setToken(newToken);
        setUserRole(role);
      } catch (err) {
        alert('Ошибка авторизации');
      }
    }
  };

  const updateStatus = async (id: number, status: string, lossReason?: string, customFields?: Record<string, string>) => {
    try {
      await api.patch(`/clients/${id}/status`, { status, loss_reason: lossReason, custom_fields: customFields });
      await fetchClients();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      const msg = axiosErr?.response?.data?.error;
      if (msg) alert(msg);
      else console.error('Failed to update status', err);
    }
  };

  const handleCreateManager = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/managers', { name: newMgrName, email: newMgrEmail, password: newMgrPass });
      setNewMgrName('');
      setNewMgrEmail('');
      setNewMgrPass('');
      alert('Менеджер успешно создан!');
      await fetchAdminData();
    } catch {
      alert('Ошибка при создании менеджера');
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientPhone) return;
    try {
      await api.post('/clients', { name: newClientName, phone: newClientPhone });
      setNewClientName('');
      setNewClientPhone('');
      setShowAddClient(false);
      await fetchClients();
    } catch {
      alert('Ошибка при создании клиента');
    }
  };

  const connectWhatsApp = () => {
    setShowQR(true);
    const ws = new WebSocket(`ws://localhost:8080/api/ws/whatsapp/qr?token=${token}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'qr') setQrCode(data.code);
      if (data.status === 'connected') {
        setShowQR(false);
        alert('WhatsApp успешно подключен!');
      }
    };
  };

  const openChat = async (client: Client) => {
    setSelectedClient(client);
    try {
      const res = await api.get<Message[]>(`/messages?client_id=${client.id}`);
      setMessages(res.data || []);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage || !selectedClient) return;
    try {
      await api.post('/messages/send', { client_id: selectedClient.id, text: newMessage });
      setMessages((prev) => [...prev, { text: newMessage, is_outgoing: true }]);
      setNewMessage('');
    } catch {
      alert('Ошибка отправки сообщения');
    }
  };

  const renderMessageText = (text: string) => {
    if (text.includes('📷 Картинка: http') || text.includes('📷 [Картинка: http')) {
      const url = text.match(/http:\/\/localhost:8080\/uploads\/[^\s\]]+/)?.[0];
      return url ? <img src={url} alt="WA Media" style={{ maxWidth: 220, borderRadius: 6, display: 'block', margin: '4px 0' }} /> : text;
    }
    if (text.includes('🎤 Голосовое сообщение: http')) {
      const url = text.split('🎤 Голосовое сообщение: ')[1];
      return <audio controls src={url} style={{ maxWidth: 220, margin: '4px 0' }} />;
    }
    if (text.includes('📄 Документ: http')) {
      const url = text.split('📄 Документ: ')[1];
      return <a href={url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Скачать документ</a>;
    }
    return text;
  };

  if (!token) {
    return (
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
          <form onSubmit={(e) => { void handleAuth(e); }} style={{ background: '#fff', padding: 30, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: 320 }}>
            <h2 style={{ marginTop: 0, textAlign: 'center' }}>Вход в CRM</h2>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ display: 'block', margin: '12px 0', padding: 10, width: '100%', boxSizing: 'border-box' }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль" style={{ display: 'block', margin: '12px 0', padding: 10, width: '100%', boxSizing: 'border-box' }} />
            <button type="submit" style={{ width: '100%', padding: 12, background: '#25D366', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Войти</button>
          </form>
        </div>
    );
  }

  return (
      <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '2px solid #e5e7eb', paddingBottom: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <h2 style={{ margin: 0 }}>WhatsApp CRM</h2>
            <nav style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setActiveTab('kanban')} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: activeTab === 'kanban' ? '#3b82f6' : '#e5e7eb', color: activeTab === 'kanban' ? '#fff' : '#000', cursor: 'pointer' }}>Канбан</button>
              {userRole === 'admin' && (
                  <button onClick={() => setActiveTab('admin')} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: activeTab === 'admin' ? '#3b82f6' : '#e5e7eb', color: activeTab === 'admin' ? '#fff' : '#000', cursor: 'pointer' }}>Админка & Аналитика</button>
              )}
            </nav>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowAddClient(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: 6, cursor: 'pointer' }}>+ Новый клиент</button>
            <button onClick={connectWhatsApp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: 6, cursor: 'pointer' }}>Привязать WhatsApp</button>
          </div>
        </header>

        {activeTab === 'kanban' && <KanbanBoard
            stages={stages}
            clients={clients}
            transitionRules={transitionRules}
            stageRequiredFields={stageRequiredFields}
            lossReasons={lossReasons}
            onOpenChat={(c) => { void openChat(c); }}
            onUpdateStatus={(id, s, r, cf) => { void updateStatus(id, s, r, cf); }}
        />}

        {activeTab === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
              <StageManager stages={stages} onRefresh={() => { void fetchStages(); }} />

              {analytics && (
                  <div>
                    <h3>Сводная Аналитика</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 15 }}>
                      <div style={{ background: '#eff6ff', padding: 15, borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ fontSize: 24, fontWeight: 'bold', color: '#1d4ed8' }}>{analytics.metrics.total_clients}</span>
                        <div style={{ fontSize: 13, color: '#4b5563' }}>Всего клиентов</div>
                      </div>
                      <div style={{ background: '#f0fdf4', padding: 15, borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ fontSize: 24, fontWeight: 'bold', color: '#15803d' }}>{analytics.metrics.done_clients}</span>
                        <div style={{ fontSize: 13, color: '#4b5563' }}>Завершенных сделок</div>
                      </div>
                      <div style={{ background: '#fefce8', padding: 15, borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ fontSize: 24, fontWeight: 'bold', color: '#a16207' }}>{analytics.metrics.total_messages}</span>
                        <div style={{ fontSize: 13, color: '#4b5563' }}>Всего сообщений</div>
                      </div>
                      <div style={{ background: '#fef2f2', padding: 15, borderRadius: 8, textAlign: 'center' }}>
                        <span style={{ fontSize: 24, fontWeight: 'bold', color: '#b91c1c' }}>{analytics.metrics.outgoing_messages}</span>
                        <div style={{ fontSize: 13, color: '#4b5563' }}>Исходящих менеджерами</div>
                      </div>
                    </div>
                  </div>
              )}

              <div style={{ display: 'flex', gap: 30 }}>
                <div style={{ flex: 2 }}>
                  <h3>Сотрудники компании</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5e7eb' }}>
                    <thead>
                    <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                      <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>ID</th>
                      <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>Имя</th>
                      <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>Email</th>
                      <th style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>Роль</th>
                    </tr>
                    </thead>
                    <tbody>
                    {managers.map((m) => (
                        <tr key={m.id}>
                          <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>{m.id}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>{m.name}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>{m.email}</td>
                          <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>
                            <span style={{ background: m.role === 'admin' ? '#dbeafe' : '#f3f4f6', color: m.role === 'admin' ? '#1e40af' : '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>{m.role}</span>
                          </td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ flex: 1, background: '#f9fafb', padding: 20, borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <h3 style={{ marginTop: 0 }}>Добавить менеджера</h3>
                  <form onSubmit={(e) => { void handleCreateManager(e); }}>
                    <input type="text" placeholder="Имя сотрудника" value={newMgrName} onChange={(e) => setNewMgrName(e.target.value)} style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }} required />
                    <input type="email" placeholder="Email" value={newMgrEmail} onChange={(e) => setNewMgrEmail(e.target.value)} style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }} required />
                    <input type="password" placeholder="Пароль" value={newMgrPass} onChange={(e) => setNewMgrPass(e.target.value)} style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }} required />
                    <button type="submit" style={{ width: '100%', padding: 10, background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>Создать сотрудника</button>
                  </form>
                </div>
              </div>

              {analytics && (
                  <div>
                    <h3>Журнал событий (Audit Logs)</h3>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 15, maxHeight: 250, overflowY: 'auto' }}>
                      {(analytics.recent_activity || []).map((log) => (
                          <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', padding: '8px 0', fontSize: 13 }}>
                            <div><strong>{log.user_name}</strong>: {log.action} ({log.details})</div>
                            <span style={{ color: '#9ca3af' }}>{log.timestamp}</span>
                          </div>
                      ))}
                    </div>
                  </div>
              )}
            </div>
        )}

        {selectedClient && (
            <div style={{ position: 'fixed', right: 20, bottom: 20, width: 350, background: '#fff', border: '1px solid #ccc', borderRadius: 8, padding: 15, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                <h4>Чат с {selectedClient.name}</h4>
                <button onClick={() => setSelectedClient(null)}>✕</button>
              </div>
              <div style={{ height: 250, overflowY: 'auto', margin: '10px 0' }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ textAlign: m.is_outgoing ? 'right' : 'left', margin: '5px 0' }}>
                      <span style={{ background: m.is_outgoing ? '#dcf8c6' : '#f0f0f0', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>{renderMessageText(m.text)}</span>
                    </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Сообщение..." style={{ flex: 1, padding: 8 }} />
                <button onClick={() => { void sendMessage(); }} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '8px 12px' }}>Send</button>
              </div>
            </div>
        )}

        {showAddClient && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <form onSubmit={(e) => { void handleCreateClient(e); }} style={{ background: '#fff', padding: 24, borderRadius: 8, width: 320 }}>
                <h3 style={{ marginTop: 0 }}>Добавить клиента</h3>
                <input type="text" placeholder="Имя / Название" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }} required />
                <input type="text" placeholder="Номер телефона" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }} required />
                <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                  <button type="submit" style={{ flex: 1, padding: 8, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Сохранить</button>
                  <button type="button" onClick={() => setShowAddClient(false)} style={{ flex: 1, padding: 8, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Отмена</button>
                </div>
              </form>
            </div>
        )}

        {showQR && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#fff', padding: 24, borderRadius: 8, textAlign: 'center' }}>
                <h3>Отсканируйте QR-код в WhatsApp</h3>
                {qrCode ? <QRCodeSVG value={qrCode} size={200} /> : <p>Загрузка QR...</p>}
                <button onClick={() => setShowQR(false)} style={{ marginTop: 15 }}>Закрыть</button>
              </div>
            </div>
        )}
      </div>
  );
}