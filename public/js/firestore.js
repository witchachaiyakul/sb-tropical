// public/js/firestore.js

// 🟢 ตั้งค่า Firebase Project
const firebaseConfig = {
  projectId: "sb-tropical"
};

// เริ่มต้นใช้งาน Firebase ในเบราว์เซอร์
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();

// ==================== 1. AUTH SYSTEM ====================
async function checkLogin(username, password) {
  try {
    if (!username || !password) {
      return { success: false, message: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน' };
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();

    let userDoc = await db.collection('users').doc(cleanUser).get();
    let userData = null;

    if (userDoc.exists) {
      userData = userDoc.data();
    } else {
      const snapshot = await db.collection('users')
        .where('username', '==', cleanUser)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        userData = snapshot.docs[0].data();
      }
    }

    if (!userData) {
      return { success: false, message: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ' };
    }

    const storedPassword = String(userData.password || '').trim();
    if (storedPassword !== cleanPass) {
      return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
    }

    return {
      success: true,
      token: `token_${Date.now()}_${cleanUser}`,
      user: {
        username: userData.username || cleanUser,
        name: userData.name || cleanUser,
        role: userData.role || 'staff'
      }
    };
  } catch (err) {
    console.error("❌ Firestore Error:", err);
    return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ Firestore: ' + err.message };
  }
}

// ==================== 2. BUYERS SYSTEM (Collection: 'buyer') ====================
async function getBuyers() {
  try {
    const snapshot = await db.collection('buyer').get();
    const buyers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const shortName = data.name || '';
      const fullName = data.fullname || '';
      if (shortName || fullName) {
        buyers.push({
          id: doc.id,
          name: shortName,
          fullname: fullName,
          taxid: data.taxid || '',
          address: data.address || '',
          salesSummary: data.salesSummary || null
        });
      }
    });

    // เรียงลำดับชื่อตามภาษาไทย
    buyers.sort((a, b) => (a.name || a.fullname).localeCompare((b.name || b.fullname), 'th'));
    return { success: true, data: buyers };
  } catch (err) {
    console.error("❌ Error fetching buyers:", err);
    return { success: false, message: err.message, data: [] };
  }
}

async function saveBuyerRecord(payload) {
  try {
    const docRef = await db.collection('buyer').add({
      name: payload.name || '',
      fullname: payload.fullname || '',
      taxid: payload.taxid || '',
      address: payload.address || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, id: docRef.id, message: 'บันทึกรายชื่อผู้ซื้อเรียบร้อยแล้ว' };
  } catch (err) {
    console.error("❌ Error saving buyer:", err);
    return { success: false, message: err.message };
  }
}

// ==================== 3. SALES NUMBER TRACKER (Doc: 'sales_no/current') ====================
async function getNextSaleNo(dateStr) {
  try {
    let dateObj = new Date();
    if (dateStr) {
      const parts = dateStr.split(/[\/\-]/);
      if (parts.length === 3) {
        let y = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10) - 1;
        let d = parseInt(parts[2], 10);
        if (y > 2400) y -= 543;
        dateObj = new Date(y, m, d);
      }
    }
    if (isNaN(dateObj.getTime())) dateObj = new Date();

    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yearBE = String(dateObj.getFullYear() + 543).slice(-2);
    const currentPrefix = "SB" + month + yearBE;

    const trackerDoc = await db.collection('sales_no').doc('current').get();
    let lastPrefix = "";
    let lastNumber = 0;

    if (trackerDoc.exists) {
      const trackerData = trackerDoc.data();
      lastPrefix = trackerData.last_prefix || "";
      lastNumber = Number(trackerData.last_number || 0);
    }

    let nextNumber = 1;
    if (lastPrefix === currentPrefix) {
      nextNumber = lastNumber + 1;
    }

    const formattedNumber = String(nextNumber).padStart(4, '0');
    const fullSaleNo = currentPrefix + "-" + formattedNumber;

    return {
      success: true,
      saleNo: fullSaleNo,
      prefix: currentPrefix,
      number: nextNumber
    };
  } catch (err) {
    console.error("❌ Error in getNextSaleNo:", err);
    return { success: false, message: err.message };
  }
}

async function updateSalesNoTracker(prefix, number) {
  try {
    await db.collection('sales_no').doc('current').set({
      last_prefix: prefix,
      last_number: number
    }, { merge: true });
  } catch (e) {
    console.error("❌ Error updateSalesNoTracker:", e);
  }
}

// ==================== 4. SALES SYSTEM (Collection: 'sales_records') ====================
async function saveSaleRecord(data) {
  try {
    if (!data) {
      return { success: false, message: 'ไม่พบข้อมูลที่ส่งมาบันทึก' };
    }

    const isUpdate = !!data.docId;
    let saleNo = data.saleNo || '';
    let trackerPrefix = '';
    let trackerNumber = 0;

    // 1. รายการใหม่: สร้างเลข saleNo และอัปเดต tracker
    if (!isUpdate) {
      const saleNoInfo = await getNextSaleNo(data.date);
      if (saleNoInfo && saleNoInfo.success) {
        saleNo = saleNoInfo.saleNo;
        trackerPrefix = saleNoInfo.prefix;
        trackerNumber = saleNoInfo.number;
      } else {
        return { success: false, message: 'ไม่สามารถสร้างเลขที่ใบขายได้' };
      }
    }

    const docId = isUpdate ? data.docId : saleNo.replace(/\//g, "-");
    if (!docId) {
      return { success: false, message: 'รหัสเอกสาร (docId) ไม่ถูกต้อง' };
    }

    const safeNum = (val) => {
      const n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    };

    const safeInt = (val, defaultVal) => {
      const n = parseInt(val, 10);
      return isNaN(n) ? (defaultVal || 0) : n;
    };

    let formattedDate = String(data.date || '').replace(/-/g, '/').trim();

    const payload = {
      saleNo: saleNo,
      receiptNo: data.receiptNo || '',
      date: formattedDate,
      buyerName: data.buyerName || '',
      itemType: data.itemType || 'น้ำมัน',
      itemName: data.itemName || 'น้ำมัน',
      pricePerLiter: safeNum(data.pricePerLiter),
      liters: safeNum(data.liters),
      qty: safeNum(data.qty),
      unitPrice: safeNum(data.unitPrice),
      precision: safeInt(data.precision, 2),
      totalAmount: safeNum(data.totalAmount),
      paymentType: data.paymentType || 'เงินสด',
      remarks: data.remarks || '',
      recordedBy: data.recordedBy || (window.currentUser ? window.currentUser.username : 'system'),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!isUpdate) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.isBilled = false;
      payload.isReceiptIssued = false;
      payload.paymentStatus = data.paymentType === 'เงินเชื่อ' ? 'unpaid' : 'paid';
    }

    // 2. บันทึกลง Firestore (sales_records)
    await db.collection('sales_records').doc(docId).set(payload, { merge: true });

    // 3. อัปเดตตัวนับเลขเอกสารถ้าเป็นรายการใหม่
    if (!isUpdate && trackerPrefix && trackerNumber) {
      await updateSalesNoTracker(trackerPrefix, trackerNumber);
    }

    // 4. ⛽ ตัดสต็อกน้ำมันอัตโนมัติ (ส่วนที่เพิ่มเข้ามาให้สมบูรณ์)
    const isFuelSale = (payload.itemType === 'น้ำมัน' || (typeof getFuelDocId === 'function' && getFuelDocId(payload.itemName))) && payload.liters > 0;
    if (isFuelSale && typeof updateStockOnFuelSale === 'function') {
      try {
        await updateStockOnFuelSale(payload, isUpdate);
      } catch (stockErr) {
        console.warn("⚠️ บันทึกรายการขายสำเร็จ แต่ตัดสต็อกน้ำมันผิดพลาด:", stockErr);
      }
    }

    // 5. 👤 อัปเดตยอดขายสะสมของลูกค้าใน collection 'buyer'
    if (data.buyerName && typeof updateBuyerSalesSummary === 'function') {
      try {
        await updateBuyerSalesSummary(
          data.buyerName,
          payload.itemName,
          safeNum(payload.liters || payload.qty),
          safeNum(payload.totalAmount),
          isUpdate
        );
      } catch (buyerErr) {
        console.warn("⚠️ บันทึกรายการขายสำเร็จ แต่อัปเดตยอดสะสมลูกค้าผิดพลาด:", buyerErr);
      }
    }

    return {
      success: true,
      message: 'บันทึกสำเร็จ',
      saleNo: saleNo,
      docId: docId
    };
  } catch (err) {
    console.error("❌ Error in saveSaleRecord:", err);
    return { success: false, message: err.message };
  }
}

async function getSalesRecordsRange(startDateStr, endDateStr, limitCount = 3000) {
  try {
    const startFormatted = startDateStr ? startDateStr.replace(/-/g, "/") : "";
    const endFormatted = endDateStr ? endDateStr.replace(/-/g, "/") : "";

    let query = db.collection('sales_records');
    if (startFormatted) query = query.where('date', '>=', startFormatted);
    if (endFormatted) query = query.where('date', '<=', endFormatted);

    const snapshot = await query.limit(limitCount).get();
    const records = [];

    snapshot.forEach(doc => {
      const f = doc.data();
      records.push({
        id: doc.id,
        saleNo: f.saleNo || '',
        date: f.date || '',
        buyerName: f.buyerName || '',
        itemType: f.itemType || 'น้ำมัน',
        itemName: f.itemName || '',
        pricePerLiter: Number(f.pricePerLiter || 0),
        liters: Number(f.liters || 0),
        qty: Number(f.qty || 0),
        unitPrice: Number(f.unitPrice || 0),
        precision: f.precision !== undefined ? Number(f.precision) : 2,
        totalAmount: Number(f.totalAmount || 0),
        paymentType: f.paymentType || 'เงินสด',
        remarks: f.remarks || ''
      });
    });

    // จัดเรียงวันที่จากใหม่ไปเก่า
    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getSalesRecordsRange:", err);
    return { success: false, message: err.message, data: [] };
  }
}

async function deleteSaleRecord(docId) {
  try {
    const docRef = db.collection('sales_records').doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return { success: false, message: 'ไม่พบรายการขาย' };

    const saleData = docSnap.data();

    // ลบเอกสารรายการขายหลัก
    await docRef.delete();

    // ⛽ คืนสต็อกน้ำมันย้อนกลับ
    const fuelDocId = getFuelDocId(saleData.itemName || saleData.itemType);
    const liters = Number(saleData.liters || saleData.qty || 0);
    if (fuelDocId && liters > 0) {
      await reverseStockOnFuelSale(saleData);
    }

    return { success: true, message: 'ลบรายการและปรับปรุงสต็อกเรียบร้อย' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ==================== 5. BUYER SALES SUMMARY HELPER ====================
async function updateBuyerSalesSummary(buyerName, itemName, liters, totalAmount, isUpdate) {
  try {
    if (!buyerName || liters <= 0) return;

    const nameLower = String(itemName).toLowerCase();
    let oilKey = "";
    if (nameLower.indexOf("95") !== -1) {
      oilKey = "95";
    } else if (nameLower.indexOf("ดีเซล") !== -1 || nameLower.indexOf("diesel") !== -1) {
      oilKey = "diesel";
    }

    if (!oilKey) return;

    const buyersRes = await getBuyers();
    if (!buyersRes.success || !buyersRes.data || buyersRes.data.length === 0) return;

    const targetBuyer = buyersRes.data.find(b => 
      (b.name && b.name.trim() === buyerName.trim()) || 
      (b.fullname && b.fullname.trim() === buyerName.trim())
    );

    if (!targetBuyer || !targetBuyer.id) {
      console.warn("⚠️ ไม่พบข้อมูลลูกค้าชื่อ:", buyerName);
      return;
    }

    const docRef = db.collection('buyer').doc(targetBuyer.id);
    const docSnap = await docRef.get();

    let currentSummary = {
      "95": { totalLiters: 0, totalAmount: 0 },
      "diesel": { totalLiters: 0, totalAmount: 0 }
    };

    if (docSnap.exists) {
      const data = docSnap.data();
      if (data.salesSummary) {
        if (data.salesSummary["95"]) {
          currentSummary["95"].totalLiters = Number(data.salesSummary["95"].totalLiters || 0);
          currentSummary["95"].totalAmount = Number(data.salesSummary["95"].totalAmount || 0);
        }
        if (data.salesSummary["diesel"]) {
          currentSummary["diesel"].totalLiters = Number(data.salesSummary["diesel"].totalLiters || 0);
          currentSummary["diesel"].totalAmount = Number(data.salesSummary["diesel"].totalAmount || 0);
        }
      }
    }

    if (!isUpdate) {
      currentSummary[oilKey].totalLiters += liters;
      currentSummary[oilKey].totalAmount += totalAmount;
    }

    const updatePayload = {
      salesSummary: {
        "95": {
          totalLiters: currentSummary["95"].totalLiters,
          totalAmount: currentSummary["95"].totalAmount,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        },
        "diesel": {
          totalLiters: currentSummary["diesel"].totalLiters,
          totalAmount: currentSummary["diesel"].totalAmount,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }
      }
    };

    await docRef.set(updatePayload, { merge: true });
    console.log("✅ อัปเดต salesSummary ของ", buyerName, "สำเร็จ!");
  } catch (err) {
    console.error("❌ Error in updateBuyerSalesSummary:", err);
  }
}

// =================================================================
// ⛽ OIL STOCK ENGINE (HYBRID SUMMARY SYSTEM - EXACT MATCH WITH GAS)
// =================================================================
function toStandardYYYYMMDD(raw) {
  if (!raw) return "";
  let str = String(raw).trim();
  if (str.includes('T')) str = str.split('T')[0];
  str = str.replace(/-/g, '/').replace(/\./g, '/');
  const parts = str.split('/');
  if (parts.length === 3) {
    let p0 = parseInt(parts[0], 10);
    let p1 = parseInt(parts[1], 10);
    let p2 = parseInt(parts[2], 10);
    if (parts[0].length === 4) { // YYYY/MM/DD
      let yr0 = p0 > 2400 ? (p0 - 543) : p0;
      return `${yr0}/${String(p1).padStart(2, '0')}/${String(p2).padStart(2, '0')}`;
    }
    if (parts[2].length === 4) { // DD/MM/YYYY
      let yr2 = p2 > 2400 ? (p2 - 543) : p2;
      return `${yr2}/${String(p1).padStart(2, '0')}/${String(p0).padStart(2, '0')}`;
    }
  }
  return str;
}

function safeDocId(noStr) {
  return String(noStr || '').trim().replace(/\//g, '-');
}

function getFuelDocId(itemName) {
  const name = String(itemName || '').toLowerCase();
  if (name === '95' || name.includes('95') || name.includes('แก๊สโซฮอล์') || name.includes('เบนซิน')) {
    return '95';
  } else if (name.includes('ดีเซล') || name.includes('diesel')) {
    return 'diesel';
  }
  return null;
}

// 1. ดึงข้อมูลสต็อกน้ำมันสำหรับแสดงการ์ดสรุปผล
async function getOilStockData(targetDate) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const searchDate = targetDate ? toStandardYYYYMMDD(targetDate) : toStandardYYYYMMDD(todayStr); // YYYY/MM/DD

    const parts = searchDate.split('/');
    if (parts.length < 3) return { success: false, message: "รูปแบบวันที่ไม่ถูกต้อง" };

    const targetYear = parts[0];
    const targetMonth = parts[1];
    const targetDay = parts[2];

    const docIdDate = `${targetYear}-${targetMonth}-${targetDay}`;
    const targetMonthStr = `${targetYear}/${targetMonth}`;
    const monthStartDate = `${targetYear}/${targetMonth}/01`;

    async function getSummaryForFuelType(fuelType) {
      // 1.1 อ่านค่าสต็อกตั้งต้นจาก oil_stock/{fuelType}
      const parentSnap = await db.collection('oil_stock').doc(fuelType).get();
      let initialStock = 0;
      if (parentSnap.exists) {
        initialStock = Number(parentSnap.data().initialStock || 0);
      }

      // 1.2 ดึงยอดนำเข้า และ ยอดขายออก ของวันที่กรองข้อมูล
      let dayIn = 0, dayOut = 0, dayCashSales = 0;

      const dayInSnap = await db.collection('oil_stock').doc(fuelType).collection('imports_daily_summaries').doc(docIdDate).get();
      if (dayInSnap.exists) {
        dayIn = Number(dayInSnap.data().totalIn || 0);
      }

      const dayOutSnap = await db.collection('oil_stock').doc(fuelType).collection('daily_summaries').doc(docIdDate).get();
      if (dayOutSnap.exists) {
        const dData = dayOutSnap.data();
        dayOut = Number(dData.totalOut || 0);
        dayCashSales = Number(dData.cashSales || 0);
      }

      // 1.3 คำนวณยอดนำเข้าสะสม (Cumulative In) ถึงวันที่เลือก
      let cumulativeIn = 0;
      const impMonthSnap = await db.collection('oil_stock').doc(fuelType).collection('imports_monthly_summaries').get();
      impMonthSnap.forEach(doc => {
        const mData = doc.data();
        if (mData.month && mData.month < targetMonthStr) {
          cumulativeIn += Number(mData.totalIn || 0);
        }
      });

      const impDaySnap = await db.collection('oil_stock').doc(fuelType).collection('imports_daily_summaries').get();
      impDaySnap.forEach(doc => {
        const dData = doc.data();
        if (dData.date && dData.date >= monthStartDate && dData.date <= searchDate) {
          cumulativeIn += Number(dData.totalIn || 0);
        }
      });

      // 1.4 คำนวณยอดขายออกสะสม (Cumulative Out) ถึงวันที่เลือก
      let cumulativeOut = 0;
      const expMonthSnap = await db.collection('oil_stock').doc(fuelType).collection('monthly_summaries').get();
      expMonthSnap.forEach(doc => {
        const mData = doc.data();
        if (mData.month && mData.month < targetMonthStr) {
          cumulativeOut += Number(mData.totalOut || 0);
        }
      });

      const expDaySnap = await db.collection('oil_stock').doc(fuelType).collection('daily_summaries').get();
      expDaySnap.forEach(doc => {
        const dData = doc.data();
        if (dData.date && dData.date >= monthStartDate && dData.date <= searchDate) {
          cumulativeOut += Number(dData.totalOut || 0);
        }
      });

      // 1.5 ยอดคงเหลือสะสม ณ สิ้นวัน
      const currentStock = initialStock + cumulativeIn - cumulativeOut;

      return {
        initialStock: initialStock,
        totalIn: dayIn,
        totalOut: dayOut,
        cashSales: dayCashSales,
        currentStock: currentStock
      };
    }

    const stock95Result = await getSummaryForFuelType('95');
    const stockDieselResult = await getSummaryForFuelType('diesel');

    return {
      success: true,
      stock95: stock95Result,
      stockDiesel: stockDieselResult
    };

  } catch (err) {
    console.error("❌ Error in getOilStockData:", err);
    return { success: false, message: err.message };
  }
}

// 2. อัปเดต Sub-collections ยอดขายออก (daily_summaries & monthly_summaries)
async function updateSaleSummaries(fuelType, rawDate, liters, cashValue, oldLiters, oldCashValue, isUpdate) {
  try {
    const stdDate = toStandardYYYYMMDD(rawDate);
    if (!stdDate) return;

    const parts = stdDate.split('/');
    if (parts.length < 3) return;

    const year = parts[0], month = parts[1], day = parts[2];
    const dailyDocId = `${year}-${month}-${day}`;
    const dailyDateStr = `${year}/${month}/${day}`;
    const monthlyDocId = `${year}-${month}`;
    const monthlyDateStr = `${year}/${month}`;

    const deltaLiters = isUpdate ? (liters - oldLiters) : liters;
    const deltaCash = isUpdate ? (cashValue - oldCashValue) : cashValue;

    // Daily Summary
    const dailyRef = db.collection('oil_stock').doc(fuelType).collection('daily_summaries').doc(dailyDocId);
    const dailySnap = await dailyRef.get();
    let curDailyOut = 0, curDailyCash = 0, curDailyCount = 0;
    if (dailySnap.exists) {
      const df = dailySnap.data();
      curDailyOut = Number(df.totalOut || 0);
      curDailyCash = Number(df.cashSales || 0);
      curDailyCount = Number(df.recordCount || 0);
    }
    await dailyRef.set({
      date: dailyDateStr,
      fuelType: fuelType,
      totalOut: Math.max(0, curDailyOut + deltaLiters),
      cashSales: Math.max(0, curDailyCash + deltaCash),
      recordCount: isUpdate ? curDailyCount : (curDailyCount + 1),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Monthly Summary
    const monthlyRef = db.collection('oil_stock').doc(fuelType).collection('monthly_summaries').doc(monthlyDocId);
    const monthlySnap = await monthlyRef.get();
    let curMonthlyOut = 0, curMonthlyCash = 0, curMonthlyCount = 0;
    if (monthlySnap.exists) {
      const mf = monthlySnap.data();
      curMonthlyOut = Number(mf.totalOut || 0);
      curMonthlyCash = Number(mf.cashSales || 0);
      curMonthlyCount = Number(mf.recordCount || 0);
    }
    await monthlyRef.set({
      month: monthlyDateStr,
      fuelType: fuelType,
      totalOut: Math.max(0, curMonthlyOut + deltaLiters),
      cashSales: Math.max(0, curMonthlyCash + deltaCash),
      recordCount: isUpdate ? curMonthlyCount : (curMonthlyCount + 1),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

  } catch (err) {
    console.error("❌ Error in updateSaleSummaries:", err);
  }
}

// 3. อัปเดตสต็อกเมื่อทำการขาย (Sale)
async function updateStockOnFuelSale(saleRecord, isUpdate) {
  try {
    if (!saleRecord) return { success: false, message: "ไม่พบข้อมูลรายการ" };

    const docId = getFuelDocId(saleRecord.itemName || saleRecord.itemType);
    if (!docId) return { success: false, message: "ไม่ใช่รายการน้ำมัน" };

    const liters = Number(saleRecord.liters || saleRecord.qty || 0);
    if (liters <= 0) return { success: false, message: "จำนวนลิตรไม่ถูกต้อง" };

    const rawSaleNo = String(saleRecord.saleNo || '').trim();
    const cleanSaleNo = safeDocId(rawSaleNo);
    const recDate = toStandardYYYYMMDD(saleRecord.date);
    const paymentType = String(saleRecord.paymentType || 'เงินสด').trim();

    const isCash = paymentType.includes('เงินสด');
    const cashValue = isCash ? Number(saleRecord.totalAmount || 0) : 0;

    const exportDocRef = db.collection('oil_stock').doc(docId).collection('exports').doc(cleanSaleNo);
    let oldLiters = 0, oldCashValue = 0;

    if (isUpdate) {
      const oldSnap = await exportDocRef.get();
      if (oldSnap.exists) {
        oldLiters = Number(oldSnap.data().liters || 0);
        oldCashValue = Number(oldSnap.data().cash || 0);
      }
    }

    await exportDocRef.set({
      saleNo: rawSaleNo,
      date: recDate,
      liters: liters,
      paymentType: paymentType,
      cash: cashValue,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await updateSaleSummaries(docId, recDate, liters, cashValue, oldLiters, oldCashValue, isUpdate);
    await updateOilStockParentSummary(docId);

    return { success: true };
  } catch (err) {
    console.error("❌ Error in updateStockOnFuelSale:", err);
    return { success: false, message: err.message };
  }
}

// 4. ย้อนกลับสต็อกเมื่อทำการลบรายการขาย
async function reverseStockOnFuelSale(saleRecord) {
  try {
    const docId = getFuelDocId(saleRecord.itemName || saleRecord.itemType);
    if (!docId) return;

    const cleanSaleNo = safeDocId(saleRecord.saleNo);
    const exportDocRef = db.collection('oil_stock').doc(docId).collection('exports').doc(cleanSaleNo);
    const oldSnap = await exportDocRef.get();

    if (!oldSnap.exists) return;

    const oldData = oldSnap.data();
    const oldLiters = Number(oldData.liters || 0);
    const oldCashValue = Number(oldData.cash || 0);
    const recDate = oldData.date || saleRecord.date;

    // ลบออกจาก exports
    await exportDocRef.delete();

    // ปรับลดใน summaries (ใส่ delta เป็นค่าลบ)
    await updateSaleSummaries(docId, recDate, 0, 0, oldLiters, oldCashValue, true);
    await updateOilStockParentSummary(docId);
  } catch (err) {
    console.error("❌ Error in reverseStockOnFuelSale:", err);
  }
}

// 5. อัปเดต Sub-collections ยอดซื้อเข้า (imports_daily_summaries & imports_monthly_summaries)
async function updateImportSummaries(fuelType, rawDate, liters, amount, oldLiters, oldAmount, isUpdate) {
  try {
    const stdDate = toStandardYYYYMMDD(rawDate);
    if (!stdDate) return;

    const parts = stdDate.split('/');
    if (parts.length < 3) return;

    const year = parts[0], month = parts[1], day = parts[2];
    const dailyDocId = `${year}-${month}-${day}`;
    const dailyDateStr = `${year}/${month}/${day}`;
    const monthlyDocId = `${year}-${month}`;
    const monthlyDateStr = `${year}/${month}`;

    const deltaLiters = isUpdate ? (liters - oldLiters) : liters;
    const deltaCost = isUpdate ? (amount - oldAmount) : amount;

    // Daily Summary Import
    const dailyRef = db.collection('oil_stock').doc(fuelType).collection('imports_daily_summaries').doc(dailyDocId);
    const dailySnap = await dailyRef.get();
    let curDailyIn = 0, curDailyCost = 0, curDailyCount = 0;
    if (dailySnap.exists) {
      const df = dailySnap.data();
      curDailyIn = Number(df.totalIn || 0);
      curDailyCost = Number(df.totalCost || 0);
      curDailyCount = Number(df.recordCount || 0);
    }
    await dailyRef.set({
      date: dailyDateStr,
      fuelType: fuelType,
      totalIn: Math.max(0, curDailyIn + deltaLiters),
      totalCost: Math.max(0, curDailyCost + deltaCost),
      recordCount: isUpdate ? curDailyCount : (curDailyCount + 1),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Monthly Summary Import
    const monthlyRef = db.collection('oil_stock').doc(fuelType).collection('imports_monthly_summaries').doc(monthlyDocId);
    const monthlySnap = await monthlyRef.get();
    let curMonthlyIn = 0, curMonthlyCost = 0, curMonthlyCount = 0;
    if (monthlySnap.exists) {
      const mf = monthlySnap.data();
      curMonthlyIn = Number(mf.totalIn || 0);
      curMonthlyCost = Number(mf.totalCost || 0);
      curMonthlyCount = Number(mf.recordCount || 0);
    }
    await monthlyRef.set({
      month: monthlyDateStr,
      fuelType: fuelType,
      totalIn: Math.max(0, curMonthlyIn + deltaLiters),
      totalCost: Math.max(0, curMonthlyCost + deltaCost),
      recordCount: isUpdate ? curMonthlyCount : (curMonthlyCount + 1),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

  } catch (err) {
    console.error("❌ Error in updateImportSummaries:", err);
  }
}

// 6. อัปเดตสต็อกเมื่อทำการซื้อน้ำมัน (Purchase / Expense)
async function updateStockOnFuelPurchase(expenseRecord, isUpdate) {
  try {
    if (!expenseRecord) return { success: false, message: "ไม่พบข้อมูลรายการ" };

    const docId = getFuelDocId(expenseRecord.itemName || expenseRecord.category);
    if (!docId) return { success: false, message: "ไม่ใช่รายการน้ำมัน" };

    const liters = Number(expenseRecord.liters || expenseRecord.qty || 0);
    if (liters <= 0) return { success: false, message: "จำนวนลิตรไม่ถูกต้อง" };

    const rawExpenseNo = String(expenseRecord.expenseNo || expenseRecord.no || '').trim();
    const cleanExpenseNo = safeDocId(rawExpenseNo);
    const recDate = toStandardYYYYMMDD(expenseRecord.date);
    const pricePerLiter = Number(expenseRecord.pricePerLiter || 0);
    const amount = Number(expenseRecord.amount || expenseRecord.totalWithVat || 0);

    const importDocRef = db.collection('oil_stock').doc(docId).collection('imports').doc(cleanExpenseNo);
    let oldLiters = 0, oldAmount = 0;

    if (isUpdate) {
      const oldSnap = await importDocRef.get();
      if (oldSnap.exists) {
        oldLiters = Number(oldSnap.data().liters || 0);
        oldAmount = Number(oldSnap.data().amount || 0);
      }
    }

    await importDocRef.set({
      expenseNo: rawExpenseNo,
      date: recDate,
      liters: liters,
      pricePerLiter: pricePerLiter,
      amount: amount,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await updateImportSummaries(docId, recDate, liters, amount, oldLiters, oldAmount, isUpdate);
    await updateOilStockParentSummary(docId);

    return { success: true };
  } catch (err) {
    console.error("❌ Error in updateStockOnFuelPurchase:", err);
    return { success: false, message: err.message };
  }
}

// 7. คำนวณยอดรวมใหม่ทั้งหมดลงใน Document แม่ (oil_stock/95 หรือ oil_stock/diesel)
async function updateOilStockParentSummary(docId) {
  try {
    const parentRef = db.collection('oil_stock').doc(docId);
    const parentSnap = await parentRef.get();
    let initialStock = 0;
    if (parentSnap.exists) {
      initialStock = Number(parentSnap.data().initialStock || 0);
    }

    let totalIn = 0;
    const impMonthSnap = await db.collection('oil_stock').doc(docId).collection('imports_monthly_summaries').get();
    impMonthSnap.forEach(doc => totalIn += Number(doc.data().totalIn || 0));

    let totalOut = 0;
    const expMonthSnap = await db.collection('oil_stock').doc(docId).collection('monthly_summaries').get();
    expMonthSnap.forEach(doc => totalOut += Number(doc.data().totalOut || 0));

    const currentStock = initialStock + totalIn - totalOut;

    await parentRef.set({
      fuelType: docId,
      initialStock: initialStock,
      totalIn: totalIn,
      totalOut: totalOut,
      currentStock: currentStock,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

  } catch (err) {
    console.error("❌ Error in updateOilStockParentSummary:", err);
  }
}

// 8. ตั้งค่าและบันทึกสต็อกตั้งต้น (Initial Stock)
async function setInitialOilStock(initial95, initialDiesel) {
  try {
    const stockCurrentRes = await getOilStockData();
    const in95 = stockCurrentRes.stock95 ? stockCurrentRes.stock95.totalIn : 0;
    const out95 = stockCurrentRes.stock95 ? stockCurrentRes.stock95.totalOut : 0;
    const inDiesel = stockCurrentRes.stockDiesel ? stockCurrentRes.stockDiesel.totalIn : 0;
    const outDiesel = stockCurrentRes.stockDiesel ? stockCurrentRes.stockDiesel.totalOut : 0;

    const init95Num = Number(initial95) || 0;
    const initDieselNum = Number(initialDiesel) || 0;

    await updateOilStockParentSummaryWithInitial("95", init95Num);
    await updateOilStockParentSummaryWithInitial("diesel", initDieselNum);

    return { success: true, message: "บันทึกสต็อกตั้งต้นเรียบร้อยแล้ว" };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function updateOilStockParentSummaryWithInitial(docId, initialStockVal) {
  const parentRef = db.collection('oil_stock').doc(docId);
  await parentRef.set({
    fuelType: docId,
    initialStock: initialStockVal,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await updateOilStockParentSummary(docId);
}