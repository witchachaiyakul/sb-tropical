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
      itemName: data.itemName || '',
      pricePerLiter: safeNum(data.pricePerLiter),
      liters: safeNum(data.liters),
      qty: safeNum(data.qty),
      unitPrice: safeNum(data.unitPrice),
      precision: safeInt(data.precision, 2),
      totalAmount: safeNum(data.totalAmount),
      paymentType: data.paymentType || 'เงินสด',
      paymentStatus: data.paymentType === 'เงินเชื่อ' ? 'unpaid' : 'paid',
      remarks: data.remarks || '',
      recordedBy: data.recordedBy || (window.currentUser ? window.currentUser.username : 'system'),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!isUpdate) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.isBilled = false;
      payload.isReceiptIssued = false;
    }

    await db.collection('sales_records').doc(docId).set(payload, { merge: true });

    if (!isUpdate && trackerPrefix && trackerNumber) {
      await updateSalesNoTracker(trackerPrefix, trackerNumber);
    }

    const isFuelSale = (payload.itemType === 'น้ำมัน' || (typeof getFuelDocId === 'function' && getFuelDocId(payload.itemName))) && payload.liters > 0;
    if (isFuelSale && typeof updateStockOnFuelSale === 'function') {
      try {
        await updateStockOnFuelSale(payload, isUpdate);
      } catch (stockErr) {
        console.warn("⚠️ บันทึกรายการขายสำเร็จ แต่ตัดสต็อกน้ำมันผิดพลาด:", stockErr);
      }
    }

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

    return { success: true, message: 'บันทึกสำเร็จ', saleNo: saleNo, docId: docId };
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
        receiptNo: f.receiptNo || '',
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
        paymentStatus: f.paymentStatus || (f.paymentType === 'เงินเชื่อ' ? 'unpaid' : 'paid'),
        isBilled: f.isBilled || false,
        isReceiptIssued: f.isReceiptIssued || false,
        remarks: f.remarks || ''
      });
    });

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

// ==================== BILLING SYSTEM HELPERS ====================

// 🟢 1. ดึงรายการขายเงินเชื่อที่ยังไม่ได้ออกใบวางบิล (isBilled != true)
async function getUnpaidSalesRecords(startDateStr, endDateStr, buyerFilter = 'ALL') {
  try {
    const startFormatted = startDateStr ? toStandardYYYYMMDD(startDateStr) : "";
    const endFormatted = endDateStr ? toStandardYYYYMMDD(endDateStr) : "";

    // 🟢 เติม .orderBy('date', 'desc') เพื่อให้ match กับ Index (isBilled ↑, date ↓) บน Firebase Console
    let query = db.collection('sales_records')
      .where('isBilled', '==', false)
      .orderBy('date', 'desc');

    if (startFormatted) query = query.where('date', '>=', startFormatted);
    if (endFormatted) query = query.where('date', '<=', endFormatted);

    const snapshot = await query.limit(3000).get();
    const records = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const pType = String(data.paymentType || '').trim();
      const pStatus = String(data.paymentStatus || '').toLowerCase();

      // กรองเฉพาะรายการที่เป็นเงินเชื่อ หรือสถานะยังไม่ชำระ (unpaid)
      const isUnpaid = (pType === 'เงินเชื่อ' || pStatus === 'unpaid');

      if (isUnpaid) {
        if (buyerFilter === 'ALL' || (data.buyerName && data.buyerName.trim() === buyerFilter.trim())) {
          records.push({ id: doc.id, ...data });
        }
      }
    });

    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getUnpaidSalesRecords:", err);
    return { success: false, message: err.message, data: [] };
  }
}

// 🟢 2. ดึงข้อมูลลูกค้าตามชื่อ (สำหรับใส่ใน Modal Preview)
async function getBuyerByName(buyerName) {
  try {
    if (!buyerName) return { success: false, data: {} };
    const cleanName = String(buyerName).trim();
    
    const snap = await db.collection('buyer').where('name', '==', cleanName).limit(1).get();
    if (!snap.empty) {
      return { success: true, data: snap.docs[0].data() };
    }

    const snapFull = await db.collection('buyer').where('fullname', '==', cleanName).limit(1).get();
    if (!snapFull.empty) {
      return { success: true, data: snapFull.docs[0].data() };
    }

    return { success: true, data: { name: cleanName, fullname: cleanName, taxid: '-', address: '-' } };
  } catch (err) {
    return { success: false, message: err.message, data: {} };
  }
}

// 🟢 3. รันเลขที่ใบวางบิลถัดไป (เช่น SBBS-0001)
async function getNextBillNo() {
  try {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yearBE = String(now.getFullYear() + 543).slice(-2);
    const prefix = `SBBS${month}${yearBE}`;

    const trackerDoc = await db.collection('bill_no').doc('current').get();
    let lastPrefix = "", lastNumber = 0;
    if (trackerDoc.exists) {
      const data = trackerDoc.data();
      lastPrefix = data.last_prefix || "";
      lastNumber = Number(data.last_number || 0);
    }

    const nextNumber = (lastPrefix === prefix) ? lastNumber + 1 : 1;
    const billNo = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
    return { success: true, billNo: billNo, prefix: prefix, number: nextNumber };
  } catch (err) {
    return { success: false, message: err.message, billNo: 'SBBS-0001' };
  }
}

// 🟢 4. ยืนยันออกใบวางบิล (บันทึกลง collection 'billing_notes' และอัปเดตสถานะ isBilled = true)
async function confirmBilling(saleIds, billDateStr, billingData) {
  try {
    if (!Array.isArray(saleIds) || saleIds.length === 0) {
      return { success: false, message: 'กรุณาเลือกอย่างน้อย 1 รายการ' };
    }

    const billNoInfo = await getNextBillNo();
    const billNo = billNoInfo.billNo;

    const payload = {
      billNo: billNo,
      billDate: billDateStr,
      buyerName: billingData.buyerName || '-',
      buyerTaxId: billingData.buyerTaxId || '-',
      buyerAddress: billingData.buyerAddress || '-',
      buyerRemark: billingData.buyerRemark || '-',
      subtotal: Number(billingData.subtotal || 0),
      vatAmount: Number(billingData.vatAmount || 0),
      grandTotal: Number(billingData.grandTotal || 0),
      saleIds: saleIds,
      saleNos: billingData.saleNos || [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // บันทึกลง billing_notes
    await db.collection('billing_notes').doc(billNo.replace(/\//g, "-")).set(payload);

    // อัปเดตตัวรันเลข bill_no
    if (billNoInfo.prefix && billNoInfo.number) {
      await db.collection('bill_no').doc('current').set({
        last_prefix: billNoInfo.prefix,
        last_number: billNoInfo.number
      }, { merge: true });
    }

    // อัปเดตรายการขายใน sales_records ว่าถูกวางบิลแล้ว
    const batch = db.batch();
    saleIds.forEach(id => {
      const ref = db.collection('sales_records').doc(String(id));
      batch.update(ref, {
        isBilled: true,
        billNo: billNo,
        billedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    return { success: true, billNo: billNo, message: 'ออกใบวางบิลสำเร็จ' };
  } catch (err) {
    console.error("❌ Error in confirmBilling:", err);
    return { success: false, message: err.message };
  }
}

// ==================== EXPENSE SYSTEM HELPERS ====================

// 🟢 1. สร้างเลขที่บิลค่าใช้จ่ายถัดไป (เช่น SBEXP1069-0001)
async function getNextExpenseNo(dateStr) {
  try {
    const stdDate = toStandardYYYYMMDD(dateStr || new Date().toISOString().split('T')[0]);
    const parts = stdDate.split('/');
    
    let month = String(new Date().getMonth() + 1).padStart(2, '0');
    let yearBE = String(new Date().getFullYear() + 543).slice(-2);

    if (parts.length === 3) {
      month = String(parts[1]).padStart(2, '0');
      let yr = parseInt(parts[0], 10);
      if (yr < 2400) yr += 543;
      yearBE = String(yr).slice(-2);
    }

    const currentPrefix = `SBEXP${month}${yearBE}`;

    const trackerDoc = await db.collection('expense_no').doc('current').get();
    let lastPrefix = "", lastNumber = 0;
    if (trackerDoc.exists) {
      const data = trackerDoc.data();
      lastPrefix = data.last_prefix || "";
      lastNumber = Number(data.last_number || 0);
    }
    const nextNumber = (lastPrefix === currentPrefix) ? lastNumber + 1 : 1;
    const fullExpenseNo = `${currentPrefix}-${String(nextNumber).padStart(4, '0')}`;
    return { success: true, expenseNo: fullExpenseNo, prefix: currentPrefix, number: nextNumber };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function updateExpenseNoTracker(prefix, number) {
  try {
    await db.collection('expense_no').doc('current').set({ last_prefix: prefix, last_number: number }, { merge: true });
  } catch (e) {
    console.error("Error updating expense tracker:", e);
  }
}

// 🟢 2. บันทึก / แก้ไขรายการค่าใช้จ่าย (expense_records)
async function saveExpenseRecord(data) {
  try {
    if (!data) return { success: false, message: 'ไม่พบข้อมูลที่ส่งมาบันทึก' };

    const isUpdate = !!data.docId;
    let expenseNo = data.expenseNo || '';
    let trackerPrefix = '', trackerNumber = 0;

    if (!isUpdate) {
      const expNoInfo = await getNextExpenseNo(data.date);
      if (expNoInfo && expNoInfo.success) {
        expenseNo = expNoInfo.expenseNo;
        trackerPrefix = expNoInfo.prefix;
        trackerNumber = expNoInfo.number;
      }
    }

    const docId = isUpdate ? data.docId : expenseNo.replace(/\//g, "-");
    const formattedDate = toStandardYYYYMMDD(data.date);
    const formattedTransferDate = data.transferDate ? toStandardYYYYMMDD(data.transferDate) : '';

    const payload = {
      expenseNo: expenseNo,
      date: formattedDate,
      category: data.category || '',
      itemName: data.itemName || '',
      payeeName: data.payeeName || '',
      pricePerLiter: Number(data.pricePerLiter || 0),
      liters: Number(data.liters || 0),
      amount: Number(data.amount || 0),
      amountBeforeVat: Number(data.amountBeforeVat || 0),
      vatAmount: Number(data.vatAmount || 0),
      totalWithVat: Number(data.totalWithVat || 0),
      paymentType: data.paymentType || '',
      transferAccount: data.transferAccount || '',
      transferDate: formattedTransferDate,
      remarks: data.remarks || '',
      recordedBy: data.recordedBy || 'system',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (!isUpdate) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.isRequisition = false;
      payload.requisitionNo = '';
      payload.transferNo = '';
    }

    await db.collection('expense_records').doc(docId).set(payload, { merge: true });

    if (!isUpdate && trackerPrefix && trackerNumber) {
      await updateExpenseNoTracker(trackerPrefix, trackerNumber);
    }

    // ⛽ หากเป็นรายการซื้อน้ำมัน ให้ส่งไปอัปเดตสต็อกขาเข้า
    const categoryVal = String(payload.category || '').trim();
    if ((categoryVal === 'ซื้อน้ำมัน ท่าทอง' || categoryVal === 'ซื้อน้ำมัน P.C. Siam') && payload.liters > 0) {
      if (typeof updateStockOnFuelPurchase === 'function') {
        try {
          await updateStockOnFuelPurchase(payload, isUpdate);
        } catch (stockErr) {
          console.warn("⚠️ บันทึกค่าใช้จ่ายสำเร็จ แต่อัปเดตสต็อกน้ำมันเข้าผิดพลาด:", stockErr);
        }
      }
    }

    return { success: true, message: 'บันทึกสำเร็จ', expenseNo: expenseNo, docId: docId };
  } catch (err) {
    console.error("❌ Error in saveExpenseRecord:", err);
    return { success: false, message: err.message };
  }
}

// 🟢 3. ดึงรายการค่าใช้จ่ายตามช่วงวันที่
async function getExpenseRecordsRange(startDateStr, endDateStr, limitCount = 3000) {
  try {
    const startFormatted = startDateStr ? toStandardYYYYMMDD(startDateStr) : "";
    const endFormatted = endDateStr ? toStandardYYYYMMDD(endDateStr) : "";

    let query = db.collection('expense_records');
    if (startFormatted) query = query.where('date', '>=', startFormatted);
    if (endFormatted) query = query.where('date', '<=', endFormatted);

    const snapshot = await query.limit(limitCount).get();
    const records = [];
    snapshot.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getExpenseRecordsRange:", err);
    return { success: false, message: err.message, data: [] };
  }
}

// 🟢 4. ลบรายการค่าใช้จ่าย
async function deleteExpenseRecord(docId) {
  try {
    const docRef = db.collection('expense_records').doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return { success: false, message: 'ไม่พบรายการค่าใช้จ่าย' };

    const expData = docSnap.data();

    // 1. ลบเอกสารรายการค่าใช้จ่าย
    await docRef.delete();

    // 2. ⛽ หากเป็นรายการซื้อน้ำมัน ให้ลบออกจาก oil_stock และปรับลดยอดสะสมย้อนกลับ
    const category = String(expData.category || '').trim();
    const itemName = String(expData.itemName || '').trim();
    const liters = Number(expData.liters || 0);
    const isFuel = (category.includes('ซื้อน้ำมัน') || itemName.includes('95') || itemName.includes('ดีเซล')) && liters > 0;

    if (isFuel && typeof reverseStockOnFuelPurchase === 'function') {
      await reverseStockOnFuelPurchase(expData);
    }

    return { success: true, message: 'ลบรายการเรียบร้อยแล้ว' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// 🟢 5. จัดการหมวดหมู่ค่าใช้จ่าย (pay_records)
async function getPayRecords() {
  try {
    const snapshot = await db.collection('pay_record').get();
    const records = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      if (d.name) records.push({ id: doc.id, name: d.name });
    });
    records.sort((a, b) => a.name.localeCompare(b.name, 'th'));

    // เพิ่มหมวดตั้งต้นซื้อน้ำมันถ้ายังไม่มีในระบบ
    const defaultCategories = ["ซื้อน้ำมัน ท่าทอง", "ซื้อน้ำมัน P.C. Siam"];
    defaultCategories.forEach(cat => {
      if (!records.some(r => r.name === cat)) {
        records.unshift({ id: cat, name: cat });
      }
    });

    return { success: true, data: records };
  } catch (err) {
    return { success: false, message: err.message, data: [] };
  }
}

async function savePayRecord(payload) {
  try {
    if (!payload || !payload.name) return { success: false, message: 'ระบุชื่อรายการ' };
    const docRef = await db.collection('pay_records').add({
      name: payload.name.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, id: docRef.id };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// 🟢 6. ดึงรายชื่อบัญชีโอนเงิน (transfer_accounts)
async function getTransferAccounts() {
  try {
    const snapshot = await db.collection('transfer').get();
    const accounts = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      if (d.name) accounts.push({ id: doc.id, name: d.name });
    });

    if (accounts.length === 0) {
      accounts.push({ id: 'scb', name: 'ธนาคารไทยพาณิชย์ (SCB)' });
      accounts.push({ id: 'kbank', name: 'ธนาคารกสิกรไทย (KBANK)' });
      accounts.push({ id: 'cash', name: 'เงินสดหน้าร้าน' });
    }

    return { success: true, data: accounts };
  } catch (err) {
    return { success: false, data: [
      { id: 'scb', name: 'ธนาคารไทยพาณิชย์ (SCB)' },
      { id: 'kbank', name: 'ธนาคารกสิกรไทย (KBANK)' }
    ]};
  }
}

async function reverseStockOnFuelPurchase(expenseRecord) {
  try {
    const itemName = String(expenseRecord.itemName || expenseRecord.category || '').trim();
    let fuelType = null;
    if (itemName.includes('95')) fuelType = '95';
    else if (itemName.includes('ดีเซล') || itemName.toLowerCase().includes('diesel')) fuelType = 'diesel';

    if (!fuelType) return;

    const cleanExpenseNo = safeDocId(expenseRecord.expenseNo);
    const importDocRef = db.collection('oil_stock').doc(fuelType).collection('imports').doc(cleanExpenseNo);
    const oldSnap = await importDocRef.get();

    if (!oldSnap.exists) return;

    const oldData = oldSnap.data();
    const oldLiters = Number(oldData.liters || 0);
    const oldAmount = Number(oldData.amount || 0);
    const recDate = oldData.date || expenseRecord.date;

    // ลบออกจาก imports sub-collection
    await importDocRef.delete();

    // หักลดยอดใน summaries (ใส่ delta เป็นค่าลบ)
    await updateImportSummaries(fuelType, recDate, 0, 0, oldLiters, oldAmount, true);
    await updateOilStockParentSummary(fuelType);
  } catch (err) {
    console.error("❌ Error in reverseStockOnFuelPurchase:", err);
  }
}

// ==================== CLAIM SYSTEM HELPERS (ACCURATE TO LEGACY) ====================

// 🟢 1. ดึงรายการค่าใช้จ่ายสำหรับระบบตั้งเบิกภายใน (ตรงตาม Logic เดิม 100%)
async function getExpenseRecordsForClaim(startDateStr, endDateStr, currentStatus = 'unclaimed') {
  try {
    const startFormatted = startDateStr ? toStandardYYYYMMDD(startDateStr) : "";
    const endFormatted = endDateStr ? toStandardYYYYMMDD(endDateStr) : "";
    const isReqTarget = (currentStatus === 'claimed');

    let query = db.collection('expense_records');
    if (startFormatted) query = query.where('date', '>=', startFormatted);
    if (endFormatted) query = query.where('date', '<=', endFormatted);

    const snapshot = await query.limit(3000).get();
    const records = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const rawDate = data.date || "";
      const dateStd = toStandardYYYYMMDD(rawDate);

      // กรองช่วงวันที่ซ้ำอีกครั้งเพื่อความถูกต้อง
      if (dateStd && startFormatted && dateStd < startFormatted) return;
      if (dateStd && endFormatted && dateStd > endFormatted) return;

      const claimNoVal = String(data.requisitionNo || data.claimNo || '').trim();
      const isReq = (data.isRequisition === true) || (claimNoVal !== "");

      // กรองสถานะตั้งเบิกตาม Filter
      if (isReqTarget) {
        if (!isReq) return;
      } else {
        if (isReq) return;
      }

      records.push({
        id: doc.id,
        expenseNo: data.expenseNo || data.no || doc.id,
        date: rawDate || "-",
        category: data.category || data.itemName || "ค่าใช้จ่ายทั่วไป",
        description: data.remarks || data.payeeName || "-",
        totalAmount: parseFloat(data.totalWithVat || data.amount || 0),
        isRequisition: isReq,
        claimNo: claimNoVal,
        remarks: data.remarks || ""
      });
    });

    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getExpenseRecordsForClaim:", err);
    return { success: false, message: err.message, data: [] };
  }
}

// 🟢 2. รันเลขที่ใบตั้งเบิกถัดไป (เช่น SBCE1169-0001)
async function getNextClaimNo(dateStr) {
  try {
    const stdDate = toStandardYYYYMMDD(dateStr || new Date().toISOString().split('T')[0]);
    const parts = stdDate.split('/');
    
    let month = String(new Date().getMonth() + 1).padStart(2, '0');
    let yearBE = String(new Date().getFullYear() + 543).slice(-2);

    if (parts.length === 3) {
      month = String(parts[1]).padStart(2, '0');
      let yr = parseInt(parts[0], 10);
      if (yr < 2400) yr += 543;
      yearBE = String(yr).slice(-2);
    }

    const prefix = `SBCE${month}${yearBE}`;

    const trackerDoc = await db.collection('claim_no').doc('current').get();
    let lastPrefix = "", lastNumber = 0;

    if (trackerDoc.exists) {
      const data = trackerDoc.data();
      lastPrefix = data.last_prefix || "";
      lastNumber = Number(data.last_number || 0);
    }

    const nextNumber = (lastPrefix === prefix) ? lastNumber + 1 : 1;
    const fullClaimNo = `${prefix}-${String(nextNumber).padStart(4, '0')}`;
    return { success: true, claimNo: fullClaimNo, prefix: prefix, number: nextNumber };
  } catch (err) {
    console.error("❌ Error in getNextClaimNo:", err);
    return { success: false, message: err.message, claimNo: 'SBCE-0001' };
  }
}

// 🟢 3. ยืนยันตั้งเบิกค่าใช้จ่าย (บันทึก 'claim_records' และอัปเดต 'expense_records')
async function confirmClaim(expenseIds, claimDateStr, claimData) {
  try {
    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return { success: false, message: 'กรุณาเลือกอย่างน้อย 1 รายการ' };
    }

    const claimNoInfo = await getNextClaimNo(claimDateStr);
    const claimNo = claimNoInfo.claimNo;

    const payload = {
      claimNo: claimNo,
      claimDate: claimDateStr,
      totalAmount: Number(claimData.grandTotal || 0),
      grandTotal: Number(claimData.grandTotal || 0),
      itemCount: expenseIds.length,
      expenseNos: claimData.expenseNos || [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    // 1. บันทึกเอกสารใบตั้งเบิกลง collection 'claim_records' (ตรงตามระบบเดิม)
    await db.collection('claim_records').doc(claimNo.replace(/\//g, "-")).set(payload);

    // 2. อัปเดตตัวรันเลขใน collection 'claim_no'
    if (claimNoInfo.prefix && claimNoInfo.number) {
      await db.collection('claim_no').doc('current').set({
        last_prefix: claimNoInfo.prefix,
        last_number: claimNoInfo.number
      }, { merge: true });
    }

    // 3. อัปเดตรายการค่าใช้จ่ายใน 'expense_records' (บันทึกทั้ง claimNo และ requisitionNo)
    const batch = db.batch();
    expenseIds.forEach(id => {
      const ref = db.collection('expense_records').doc(String(id));
      batch.update(ref, {
        isRequisition: true,
        claimNo: claimNo,
        requisitionNo: claimNo,
        requisitionAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    return { success: true, claimNo: claimNo, message: 'บันทึกตั้งเบิกสำเร็จ' };
  } catch (err) {
    console.error("❌ Error in confirmClaim:", err);
    return { success: false, message: err.message };
  }
}

// ==================== PAYMENT SYSTEM HELPERS ====================

// 🟢 1. ดึงรายการขายเงินเชื่อรายเดือน (Collection: 'sales_records')
async function getCreditSalesByMonth(yearMonthStr, buyerFilter = 'ALL') {
  try {
    const parts = yearMonthStr.replace(/-/g, '/').split('/');
    const yearAD = parts[0];
    const month = String(parts[1]).padStart(2, '0');
    
    const lastDay = new Date(parseInt(yearAD, 10), parseInt(month, 10), 0).getDate();
    const startDate = `${yearAD}/${month}/01`;
    const endDate = `${yearAD}/${month}/${String(lastDay).padStart(2, '0')}`;

    let query = db.collection('sales_records');
    query = query.where('date', '>=', startDate).where('date', '<=', endDate);

    const snapshot = await query.limit(3000).get();
    const records = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const pType = String(data.paymentType || '').trim();
      const pStatus = String(data.paymentStatus || '').toLowerCase();

      // กรองเฉพาะรายการที่เป็นเงินเชื่อ หรือสถานะยังไม่ชำระ
      if (pType === 'เงินเชื่อ' || pStatus === 'unpaid') {
        const bName = String(data.buyerName || '').trim();
        if (buyerFilter === 'ALL' || bName === buyerFilter.trim()) {
          records.push({
            docId: doc.id,
            id: doc.id,
            ...data
          });
        }
      }
    });

    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getCreditSalesByMonth:", err);
    return { success: false, message: err.message, data: [] };
  }
}

// 🟢 2. อัปเดตสถานะชำระเงินของลูกหนี้เงินเชื่อ (Paid)
async function updateSalePaymentStatus(docId, paidDate, saleDate) {
  try {
    if (!docId) return { success: false, message: 'ไม่พบรหัสเอกสาร (docId)' };

    const cleanDocId = String(docId).replace(/\//g, "-").trim();
    const docRef = db.collection('sales_records').doc(cleanDocId);

    const updatePayload = {
      paymentStatus: 'paid',
      paidDate: paidDate || new Date().toISOString().split('T')[0],
      paidAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await docRef.update(updatePayload);

    // 📌 คำนวณสรุปยอดรายเดือนใหม่ (ถ้ามีฟังก์ชันนี้อยู่ในระบบ)
    if (typeof recalculateMonthlySummary === 'function') {
      await recalculateMonthlySummary(saleDate || paidDate);
    }

    return { success: true, message: 'อัปเดตสถานะการชำระเงินเรียบร้อยแล้ว' };
  } catch (err) {
    console.error("❌ Error in updateSalePaymentStatus:", err);
    return { success: false, message: err.message };
  }
}

// 🟢 3. ดึงรายการค่าใช้จ่ายบริษัทรายเดือน (Collection: 'expense_records')
async function getCompanyExpensesByMonth(yearMonthStr) {
  try {
    const parts = yearMonthStr.replace(/-/g, '/').split('/');
    const yearAD = parts[0];
    const month = String(parts[1]).padStart(2, '0');

    const lastDay = new Date(parseInt(yearAD, 10), parseInt(month, 10), 0).getDate();
    const startDate = `${yearAD}/${month}/01`;
    const endDate = `${yearAD}/${month}/${String(lastDay).padStart(2, '0')}`;

    let query = db.collection('expense_records');
    query = query.where('date', '>=', startDate).where('date', '<=', endDate);

    const snapshot = await query.limit(3000).get();
    const records = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      records.push({
        docId: doc.id,
        id: doc.id,
        ...data
      });
    });

    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getCompanyExpensesByMonth:", err);
    return { success: false, message: err.message, data: [] };
  }
}

// 🟢 4. อัปเดตสถานะการโอนจ่ายค่าใช้จ่ายบริษัท (Transferred)
async function updateExpenseTransferStatus(docId, transferAccount, transferDate, expDate) {
  try {
    if (!docId) return { success: false, message: 'ไม่พบรหัสเอกสาร (docId)' };

    const cleanDocId = String(docId).replace(/\//g, "-").trim();
    const expRef = db.collection('expense_records').doc(cleanDocId);

    // Step 1: อ่านข้อมูลยอดเงินและรายการเดิม
    const expDoc = await expRef.get();
    let amount = 0;
    let remarks = "โอนจ่ายค่าใช้จ่าย";

    if (expDoc.exists) {
      const f = expDoc.data();
      amount = parseFloat(f.totalWithVat || f.amount || 0);
      remarks = f.payeeName || f.itemName || f.category || remarks;
    }

    // Step 2: อัปเดตข้อมูลลง expense_records
    const finalTransferDate = transferDate || new Date().toISOString().split('T')[0];
    const updatePayload = {
      paymentType: 'เงินโอน',
      transferAccount: transferAccount || '',
      transferDate: finalTransferDate,
      transferStatus: 'transferred',
      transferredAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await expRef.update(updatePayload);

    // Step 3: บันทึกข้อมูลลง Collection transfer_records
    try {
      await db.collection('transfer_records').add({
        date: finalTransferDate || expDate,
        fromAccount: transferAccount || '',
        amount: amount,
        remarks: remarks,
        expenseDocId: cleanDocId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (tErr) {
      console.warn("⚠️ ไม่สามารถบันทึก transfer_records ได้:", tErr);
    }

    // Step 4: คำนวณสรุปยอดรายเดือนใหม่ (ถ้ามีฟังก์ชันนี้อยู่ในระบบ)
    if (typeof recalculateMonthlySummary === 'function') {
      await recalculateMonthlySummary(expDate || finalTransferDate);
    }

    return { success: true, message: 'บันทึกเรียบร้อย' };
  } catch (err) {
    console.error("❌ Error in updateExpenseTransferStatus:", err);
    return { success: false, message: err.message };
  }
}

// ==================== RECEIPT SYSTEM HELPERS ====================

/**
 * 🟢 1. ดึงรายการขายที่ยังไม่ได้ออกใบเสร็จรับเงิน (isReceiptIssued != true)
 */
async function getUnreceiptedSalesRecords(yearMonthStr, buyerFilter = 'ALL') {
  try {
    const parts = yearMonthStr.replace(/-/g, '/').split('/');
    const yearAD = parts[0];
    const month = String(parts[1]).padStart(2, '0');

    const lastDay = new Date(parseInt(yearAD, 10), parseInt(month, 10), 0).getDate();
    const startDate = `${yearAD}/${month}/01`;
    const endDate = `${yearAD}/${month}/${String(lastDay).padStart(2, '0')}`;

    let query = db.collection('sales_records');
    query = query.where('date', '>=', startDate).where('date', '<=', endDate);

    const snapshot = await query.limit(3000).get();
    const records = [];

    snapshot.forEach(doc => {
      const f = doc.data();
      const isReceiptIssued = f.isReceiptIssued === true;

      // ข้ามรายการที่ออกใบเสร็จไปแล้ว
      if (isReceiptIssued) return;

      const buyerName = String(f.buyerName || '').trim();

      // กรองชื่อผู้ซื้อ (ถ้าระบุ)
      if (buyerFilter && buyerFilter !== 'ALL' && buyerName !== buyerFilter.trim()) return;

      const pricePerLiter = parseFloat(f.pricePerLiter || f.unitPrice || 0);
      const liters = parseFloat(f.liters || f.qty || 0);
      const qty = parseFloat(f.qty || liters || 0);
      const unitPrice = parseFloat(f.unitPrice || pricePerLiter || 0);
      const totalAmount = parseFloat(f.totalAmount || 0);

      records.push({
        id: doc.id,
        docId: doc.id,
        saleNo: f.saleNo || doc.id,
        date: f.date || '-',
        buyerName: buyerName || '-',
        itemType: f.itemType || 'น้ำมัน',
        itemName: f.itemName || f.itemType || 'น้ำมัน',
        pricePerLiter: pricePerLiter,
        unitPrice: unitPrice,
        liters: liters,
        qty: qty,
        totalAmount: totalAmount,
        remarks: f.remarks || ''
      });
    });

    // เรียงลำดับ: วันที่น้อยไปมาก ➔ เลขที่บิลน้อยไปมาก
    records.sort((a, b) => {
      if (a.date !== b.date) {
        return (a.date || '').localeCompare(b.date || '');
      }
      return (a.saleNo || '').localeCompare(b.saleNo || '', undefined, { numeric: true, sensitivity: 'base' });
    });

    return { success: true, data: records };
  } catch (err) {
    console.error("❌ Error in getUnreceiptedSalesRecords:", err);
    return { success: false, message: err.message, data: [] };
  }
}

/**
 * 🟢 2. ดึงข้อมูลผู้ซื้อทั้งหมด (buyer collection) สำหรับทำ Mapping
 */
async function getBuyerMapFromFirestore() {
  try {
    const snapshot = await db.collection('buyer').get();
    const buyerMap = {};

    snapshot.forEach(doc => {
      const f = doc.data();
      const name = (f.name || '').trim();
      if (name) {
        buyerMap[name] = {
          name: (f.fullname || name).trim(),
          addr: (f.address || '').trim(),
          tax: (f.taxid || '').trim()
        };
      }
    });

    return buyerMap;
  } catch (err) {
    console.error("❌ Error fetching buyer collection:", err);
    return {};
  }
}

/**
 * 🟢 3. เรียก API / Web App สร้างไฟล์ PDF ใบเสร็จรับเงินจาก Google Slides Template
 */
async function createBatchReceiptsFromFirestore(selectedSaleIds) {
  try {
    if (!selectedSaleIds || !Array.isArray(selectedSaleIds) || selectedSaleIds.length === 0) {
      return { success: false, message: "กรุณาเลือกรายการที่ต้องการออกใบเสร็จ" };
    }

    // กรณีเชื่อมต่อผ่าน Endpoint / Function บันทึกออกใบเสร็จ
    if (typeof callBackendApi === 'function') {
      return await callBackendApi('createBatchReceiptsFromFirestore', { selectedSaleIds });
    }

    // กรณีอัปเดตสถานะใน Firestore Client Direct (สำรอง)
    const batch = db.batch();
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');

    selectedSaleIds.forEach(docId => {
      const docRef = db.collection('sales_records').doc(docId);
      batch.update(docRef, {
        isReceiptIssued: true,
        receiptDate: todayStr,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    return {
      success: true,
      count: selectedSaleIds.length,
      message: "อัปเดตสถานะออกใบเสร็จเรียบร้อยแล้ว"
    };
  } catch (err) {
    console.error("❌ Error in createBatchReceiptsFromFirestore:", err);
    return { success: false, message: err.message };
  }
}

async function updateSalesReceiptStatusInFirestore(selectedSaleIds) {
  try {
    const batch = db.batch();
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');

    selectedSaleIds.forEach(docId => {
      const docRef = db.collection('sales_records').doc(docId);
      batch.update(docRef, {
        isReceiptIssued: true,
        receiptDate: todayStr,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    return { success: true };
  } catch (err) {
    console.error("❌ Error in updateSalesReceiptStatusInFirestore:", err);
    return { success: false, message: err.message };
  }
}