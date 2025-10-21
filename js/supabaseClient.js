import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false
    }
});

export async function handleSupabase(requestPromise, context = 'operation') {
    const { data, error } = await requestPromise;
    if (error) {
        console.error(`Supabase ${context} failed`, error);
        throw new Error(error.message || `Supabase ${context} failed`);
    }
    return data;
}
