'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
const { normalizedDate, monthKey, monthRange, safeId, createToken, parseToken, thaiBahtText, handlers } = require('./index')._test;

test('normalizes Gregorian and Buddhist date formats', () => {
  assert.equal(normalizedDate('2026-11-02'), '2026/11/02');
  assert.equal(normalizedDate('02/11/2569'), '2026/11/02');
  assert.equal(monthKey('02/11/2569'), '2026-11');
  assert.equal(monthKey('2026-11'), '2026-11');
  assert.deepEqual(monthRange('2026-02'), { startDate: '2026/02/01', endDate: '2026/02/28' });
  assert.equal(monthRange('2026-13'), null);
});

test('sanitizes Firestore document IDs and returns Thai baht text', () => {
  assert.equal(safeId('SB/1169-0001'), 'SB-1169-0001');
  assert.equal(thaiBahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(thaiBahtText(21.5), 'ยี่สิบเอ็ดบาทห้าสิบสตางค์');
});

test('session tokens are signed and expire', () => {
  const token = createToken({ username: 'operator', role: 'staff' }, 'test-secret');
  assert.equal(parseToken(token, 'test-secret').username, 'operator');
  assert.equal(parseToken(token, 'wrong-secret'), null);
  assert.equal(parseToken(`${token.slice(0, -1)}x`, 'test-secret'), null);
});

test('all frontend RPC methods are registered', () => {
  const methods = [
    'checkLogin', 'getBuyers', 'saveBuyerRecord', 'getNextSaleNo', 'saveSaleRecord',
    'getSalesRecordsRange', 'deleteSaleRecord', 'getNextExpenseNo', 'getExpenseRecordsRange',
    'getTransferAccounts', 'saveExpenseRecord', 'deleteExpenseRecord', 'savePayRecord',
    'getPayRecords', 'getUnpaidSalesRecords', 'getNextBillNo', 'getBuyerByName',
    'generatePdfFromSlideTemplate', 'confirmBilling', 'getExpenseRecordsForClaim',
    'getNextClaimNo', 'confirmClaim', 'getOilStockData', 'setInitialOilStock',
    'getCreditSalesByMonth', 'getCompanyExpensesByMonth', 'updateSalePaymentStatus',
    'updateExpenseTransferStatus', 'getFinancialSummaryData', 'saveCapitalSettingsData',
    'getBuyersumary', 'getUnreceiptedSalesRecords', 'createBatchReceiptsFromFirestore'
  ];
  methods.forEach(method => assert.equal(typeof handlers[method], 'function', `${method} is registered`));
});
