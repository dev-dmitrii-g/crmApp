export interface Client {
    id: number;
    phone: string;
    name: string;
    status: string;
}

export interface Stage {
    id: number;
    name: string;
    code: string;
    color: string;
    sort_order: number;
    wip_limit: number;
    is_system: boolean;
}

export interface Message {
    id?: number;
    text: string;
    is_outgoing: boolean;
}

export interface Manager {
    id: number;
    name: string;
    email: string;
    role: string;
    created_at: string;
}

export interface Analytics {
    metrics: {
        total_clients: number;
        new_clients: number;
        in_progress_clients: number;
        done_clients: number;
        total_messages: number;
        outgoing_messages: number;
        incoming_messages: number;
    };
    recent_activity: {
        id: number;
        user_name: string;
        action: string;
        details: string;
        timestamp: string;
    }[];
}