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

---

## 11b. REAL Emergency Phone Calls (Twilio Programmable Voice)

> **Status honesty:** the code path is fully implemented and verified to *dispatch*
> concurrent calls with the correct Tamil + English message. Whether calls **actually ring**
> depends on **your** Twilio account, a **verified caller ID / owned number**, and **credit**.
> Nothing here claims calls work until you test them end-to-end (see below).

When a genuine accident is confirmed, the system places **real outbound calls concurrently**
to every configured emergency contact:

| Default contacts |
| --- |
| `+917358991015` |
| `+918248319996` |
| `+918754932145` |

### What each answered call says (AI TTS via Twilio `<Say>`)

- **Tamil first, then English** (configurable: `ta-en` | `ta` | `en`).
- Tamil uses the neural voice **`Polly.Aditi`** with `language="ta-IN"`.
- Includes the **real GPS coordinates**, a **reverse-geocoded address** (when available), and a
  **Google Maps link** spoken aloud.
- **If GPS is missing, it says the location is unavailable — it never invents one.**

Example (English portion):

> Emergency alert! A car accident has been detected. The accident is near
> [address]. Coordinates [lat, lng]. A Google Maps link has been sent.
> https://www.google.com/maps/search/?api=1&query=[lat],[lng]
> Please contact the emergency team immediately. I repeat, a car accident has been detected.

### Call status tracking

Each call is tracked through its lifecycle using Twilio **StatusCallback**:

`QUEUED → INITIATED → RINGING → ANSWERED → COMPLETED` (or `FAILED` / `BUSY` / `NO_ANSWER` / `CANCELED`).

- Live status is streamed to the dashboard over **SSE** and shown per contact on the
  incident detail page (with the Twilio CallSid and attempt count).
- **Requires `PUBLIC_BASE_URL`** to be a public HTTPS URL so Twilio can reach
  `POST /api/calls/twilio-status`.

### Retry & duplicate protection

- **Failed calls are retried** up to `CALL_MAX_RETRIES` extra times, spaced by
  `CALL_RETRY_DELAY_MS` (default: 1 retry after 15 s).
- **Duplicate prevention:** if the same incident already has active real calls, the
  notification service will **not re-dial** (dedup guard keyed on incident + call status);
  the IoT path also dedups on an already-active incident for the vehicle.

### TEST MODE (verify without a real emergency)

Set `EMERGENCY_TEST_MODE=true` on the server. Then `POST /api/calls/test` (ADMIN) places a
**real call that is clearly labelled as a test** ("This is a TEST…"), so you can confirm your
phone rings and the Tamil/English voice plays. Test mode **never** dials emergency services.
You can also preview the exact spoken message **without any credentials** via
`POST /api/calls/preview-twiml`.

> During development we do **not** call emergency services (100/108/112). Test numbers only.

### Twilio account setup (step by step)

1. **Create an account** at <https://www.twilio.com/try-twilio> (trial gives free credit).
2. From the **Console → Account Info**, copy the **Account SID** and **Auth Token**.
3. **Buy/own a voice-capable number** (Console → Phone Numbers). For **India**, outbound
   from a Twilio number or a **verified caller ID** is required.
4. **Verify your own phone** (Trial accounts can only call **verified** numbers — add all
   three contacts under **Verified Caller IDs** while testing).
5. **Add credit** — trial credit is limited; production calls are **paid**
   (per-minute + a **premium surcharge** for neural `Polly.Aditi` / `ta-IN` TTS).
6. Set the env vars in `server/.env` (never in the frontend):

   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_FROM_NUMBER=+1XXXXXXXXXX
   EMERGENCY_CONTACTS=+917358991015,+918248319996,+918754932145
   PUBLIC_BASE_URL=https://your-deployed-url
   CALL_LANGUAGE=ta-en
   ```

### Indian telecom / regulatory notes

- **Outbound automated calls to Indian mobiles** are subject to **TRAI** rules; promotional
  auto-calls are restricted, but **transactional/emergency** calls are permitted with clear
  consent. Prefer a provider with **DLT / Indian number** support for production.
- **Twilio in India:** Twilio supports outbound calls to India; a **verified caller ID** and
  account credit are required. Indian **DND (Do Not Disturb)** registration can affect some
  numbers — test each contact.
- **Alternatives** for Indian telephony: Exotel, Plivo, Knowlarity, or an on-prem **GSM
  gateway** (SIM800L/SIM7600) driven by the ESP32 for true offline calling.
- **Privacy:** the spoken message contains an accident location — obtain clear consent from
  the people who will receive these calls.

### Enabling real calls (deployment)

1. Deploy the app (see §17 for the permanent public URL).
2. Set `PUBLIC_BASE_URL` to that URL (enables status callbacks).
3. Add the Twilio env vars in the host's dashboard (Render → Environment).
4. Set `EMERGENCY_TEST_MODE=true` and run `POST /api/calls/test` to confirm a phone rings.
5. Turn test mode **off** for live operation.

---

## 11c. Sensor + GPS integration

The **`POST /api/iot/telemetry`** endpoint is the secure entry point for hardware:

- Authenticate with the **`X-API-Key`** header (= `IOT_API_KEY`). Always set this in production.
- Send acceleration, speed, orientation, **real GPS latitude/longitude**, and a timestamp.
- The server runs the **detection engine**, stores the **sensor event + coordinates + time**,
  updates the vehicle's live location, and (only for a detected accident, and only once per
  active incident) starts the incident + call workflow.

Rules enforced by design:

- **Real coordinates only** — if latitude/longitude are absent, the incident has **no
  location** and the voice message states that; a location is **never fabricated**.
- **No duplicate calls** from repeated sensor readings (dedup on active incident + active call).


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
| Calls       | `GET /calls/config`, `POST /calls/test` (admin, test mode), `POST /calls/preview-twiml`, `POST /calls/dispatch` (admin), `POST /calls/twilio-status` (Twilio webhook) |
| IoT         | `POST /iot/telemetry`, `GET /iot/status`                                                    |
| Dashboard   | `GET /dashboard/stats`                                                                      |
| Settings    | `GET/PUT /settings` (admin)                                                                 |
| Realtime    | `GET /events` (Server-Sent Events)                                                          |

## 14. Safety & Development Notes

- **No false claims of real dispatch** — the app only triggers a clearly-labeled
  **"Configured Emergency Response Workflow"**. When Twilio is configured, REAL calls are placed;
  otherwise everything is marked **DEMO**.
- **Real locations only** — GPS coordinates come from the device; if unavailable, the system
  states so and never invents a location.
- **No emergency-service calls during development** — test mode dials only your own numbers.
- **Data protection** — emergency contacts and sensitive owner info are **not** exposed through
  QR scanning; RBAC protects private data.
- **Input validation** on all API bodies; graceful error/empty/loading states across the UI.
- **Secrets** are loaded from environment variables and never hardcoded or sent to the browser.

## 15. Running Tests

Backend logic is verified via an end-to-end API test (login, simulate, cancel, auto-confirm,
notifications, history, QR, location, settings, IoT):

```bash
cd server && npm run dev        # start the API
node <path-to>/api-test.mjs      # run the flow test against :4000
```

Safe call checks that need **no credentials**:

```bash
# Preview the exact Tamil + English spoken message (with real coords):
curl -X POST http://localhost:4000/api/calls/preview-twiml \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"latitude":13.0827,"longitude":80.2707,"address":"Chennai, India"}'

# Show whether real calling is enabled (DEMO / TEST / LIVE):
curl http://localhost:4000/api/calls/config -H "Authorization: Bearer <TOKEN>"
```

## 16. Future Improvements

- Swap SQLite → PostgreSQL via the isolated persistence layer.
- Real SMS / email / push gateway providers behind the notification interface.
- Historical analytics / charts for incidents and response times.
- Code-split the client bundle (Leaflet + html5-qrcode) to reduce initial chunk size.
- WebSocket fallback if long-lived SSE is unsuitable in some deployments.

## 17. Deployment — permanent public URL

The project deploys as **one Node service that serves both the API and the built web app** on a
single permanent HTTPS URL. This is why **GitHub Pages / Netlify alone are NOT suitable** (they
are static-only and cannot run the Express server, WebSocket/SSE, or SQLite).

**Recommended: Render** (free tier, supports a real Node backend + persistent-ish disk):

1. Push this repo to GitHub.
2. On Render, choose **New → Blueprint** and select the repo — it reads `render.yaml`.
3. Set the environment variables (Render → Environment):
   `EMERGENCY_CONTACTS`, `TWILIO_*`, `PUBLIC_BASE_URL` (= the Render URL), `IOT_API_KEY`,
   `EMERGENCY_TEST_MODE`. `JWT_SECRET` is generated automatically.
4. Deploy. Render builds (`client` then `server`) and serves everything on one HTTPS URL,
   reachable from **any Android/iPhone/laptop**.

**Why not GitHub Pages/Netlify:** they host static files only. The frontend calls a live API
(`/api/*`, SSE stream), which needs a server process and a database — Render (or Railway/Fly/
a VPS) supports that; static hosts do not.

**Staying online after you close your laptop:** Render runs on their servers, independent of your
machine. (Free web services sleep after ~15 min idle and wake on the first request.)

**Updating the site:** commit and push to the connected branch; Render auto-redeploys.

**Responsiveness:** the UI uses Tailwind responsive classes and a mobile viewport meta tag, so it
works on all screen sizes and supports "Add to Home Screen" on iOS/Android.

**Secrets:** all credentials live in the host's environment settings (Render dashboard), never in
the repo. `.env` is git-ignored; only `.env.example` is committed.

---

Built as a functional prototype. All demo data is local; the database resets by deleting
`server/data` and re-running `npm run seed`.
