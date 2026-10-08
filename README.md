# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Run the application

From the project root, install the frontend and backend dependencies once:

```sh
npm install
npm --prefix server install
```

Then start both servers together:

```sh
npm run dev
```

Vite serves the frontend at `http://localhost:5173` (or the next available port), and the backend listens at `http://localhost:4000`. Check the backend at `http://localhost:4000/api/health`. Keep the terminal open while using the app; press Ctrl+C to stop both servers.

For direct SMS alerts, configure `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_KEY`, and `IT_SUPPORT_PHONE` in the root `.env` file.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Admin access

The application has an administrator-only login. Public sign-up is disabled, and users who are not authorized administrators are signed out before the dashboard is rendered.

Use `/login` or `/user` for end users. Use `/admin-login` or `/admin` for administrators. The current financial dashboard is the administrator dashboard; end users receive a separate read-only workspace.

Set this variable in the local `.env` file to allow the administrator account to log in:
# Rodas System

The app uses a local Express API and PostgreSQL. The browser never connects directly to PostgreSQL; it sends requests to the local API, which checks the user's session and reads or writes database rows.

## Folder guide

- `server/server.js`: starts the API, signs users in, checks permissions, and serves app data.
- `server/database.js`: connects the API to PostgreSQL using the root `.env` settings.
- `server/database/schema.sql`: creates the app's tables and indexes the first time the API starts.
- `src/api.js`: the browser-side helper for calling the local API.
- `src/security/login.jsx`: login, sign-up, and role checks using the local API.
- `src/UserDashboard.jsx`: routes staff to the dashboard matching their assigned department.
- `src/userDashboard/departments/<Department>/<Department>Dashboard.jsx`: the department's own dashboard behavior and inline styles. Edit the matching file to change that department.
- `src/userDashboard/departments/Finance/financeDashboard.css`: additional Finance dashboard styles.
- `src/userDashboard/DashboardFrame.jsx` and `src/userDashboard/SupportRequestForm.jsx`: shared navigation/activity frame and IT support form used by department dashboards.
- `src/userDashboard/departmentConfig.js`: shared department names, colors, duties, and workflow labels/statuses.
- `src/userDashboard/useDepartmentWorkItems.js`: loads and saves shared department work in PostgreSQL for Attendance, Auditor, Mainstore, and Logistics. Existing records saved in the browser are transferred automatically the first time the dashboard loads after the update.

Department work items are shared among active staff accounts assigned to the same department. They are stored in `department_work_items`, created automatically with the rest of the database schema on API startup, and can be added, status-updated, or removed from that department's dashboard.

## First-time setup

1. In pgAdmin, create a database named `rodas_system` (or choose another name).
2. Copy `.env.example` to a project-root file named `.env`. If `.env` already exists, do not overwrite it; add the missing settings and replace credentials that were shared or exposed. Put your PostgreSQL username/password in `DB_USER` and `DB_PASSWORD`; do not put them in any `VITE_` variable.
3. In `.env`, set `ADMIN_EMAIL` to the email you want to use to sign in and `ADMIN_PASSWORD` to a password with at least 6 characters. Set `SESSION_SECRET` too. The server creates this admin on first startup, but does not change an existing admin password automatically.
4. Install dependencies if needed: `npm install` and `npm --prefix server install`.
5. Start both parts with `npm run dev`. The frontend is normally at `http://localhost:5173`; the API is at `http://127.0.0.1:4000`.
6. Visit `/admin-login` to use the configured administrator account. In the admin dashboard, open **Users** and choose **Add User** to create a staff account, assign its department, and set an initial password. The new account's email, department, and initial password are shown once after creation so you can share them with the staff member; staff sign in at `/login`. Use **Products** → **Add Product** to add catalog items. Customers can create their separate customer accounts from `/shop`.

If the admin already exists but its password is not working, save the correct `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the project-root `.env`, then run `npm --prefix server run admin:setup`. This creates the admin if it is missing or resets the password if that email already belongs to an admin. It will not promote an existing end-user account. Restart `npm run dev` afterward if it is already running.

Passwords are stored in PostgreSQL as bcrypt hashes in `app_users.password_hash`, never as readable text. Do not manually insert a plaintext password into pgAdmin. The configured email/password are entered on the `/admin-login` page.

On startup, the API creates `app_users`, `transactions`, and `support_requests` in the selected database. If your selected database already has tables from another app, back it up and use a new empty database for Rodas first.

## What changed from Supabase

- Supabase Auth is replaced by local accounts stored in `app_users`. Passwords are stored as bcrypt hashes, not plain text. User login sessions use an HTTP-only cookie.
- Admin transactions and support requests now go through the Express API and are stored in PostgreSQL. The IT screen refreshes requests every 10 seconds instead of using Supabase Realtime.
- The database password is used only by the server. Vite proxies `/api` requests to that server during development.
- Africa's Talking remains an optional external SMS service. Its API key stays in the server-side `.env` file.

This runs offline on the computer hosting PostgreSQL and the app. Other computers cannot use it unless the API and database are deliberately configured for network access.

## Existing Supabase data

This change does not copy old Supabase rows or passwords. Supabase passwords cannot be recovered for import; users must create new local accounts. Export transaction or support-request rows from the old project to CSV, then review and import them into the matching PostgreSQL tables with pgAdmin. Back up the database before importing data.

## Health check

Open `http://127.0.0.1:4000/api/health`. A successful response includes `"database":"connected"`. If startup fails, check that PostgreSQL is running and that `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` match pgAdmin's server/database settings.
