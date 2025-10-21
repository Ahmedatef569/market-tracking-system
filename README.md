# Market Tracking System Overview

This document describes the structure and behaviour of the Market Tracking System so that any engineer can quickly understand the application and contribute safely.

## Tech Stack

- **Frontend**: Static HTML pages (`index.html`, `admin.html`, `employee.html`, `manager.html`).
- **Styling**: `css/app.css` with Bootstrap 5 utility classes.
- **JavaScript**: Modular ES modules under `js/`.
  - `supabaseClient.js` initialises the Supabase client.
  - `session.js` manages session storage and role checks.
  - `utils.js`, `tables.js`, `charts.js`, `notifications.js` provide shared utilities.
  - `login.js`, `admin.js`, `employee.js`, `manager.js` drive each page.
- **Data**: Supabase Postgres, schema defined in `schema.sql`.
- **Assets**: Icons and favicons under `assets/`.
- **Vendor**: Tabulator JS/CSS packaged under `vendor/tabulator/`.

## Roles & Workflows

There are three authenticated roles. Authentication is a simple username/password stored in the `users` table (no hashing, no RLS).

### Admin

Responsibilities:
- Manage employees (product specialists, managers, admins) with the fields: code, first/last name, position, role, line, managers, contact info. Can create/update/delete and set login credentials.
- Manage master data: products (name, category, company, line, company vs competitor), doctors (assigned to specialists), accounts (private/UPA, assigned to specialists), companies, lines.
- Review and approve submissions (doctors, accounts, cases) after manager approval. Approvals support edit/overwrite and reject comments.
- View all cases and analytics (filters for date range, line, specialist, account type, company, etc.). Export data to Excel.
- View dashboards summarising cases, units, company vs competitor performance.
- Full delete rights for any record (products, doctors, accounts, cases, companies).

### Product Specialist (Employee)

Responsibilities:
- Maintain personal doctors and accounts (submitted for manager/Admin approval).
- Report cases: select doctor, account, choose up to four products (company or competitor, units), enter case date, comments. Prevents duplicate doctor/account names per specialist. Cases start as `pending_manager`.
- Track approval status (manager and admin) for own doctors/accounts/cases.
- View approved data and analytics limited to own submissions (cases by company/product, units, etc.). Export tables.

### Manager (District/Line)

Responsibilities:
- View combined data for their direct specialists.
- Add doctors/accounts for specialists; submit cases themselves.
- Approve/reject specialist submissions (status transitions to `pending_admin` on approval; reject with comment).
- Track approval status of their own submissions (needs admin approval) and team submissions they approved.
- A Line Manager sees both direct district managers and their specialists.
- Team dashboards summarise cases/units by specialist, company, area.

### Approval Flow

`Product Specialist` → `pending_manager` → `Manager` approves (status `pending_admin`) → `Admin` final approval (`approved`). Rejections include comments and the record remains until addressed.

Notifications table stores user notifications for approvals (displayed via bell icon).

## Database Schema Highlights

Tables:
- `lines`, `employees`, `users`
- `companies`, `products`
- `accounts`, `doctors`, `cases`, `case_products`
- `notifications`

Important enums: `user_role`, `approval_status`, `account_type`, `manager_level`.

Key constraints:
- Accounts/doctors unique per specialist (lower(name), owner_employee_id).
- Cases track `total_company_units`, `total_competitor_units` via trigger `refresh_case_unit_totals`.
- Views `v_case_details`, `v_doctor_details`, `v_account_details` for convenient display joins.

## Frontend Structure per Page

### Login (`index.html`)
- Simple form posting username/password. On success, redirects to role home: admin → `admin.html`, manager → `manager.html`, employee → `employee.html`.

### Admin Page (`admin.html`)
Sections in sidebar:
1. **Employees** – form and table for employee management.
2. **Database** – tabbed view with Products, Doctors, Accounts (each has form, filters, table, bulk upload and export).
3. **Cases** – global cases table with filters (specialist, line, account type, status, month range, etc.), stat cards and export.
4. **Approvals** – pending approvals table with actions (review, approve, reject).
5. **Dashboard** – charts (cases trend, units split, cases by specialist, etc.).

### Employee Page (`employee.html`)
Sidebar:
1. **My Data** – tabs for products (read-only list of products on their line), doctors/accounts forms + tables.
2. **My Cases** – form to add cases, cases table, stats.
3. **My Approvals** – track status of own submissions.
4. **Dashboard** – analytics limited to their submissions.

### Manager Page (`manager.html`)
Sidebar:
1. **Team Data** – tabs for team products, doctors, accounts.
2. **Team Cases** – tables, filters, stats.
3. **Team Approval** – pending approvals for specialists.
4. **My Cases** – manager’s own cases.
5. **My Approval** – status of manager’s own submissions.
6. **Dashboard** – team analytics (cases per specialist, units by company, monthly trend).

Each page has:
- Sticky gradient header with logo, notification bell, settings (change password, logout).
- Collapsible sidebar (list layout on desktop, overlay on mobile).
- Content area with filters, cards, tables using Tabulator.
- Export to Excel via Tabulator/XLSX (SheetJS).

## JavaScript Modules

- `config.js`: Supabase URL/key constants and theme settings.
- `supabaseClient.js`: exports a Supabase client and helper for error handling.
- `session.js`: stores session in `localStorage`, ensures correct role for each page, handles logout/update password/last-login.
- `tables.js`: wrapper around Tabulator (`createTable`, formatters, action bindings, export helper). Ensure Tabulator script is loaded before use.
- `charts.js`: Chart.js defaults and helpers for building line/bar/doughnut charts.
- `notifications.js`: fetch/mark notifications.
- `utils.js`: formatting helpers, status pills, form serialization, debounce, etc.
- `login.js`: handles login form submission.
- `admin.js`, `employee.js`, `manager.js`: page controllers. Each relies on session, fetches initial data from Supabase, sets up forms/tables/filters, handles approvals.

## Deployment / Dev Notes

- Requires Supabase project with schema in `schema.sql`. Run entire file in Supabase SQL console.
- Static frontend can be served via any static server (e.g., `npx serve .`).
- Credentials seeded: admin/admin123 (Marketing Manager user).
- No build step; ensure browsers support ES modules.
- When altering tables, use Tabulator’s APIs; `createTable` returns the Tabulator instance stored in `state.tables`.
- Approval state transitions must respect `approval_status` enum.
- Case forms allow up to four products; `case_products` table holds the breakdown.

## Known Interaction Patterns

- Forms typically submit via JavaScript to Supabase, then refresh relevant tables and stats.
- Filters adjust `state` and re-render tables/charts.
- Export buttons call Tabulator `download('xlsx', ...)`.
- Bulk upload uses SheetJS to parse Excel rows.
- Notifications off-canvas shows pending actions.

Refer to `js/admin.js`, `js/employee.js`, `js/manager.js` for detailed workflows (fetch → render → event handlers). Any new functionality should respect the role-based data visibility and approval flow described above.
