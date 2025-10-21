import { supabase, handleSupabase } from './supabaseClient.js';
import { STORAGE_KEYS } from './config.js';
import { LOCAL_CACHE_TTL, ROLES } from './constants.js';

export function getSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SESSION);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error('Failed to parse session', error);
        return null;
    }
}

export function setSession(session) {
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
}

export function clearSession() {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
}

export function logout() {
    clearSession();
    window.location.href = 'index.html';
}

export async function requireAuth(allowedRoles = []) {
    let session = getSession();
    if (!session) {
        logout();
        return null;
    }

    if (allowedRoles.length && !allowedRoles.includes(session.role)) {
        logout();
        return null;
    }

    session = await hydrateSession(session);
    return session;
}

export async function hydrateSession(session = getSession(), { force = false } = {}) {
    if (!session) return null;

    const now = Date.now();
    if (!force && session.lastSynced && now - session.lastSynced < LOCAL_CACHE_TTL && session.employee) {
        return session;
    }

    const data = await handleSupabase(
        supabase
            .from('users')
            .select(`
                id,
                username,
                role,
                employee_id,
                employee:employee_id (
                    id,
                    code,
                    first_name,
                    last_name,
                    position,
                    role,
                    manager_level,
                    line_id,
                    area,
                    direct_manager_id,
                    line_manager_id,
                    email,
                    phone,
                    line:line_id (id, name)
                )
            `)
            .eq('id', session.userId)
            .maybeSingle(),
        'load session profile'
    );

    if (!data) {
        logout();
        return null;
    }

    const employee = data.employee
        ? {
              id: data.employee.id,
              code: data.employee.code,
              firstName: data.employee.first_name,
              lastName: data.employee.last_name,
              fullName: `${data.employee.first_name} ${data.employee.last_name}`.trim(),
              position: data.employee.position,
              role: data.employee.role || data.role,
              managerLevel: data.employee.manager_level,
              lineId: data.employee.line_id,
              lineName: data.employee.line?.name,
              area: data.employee.area,
              directManagerId: data.employee.direct_manager_id,
              lineManagerId: data.employee.line_manager_id,
              email: data.employee.email,
              phone: data.employee.phone
          }
        : null;

    const updatedSession = {
        userId: data.id,
        username: data.username,
        role: data.role,
        employeeId: data.employee_id,
        employee,
        lastSynced: now
    };

    setSession(updatedSession);
    return updatedSession;
}

export async function updatePassword(userId, newPassword) {
    await handleSupabase(
        supabase
            .from('users')
            .update({ password: newPassword, password_updated_at: new Date().toISOString() })
            .eq('id', userId),
        'update password'
    );
}

export async function recordLastLogin(userId) {
    await handleSupabase(
        supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userId),
        'update last login'
    );
}

export function ensureRole(session, allowedRoles) {
    if (!session) return false;
    if (!allowedRoles?.length) return true;
    return allowedRoles.includes(session.role);
}

export function getRoleHome(role) {
    switch (role) {
        case ROLES.ADMIN:
            return 'admin.html';
        case ROLES.MANAGER:
            return 'manager.html';
        case ROLES.EMPLOYEE:
        default:
            return 'employee.html';
    }
}
