# Master Task Tracker Dashboard
> A lightweight, Google Sheets-powered task management web app that gives business owners and their teams a real-time view of client work — without the price tag of enterprise tools.

![Status](https://img.shields.io/badge/status-Production-brightgreen)
![Built With](https://img.shields.io/badge/built%20with-Google%20Apps%20Script-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## The Problem

As a business owner juggling multiple clients and team members, tracking who's doing what — and whether it's actually getting done — becomes a full-time job on its own. Spreadsheets get messy, updates get missed, and there's no easy way to see your team's workload at a glance without digging through rows of data.

---

## The Solution

Master Task Tracker Dashboard turns a Google Sheet into a fully functional task management system with a clean, branded web interface. Each team member logs in and sees only their tasks. Owners and managers get a master view of everything — filtered, sortable, and always up to date.

---

## Key Features

- **Role-based views** — each user sees only their assigned tasks; admins see all
- **Full CRUD** — create, edit, complete, and delete tasks directly from the dashboard
- **Smart filtering** — filter by client, priority, status, or team member in one click
- **Auto task ID generation** — sequential IDs auto-assigned on creation or direct sheet edit
- **Audit trail** — tracks who changed what, which field was edited, and exactly when
- **Dark / Light mode** — clean UI that works in both themes
- **Mobile-friendly** — touch drag support for task management on the go
- **Google Sheets as the database** — no external database needed; data lives where the team already works

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Google Apps Script |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Database | Google Sheets |
| Icons | Lucide Icons |
| Fonts | Google Fonts (Outfit) |
| Hosting | Google Apps Script Web App |

---

## How It Works

1. **Login** — team members authenticate with a username and password; the app loads only their assigned tasks
2. **Dashboard loads** — tasks are fetched from the Google Sheet via the Apps Script API and rendered as cards
3. **Create or update** — users fill out a task form; the backend appends or updates the row, stamps the audit fields, and returns the new task ID
4. **Direct sheet edits** — an `onEdit` trigger detects changes made inside the sheet itself, auto-generates missing task IDs, and updates tracking columns without breaking the web app
5. **Mark complete** — one click sets the status to `Completed`, records the completed date, and logs the responsible user
6. **Admin view** — logging in as `MASTER TRACKER` bypasses all user filters and displays every task across all clients

---

## My Contribution

Designed and built the entire system end-to-end — from architecting the Google Sheets data model and Apps Script REST API to crafting the branded frontend UI. Engineered the `onEdit` trigger to keep the sheet and web app in sync, built the conflict-safe task ID generation using script locks, and implemented the per-user authentication and filtering logic from scratch.

---

## Results & Impact

- Helped a service business reduce missed client deliverables by giving every team member a clear, personalized task view — estimated **30–40% fewer follow-up check-ins** per week
- Replaced a cluttered, manually-maintained spreadsheet that previously required a manager's time each day to triage and update
- Gave business owners a real-time snapshot of team workload across all clients, cutting status meeting time by roughly **half**
- Deployed at zero additional software cost by leveraging tools the team already used — Google Workspace

---

## Getting Started

```bash
# 1. Copy the Google Sheet template and note the Spreadsheet ID
# 2. Open Apps Script (Extensions → Apps Script) in your sheet
# 3. Paste the contents of Master Task Tracker.gs
# 4. Paste the contents of Master Task Tracker.html as a new HTML file named "Dashboard"
# 5. Update SHEET_NAME in the .gs file to match your sheet tab name
# 6. Update USER_PASSWORDS with your team's credentials
# 7. Deploy → New Deployment → Web App → Execute as Me → Anyone with access
# 8. Copy the deployment URL and replace YOUR_APPS_SCRIPT_DEPLOYMENT_URL in the HTML file
# 9. Share the deployment URL with your team
```

---

## Status

Production — actively used. Potential next steps: Google OAuth login, email notifications on task assignment, and a Kanban board view.
