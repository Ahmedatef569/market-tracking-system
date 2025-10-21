import { supabase, handleSupabase } from './supabaseClient.js';
import { setSession, getSession, getRoleHome, hydrateSession, recordLastLogin } from './session.js';
import { showAlert, hideAlert, setLoadingState } from './utils.js';

const form = document.getElementById('login-form');
const feedback = document.getElementById('login-feedback');
const submitButton = form.querySelector('button[type="submit"]');
const yearEl = document.getElementById('year');

if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
}

(function redirectIfLoggedIn() {
    const session = getSession();
    if (session?.role) {
        window.location.href = getRoleHome(session.role);
    }
})();

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert(feedback);

    const username = form.username.value.trim();
    const password = form.password.value.trim();

    if (!username || !password) {
        showAlert(feedback, 'Please provide both username and password.');
        return;
    }

    try {
        setLoadingState(submitButton, true, 'Signing in...');

        const data = await handleSupabase(
            supabase
                .from('users')
                .select('id, username, password, role, employee_id')
                .eq('username', username)
                .maybeSingle(),
            'fetch user'
        );

        if (!data || data.password !== password) {
            showAlert(feedback, 'Invalid username or password.');
            setLoadingState(submitButton, false);
            return;
        }

        const session = {
            userId: data.id,
            username: data.username,
            role: data.role,
            employeeId: data.employee_id,
            lastSynced: 0
        };

        setSession(session);
        await recordLastLogin(data.id);
        await hydrateSession(session, { force: true });

        window.location.href = getRoleHome(data.role);
    } catch (error) {
        showAlert(feedback, error.message || 'Unable to sign in, please try again.');
    } finally {
        setLoadingState(submitButton, false);
    }
});
