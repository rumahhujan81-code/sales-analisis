import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeRecord,
  parseSaleDate,
  filterSalesData,
  computeKPIs,
  aggregateMonthlyTrend,
  aggregateByField,
  getTopHighestSales,
  prepareDiscountScatterData,
} from '../script.js';

const rawJson = JSON.parse(
  fs.readFileSync(path.resolve('public/data/sales_data.json'), 'utf8'),
);
const records = rawJson.map(normalizeRecord).filter(Boolean);

test('loads all 200 valid records from sales_data.json without malformed rows', () => {
  assert.equal(records.length, 200);
  assert.equal(records[19].Sales_Rep, 'Bob');
  assert.equal(normalizeRecord({ Product_ID: 'Bob', Sales_Amount: '' }), null);
});

test('computes accurate global KPIs across 200 transactions', () => {
  const kpi = computeKPIs(records);
  assert.equal(kpi.totalTransactions, 200);
  assert.equal(kpi.totalQuantity, 4737);
  assert.ok(Math.abs(kpi.totalRevenue - 1065600.71) < 0.01);
  assert.ok(Math.abs(kpi.averageDiscount - 0.1491) < 0.0005);
});

test('computes zeroed KPIs safely when filtered dataset is empty', () => {
  const kpi = computeKPIs([]);
  assert.deepEqual(kpi, {
    totalRevenue: 0,
    totalTransactions: 0,
    totalQuantity: 0,
    averageDiscount: 0,
    averageOrderValue: 0,
    averageQuantityPerOrder: 0,
    minDiscount: 0,
    maxDiscount: 0,
  });
});

test('filters records accurately across all 4 filter dimensions', () => {
  const filtered = filterSalesData(records, {
    region: 'North',
    category: 'Furniture',
    customerType: 'Returning',
    salesChannel: 'Online',
  });
  assert.ok(filtered.length > 0);
  for (const row of filtered) {
    assert.equal(row.Region, 'North');
    assert.equal(row.Product_Category, 'Furniture');
    assert.equal(row.Customer_Type, 'Returning');
    assert.equal(row.Sales_Channel, 'Online');
  }
});

test('aggregates monthly sales trend chronologically for 2023', () => {
  const trend = aggregateMonthlyTrend(records);
  assert.equal(trend.length, 12);
  assert.equal(trend[0].key, '2023-01');
  assert.equal(trend[11].key, '2023-12');
  const sumRevenue = trend.reduce((acc, m) => acc + m.revenue, 0);
  assert.ok(Math.abs(sumRevenue - 1065600.71) < 0.01);
});

test('aggregates by region, category, sales rep, and distributions accurately', () => {
  const byRegion = aggregateByField(records, 'Region', 'Sales_Amount', 'desc');
  assert.equal(byRegion.length, 4);
  assert.ok(byRegion[0].value >= byRegion[1].value);

  const byRep = aggregateByField(records, 'Sales_Rep', 'Sales_Amount', 'desc');
  assert.equal(byRep.length, 5);

  const byCustomer = aggregateByField(records, 'Customer_Type', null, 'desc');
  const totalTx = byCustomer.reduce((sum, item) => sum + item.value, 0);
  assert.equal(totalTx, 200);
});

test('returns Top 10 highest sales sorted descending and valid scatter points', () => {
  const top10 = getTopHighestSales(records, 10);
  assert.equal(top10.length, 10);
  for (let i = 1; i < top10.length; i++) {
    assert.ok(top10[i - 1].Sales_Amount >= top10[i].Sales_Amount);
  }

  const scatter = prepareDiscountScatterData(records);
  assert.equal(scatter.length, 200);
  assert.ok(scatter[0].x >= 0 && scatter[0].x <= 100);
  assert.ok(scatter[0].y > 0);
});

test('parseSaleDate rejects malformed dates and parses valid dates', () => {
  assert.deepEqual(parseSaleDate('11/16/2023'), {
    year: 2023,
    monthIndex: 10,
    timestamp: Date.UTC(2023, 10, 16),
  });
  assert.equal(parseSaleDate('invalid'), null);
});
