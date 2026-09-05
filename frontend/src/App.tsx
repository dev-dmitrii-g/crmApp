import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

const API = 'http://localhost:8080/api';

interface Client {
  id: number;
  phone: string;
  name: string;
  status: string;
}

interface Message {
  id?: number;
  text: string;
  is_outgoing: boolean;
}

export default function App() {
  const [token, setToken] = useState<string>(localStorage.getItem('token') || '');
  const [email, setEmail] = useState<string>('manager@test.com');
  const [password, setPassword] = useState<string>('password123');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [qrCode, setQrCode] = useState<string>('');
  const [showQR, setShowQR] = useState<boolean>(false);

  // Состояния для добавления нового клиента
  const [showAddClient, setShowAddClient] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState<string>('');

  // WebSocket для живых обновлений чата и доски
  useEffect(() => {
    if (!token) return;

    const chatWs = new WebSocket(`ws://localhost:8080/api/ws/chat?token=${token}`);

    chatWs.onmessage = () => {
      void fetchClients();
      if (selectedClient) {
        void openChat(selectedClient);
      }
    };

    // Keep-alive ping
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
  }, [token, selectedClient]);

  useEffect(() => {
    if (token) {
      void fetchClients();
    }
  }, [token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API}/auth/login`, { email, password });
      const newToken = res.data.token;
      localStorage.setItem('token', newToken);
      setToken(newToken);
    } catch {
      try {
        const regRes = await axios.post(`${API}/auth/register`, { name: 'Manager', email, password });
        const newToken = regRes.data.token;
        localStorage.setItem('token', newToken);
        setToken(newToken);
      } catch (err) {
        alert('Ошибка авторизации');
      }
    }
  };

  const fetchClients = async () => {
    try {
      const res = await axios.get<Client[]>(`${API}/clients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setClients(res.data || []);
    } catch (err) {
      console.error('Failed to fetch clients', err);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientPhone) return;

    try {
      await axios.post(`${API}/clients`,
          { name: newClientName, phone: newClientPhone },
          { headers: { Authorization: `Bearer ${token}` } }
      );

      setNewClientName('');
      setNewClientPhone('');
      setShowAddClient(false);
      await fetchClients();
    } catch (err) {
      alert('Ошибка при создании клиента');
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await axios.patch(`${API}/clients/${id}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchClients();
    } catch (err) {
      console.error('Failed to update status', err);
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
      const res = await axios.get<Message[]>(`${API}/messages?client_id=${client.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data || []);
    } catch (err) {
      console.error('Failed to fetch messages', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage || !selectedClient) return;
    try {
      await axios.post(`${API}/messages/send`,
          { client_id: selectedClient.id, text: newMessage },
          { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages((prev) => [...prev, { text: newMessage, is_outgoing: true }]);
      setNewMessage('');
    } catch (err) {
      alert('Ошибка отправки сообщения');
    }
  };

  // Парсинг ссылок и медиа в сообщениях
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
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={(e) => { void handleAuth(e); }} style={{ background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
            <h2>Вход в CRM</h2>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%' }} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль" style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%' }} />
            <button type="submit" style={{ width: '100%', padding: 10, background: '#25D366', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Войти</button>
          </form>
        </div>
    );
  }

  return (
      <div style={{ padding: 20 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2>WhatsApp CRM Канбан</h2>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowAddClient(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: 6, cursor: 'pointer' }}>
              + Новый клиент
            </button>
            <button onClick={connectWhatsApp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: 6, cursor: 'pointer' }}>
              Привязать WhatsApp
            </button>
          </div>
        </header>

        {/* Канбан Доска */}
        <div style={{ display: 'flex', gap: 20 }}>
          {['new', 'in_progress', 'done'].map((status) => (
              <div key={status} style={{ flex: 1, background: '#e5e7eb', padding: 15, borderRadius: 8, minHeight: 400 }}>
                <h3 style={{ textTransform: 'uppercase', fontSize: 14, color: '#4b5563' }}>{status}</h3>
                {clients.filter(c => c.status === status).map(client => (
                    <div key={client.id} onClick={() => { void openChat(client); }} style={{ background: '#fff', padding: 12, margin: '10px 0', borderRadius: 6, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <strong>{client.name}</strong>
                      <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: 12 }}>{client.phone}</p>
                      <div style={{ marginTop: 8, display: 'flex', gap: 5 }}>
                        {status !== 'new' && <button onClick={(e) => { e.stopPropagation(); void updateStatus(client.id, 'new'); }}>← New</button>}
                        {status !== 'in_progress' && <button onClick={(e) => { e.stopPropagation(); void updateStatus(client.id, 'in_progress'); }}>Work</button>}
                        {status !== 'done' && <button onClick={(e) => { e.stopPropagation(); void updateStatus(client.id, 'done'); }}>Done →</button>}
                      </div>
                    </div>
                ))}
              </div>
          ))}
        </div>

        {/* Чат */}
        {selectedClient && (
            <div style={{ position: 'fixed', right: 20, bottom: 20, width: 350, background: '#fff', border: '1px solid #ccc', borderRadius: 8, padding: 15, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 10 }}>
                <h4>Чат с {selectedClient.name}</h4>
                <button onClick={() => setSelectedClient(null)}>✕</button>
              </div>
              <div style={{ height: 250, overflowY: 'auto', margin: '10px 0' }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ textAlign: m.is_outgoing ? 'right' : 'left', margin: '5px 0' }}>
                <span style={{ background: m.is_outgoing ? '#dcf8c6' : '#f0f0f0', padding: '6px 10px', borderRadius: 6, display: 'inline-block' }}>
                  {renderMessageText(m.text)}
                </span>
                    </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Сообщение..." style={{ flex: 1, padding: 8 }} />
                <button onClick={() => { void sendMessage(); }} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '8px 12px' }}>Send</button>
              </div>
            </div>
        )}

        {showAddClient && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <form onSubmit={(e) => { void handleCreateClient(e); }} style={{ background: '#fff', padding: 24, borderRadius: 8, width: 320 }}>
                <h3 style={{ marginTop: 0 }}>Добавить клиента</h3>
                <input
                    type="text"
                    placeholder="Имя / Название"
                    value={newClientName}
                    onChange={e => setNewClientName(e.target.value)}
                    style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }}
                    required
                />
                <input
                    type="text"
                    placeholder="Номер телефона (например, 79991112233)"
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(e.target.value)}
                    style={{ display: 'block', margin: '10px 0', padding: 8, width: '100%', boxSizing: 'border-box' }}
                    required
                />
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