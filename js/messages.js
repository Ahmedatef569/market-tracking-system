import { supabase, handleSupabase } from './supabaseClient.js';

/**
 * Fetch messages sent by admin (for admin users)
 * Returns messages with recipient count and unread count
 */
export async function fetchSentMessages(userId) {
    if (!userId) return [];

    try {
        // Get all messages sent by this admin
        const messages = await handleSupabase(
            supabase
                .from('messages')
                .select('id, subject, message_text, recipient_display, created_at, updated_at')
                .eq('sender_id', userId)
                .order('created_at', { ascending: false }),
            'fetch sent messages'
        );

        if (!messages || messages.length === 0) return [];

        // Get recipient counts for each message
        const messageIds = messages.map(m => m.id);
        const recipients = await handleSupabase(
            supabase
                .from('message_recipients')
                .select('message_id, is_read')
                .in('message_id', messageIds),
            'fetch message recipients'
        );

        // Aggregate recipient data
        const recipientData = {};
        recipients.forEach(r => {
            if (!recipientData[r.message_id]) {
                recipientData[r.message_id] = { total: 0, unread: 0 };
            }
            recipientData[r.message_id].total++;
            if (!r.is_read) {
                recipientData[r.message_id].unread++;
            }
        });

        // Combine data
        return messages.map(m => ({
            ...m,
            recipientCount: recipientData[m.id]?.total || 0,
            unreadCount: recipientData[m.id]?.unread || 0
        }));
    } catch (error) {
        console.error('Error fetching sent messages:', error);
        return [];
    }
}

/**
 * Fetch messages received by user (for manager/employee users)
 * Returns messages with sender info and read status
 */
export async function fetchReceivedMessages(userId) {
    if (!userId) return [];
    
    try {
        const data = await handleSupabase(
            supabase
                .from('v_message_details')
                .select('*')
                .eq('recipient_id', userId)
                .order('created_at', { ascending: false }),
            'fetch received messages'
        );

        return data || [];
    } catch (error) {
        console.error('Error fetching received messages:', error);
        return [];
    }
}

/**
 * Get count of unread messages for a user
 */
export async function getUnreadMessageCount(userId) {
    if (!userId) return 0;
    
    try {
        const { count, error } = await supabase
            .from('message_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('recipient_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('Error getting unread message count:', error);
        return 0;
    }
}

/**
 * Send a new message (admin only)
 */
export async function sendMessage({ senderId, subject, messageText, recipientIds, recipientDisplay }) {
    if (!senderId || !messageText || !recipientIds || recipientIds.length === 0) {
        throw new Error('Missing required fields');
    }

    try {
        // Insert message
        const message = await handleSupabase(
            supabase
                .from('messages')
                .insert({
                    sender_id: senderId,
                    subject: subject || null,
                    message_text: messageText,
                    recipient_display: recipientDisplay || null
                })
                .select('id')
                .single(),
            'send message'
        );

        // Insert recipients
        const recipientRecords = recipientIds.map(recipientId => ({
            message_id: message.id,
            recipient_id: recipientId
        }));

        await handleSupabase(
            supabase
                .from('message_recipients')
                .insert(recipientRecords),
            'add message recipients'
        );

        return message;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(messageId, userId) {
    if (!messageId || !userId) return;

    try {
        await handleSupabase(
            supabase
                .from('message_recipients')
                .update({ 
                    is_read: true, 
                    read_at: new Date().toISOString() 
                })
                .eq('message_id', messageId)
                .eq('recipient_id', userId)
                .eq('is_read', false),
            'mark message as read'
        );
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

/**
 * Delete messages (admin only)
 * Deletes the message and all associated recipients
 */
export async function deleteMessages(messageIds) {
    if (!messageIds || messageIds.length === 0) return;

    try {
        await handleSupabase(
            supabase
                .from('messages')
                .delete()
                .in('id', messageIds),
            'delete messages'
        );
    } catch (error) {
        console.error('Error deleting messages:', error);
        throw error;
    }
}

