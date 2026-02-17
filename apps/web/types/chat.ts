
export interface Message {
    id: string;
    conversation_id: string;
    sender_type: 'user' | 'ai' | 'lead';
    content: string;
    message_type: 'text' | 'image' | 'audio';
    created_at: string;
    metadata?: string | Record<string, any>;
}

export interface Conversation {
    id: string;
    lead_id: string;
    platform: 'whatsapp' | 'instagram';
    lead_name?: string; // Helper for UI
    last_message?: string;
    unread_count?: number;
    updated_at?: string;
    profile_picture_url?: string;
    last_interaction_at?: string; // Timestamp of last inbound message from lead (for 24h window)
}
