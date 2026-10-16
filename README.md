# AutoSafe — AI-Based Automatic Car Accident Detection & Emergency Service Calling System

A **full-stack, production-quality prototype** of an emergency response platform that automatically
detects possible vehicle accidents from sensor data, runs a configurable **false-alarm countdown**,
notifies registered emergency contacts in real time, and presents everything on a live
emergency command-center dashboard.

> **Demo / Simulation Mode** — All sensor data is simulated and all notifications are mocked.
> The system does **not** contact real Police/Ambulance dispatch. It is a working prototype built
> so that simulated data can later be replaced with real **ESP32 / GPS / GSM / MPU6050 / CAN /
> OBD-II / ECU** telemetry.

---

## 1. Project Overview

The end-to-end workflow that this prototype demonstrates:

1. Sensors (or a **"Simulate Accident"** button) generate vehicle telemetry.
2. The **Accident Detection Engine** analyses multiple inputs — not speed alone —
   and flags a `POSSIBLE_ACCIDENT`.
3. The system captures the vehicle's **GPS location** and shows it on a map.
4. A **false-alarm countdown** (default **15 s**, configurable) starts for the driver to cancel.
5. If the driver presses **"I AM SAFE — CANCEL"**, the alert is marked `CANCELLED` and stored
   in history (false alarm).
6. If no response arrives, the event becomes a **`CONFIRMED_EMERGENCY`**.
7. Registered **emergency contacts** are notified in priority order (mock SMS / app push / call).
8. Every notification attempt and status is recorded.
9. The incident appears on the **live emergency dashboard** in real time via Server-Sent Events.
10. Authorized responders can update status (`DISPATCHED → ON_SCENE → RESOLVED`).
11. All events are stored in a relational database for searchable history.

## 2. Technology Stack

| Layer      | Technology                                                              |
| ---------- | ----------------------------------------------------------------------- |
| Frontend   | React 19, TypeScript, Vite, Tailwind CSS, React Router                   |
| Mapping    | Leaflet + OpenStreetMap                                                  |
| QR         | Server-generated QR (`qrcode`), camera scan (`html5-qrcode`)             |
| Realtime   | Server-Sent Events (SSE)                                                 |
| Backend    | Node.js, Express, TypeScript                                             |
| Database   | SQLite via `better-sqlite3` (relational, file-based, zero setup)         |
| Auth       | JWT + bcrypt, role-based access control (RBAC)                           |

**Why SQLite?** The environment has no running PostgreSQL server, so a relational file-based
database was used. The data layer is isolated inside `server/src/services` and `server/src/db.ts`,
so swapping in PostgreSQL (e.g. via Prisma) only touches the persistence layer — the REST API and
frontend are unchanged. `server/.env.example` documents this extension point.

**Roles:** `ADMIN`, `OWNER` (vehicle owner/driver), `CONTACT` (emergency contact), `RESPONDER`.

## 3. Project Structure

```
emergency-calling-system/
├── package.json                  # Root convenience scripts (runs both apps)
├── server/                       # Backend (Express + SQLite)
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # Express app + SSE endpoint + wiring
│       ├── config.ts             # Environment configuration
│       ├── db.ts                 # SQLite connection + schema/migrations
│       ├── seed.ts               # Seed / demo data
│       ├── validation.ts         # Input validation helpers
│       ├── events.ts             # In-memory pub/sub for SSE
│       ├── types.ts              # Shared domain types
│       ├── middleware/           # auth (JWT + RBAC), error handling
│       ├── routes/               # auth, vehicles, contacts, incidents,
│       │                         #   location, qr, notifications, iot, dashboard, settings
│       └── services/
│           ├── detectionEngine.ts      # Multi-input accident detection
│           ├── incidentService.ts      # Countdown / cancellation / status workflow
│           ├── notificationService.ts  # Mock notification workflow
│           └── locationService.ts      # GPS storage + optional reverse geocoding
└── client/                       # Frontend (React + Vite + Tailwind)
    ├── index.html
    ├── vite.config.ts            # Dev proxy: /api -> :4000
    └── src/
        ├── lib/                  # api client, auth context, live-emergency SSE context, types
        ├── components/           # Layout, badges, modals, map, toasts, states, etc.
        └── pages/                # Login, Dashboard, Live Emergency, Vehicles, Contacts,
                                  #   QR Scanner, Incidents, Settings
```

## 4. Installation

**Prerequisites:** [Node.js](https://nodejs.org/) 18+ (tested on Node 24) and npm.

```bash
# From the project root
npm run install:all      # installs server AND client dependencies
```

or individually:

```bash
cd server && npm install
cd ../client && npm install
```

## 5. How to Run

The Vite dev server proxies `/api` requests to the backend on port 4000, so you only need to
run both processes.

**Option A — one command (recommended):**
```bash
npm run dev          # runs API (http://localhost:4000) + client (http://localhost:5173)
```

**Option B — two terminals:**
```bash
# Terminal 1 — backend
cd server && npm run dev          # http://localhost:4000

# Terminal 2 — frontend
cd client && npm run dev          # http://localhost:5173
```

Then open **http://localhost:5173**.

### Seed the database (first run)

```bash
npm run seed      # or: cd server && npm run seed
```

Seeding is idempotent; it only inserts if no users exist yet.

### Demo accounts

| Role                | Email                       | Password      |
| ------------------- | --------------------------- | ------------- |
| Administrator       | `admin@emergency.local`     | `Admin@123`   |
| Vehicle Owner       | `aarav@example.com`         | `Owner@123`   |
| Emergency Contact   | `priya@example.com`         | `Contact@123` |
| Responder           | `responder@emergency.local` | `Responder@123` |

The seeded vehicle is `veh-001` (registration `TN 10 AB 1234`) with three emergency contacts.
Demo credentials are pre-filled on the login page for quick access.

## 6. Environment Variables

Copy `server/.env.example` to `server/.env` (a `.env` is already created for you):

| Variable              | Default                        | Description                                       |
| --------------------- | ------------------------------ | ------------------------------------------------- |
| `PORT`                | `4000`                         | API port                                          |
| `JWT_SECRET`          | dev-only value                 | **Change in production.** HS256 signing secret    |
| `JWT_EXPIRES_IN`      | `12h`                          | Token lifetime                                    |
| `CORS_ORIGIN`         | `http://localhost:5173`        | Comma-separated allowed origins                   |
| `DB_FILE`             | `./data/emergency.db`          | SQLite file path                                  |
| `SIMULATION_MODE`     | `true`                         | Demo mode for simulated sensor data               |
| `IOT_API_KEY`         | _(empty)_                      | Optional API key for IoT device endpoints         |

**Never commit real secrets.** `server/.env` is git-ignored.

## 7. Database Design

Schema is defined in `server/src/db.ts` and created automatically on startup. Key tables:

- **users** — id, name, email, phone, role, password_hash, created_at
- **vehicles** — id, vehicle_identifier, registration_number, owner_id, qr_identifier, status,
  latitude, longitude, created_at
- **emergency_contacts** — id, vehicle_id, name, relationship, phone_number, priority
- **incidents** — id, vehicle_id, incident_time, latitude, longitude, address, severity, status,
  countdown_seconds, created_at, updated_at
- **sensor_events** — id, vehicle_id, acceleration, speed, roll, pitch, yaw, event_type,
  latitude, longitude, source, timestamp
- **notifications** — id, incident_id, contact_id, recipient, notification_type, status,
  channel, message, sent_at
- **settings** — key/value application settings

Relationships, timestamps, `CHECK` constraints, and indexes are enforced in the schema.

## 8. Accident Detection Engine

`server/src/services/detectionEngine.ts` implements multi-input detection (never speed alone):

- **Sudden impact** — acceleration magnitude (`≥ 2.5 g`)
- **Rollover / orientation** — abnormal roll/pitch (`≥ 45°`)
- **Sudden speed reduction** — large delta-v in a short window
- **Manual SOS** — force flag from a button

Events are classified as `NORMAL`, `SUSPICIOUS_EVENT`, `POSSIBLE_ACCIDENT`, or
`CONFIRMED_EMERGENCY`, with a confidence score and human-readable reasons persisted to
`sensor_events` and shown on the incident summary.

## 9. How to Simulate an Accident

1. Log in as **Administrator** (or Owner).
2. Go to **Dashboard → "Simulate Accident"** (or open a vehicle and click the same button).
3. A `POSSIBLE_ACCIDENT` is created instantly:
   - a **15-second countdown** starts;
   - the GPS location appears on the **map** (default Chennai, India).
4. On the **Live Emergency** page you can either:
   - press **"I AM SAFE — CANCEL"** → the incident is recorded as a **false alarm / cancelled**; or
   - do nothing → after the countdown it becomes a **`CONFIRMED_EMERGENCY`** and **mock
     notifications** are dispatched to the vehicle's emergency contacts.
5. As an Admin/Responder, update the status (`DISPATCHED → ON_SCENE → RESOLVED`).
6. The incident is stored in history and appears under **Incidents**.

The countdown duration is configurable in **Settings** (5–120 s, default 15 s).

### Real-time simulation via the IoT endpoint

You can also drive the system with a raw sensor payload that mimics a device:

```bash
curl -X POST http://localhost:4000/api/iot/telemetry \
  -H "Content-Type: application/json" \
  -d '{
        "vehicleId": "veh-001",
        "acceleration": 9.8,
        "speed": 12,
        "orientation": { "roll": 40, "pitch": 10, "yaw": -20 },
        "latitude": 13.0827,
        "longitude": 80.2707,
        "previousSpeed": 85
      }'
```

The same detection engine runs and a `POSSIBLE_ACCIDENT` incident is created automatically.

## 10. QR Vehicle Identification

- Every vehicle has a unique `qr_identifier` (e.g. `VEH:veh-001:xxxx`).
- The QR encodes **only the secure identifier** — it never embeds personal or contact data.
- **QR Scanner** page: camera scan (`html5-qrcode`), manual entry, or a one-click
  **"Use demo"** simulation for desktop.
- Validation returns **role-scoped** information — owner contact details are hidden for
  unprivileged roles (`CONTACT`).
- The QR result also reports whether the vehicle has an **active emergency incident**.

## 11. Emergency Notification Workflow (Demo)

When an emergency is confirmed:

1. An **incident** is created with `CONFIRMED_EMERGENCY`.
2. **Emergency contacts** are notified in priority order.
3. Each attempt records `notification_type` (SMS / app push / voice call) and a status
   (`PENDING → SENT → DELIVERED / FAILED`, or `ACKNOWLEDGED`).
4. The dashboard updates in real time over **SSE**.

The notification service (`server/src/services/notificationService.ts`) simulates delivery and
is clearly labeled **"Demo / Simulation Mode"**. A real top-level API/notification provider
(SMS gateway, Twilio, push, etc.) can be added behind the same interface without changing the
frontend.

## 12. Future ESP32 / IoT Integration

The **modular `IoT API` path** (`server/src/routes/iot.ts`) is the intended entry point for
hardware. A real ESP32 with an MPU6050 (impact/orientation) + GPS (NEO-6M) + GSM (SIM800L/SIM7600)
can POST the same `SensorPayload` shape the prototype already accepts:

```
ESP32 / IoT DEVICE
   ↓  (MPU6050 + GPS + optional SOS button)
IoT API endpoint  /api/iot/telemetry  (auth: X-API-Key = IOT_API_KEY)
   ↓
Accident Detection Engine
   ↓
Incident Management Service
   ↓
Notification Service  (SMS via GSM module or gateway)
   ↓
Frontend Dashboard   (SSE real-time)
```

Secure the endpoint in production by setting `IOT_API_KEY` in `server/.env`; devices must then
send the `X-API-Key` header. The engine and incident workflow are identical whether data comes
from the simulator or a real device.

## 13. API Overview

| Group       | Endpoints                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ |
| Auth        | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/users` (admin)          |
| Vehicles    | `GET/POST /vehicles`, `GET/PATCH/DELETE /vehicles/:id`                                      |
| Contacts    | `GET /contacts?vehicleId=`, `POST /contacts`, `PATCH/DELETE /contacts/:id`                  |
| Incidents   | `GET /incidents/active`, `GET /incidents/history`, `GET /incidents/:id`,                    |
|             | `POST /incidents/simulate`, `POST /incidents/:id/cancel`, `PATCH /incidents/:id`            |
| Location    | `GET/PUT /location/:vehicleId`                                                              |
| QR          | `GET /qr/:vehicleId`, `POST /qr/validate`                                                   |
| Notify      | `GET /notifications?incidentId=`, `POST /notifications/:id/acknowledge`, `POST /notifications/trigger` |
| IoT         | `POST /iot/telemetry`, `GET /iot/status`                                                    |
| Dashboard   | `GET /dashboard/stats`                                                                      |
| Settings    | `GET/PUT /settings` (admin)                                                                 |
| Realtime    | `GET /events` (Server-Sent Events)                                                          |

## 14. Safety & Development Notes

- **No false claims of real dispatch** — the app only triggers a clearly-labeled
  **"Configured Emergency Response Workflow (Demo/Simulation Mode)"**.
- **Data protection** — emergency contacts and sensitive owner info are **not** exposed through
  QR scanning; RBAC protects private data.
- **Input validation** on all API bodies; graceful error/empty/loading states across the UI.
- **Secrets** are loaded from environment variables and never hardcoded.

## 15. Running Tests

Backend logic is verified via an end-to-end API test (login, simulate, cancel, auto-confirm,
notifications, history, QR, location, settings, IoT):

```bash
cd server && npm run dev        # start the API
node <path-to>/api-test.mjs      # run the flow test against :4000
```

## 16. Future Improvements

- Swap SQLite → PostgreSQL via the isolated persistence layer.
- Real SMS / email / voice gateway providers behind the notification interface.
- Historical analytics / charts for incidents and response times.
- Code-split the client bundle (Leaflet + html5-qrcode) to reduce initial chunk size.
- WebSocket fallback if long-lived SSE is unsuitable in some deployments.

---

Built as a functional prototype. All demo data is local; the database resets by deleting
`server/data` and re-running `npm run seed`.
