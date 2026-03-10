#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

// ── City configs ───────────────────────────────────────────────────────────────
// To add a new city: append an entry with the kv.ee URL params and output slug.

const CITIES = [
  {
    slug: 'tallinn-kesklinn',
    county: 1,
    parish: 1061,
    city: 1003,
    startYear: 2014,
    startMonth: 1,
  },
  {
    slug: 'tartu-kesklinn',
    county: 12,
    parish: 1063,
    city: 5705,
    startYear: 2014,
    startMonth: 1,
  },
];

// ── kv.ee scraper via Playwright ──────────────────────────────────────────────

async function scrapeKvee(cityConfig) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;

  const { county, parish, city, startYear, startMonth, slug } = cityConfig;

  const url =
    `https://www.kv.ee/hinnastatistika?graph_version=2&deal_type=1` +
    `&start_year=${startYear}&start_month=${startMonth}` +
    `&end_year=${endYear}&end_month=${endMonth}` +
    `&stat_type=1&county1=${county}&parish1=${parish}&city1=${city}`;

  console.log(`[${slug}] Scraping kv.ee: ${url}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for Chart.js to populate data
    await page.waitForFunction(
      () => {
        const instances = Object.values(Chart.instances);
        return instances.length > 0 && instances[0]?.data?.datasets?.[0]?.data?.length > 0;
      },
      { timeout: 30000 }
    );

    const { labels, prices } = await page.evaluate(() => {
      const chart = Object.values(Chart.instances)[0];
      return {
        labels: chart.data.labels,
        prices: chart.data.datasets[0].data,
      };
    });

    // Build "MM.YYYY" → price map, skip nulls/NaN
    const map = {};
    for (let i = 0; i < labels.length; i++) {
      const price = prices[i];
      if (price == null || isNaN(price)) continue;
      map[labels[i]] = price;
    }
    console.log(`[${slug}] kv.ee: ${Object.keys(map).length} months scraped`);
    return map;
  } finally {
    await browser.close();
  }
}

// ── Gold in EUR/oz from World Gold Council API ────────────────────────────────
// Free, no API key. Returns daily prices; we average to monthly.

async function fetchGoldEur(fromYear = 2014) {
  const fromMs = new Date(`${fromYear}-01-01`).getTime();
  const toMs   = Date.now();

  const url = `https://fsapi.gold.org/api/goldprice/v11/chart/price/eur/oz/${fromMs},${toMs}`;
  console.log('Fetching gold EUR/oz from World Gold Council API...');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`WGC API HTTP ${res.status}`);
  const json = await res.json();

  // Response shape: { chartData: { EUR: [[timestampMs, priceEurOz], ...] } }
  const rows = json?.chartData?.EUR;
  if (!Array.isArray(rows)) throw new Error(`Unexpected WGC response shape: ${JSON.stringify(json).slice(0, 200)}`);

  // Group by YYYY-MM, compute monthly average
  const buckets = {};
  for (const [tsMs, price] of rows) {
    if (price == null || isNaN(price)) continue;
    const d  = new Date(tsMs);
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!buckets[ym]) buckets[ym] = [];
    buckets[ym].push(price);
  }

  const goldMap = {};
  for (const [ym, prices] of Object.entries(buckets)) {
    goldMap[ym] = prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  console.log(`Gold EUR: ${Object.keys(goldMap).length} months computed`);
  return goldMap;
}

// ── Estonian HICP from ECB SDMX API ──────────────────────────────────────────
// Free, no API key. Returns monthly CPI index (2015=100) for Estonia.

async function fetchHICP(fromYear = 2014) {
  const url = `https://data-api.ecb.europa.eu/service/data/ICP/M.EE.N.000000.4.INX?format=csvdata&startPeriod=${fromYear}-01`;
  console.log('Fetching Estonian HICP from ECB SDMX API...');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`ECB API HTTP ${res.status}`);
  const text = await res.text();

  // Parse CSV: find TIME_PERIOD and OBS_VALUE column indices from header
  const lines = text.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const timeIdx = header.indexOf('TIME_PERIOD');
  const valIdx  = header.indexOf('OBS_VALUE');
  if (timeIdx < 0 || valIdx < 0) throw new Error(`ECB CSV missing expected columns: ${header.join(',')}`);

  const hicpMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const month = cols[timeIdx];   // e.g. "2014-01"
    const val   = parseFloat(cols[valIdx]);
    if (!month || isNaN(val)) continue;
    hicpMap[month] = val;
  }
  console.log(`HICP: ${Object.keys(hicpMap).length} months parsed`);
  return hicpMap;
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function mergeData(kvMap, goldMap, hicpMap, slug) {
  // Normalize kv "MM.YYYY" → "YYYY-MM"
  const kvNorm = {};
  for (const [label, price] of Object.entries(kvMap)) {
    const [mm, yyyy] = label.split('.');
    kvNorm[`${yyyy}-${mm.padStart(2, '0')}`] = price;
  }

  const months = Object.keys(kvNorm).sort();

  const data = [];
  for (const month of months) {
    const kesklinn = kvNorm[month];
    const gold = goldMap[month];
    if (kesklinn == null || gold == null) continue;
    const row = { month, kesklinn: Math.round(kesklinn * 10) / 10, gold: Math.round(gold * 100) / 100 };
    const cpi = hicpMap[month];
    if (cpi != null) row.cpi = Math.round(cpi * 100) / 100;
    data.push(row);
  }
  console.log(`[${slug}] Merged ${data.length} months`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch gold + HICP once, scrape all cities in parallel
  const [goldMap, hicpMap, ...kvMaps] = await Promise.all([
    fetchGoldEur(2014),
    fetchHICP(2014),
    ...CITIES.map(c => scrapeKvee(c)),
  ]);

  // Write gold.json (standalone, for future use)
  const goldData = Object.entries(goldMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, gold]) => ({ month, gold: Math.round(gold * 100) / 100 }));
  fs.writeFileSync('gold.json', JSON.stringify(goldData, null, 2));
  console.log(`Written ${goldData.length} months to gold.json`);

  // Write cpi-estonia.json (standalone)
  const cpiData = Object.entries(hicpMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cpi]) => ({ month, cpi: Math.round(cpi * 100) / 100 }));
  fs.writeFileSync('cpi-estonia.json', JSON.stringify(cpiData, null, 2));
  console.log(`Written ${cpiData.length} months to cpi-estonia.json`);

  // Write per-city JSON files
  for (let i = 0; i < CITIES.length; i++) {
    const { slug } = CITIES[i];
    const data = mergeData(kvMaps[i], goldMap, hicpMap, slug);
    fs.writeFileSync(`${slug}.json`, JSON.stringify(data, null, 2));
    console.log(`Written ${data.length} months to ${slug}.json`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
