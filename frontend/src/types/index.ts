export interface Client {
    id: number;
    phone: string;
    name: string;
    status: string;
    loss_reason?: string;
    custom_fields?: Record<string, string>;
}

export interface Stage {
    id: number;
    name: string;
    code: string;
    color: string;
    sort_order: number;
    wip_limit: number;
    is_system: boolean;
    is_fail?: boolean;
    is_success?: boolean;
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

export interface LossReason {
    id: number;
    name: string;
}

export interface FieldDefinition {
    id: number;
    name: string;
    key: string;
    type: 'text' | 'number' | 'list' | 'date' | 'file' | 'formula';
    options: string[];
    formula: string;
    sort_order: number;
}

export type FieldVisibilityMode = 'normal' | 'required' | 'hidden';

export interface FieldStageVisibility {
    id: number;
    field_key: string;
    stage_code: string;
    mode: FieldVisibilityMode;
}

export interface Contact {
    id: number;
    name: string;
    phone: string;
    email: string;
    company_id?: number;
    company_name?: string;
    created_at: string;
}

export interface Company {
    id: number;
    name: string;
    inn: string;
    phone: string;
    email: string;
    website: string;
    created_at: string;
}

export interface ClientCounterparties {
    contacts: Contact[];
    companies: Company[];
}

export interface TransitionRule {
    id: number;
    from_stage_code: string;
    to_stage_code: string;
}

export interface StageRequiredField {
    id: number;
    stage_code: string;
    field_name: string;
    field_label: string;
}
