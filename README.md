# cool-graphs

Interactive charts that reframe familiar data in unfamiliar units. Currently one chart: Tallinn Kesklinn apartment prices measured in ounces of gold instead of euros.

**Live site:** [sandbox.teemusk.com/cool-graphs](https://sandbox.teemusk.com/cool-graphs/)

---

## Tallinn Kesklinn — Priced in Gold

> How many ounces of gold does one m² of Kesklinn apartment cost?

Tracks asking prices from kv.ee (Jan 2014 – present) divided by the monthly gold price in EUR. The chart updates automatically every day.

**Formula:** `oz/m² = EUR/m² (kv.ee) ÷ Gold EUR/oz (XAU/EUR)`

### What it shows

Nominal apartment prices in Tallinn Kesklinn roughly doubled since 2014, but gold quadrupled over the same period — so measured in gold, apartments got significantly cheaper. The chart makes that visible.

---

## Architecture

```
GitHub repo
├── index.html               # Single-file frontend (no build step)
├── tallinn-kesklinn.json    # Auto-generated daily data file
├── scraper.js               # Node.js data fetcher
├── package.json
└── .github/workflows/
    └── update-data.yml      # Daily GitHub Actions job
```

**Data flow:**
1. GitHub Actions runs daily at 06:00 UTC
2. `scraper.js` fetches kv.ee via Playwright (Chromium) + Yahoo Finance (`XAUEUR=X`)
3. Writes `tallinn-kesklinn.json`, commits it, and FTP-deploys to the hosting server
4. Browser loads `index.html`, fetches `tallinn-kesklinn.json` from the same origin

The hardcoded arrays in `index.html` serve as an offline fallback if the fetch fails.

---

## Data sources

| Data | Source | Method |
|------|--------|--------|
| Kesklinn apartment prices (EUR/m²) | [kv.ee/hinnastatistika](https://www.kv.ee/hinnastatistika) | Playwright (Cloudflare-protected) |
| Gold price (EUR/oz) | Yahoo Finance `XAUEUR=X` | `fetch` |

---

## Running locally

```bash
npm install
npx playwright install chromium
node scraper.js
# → writes tallinn-kesklinn.json

# Open index.html in a browser (serve it to avoid file:// fetch restrictions)
python3 -m http.server 8080
```

---

## Deploying your own copy

### 1. Fork and set up GitHub secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `FTP_HOST` | FTP hostname from your hosting control panel |
| `FTP_USER` | FTP username |
| `FTP_PASSWORD` | FTP password |

### 2. Adjust the FTP target path

In `.github/workflows/update-data.yml`, set `server-dir` to your web root (e.g. `/public_html/`).

### 3. Trigger the first run

Go to **Actions → Update data → Run workflow** to run manually. After that it runs daily at 06:00 UTC automatically.

The workflow commits `tallinn-kesklinn.json` back to the repo on each run, so you have a full history of every data update.

---

## Adding a new region

1. Add a new `scrapeRegion()` function in `scraper.js` with the kv.ee URL parameters for that region
2. Write results to a new file, e.g. `tallinn-mustamae.json`
3. Add that file to the `include` list in `update-data.yml`
4. Create a new `index.html` (or extend the existing one) that fetches the new JSON

---

## Tech stack

- **Frontend:** Vanilla JS, [Lightweight Charts v4.1.3](https://tradingview.github.io/lightweight-charts/), no framework
- **Scraper:** Node.js 18+, [Playwright](https://playwright.dev/)
- **CI/CD:** GitHub Actions → FTP deploy ([SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action))
- **Hosting:** Any static file host with FTP access

---

Built by [Tanel Teemusk](https://teemusk.com)
