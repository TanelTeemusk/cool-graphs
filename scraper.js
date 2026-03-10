#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { chromium } = require('playwright');

// ── kv.ee scraper via Playwright ──────────────────────────────────────────────

async function scrapeKvee() {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth() + 1;

  const url =
    `https://www.kv.ee/hinnastatistika?graph_version=2&deal_type=1` +
    `&start_year=2014&start_month=1` +
    `&end_year=${endYear}&end_month=${endMonth}` +
    `&stat_type=1&county1=1&parish1=1061&city1=1003`;

  console.log('Scraping kv.ee:', url);
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
    console.log(`kv.ee: ${Object.keys(map).length} months scraped`);
    return map;
  } finally {
    await browser.close();
  }
}

// ── Gold in EUR from Metal Price API ─────────────────────────────────────────
// Response: { rates: { "YYYY-MM-DD": { XAU: <oz per 1 EUR> } } }
// Gold price EUR/oz = 1 / XAU rate

async function fetchGoldEur() {
  const apiKey = process.env.METAL_API_KEY;
  if (!apiKey) throw new Error('Missing METAL_API_KEY environment variable');

  const startDate = '2014-01-01';
  const now = new Date();
  const endDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const url = `https://api.metalpriceapi.com/v1/timeframe?api_key=${apiKey}&start_date=${startDate}&end_date=${endDate}&base=EUR&currencies=XAU`;
  console.log(`Fetching gold EUR prices from Metal Price API (${startDate} → ${endDate})...`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Metal Price API HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`Metal Price API error: ${JSON.stringify(json)}`);

  // Group daily rates by YYYY-MM, compute monthly average gold price
  // EURXAU = EUR per troy oz (direct price field, no conversion needed)
  const buckets = {}; // "YYYY-MM" → [goldEurPerOz]
  for (const [date, rates] of Object.entries(json.rates)) {
    const price = rates.EURXAU;
    if (!price) continue;
    const ym = date.substring(0, 7);
    if (!buckets[ym]) buckets[ym] = [];
    buckets[ym].push(price);
  }

  const map = {};
  for (const [ym, prices] of Object.entries(buckets)) {
    map[ym] = prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  console.log(`Gold EUR: ${Object.keys(map).length} months computed`);
  return map;
}

// ── Merge ─────────────────────────────────────────────────────────────────────

function mergeData(kvMap, goldMap) {
  // Normalize kv "MM.YYYY" → "YYYY-MM"
  const kvNorm = {};
  for (const [label, price] of Object.entries(kvMap)) {
    const [mm, yyyy] = label.split('.');
    kvNorm[`${yyyy}-${mm.padStart(2, '0')}`] = price;
  }

  // kv.ee is master timeline — sort months
  const months = Object.keys(kvNorm).sort();

  const data = [];
  for (const month of months) {
    const kesklinn = kvNorm[month];
    const gold = goldMap[month];
    if (kesklinn == null || gold == null) continue;
    data.push({ month, kesklinn, gold });
  }
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [kvMap, goldMap] = await Promise.all([
    scrapeKvee(),
    fetchGoldEur(),
  ]);
  const data = mergeData(kvMap, goldMap);
  fs.writeFileSync('tallinn-kesklinn.json', JSON.stringify(data, null, 2));
  console.log(`Written ${data.length} months to tallinn-kesklinn.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
