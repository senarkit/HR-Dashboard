# 📊 Recruitment Strategic Dashboard

> A live, boardroom-ready recruitment analytics dashboard for **FY 2025–26**.  
> Pulls real-time data from Google Sheets, processes it server-side, and renders a rich interactive dashboard with full pipeline visibility.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Login Gate** | SHA-256 hashed credential check — credentials never leave the browser |
| 📊 **Executive KPIs** | Hiring rate, offer acceptance, avg time-to-fill, vacancies, candidate drops |
| 🔽 **Recruitment Funnel** | Applied → Shortlisted → Interviewed → Offered → Joined with drop rates |
| 🏢 **BU Performance** | Per business-unit applicants, joins, conversion rate, avg time-to-fill |
| 📈 **Analytics Tab** | Quarterly volume vs conversion trend (mixed bar+line chart), rejection breakdown (doughnut chart) |
| 👤 **Recruiter Leaderboard** | Top 5 recruiters by joins, with conversion rate bars |
| 💼 **Positions Tab** | Top 14 positions by pipeline volume and success rate |
| 📖 **Glossary** | Inline KPI definitions with formula references |
| 🔄 **Auto-refresh** | Dashboard re-fetches data every 5 minutes |
| 🎨 **Premium Design** | Dark navy header, gold accents, glassmorphism panels, micro-animations |

---

## 🏗️ Architecture

```
Browser
  │
  ├── Login Screen (SHA-256 auth, sessionStorage)
  ├── Config Dialog (CSV URL override)
  │
  └── fetch("/api/dashboard-data")
        │
        ├── Vercel: api/dashboard-data.ts  (self-contained serverless fn)
        └── Netlify: netlify/functions/dashboard-data.ts
                      ├── Fetches both Google Sheets CSVs server-side (bypasses CORS)
                      ├── Parses CSV with custom parser
                      ├── Classifies statuses via regex patterns (kpi-config.ts)
                      └── Returns computed JSON: KPIs, funnel, charts, tables
```

### Data Flow

1. User logs in → credentials checked via SHA-256 in the browser
2. Config dialog shown → user confirms CSV sources (or uses defaults)
3. `fetch('/api/dashboard-data')` called → serverless function runs
4. Function fetches both Google Sheets CSVs server-side
5. CSV parsed, all KPIs computed, JSON returned
6. React renders full dashboard from JSON

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React 19, TanStack Router v1) |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 + custom CSS design tokens |
| Charts | Chart.js 4 + react-chartjs-2 |
| Fonts | Inter (body) + Playfair Display (headings) via Google Fonts |
| API | Vercel Serverless (`api/`) + Netlify Functions (`netlify/functions/`) |
| Language | TypeScript 5 (strict mode) |
| Deployment | **Vercel** ✅ or **Netlify** ✅ |

---

## 🚀 Deployment

### Vercel

1. Push to GitHub, connect repo in Vercel dashboard
2. **Framework Preset**: Vite (auto-detected)
3. **Build Command**: `vite build`
4. **Output Directory**: `dist/client`
5. The `api/dashboard-data.ts` file is auto-served at `/api/dashboard-data`
6. `vercel.json` handles SPA routing fallback

### Netlify

1. Push to GitHub, connect repo in Netlify dashboard
2. **Build Command**: `vite build`
3. **Publish Directory**: `dist/client`
4. `netlify.toml` redirects `/api/dashboard-data` → `/.netlify/functions/dashboard-data`
5. Netlify function in `netlify/functions/dashboard-data.ts` handles the request

> Both platforms use the same frontend URL `/api/dashboard-data` — the routing difference is handled transparently by platform config files.

---

## 💻 Running Locally

### With Netlify CLI

```bash
npm install
netlify dev
```

App runs at `http://localhost:8888`. The Netlify CLI proxies `/.netlify/functions/dashboard-data`.

### With Vite Dev Server only

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`. The `/api/dashboard-data` endpoint won't be available — the dashboard will show an error when fetching data. Use the Netlify CLI approach for full local testing.

---

## 📊 Data Sources

Two Google Sheets published as CSV (File → Share → Publish to web → CSV):

| Sheet | Content | Default GID |
|-------|---------|-------------|
| **Applicants** | Candidate pipeline (status, source, BU, recruiter, position, application date, joining date) | `2138370345` |
| **Vacancies** | Open positions with vacancy status per BU | `608034954` |

On first load, a dialog lets you confirm or override the CSV URLs. Defaults point to the FY 2025–26 production sheet.

### Column Detection

The parser uses fuzzy column matching — it tries multiple candidate names for each field so it adapts to varied spreadsheet headers:

| Field | Accepted Column Names |
|-------|-----------------------|
| Status | `status`, `current status`, `stage`, `pipeline stage` |
| Source | `source`, `source channel`, `channel` |
| Business Unit | `business unit`, `bu`, `company`, `division`, `department` |
| Recruiter | `recruiter`, `assigned to`, `hr`, `spoc` |
| Application Date | `application start`, `date`, `applied date` |
| Joining Date | `hiring date`, `joining date`, `doj`, `join date` |

---

## 🔢 KPI Definitions

| KPI | Formula |
|-----|---------|
| **Hiring Rate** | Joined ÷ Total Applicants × 100 |
| **Offers Extended** | Count of candidates at offer stage (joined + offer drops + pending) |
| **Offer Acceptance Rate** | Joined ÷ Offers Extended × 100 |
| **Offer Drop Rate** | Offer Drops ÷ Offers Extended × 100 |
| **Avg Time to Fill** | Average (Joining Date − Application Date) in days, for joined candidates |
| **Fill Rate** | Filled Vacancies ÷ Total Vacancies × 100 |
| **Candidate Drops** | Mid-pipeline attrition (withdrew before offer stage) |
| **Screen Rejects** | Rejected at initial screening (before any interview) |

### Status Classification (Priority Order)

```
Joined → Offer Drop → Offer → Dropped → R1 Reject →
R2 Reject → No-Show → Screen Reject → Shortlisted
```

First matching pattern wins. All patterns defined in [`netlify/functions/kpi-config.ts`](netlify/functions/kpi-config.ts).

---

## 📁 Project Structure

```
├── api/
│   └── dashboard-data.ts          # Vercel serverless function (self-contained)
├── netlify/
│   └── functions/
│       ├── dashboard-data.ts      # Netlify function handler + CSV processing
│       └── kpi-config.ts          # All KPI formulas, status patterns, column mappings
├── src/
│   ├── routes/
│   │   ├── __root.tsx             # Root layout (fonts, meta tags)
│   │   └── index.tsx              # Full dashboard: all tabs, components, data fetching
│   ├── router.tsx                 # TanStack Router setup
│   ├── routeTree.gen.ts           # Auto-generated route tree (do not edit)
│   └── styles.css                 # CSS custom properties design tokens
├── public/
│   └── favicon.ico
├── netlify.toml                   # Netlify build + redirect config
├── vercel.json                    # Vercel SPA routing config
├── validate.py                    # Python build validation script (no Node required)
├── vite.config.ts                 # Vite + TanStack Start + Tailwind
├── tsconfig.json                  # TypeScript strict config
└── package.json
```

---

## 🔧 Customisation

### Adding a new status keyword

Edit `netlify/functions/kpi-config.ts` → `STATUS_PATTERNS`:

```ts
dropped: [/\bdrop\b/i, /your-new-keyword/i],
```

### Adding a new column name alias

Edit `COLUMN_CANDIDATES` in `kpi-config.ts`:

```ts
businessUnit: ['business unit', 'bu', 'your-new-alias'],
```

### Changing a KPI formula

Edit `KPI_FORMULAS` in `kpi-config.ts` — each entry has a `compute()` function and a plain-English `formula` description.

---

## ✅ Validation

A Python script validates the codebase without needing Node.js:

```bash
python validate.py
```

Checks: required files, self-contained API handler, interface completeness, redirects, routing config, and more.

---

## 🔒 Authentication

Credentials are stored as **SHA-256 hex digests** in `index.tsx` — never as plain text. Auth state is kept in `sessionStorage` (cleared on tab close). This is a lightweight internal gate, not a production auth system.

---

## 📄 License

MIT — see [LICENSE](LICENSE)
