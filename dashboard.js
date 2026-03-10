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
    return apiData.map(({ month, kesklinn, gold }) => {
      const [yyyy, mm] = month.split('-');
      return {
        time: { year: parseInt(yyyy), month: parseInt(mm), day: 1 },
        value: parseFloat((kesklinn / gold).toFixed(4)),
        kesklinn,
        gold,
      };
    });
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
          const months = activeRange ? parseInt(activeRange.dataset.range) : 0;
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

    const fromInput = document.getElementById('range-from');
    const toInput   = document.getElementById('range-to');

    function applyCustomRange() {
      const fromYear = fromInput?.value ? parseInt(fromInput.value) : null;
      const toYear   = toInput?.value   ? parseInt(toInput.value)   : null;
      if (!fromYear && !toYear) return;

      const data = allRatio.filter(d => {
        if (fromYear && d.time.year < fromYear) return false;
        if (toYear   && d.time.year > toYear)   return false;
        return true;
      });
      if (!data.length) return;

      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      ratioSeries.setData(data.map(d => ({ time: d.time, value: d.value })));
      chart.timeScale().fitContent();
      updateStatsFromRange(data);
      updateSummary(-1);
    }

    if (fromInput) fromInput.addEventListener('change', applyCustomRange);
    if (toInput)   toInput.addEventListener('change',   applyCustomRange);

    document.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (fromInput) fromInput.value = '';
        if (toInput)   toInput.value   = '';
        const months = parseInt(btn.dataset.range);
        setRange(months);
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
      initChart(buildAllRatioFromApi(data));
    } catch {
      if (fallbackData && fallbackData.length) {
        initChart(fallbackData);
      }
    }
  }

  loadData();
}
