// dashboard.js — shared chart logic for all city dashboards
// Usage: call initDashboard(config) after DOM is ready.
//
// config: {
//   dataUrl:      string   — path to city JSON, e.g. 'tallinn-kesklinn.json'
//   cityLabel:    string   — e.g. 'Tallinn Kesklinn' (used in stat card label)
//   summaries:    object   — { 0: html, 12: html, 36: html, 60: html }
//   fallbackData: array|null — pre-built [{time, value, kesklinn, gold}] for offline use
// }

function initDashboard(config) {
  const { dataUrl, cityLabel, summaries, fallbackData } = config;

  // Set dynamic city label in stat card
  const cityLabelEl = document.getElementById('city-label');
  if (cityLabelEl) cityLabelEl.textContent = cityLabel + ' €/m²';

  // ── Build ratio from API JSON ──────────────────────────────────────────────
  function buildAllRatioFromApi(apiData) {
    const cpiBase = apiData[0]?.cpi;
    return apiData.map(({ month, kesklinn, gold, cpi }) => {
      const [yyyy, mm] = month.split('-');
      const row = {
        time: { year: parseInt(yyyy), month: parseInt(mm), day: 1 },
        value: parseFloat((kesklinn / gold).toFixed(4)),
        kesklinn,
        gold,
      };
      if (cpi != null && cpiBase != null) {
        row.cpi = cpi;
        row.real = parseFloat((kesklinn / (cpi / cpiBase)).toFixed(1));
      }
      return row;
    });
  }

  // ── EUR chart init ─────────────────────────────────────────────────────────
  let eurChartSetRange = null;  // will be set by initEurChart if CPI data exists

  function initEurChart(allData) {
    const container = document.getElementById('eur-chart-container');
    if (!container) return;

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: '#1a1a1a' },
        textColor: '#8a8a88',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { width: 1, color: 'rgba(255,255,255,0.15)', labelBackgroundColor: '#333' },
        horzLine: { width: 1, color: 'rgba(232,175,52,0.3)', labelBackgroundColor: '#333' },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: { top: 0.08, bottom: 0.06 },
        visible: true,
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        tickMarkFormatter: (time) => {
          const d = new Date(time.year, time.month - 1);
          return d.toLocaleDateString('en', { month: 'short', year: '2-digit' });
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const nomSeries = chart.addLineSeries({
      color: '#555',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#555',
      crosshairMarkerBackgroundColor: '#1a1a1a',
      crosshairMarkerBorderWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (p) => '€' + Math.round(p).toLocaleString(),
      },
    });

    const realSeries = chart.addLineSeries({
      color: '#e8af34',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#e8af34',
      crosshairMarkerBackgroundColor: '#1a1a1a',
      crosshairMarkerBorderWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (p) => '€' + Math.round(p).toLocaleString(),
      },
    });

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    function formatMonth(time) {
      if (typeof time === 'object' && time.year) return monthNames[time.month - 1] + ' ' + time.year;
      return '';
    }
    function fmtEur(v) { return '€' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

    function updateEurStats(data) {
      const last = data[data.length - 1];
      const first = data[0];
      const nomEl = document.getElementById('nom-price');
      const nomDateEl = document.getElementById('nom-date');
      const realEl = document.getElementById('real-price');
      const realDateEl = document.getElementById('real-date');
      const realChangeEl = document.getElementById('real-change');
      if (nomEl) nomEl.textContent = fmtEur(last.kesklinn);
      if (nomDateEl) nomDateEl.textContent = formatMonth(last.time);
      if (realEl) realEl.textContent = fmtEur(last.real);
      if (realDateEl) realDateEl.textContent = formatMonth(last.time);
      if (realChangeEl) {
        const pct = ((last.real / first.real) - 1) * 100;
        realChangeEl.textContent = fmtPct(pct);
        realChangeEl.className = 'stat-change ' + (pct >= 0 ? 'positive' : 'negative');
      }
    }

    function setEurData(data) {
      nomSeries.setData(data.map(d => ({ time: d.time, value: d.kesklinn })));
      realSeries.setData(data.map(d => ({ time: d.time, value: d.real })));
      chart.timeScale().fitContent();
      updateEurStats(data);
    }

    setEurData(allData);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        updateEurStats(allData);
        return;
      }
      const nomVal = param.seriesData.get(nomSeries);
      const realVal = param.seriesData.get(realSeries);
      if (nomVal || realVal) {
        const nomEl = document.getElementById('nom-price');
        const nomDateEl = document.getElementById('nom-date');
        const realEl = document.getElementById('real-price');
        const realDateEl = document.getElementById('real-date');
        const realChangeEl = document.getElementById('real-change');
        if (nomEl && nomVal) nomEl.textContent = fmtEur(nomVal.value);
        if (nomDateEl) nomDateEl.textContent = formatMonth(param.time);
        if (realEl && realVal) realEl.textContent = fmtEur(realVal.value);
        if (realDateEl) realDateEl.textContent = formatMonth(param.time);
        if (realChangeEl && realVal) {
          const activeRange = document.querySelector('.range-btn.active');
          const months = parseInt(activeRange.dataset.range);
          const rangeData = months === 0 ? allData : allData.slice(-months);
          const pct = ((realVal.value / rangeData[0].real) - 1) * 100;
          realChangeEl.textContent = fmtPct(pct);
          realChangeEl.className = 'stat-change ' + (pct >= 0 ? 'positive' : 'negative');
        }
      }
    });

    new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    }).observe(container);

    eurChartSetRange = (months) => {
      const data = months === 0 ? allData : allData.slice(-months);
      setEurData(data);
    };
  }

  // ── Chart init ─────────────────────────────────────────────────────────────
  function initChart(allRatio) {
    const container = document.getElementById('chart-container');

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: '#1a1a1a' },
        textColor: '#8a8a88',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { width: 1, color: 'rgba(255,255,255,0.15)', labelBackgroundColor: '#333' },
        horzLine: { width: 1, color: 'rgba(232, 175, 52, 0.3)', labelBackgroundColor: '#333' },
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
        scaleMargins: { top: 0.08, bottom: 0.06 },
        visible: true,
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        tickMarkFormatter: (time) => {
          const d = new Date(time.year, time.month - 1);
          return d.toLocaleDateString('en', { month: 'short', year: '2-digit' });
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const ratioSeries = chart.addAreaSeries({
      topColor: 'rgba(232, 175, 52, 0.25)',
      bottomColor: 'rgba(232, 175, 52, 0.01)',
      lineColor: '#e8af34',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: '#e8af34',
      crosshairMarkerBackgroundColor: '#1a1a1a',
      crosshairMarkerBorderWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (p) => p.toFixed(2) + ' oz',
      },
    });

    const chartData = allRatio.map(d => ({ time: d.time, value: d.value }));
    ratioSeries.setData(chartData);
    chart.timeScale().fitContent();

    // ── Formatters ───────────────────────────────────────────────────────────
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function formatMonth(time) {
      if (typeof time === 'object' && time.year) return monthNames[time.month - 1] + ' ' + time.year;
      return '';
    }

    function fmtOz(v) { return v.toFixed(2) + ' oz'; }
    function fmtEur(v) { return '€' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function fmtGold(v) { return v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

    // ── Stats update ─────────────────────────────────────────────────────────
    function updateStatsFromRange(data) {
      const first = data[0], last = data[data.length - 1];

      document.getElementById('r-price').textContent = fmtOz(last.value);
      document.getElementById('r-date').textContent = formatMonth(last.time);
      const pct = ((last.value / first.value) - 1) * 100;
      const el = document.getElementById('r-change');
      el.textContent = fmtPct(pct);
      el.className = 'stat-change ' + (pct >= 0 ? 'positive' : 'negative');

      document.getElementById('k-price').textContent = fmtEur(last.kesklinn);
      document.getElementById('k-date').textContent = formatMonth(last.time);
      document.getElementById('g-price').textContent = fmtGold(last.gold);
      document.getElementById('g-date').textContent = formatMonth(last.time);
    }

    // ── Crosshair hover ───────────────────────────────────────────────────────
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        updateStatsFromRange(allRatio);
        return;
      }

      const val = param.seriesData.get(ratioSeries);
      if (val) {
        const idx = allRatio.findIndex(d =>
          d.time.year === param.time.year && d.time.month === param.time.month
        );
        if (idx >= 0) {
          const d = allRatio[idx];
          document.getElementById('r-price').textContent = fmtOz(val.value);
          document.getElementById('r-date').textContent = formatMonth(param.time);
          document.getElementById('k-price').textContent = fmtEur(d.kesklinn);
          document.getElementById('k-date').textContent = formatMonth(param.time);
          document.getElementById('g-price').textContent = fmtGold(d.gold);
          document.getElementById('g-date').textContent = formatMonth(param.time);

          const activeRange = document.querySelector('.range-btn.active');
          const months = parseInt(activeRange.dataset.range);
          const rangeData = months === 0 ? allRatio : allRatio.slice(-months);
          const firstVal = rangeData[0].value;
          const pct = ((val.value / firstVal) - 1) * 100;
          const el = document.getElementById('r-change');
          el.textContent = fmtPct(pct);
          el.className = 'stat-change ' + (pct >= 0 ? 'positive' : 'negative');
        }
      }
    });

    // ── Range buttons ─────────────────────────────────────────────────────────
    function setRange(months) {
      const data = months === 0 ? allRatio : allRatio.slice(-months);
      ratioSeries.setData(data.map(d => ({ time: d.time, value: d.value })));
      chart.timeScale().fitContent();
      updateStatsFromRange(data);
    }

    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const months = parseInt(btn.dataset.range);
        setRange(months);
        if (eurChartSetRange) eurChartSetRange(months);
        updateSummary(months);
      });
    });

    // ── Resize ────────────────────────────────────────────────────────────────
    new ResizeObserver(entries => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    }).observe(container);

    // ── Summary ───────────────────────────────────────────────────────────────
    const summaryEl = document.getElementById('summary');

    function updateSummary(months) {
      if (summaries && summaries[months]) {
        summaryEl.innerHTML = summaries[months];
      } else {
        summaryEl.textContent = '';
      }
    }

    updateStatsFromRange(allRatio);
    updateSummary(0);

    // Update subtitle with latest data month
    const last = allRatio[allRatio.length - 1];
    const first = allRatio[0];
    const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const subtitleEl = document.querySelector('.subtitle');
    if (subtitleEl) {
      subtitleEl.textContent =
        `How many ounces of gold does one m² of ${cityLabel} apartment cost? · ` +
        `${mNames[first.time.month - 1]} ${first.time.year} – ${mNames[last.time.month - 1]} ${last.time.year}`;
    }
  }

  // ── Load data: try JSON, fall back to provided fallbackData ───────────────
  async function loadData() {
    try {
      const res = await fetch(dataUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) throw new Error('empty');
      const allRatio = buildAllRatioFromApi(data);
      initChart(allRatio);
      if (allRatio[0]?.cpi != null) initEurChart(allRatio);
    } catch {
      if (fallbackData && fallbackData.length) {
        initChart(fallbackData);
        // fallback data has no CPI — EUR chart not shown
      }
    }
  }

  loadData();
}
