'use strict';

const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { google } = require('googleapis');
const { PDFDocument } = require('pdf-lib');

initializeApp();
const db = getFirestore();
const sessionSecret = defineSecret('SESSION_SECRET');
const REGION = 'us-central1';
const BILLING_TEMPLATE_ID = '15WgKUbeDfE1pmPjA3Zlzt12Vpl-W2Q6Z3togesIZPcQ';
const BILLING_FOLDER_ID = '1_Oe1wkVrp53gq0fOrMCkT0w2a1pjVjvb';
const RECEIPT_FOLDER_ID = '1QnV46twVeqNVJ2b45rYLawk07Lmh1Khf';
const RECEIPT_TEMPLATES = {
  OIL: '1cGtZv_7fv5qkxGLWxjzSUZ_eOSS2KpG4xuJV3aGwy98',
  RENT: '1hb5sMBFLOuTKNn6P8BAzXm9jDrlOP5nA75hH_iXx3xQ',
  NON_OIL: '1C6rMmP4Usqy97C4Klhls0qDZ6MgSZnSIMPZHN1xcYoE'
};

const MONTHS_TH = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม',
  'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function value(data, key, fallback = '') {
  return data && data[key] !== undefined && data[key] !== null ? data[key] : fallback;
}
function number(data, key, fallback = 0) {
  const parsed = Number.parseFloat(value(data, key, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizedDate(raw) {
  if (!raw) return '';
  const text = String(raw).trim().split('T')[0].replace(/[.-]/g, '/');
  const parts = text.split('/');
  if (parts.length !== 3) return text;
  let year, month, day;
  if (parts[0].length === 4) [year, month, day] = parts;
  else [day, month, year] = parts;
  year = Number(year);
  if (year > 2400) year -= 543;
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}
function monthKey(raw) {
  const direct = String(raw || '').trim().match(/^(\d{4})[-/](\d{1,2})$/);
  if (direct) {
    let year = Number(direct[1]);
    if (year > 2400) year -= 543;
    return `${year}-${String(direct[2]).padStart(2, '0')}`;
  }
  const date = normalizedDate(raw);
  const parts = date.split('/');
  return parts.length === 3 ? `${parts[0]}-${parts[1]}` : '';
}
function monthRange(input) {
  const match = String(input || '').match(/^(\d{4})[-/](\d{1,2})$/);
  if (!match) return null;
  let year = Number(match[1]);
  if (year > 2400) year -= 543;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');
  const last = new Date(year, month, 0).getDate();
  return { startDate: `${year}/${mm}/01`, endDate: `${year}/${mm}/${String(last).padStart(2, '0')}` };
}
function safeId(raw) {
  return String(raw || '').trim().replace(/\//g, '-');
}
function docObject(snapshot) {
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}
function numeric(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}
function asDateForPrefix(raw) {
  const date = raw ? new Date(String(raw).replace(/\//g, '-')) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function docSortDate(a, b) {
  return String(b.date || '').localeCompare(String(a.date || ''));
}
function parseToken(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
  const left = Buffer.from(parts[1]);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}
function createToken(user, secret) {
  const payload = Buffer.from(JSON.stringify({
    username: user.username, role: user.role || 'staff',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function authClients() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/presentations']
  });
  return { drive: google.drive({ version: 'v3', auth }), slides: google.slides({ version: 'v1', auth }) };
}
function thaiBahtText(amount) {
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const integerText = n => {
    if (n === 0) return '';
    const s = String(n);
    if (s.length > 6) return integerText(Math.floor(n / 1000000)) + 'ล้าน' + integerText(n % 1000000);
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const d = Number(s[i]), pos = s.length - i - 1;
      if (!d) continue;
      if (pos === 1 && d === 1) out += 'สิบ';
      else if (pos === 1 && d === 2) out += 'ยี่สิบ';
      else if (pos === 0 && d === 1 && s.length > 1) out += 'เอ็ด';
      else out += digits[d] + units[pos];
    }
    return out;
  };
  const fixed = Math.abs(numeric(amount)).toFixed(2).split('.');
  const baht = Number(fixed[0]);
  const satang = Number(fixed[1]);
  return `${integerText(baht) || 'ศูนย์'}บาท${satang ? `${integerText(satang)}สตางค์` : 'ถ้วน'}`;
}
function formatCurrency(val) {
  return numeric(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
async function docs(collection, limit = 10000) {
  const snap = await db.collection(collection).limit(limit).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function dateQuery(collection, start, end, limit = 4000, direction = 'desc') {
  let query = db.collection(collection);
  if (start) query = query.where('date', '>=', String(start).replace(/-/g, '/'));
  if (end) query = query.where('date', '<=', String(end).replace(/-/g, '/'));
  query = query.orderBy('date', direction).limit(Math.min(Number(limit) || 4000, 10000));
  const snap = await query.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function nextCounter(collection, prefix, format, { allocate = false } = {}) {
  const ref = db.collection(collection).doc('current');
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const previous = data.last_prefix === prefix ? numeric(data.last_number) : 0;
    const next = previous + 1;
    if (allocate) tx.set(ref, { last_prefix: prefix, last_number: next }, { merge: true });
    return { prefix, number: next, [format]: `${prefix}-${String(next).padStart(4, '0')}` };
  });
}
function docList(records, fields, defaults = {}) {
  return records.map(doc => {
    const out = { id: doc.id };
    for (const [target, source] of Object.entries(fields)) out[target] = value(doc, source, defaults[target] ?? '');
    return out;
  });
}
async function incrementMonthlySale(data) {
  const key = monthKey(data.date);
  if (!key) return;
  const ref = db.collection('monthly_summary').doc(key);
  const amount = number(data, 'totalAmount');
  const liters = number(data, 'liters', number(data, 'qty'));
  const diesel = String(value(data, 'itemName') + value(data, 'itemType')).includes('ดีเซล');
  const cash = ['เงินสด', 'cash'].includes(value(data, 'paymentType'));
  const credit = value(data, 'paymentType') === 'เงินเชื่อ';
  await ref.set({
    monthKey: key,
    totalSales: FieldValue.increment(amount),
    cashSales: FieldValue.increment(cash ? amount : 0),
    totalLiters: FieldValue.increment(liters),
    liters95: FieldValue.increment(diesel ? 0 : liters),
    litersDiesel: FieldValue.increment(diesel ? liters : 0),
    accountsReceivable: FieldValue.increment(credit ? amount : 0),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}
function stockFuel(data) {
  const key = String(value(data, 'itemName') + value(data, 'category') + value(data, 'itemType')).toLowerCase();
  return key.includes('diesel') || key.includes('ดีเซล') ? 'diesel' : key.includes('95') ? '95' : '';
}
async function updateStock(data, kind, isUpdate = false) {
  const date = normalizedDate(data.date);
  const parts = date.split('/');
  if (parts.length !== 3) return;
  const fuel = stockFuel(data);
  if (!fuel) return;
  const liters = number(data, 'liters', number(data, 'qty'));
  if (!liters) return;
  const dailyId = `${parts[0]}-${parts[1]}-${parts[2]}`;
  const monthlyId = `${parts[0]}-${parts[1]}`;
  const parent = db.collection('oil_stock').doc(fuel);
  const out = kind === 'out';
  const docNo = safeId(value(data, out ? 'saleNo' : 'expenseNo', value(data, 'no')));
  if (!docNo) return;
  const itemRecord = parent.collection(out ? 'exports' : 'imports').doc(docNo);
  const daily = parent.collection(out ? 'daily_summaries' : 'imports_daily_summaries').doc(dailyId);
  const monthly = parent.collection(out ? 'monthly_summaries' : 'imports_monthly_summaries').doc(monthlyId);
  const amount = number(data, out ? 'totalAmount' : 'amount', number(data, 'totalWithVat'));
  const cash = out && String(value(data, 'paymentType')).includes('เงินสด') ? amount : 0;
  await db.runTransaction(async tx => {
    const [itemSnap, daySnap, monthSnap, parentSnap] = await Promise.all([
      tx.get(itemRecord), tx.get(daily), tx.get(monthly), tx.get(parent)
    ]);
    const field = out ? 'totalOut' : 'totalIn';
    const costField = out ? 'cashSales' : 'totalCost';
    const dayData = daySnap.exists ? daySnap.data() : {};
    const monthData = monthSnap.exists ? monthSnap.data() : {};
    const previous = itemSnap.exists ? itemSnap.data() : {};
    const oldLiters = isUpdate ? numeric(previous.liters) : 0;
    const oldValue = isUpdate ? numeric(previous[out ? 'cash' : 'amount']) : 0;
    const deltaLiters = liters - oldLiters;
    const deltaValue = (out ? cash : amount) - oldValue;
    const curParent = parentSnap.exists ? parentSnap.data() : {};
    const totalField = out ? 'totalOut' : 'totalIn';
    const newTotal = Math.max(0, numeric(curParent[totalField]) + deltaLiters);
    tx.set(itemRecord, out ? {
      saleNo: value(data, 'saleNo'), date, liters, paymentType: value(data, 'paymentType', 'เงินสด'),
      cash, updatedAt: new Date().toISOString()
    } : {
      expenseNo: value(data, 'expenseNo'), date, liters, pricePerLiter: number(data, 'pricePerLiter'),
      amount, updatedAt: new Date().toISOString()
    });
    tx.set(daily, {
      date, fuelType: fuel, [field]: Math.max(0, numeric(dayData[field]) + deltaLiters),
      [costField]: Math.max(0, numeric(dayData[costField]) + deltaValue),
      recordCount: numeric(dayData.recordCount) + (isUpdate ? 0 : 1), lastUpdated: new Date().toISOString()
    }, { merge: true });
    tx.set(monthly, {
      month: `${parts[0]}/${parts[1]}`, fuelType: fuel, [field]: Math.max(0, numeric(monthData[field]) + deltaLiters),
      [costField]: Math.max(0, numeric(monthData[costField]) + deltaValue),
      recordCount: numeric(monthData.recordCount) + (isUpdate ? 0 : 1), lastUpdated: new Date().toISOString()
    }, { merge: true });
    const initial = numeric(curParent.initialStock), oppositeTotal = numeric(curParent[out ? 'totalIn' : 'totalOut']);
    tx.set(parent, { [totalField]: newTotal, currentStock: initial + (out ? oppositeTotal - newTotal : newTotal - oppositeTotal), updatedAt: new Date().toISOString() }, { merge: true });
  });
}
async function removeStockRecord(data, kind) {
  const date = normalizedDate(data.date), parts = date.split('/');
  const fuel = stockFuel(data), out = kind === 'out';
  const docNo = safeId(value(data, out ? 'saleNo' : 'expenseNo', value(data, 'no')));
  if (parts.length !== 3 || !fuel || !docNo) return;

  const parent = db.collection('oil_stock').doc(fuel);
  const itemRecord = parent.collection(out ? 'exports' : 'imports').doc(docNo);
  const daily = parent.collection(out ? 'daily_summaries' : 'imports_daily_summaries').doc(`${parts[0]}-${parts[1]}-${parts[2]}`);
  const monthly = parent.collection(out ? 'monthly_summaries' : 'imports_monthly_summaries').doc(`${parts[0]}-${parts[1]}`);
  await db.runTransaction(async tx => {
    const [itemSnap, daySnap, monthSnap, parentSnap] = await Promise.all([
      tx.get(itemRecord), tx.get(daily), tx.get(monthly), tx.get(parent)
    ]);
    if (!itemSnap.exists) return;

    const item = itemSnap.data(), dayData = daySnap.exists ? daySnap.data() : {};
    const monthData = monthSnap.exists ? monthSnap.data() : {};
    const parentData = parentSnap.exists ? parentSnap.data() : {};
    const field = out ? 'totalOut' : 'totalIn';
    const costField = out ? 'cashSales' : 'totalCost';
    const liters = numeric(item.liters), amount = numeric(item[out ? 'cash' : 'amount']);
    const totalIn = Math.max(0, numeric(parentData.totalIn) - (out ? 0 : liters));
    const totalOut = Math.max(0, numeric(parentData.totalOut) - (out ? liters : 0));
    const now = new Date().toISOString();

    tx.delete(itemRecord);
    tx.set(daily, {
      date, fuelType: fuel, [field]: Math.max(0, numeric(dayData[field]) - liters),
      [costField]: Math.max(0, numeric(dayData[costField]) - amount),
      recordCount: Math.max(0, numeric(dayData.recordCount) - 1), lastUpdated: now
    }, { merge: true });
    tx.set(monthly, {
      month: `${parts[0]}/${parts[1]}`, fuelType: fuel, [field]: Math.max(0, numeric(monthData[field]) - liters),
      [costField]: Math.max(0, numeric(monthData[costField]) - amount),
      recordCount: Math.max(0, numeric(monthData.recordCount) - 1), lastUpdated: now
    }, { merge: true });
    tx.set(parent, {
      totalIn, totalOut, currentStock: numeric(parentData.initialStock) + totalIn - totalOut, updatedAt: now
    }, { merge: true });
  });
}
async function updateBuyerSalesSummary(buyerName, itemName, liters, totalAmount, isUpdate) {
  if (!buyerName || liters <= 0 || isUpdate) return;
  const item = String(itemName || '').toLowerCase();
  const oilKey = item.includes('95') ? '95' : (item.includes('ดีเซล') || item.includes('diesel') ? 'diesel' : '');
  if (!oilKey) return;
  const matches = await db.collection('buyer').where('name', '==', String(buyerName).trim()).limit(1).get();
  const fallback = matches.empty ? await db.collection('buyer').where('fullname', '==', String(buyerName).trim()).limit(1).get() : matches;
  if (fallback.empty) return;
  const buyerRef = fallback.docs[0].ref;
  const current = fallback.docs[0].get('salesSummary') || {};
  const summary = current[oilKey] || {};
  await buyerRef.set({
    salesSummary: {
      ...current,
      [oilKey]: { totalLiters: numeric(summary.totalLiters) + liters, totalAmount: numeric(summary.totalAmount) + totalAmount, lastUpdated: new Date().toISOString() },
      [oilKey === '95' ? 'diesel' : '95']: current[oilKey === '95' ? 'diesel' : '95'] || { totalLiters: 0, totalAmount: 0 }
    }
  }, { merge: true });
}
async function recalculateBuyerSalesSummary(buyerName) {
  const name = String(buyerName || '').trim();
  if (!name) return;
  const [byName, byFullname, sales] = await Promise.all([
    db.collection('buyer').where('name', '==', name).limit(1).get(),
    db.collection('buyer').where('fullname', '==', name).limit(1).get(),
    db.collection('sales_records').where('buyerName', '==', name).get()
  ]);
  const buyer = byName.docs[0] || byFullname.docs[0];
  if (!buyer) return;
  const totals = { '95': { totalLiters: 0, totalAmount: 0 }, diesel: { totalLiters: 0, totalAmount: 0 } };
  sales.docs.forEach(doc => {
    const sale = doc.data();
    const item = String(sale.itemName || sale.itemType || '').toLowerCase();
    const key = item.includes('95') ? '95' : item.includes('diesel') || item.includes('ดีเซล') ? 'diesel' : '';
    if (!key) return;
    totals[key].totalLiters += numeric(sale.liters || sale.qty);
    totals[key].totalAmount += numeric(sale.totalAmount);
  });
  const updatedAt = new Date().toISOString();
  totals['95'].lastUpdated = updatedAt;
  totals.diesel.lastUpdated = updatedAt;
  await buyer.ref.set({ salesSummary: totals }, { merge: true });
}
async function updateMonthlyExpense(data) {
  const key = monthKey(data.date);
  if (!key) return;
  const amount = number(data, 'totalWithVat', number(data, 'amount'));
  const cost = String(value(data, 'category') + value(data, 'itemName')).includes('ซื้อน้ำมัน') ||
    String(value(data, 'itemName')).includes('95') || String(value(data, 'itemName')).includes('ดีเซล');
  const transfer = ['เงินโอน', 'transfer'].includes(String(value(data, 'paymentType')).trim());
  const ref = db.collection('monthly_summary').doc(key);
  await ref.set({
    monthKey: key, totalExpenses: FieldValue.increment(amount),
    [cost ? 'costExpenses' : 'otherExpenses']: FieldValue.increment(amount),
    transferTotal: FieldValue.increment(transfer ? amount : 0),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}
async function recalculateMonthlySummary(rawDate) {
  const key = monthKey(rawDate), range = monthRange(key);
  if (!range) return;
  const [sales, expenses] = await Promise.all([
    dateQuery('sales_records', range.startDate, range.endDate, 3000),
    dateQuery('expense_records', range.startDate, range.endDate, 3000)
  ]);
  const totals = { totalSales: 0, cashSales: 0, totalExpenses: 0, costExpenses: 0, otherExpenses: 0, totalLiters: 0, liters95: 0, litersDiesel: 0, accountsReceivable: 0, transferTotal: 0 };
  sales.forEach(sale => {
    const amount = numeric(sale.totalAmount), liters = numeric(sale.liters || sale.qty);
    const diesel = String(sale.itemName || sale.itemType || '').includes('ดีเซล');
    const paymentType = String(sale.paymentType || '').trim(), status = String(sale.paymentStatus || 'unpaid').trim();
    totals.totalSales += amount;
    if (paymentType === 'เงินสด' || paymentType === 'cash') totals.cashSales += amount;
    totals.totalLiters += liters;
    totals[diesel ? 'litersDiesel' : 'liters95'] += liters;
    if ((paymentType === 'เงินเชื่อ' || paymentType === 'credit') && status !== 'paid') totals.accountsReceivable += amount;
  });
  expenses.forEach(expense => {
    const amount = numeric(expense.totalWithVat || expense.amount);
    const category = String(expense.category || ''), itemName = String(expense.itemName || '');
    totals.totalExpenses += amount;
    if (category.includes('ซื้อน้ำมัน') || itemName.includes('95') || itemName.includes('ดีเซล')) totals.costExpenses += amount;
    else totals.otherExpenses += amount;
    if (expense.paymentType === 'เงินโอน' || expense.transferStatus === 'transferred') totals.transferTotal += amount;
  });
  await db.collection('monthly_summary').doc(key).set({ monthKey: key, ...totals, updatedAt: new Date().toISOString() }, { merge: true });
}
async function patchDoc(collection, id, updates) {
  await db.collection(collection).doc(id).set({ ...updates }, { merge: true });
}

const handlers = {
  async checkLogin(username, password) {
    const userSnap = await db.collection('users').where('username', '==', String(username || '')).limit(1).get();
    const userDoc = userSnap.docs.find(d => d.get('password') === password);
    if (!userDoc) return { success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง (ข้อมูลไม่ตรงกับใน Firestore)' };
    const user = userDoc.data();
    const result = { username: user.username, name: user.name || user.username, role: user.role || 'staff' };
    return { success: true, user: result, token: createToken(result, sessionSecret.value()) };
  },
  async getBuyers() {
    const list = (await docs('buyer')).filter(x => x.name || x.fullname).map(x => ({
      id: x.id, name: x.name || '', fullname: x.fullname || '', taxid: x.taxid || '', address: x.address || ''
    })).sort((a, b) => (a.name || a.fullname).localeCompare(b.name || b.fullname, 'th'));
    return { success: true, data: list };
  },
  async saveBuyerRecord(data) {
    await db.collection('buyer').add({ name: value(data, 'name'), fullname: value(data, 'fullname'), taxid: value(data, 'taxid'), address: value(data, 'address'), createdAt: new Date().toISOString() });
    return { success: true, message: 'บันทึกรายชื่อผู้ซื้อเรียบร้อยแล้ว' };
  },
  async getNextSaleNo(dateStr) {
    const date = asDateForPrefix(dateStr), prefix = `SB${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear() + 543).slice(-2)}`;
    const ref = db.collection('sales_no').doc('current'), snap = await ref.get(), state = snap.exists ? snap.data() : {};
    const num = state.last_prefix === prefix ? numeric(state.last_number) + 1 : 1;
    return { success: true, saleNo: `${prefix}-${String(num).padStart(4, '0')}`, prefix, number: num };
  },
  async saveSaleRecord(data) {
    if (!data) return { success: false, message: 'ไม่พบข้อมูลที่ส่งมาบันทึก' };
    const update = Boolean(data.docId), now = new Date().toISOString();
    let saleNo = data.saleNo || '', receiptNo = data.receiptNo || '', docId = data.docId;
    if (!update) {
      const date = asDateForPrefix(data.date), prefix = `SB${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear() + 543).slice(-2)}`;
      const allocation = await db.runTransaction(async tx => {
        const saleRef = db.collection('sales_no').doc('current'), receiptRef = db.collection('receipt_no').doc('current');
        const [saleSnap, receiptSnap] = await Promise.all([tx.get(saleRef), tx.get(receiptRef)]);
        const tracker = saleSnap.exists ? saleSnap.data() : {};
        const seq = tracker.last_prefix === prefix ? numeric(tracker.last_number) + 1 : 1;
        tx.set(saleRef, { last_prefix: prefix, last_number: seq }, { merge: true });
        const r = receiptSnap.exists ? receiptSnap.data() : {};
        let rPrefix = numeric(r.last_prefix || 315), rNum = numeric(r.last_number) + 1;
        if (rNum > 50) { rPrefix++; rNum = 1; }
        tx.set(receiptRef, { last_prefix: rPrefix, last_number: rNum, updatedAt: new Date().toISOString() }, { merge: true });
        return { saleNo: `${prefix}-${String(seq).padStart(4, '0')}`, receiptNo: `${rPrefix}/${rNum}` };
      });
      saleNo = allocation.saleNo; receiptNo = allocation.receiptNo; docId = safeId(saleNo);
    }
    if (!docId) return { success: false, message: 'รหัสเอกสาร (docId) ไม่ถูกต้อง' };
    const saleRef = db.collection('sales_records').doc(docId);
    const previousSnap = update ? await saleRef.get() : null;
    const previous = previousSnap && previousSnap.exists ? previousSnap.data() : null;
    const record = {
      saleNo, receiptNo, date: String(value(data, 'date')).replace(/-/g, '/').trim(),
      buyerName: value(data, 'buyerName'), itemType: value(data, 'itemType', 'น้ำมัน'),
      itemName: value(data, 'itemName', 'น้ำมัน'), pricePerLiter: number(data, 'pricePerLiter'),
      liters: number(data, 'liters'), qty: number(data, 'qty'), unitPrice: number(data, 'unitPrice'),
      precision: Number.parseInt(value(data, 'precision', 2), 10) || 2, totalAmount: number(data, 'totalAmount'),
      paymentType: value(data, 'paymentType', 'เงินสด'), remarks: value(data, 'remarks'),
      recordedBy: value(data, 'recordedBy', 'system'), updatedAt: now
    };
    if (!update) Object.assign(record, { createdAt: now, isBilled: false, isReceiptIssued: false, paymentStatus: record.paymentType === 'เงินเชื่อ' ? 'unpaid' : 'paid' });
    else {
      for (const key of ['createdAt', 'isBilled', 'isReceiptIssued', 'paymentStatus']) if (data[key] !== undefined) record[key] = data[key];
    }
    await saleRef.set(record, { merge: update });
    try {
      const oldFuel = previous ? stockFuel(previous) : '';
      const newFuel = stockFuel(record);
      const sameStockEntry = Boolean(previous && oldFuel && oldFuel === newFuel &&
        normalizedDate(previous.date) === normalizedDate(record.date) &&
        safeId(previous.saleNo || previous.no) === safeId(record.saleNo));
      if (previous && oldFuel && !sameStockEntry) await removeStockRecord(previous, 'out');
      if (newFuel && (record.liters || record.qty)) {
        await updateStock({ ...record, liters: record.liters || record.qty }, 'out', sameStockEntry);
      }

      if (previous) {
        await recalculateMonthlySummary(previous.date);
        if (monthKey(previous.date) !== monthKey(record.date)) await recalculateMonthlySummary(record.date);
        await recalculateBuyerSalesSummary(previous.buyerName);
        if (previous.buyerName !== record.buyerName) await recalculateBuyerSalesSummary(record.buyerName);
      } else {
        await incrementMonthlySale(record);
        await updateBuyerSalesSummary(record.buyerName, record.itemName, record.liters || record.qty, record.totalAmount, false);
      }
    } catch (error) {
      console.error('Sale summary update failed', error);
      return { success: false, message: `บันทึกรายการแล้ว แต่ปรับสรุปหรือสต็อกไม่สำเร็จ: ${error.message || String(error)}` };
    }
    return { success: true, message: 'บันทึกสำเร็จ', saleNo, receiptNo, docId };
  },
  async getSalesRecordsRange(startDate, endDate, limitVal) {
    const rows = await dateQuery('sales_records', startDate, endDate, limitVal || 4000);
    return { success: true, data: rows.map(x => ({
      id: x.id, saleNo: x.saleNo || '', date: x.date || '', buyerName: x.buyerName || '',
      itemType: x.itemType || 'น้ำมัน', itemName: x.itemName || '', pricePerLiter: numeric(x.pricePerLiter),
      liters: numeric(x.liters), qty: numeric(x.qty), unitPrice: numeric(x.unitPrice), precision: Number(x.precision) || 2,
      totalAmount: numeric(x.totalAmount), paymentType: x.paymentType || 'เงินสด', remarks: x.remarks || ''
    })) };
  },
  async deleteSaleRecord(docId) {
    const ref = db.collection('sales_records').doc(String(docId));
    const snap = await ref.get();
    if (snap.exists) {
      const sale = snap.data();
      if (stockFuel(sale)) await removeStockRecord(sale, 'out');
      await ref.delete();
      await recalculateMonthlySummary(sale.date);
      await recalculateBuyerSalesSummary(sale.buyerName);
    } else {
      await ref.delete();
    }
    return { success: true, message: 'ลบเรียบร้อย' };
  },
  async getNextExpenseNo(dateStr) {
    const date = asDateForPrefix(dateStr), prefix = `SBEXP${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear() + 543).slice(-2)}`;
    const ref = db.collection('expense_no').doc('current'), snap = await ref.get(), state = snap.exists ? snap.data() : {};
    const num = state.last_prefix === prefix ? numeric(state.last_number) + 1 : 1;
    return { success: true, expenseNo: `${prefix}-${String(num).padStart(4, '0')}`, prefix, number: num };
  },
  async getExpenseRecordsRange(startDate, endDate, limitVal) {
    const rows = await dateQuery('expense_records', startDate, endDate, limitVal || 3000);
    return { success: true, data: rows.map(x => ({
      id: x.id, expenseNo: x.expenseNo || '', date: x.date || '', category: x.category || '', itemName: x.itemName || '',
      payeeName: x.payeeName || '', pricePerLiter: numeric(x.pricePerLiter), liters: numeric(x.liters),
      amount: numeric(x.amount), amountBeforeVat: numeric(x.amountBeforeVat), vatAmount: numeric(x.vatAmount),
      totalWithVat: numeric(x.totalWithVat), paymentType: x.paymentType || 'เงินสด', transferAccount: x.transferAccount || '',
      remarks: x.remarks || '', isRequisition: Boolean(x.isRequisition), requisitionNo: x.requisitionNo || '',
      requisitionDate: x.requisitionDate || '', transferNo: x.transferNo || '', transferDate: x.transferDate || ''
    })) };
  },
  async deleteExpenseRecord(docId) {
    const ref = db.collection('expense_records').doc(String(docId));
    const snap = await ref.get();
    if (snap.exists) {
      const expense = snap.data();
      if (stockFuel(expense)) await removeStockRecord(expense, 'in');
      await ref.delete();
      await recalculateMonthlySummary(expense.date);
    } else {
      await ref.delete();
    }
    return { success: true, message: 'ลบเรียบร้อย' };
  },
  async getTransferAccounts() {
    const list = (await docs('transfer')).filter(x => x.name).map(x => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return { success: true, data: list };
  },
  async saveExpenseRecord(data) {
    if (!data) return { success: false, message: 'ไม่พบข้อมูลที่ส่งมาบันทึก' };
    const update = Boolean(data.docId), now = new Date().toISOString();
    let expenseNo = data.expenseNo || '', docId = data.docId;
    if (!update) {
      const date = asDateForPrefix(data.date), prefix = `SBEXP${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear() + 543).slice(-2)}`;
      const seq = await db.runTransaction(async tx => {
        const ref = db.collection('expense_no').doc('current'), snap = await tx.get(ref), old = snap.exists ? snap.data() : {};
        const n = old.last_prefix === prefix ? numeric(old.last_number) + 1 : 1;
        tx.set(ref, { last_prefix: prefix, last_number: n }, { merge: true }); return n;
      });
      expenseNo = `${prefix}-${String(seq).padStart(4, '0')}`; docId = safeId(expenseNo);
    }
    if (!docId) return { success: false, message: 'รหัสเอกสาร (docId) ไม่ถูกต้อง' };
    const expenseRef = db.collection('expense_records').doc(docId);
    const previousSnap = update ? await expenseRef.get() : null;
    const previous = previousSnap && previousSnap.exists ? previousSnap.data() : null;
    const record = {
      expenseNo, date: normalizedDate(value(data, 'date')) || value(data, 'date'), category: value(data, 'category'), itemName: value(data, 'itemName'),
      payeeName: value(data, 'payeeName'), pricePerLiter: number(data, 'pricePerLiter'), liters: number(data, 'liters'),
      amount: number(data, 'amount'), amountBeforeVat: number(data, 'amountBeforeVat'), vatAmount: number(data, 'vatAmount'),
      totalWithVat: number(data, 'totalWithVat'), paymentType: value(data, 'paymentType', 'เงินสด'),
      transferAccount: value(data, 'transferAccount'), transferDate: value(data, 'transferDate'), remarks: value(data, 'remarks'),
      recordedBy: value(data, 'recordedBy', 'system'), updatedAt: now
    };
    if (!update) record.createdAt = now;
    else if (data.createdAt) record.createdAt = data.createdAt;
    await expenseRef.set(record, { merge: update });
    try {
      const oldFuel = previous ? stockFuel(previous) : '';
      const newFuel = stockFuel(record);
      const sameStockEntry = Boolean(previous && oldFuel && oldFuel === newFuel &&
        normalizedDate(previous.date) === normalizedDate(record.date) &&
        safeId(previous.expenseNo || previous.no) === safeId(record.expenseNo));
      if (previous && oldFuel && !sameStockEntry) await removeStockRecord(previous, 'in');
      if (newFuel) await updateStock(record, 'in', sameStockEntry);

      if (previous) {
        await recalculateMonthlySummary(previous.date);
        if (monthKey(previous.date) !== monthKey(record.date)) await recalculateMonthlySummary(record.date);
      } else {
        await updateMonthlyExpense(record);
      }
      if (!previous && ['เงินโอน', 'transfer'].includes(record.paymentType)) {
        await db.collection('transfer_records').add({
          date: record.transferDate || record.date, fromAccount: record.transferAccount || '-',
          amount: number(record, 'totalWithVat', number(record, 'amount')),
          remarks: record.remarks || record.itemName || '-',
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Expense summary update failed', error);
      return { success: false, message: `บันทึกรายการแล้ว แต่ปรับสรุปหรือสต็อกไม่สำเร็จ: ${error.message || String(error)}` };
    }
    return { success: true, message: 'บันทึกสำเร็จ', expenseNo, docId };
  },
  async savePayRecord(data) {
    const name = String(value(data, 'name')).trim();
    if (!name) return { success: false, message: 'กรุณาระบุชื่อรายการ' };
    await db.collection('pay_record').doc(`PAY_${crypto.randomUUID().slice(0, 8)}`).set({ name });
    return { success: true, message: 'บันทึกรายการสำเร็จ', name };
  },
  async getPayRecords() {
    const list = (await docs('pay_record')).filter(x => x.name).map(x => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return { success: true, data: list };
  },
  async getUnpaidSalesRecords(startDate, endDate, buyerFilter) {
    const snap = await db.collection('sales_records').where('paymentStatus', '==', 'unpaid').where('isBilled', '==', false).limit(10000).get();
    const start = normalizedDate(startDate || '2000/01/01'), end = normalizedDate(endDate || '2099/12/31');
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => {
      const date = normalizedDate(x.date);
      return (!date || (date >= start && date <= end)) && (!buyerFilter || buyerFilter === 'ALL' || x.buyerName === buyerFilter);
    }).map(x => ({
      id: x.id, saleNo: x.saleNo || x.id, date: x.date || '-', buyerName: String(x.buyerName || '').trim(),
      itemType: x.itemType || 'น้ำมัน', itemName: x.itemName || 'น้ำมัน', pricePerLiter: numeric(x.pricePerLiter),
      liters: numeric(x.liters), qty: numeric(x.qty || x.liters), unitPrice: numeric(x.unitPrice || x.pricePerLiter),
      totalAmount: numeric(x.totalAmount), paymentType: x.paymentType || 'เงินเชื่อ',
      paymentStatus: x.paymentStatus || 'unpaid', isBilled: false, remarks: x.remarks || ''
    }));
    return { success: true, data };
  },
  async getBuyerByName(buyerName) {
    const result = await handlers.getBuyers();
    const found = result.data.find(b => b.name === String(buyerName || '').trim() || b.fullname === String(buyerName || '').trim());
    return found ? { success: true, data: found } : { success: false, message: 'ไม่พบข้อมูลผู้ซื้อ' };
  },
  async getNextBillNo(dateStr) {
    const normalized = normalizedDate(dateStr), date = normalized ? new Date(normalized.replace(/\//g, '-')) : asDateForPrefix();
    const prefix = `SBBS${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear() + 543).slice(-2)}`;
    const current = await db.collection('bill_no').doc('current').get();
    let num = current.exists && current.get('last_prefix') === prefix ? numeric(current.get('last_number')) + 1 : 1;
    if (num === 1) {
      const snap = await db.collection('billing_notes').where('billNo', '>=', `${prefix}-0000`).limit(10000).get();
      snap.docs.forEach(d => {
        const seq = Number((d.get('billNo') || '').split('-')[1]);
        if (Number.isFinite(seq)) num = Math.max(num, seq + 1);
      });
    }
    return { success: true, billNo: `${prefix}-${String(num).padStart(4, '0')}`, prefix, number: num };
  },
  async confirmBilling(saleIds, billDateStr, billingData = {}) {
    if (!Array.isArray(saleIds) || !saleIds.length) return { success: false, message: 'ไม่มีรายการที่เลือก' };
    const info = await handlers.getNextBillNo(billDateStr), billDate = normalizedDate(billDateStr) || billDateStr;
    const ref = db.collection('billing_notes').doc(info.billNo);
    const batch = db.batch();
    batch.set(ref, {
      billNo: info.billNo, billDate, buyerName: billingData.buyerName || '', buyerTaxId: billingData.buyerTaxId || '',
      buyerAddress: billingData.buyerAddress || '', subtotal: numeric(billingData.subtotal), vatAmount: numeric(billingData.vatAmount),
      grandTotal: numeric(billingData.grandTotal), status: 'ISSUED', saleNos: billingData.saleNos || [],
      saleNosSummary: (billingData.saleNos || []).join(', '), createdAt: new Date().toISOString()
    });
    saleIds.forEach(id => batch.set(db.collection('sales_records').doc(String(id)), {
      isBilled: true, billNo: info.billNo, billDate, updatedAt: new Date().toISOString()
    }, { merge: true }));
    batch.set(db.collection('bill_no').doc('current'), { last_prefix: info.prefix, last_number: info.number }, { merge: true });
    await batch.commit();
    return { success: true, message: 'ออกใบวางบิลสำเร็จ', billNo: info.billNo };
  },
  async getExpenseRecordsForClaim(startDate, endDate, statusFilter) {
    let rows = await dateQuery('expense_records', startDate || '2000/01/01', endDate || '2099/12/31', 3000);
    if (!rows.length) rows = await docs('expense_records', 3000);
    const claimed = statusFilter === 'claimed', start = normalizedDate(startDate || '2000/01/01'), end = normalizedDate(endDate || '2099/12/31');
    const data = rows.filter(x => {
      const d = normalizedDate(x.date), isReq = x.isRequisition === true || Boolean(String(x.requisitionNo || x.claimNo || '').trim());
      return (!d || d >= start && d <= end) && isReq === claimed;
    }).map(x => ({
      id: x.id, expenseNo: x.expenseNo || x.no || x.id, date: x.date || '-',
      category: x.category || x.itemName || 'ค่าใช้จ่ายทั่วไป', description: x.remarks || x.payeeName || '-',
      totalAmount: numeric(x.totalWithVat || x.amount), isRequisition: Boolean(x.isRequisition),
      claimNo: x.requisitionNo || x.claimNo || '', remarks: x.remarks || ''
    }));
    return { success: true, data };
  },
  async getNextClaimNo() {
    const date = new Date(), prefix = `SBCE${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getFullYear() + 543).slice(-2)}-`;
    const snap = await db.collection('claim_records').limit(10000).get();
    let max = 0;
    snap.docs.forEach(d => { const s = String(d.get('claimNo') || ''); if (s.startsWith(prefix)) max = Math.max(max, Number(s.slice(prefix.length)) || 0); });
    return { success: true, claimNo: `${prefix}${String(max + 1).padStart(4, '0')}` };
  },
  async confirmClaim(expenseIds, claimDateStr, claimData = {}) {
    if (!Array.isArray(expenseIds) || !expenseIds.length) return { success: false, message: 'กรุณาเลือกรายการที่ต้องการตั้งเบิก' };
    const info = await handlers.getNextClaimNo(), claimNo = info.claimNo, batch = db.batch();
    batch.set(db.collection('claim_records').doc(claimNo), {
      claimNo, claimDate: claimDateStr, totalAmount: numeric(claimData.grandTotal), itemCount: expenseIds.length,
      expenseNos: claimData.expenseNos || [], createdAt: new Date().toISOString()
    });
    expenseIds.forEach(id => batch.set(db.collection('expense_records').doc(String(id)), { isRequisition: true, claimNo }, { merge: true }));
    await batch.commit();
    return { success: true, claimNo };
  },
  async getOilStockData(targetDate) {
    const target = normalizedDate(targetDate || new Date().toISOString().slice(0, 10)), [year, month, day] = target.split('/');
    if (!day) return { success: false, message: 'รูปแบบวันที่ไม่ถูกต้อง' };
    const dateKey = `${year}-${month}-${day}`, monthKey = `${year}/${month}`, monthStart = `${year}/${month}/01`;
    const summary = async fuel => {
      const parent = db.collection('oil_stock').doc(fuel), parentDoc = await parent.get();
      const dayIn = await parent.collection('imports_daily_summaries').doc(dateKey).get();
      const dayOut = await parent.collection('daily_summaries').doc(dateKey).get();
      const [inMonths, inDays, outMonths, outDays] = await Promise.all([
        parent.collection('imports_monthly_summaries').get(), parent.collection('imports_daily_summaries').get(),
        parent.collection('monthly_summaries').get(), parent.collection('daily_summaries').get()
      ]);
      const sumBefore = (snap, field, key, cutoff, monthOnly) => snap.docs.reduce((acc, d) => {
        const data = d.data(), valueKey = data[monthOnly ? 'month' : 'date'] || '';
        return valueKey && valueKey < cutoff ? acc + numeric(data[field]) : acc;
      }, 0);
      const cumulativeIn = sumBefore(inMonths, 'totalIn', 'month', monthKey, true) +
        inDays.docs.reduce((a, d) => { const x = d.data(); return x.date >= monthStart && x.date <= target ? a + numeric(x.totalIn) : a; }, 0);
      const cumulativeOut = sumBefore(outMonths, 'totalOut', 'month', monthKey, true) +
        outDays.docs.reduce((a, d) => { const x = d.data(); return x.date >= monthStart && x.date <= target ? a + numeric(x.totalOut) : a; }, 0);
      return {
        initialStock: numeric(parentDoc.get('initialStock')), totalIn: numeric(dayIn.get('totalIn')),
        totalOut: numeric(dayOut.get('totalOut')), cashSales: numeric(dayOut.get('cashSales')),
        currentStock: numeric(parentDoc.get('initialStock')) + cumulativeIn - cumulativeOut
      };
    };
    const [stock95, stockDiesel] = await Promise.all([summary('95'), summary('diesel')]);
    return { success: true, stock95, stockDiesel };
  },
  async setInitialOilStock(initial95, initialDiesel) {
    const stock = await handlers.getOilStockData();
    const values = [
      ['95', numeric(initial95), stock.stock95 || {}],
      ['diesel', numeric(initialDiesel), stock.stockDiesel || {}]
    ];
    await Promise.all(values.map(([fuel, initialStock, current]) => db.collection('oil_stock').doc(fuel).set({
      initialStock, totalIn: numeric(current.totalIn), totalOut: numeric(current.totalOut),
      currentStock: initialStock + numeric(current.totalIn) - numeric(current.totalOut),
      updatedAt: new Date().toISOString()
    }, { merge: true })));
    return { success: true, message: 'บันทึกสต็อกตั้งต้นเรียบร้อยแล้ว' };
  },
  async getCreditSalesByMonth(yearMonth, buyerFilter) {
    const range = monthRange(yearMonth);
    if (!range) return { success: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };
    const rows = await docs('sales_records');
    const data = rows.filter(x => {
      const d = normalizedDate(x.date), type = x.paymentType || '', status = x.paymentStatus || 'unpaid';
      return d >= range.startDate && d <= range.endDate && (!buyerFilter || buyerFilter === 'ALL' || x.buyerName === buyerFilter) && (type === 'เงินเชื่อ' || status === 'unpaid');
    }).map(x => ({
      docId: x.id, saleNo: x.saleNo || x.id, date: x.date || '-', buyerName: x.buyerName || '-',
      pricePerLiter: numeric(x.pricePerLiter), unitPrice: numeric(x.unitPrice), liters: numeric(x.liters), qty: numeric(x.qty),
      totalAmount: numeric(x.totalAmount), paymentStatus: x.paymentStatus || 'unpaid', paidDate: x.paidDate || '',
      remarks: x.remarks || '', updatedAt: x.updatedAt || ''
    })).sort(docSortDate);
    return { success: true, data };
  },
  async updateSalePaymentStatus(docId, paidDate, saleDate) {
    if (!docId) return { success: false, message: 'ไม่พบรหัสเอกสาร' };
    await patchDoc('sales_records', docId, { paymentStatus: 'paid', paidDate: paidDate || new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() });
    await recalculateMonthlySummary(saleDate || paidDate);
    return { success: true, message: 'อัปเดตเรียบร้อย' };
  },
  async getCompanyExpensesByMonth(yearMonth) {
    const range = monthRange(yearMonth);
    if (!range) return { success: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };
    const rows = await dateQuery('expense_records', range.startDate, range.endDate, 3000);
    return { success: true, data: rows.map(x => ({
      docId: x.id, expenseNo: x.expenseNo || x.id, date: x.date || '', category: x.category || '-',
      payeeName: x.payeeName || x.itemName || '-', itemName: x.itemName || '-',
      totalWithVat: numeric(x.totalWithVat || x.amount), amount: numeric(x.amount),
      paymentType: x.paymentType || 'เงินสด', transferStatus: x.transferStatus || (x.transferDate ? 'transferred' : 'pending'),
      transferAccount: x.transferAccount || '', transferDate: x.transferDate || '', updatedAt: x.updatedAt || ''
    })) };
  },
  async updateExpenseTransferStatus(docId, transferAccount, transferDate, expDate) {
    if (!docId) return { success: false, message: 'ไม่พบรหัสเอกสาร' };
    const ref = db.collection('expense_records').doc(docId), snap = await ref.get(), data = snap.exists ? snap.data() : {};
    const date = transferDate || new Date().toISOString().slice(0, 10), amount = numeric(data.totalWithVat || data.amount);
    await ref.set({ paymentType: 'เงินโอน', transferStatus: 'transferred', transferAccount, transferDate: date, updatedAt: new Date().toISOString() }, { merge: true });
    await db.collection('transfer_records').add({ date, fromAccount: transferAccount, amount, remarks: data.itemName || data.category || 'โอนจ่ายค่าใช้จ่าย' });
    await recalculateMonthlySummary(expDate || transferDate);
    return { success: true, message: 'บันทึกเรียบร้อย' };
  },
  async getFinancialSummaryData(selectedYear) {
    let year = Number.parseInt(selectedYear, 10) || 2026;
    if (year > 2400) year -= 543;
    const [capitalSnap, monthlyDocs, sales, expenses, transfers] = await Promise.all([
      db.collection('settings').doc('capital').get(), docs('monthly_summary'), docs('sales_records'),
      docs('expense_records'), (async () => {
        const a = await db.collection('transfer_records').get();
        return a.empty ? docs('transfers') : a.docs.map(d => ({ id: d.id, ...d.data() }));
      })()
    ]);
    const capital = capitalSnap.exists ? capitalSnap.data() : {}, monthly = {}, valid = new Set();
    for (let i = 0; i < 12; i++) {
      let m = 10 + i, y = year;
      if (m > 12) { m -= 12; y++; }
      const key = `${y}-${String(m).padStart(2, '0')}`; valid.add(key);
      monthly[key] = { monthKey: key, yearBE: y + 543, monthName: MONTHS_TH[m], sales: 0, cashSales: 0, expenses: 0, cost: 0, otherExp: 0, liters: 0, liters95: 0, litersDiesel: 0, ar: 0, transferTotal: 0 };
    }
    monthlyDocs.forEach(x => {
      const key = monthKey(x.monthKey || x.yearMonth || x.id);
      if (!monthly[key]) return;
      Object.assign(monthly[key], {
        sales: numeric(x.totalSales || x.sales), cashSales: numeric(x.cashSales || x.cash_sales),
        expenses: numeric(x.totalExpenses || x.expenses), cost: numeric(x.costExpenses || x.cost),
        otherExp: numeric(x.otherExpenses || x.otherExp), liters95: numeric(x.liters95),
        litersDiesel: numeric(x.litersDiesel), liters: numeric(x.totalLiters || x.liters || numeric(x.liters95) + numeric(x.litersDiesel)),
        ar: numeric(x.accountsReceivable || x.ar), transferTotal: numeric(x.transferTotal || x.transfer_total)
      });
    });
    let cashFallback = 0;
    sales.forEach(x => {
      const key = monthKey(x.date), row = monthly[key], amount = numeric(x.totalAmount), liters = numeric(x.liters || x.qty);
      if (!row) return;
      if (['เงินสด', 'cash'].includes(x.paymentType)) { cashFallback += amount; if (!row.cashSales) row.cashSales += amount; }
      if (!row.sales && amount) {
        row.sales += amount; row.liters += liters;
        if (String(x.itemName || x.itemType).includes('ดีเซล')) row.litersDiesel += liters; else row.liters95 += liters;
        if (x.paymentType === 'เงินเชื่อ' || x.paymentStatus === 'unpaid') row.ar += amount;
      }
    });
    expenses.forEach(x => {
      const row = monthly[monthKey(x.date)], amount = numeric(x.totalWithVat || x.amount);
      if (!row || row.expenses || !amount) return;
      row.expenses += amount;
      if (/ซื้อน้ำมัน|95|ดีเซล/.test(`${x.category || ''}${x.itemName || ''}`)) row.cost += amount; else row.otherExp += amount;
    });
    const transferList = [];
    transfers.forEach(x => {
      const date = x.date || x.transferDate || x.createdAt || '', key = monthKey(date);
      if (!date || valid.has(key)) transferList.push({
        date, account: x.account || x.fromAccount || x.channel || x.bankAccount || 'โอนผ่านธนาคาร',
        amount: numeric(x.amount || x.totalAmount), remarks: x.remarks || x.details || x.description || x.note || '-'
      });
    });
    transferList.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let totalSales = 0, cashSales = 0, totalExpenses = 0, costExpenses = 0, otherExpenses = 0, totalAR = 0;
    const monthlyList = Object.values(monthly).map(x => {
      totalSales += x.sales; cashSales += x.cashSales; totalExpenses += x.expenses; costExpenses += x.cost;
      otherExpenses += x.otherExp; totalAR += x.ar;
      return { ...x, netProfit: x.sales - x.expenses };
    });
    if (!cashSales) cashSales = cashFallback;
    return {
      success: true,
      summary: { totalSales, cashSales, transferTotal: transferList.reduce((a, x) => a + x.amount, 0),
        totalExpenses, costExpenses, otherExpenses, netProfit: totalSales - totalExpenses,
        borrowedCapital: numeric(capital.borrowedCapital), totalAR, companyCapital: numeric(capital.companyCapital),
        paCapital: numeric(capital.paCapital), totalCapital: numeric(capital.companyCapital) + numeric(capital.paCapital) },
      monthlyList, transferList
    };
  },
  async saveCapitalSettingsData(companyCapital, paCapital, borrowedCapital) {
    await db.collection('settings').doc('capital').set({
      companyCapital: numeric(companyCapital), paCapital: numeric(paCapital), borrowedCapital: numeric(borrowedCapital),
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    return { success: true, message: 'บันทึกตั้งค่าทุนเรียบร้อยแล้ว' };
  },
  async getBuyersumary() {
    const buyersData = (await docs('buyer')).map(x => {
      const summary = x.salesSummary || {};
      return { id: x.id, name: x.name || '', fullname: x.fullname || '', address: x.address || '-',
        taxid: x.taxid || '-', salesSummary: {
          '95': { totalLiters: numeric(summary['95'] && summary['95'].totalLiters), totalAmount: numeric(summary['95'] && summary['95'].totalAmount) },
          diesel: { totalLiters: numeric(summary.diesel && summary.diesel.totalLiters), totalAmount: numeric(summary.diesel && summary.diesel.totalAmount) }
        } };
    });
    return { success: true, data: buyersData };
  },
  async getUnreceiptedSalesRecords(yearMonth, buyerFilter) {
    const range = monthRange(yearMonth);
    if (!range) return { success: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };
    const rows = await docs('sales_records');
    const data = rows.filter(x => {
      const date = normalizedDate(x.date);
      return x.isReceiptIssued !== true && date >= range.startDate && date <= range.endDate &&
        (!buyerFilter || buyerFilter === 'ALL' || String(x.buyerName || '').trim() === buyerFilter);
    }).map(x => ({
      id: x.id, saleNo: x.saleNo || x.id, date: x.date || '-', dateStd: normalizedDate(x.date),
      buyerName: String(x.buyerName || '').trim() || '-', itemType: x.itemType || 'น้ำมัน',
      itemName: x.itemName || x.itemType || 'น้ำมัน', pricePerLiter: numeric(x.pricePerLiter),
      unitPrice: numeric(x.unitPrice || x.pricePerLiter), liters: numeric(x.liters), qty: numeric(x.qty || x.liters),
      totalAmount: numeric(x.totalAmount), remarks: x.remarks || ''
    })).sort((a, b) => a.dateStd.localeCompare(b.dateStd) || String(a.saleNo).localeCompare(String(b.saleNo), undefined, { numeric: true, sensitivity: 'base' }));
    return { success: true, data };
  },
  async generatePdfFromSlideTemplate(data) {
    if (!data) return { success: false, message: 'ไม่พบข้อมูล Data ที่ส่งมาจากหน้าเว็บ' };
    const { drive, slides } = authClients();
    let tempId;
    try {
      const copied = await drive.files.copy({ fileId: BILLING_TEMPLATE_ID, requestBody: { name: `Billing_Temp_${data.billNo || 'Draft'}` }, fields: 'id' });
      tempId = copied.data.id;
      const presentation = await slides.presentations.get({ presentationId: tempId });
      const firstSlide = presentation.data.slides && presentation.data.slides[0];
      if (!firstSlide) throw new Error('ไม่พบ Slide ในไฟล์ Template');
      const requests = [];
      const items = data.items || [], maxRows = 16, pages = Math.max(1, Math.ceil(items.length / maxRows));
      for (let p = 0; p < pages; p++) {
        const id = `billing_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        const duplicateIds = { [firstSlide.objectId]: id };
        (firstSlide.pageElements || []).forEach(element => {
          duplicateIds[element.objectId] = `billing_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        });
        requests.push({ duplicateObject: { objectId: firstSlide.objectId, objectIds: duplicateIds } });
        const common = {
          '{{no}}': data.billNo || '-', '{{date}}': data.billDate || '-', '{{page}}': `${p + 1} / ${pages}`,
          '{{name}}': data.buyerName || '-', '{{address}}': data.buyerAddress || '-', '{{taxid}}': data.buyerTaxId || '-',
          '{{buyerRemark}}': data.buyerRemark || '-',
          '{{subtotal}}': p === pages - 1 ? formatCurrency(data.subtotal) : 'ยอดยกไป',
          '{{vat}}': p === pages - 1 ? formatCurrency(data.vatAmount) : '',
          '{{grandtotal}}': p === pages - 1 ? formatCurrency(data.grandTotal) : ''
        };
        Object.entries(common).forEach(([containsText, replaceText]) => requests.push({
          replaceAllText: { containsText: { text: containsText, matchCase: true }, replaceText, pageObjectIds: [id] }
        }));
        const chunk = items.slice(p * maxRows, (p + 1) * maxRows);
        const table = firstSlide.pageElements && firstSlide.pageElements.find(e => e.table);
        if (table) {
          const tableId = duplicateIds[table.objectId];
          for (let i = 0; i < maxRows; i++) {
            const item = chunk[i], vals = item ? [
              String(p * maxRows + i + 1), item.saleNo || '-', item.date || '-', item.fuel || '-',
              formatCurrency(item.qty), formatCurrency(item.pricePerLiter), formatCurrency(item.total), item.remark || ''
            ] : Array(8).fill('');
            for (let col = 0; col < Math.min(8, table.table.columns); col++) {
              const cell = table.table.tableRows[i + 1] && table.table.tableRows[i + 1].tableCells[col];
              if (!cell) continue;
              requests.push({ deleteText: { objectId: tableId, cellLocation: { rowIndex: i + 1, columnIndex: col }, textRange: { type: 'ALL' } } });
              if (vals[col]) requests.push({ insertText: { objectId: tableId, cellLocation: { rowIndex: i + 1, columnIndex: col }, insertionIndex: 0, text: vals[col] } });
            }
          }
        }
      }
      requests.push({ deleteObject: { objectId: firstSlide.objectId } });
      await slides.presentations.batchUpdate({ presentationId: tempId, requestBody: { requests } });
      const exported = await drive.files.export({ fileId: tempId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
      const created = await drive.files.create({
        requestBody: { name: `ใบวางบิล_${data.billNo || 'Draft'}.pdf`, mimeType: 'application/pdf', parents: [BILLING_FOLDER_ID] },
        media: { mimeType: 'application/pdf', body: Buffer.from(exported.data) }, fields: 'id'
      });
      await drive.permissions.create({ fileId: created.data.id, requestBody: { type: 'anyone', role: 'reader' } });
      return { success: true, pdfUrl: `https://drive.google.com/file/d/${created.data.id}/view`, billNo: data.billNo };
    } catch (error) {
      return { success: false, message: error.message || String(error) };
    } finally {
      if (tempId) await drive.files.delete({ fileId: tempId }).catch(() => {});
    }
  },
  async createBatchReceiptsFromFirestore(selectedSaleIds) {
    if (!Array.isArray(selectedSaleIds) || !selectedSaleIds.length) return { success: false, message: 'กรุณาเลือกรายการที่ต้องการออกใบเสร็จ' };
    const { drive, slides } = authClients();
    const pdf = await PDFDocument.create(), batch = db.batch(), tempIds = [];
    const now = new Date(), today = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    let successCount = 0;
    try {
      const buyerRows = await docs('buyer');
      const buyerMap = Object.fromEntries(buyerRows.map(b => [String(b.name || '').trim(), { name: b.fullname || b.name, addr: b.address || '', tax: b.taxid || '' }]));
      const saleRows = (await Promise.all(selectedSaleIds.map(async id => {
        const snap = await db.collection('sales_records').doc(String(id)).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
      }))).filter(Boolean).sort((a, b) => normalizedDate(a.date).localeCompare(normalizedDate(b.date)));
      for (const sale of saleRows) {
        const text = `${sale.itemName || ''}${sale.itemType || ''}`, rent = text.includes('ค่าเช่า');
        const oil = /95|ดีเซล|น้ำมัน/.test(text), templateId = oil ? RECEIPT_TEMPLATES.OIL : rent ? RECEIPT_TEMPLATES.RENT : RECEIPT_TEMPLATES.NON_OIL;
        const copy = await drive.files.copy({ fileId: templateId, requestBody: { name: `Receipt_${sale.saleNo || sale.id}` }, fields: 'id' });
        tempIds.push(copy.data.id);
        const p = await slides.presentations.get({ presentationId: copy.data.id });
        const pageId = p.data.slides && p.data.slides[0] && p.data.slides[0].objectId;
        if (!pageId) throw new Error(`ใบเสร็จ ${sale.saleNo || sale.id}: ไม่พบสไลด์ใน template`);
        const buyer = buyerMap[String(sale.buyerName || '').trim()] || { name: sale.buyerName || 'เงินสด', addr: '', tax: '' };
        const amount = numeric(sale.totalAmount), qty = numeric(sale.qty || sale.liters);
        const price = numeric(sale.pricePerLiter || sale.unitPrice), d = normalizedDate(sale.date).split('/');
        const receiptDate = d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : sale.date || '-';
        const replacements = {
          '{{price}}': formatCurrency(price), '{{quantity}}': qty ? String(qty) : '', '{{qty}}': qty ? String(qty) : '',
          '{{date}}': receiptDate, '{{no}}': sale.receiptNo || '', '{{name}}': buyer.name || sale.buyerName || '',
          '{{address}}': buyer.addr, '{{tax_id}}': buyer.tax, '{{taxid}}': buyer.tax,
          '{{type}}': sale.itemName || sale.itemType || 'สินค้า/บริการ', '{{item_name}}': sale.itemName || sale.itemType || 'สินค้า/บริการ',
          '{{total}}': formatCurrency(amount), '{{non_vat}}': formatCurrency(amount * 100 / 107),
          '{{vat}}': formatCurrency(amount * 7 / 107), '{{vat5%}}': formatCurrency(amount * 0.05),
          '{{net_total}}': formatCurrency(amount - amount * 0.05), '{{bahttext}}': thaiBahtText(amount)
        };
        const requests = Object.entries(replacements).map(([text, replaceText]) => ({
          replaceAllText: { containsText: { text, matchCase: true }, replaceText, pageObjectIds: [pageId] }
        }));
        await slides.presentations.batchUpdate({ presentationId: copy.data.id, requestBody: { requests } });
        const exported = await drive.files.export({ fileId: copy.data.id, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
        const one = await PDFDocument.load(Buffer.from(exported.data));
        const pages = await pdf.copyPages(one, one.getPageIndices());
        pages.forEach(page => pdf.addPage(page));
        const changes = { isReceiptIssued: true, receiptDate: today };
        if (rent) changes['5%_tax'] = Math.round(amount * 0.05 * 100) / 100;
        batch.set(db.collection('sales_records').doc(sale.id), changes, { merge: true });
        successCount++;
      }
      if (!successCount) return { success: false, message: 'ไม่สามารถสร้างใบเสร็จรับเงินได้' };
      const file = await drive.files.create({
        requestBody: { name: `ใบเสร็จรับเงิน_รวม_${now.toISOString().replace(/[-:T]/g, '').slice(0, 12)}.pdf`, mimeType: 'application/pdf', parents: [RECEIPT_FOLDER_ID] },
        media: { mimeType: 'application/pdf', body: Buffer.from(await pdf.save()) }, fields: 'id'
      });
      await drive.permissions.create({ fileId: file.data.id, requestBody: { type: 'anyone', role: 'reader' } });
      await batch.commit();
      return { success: true, count: successCount, pdfUrl: `https://drive.google.com/file/d/${file.data.id}/view` };
    } catch (error) {
      return { success: false, message: error.message || String(error) };
    } finally {
      await Promise.all(tempIds.map(id => drive.files.delete({ fileId: id }).catch(() => {})));
    }
  }
};

exports.api = onRequest({ region: REGION, secrets: [sessionSecret], timeoutSeconds: 540, memory: '1GiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'POST required' });
  const { method, args } = req.body || {};
  if (typeof method !== 'string' || !Object.hasOwn(handlers, method) || !Array.isArray(args)) {
    return res.status(400).json({ success: false, message: 'Unknown backend method' });
  }
  if (method !== 'checkLogin') {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!parseToken(token, sessionSecret.value())) return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    return res.status(200).json(await handlers[method](...args));
  } catch (error) {
    console.error(`Backend method ${method} failed`, error);
    return res.status(500).json({ success: false, message: error.message || String(error) });
  }
});

if (process.env.NODE_ENV === 'test') {
  exports._test = { normalizedDate, monthKey, monthRange, safeId, parseToken, createToken, thaiBahtText, handlers };
}
