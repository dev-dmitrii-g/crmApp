import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    X, Send, Download, FileText, Mic, Video,
    Maximize2, Loader,
} from 'lucide-react';
import type { Client, Message } from '../../types';
import { c, inp, btn } from '../../theme';
import { Spinner } from '../ui/Spinner';

// ─── Message content parsing ──────────────────────────────────────────────────

type MsgContent =
    | { kind: 'text'; text: string }
    | { kind: 'image'; url: string; caption?: string }
    | { kind: 'audio'; url: string }
    | { kind: 'video'; url: string; caption?: string }
    | { kind: 'document'; url: string; name: string }
    | { kind: 'sticker'; url: string };

const parseMsg = (text: string): MsgContent => {
    if (text.startsWith('📷')) {
        // "📷 [Картинка: url] caption" or "📷 Картинка: url"
        const captionMatch = text.match(/^📷 \[Картинка: (https?:\/\/[^\]]+)\] (.+)$/);
        if (captionMatch) return { kind: 'image', url: captionMatch[1], caption: captionMatch[2] };
        const plain = text.match(/^📷 Картинка: (https?:\/\/\S+)$/);
        if (plain) return { kind: 'image', url: plain[1] };
    }
    if (text.startsWith('🎤 Голосовое сообщение: ')) {
        return { kind: 'audio', url: text.slice('🎤 Голосовое сообщение: '.length).trim() };
    }
    if (text.startsWith('📄 Документ: ')) {
        const url = text.slice('📄 Документ: '.length).trim();
        const rawName = url.split('/').pop() ?? 'файл';
        const name = rawName.replace(/^\d+_/, '');
        return { kind: 'document', url, name };
    }
    if (text.startsWith('🎥 Видео: ')) {
        const rest = text.slice('🎥 Видео: '.length);
        const captionMatch = rest.match(/^(https?:\/\/\S+) \[(.+)\]$/);
        if (captionMatch) return { kind: 'video', url: captionMatch[1], caption: captionMatch[2] };
        return { kind: 'video', url: rest.trim() };
    }
    if (text.startsWith('🖼️ Стикер: ')) {
        return { kind: 'sticker', url: text.slice('🖼️ Стикер: '.length).trim() };
    }
    return { kind: 'text', text };
};

const fmtTime = (ts?: string): string => {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    client: Client;
    messages: Message[];
    loadingMessages: boolean;
    sendingMsg: boolean;
    newMessage: string;
    onNewMessage: (v: string) => void;
    onSend: () => void;
    onClose: () => void;
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export const ChatPanel: React.FC<Props> = ({
    client, messages, loadingMessages, sendingMsg, newMessage, onNewMessage, onSend, onClose,
}) => {
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [lightbox, setLightbox] = useState<string | null>(null);

    // ── Draggable ─────────────────────────────────────────────────────────────
    const PANEL_W = 360;
    const PANEL_H = 560;
    const [pos, setPos] = useState(() => ({
        x: Math.max(0, window.innerWidth - PANEL_W - 24),
        y: Math.max(0, window.innerHeight - PANEL_H - 24),
    }));
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        dragging.current = true;
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        e.preventDefault();
    }, [pos]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            setPos({
                x: Math.max(0, Math.min(window.innerWidth - PANEL_W, e.clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y)),
            });
        };
        const onUp = () => { dragging.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    // ── Scroll to bottom on new messages ──────────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Focus input when panel opens ──────────────────────────────────────────
    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [client.id]);

    // ── Escape closes lightbox then panel ────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (lightbox) { setLightbox(null); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [lightbox, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
    };

    return (
        <>
            {/* ── Panel ── */}
            <div
                role="dialog"
                aria-label={`Чат с ${client.name}`}
                style={{
                    position: 'fixed',
                    left: pos.x,
                    top: pos.y,
                    width: PANEL_W,
                    height: PANEL_H,
                    background: c.bgCard,
                    border: `1px solid ${c.borderMd}`,
                    borderRadius: 14,
                    overflow: 'hidden',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
                    zIndex: 900,
                    display: 'flex',
                    flexDirection: 'column',
                    userSelect: dragging.current ? 'none' : 'auto',
                }}
            >
                {/* Header */}
                <div
                    onMouseDown={onHeaderMouseDown}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: c.bgElevated,
                        borderBottom: `1px solid ${c.border}`,
                        flexShrink: 0,
                        cursor: 'grab',
                        minHeight: 52,
                    }}
                >
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg,#25D366,#128C7E)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: '#fff',
                    }}>
                        {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: c.text1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {client.name}
                        </div>
                        <div style={{ fontSize: 11, color: c.text2, marginTop: 1 }}>{client.phone}</div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Закрыть чат"
                        style={{ display: 'inline-flex', background: 'none', border: 'none', color: c.text2, cursor: 'pointer', padding: 6, borderRadius: 7, flexShrink: 0 }}
                    ><X size={16} strokeWidth={2} /></button>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {loadingMessages ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: c.text3, fontSize: 13 }}>
                            <Loader size={16} color={c.text3} strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
                            Загрузка сообщений...
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: c.text3 }}>
                            <div style={{ fontSize: 32 }}>💬</div>
                            <div style={{ fontSize: 12, textAlign: 'center' }}>Нет сообщений.<br />Напишите первым!</div>
                        </div>
                    ) : (
                        messages.map((m, i) => (
                            <MessageBubble
                                key={m.id ?? i}
                                message={m}
                                onImageClick={setLightbox}
                            />
                        ))
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: `1px solid ${c.border}`, flexShrink: 0, background: c.bgCard }}>
                    <input
                        ref={inputRef}
                        value={newMessage}
                        onChange={e => onNewMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Сообщение..."
                        disabled={sendingMsg}
                        aria-label="Текст сообщения"
                        style={inp({ flex: 1, fontSize: 13, padding: '8px 11px', minWidth: 0 })}
                    />
                    <button
                        onClick={onSend}
                        disabled={sendingMsg || !newMessage.trim()}
                        aria-label="Отправить сообщение"
                        style={{
                            ...btn('#25D366', { padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }),
                            opacity: sendingMsg || !newMessage.trim() ? 0.45 : 1,
                            cursor: sendingMsg || !newMessage.trim() ? 'default' : 'pointer',
                            flexShrink: 0,
                        }}
                    >
                        {sendingMsg ? <Spinner size={15} color="#fff" /> : <Send size={15} strokeWidth={2} />}
                    </button>
                </div>
            </div>

            {/* ── Lightbox ── */}
            {lightbox && (
                <div
                    onClick={() => setLightbox(null)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
                        backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', zIndex: 9000, cursor: 'zoom-out',
                    }}
                >
                    <button
                        onClick={() => setLightbox(null)}
                        aria-label="Закрыть изображение"
                        style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff' }}
                    ><X size={20} strokeWidth={2} /></button>
                    <a href={lightbox} download aria-label="Скачать"
                        onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', top: 20, right: 64, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>
                        <Download size={20} strokeWidth={2} />
                    </a>
                    <img
                        src={lightbox}
                        alt="Фото"
                        onClick={e => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw', maxHeight: '90vh',
                            borderRadius: 10, objectFit: 'contain',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
                            cursor: 'default',
                        }}
                    />
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
};

// ─── MessageBubble ────────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
    message: Message;
    onImageClick: (url: string) => void;
}> = ({ message, onImageClick }) => {
    const content = parseMsg(message.text);
    const out = message.is_outgoing;

    const bubbleBg = out ? '#1a3a2a' : c.bgElevated;
    const bubbleBorder = out ? '#25D36635' : c.border;

    return (
        <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
            <div style={{
                maxWidth: '82%',
                background: bubbleBg,
                border: `1px solid ${bubbleBorder}`,
                borderRadius: out ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                padding: content.kind === 'image' || content.kind === 'sticker' ? '4px 4px 6px' : '8px 11px',
                overflow: 'hidden',
            }}>
                <MsgContent content={content} onImageClick={onImageClick} outgoing={out} />
                {/* Timestamp */}
                <div style={{
                    fontSize: 10, color: c.text3, marginTop: 3,
                    textAlign: 'right',
                    paddingRight: content.kind === 'image' || content.kind === 'sticker' ? 6 : 0,
                }}>
                    {fmtTime(message.timestamp)}
                </div>
            </div>
        </div>
    );
};

// ─── MsgContent renders by type ───────────────────────────────────────────────

const MsgContent: React.FC<{
    content: MsgContent;
    onImageClick: (url: string) => void;
    outgoing: boolean;
}> = ({ content, onImageClick }) => {
    switch (content.kind) {
        case 'text':
            return (
                <span style={{ fontSize: 13, color: c.text1, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {content.text}
                </span>
            );

        case 'image':
            return (
                <div>
                    <div style={{ position: 'relative', display: 'inline-block', cursor: 'zoom-in' }}
                        onClick={() => onImageClick(content.url)}>
                        <img
                            src={content.url}
                            alt={content.caption ?? 'Фото'}
                            loading="lazy"
                            style={{ maxWidth: 260, maxHeight: 220, borderRadius: 8, display: 'block', objectFit: 'cover' }}
                        />
                        <div style={{
                            position: 'absolute', top: 6, right: 6,
                            background: 'rgba(0,0,0,0.5)', borderRadius: 6,
                            padding: '3px 5px', display: 'flex', alignItems: 'center',
                        }}>
                            <Maximize2 size={11} color="#fff" strokeWidth={2} />
                        </div>
                    </div>
                    {content.caption && (
                        <div style={{ fontSize: 12, color: c.text2, marginTop: 5, padding: '0 4px' }}>{content.caption}</div>
                    )}
                </div>
            );

        case 'sticker':
            return (
                <img
                    src={content.url}
                    alt="Стикер"
                    style={{ width: 120, height: 120, objectFit: 'contain', display: 'block' }}
                />
            );

        case 'audio':
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Mic size={14} color={c.text2} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                    <audio
                        controls
                        src={content.url}
                        style={{ height: 32, flex: 1, minWidth: 180, maxWidth: 260, colorScheme: 'dark' }}
                    />
                </div>
            );

        case 'video':
            return (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Video size={13} color={c.text2} strokeWidth={1.8} />
                        <span style={{ fontSize: 11, color: c.text2 }}>Видео</span>
                    </div>
                    <video
                        controls
                        src={content.url}
                        style={{ maxWidth: 260, maxHeight: 200, borderRadius: 8, display: 'block', background: '#000' }}
                    />
                    {content.caption && (
                        <div style={{ fontSize: 12, color: c.text2, marginTop: 4 }}>{content.caption}</div>
                    )}
                </div>
            );

        case 'document': {
            const ext = content.name.split('.').pop()?.toUpperCase() ?? 'FILE';
            return (
                <a
                    href={content.url}
                    download={content.name}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                        background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', minWidth: 200,
                    }}
                >
                    <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(59,130,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: 1,
                    }}>
                        <FileText size={16} color={c.blue} strokeWidth={1.8} />
                        <span style={{ fontSize: 7, color: c.blue, fontWeight: 700 }}>{ext}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: c.text1, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{content.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Download size={10} color={c.blue} strokeWidth={2} />
                            <span style={{ fontSize: 10, color: c.blue }}>Скачать</span>
                        </div>
                    </div>
                </a>
            );
        }

        default:
            return null;
    }
};
