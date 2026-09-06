import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from './services/api';
import type { Client, Stage, Manager, Analytics, Message, TransitionRule, StageRequiredField, LossReason, FieldDefinition, FieldStageVisibility, SLASetting, ClientFilters, SavedFilter } from './types';
import { emptyFilters } from './types';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { FilterBar } from './components/kanban/FilterBar';
import { AdminPanel } from './components/admin/AdminPanel';
import { ClientCard } from './components/crm/ClientCard';
import { ContactsCompanies } from './components/crm/ContactsCompanies';
import { ChatPanel } from './components/chat/ChatPanel';
import { c, dotGrid, inp, btn } from './theme';
import { MessageCircle, Plus, LogOut } from 'lucide-react';
import { useToast } from './hooks/useToast';
import { Spinner } from './components/ui/Spinner';

type TabType = 'kanban' | 'counterparties' | 'admin';

export default function App() {
  const toast = useToast();
  const [token, setToken] = useState<string>(localStorage.getItem('token') || '');
  const [email, setEmail] = useState<string>('manager@test.com');
  const [password, setPassword] = useState<string>('password123');
  const [userRole, setUserRole] = useState<string>(localStorage.getItem('role') || 'manager');

  const [activeTab, setActiveTab] = useState<TabType>('kanban');

  const [stages, setStages] = useState<Stage[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [transitionRules, setTransitionRules] = useState<TransitionRule[]>([]);
  const [stageRequiredFields, setStageRequiredFields] = useState<StageRequiredField[]>([]);
  const [lossReasons, setLossReasons] = useState<LossReason[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [fieldVisibility, setFieldVisibility] = useState<FieldStageVisibility[]>([]);
  const [slaSettings, setSlaSettings] = useState<SLASetting[]>([]);
  const [cardClient, setCardClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>('');
  const [showAddClient, setShowAddClient] = useState<boolean>(false);
  const [newClientName, setNewClientName] = useState<string>('');
  const [newClientPhone, setNewClientPhone] = useState<string>('');
  const [savingClient, setSavingClient] = useState<boolean>(false);
  const [sendingMsg, setSendingMsg] = useState<boolean>(false);
  const [loadingKanban, setLoadingKanban] = useState<boolean>(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [filters, setFilters] = useState<ClientFilters>(emptyFilters());
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  const isAdmin = userRole === 'admin';
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Refs to avoid WS closure stale-state bug
  const selectedClientRef = useRef<Client | null>(null);
  const activeTabRef = useRef<TabType>('kanban');
  const fetchClientsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const fetchAdminDataRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => { selectedClientRef.current = selectedClient; }, [selectedClient]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddClient(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Single WS connection — only reconnects when token changes
  useEffect(() => {
    if (!token) return;
    const chatWs = new WebSocket(`ws://localhost:8080/api/ws/chat?token=${token}`);
    chatWs.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string) as {
          type?: string; id?: number; client_id?: number;
          text?: string; is_outgoing?: boolean;
        };
        if (data.type === 'new_message' && data.client_id != null) {
          const sc = selectedClientRef.current;
          // Append to current chat if this client's chat is open
          if (sc && sc.id === data.client_id) {
            setMessages(prev => {
              // Deduplicate by ID for outgoing (optimistic add gave no ID yet)
              if (data.is_outgoing && prev.some(m => m.id === data.id)) return prev;
              return [...prev, {
                id: data.id,
                client_id: data.client_id,
                text: data.text ?? '',
                is_outgoing: data.is_outgoing ?? false,
                timestamp: new Date().toISOString(),
              }];
            });
          }
          // Refresh client list (new leads, unread counts)
          void fetchClientsRef.current();
          if (activeTabRef.current === 'admin') void fetchAdminDataRef.current();
        }
      } catch {
        // Non-JSON (shouldn't happen)
        void fetchClientsRef.current();
      }
    };
    const ping = setInterval(() => {
      if (chatWs.readyState === WebSocket.OPEN) chatWs.send(JSON.stringify({ type: 'ping' }));
    }, 30000);
    return () => { clearInterval(ping); if (chatWs.readyState < 2) chatWs.close(); };
  }, [token]); // ← no more selectedClient/activeTab in deps

  useEffect(() => {
    if (token) {
      void fetchStages();
      void fetchClients();
      void fetchWAStatus();
      api.get<SavedFilter[]>('/saved-filters')
        .then(r => setSavedFilters(r.data || []))
        .catch(() => { /* ignore */ });
      if (activeTab === 'admin') void fetchAdminData();
    }
  }, [token, activeTab]);

  const handleApplyFilters = (f: ClientFilters) => {
    setFilters(f);
    void fetchClients(f);
  };

  const fetchStages = useCallback(async () => {
    try {
      const [sR, trR, srR, lrR, fdR, fvR] = await Promise.all([
        api.get<Stage[]>('/pipeline/stages'),
        api.get<TransitionRule[]>('/pipeline/transition-rules'),
        api.get<StageRequiredField[]>('/pipeline/stage-fields'),
        api.get<LossReason[]>('/crm/loss-reasons'),
        api.get<FieldDefinition[]>('/pipeline/field-definitions'),
        api.get<FieldStageVisibility[]>('/pipeline/field-visibility'),
      ]);
      setStages(sR.data || []);
      setTransitionRules(trR.data || []);
      setStageRequiredFields(srR.data || []);
      setLossReasons(lrR.data || []);
      setFieldDefinitions(fdR.data || []);
      setFieldVisibility(fvR.data || []);
    } catch (err) { console.error(err); }
    // SLA fetched separately — must not block stage loading
    try {
      const slaR = await api.get<SLASetting[]>('/automation/sla');
      setSlaSettings(slaR.data || []);
    } catch { /* SLA unavailable — badges simply won't show */ }
  }, []);

  const fetchClients = useCallback(async (f?: ClientFilters) => {
    try {
      const params = new URLSearchParams();
      const active = f ?? filters;
      Object.entries(active).forEach(([k, v]) => { if (v) params.set(k, v); });
      const r = await api.get<Client[]>(`/clients${params.size ? '?' + params.toString() : ''}`);
      setClients(r.data || []);
    } catch (err) { console.error(err); }
    finally { setLoadingKanban(false); }
  }, [filters]);

  const fetchAdminData = useCallback(async () => {
    try {
      const [mR, aR] = await Promise.all([
        api.get<Manager[]>('/admin/managers'),
        api.get<Analytics>('/admin/analytics'),
      ]);
      setManagers(mR.data || []);
      setAnalytics(aR.data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchWAStatus = useCallback(async () => {
    try {
      const r = await api.get<{ connected: boolean }>('/whatsapp/status');
      setWaConnected(r.data.connected);
    } catch { /* ignore */ }
  }, []);

  // Keep function refs fresh so the WS handler always calls the latest version
  useEffect(() => { fetchClientsRef.current = fetchClients; }, [fetchClients]);
  useEffect(() => { fetchAdminDataRef.current = fetchAdminData; }, [fetchAdminData]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/login', { email, password });
      const tok = res.data.token;
      const role = res.data.user?.role || 'manager';
      localStorage.setItem('token', tok);
      localStorage.setItem('role', role);
      setToken(tok); setUserRole(role);
    } catch {
      try {
        const res = await api.post('/auth/register', { name: 'Manager', email, password });
        const tok = res.data.token;
        const role = res.data.user?.role || 'manager';
        localStorage.setItem('token', tok);
        localStorage.setItem('role', role);
        setToken(tok); setUserRole(role);
      } catch { toast.error('Ошибка авторизации — проверьте email и пароль'); }
    }
  };

  const updateStatus = async (id: number, status: string, lossReason?: string, customFields?: Record<string, string>) => {
    try {
      await api.patch(`/clients/${id}/status`, { status, loss_reason: lossReason, custom_fields: customFields });
      await fetchClients();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Не удалось переместить карточку');
    }
  };

  const reorderStages = async (draggedId: number, targetId: number) => {
    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
    const fi = sorted.findIndex(s => s.id === draggedId);
    const ti = sorted.findIndex(s => s.id === targetId);
    if (fi === -1 || ti === -1) return;
    const r = [...sorted];
    const [m] = r.splice(fi, 1);
    r.splice(ti, 0, m);
    setStages(r.map((s, i) => ({ ...s, sort_order: i })));
    try { await api.put('/admin/pipeline/stages/reorder', { ids: r.map(s => s.id) }); }
    catch { await fetchStages(); }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClient(true);
    try {
      await api.post('/clients', { name: newClientName, phone: newClientPhone });
      toast.success(`Клиент «${newClientName}» создан`);
      setNewClientName(''); setNewClientPhone(''); setShowAddClient(false);
      await fetchClients();
    } catch { toast.error('Ошибка при создании клиента'); }
    finally { setSavingClient(false); }
  };

  const openChat = async (client: Client) => {
    setSelectedClient(client);
    setMessages([]);
    setLoadingMessages(true);
    try {
      const r = await api.get<Message[]>(`/messages?client_id=${client.id}`);
      setMessages(r.data || []);
    } catch { toast.error('Не удалось загрузить сообщения'); }
    finally { setLoadingMessages(false); }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;
    setSendingMsg(true);
    const text = newMessage;
    setNewMessage('');
    try {
      const r = await api.post<Message>('/messages/send', { client_id: selectedClient.id, text });
      // Add the confirmed message (with real ID and timestamp) — skip if WS already added it
      setMessages(prev => {
        if (r.data.id && prev.some(m => m.id === r.data.id)) return prev;
        return [...prev, { ...r.data, timestamp: new Date().toISOString() }];
      });
    } catch {
      toast.error('Не удалось отправить сообщение');
      setNewMessage(text); // restore
    }
    finally { setSendingMsg(false); }
  };

  // ─── Login ────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: c.bgBase, ...dotGrid }}>
        <form onSubmit={e => { void handleAuth(e); }}
          style={{ background: c.bgCard, border: `1px solid ${c.borderMd}`, borderRadius: 16, padding: '36px 32px', width: 340, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#25D366,#128C7E)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={24} color="#fff" strokeWidth={2} />
            </div>
            <h2 style={{ margin: 0, fontSize: 20, color: c.text1, fontWeight: 700 }}>Вход в CRM</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: c.text2 }}>WhatsApp CRM Platform</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inp()} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль" style={inp()} />
            <button type="submit" style={btn('#25D366', { padding: '11px', fontSize: 14, fontWeight: 700, borderRadius: 10, marginTop: 4, boxShadow: '0 4px 14px rgba(37,211,102,0.25)' })}>
              Войти
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ─── App ──────────────────────────────────────────────────────────────────
  const navTabs: { key: TabType; label: string }[] = [
    { key: 'kanban', label: 'Канбан' },
    { key: 'counterparties', label: 'Контрагенты' },
    ...(isAdmin ? [{ key: 'admin' as TabType, label: 'Настройки' }] : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: c.bgBase, overflow: 'hidden' }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 52, borderBottom: `1px solid ${c.border}`,
        background: c.bgCard, flexShrink: 0, gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#25D366,#128C7E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={15} color="#fff" strokeWidth={2} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color: c.text1, whiteSpace: 'nowrap' }}>WhatsApp CRM</span>
          </div>
          <nav style={{ display: 'flex', gap: 2 }}>
            {navTabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                padding: '5px 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13,
                fontWeight: activeTab === t.key ? 600 : 400,
                background: activeTab === t.key ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: activeTab === t.key ? c.blue : c.text2,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>{t.label}</button>
            ))}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* WhatsApp connection status pill */}
          <div
            title={waConnected ? 'WhatsApp подключён' : 'WhatsApp не подключён — чат недоступен'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: waConnected ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
              color: waConnected ? c.green : c.red,
              border: `1px solid ${waConnected ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.22)'}`,
              userSelect: 'none',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: waConnected ? c.green : c.red, flexShrink: 0 }} />
            {waConnected ? 'WA' : 'WA офлайн'}
          </div>
          <button
            onClick={() => { localStorage.clear(); setToken(''); setUserRole('manager'); }}
            title="Выйти"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'transparent', border: `1px solid ${c.border}`, borderRadius: 7, color: c.text2, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
          ><LogOut size={13} strokeWidth={1.8} /> Выйти</button>
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* Kanban */}
        {activeTab === 'kanban' && (
          <>
            <FilterBar
              stages={stages}
              managers={managers}
              filters={filters}
              savedFilters={savedFilters}
              onApply={handleApplyFilters}
              onSavedFiltersChange={setSavedFilters}
            />
            <div style={{ flex: 1, padding: '14px 16px', overflowX: 'auto', overflowY: 'hidden', ...dotGrid }}>
              <KanbanBoard
                stages={stages}
                clients={clients}
                transitionRules={transitionRules}
                stageRequiredFields={stageRequiredFields}
                lossReasons={lossReasons}
                slaSettings={slaSettings}
                isAdmin={isAdmin}
                loading={loadingKanban}
                waConnected={waConnected}
                onOpenChat={cl => { void openChat(cl); }}
                onOpenCard={cl => setCardClient(cl)}
                onUpdateStatus={(id, s, r, cf) => { void updateStatus(id, s, r, cf); }}
                onReorderStages={(did, tid) => { void reorderStages(did, tid); }}
              />
            </div>
            {/* FAB: Add client */}
            <button
              onClick={() => setShowAddClient(true)}
              title="Добавить клиента"
              style={{
                position: 'fixed', bottom: 28, right: 28,
                width: 52, height: 52, borderRadius: '50%',
                background: c.blue, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 4px 20px ${c.blue}50`,
                transition: 'transform 0.15s, box-shadow 0.15s', zIndex: 200,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            ><Plus size={22} color="#fff" strokeWidth={2.5} /></button>
          </>
        )}

        {activeTab === 'counterparties' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            <ContactsCompanies />
          </div>
        )}

        {activeTab === 'admin' && (
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <AdminPanel
              stages={stages}
              fieldDefinitions={fieldDefinitions}
              fieldVisibility={fieldVisibility}
              managers={managers}
              analytics={analytics}
              onRefresh={() => { void fetchStages(); void fetchAdminData(); }}
              onWAConnected={() => setWaConnected(true)}
              onSLAUpdated={() => { void fetchStages(); }}
            />
          </div>
        )}
      </main>

      {/* ── Chat panel ── */}
      {selectedClient && (
        <ChatPanel
          client={selectedClient}
          messages={messages}
          loadingMessages={loadingMessages}
          sendingMsg={sendingMsg}
          newMessage={newMessage}
          onNewMessage={setNewMessage}
          onSend={() => { void sendMessage(); }}
          onClose={() => { setSelectedClient(null); setMessages([]); }}
        />
      )}

      {/* ── Add client modal ── */}
      {showAddClient && (
        <Overlay onClose={() => setShowAddClient(false)}>
          <form onSubmit={e => { void handleCreateClient(e); }} style={modalBox} onClick={e => e.stopPropagation()}>
            <p style={modalTitle}>Новый клиент</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Label>Имя / Название</Label>
                <input autoFocus placeholder="Иванов Иван" value={newClientName} onChange={e => setNewClientName(e.target.value)} style={inp()} required />
              </div>
              <div>
                <Label>Номер телефона</Label>
                <input type="tel" placeholder="+7 900 000-00-00" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} style={inp()} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button type="submit" disabled={savingClient} aria-busy={savingClient}
                style={{ ...btn(c.blue, { flex: 1, padding: '10px', borderRadius: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }), opacity: savingClient ? 0.6 : 1, cursor: savingClient ? 'default' : 'pointer' }}>
                {savingClient ? <Spinner size={14} color="#fff" /> : null} Создать
              </button>
              <button type="button" onClick={() => setShowAddClient(false)} style={btn('rgba(255,255,255,0.06)', { flex: 1, padding: '10px', borderRadius: 9, border: `1px solid ${c.border}`, color: c.text1 })}>Отмена</button>
            </div>
          </form>
        </Overlay>
      )}

      {/* ── Client card ── */}
      {cardClient && (
        <ClientCard
          client={cardClient}
          stages={stages}
          fieldDefinitions={fieldDefinitions}
          fieldVisibility={fieldVisibility}
          onClose={() => setCardClient(null)}
          onRefresh={() => { void fetchClients(); }}
        />
      )}

    </div>
  );
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

export const Overlay: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    {children}
  </div>
);

export const modalBox: React.CSSProperties = {
  background: '#18181b', border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 16, padding: '28px', width: 380, maxWidth: 'calc(100vw - 40px)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
};

export const modalTitle: React.CSSProperties = {
  margin: '0 0 20px', fontWeight: 700, fontSize: 17, color: '#f0f0f0',
};

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, color: '#8a8a8a', fontWeight: 600, marginBottom: 5 }}>{children}</div>
);
