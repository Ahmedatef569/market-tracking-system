import { supabase, handleSupabase } from './supabaseClient.js';

export async function fetchNotifications(userId, { includeRead = false } = {}) {
    if (!userId) return [];
    const query = supabase
        .from('notifications')
        .select('id, entity_type, entity_id, message, is_read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (!includeRead) {
        query.eq('is_read', false);
    }
    return handleSupabase(query, 'fetch notifications');
}

export async function markNotificationsRead(userId) {
    if (!userId) return;
    await handleSupabase(
        supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('is_read', false),
        'mark notifications'
    );
}

export async function createNotification({ userId, entityType, entityId, message }) {
    if (!userId) return;
    await handleSupabase(
        supabase.from('notifications').insert({
            user_id: userId,
            entity_type: entityType,
            entity_id: entityId,
            message
        }),
        'create notification'
    );
}
