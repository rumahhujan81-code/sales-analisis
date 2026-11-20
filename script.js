import Chart from 'chart.js/auto';

/**
 * ============================================================================
 * SalesPulse Analytics — Dashboard Penjualan (Vanilla JavaScript + Chart.js)
 * ============================================================================
 * Seluruh data diambil secara dinamis dari /data/sales_data.json tanpa dummy data.
 * Fungsi kalkulasi & agregasi dipisahkan sebagai pure functions agar mudah diuji
 * dan dipelihara secara modular.
 */

// Palet warna konsisten untuk visualisasi data (60-30-10 discipline)
const PALETTE = {
  cobalt: '#2563EB',
  cobaltSoft: 'rgba(37, 99, 235, 0.14)',
  indigo: '#4F46E5',
  teal: '#0D9488',
  amber: '#D97706',
  slate: '#64748B',
  sky: '#0284C7',
  rose: '#E11D48',
  grid: 'rgba(148, 163, 184, 0.22)',
  tick: '#475569',
};

const SERIES_COLORS = [
  '#2563EB',
  '#0D9488',
  '#4F46E5',
  '#D97706',
  '#0284C7',
  '#64748B',
];

const MONTH_NAMES_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

// State aplikasi terpusat
const state = {
  rawData: [],
  filteredData: [],
  filters: {
    region: 'All',
    category: 'All',
    customerType: 'All',
    salesChannel: 'All',
  },
  charts: {},
};

// ============================================================================
// 1. PURE DATA NORMALIZATION, FILTERING & AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Menormalkan satu baris catatan penjualan dan memvalidasi kelengkapan angka.
 * Mengembalikan null jika baris rusak/tidak valid.
 */
export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const productId = Number(raw.Product_ID);
  const salesAmount = Number(raw.Sales_Amount);
  const quantitySold = Number(raw.Quantity_Sold);
  const unitCost = Number(raw.Unit_Cost);
  const unitPrice = Number(raw.Unit_Price);
  const discount = Number(raw.Discount);
  const saleDate = String(raw.Sale_Date ?? '').trim();

  if (
    !saleDate ||
    Number.isNaN(productId) ||
    Number.isNaN(salesAmount) ||
    Number.isNaN(quantitySold) ||
    Number.isNaN(discount)
  ) {
    return null;
  }

  const regionAndRep = String(raw.Region_and_Sales_Rep ?? '').trim();
  let salesRep = String(raw.Sales_Rep ?? '').trim();
  if (!salesRep && regionAndRep.includes('-')) {
    salesRep = regionAndRep.split('-')[1].trim();
  }

  return {
    Product_ID: productId,
    Sale_Date: saleDate,
    Sales_Rep: salesRep || 'Unknown',
    Region: String(raw.Region ?? '').trim() || 'Unknown',
    Sales_Amount: salesAmount,
    Quantity_Sold: quantitySold,
    Product_Category: String(raw.Product_Category ?? '').trim() || 'Unknown',
    Unit_Cost: Number.isNaN(unitCost) ? 0 : unitCost,
    Unit_Price: Number.isNaN(unitPrice) ? 0 : unitPrice,
    Customer_Type: String(raw.Customer_Type ?? '').trim() || 'Unknown',
    Discount: discount,
    Payment_Method: String(raw.Payment_Method ?? '').trim() || 'Unknown',
    Sales_Channel: String(raw.Sales_Channel ?? '').trim() || 'Unknown',
    Region_and_Sales_Rep: regionAndRep,
  };
}

/**
 * Mengurai string tanggal M/D/YYYY menjadi { year, monthIndex (0-11), timestamp }.
 */
export function parseSaleDate(dateStr) {
  const parts = String(dateStr).split('/');
  if (parts.length !== 3) return null;
  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[2]);
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  return {
    year,
    monthIndex: month - 1,
    timestamp: Date.UTC(year, month - 1, day),
  };
}

/**
 * Menyaring dataset berdasarkan filter Region, Product Category, Customer Type, dan Sales Channel.
 */
export function filterSalesData(records, filters) {
  return records.filter((item) => {
    if (filters.region !== 'All' && item.Region !== filters.region) return false;
    if (filters.category !== 'All' && item.Product_Category !== filters.category) return false;
    if (filters.customerType !== 'All' && item.Customer_Type !== filters.customerType) return false;
    if (filters.salesChannel !== 'All' && item.Sales_Channel !== filters.salesChannel) return false;
    return true;
  });
}

/**
 * Menghitung 4 metrik KPI utama serta statistik pendukung.
 */
export function computeKPIs(records) {
  const totalTransactions = records.length;
  if (totalTransactions === 0) {
    return {
      totalRevenue: 0,
      totalTransactions: 0,
      totalQuantity: 0,
      averageDiscount: 0,
      averageOrderValue: 0,
      averageQuantityPerOrder: 0,
      minDiscount: 0,
      maxDiscount: 0,
    };
  }

  let totalRevenue = 0;
  let totalQuantity = 0;
  let discountSum = 0;
  let minDiscount = Infinity;
  let maxDiscount = -Infinity;

  for (const row of records) {
    totalRevenue += row.Sales_Amount;
    totalQuantity += row.Quantity_Sold;
    discountSum += row.Discount;
    if (row.Discount < minDiscount) minDiscount = row.Discount;
    if (row.Discount > maxDiscount) maxDiscount = row.Discount;
  }

  return {
    totalRevenue,
    totalTransactions,
    totalQuantity,
    averageDiscount: discountSum / totalTransactions,
    averageOrderValue: totalRevenue / totalTransactions,
    averageQuantityPerOrder: totalQuantity / totalTransactions,
    minDiscount,
    maxDiscount,
  };
}

/**
 * Mengelompokkan pendapatan dan jumlah transaksi per bulan secara kronologis.
 */
export function aggregateMonthlyTrend(records) {
  const buckets = new Map();

  for (const row of records) {
    const parsed = parseSaleDate(row.Sale_Date);
    if (!parsed) continue;
    const key = `${parsed.year}-${String(parsed.monthIndex + 1).padStart(2, '0')}`;
    const existing = buckets.get(key) || {
      key,
      label: `${MONTH_NAMES_ID[parsed.monthIndex]} ${parsed.year}`,
      revenue: 0,
      transactions: 0,
    };
    existing.revenue += row.Sales_Amount;
    existing.transactions += 1;
    buckets.set(key, existing);
  }

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Mengagregasi nilai numerik (atau frekuensi transaksi) berdasarkan satu kolom kategori.
 * @param {Array} records
 * @param {string} groupField
 * @param {string|null} valueField - Jika null, menghitung jumlah transaksi (count).
 * @param {'desc'|'asc'} sortOrder
 */
export function aggregateByField(records, groupField, valueField = 'Sales_Amount', sortOrder = 'desc') {
  const totals = new Map();

  for (const row of records) {
    const key = row[groupField] || 'Unknown';
    const delta = valueField ? Number(row[valueField] || 0) : 1;
    totals.set(key, (totals.get(key) || 0) + delta);
  }

  const entries = Array.from(totals.entries()).map(([label, value]) => ({ label, value }));
  entries.sort((a, b) => (sortOrder === 'asc' ? a.value - b.value : b.value - a.value));
  return entries;
}

/**
 * Mengambil Top N transaksi dengan Sales_Amount tertinggi.
 */
export function getTopHighestSales(records, limit = 10) {
  return [...records]
    .sort((a, b) => b.Sales_Amount - a.Sales_Amount)
    .slice(0, limit);
}

/**
 * Menyiapkan titik data scatter plot untuk korelasi Discount (%) vs Sales_Amount.
 */
export function prepareDiscountScatterData(records) {
  return records.map((row) => ({
    x: Number((row.Discount * 100).toFixed(2)),
    y: row.Sales_Amount,
    meta: {
      productId: row.Product_ID,
      category: row.Product_Category,
      rep: row.Sales_Rep,
      channel: row.Sales_Channel,
      date: row.Sale_Date,
    },
  }));
}

// ============================================================================
// 2. FORMATTING HELPERS
// ============================================================================

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat('en-US');

function formatCurrency(val) {
  return currencyFormatter.format(val);
}

function formatPercent(decimalVal, digits = 2) {
  return `${(decimalVal * 100).toFixed(digits)}%`;
}

// ============================================================================
// 3. UI RENDERING & CHART.JS INITIALIZATION
// ============================================================================

/**
 * Mengisi opsi dropdown filter secara dinamis dari data JSON aktual.
 */
function populateFilterOptions(records) {
  const populateSelect = (selectId, field, defaultLabel) => {
    const select = document.getElementById(selectId);
    if (!select) return;
    const uniqueValues = Array.from(new Set(records.map((r) => r[field]))).sort();

    select.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'All';
    allOpt.textContent = defaultLabel;
    select.appendChild(allOpt);

    for (const val of uniqueValues) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    }
  };

  populateSelect('filter-region', 'Region', 'Semua Region');
  populateSelect('filter-category', 'Product_Category', 'Semua Kategori');
  populateSelect('filter-customer', 'Customer_Type', 'Semua Tipe Pelanggan');
  populateSelect('filter-channel', 'Sales_Channel', 'Semua Saluran');
}

/**
 * Memperbarui tampilan kartu KPI dan indikator status filter aktif.
 */
function renderKPIs(records, totalCount) {
  const kpi = computeKPIs(records);

  document.getElementById('kpi-revenue').textContent = formatCurrency(kpi.totalRevenue);
  document.getElementById('kpi-revenue-sub').textContent =
    `Rata-rata ${formatCurrency(kpi.averageOrderValue)} / transaksi`;

  document.getElementById('kpi-transactions').textContent = integerFormatter.format(kpi.totalTransactions);
  document.getElementById('kpi-transactions-sub').textContent =
    `Dari ${integerFormatter.format(totalCount)} total catatan penjualan`;

  document.getElementById('kpi-quantity').textContent = integerFormatter.format(kpi.totalQuantity);
  document.getElementById('kpi-quantity-sub').textContent =
    `Rata-rata ${kpi.averageQuantityPerOrder.toFixed(1)} unit / order`;

  document.getElementById('kpi-discount').textContent = formatPercent(kpi.averageDiscount, 2);
  document.getElementById('kpi-discount-sub').textContent =
    records.length > 0
      ? `Rentang diskon ${formatPercent(kpi.minDiscount, 0)} – ${formatPercent(kpi.maxDiscount, 0)}`
      : 'Tidak ada rentang diskon';

  const summaryEl = document.getElementById('record-summary');
  if (summaryEl) {
    summaryEl.textContent = `Menampilkan ${integerFormatter.format(records.length)} dari ${integerFormatter.format(totalCount)} transaksi`;
  }
}

/**
 * Helper untuk membuat atau memperbarui instance Chart.js dengan aman.
 */
function upsertChart(key, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (state.charts[key]) {
    state.charts[key].destroy();
  }
  state.charts[key] = new Chart(canvas, config);
}

/**
 * Opsi dasar yang konsisten untuk semua grafik batang & garis.
 * Catatan: Jangan mendefinisikan `callback: undefined` pada sumbu kategori,
 * karena Chart.js v4 akan mencetak indeks numerik alih-alih label teks.
 */
function getBaseCartesianOptions({ isCurrency = true, horizontal = false } = {}) {
  const valueTickFormatter = (val) =>
    isCurrency ? compactCurrencyFormatter.format(val) : integerFormatter.format(val);

  const xTicks = {
    color: PALETTE.tick,
    font: { family: 'JetBrains Mono, monospace', size: 11 },
  };
  const yTicks = {
    color: PALETTE.tick,
    font: { family: 'JetBrains Mono, monospace', size: 11 },
  };

  if (horizontal) {
    xTicks.callback = valueTickFormatter;
  } else {
    yTicks.callback = valueTickFormatter;
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        titleColor: '#F8FAFC',
        bodyColor: '#E2E8F0',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label(ctx) {
            const rawVal = horizontal ? ctx.parsed.x : ctx.parsed.y;
            return isCurrency
              ? ` Revenue: ${formatCurrency(rawVal)}`
              : ` Terjual: ${integerFormatter.format(rawVal)} unit`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: horizontal,
        grid: {
          display: horizontal,
          color: PALETTE.grid,
        },
        border: { display: false },
        ticks: xTicks,
      },
      y: {
        beginAtZero: !horizontal,
        grid: {
          display: !horizontal,
          color: PALETTE.grid,
        },
        border: { display: false },
        ticks: yTicks,
      },
    },
  };
}

/**
 * Merender seluruh 9 grafik Chart.js berdasarkan data hasil filter.
 */
function renderCharts(records) {
  Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
  Chart.defaults.color = PALETTE.tick;

  // 1. Sales Trend (Line/Area Chart)
  const monthlyData = aggregateMonthlyTrend(records);
  upsertChart('salesTrend', 'chart-sales-trend', {
    type: 'line',
    data: {
      labels: monthlyData.map((d) => d.label.split(' ')[0]),
      datasets: [
        {
          label: 'Total Revenue',
          data: monthlyData.map((d) => d.revenue),
          borderColor: PALETTE.cobalt,
          backgroundColor: PALETTE.cobaltSoft,
          borderWidth: 2.5,
          fill: true,
          tension: 0.32,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#FFFFFF',
          pointBorderColor: PALETTE.cobalt,
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      ...getBaseCartesianOptions({ isCurrency: true }),
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title(items) {
              if (!items.length) return '';
              return monthlyData[items[0].dataIndex].label;
            },
            label(ctx) {
              const item = monthlyData[ctx.dataIndex];
              return [
                ` Revenue: ${formatCurrency(item.revenue)}`,
                ` Transaksi: ${item.transactions} order`,
              ];
            },
          },
        },
      },
    },
  });

  // 2. Revenue per Region (Polar Area Chart)
  const regionData = aggregateByField(records, 'Region', 'Sales_Amount', 'desc');
  const totalRegionRevenue = regionData.reduce((sum, item) => sum + item.value, 0);
  const regionPolarColors = [
    'rgba(37, 99, 235, 0.82)',  // Cobalt
    'rgba(79, 70, 229, 0.82)',  // Indigo
    'rgba(13, 148, 136, 0.82)', // Teal
    'rgba(2, 132, 199, 0.82)',  // Sky
  ];
  const regionBorderColors = [
    PALETTE.cobalt,
    PALETTE.indigo,
    PALETTE.teal,
    PALETTE.sky,
  ];

  upsertChart('revenueRegion', 'chart-revenue-region', {
    type: 'polarArea',
    data: {
      labels: regionData.map((d) => {
        const pct = totalRegionRevenue > 0 ? ((d.value / totalRegionRevenue) * 100).toFixed(1) : '0.0';
        return `${d.label} (${pct}%)`;
      }),
      datasets: [
        {
          label: 'Revenue per Region',
          data: regionData.map((d) => d.value),
          backgroundColor: regionPolarColors.slice(0, regionData.length),
          borderColor: '#FFFFFF',
          hoverBorderColor: regionBorderColors.slice(0, regionData.length),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: PALETTE.grid },
          angleLines: { display: true, color: PALETTE.grid },
          ticks: {
            backdropColor: 'rgba(255, 255, 255, 0.88)',
            backdropPadding: 2,
            color: PALETTE.tick,
            font: { family: 'JetBrains Mono, monospace', size: 10 },
            callback: (val) => compactCurrencyFormatter.format(val),
          },
        },
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 12,
            font: { size: 11.5, weight: '500' },
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label(ctx) {
              const val = ctx.parsed.r;
              const labelBase = regionData[ctx.dataIndex]?.label || ctx.label;
              const pct = totalRegionRevenue > 0 ? ((val / totalRegionRevenue) * 100).toFixed(1) : '0.0';
              return ` ${labelBase}: ${formatCurrency(val)} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  // 3. Revenue per Product Category (Vertical Bar Chart)
  const categoryRevenue = aggregateByField(records, 'Product_Category', 'Sales_Amount', 'desc');
  upsertChart('revenueCategory', 'chart-revenue-category', {
    type: 'bar',
    data: {
      labels: categoryRevenue.map((d) => d.label),
      datasets: [
        {
          label: 'Revenue',
          data: categoryRevenue.map((d) => d.value),
          backgroundColor: PALETTE.indigo,
          borderRadius: 6,
          maxBarThickness: 42,
        },
      ],
    },
    options: getBaseCartesianOptions({ isCurrency: true }),
  });

  // 4. Quantity Sold per Category (Vertical Bar Chart)
  const categoryQuantity = aggregateByField(records, 'Product_Category', 'Quantity_Sold', 'desc');
  upsertChart('quantityCategory', 'chart-quantity-category', {
    type: 'bar',
    data: {
      labels: categoryQuantity.map((d) => d.label),
      datasets: [
        {
          label: 'Quantity Sold',
          data: categoryQuantity.map((d) => d.value),
          backgroundColor: PALETTE.teal,
          borderRadius: 6,
          maxBarThickness: 42,
        },
      ],
    },
    options: getBaseCartesianOptions({ isCurrency: false }),
  });

  // 5. Sales per Sales Representative (Horizontal Bar Chart)
  const repSales = aggregateByField(records, 'Sales_Rep', 'Sales_Amount', 'desc');
  upsertChart('salesRep', 'chart-sales-rep', {
    type: 'bar',
    data: {
      labels: repSales.map((d) => d.label),
      datasets: [
        {
          label: 'Revenue',
          data: repSales.map((d) => d.value),
          backgroundColor: PALETTE.cobalt,
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    },
    options: getBaseCartesianOptions({ isCurrency: true, horizontal: true }),
  });

  // Helper konfigurasi untuk 3 grafik Doughnut Distribusi
  const buildDoughnutConfig = (entries, colors) => {
    const total = entries.reduce((sum, item) => sum + item.value, 0);
    return {
      type: 'doughnut',
      data: {
        labels: entries.map((d) => {
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';
          return `${d.label} (${pct}%)`;
        }),
        datasets: [
          {
            data: entries.map((d) => d.value),
            backgroundColor: colors.slice(0, entries.length),
            borderColor: '#FFFFFF',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 14,
              font: { size: 11.5, weight: '500' },
            },
          },
          tooltip: {
            backgroundColor: '#0F172A',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label(ctx) {
                const count = ctx.parsed;
                const labelBase = entries[ctx.dataIndex]?.label || ctx.label;
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                return ` ${labelBase}: ${count} transaksi (${pct}%)`;
              },
            },
          },
        },
      },
    };
  };

  // 6. Customer Type Distribution
  const customerDist = aggregateByField(records, 'Customer_Type', null, 'desc');
  upsertChart(
    'customerType',
    'chart-customer-type',
    buildDoughnutConfig(customerDist, [PALETTE.cobalt, PALETTE.teal]),
  );

  // 7. Payment Method Usage
  const paymentDist = aggregateByField(records, 'Payment_Method', null, 'desc');
  upsertChart(
    'paymentMethod',
    'chart-payment-method',
    buildDoughnutConfig(paymentDist, [PALETTE.indigo, PALETTE.sky, PALETTE.amber]),
  );

  // 8. Sales Channel Distribution
  const channelDist = aggregateByField(records, 'Sales_Channel', null, 'desc');
  upsertChart(
    'salesChannel',
    'chart-sales-channel',
    buildDoughnutConfig(channelDist, [PALETTE.cobalt, PALETTE.amber]),
  );

  // 9. Discount vs Sales (Scatter Plot)
  const scatterPoints = prepareDiscountScatterData(records);
  upsertChart('discountScatter', 'chart-discount-scatter', {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Transaksi Penjualan',
          data: scatterPoints,
          backgroundColor: 'rgba(37, 99, 235, 0.55)',
          borderColor: PALETTE.cobalt,
          borderWidth: 1,
          pointRadius: 4.5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title(items) {
              if (!items.length) return '';
              const meta = items[0].raw.meta;
              return `Product #${meta.productId} (${meta.category})`;
            },
            label(ctx) {
              const point = ctx.raw;
              return [
                ` Diskon: ${point.x}%`,
                ` Sales Amount: ${formatCurrency(point.y)}`,
                ` Rep: ${point.meta.rep} · ${point.meta.channel}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Discount (%)',
            color: PALETTE.tick,
            font: { size: 11, weight: '600' },
          },
          min: 0,
          grid: { color: PALETTE.grid },
          border: { display: false },
          ticks: {
            color: PALETTE.tick,
            font: { family: 'JetBrains Mono, monospace', size: 11 },
            callback: (val) => `${val}%`,
          },
        },
        y: {
          title: {
            display: true,
            text: 'Sales Amount (USD)',
            color: PALETTE.tick,
            font: { size: 11, weight: '600' },
          },
          beginAtZero: true,
          grid: { color: PALETTE.grid },
          border: { display: false },
          ticks: {
            color: PALETTE.tick,
            font: { family: 'JetBrains Mono, monospace', size: 11 },
            callback: (val) => compactCurrencyFormatter.format(val),
          },
        },
      },
    },
  });
}

/**
 * Merender tabel Top 10 Highest Sales secara aman tanpa innerHTML raw input.
 */
function renderTopSalesTable(records) {
  const tbody = document.getElementById('top-sales-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const topRows = getTopHighestSales(records, 10);

  topRows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = 'transition-colors hover:bg-slate-50';

    const cells = [
      { text: `#${index + 1}`, cls: 'py-2.5 pr-3 font-mono text-xs font-semibold text-slate-500 tabular-nums' },
      { text: String(row.Product_ID), cls: 'px-3 py-2.5 font-mono text-xs font-medium text-slate-900 tabular-nums' },
      { text: row.Sale_Date, cls: 'px-3 py-2.5 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap' },
      { text: row.Sales_Rep, cls: 'px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap' },
      { text: row.Region, cls: 'px-3 py-2.5 text-slate-600 whitespace-nowrap' },
      { text: row.Product_Category, cls: 'px-3 py-2.5 text-slate-600 whitespace-nowrap' },
      { text: String(row.Quantity_Sold), cls: 'px-3 py-2.5 text-right font-mono text-xs text-slate-700 tabular-nums' },
      { text: formatPercent(row.Discount, 0), cls: 'px-3 py-2.5 text-right font-mono text-xs text-slate-600 tabular-nums' },
      { text: formatCurrency(row.Sales_Amount), cls: 'py-2.5 pl-3 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap' },
    ];

    for (const cell of cells) {
      const td = document.createElement('td');
      td.className = cell.cls;
      td.textContent = cell.text;
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

// ============================================================================
// 4. APPLICATION CONTROLLER & EVENT HANDLERS
// ============================================================================

function updateResetButtonState() {
  const resetBtn = document.getElementById('reset-filters-btn');
  if (!resetBtn) return;

  const isDefault =
    state.filters.region === 'All' &&
    state.filters.category === 'All' &&
    state.filters.customerType === 'All' &&
    state.filters.salesChannel === 'All';

  resetBtn.disabled = isDefault;
}

/**
 * Menerapkan filter aktif dan memperbarui KPI, seluruh grafik, serta tabel.
 */
function applyFiltersAndRender() {
  state.filteredData = filterSalesData(state.rawData, state.filters);
  const hasResults = state.filteredData.length > 0;

  renderKPIs(state.filteredData, state.rawData.length);
  updateResetButtonState();

  const emptyEl = document.getElementById('empty-state');
  const chartsEl = document.getElementById('charts-container');
  const exportBtn = document.getElementById('export-csv-btn');

  if (emptyEl) emptyEl.classList.toggle('hidden', hasResults);
  if (chartsEl) chartsEl.classList.toggle('hidden', !hasResults);
  if (exportBtn) exportBtn.disabled = !hasResults;

  if (hasResults) {
    renderCharts(state.filteredData);
    renderTopSalesTable(state.filteredData);
  }
}

function resetAllFilters() {
  state.filters = {
    region: 'All',
    category: 'All',
    customerType: 'All',
    salesChannel: 'All',
  };

  const regionSelect = document.getElementById('filter-region');
  const categorySelect = document.getElementById('filter-category');
  const customerSelect = document.getElementById('filter-customer');
  const channelSelect = document.getElementById('filter-channel');

  if (regionSelect) regionSelect.value = 'All';
  if (categorySelect) categorySelect.value = 'All';
  if (customerSelect) customerSelect.value = 'All';
  if (channelSelect) channelSelect.value = 'All';

  applyFiltersAndRender();
}

/**
 * Mengekspor data transaksi yang sedang terfilter ke file CSV.
 */
function exportFilteredCSV() {
  if (!state.filteredData.length) return;
  const headers = Object.keys(state.filteredData[0]);
  const csvRows = [
    headers.join(','),
    ...state.filteredData.map((row) =>
      headers.map((key) => JSON.stringify(row[key] ?? '')).join(','),
    ),
  ];

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'filtered_sales_data.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function setStatusBanner(visible, message = '', showRetry = false) {
  const banner = document.getElementById('status-banner');
  const msgEl = document.getElementById('status-message');
  const retryBtn = document.getElementById('status-action-btn');
  if (!banner || !msgEl || !retryBtn) return;

  banner.classList.toggle('hidden', !visible);
  msgEl.textContent = message;
  retryBtn.classList.toggle('hidden', !showRetry);
}

function attachEventListeners() {
  const bindFilter = (id, filterKey) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', (e) => {
      state.filters[filterKey] = e.target.value;
      applyFiltersAndRender();
    });
  };

  bindFilter('filter-region', 'region');
  bindFilter('filter-category', 'category');
  bindFilter('filter-customer', 'customerType');
  bindFilter('filter-channel', 'salesChannel');

  document.getElementById('reset-filters-btn')?.addEventListener('click', resetAllFilters);
  document.getElementById('empty-reset-btn')?.addEventListener('click', resetAllFilters);
  document.getElementById('export-csv-btn')?.addEventListener('click', exportFilteredCSV);
  document.getElementById('status-action-btn')?.addEventListener('click', loadSalesData);
}

/**
 * Mengambil data langsung dari file JSON lokal dan menginisialisasi dashboard.
 */
async function loadSalesData() {
  setStatusBanner(true, 'Memuat data penjualan dari JSON...', false);

  try {
    const response = await fetch('/data/sales_data.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} saat memuat data JSON`);
    }

    const rawJson = await response.json();
    if (!Array.isArray(rawJson)) {
      throw new Error('Format JSON tidak valid: harus berupa array transaksi');
    }

    const cleanRecords = rawJson.map(normalizeRecord).filter(Boolean);
    if (cleanRecords.length === 0) {
      throw new Error('Dataset JSON kosong atau tidak memiliki baris valid');
    }

    state.rawData = cleanRecords;
    setStatusBanner(false);
    populateFilterOptions(cleanRecords);
    applyFiltersAndRender();
  } catch (err) {
    console.error('Gagal memuat data penjualan:', err);
    setStatusBanner(
      true,
      `Terjadi kesalahan saat memuat data: ${err.message}`,
      true,
    );
  }
}

export function initDashboard() {
  attachEventListeners();
  loadSalesData();
}

// Jalankan otomatis di browser; aman saat diimpor oleh Node test runner
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }
}
