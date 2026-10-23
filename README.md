# Intelligent Rainfall

**Rainwater harvesting planner for Bangladesh — automatic real rainfall data, a live weather
forecast, and transparent maths. No manual data entry required.**

---

## 1. What is this project? (plain summary)

Bangladesh gets a lot of rain, but most of it runs off rooftops and is never used. **Intelligent
Rainfall** answers one practical question: *"If I put a water tank under my roof, how much rain
could I actually collect, and is it worth it?"*

You don't need to look anything up yourself — pick your district (or let it detect your location)
and the app automatically pulls real rainfall history and a live weather forecast, then turns that
into litres, tank sizes, and a month-by-month water balance using simple, visible formulas.

It is built for: homeowners deciding whether to install a tank, schools/institutions planning water
supply, students doing a science/exhibition project, or anyone curious about rainwater harvesting
in Bangladesh.

It is **not**: a water-quality tester, a guarantee of savings, a replacement for a qualified
engineer, or a live weather alert service.

---

## 2. User manual — every menu, explained

The sidebar is organised top to bottom in the order below.

### Overview
Your home screen. Shows a live status chip (is real rainfall loaded right now?), four summary
cards (harvest, coverage, rainfall input, demand buffer), a monthly rainfall chart, a
harvest-vs-demand comparison, short planning notes, and your saved analyses.

### Rainfall explorer
Pick a **district** — rainfall loads automatically from **NASA POWER**, a free public satellite/
model dataset, with no sign-up. You get:
- 10 years of monthly rainfall totals (pick any year as chips; years with gaps are disabled)
- A 30-year climatology (long-term monthly average)
- A "Use [year] data" button that sends it straight into the calculator
- Full provenance: exact coordinates, model name, units, and the exact API request used

You can also add your **own** rainfall records below (for a local gauge, a different source, or a
teaching example) — these are kept clearly separate from the live NASA data, with CSV import/export.

### Harvest calculator
The core tool. Inputs: district, rainfall (auto-filled or typed), roof area (m² or ft²), roof
material (sets a runoff coefficient you can override), collection losses, household size and daily
water use per person. Results update instantly:

```
theoretical harvest (L) = rainfall (mm) × roof area (m²) × runoff coefficient
usable harvest (L)      = theoretical harvest × (1 − collection loss %)
```

A toggle lets you choose **Auto · NASA** (live data keeps the calculator in sync with the explorer)
or **Manual** (your typed numbers are protected and won't be overwritten automatically).

### Storage planner
Set a tank size and watch a real month-by-month water balance:

```
delivered  = min(demand, storage + inflow)
shortfall  = max(0, demand − storage − inflow)
overflow   = max(0, storage + inflow − demand − capacity)
storage    = min(capacity, max(0, storage + inflow − demand))
```

Needs a **complete 12-month rainfall series** (auto-loaded from NASA POWER, or entered manually) to
run the full simulation — otherwise you get a clearly labelled simplified single-inflow estimate
instead of a fake "monthly" chart.

### Weather forecast
A genuinely **live, short-range** forecast (today + next 7 days + 16-day outlook) from **Open-Meteo**,
a free public weather API. Press **"Detect my location"** — your browser will ask permission once,
then your GPS/network location is used to fetch the forecast and a readable place name (via a free
reverse-geocoding lookup). No permission? Just pick a district instead. This tab is intentionally
separate from the Rainfall Explorer: the explorer shows *historical* data, this page shows a
*prediction* that can change.

### Scenario studio
Save multiple versions of your analysis (e.g. "small roof" vs "school building"), then compare
their harvest, demand, and tank size as cards and a chart. Duplicate, edit, or delete any saved
scenario.

### Reports & projects
Turns your current analysis into a clean report you can print or "Save as PDF" (use your browser's
print dialog). Export/import your whole workspace as JSON (for backup or moving between devices),
export a calculation as CSV, and manage all saved projects from one table.

### AI explanation (optional)
Press "Explain my results" to get a plain-language summary of your numbers from an AI model via
**Groq**. If no key is configured, it says so honestly — the core app never depends on this.

### Science & method
Every formula explained with worked examples, plus exactly what the rainfall data is (and isn't).

### About
What the project is for, an honest list of current limitations, and a step-by-step guide to every
menu (the same content as this section, inside the app).

---

## 3. Setup guide

### Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Pick a district in **Rainfall explorer** — data loads by itself.
**Nothing else is required** for the core app (calculator, storage planner, rainfall explorer,
forecast, scenarios, reports) to work fully.

### Production build

```bash
npm run build
npm start
```

### Deploy to Vercel (free)

1. Push this project to a GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Framework preset: **Next.js** (auto-detected) — no build command changes needed.
4. Environment variables: **none required**. See the optional AI setup below if you want it.
5. Click **Deploy**.

Also works on Netlify, Cloudflare Pages (Next.js runtime), or any Node host (`npm run build` then
serve the output). The app is stateless on the server — your saved projects live in the visitor's
browser (`localStorage`), so there is no database to provision.

### Optional: enable the AI explanation panel (Groq, free)

1. Create a free account and API key at **https://console.groq.com/keys**.
2. Add an environment variable:
   - **Local:** copy `.env.example` to `.env.local` and paste your key into `GROQ_API_KEY=`.
   - **Vercel:** Project → Settings → Environment Variables → add `GROQ_API_KEY` → redeploy.
3. (Optional) Set `GROQ_MODEL` to use a different Groq-hosted model. Default: `llama-3.3-70b-versatile`.

Without this key, the AI Explanation tab still opens and clearly explains that it's turned off —
it never fakes a response.

### The "Detect my location" forecast button — how it works, nothing to set up

This uses the **browser's built-in Geolocation API** (`navigator.geolocation`), which only works on
`https://` or `localhost` and always asks the visitor for permission first. No server-side key,
no third-party SDK. Reverse-geocoding (turning coordinates into a place name) uses BigDataCloud's
free client-side endpoint, also with no key. If a visitor denies permission, they can pick a
district from the dropdown instead — the forecast still works.

---

## 4. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | No | Enables the AI explanation panel. Free tier at console.groq.com. |
| `GROQ_MODEL` | No | Overrides the Groq model. Default `llama-3.3-70b-versatile`. |

Copy `.env.example` to `.env.local` for local development. Nothing else is needed — rainfall and
forecast data use public, keyless APIs.

---

## 5. Project structure

```
src/
├── app/
│   ├── page.tsx                # Whole workspace UI (client component)
│   ├── layout.tsx               # Metadata + shell
│   ├── globals.css              # Design system, light/dark themes, print styles
│   └── api/
│       ├── rainfall/route.ts    # NASA POWER proxy: unit conversion, caching, provenance
│       ├── forecast/route.ts    # Open-Meteo proxy: live 16-day precipitation forecast
│       ├── insights/route.ts    # Optional Groq explanation endpoint
│       └── health/route.ts      # Health check
└── lib/
    ├── rainfall.ts               # Formulas, water-balance model, scenario types
    ├── climate.ts                # Typed client for rainfall/forecast/insights + geolocation helpers
    ├── districts.ts              # 64 districts, approximate reference coordinates, nearest-district lookup
    └── weathercodes.ts           # WMO weather code → plain-English description
```

Calculation logic, data access, and UI stay in separate modules so formulas are never duplicated.

## 6. Data sources

| Source | Used for | Key required | Nature |
| --- | --- | --- | --- |
| **NASA POWER** (power.larc.nasa.gov) | Historical rainfall (10-yr monthly + 30-yr climatology) | No | Gridded MERRA-2 reanalysis, ~55 km × 69 km cell, updated for completed years only |
| **Open-Meteo** (open-meteo.com) | Live forecast (today, 7-day, 16-day) | No | National weather model blend, changes as new model runs arrive |
| **BigDataCloud** reverse geocode | Turning GPS coordinates into a place name | No | Client-side lookup, free tier |
| **Groq** (console.groq.com) | Optional plain-language explanation | Yes (free tier) | Large language model — can be wrong, never treated as a data source |

The Bangladesh Meteorological Department (https://live6.bmd.gov.bd/) is linked as an official
reference in the Science & Method page. It is not queried automatically, because access to its
historical datasets can require a formal request or payment.

## 7. Why rainfall history only goes up to last year, but the Forecast tab is live

NASA POWER's monthly product is a reanalysis built from complete months of data — the current,
still-in-progress year is never shown as a finished year, and partial months are never silently
treated as zero rainfall. That's why the Rainfall Explorer's year picker stops at the last fully
completed year. For **right now and the next 16 days**, use the **Weather Forecast** tab instead,
which calls a live forecast API on every visit.

## 8. Limitations

1. NASA POWER is a gridded reanalysis, not a rain gauge on your specific roof.
2. The Forecast tab is a prediction and can change — it is not an observation.
3. District coordinates are approximate reference points, not official centroids or boundaries.
4. No coloured map: that needs licensed boundary geometry the project does not bundle.
5. Estimates only — not engineering design, not a cost/savings guarantee, not a water-safety test.
6. The monthly balance model can't resolve day-by-day storm timing.
7. `localStorage` is per browser/device, not cloud backup — export JSON to keep a copy.
