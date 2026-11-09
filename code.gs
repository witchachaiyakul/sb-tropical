/**
 * SB Tropical Backend System (Code.gs)
 * เชื่อมต่อ Firestore โดยตรงจาก Server
 */

// Central Section/////////////
function getFirestoreUrl(collection) {
  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty('FIREBASE_PROJECT_ID') || 'sb-tropical';
  var apiKey = props.getProperty('FIREBASE_API_KEY') || '';
  
  var url = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/" + (collection || '');
  
  if (apiKey) {
    url += "?key=" + apiKey;
  }
  return url;
}

// 1. หน้าแรกของ Web App
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('SB Tropical')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 2. ระบบ Login ตรวจสอบกับ Collection "users" ใน Firestore
function checkLogin(username, password) {
  try {
    var result = callFirestore("GET", "users");
    
    if (result && !result.error) {
      var docs = result.documents || [];

      for (var i = 0; i < docs.length; i++) {
        var fields = docs[i].fields || {};
        var u = fields.username ? fields.username.stringValue : '';
        var p = fields.password ? fields.password.stringValue : '';

        if (u === username && p === password) {
          return {
            success: true,
            user: {
              username: u,
              name: fields.name ? fields.name.stringValue : u,
              role: fields.role ? fields.role.stringValue : 'staff'
            }
          };
        }
      }
      return { success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง (ข้อมูลไม่ตรงกับใน Firestore)' };
    }

    return { 
      success: false, 
      message: 'เชื่อมต่อ Firestore ไม่สำเร็จ: ' + JSON.stringify(result.error || result) 
    };

  } catch (err) {
    return { success: false, message: 'เกิดข้อผิดพลาดในระบบ: ' + err.toString() };
  }
}

function getVal(field) {
  if (!field) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.integerValue !== undefined) return parseInt(field.integerValue, 10);
  if (field.doubleValue !== undefined) return parseFloat(field.doubleValue);
  if (field.timestampValue !== undefined) return field.timestampValue;
  
  if (field.arrayValue !== undefined) {
    return (field.arrayValue.values || []).map(getVal);
  }
  if (field.mapValue !== undefined) {
    var obj = {};
    var mapFields = field.mapValue.fields || {};
    for (var key in mapFields) {
      obj[key] = getVal(mapFields[key]);
    }
    return obj;
  }

  return null;
}

/**
 * ฟังก์ชันผู้ช่วย: แปลงและจัดรูปแบบวันที่ให้เป็น yyyy/MM/dd (ค.ศ.)
 */
function parseAndFormatDate(val) {
  if (!val) return "";
  var year, month, day;
  if (val instanceof Date) {
    year = val.getFullYear();
    month = val.getMonth() + 1;
    day = val.getDate();
  } else {
    var str = val.toString().trim();
    if (!str) return "";
    var parts = str.split(/[\/\-\.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      }
    } else {
      return str;
    }
  }
  if (year > 2500) year -= 543;
  return year + "/" + String(month).padStart(2, '0') + "/" + String(day).padStart(2, '0');
}

function getProjectId() {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('FIREBASE_PROJECT_ID');
  if (projectId) return projectId;

  const keyFileRaw = props.getProperty('FIREBASE_KEY');
  if (keyFileRaw) {
    try {
      const keyFile = JSON.parse(keyFileRaw);
      return keyFile.project_id || '';
    } catch (e) {
      console.error("❌ ไม่สามารถ Parse ข้อมูล FIREBASE_KEY ได้: " + e.message);
    }
  }
  return '';
}

function callFirestore(method, path, payload) {
  if (payload === undefined) payload = null;
  const scriptProperties = PropertiesService.getScriptProperties();
  const keyFileRaw = scriptProperties.getProperty('FIREBASE_KEY');
  if (!keyFileRaw) {
    throw new Error("❌ ไม่พบคีย์ FIREBASE_KEY ใน Script Properties");
  }

  const keyFile = JSON.parse(keyFileRaw);
  const token = getAccessToken(keyFile);
  const projectId = keyFile.project_id || getProjectId();
  
  let baseUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents";
  let finalUrl = baseUrl;
  
  if (path) {
    if (path.startsWith(':') || path.startsWith('?')) {
      finalUrl += path; 
    } else {
      finalUrl += '/' + path; 
    }
  }

  const options = {
    method: method,
    headers: { 
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    muteHttpExceptions: true
  };

  if (payload) options.payload = JSON.stringify(payload);

  const response = UrlFetchApp.fetch(finalUrl, options);
  const resText = response.getContentText();
  
  let resJson;
  try {
    resJson = JSON.parse(resText);
  } catch (e) {
    console.error("❌ ไม่สามารถ Parse JSON ตอบกลับได้: " + resText.substring(0, 100));
    return { error: "HTML_RESPONSE_ERROR", details: resText.substring(0, 100) };
  }
  
  if (resJson.error) {
    console.error("⚠️ Firestore Error: " + JSON.stringify(resJson.error));
  }
  
  return resJson;
}

function getAccessToken(keyFile) {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get("FIRESTORE_ACCESS_TOKEN");
  if (cachedToken) return cachedToken;

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: keyFile.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encodeBase64Url = function(obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  };

  const encodedHeader = encodeBase64Url(header);
  const encodedClaimSet = encodeBase64Url(claimSet);
  const toSign = encodedHeader + "." + encodedClaimSet;

  const signature = Utilities.computeRsaSha256Signature(toSign, keyFile.private_key);
  const encodedSignature = Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');

  const jwt = toSign + "." + encodedSignature;

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });

  const resJson = JSON.parse(response.getContentText());
  if (resJson.access_token) {
    cache.put("FIRESTORE_ACCESS_TOKEN", resJson.access_token, 3300);
    return resJson.access_token;
  } else {
    throw new Error("❌ เกิดข้อผิดพลาดในการขอ Access Token: " + JSON.stringify(resJson));
  }
}

function toFirestoreFields(obj) {
  if (obj === null || obj === undefined) {
    return { nullValue: null };
  }
  
  const type = typeof obj;

  if (type === 'boolean') {
    return { booleanValue: obj };
  }

  if (type === 'number') {
    if (Number.isInteger(obj)) {
      return { integerValue: String(obj) };
    }
    return { doubleValue: obj };
  }

  if (type === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      return { timestampValue: obj };
    }
    return { stringValue: obj };
  }

  if (obj instanceof Date) {
    return { timestampValue: obj.toISOString() };
  }

  if (Array.isArray(obj)) {
    return {
      arrayValue: {
        values: obj.map(function(item) { return toFirestoreFields(item); })
      }
    };
  }

  if (type === 'object') {
    const fields = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fields[key] = toFirestoreFields(obj[key]);
      }
    }
    return { fields: fields };
  }

  return { stringValue: String(obj) };
}

function normalizeDateStandard(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  var cleanStr = dateStr.trim().replace(/-/g, '/');
  var parts = cleanStr.split('/');
  
  if (parts.length === 3) {
    // กรณี YYYY/MM/DD
    if (parts[0].length === 4) {
      var yr0 = parseInt(parts[0], 10);
      var year0 = yr0 > 2400 ? (yr0 - 543) : yr0;
      return year0 + '/' + parts[1].padStart(2, '0') + '/' + parts[2].padStart(2, '0');
    }
    // กรณี DD/MM/YYYY
    if (parts[2].length === 4) {
      var yr2 = parseInt(parts[2], 10);
      var year2 = yr2 > 2400 ? (yr2 - 543) : yr2;
      return year2 + '/' + parts[1].padStart(2, '0') + '/' + parts[0].padStart(2, '0');
    }
  }
  return cleanStr;
}

// Sales Records Section//////////////////
// Sales Records Section//////////////////
// Sales Records Section//////////////////
function getSalesRecords() {
  try {
    var url = getFirestoreUrl("sales_records");
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    if (res.getResponseCode() !== 200) {
      return { success: true, data: [] };
    }

    var result = JSON.parse(res.getContentText());
    var docs = result.documents || [];
    var list = [];

    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      var f = doc.fields || {};
      list.push({
        id: doc.name.split('/').pop(),
        saleNo: f.saleNo ? f.saleNo.stringValue : '',
        date: f.date ? f.date.stringValue : '',
        buyerName: f.buyerName ? f.buyerName.stringValue : '',
        itemType: f.itemType ? f.itemType.stringValue : 'น้ำมัน',
        itemName: f.itemName ? f.itemName.stringValue : 'น้ำมัน',
        pricePerLiter: f.pricePerLiter ? (f.pricePerLiter.doubleValue || f.pricePerLiter.integerValue || 0) : 0,
        liters: f.liters ? (f.liters.doubleValue || f.liters.integerValue || 0) : 0,
        qty: f.qty ? (f.qty.doubleValue || f.qty.integerValue || 0) : 0,
        unitPrice: f.unitPrice ? (f.unitPrice.doubleValue || f.unitPrice.integerValue || 0) : 0,
        precision: f.precision ? Number(f.precision.integerValue || 2) : 2,
        totalAmount: f.totalAmount ? (f.totalAmount.doubleValue || f.totalAmount.integerValue || 0) : 0,
        paymentType: f.paymentType ? f.paymentType.stringValue : 'เงินสด',
        remarks: f.remarks ? f.remarks.stringValue : ''
      });
    }

    list.sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString(), data: [] };
  }
}

/**
 * ดึงและกรองข้อมูลการขายจาก field 'date' บน Firestore โดยตรง
 */
function getSalesRecordsRange(startDate, endDate, limitVal) {
  try {
    var maxLimit = limitVal || 4000;

    var startFormatted = startDate.replace(/-/g, "/");
    var endFormatted = endDate.replace(/-/g, "/");

    Logger.log("=== [getSalesRecordsRange via Field Query] START ===");
    Logger.log("Filtering Field 'date' between: " + startFormatted + " AND " + endFormatted);

    var queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "sales_records" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "date" },
                  op: "GREATER_THAN_OR_EQUAL",
                  value: { stringValue: startFormatted }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: "date" },
                  op: "LESS_THAN_OR_EQUAL",
                  value: { stringValue: endFormatted }
                }
              }
            ]
          }
        },
        orderBy: [
          {
            field: { fieldPath: "date" },
            direction: "DESCENDING"
          }
        ],
        limit: maxLimit
      }
    };

    var queryRes = callFirestore("POST", ":runQuery", queryPayload);

    if (!queryRes || !Array.isArray(queryRes)) {
      Logger.log("❌ Firestore Query Error: " + JSON.stringify(queryRes));
      return { success: false, message: "Firestore Query Error: " + JSON.stringify(queryRes) };
    }

    var records = [];

    queryRes.forEach(function(item) {
      if (!item.document) return;
      var doc = item.document;
      var fields = doc.fields || {};
      var docName = doc.name || "";
      var id = docName.split("/").pop();

      records.push({
        id: id,
        saleNo: fields.saleNo ? fields.saleNo.stringValue : "",
        date: fields.date ? fields.date.stringValue : "",
        buyerName: fields.buyerName ? fields.buyerName.stringValue : "",
        itemType: fields.itemType ? fields.itemType.stringValue : "น้ำมัน",
        itemName: fields.itemName ? fields.itemName.stringValue : "",
        pricePerLiter: fields.pricePerLiter ? (fields.pricePerLiter.doubleValue || fields.pricePerLiter.integerValue || 0) : 0,
        liters: fields.liters ? (fields.liters.doubleValue || fields.liters.integerValue || 0) : 0,
        qty: fields.qty ? (fields.qty.doubleValue || fields.qty.integerValue || 0) : 0,
        unitPrice: fields.unitPrice ? (fields.unitPrice.doubleValue || fields.unitPrice.integerValue || 0) : 0,
        precision: fields.precision ? parseInt(fields.precision.integerValue || fields.precision.doubleValue || 2, 10) : 2,
        totalAmount: fields.totalAmount ? (fields.totalAmount.doubleValue || fields.totalAmount.integerValue || 0) : 0,
        paymentType: fields.paymentType ? fields.paymentType.stringValue : "เงินสด",
        remarks: fields.remarks ? fields.remarks.stringValue : ""
      });
    });

    Logger.log("✅ ดึงข้อมูลสำเร็จจาก field 'date': " + records.length + " รายการ");

    return { 
      success: true, 
      data: records
    };
  } catch (err) {
    Logger.log("❌ Exception in getSalesRecordsRange: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

// 4. ดึงข้อมูลผู้ซื้อทั้งหมดจาก Collection "buyer" บน Firestore
function getBuyers() {
  try {
    var url = getFirestoreUrl("buyer");
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var statusCode = response.getResponseCode();

    if (statusCode === 200) {
      var result = JSON.parse(response.getContentText());
      var docs = result.documents || [];
      var buyers = [];

      for (var i = 0; i < docs.length; i++) {
        var fields = docs[i].fields || {};
        var shortName = fields.name ? fields.name.stringValue : '';
        var fullName = fields.fullname ? fields.fullname.stringValue : '';
        var taxid = fields.taxid ? fields.taxid.stringValue : '';
        var address = fields.address ? fields.address.stringValue : '';

        if (shortName || fullName) {
          buyers.push({
            id: docs[i].name.split('/').pop(),
            name: shortName,
            fullname: fullName,
            taxid: taxid,
            address: address
          });
        }
      }

      buyers.sort(function(a, b) {
        return (a.name || a.fullname).localeCompare((b.name || b.fullname), 'th');
      });

      return { success: true, data: buyers };
    }

    return { success: false, message: 'ไม่สามารถดึงข้อมูลได้ [HTTP ' + statusCode + ']', data: [] };
  } catch (err) {
    return { success: false, message: err.toString(), data: [] };
  }
}

// 5. ลบรายการขาย
function deleteSaleRecord(docId) {
  try {
    var url = getFirestoreUrl("sales_records/" + docId);
    var res = UrlFetchApp.fetch(url, { method: 'delete', muteHttpExceptions: true });
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      return { success: true, message: 'ลบเรียบร้อย' };
    } else {
      return { success: false, message: res.getContentText() };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 7. คำนวณเลขเอกสารการขายถัดไป
function getNextSaleNo(dateStr) {
  try {
    var dateObj = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(dateObj.getTime())) dateObj = new Date();

    var month = String(dateObj.getMonth() + 1).padStart(2, '0');
    var yearBE = String(dateObj.getFullYear() + 543).slice(-2);
    var currentPrefix = "SB" + month + yearBE;

    var url = getFirestoreUrl("sales_no/current");
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    var lastPrefix = "";
    var lastNumber = 0;

    if (response.getResponseCode() === 200) {
      var result = JSON.parse(response.getContentText());
      var fields = result.fields || {};
      lastPrefix = fields.last_prefix ? fields.last_prefix.stringValue : "";
      lastNumber = fields.last_number ? Number(fields.last_number.integerValue || fields.last_number.doubleValue || 0) : 0;
    }

    var nextNumber = 1;
    if (lastPrefix === currentPrefix) {
      nextNumber = lastNumber + 1;
    }

    var formattedNumber = String(nextNumber).padStart(4, '0');
    var fullSaleNo = currentPrefix + "-" + formattedNumber;

    return {
      success: true,
      saleNo: fullSaleNo,
      prefix: currentPrefix,
      number: nextNumber
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 8. อัปเดตตัวนับเลขเอกสารการขาย
function updateSalesNoTracker(prefix, number) {
  try {
    var url = getFirestoreUrl("sales_no/current");
    var payload = {
      fields: {
        last_prefix: { stringValue: prefix },
        last_number: { integerValue: number }
      }
    };
    var options = {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log("Error updateSalesNoTracker: " + e.toString());
  }
}

// 9. บันทึกข้อมูลการขาย (ฉบับปรับปรุงเพิ่มการอัปเดตยอดสะสมรายลูกค้า)
function saveSaleRecord(data) {
  try {
    Logger.log("=== [1. START] saveSaleRecord ===");
    Logger.log("📥 Raw input data: " + JSON.stringify(data));

    if (!data) {
      Logger.log("❌ Error: No data received");
      return { success: false, message: 'ไม่พบข้อมูลที่ส่งมาบันทึก' };
    }

    var isUpdate = data.docId ? true : false;
    var generatedReceiptNo = "";
    
    // 1. กรณีสร้างรายการใหม่: เจนเลขที่ใบขาย + เจนเลขที่ใบเสร็จรับเงิน
    if (!isUpdate) {
      // 1.1 เจนเลขที่ใบขาย
      var saleNoInfo = getNextSaleNo(data.date);
      if (saleNoInfo && saleNoInfo.success) {
        data.saleNo = saleNoInfo.saleNo;
        updateSalesNoTracker(saleNoInfo.prefix, saleNoInfo.number);
      } else {
        Logger.log("❌ Error generating saleNo");
        return { success: false, message: 'ไม่สามารถสร้างเลขที่ใบขายได้' };
      }

      // 1.2 📌 เจนเลขที่ใบเสร็จทันทีเพื่อจองเลขล่วงหน้า
      try {
        generatedReceiptNo = getNextReceiptNumber();
        data.receiptNo = generatedReceiptNo;
      } catch (receiptErr) {
        Logger.log("⚠️ ไม่สามารถสร้างเลขที่ใบเสร็จได้: " + receiptErr.toString());
      }
    }

    // 2. กำหนด docId และตรวจสอบความถูกต้อง
    var rawSaleNo = data.saleNo || '';
    var docId = isUpdate ? data.docId : rawSaleNo.replace(/\//g, "-");
    if (!docId) {
      Logger.log("❌ Error: docId is invalid");
      return { success: false, message: 'รหัสเอกสาร (docId) ไม่ถูกต้อง' };
    }

    var url = getFirestoreUrl("sales_records/" + docId);

    function safeNum(val) {
      var n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }

    function safeInt(val, defaultVal) {
      var n = parseInt(val, 10);
      return isNaN(n) ? (defaultVal || 0) : n;
    }

    // กำหนดมาตรฐานวันที่เป็น YYYY/MM/DD
    var formattedDate = String(data.date || '').replace(/-/g, '/').trim();

    // 3. จัดโครงสร้าง Payload
    var payloadFields = {
      saleNo: { stringValue: rawSaleNo },
      receiptNo: { stringValue: data.receiptNo || '' }, // 📌 บันทึกเลขที่ใบเสร็จ
      date: { stringValue: formattedDate },
      buyerName: { stringValue: data.buyerName || '' },
      itemType: { stringValue: data.itemType || 'น้ำมัน' },
      itemName: { stringValue: data.itemName || 'น้ำมัน' },
      pricePerLiter: { doubleValue: safeNum(data.pricePerLiter) },
      liters: { doubleValue: safeNum(data.liters) },
      qty: { doubleValue: safeNum(data.qty) },
      unitPrice: { doubleValue: safeNum(data.unitPrice) },
      precision: { integerValue: safeInt(data.precision, 2) },
      totalAmount: { doubleValue: safeNum(data.totalAmount) },
      paymentType: { stringValue: data.paymentType || 'เงินสด' },
      remarks: { stringValue: data.remarks || '' },
      recordedBy: { stringValue: data.recordedBy || 'system' },
      updatedAt: { timestampValue: new Date().toISOString() }
    };

    if (!isUpdate) {
      payloadFields.createdAt = { timestampValue: new Date().toISOString() };
      payloadFields.isBilled = { booleanValue: false };
      payloadFields.isReceiptIssued = { booleanValue: false }; // 📌 สถานะยังไม่ออกใบเสร็จ
      payloadFields.paymentStatus = { stringValue: data.paymentType === 'เงินเชื่อ' ? 'unpaid' : 'paid' };
    } else {
      if (data.createdAt) payloadFields.createdAt = { timestampValue: data.createdAt };
      if (typeof data.isBilled !== 'undefined') {
        var isBilledVal = (data.isBilled === true || data.isBilled === 'true');
        payloadFields.isBilled = { booleanValue: isBilledVal };
      }
      if (typeof data.isReceiptIssued !== 'undefined') {
        var isReceiptIssuedVal = (data.isReceiptIssued === true || data.isReceiptIssued === 'true');
        payloadFields.isReceiptIssued = { booleanValue: isReceiptIssuedVal };
      }
      if (data.paymentStatus) payloadFields.paymentStatus = { stringValue: data.paymentStatus };
    }

    var payload = { fields: payloadFields };

    var options = {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    Logger.log("💾 sales_records PATCH Response Code: " + res.getResponseCode());

    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {

      // 4. ⛽ ตัดสต็อกน้ำมัน
      var itemType = String(data.itemType || '').trim();
      var itemName = String(data.itemName || '').trim();
      var liters = safeNum(data.liters || data.qty);
      var totalAmount = safeNum(data.totalAmount);

      var isFuelSale = (itemType === 'น้ำมัน' || itemName.includes('95') || itemName.includes('ดีเซล')) && liters > 0;

      if (isFuelSale && typeof updateStockOnFuelSale === 'function') {
        try {
          Logger.log("⛽ Running updateStockOnFuelSale...");
          updateStockOnFuelSale(data, isUpdate);
        } catch (stockErr) {
          Logger.log("⚠️ บันทึก sales_records สำเร็จ แต่ตัดสต็อกผิดพลาด: " + stockErr.toString());
        }
      }

      // 5. 📊 อัปเดตข้อมูลสรุปการเงินรายเดือน
      if (typeof updateMonthlyFinancialSummary === 'function') {
        try {
          updateMonthlyFinancialSummary(data);
        } catch (summaryErr) {
          Logger.log("⚠️ บันทึก sales_records สำเร็จ แต่สรุปการเงินผิดพลาด: " + summaryErr.toString());
        }
      }

      // 6. 👤 อัปเดตยอดขายสะสมใน Collection buyer
      if (data.buyerName && typeof updateBuyerSalesSummary === 'function') {
        try {
          Logger.log("👤 Running updateBuyerSalesSummary...");
          updateBuyerSalesSummary(data.buyerName, itemName, liters, totalAmount, isUpdate);
        } catch (buyerErr) {
          Logger.log("⚠️ บันทึก sales_records สำเร็จ แต่อัปเดตยอดสะสมลูกค้าผิดพลาด: " + buyerErr.toString());
        }
      }

      return { 
        success: true, 
        message: 'บันทึกสำเร็จ', 
        saleNo: rawSaleNo, 
        receiptNo: data.receiptNo || '', 
        docId: docId 
      };
    } else {
      Logger.log("❌ Firestore Error: " + res.getContentText());
      return { success: false, message: 'Firestore Error: ' + res.getContentText() };
    }
  } catch (err) {
    Logger.log("💥 CATCH EXCEPTION in saveSaleRecord: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

/**
 * อัปเดตยอดขายสะสม (ลิตร และ จำนวนเงิน) ใน Collection 'buyer'
 */
function updateBuyerSalesSummary(buyerName, itemName, liters, totalAmount, isUpdate) {
  try {
    if (!buyerName || liters <= 0) return;

    // 1. จำแนกคีย์ชนิดน้ำมัน ('95' หรือ 'diesel')
    var nameLower = String(itemName).toLowerCase();
    var oilKey = "";
    if (nameLower.indexOf("95") !== -1) {
      oilKey = "95";
    } else if (nameLower.indexOf("ดีเซล") !== -1 || nameLower.indexOf("diesel") !== -1) {
      oilKey = "diesel";
    }

    if (!oilKey) return; // หากไม่ใช่น้ำมัน 95 หรือ ดีเซล ให้ข้าม

    // 2. ค้นหา Document ID ของลูกค้าจากชื่อ
    var buyersRes = getBuyers();
    if (!buyersRes.success || !buyersRes.data || buyersRes.data.length === 0) return;

    var targetBuyer = buyersRes.data.find(function(b) {
      return (b.name && b.name.trim() === buyerName.trim()) || 
             (b.fullname && b.fullname.trim() === buyerName.trim());
    });

    if (!targetBuyer || !targetBuyer.id) {
      Logger.log("⚠️ ไม่พบข้อมูลลูกค้าชื่อ: " + buyerName + " ใน Collection buyer");
      return;
    }

    var docId = targetBuyer.id;
    var baseUrl = getFirestoreUrl("buyer/" + docId);

    // 3. อ่านข้อมูลเดิมของลูกค้าเพื่อดึง salesSummary ปัจจุบัน
    var currentSummary = {
      "95": { totalLiters: 0, totalAmount: 0 },
      "diesel": { totalLiters: 0, totalAmount: 0 }
    };

    var getRes = UrlFetchApp.fetch(baseUrl, { method: "get", muteHttpExceptions: true });
    if (getRes.getResponseCode() === 200) {
      var docJson = JSON.parse(getRes.getContentText());
      if (docJson.fields && docJson.fields.salesSummary && docJson.fields.salesSummary.mapValue) {
        var mapFields = docJson.fields.salesSummary.mapValue.fields || {};
        
        ['95', 'diesel'].forEach(function(k) {
          if (mapFields[k] && mapFields[k].mapValue && mapFields[k].mapValue.fields) {
            var f = mapFields[k].mapValue.fields;
            currentSummary[k].totalLiters = parseFloat(f.totalLiters?.doubleValue || f.totalLiters?.integerValue || 0);
            currentSummary[k].totalAmount = parseFloat(f.totalAmount?.doubleValue || f.totalAmount?.integerValue || 0);
          }
        });
      }
    }

    // 4. คำนวณยอดสะสมใหม่ (กรณีรายการใหม่ให้นำไปบวกเพิ่ม)
    if (!isUpdate) {
      currentSummary[oilKey].totalLiters += liters;
      currentSummary[oilKey].totalAmount += totalAmount;
    }

    // 5. จัดรูปแบบ Payload สำหรับอัปเดต Map
    var payload = {
      fields: {
        salesSummary: {
          mapValue: {
            fields: {
              "95": {
                mapValue: {
                  fields: {
                    totalLiters: { doubleValue: currentSummary["95"].totalLiters },
                    totalAmount: { doubleValue: currentSummary["95"].totalAmount },
                    lastUpdated: { timestampValue: new Date().toISOString() }
                  }
                }
              },
              "diesel": {
                mapValue: {
                  fields: {
                    totalLiters: { doubleValue: currentSummary["diesel"].totalLiters },
                    totalAmount: { doubleValue: currentSummary["diesel"].totalAmount },
                    lastUpdated: { timestampValue: new Date().toISOString() }
                  }
                }
              }
            }
          }
        }
      }
    };

    // 🟢 ตรวจสอบการต่อ URL Parameter ให้ถูกต้อง (ใช้ & แทน ? หาก baseUrl มี ? อยู่แล้ว)
    var paramSeparator = baseUrl.indexOf('?') !== -1 ? '&' : '?';
    var patchUrl = baseUrl + paramSeparator + "updateMask.fieldPaths=salesSummary";

    var patchRes = UrlFetchApp.fetch(patchUrl, {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var status = patchRes.getResponseCode();
    if (status >= 200 && status < 300) {
      Logger.log("✅ อัปเดต salesSummary ของ " + buyerName + " สำเร็จ! (" + oilKey + ")");
    } else {
      Logger.log("❌ อัปเดต salesSummary ไม่สำเร็จ Code: " + status + " Response: " + patchRes.getContentText());
    }

  } catch (err) {
    Logger.log("❌ Exception in updateBuyerSalesSummary: " + err.toString());
  }
}

// 10. บันทึกรายชื่อผู้ซื้อใหม่
function saveBuyerRecord(data) {
  try {
    var url = getFirestoreUrl("buyer");
    var payload = {
      fields: {
        name: { stringValue: data.name || '' },
        fullname: { stringValue: data.fullname || '' },
        taxid: { stringValue: data.taxid || '' },
        address: { stringValue: data.address || '' },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      return { success: true, message: 'บันทึกรายชื่อผู้ซื้อเรียบร้อยแล้ว' };
    } else {
      return { success: false, message: 'Firestore Error: ' + res.getContentText() };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

//Expense Section///
//Expense Section///
//Expense Section///
function getExpenseRecordsRange(startDate, endDate, limitVal) {
  try {
    var maxLimit = limitVal || 3000;
    var startFormatted = startDate.replace(/-/g, "/");
    var endFormatted = endDate.replace(/-/g, "/");

    var queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "expense_records" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: startFormatted } } },
              { fieldFilter: { field: { fieldPath: "date" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: endFormatted } } }
            ]
          }
        },
        orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
        limit: maxLimit
      }
    };

    var queryRes = callFirestore("POST", ":runQuery", queryPayload);
    if (!queryRes || !Array.isArray(queryRes)) {
      return { success: false, message: "Firestore Query Error: " + JSON.stringify(queryRes) };
    }

    var records = [];
    queryRes.forEach(function(item) {
      if (!item.document) return;
      var doc = item.document;
      var fields = doc.fields || {};
      var docName = doc.name || "";
      var id = docName.split("/").pop();

      records.push({
        id: id,
        expenseNo: fields.expenseNo ? fields.expenseNo.stringValue : "",
        date: fields.date ? fields.date.stringValue : "",
        category: fields.category ? fields.category.stringValue : "",
        itemName: fields.itemName ? fields.itemName.stringValue : "",
        payeeName: fields.payeeName ? fields.payeeName.stringValue : "",
        pricePerLiter: fields.pricePerLiter ? (fields.pricePerLiter.doubleValue || fields.pricePerLiter.integerValue || 0) : 0,
        liters: fields.liters ? (fields.liters.doubleValue || fields.liters.integerValue || 0) : 0,
        amount: fields.amount ? (fields.amount.doubleValue || fields.amount.integerValue || 0) : 0,
        amountBeforeVat: fields.amountBeforeVat ? (fields.amountBeforeVat.doubleValue || fields.amountBeforeVat.integerValue || 0) : 0,
        vatAmount: fields.vatAmount ? (fields.vatAmount.doubleValue || fields.vatAmount.integerValue || 0) : 0,
        totalWithVat: fields.totalWithVat ? (fields.totalWithVat.doubleValue || fields.totalWithVat.integerValue || 0) : 0,
        paymentType: fields.paymentType ? fields.paymentType.stringValue : "เงินสด",
        transferAccount: fields.transferAccount ? fields.transferAccount.stringValue : "",
        remarks: fields.remarks ? fields.remarks.stringValue : "",
        isRequisition: fields.isRequisition ? fields.isRequisition.booleanValue : false,
        requisitionNo: fields.requisitionNo ? fields.requisitionNo.stringValue : "",
        requisitionDate: fields.requisitionDate ? fields.requisitionDate.stringValue : "",
        transferNo: fields.transferNo ? fields.transferNo.stringValue : "",
        transferDate: fields.transferDate ? fields.transferDate.stringValue : ""
      });
    });

    return { success: true, data: records };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 12. ลบรายการค่าใช้จ่าย
function deleteExpenseRecord(docId) {
  try {
    var url = getFirestoreUrl("expense_records/" + docId);
    var res = UrlFetchApp.fetch(url, { method: 'delete', muteHttpExceptions: true });
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      return { success: true, message: 'ลบเรียบร้อย' };
    } else {
      return { success: false, message: res.getContentText() };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 13. คำนวณเลขเอกสารค่าใช้จ่ายถัดไป
function getNextExpenseNo(dateStr) {
  try {
    var dateObj = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(dateObj.getTime())) dateObj = new Date();

    var month = String(dateObj.getMonth() + 1).padStart(2, '0');
    var yearBE = String(dateObj.getFullYear() + 543).slice(-2);
    var currentPrefix = "SBEXP" + month + yearBE;

    var url = getFirestoreUrl("expense_no/current");
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

    var lastPrefix = "";
    var lastNumber = 0;

    if (response.getResponseCode() === 200) {
      var result = JSON.parse(response.getContentText());
      var fields = result.fields || {};
      lastPrefix = fields.last_prefix ? fields.last_prefix.stringValue : "";
      lastNumber = fields.last_number ? Number(fields.last_number.integerValue || fields.last_number.doubleValue || 0) : 0;
    }

    var nextNumber = 1;
    if (lastPrefix === currentPrefix) {
      nextNumber = lastNumber + 1;
    }

    var formattedNumber = String(nextNumber).padStart(4, '0');
    var fullExpenseNo = currentPrefix + "-" + formattedNumber;

    return {
      success: true,
      expenseNo: fullExpenseNo,
      prefix: currentPrefix,
      number: nextNumber
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 14. อัปเดตตัวนับเลขเอกสารค่าใช้จ่าย
function updateExpenseNoTracker(prefix, number) {
  try {
    var url = getFirestoreUrl("expense_no/current");
    var payload = {
      fields: {
        last_prefix: { stringValue: prefix },
        last_number: { integerValue: number }
      }
    };
    var options = {
      method: "patch",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log("Error updateExpenseNoTracker: " + e.toString());
  }
}

// 15. บันทึกข้อมูลค่าใช้จ่ายลง Firestore (แก้ไขบั๊ก + ป้องกันข้อมูลหาย + ตัดสต็อกน้ำมัน)
function saveExpenseRecord(data) {
  try {
    if (!data) return { success: false, message: 'ไม่พบข้อมูลที่ส่งมาบันทึก' };

    var isUpdate = data.docId ? true : false;
    
    // 1. กรณีสร้างรายการใหม่: เจนเลขที่เอกสาร
    if (!isUpdate) {
      var expNoInfo = getNextExpenseNo(data.date);
      if (expNoInfo && expNoInfo.success) {
        data.expenseNo = expNoInfo.expenseNo;
        updateExpenseNoTracker(expNoInfo.prefix, expNoInfo.number);
      } else {
        return { success: false, message: 'ไม่สามารถสร้างเลขที่ใบค่าใช้จ่ายได้' };
      }
    }

    // 2. กำหนด docId และตรวจสอบความถูกต้องก่อนส่ง
    var docId = isUpdate ? data.docId : (data.expenseNo ? data.expenseNo.replace(/\//g, "-") : "");
    if (!docId) {
      return { success: false, message: 'รหัสเอกสาร (docId) ไม่ถูกต้อง' };
    }

    var url = getFirestoreUrl("expense_records/" + docId);

    // Helper แปลงตัวเลขให้ปลอดภัย ป้องกันค่า NaN
    function safeNum(val) {
      var n = parseFloat(val);
      return isNaN(n) ? 0 : n;
    }

    // 3. จัดโครงสร้าง Payload
    var payloadFields = {
      expenseNo: { stringValue: data.expenseNo || '' },
      date: { stringValue: data.date || '' },
      category: { stringValue: data.category || '' },
      itemName: { stringValue: data.itemName || '' },
      payeeName: { stringValue: data.payeeName || '' },
      pricePerLiter: { doubleValue: safeNum(data.pricePerLiter) },
      liters: { doubleValue: safeNum(data.liters) },
      amount: { doubleValue: safeNum(data.amount) },
      amountBeforeVat: { doubleValue: safeNum(data.amountBeforeVat) },
      vatAmount: { doubleValue: safeNum(data.vatAmount) },
      totalWithVat: { doubleValue: safeNum(data.totalWithVat) },
      paymentType: { stringValue: data.paymentType || 'เงินสด' },
      transferAccount: { stringValue: data.transferAccount || '' },
      transferDate: { stringValue: data.transferDate || '' },
      remarks: { stringValue: data.remarks || '' },
      recordedBy: { stringValue: data.recordedBy || 'system' },
      updatedAt: { timestampValue: new Date().toISOString() }
    };

    if (!isUpdate) {
      payloadFields.createdAt = { timestampValue: new Date().toISOString() };
    } else if (data.createdAt) {
      payloadFields.createdAt = { timestampValue: data.createdAt };
    }

    var payload = { fields: payloadFields };

    var options = {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {

      // 4. ⛽ อัปเดตสต็อกน้ำมัน และบันทึกประวัติการนำเข้าลง oil_stock
      var category = String(data.category || '').trim();
      var itemName = String(data.itemName || '').trim();
      var liters = safeNum(data.liters);

      var isFuelExpense = (category.indexOf('ซื้อน้ำมัน') !== -1 || itemName.includes('95') || itemName.includes('ดีเซล')) && liters > 0;

      if (isFuelExpense && typeof updateStockOnFuelPurchase === 'function') {
        updateStockOnFuelPurchase(data, isUpdate);
      }

      // 5. 📊 อัปเดตสรุปยอดรายเดือน
      if (typeof updateExpenseMonthlySummary === 'function') {
        updateExpenseMonthlySummary(data);
      } else if (typeof recalculateMonthlySummary === 'function') {
        recalculateMonthlySummary(data.date);
      }

      return { success: true, message: 'บันทึกสำเร็จ', expenseNo: data.expenseNo, docId: docId };
    } else {
      return { success: false, message: 'Firestore Error: ' + res.getContentText() };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 16. ดึงรายการผู้รับเงิน/รายการค่าใช้จ่ายจาก Collection "pay_record"
function getPayRecords() {
  try {
    var url = getFirestoreUrl("pay_record");
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var statusCode = response.getResponseCode();

    if (statusCode === 200) {
      var result = JSON.parse(response.getContentText());
      var docs = result.documents || [];
      var list = [];

      for (var i = 0; i < docs.length; i++) {
        var fields = docs[i].fields || {};
        var name = fields.name ? fields.name.stringValue : '';
        if (name) {
          list.push({
            id: docs[i].name.split('/').pop(),
            name: name
          });
        }
      }

      list.sort(function(a, b) {
        return a.name.localeCompare(b.name, 'th');
      });

      return { success: true, data: list };
    }

    return { success: false, message: 'ไม่สามารถดึงข้อมูลได้ [HTTP ' + statusCode + ']', data: [] };
  } catch (err) {
    return { success: false, message: err.toString(), data: [] };
  }
}

// 17. บันทึกรายการ/ผู้รับเงินใหม่ ลง Collection "pay_record"
function savePayRecord(data) {
  try {
    var name = data.name ? data.name.trim() : "";
    if (!name) return { success: false, message: "กรุณาระบุชื่อรายการ" };

    var projectId = getProjectId();
    var docId = "PAY_" + Utilities.getUuid().substring(0, 8);
    var docPath = "projects/" + projectId + "/databases/(default)/documents/pay_record/" + docId;

    var payload = {
      writes: [{
        update: {
          name: docPath,
          fields: {
            name: { stringValue: name }
          }
        }
      }]
    };

    var response = callFirestore("POST", ":commit", payload);

    if (response && !response.error) {
      return { success: true, message: "บันทึกรายการสำเร็จ", name: name };
    } else {
      return { success: false, message: "Firestore Error: " + JSON.stringify(response) };
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 18. ดึงรายชื่อบัญชีโอน
function getTransferAccounts() {
  try {
    var url = getFirestoreUrl("transfer");
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var statusCode = response.getResponseCode();

    if (statusCode === 200) {
      var result = JSON.parse(response.getContentText());
      var docs = result.documents || [];
      var list = [];

      for (var i = 0; i < docs.length; i++) {
        var fields = docs[i].fields || {};
        var name = fields.name ? fields.name.stringValue : '';
        if (name) {
          list.push({
            id: docs[i].name.split('/').pop(),
            name: name
          });
        }
      }

      list.sort(function(a, b) {
        return a.name.localeCompare(b.name, 'th');
      });

      return { success: true, data: list };
    }

    return { success: false, message: 'ไม่สามารถดึงข้อมูลได้ [HTTP ' + statusCode + ']', data: [] };
  } catch (err) {
    return { success: false, message: err.toString(), data: [] };
  }
}

///Billing Section///
///Billing Section///
///Billing Section///
function getUnpaidSalesRecords(startDate, endDate, buyerFilter) {
  try {
    Logger.log("=== [getUnpaidSalesRecords - Fetch All & Memory Filter] START ===");
    
    // 1. แปลงวันที่ค้นหาจากหน้าเว็บเป็น YYYY/MM/DD ให้ตรงกับฟอร์แมตใน Firestore
    var startStd = typeof toStandardDateStr === 'function' ? toStandardDateStr(startDate) : startDate;
    var endStd   = typeof toStandardDateStr === 'function' ? toStandardDateStr(endDate)   : endDate;
    
    if (!startStd) startStd = "2000/01/01";
    if (!endStd)   endStd   = "2099/12/31";
    
    Logger.log("📌 Date Range: " + startStd + " to " + endStd + " | Buyer: " + (buyerFilter || "ALL"));

    // Helper ดึงค่าฟิลด์จาก Firestore REST API
    function safeGetVal(fieldObj) {
      if (!fieldObj) return null;
      if (typeof fieldObj.stringValue !== 'undefined') return fieldObj.stringValue;
      if (typeof fieldObj.doubleValue !== 'undefined') return parseFloat(fieldObj.doubleValue) || 0;
      if (typeof fieldObj.integerValue !== 'undefined') return parseInt(fieldObj.integerValue, 10) || 0;
      if (typeof fieldObj.booleanValue !== 'undefined') return fieldObj.booleanValue;
      return null;
    }

    var records = [];
    var pageSize = 1000; // ดึงทีละ 1,000 รายการต่อรอบ
    var offset = 0;
    var hasMore = true;
    var loopCount = 0;

    // 🚀 วนลูปดึงข้อมูลค้างชำระ (unpaid & isBilled=false) ทั้งหมดจาก Firestore
    while (hasMore) {
      loopCount++;
      Logger.log("🔄 Fetching page " + loopCount + " (Offset: " + offset + ")...");

      var queryPayload = {
        structuredQuery: {
          from: [{ collectionId: "sales_records" }],
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: "paymentStatus" },
                    op: "EQUAL",
                    value: { stringValue: "unpaid" }
                  }
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "isBilled" },
                    op: "EQUAL",
                    value: { booleanValue: false }
                  }
                }
              ]
            }
          },
          orderBy: [
            {
              field: { fieldPath: "date" },
              direction: "DESCENDING"
            }
          ],
          limit: pageSize,
          offset: offset
        }
      };

      var queryRes = callFirestore("POST", ":runQuery", queryPayload);

      if (!queryRes || !Array.isArray(queryRes)) {
        Logger.log("❌ Firestore Query Error: " + JSON.stringify(queryRes));
        return { success: false, message: "Firestore Query Error" };
      }

      var fetchedDocs = 0;

      queryRes.forEach(function(item) {
        if (!item.document || !item.document.fields) return;
        fetchedDocs++;

        var doc = item.document;
        var fields = doc.fields;
        var id = doc.name ? doc.name.split("/").pop() : "";

        var rawDate   = safeGetVal(fields.date) || "";
        var dateStd   = typeof toStandardDateStr === 'function' ? toStandardDateStr(rawDate) : rawDate;
        var buyerName = String(safeGetVal(fields.buyerName) || "").trim();

        // 1. กรองช่วงวันที่ใน Memory
        if (dateStd && (dateStd < startStd || dateStd > endStd)) {
          return;
        }

        // 2. กรองชื่อผู้ซื้อใน Memory (เหมือนเดิม)
        if (buyerFilter && buyerFilter !== "ALL" && buyerName !== buyerFilter) {
          return;
        }

        var pricePerLiter = parseFloat(safeGetVal(fields.pricePerLiter)) || 0;
        var liters        = parseFloat(safeGetVal(fields.liters)) || 0;
        var qty           = parseFloat(safeGetVal(fields.qty)) || liters;
        var unitPrice     = parseFloat(safeGetVal(fields.unitPrice)) || pricePerLiter;
        var totalAmount   = parseFloat(safeGetVal(fields.totalAmount)) || 0;

        records.push({
          id: id,
          saleNo: safeGetVal(fields.saleNo) || id,
          date: rawDate || "-",
          buyerName: buyerName,
          itemType: safeGetVal(fields.itemType) || "น้ำมัน",
          itemName: safeGetVal(fields.itemName) || "น้ำมัน",
          pricePerLiter: pricePerLiter,
          liters: liters,
          qty: qty,
          unitPrice: unitPrice,
          totalAmount: totalAmount,
          paymentType: safeGetVal(fields.paymentType) || "เงินเชื่อ",
          paymentStatus: safeGetVal(fields.paymentStatus) || "unpaid",
          isBilled: false,
          remarks: safeGetVal(fields.remarks) || ""
        });
      });

      Logger.log("📦 Page " + loopCount + " fetched: " + fetchedDocs + " docs");

      // หากรอบนี้ได้เอกสารกลับมาน้อยกว่า pageSize แสดงว่าดึงข้อมูลหมดแล้ว
      if (fetchedDocs < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize; // เลื่อนตำแหน่งไปดึงรอบถัดไป
      }
    }

    Logger.log("✅ Total Matching Unpaid Records: " + records.length + " รายการ (ดึงข้อมูลทั้งหมด " + loopCount + " รอบ)");
    return { success: true, data: records };

  } catch (err) {
    Logger.log("❌ Exception in getUnpaidSalesRecords: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

function toStandardDateStr(d) {
  if (!d) return "";
  var s = String(d).trim().replace(/-/g, "/").replace(/\./g, "/");
  var p = s.split("/");
  if (p.length === 3) {
    // ถ้าขึ้นต้นด้วยปี 4 หลัก (YYYY/MM/DD)
    if (p[0].length === 4) {
      var y0 = parseInt(p[0], 10);
      if (y0 > 2400) y0 -= 543; // แปลง พ.ศ. เป็น ค.ศ.
      return y0 + "/" + p[1].padStart(2, "0") + "/" + p[2].padStart(2, "0");
    }
    // ถ้าลงท้ายด้วยปี 4 หลัก (DD/MM/YYYY)
    if (p[2].length === 4) {
      var y2 = parseInt(p[2], 10);
      if (y2 > 2400) y2 -= 543; // แปลง พ.ศ. เป็น ค.ศ.
      return y2 + "/" + p[1].padStart(2, "0") + "/" + p[0].padStart(2, "0");
    }
  }
  return s;
}

// 20. ดึงข้อมูลรายละเอียดผู้ซื้อตามชื่อ
function getBuyerByName(buyerName) {
  try {
    var buyersRes = getBuyers();
    if (buyersRes.success && buyersRes.data) {
      var queryName = (buyerName || "").trim();
      var found = buyersRes.data.find(function(b) { 
        return b.name === queryName || b.fullname === queryName; 
      });
      if (found) {
        return { success: true, data: found };
      }
    }
    return { success: false, message: "ไม่พบข้อมูลผู้ซื้อ" };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 21. คำนวณเลขที่ใบวางบิลถัดไป
function getNextBillNo(dateStr) {
  try {
    var month = "";
    var yearBE = "";

    // 1. แยกเดือน และ ปี พ.ศ. 2 หลัก
    if (dateStr && typeof dateStr === 'string' && dateStr.indexOf('/') !== -1) {
      var parts = dateStr.split('/');
      if (parts.length === 3) {
        // เช็คว่าส่วนแรกหรือส่วนหลังเป็นปี
        if (parts[0].length === 4) {
          month = parts[1].padStart(2, '0');
          var yr0 = parseInt(parts[0], 10);
          yearBE = yr0 > 2400 ? String(yr0).slice(-2) : String(yr0 + 543).slice(-2);
        } else {
          month = parts[1].padStart(2, '0');
          var yr2 = parseInt(parts[2], 10);
          yearBE = yr2 > 2400 ? String(yr2).slice(-2) : String(yr2 + 543).slice(-2);
        }
      }
    }

    if (!month || !yearBE) {
      var dateObj = (dateStr && !isNaN(new Date(dateStr).getTime())) ? new Date(dateStr) : new Date();
      month = String(dateObj.getMonth() + 1).padStart(2, '0');
      yearBE = String(dateObj.getFullYear() + 543).slice(-2);
    }

    var currentPrefix = "SBBS" + month + yearBE; // เช่น SBBS1069

    // 2. ดึงเลขรันล่าสุดจาก bill_no/current ผ่าน callFirestore
    var resCurrent = callFirestore("GET", "bill_no/current");
    var lastPrefix = "";
    var lastNumber = 0;

    if (resCurrent && resCurrent.fields) {
      var fields = resCurrent.fields;
      lastPrefix = fields.last_prefix ? fields.last_prefix.stringValue : "";
      if (fields.last_number) {
        lastNumber = Number(fields.last_number.integerValue || fields.last_number.doubleValue || 0);
      }
    }

    var nextNumber = 1;
    if (lastPrefix === currentPrefix && lastNumber > 0) {
      nextNumber = lastNumber + 1;
    } else {
      // 3. Fallback: สแกนหาเลขรันสูงสุดจาก billing_notes โดยตรง เพื่อป้องกันเลขซ้ำ
      var queryPayload = {
        structuredQuery: {
          from: [{ collectionId: "billing_notes" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "billNo" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { stringValue: currentPrefix + "-0000" }
            }
          }
        }
      };

      var resQuery = callFirestore("POST", ":runQuery", queryPayload);
      var maxSeq = 0;
      if (Array.isArray(resQuery)) {
        resQuery.forEach(function(item) {
          if (item.document && item.document.fields && item.document.fields.billNo) {
            var bNo = item.document.fields.billNo.stringValue || "";
            if (bNo.indexOf(currentPrefix + "-") === 0) {
              var seqNum = parseInt(bNo.split("-")[1], 10);
              if (!isNaN(seqNum) && seqNum > maxSeq) {
                maxSeq = seqNum;
              }
            }
          }
        });
      }
      nextNumber = maxSeq + 1;
    }

    var formattedNumber = String(nextNumber).padStart(4, '0');
    var fullBillNo = currentPrefix + "-" + formattedNumber;

    return {
      success: true,
      billNo: fullBillNo,
      prefix: currentPrefix,
      number: nextNumber
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function confirmBilling(saleIds, billDateStr, billingData) {
  try {
    Logger.log("=== [confirmBilling] START ===");

    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return { success: false, message: "ไม่มีรายการที่เลือก" };
    }

    // 1) คำนวณเลขที่ใบวางบิลถัดไป
    var billNoInfo = null;
    var billNo = "";

    if (typeof getNextBillNo === 'function') {
      billNoInfo = getNextBillNo(billDateStr);
      if (billNoInfo && billNoInfo.success) {
        billNo = billNoInfo.billNo;
      } else if (typeof billNoInfo === 'string') {
        billNo = billNoInfo;
      }
    }
    
    if (!billNo && typeof generateNextBillNo === 'function') {
      billNo = generateNextBillNo();
    }
    if (!billNo) {
      billNo = "SBBS-" + Utilities.getUuid().substring(0, 6);
    }

    var formattedBillDate = (typeof parseAndFormatDate === 'function' ? parseAndFormatDate(billDateStr) : null) || (typeof getTodayBE === 'function' ? getTodayBE() : billDateStr);
    var projectId = (typeof getProjectId === 'function') ? getProjectId() : "sb-tropical";

    var batchWrites = [];

    // 📌 [เติมจุดนี้] ประกาศตัวแปรแปลงรายการเลขใบขายจาก billingData ก่อนนำไปใช้
    var rawSaleNos = (billingData && Array.isArray(billingData.saleNos)) ? billingData.saleNos : [];
    var saleNosArrayValue = rawSaleNos.map(function(sNo) {
      return { stringValue: String(sNo) };
    });
    var saleNosSummaryStr = rawSaleNos.join(", ");

    // 2) เพิ่มรายการสร้าง billing_notes ลงใน Batch Writes
    var billingDocPath = "projects/" + projectId + "/databases/(default)/documents/billing_notes/" + encodeURIComponent(billNo);
    var firestoreFields = {
      billNo: { stringValue: billNo },
      billDate: { stringValue: formattedBillDate },
      buyerName: { stringValue: (billingData && billingData.buyerName) ? billingData.buyerName : '' },
      buyerTaxId: { stringValue: (billingData && billingData.buyerTaxId) ? billingData.buyerTaxId : '' },
      buyerAddress: { stringValue: (billingData && billingData.buyerAddress) ? billingData.buyerAddress : '' },
      subtotal: { doubleValue: parseFloat(billingData ? billingData.subtotal : 0) || 0 },
      vatAmount: { doubleValue: parseFloat(billingData ? billingData.vatAmount : 0) || 0 },
      grandTotal: { doubleValue: parseFloat(billingData ? billingData.grandTotal : 0) || 0 },
      status: { stringValue: 'ISSUED' },
      saleNos: { arrayValue: { values: saleNosArrayValue } },
      saleNosSummary: { stringValue: saleNosSummaryStr },
      createdAt: { timestampValue: new Date().toISOString() }
    };

    batchWrites.push({
      update: {
        name: billingDocPath,
        fields: firestoreFields
      }
    });

    // 3) เพิ่มรายการตัดสถานะ sales_records ให้เป็น isBilled = true ลงใน Batch Writes
    saleIds.forEach(function(docId) {
      var saleDocPath = "projects/" + projectId + "/databases/(default)/documents/sales_records/" + docId;
      batchWrites.push({
        update: {
          name: saleDocPath,
          fields: {
            isBilled: { booleanValue: true },
            billNo: { stringValue: billNo },
            billDate: { stringValue: formattedBillDate },
            updatedAt: { timestampValue: new Date().toISOString() }
          }
        },
        updateMask: {
          fieldPaths: ["isBilled", "billNo", "billDate", "updatedAt"]
        }
      });
    });

    // 4) เพิ่มรายการอัปเดตเลขรันล่าสุดใน bill_no/current (last_prefix & last_number) ลงใน Batch Writes
    if (billNoInfo && billNoInfo.success && billNoInfo.prefix && billNoInfo.number) {
      var trackerDocPath = "projects/" + projectId + "/databases/(default)/documents/bill_no/current";
      batchWrites.push({
        update: {
          name: trackerDocPath,
          fields: {
            last_prefix: { stringValue: billNoInfo.prefix },
            last_number: { integerValue: parseInt(billNoInfo.number, 10) }
          }
        },
        updateMask: {
          fieldPaths: ["last_prefix", "last_number"]
        }
      });
    }

    // 5) ยิง Batch Writes ทั้งหมดบันทึกลง Firestore พร้อมกันรวดเดียว
    var response = callFirestore("POST", ":commit", { writes: batchWrites });

    if (response && !response.error) {
      Logger.log("✅ Billing Confirmed & Saved Successfully. Bill No: " + billNo);
      return { success: true, message: "ออกใบวางบิลสำเร็จ", billNo: billNo };
    } else {
      Logger.log("❌ Firestore Commit Error: " + JSON.stringify(response));
      return { success: false, message: "Firestore Error: " + JSON.stringify(response) };
    }

  } catch (err) {
    Logger.log("❌ Exception in confirmBilling: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

function updateBillNoTracker(prefix, number) {
  try {
    var projectId = (typeof getProjectId === 'function') ? getProjectId() : "sb-tropical";
    var trackerDocPath = "projects/" + projectId + "/databases/(default)/documents/bill_no/current";
    var payload = {
      writes: [{
        update: {
          name: trackerDocPath,
          fields: {
            last_prefix: { stringValue: String(prefix || '') },
            last_number: { integerValue: parseInt(number, 10) || 1 }
          }
        },
        updateMask: {
          fieldPaths: ["last_prefix", "last_number"]
        }
      }]
    };
    return callFirestore("POST", ":commit", payload);
  } catch (err) {
    Logger.log("❌ Exception in updateBillNoTracker: " + err.toString());
    return null;
  }
}

function parseFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  var fields = doc.fields;
  var obj = {};

  // สกัด ID ของเอกสารจากชื่อ Path
  if (doc.name) {
    var parts = doc.name.split('/');
    obj.id = parts[parts.length - 1]; // 👈 แก้ไขเพิ่มเครื่องหมาย -
  }

  for (var key in fields) {
    var f = fields[key];
    if (f.stringValue !== undefined) {
      obj[key] = f.stringValue;
    } else if (f.booleanValue !== undefined) {
      obj[key] = f.booleanValue;
    } else if (f.integerValue !== undefined) {
      obj[key] = parseInt(f.integerValue, 10);
    } else if (f.doubleValue !== undefined) {
      obj[key] = parseFloat(f.doubleValue);
    } else if (f.timestampValue !== undefined) {
      obj[key] = f.timestampValue;
    } else {
      obj[key] = '';
    }
  }
  return obj;
}

function normalizeToYYYYMMDD(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  var cleanStr = dateStr.trim();

  // กรณีเป็น DD/MM/YYYY หรือ DD/MM/YYYY (พ.ศ.)
  if (cleanStr.indexOf('/') !== -1) {
    var parts = cleanStr.split('/');
    if (parts.length === 3) {
      var p1 = parts[0].padStart(2, '0');
      var p2 = parts[1].padStart(2, '0');
      var p3 = parseInt(parts[2], 10);

      // ถ้าส่วนแรกเป็นปี (4 หลัก) เช่น 2026/09/30
      if (parts[0].length === 4) {
        var year = p3 > 2400 ? (p3 - 543) : p3;
        return year + '/' + p2 + '/' + parts[2].padStart(2, '0');
      }

      // ถ้าส่วนหลังเป็นปี เช่น 30/09/2026
      var yr = p3 > 2400 ? (p3 - 543) : p3;
      return yr + '/' + p2 + '/' + p1;
    }
  }
  return cleanStr;
}

// ฟังก์ชันสร้างเลขที่ใบวางบิลอัตโนมัติฝั่ง Server
function generateNextBillNo() {
  var todayBE = typeof getTodayBE === 'function' ? getTodayBE() : ""; 
  if (!todayBE) {
    var d = new Date();
    todayBE = String(d.getDate()).padStart(2, '0') + "/" + String(d.getMonth() + 1).padStart(2, '0') + "/" + (d.getFullYear() + 543);
  }

  var dateParts = todayBE.split("/");
  var month = dateParts[1];
  var year2Digits = dateParts[2] ? dateParts[2].slice(-2) : "";
  var dateCode = month + year2Digits; // ได้ "1069"
  var prefix = "SBBS" + dateCode + "-";

  var queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "billing_notes" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "billDate" },
          op: "EQUAL",
          value: { stringValue: todayBE }
        }
      }
    }
  };

  var res = callFirestore("POST", ":runQuery", queryPayload);
  var count = 0;
  if (Array.isArray(res)) {
    res.forEach(function(item) { if (item.document) count++; });
  }

  var nextSeq = ("000" + (count + 1)).slice(-4);
  return prefix + nextSeq;
}

//CLAIM Setion///
//CLAIM Setion///
//CLAIM Setion///

// 1. ดึงข้อมูลรายการค่าใช้จ่ายจาก collection "expense_records"
function getExpenseRecordsForClaim(startDate, endDate, statusFilter) {
  try {
    Logger.log("========================================");
    Logger.log("📌 [getExpenseRecordsForClaim] START");
    Logger.log("📥 รับค่า Params -> startDate: " + startDate + " | endDate: " + endDate + " | statusFilter: " + statusFilter);

    var startStd = toStandardDateStr(startDate) || "2000/01/01";
    var endStd   = toStandardDateStr(endDate) || "2099/12/31";
    var isReqTarget = (statusFilter === 'claimed');

    Logger.log("🎯 รูปแบบวันที่แปลงแล้ว -> startStd: " + startStd + " | endStd: " + endStd + " | ต้องการตั้งเบิก: " + isReqTarget);

    var queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "expense_records" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: startStd } } },
              { fieldFilter: { field: { fieldPath: "date" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: endStd } } }
            ]
          }
        },
        orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
        limit: 3000
      }
    };

    var queryRes = callFirestore("POST", ":runQuery", queryPayload);

    // Fallback หาก Firestore Range Query มีปัญหา
    if (!queryRes || !Array.isArray(queryRes) || queryRes.error) {
      Logger.log("⚠️ Range Query ไม่สำเร็จ กำลังดึงข้อมูลทั้งหมดมาคัดกรองแทน...");
      if (queryRes && queryRes.error) Logger.log("❌ รายละเอียด Firestore Error: " + JSON.stringify(queryRes.error));
      
      var fallbackPayload = {
        structuredQuery: {
          from: [{ collectionId: "expense_records" }],
          limit: 3000
        }
      };
      queryRes = callFirestore("POST", ":runQuery", fallbackPayload);
    }

    if (!queryRes || !Array.isArray(queryRes)) {
      Logger.log("❌ คิวรี Firestore ล้มเหลว ผลลัพธ์: " + JSON.stringify(queryRes));
      return { success: false, message: "Firestore Query Error" };
    }

    Logger.log("📦 จำนวนเอกสารที่อ่านได้จาก Firestore ทั้งหมด: " + queryRes.length + " รายการ");

    var records = [];
    var skippedCount = 0;

    queryRes.forEach(function(item) {
      if (!item.document || !item.document.fields) return;

      var doc = item.document;
      var fields = doc.fields;
      var id = doc.name ? doc.name.split("/").pop() : "";

      var rawDate = getVal(fields.date) || "";
      var dateStd = toStandardDateStr(rawDate);

      // กรองวันที่
      if (dateStd && (dateStd < startStd || dateStd > endStd)) {
        skippedCount++;
        return;
      }

      var claimNoVal = getVal(fields.requisitionNo) || getVal(fields.claimNo) || "";
      var isReq = (getVal(fields.isRequisition) === true) || (String(claimNoVal).trim() !== "");

      // กรองสถานะตั้งเบิก
      if (isReqTarget) {
        if (!isReq) { skippedCount++; return; }
      } else {
        if (isReq) { skippedCount++; return; }
      }

      records.push({
        id: id,
        expenseNo: getVal(fields.expenseNo) || getVal(fields.no) || id,
        date: rawDate || "-",
        category: getVal(fields.category) || getVal(fields.itemName) || "ค่าใช้จ่ายทั่วไป",
        description: getVal(fields.remarks) || getVal(fields.payeeName) || "-",
        totalAmount: parseFloat(getVal(fields.totalWithVat) || getVal(fields.amount)) || 0,
        isRequisition: isReq,
        claimNo: claimNoVal,
        remarks: getVal(fields.remarks) || ""
      });
    });

    Logger.log("✅ คัดกรองสำเร็จ -> ตรงเงื่อนไข: " + records.length + " รายการ (ถูกข้าม: " + skippedCount + " รายการ)");
    Logger.log("📌 [getExpenseRecordsForClaim] END");
    Logger.log("========================================");

    return { success: true, data: records };
  } catch (err) {
    Logger.log("❌ เกิด Exception ใน getExpenseRecordsForClaim: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

// 2. รันเลขที่ใบตั้งเบิกขึ้นต้นด้วย SBCE (เช่น SBCE1069-0001)
function getNextClaimNo(dateStr) {
  try {
    var now = new Date();
    var monthStr = String(now.getMonth() + 1).padStart(2, '0');
    var yearBE = String(now.getFullYear() + 543).slice(-2);
    var prefix = "SBCE" + monthStr + yearBE + "-";

    var queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "claim_records" }],
        limit: 100
      }
    };

    var res = callFirestore("POST", ":runQuery", queryPayload);
    var maxSeq = 0;

    if (Array.isArray(res)) {
      res.forEach(function(item) {
        if (item.document && item.document.fields && item.document.fields.claimNo) {
          var cNo = item.document.fields.claimNo.stringValue || "";
          if (cNo.indexOf(prefix) === 0) {
            var seq = parseInt(cNo.replace(prefix, ""), 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        }
      });
    }

    var nextSeqStr = String(maxSeq + 1).padStart(4, '0');
    return { success: true, claimNo: prefix + nextSeqStr };
  } catch (err) {
    return { success: false, claimNo: "SBCE-0001" };
  }
}

// 3. ยืนยันตั้งเบิก: บันทึกลง claim_records และอัปเดต isRequisition = true ใน expense_records
function confirmClaim(expenseIds, claimDateStr, claimData) {
  try {
    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return { success: false, message: "กรุณาเลือกรายการที่ต้องการตั้งเบิก" };
    }

    // 1. สร้างเลขที่เอกสาร SBCE
    var claimNoRes = getNextClaimNo(claimDateStr);
    var realClaimNo = claimNoRes.claimNo;

    // 2. บันทึกข้อมูลใบตั้งเบิกลง collection "claim_records"
    var newClaimPayload = {
      fields: {
        claimNo: { stringValue: realClaimNo },
        claimDate: { stringValue: claimDateStr },
        totalAmount: { doubleValue: claimData.grandTotal },
        itemCount: { integerValue: expenseIds.length },
        expenseNos: { arrayValue: { values: (claimData.expenseNos || []).map(function(x) { return { stringValue: x }; }) } },
        createdAt: { stringValue: new Date().toISOString() }
      }
    };

    callFirestore("POST", "claim_records?documentId=" + realClaimNo, newClaimPayload);

    // 3. ปรับสถานะ isRequisition = true และเก็บเลข SBCE ใน expense_records
    expenseIds.forEach(function(id) {
      var updatePayload = {
        fields: {
          isRequisition: { booleanValue: true },
          claimNo: { stringValue: realClaimNo }
        }
      };
      callFirestore("PATCH", "expense_records/" + id + "?updateMask.fieldPaths=isRequisition&updateMask.fieldPaths=claimNo", updatePayload);
    });

    return { success: true, claimNo: realClaimNo };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}
//end

//OIL STOCK Section///
//OIL STOCK Section///
//OIL STOCK Section///
// =================================================================
// ⛽ OIL STOCK MODULE (HYBRID SUMMARY VERSION)
// =================================================================

/**
 * Helper: ดึงค่าจาก Firestore Field ทุกประเภทข้อมูล
 */
function getFirestoreFieldVal(fieldObj) {
  if (!fieldObj) return null;
  if (fieldObj.stringValue !== undefined) return fieldObj.stringValue;
  if (fieldObj.doubleValue !== undefined) return parseFloat(fieldObj.doubleValue);
  if (fieldObj.integerValue !== undefined) return parseInt(fieldObj.integerValue, 10);
  if (fieldObj.timestampValue !== undefined) return fieldObj.timestampValue;
  return null;
}

/**
 * Helper: แปลงวันที่ทุกฟอร์แมต ให้เป็นมาตรฐาน YYYY/MM/DD (ค.ศ.)
 */
function toStandardYYYYMMDD(raw) {
  if (!raw) return "";
  var str = String(raw).trim();
  if (str.indexOf('T') !== -1) {
    str = str.split('T')[0];
  }
  str = str.replace(/-/g, '/').replace(/\./g, '/');
  var parts = str.split('/');
  if (parts.length === 3) {
    var p0 = parseInt(parts[0], 10);
    var p1 = parseInt(parts[1], 10);
    var p2 = parseInt(parts[2], 10);

    if (parts[0].length === 4) { // YYYY/MM/DD
      var yr0 = p0 > 2400 ? (p0 - 543) : p0;
      return yr0 + '/' + String(p1).padStart(2, '0') + '/' + String(p2).padStart(2, '0');
    }
    if (parts[2].length === 4) { // DD/MM/YYYY
      var yr2 = p2 > 2400 ? (p2 - 543) : p2;
      return yr2 + '/' + String(p1).padStart(2, '0') + '/' + String(p0).padStart(2, '0');
    }
  }
  return str;
}

/**
 * Helper: ปรับฟอร์แมตวันที่ให้เป็น YYYY/MM/DD
 */
function normalizeStockDateStr(raw) {
  if (!raw) return '';
  let dStr = String(raw).trim();
  if (dStr.includes('T')) dStr = dStr.split('T')[0];
  return dStr.replace(/-/g, '/');
}

/**
 * Helper: แปลงเลขที่เอกสารให้ปลอดภัยสำหรับเป็น Doc ID ใน Firestore (ลบ / ออก)
 */
function safeDocId(noStr) {
  return String(noStr || '').trim().replace(/\//g, '-');
}

/**
 * Helper: ดึงเอกสารทั้งหมดจาก Sub-collection โดยรองรับ Pagination
 */
function getAllSubCollectionDocs(path) {
  var allDocs = [];
  var pageToken = "";
  
  do {
    var endpoint = path + "?pageSize=300";
    if (pageToken) {
      endpoint += "&pageToken=" + pageToken;
    }
    
    var res = callFirestore("GET", endpoint);
    if (res && res.documents && Array.isArray(res.documents)) {
      allDocs = allDocs.concat(res.documents);
      pageToken = res.nextPageToken || "";
    } else {
      pageToken = "";
    }
  } while (pageToken);
  
  return allDocs;
}

/**
 * ดึงข้อมูลสต็อกน้ำมัน (แสดงจำนวนนำเข้าและขายออกเฉพาะของวันที่กรอง + คำนวณยอดคงเหลือสะสม ณ สิ้นวัน)
 */
function getOilStockData(targetDate) {
  Logger.log("==================================================");
  Logger.log("🚀 [getOilStockData] START");
  Logger.log("📥 Raw targetDate received: '" + targetDate + "'");

  try {
    var todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    var searchDate = targetDate ? toStandardYYYYMMDD(targetDate) : toStandardYYYYMMDD(todayStr); // YYYY/MM/DD
    
    var parts = searchDate.split('/');
    if (parts.length < 3) {
      return { success: false, message: "รูปแบบวันที่ไม่ถูกต้อง" };
    }

    var targetYear = parts[0];
    var targetMonth = parts[1];
    var targetDay = parts[2];

    var docIdDate = targetYear + '-' + targetMonth + '-' + targetDay; // Format "YYYY-MM-DD" สำหรับดึง Document ID รายวันโดยตรง
    var targetMonthStr = targetYear + '/' + targetMonth;            // Format "YYYY/MM"
    var monthStartDate = targetYear + '/' + targetMonth + '/01';    // Format "YYYY/MM/01"

    Logger.log("🎯 searchDate: " + searchDate + " | docIdDate: " + docIdDate);

    function getSummaryForFuelType(docId) {
      Logger.log("--------------------------------------------------");
      Logger.log("⛽ Processing Fuel Type: " + docId);

      // 1. อ่านค่าสต็อกตั้งต้นจากเอกสารหลัก oil_stock/{docId}
      var mainRes = callFirestore("GET", "oil_stock/" + docId);
      var initialStock = 0;
      if (mainRes && mainRes.fields) {
        initialStock = parseFloat(getFirestoreFieldVal(mainRes.fields.initialStock) || 0);
      }

      // --------------------------------------------------
      // 2. ดึงจำนวนนำเข้า (ซื้อ) และ ขายออก ของวันที่กรองข้อมูลตรงจาก Sub-collection รายวัน
      // --------------------------------------------------
      // 2.1 ดึงยอดนำเข้าประจำวันจาก imports_daily_summaries/{docIdDate}
      var dayIn = 0;
      var dayInRes = callFirestore("GET", "oil_stock/" + docId + "/imports_daily_summaries/" + docIdDate);
      if (dayInRes && dayInRes.fields) {
        dayIn = parseFloat(getFirestoreFieldVal(dayInRes.fields.totalIn) || 0);
      }

      // 2.2 ดึงยอดขายออกและยอดเงินสดประจำวันจาก daily_summaries/{docIdDate}
      var dayOut = 0;
      var dayCashSales = 0;
      var dayOutRes = callFirestore("GET", "oil_stock/" + docId + "/daily_summaries/" + docIdDate);
      if (dayOutRes && dayOutRes.fields) {
        dayOut = parseFloat(getFirestoreFieldVal(dayOutRes.fields.totalOut) || 0);
        dayCashSales = parseFloat(getFirestoreFieldVal(dayOutRes.fields.cashSales) || 0);
      }

      Logger.log("   📌 [Selected Date: " + searchDate + "] Daily In: " + dayIn + " | Daily Out: " + dayOut + " | Daily Cash Sales: " + dayCashSales);

      // --------------------------------------------------
      // 3. คำนวณยอดนำเข้าสะสม (Cumulative In) จนถึงวันที่กรอง (สำหรับคำนวณยอดคงเหลือ)
      // --------------------------------------------------
      var cumulativeIn = 0;

      // 3.1 รวมยอดนำเข้าเดือนก่อนหน้า
      var importMonthlyDocs = getAllSubCollectionDocs("oil_stock/" + docId + "/imports_monthly_summaries");
      importMonthlyDocs.forEach(function(mDoc) {
        var mf = mDoc.fields || {};
        var mStr = getFirestoreFieldVal(mf.month) || "";
        if (mStr && mStr < targetMonthStr) {
          cumulativeIn += parseFloat(getFirestoreFieldVal(mf.totalIn) || 0);
        }
      });

      // 3.2 รวมยอดนำเข้ารายวันเดือนปัจจุบัน (ตั้งแต่วันที่ 1 ถึง วันที่เลือก)
      var importDailyDocs = getAllSubCollectionDocs("oil_stock/" + docId + "/imports_daily_summaries");
      importDailyDocs.forEach(function(dDoc) {
        var df = dDoc.fields || {};
        var dStr = getFirestoreFieldVal(df.date) || "";
        if (dStr && dStr >= monthStartDate && dStr <= searchDate) {
          cumulativeIn += parseFloat(getFirestoreFieldVal(df.totalIn) || 0);
        }
      });

      // --------------------------------------------------
      // 4. คำนวณยอดขายออกสะสม (Cumulative Out) จนถึงวันที่กรอง (สำหรับคำนวณยอดคงเหลือ)
      // --------------------------------------------------
      var cumulativeOut = 0;

      // 4.1 รวมยอดขายออกเดือนก่อนหน้า
      var exportMonthlyDocs = getAllSubCollectionDocs("oil_stock/" + docId + "/monthly_summaries");
      exportMonthlyDocs.forEach(function(mDoc) {
        var mf = mDoc.fields || {};
        var mStr = getFirestoreFieldVal(mf.month) || "";
        if (mStr && mStr < targetMonthStr) {
          cumulativeOut += parseFloat(getFirestoreFieldVal(mf.totalOut) || 0);
        }
      });

      // 4.2 รวมยอดขายออกรายวันเดือนปัจจุบัน (ตั้งแต่วันที่ 1 ถึง วันที่เลือก)
      var exportDailyDocs = getAllSubCollectionDocs("oil_stock/" + docId + "/daily_summaries");
      exportDailyDocs.forEach(function(dDoc) {
        var df = dDoc.fields || {};
        var dStr = getFirestoreFieldVal(df.date) || "";
        if (dStr && dStr >= monthStartDate && dStr <= searchDate) {
          cumulativeOut += parseFloat(getFirestoreFieldVal(df.totalOut) || 0);
        }
      });

      // --------------------------------------------------
      // 5. คำนวณยอดคงเหลือ ณ สิ้นวัน
      // --------------------------------------------------
      var currentStock = initialStock + cumulativeIn - cumulativeOut;

      Logger.log("   🏁 [Summary " + docId + "] Initial: " + initialStock + " | Cumulative In: " + cumulativeIn + " | Cumulative Out: " + cumulativeOut + " | Current Stock: " + currentStock);

      return {
        initialStock: initialStock,
        totalIn: dayIn,          // ยอดนำเข้าเฉพาะวันที่กรองข้อมูล (ดึงตรงจาก imports_daily_summaries)
        totalOut: dayOut,        // ยอดขายออกเฉพาะวันที่กรองข้อมูล (ดึงตรงจาก daily_summaries)
        cashSales: dayCashSales,
        currentStock: currentStock // ยอดคงเหลือสะสม ณ สิ้นวัน
      };
    }

    var stock95Result = getSummaryForFuelType('95');
    var stockDieselResult = getSummaryForFuelType('diesel');

    Logger.log("==================================================");
    Logger.log("✅ [getOilStockData] SUCCESS");

    return {
      success: true,
      stock95: stock95Result,
      stockDiesel: stockDieselResult
    };

  } catch (err) {
    Logger.log("💥 [getOilStockData] ERROR: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

/**
 * 2. อัปเดตยอดสรุปฝั่งนำเข้า (imports_daily_summaries & imports_monthly_summaries)
 */
function updateImportSummaries(fuelType, rawDate, liters, amount, oldLiters, oldAmount, isUpdate) {
  try {
    var stdDate = toStandardYYYYMMDD(rawDate);
    if (!stdDate) return;

    var parts = stdDate.split('/');
    if (parts.length < 3) return;

    var year = parts[0];
    var month = parts[1];
    var day = parts[2];

    var dailyDocId = year + '-' + month + '-' + day;
    var dailyDateStr = year + '/' + month + '/' + day;
    var monthlyDocId = year + '-' + month;
    var monthlyDateStr = year + '/' + month;

    var deltaLiters = isUpdate ? (liters - oldLiters) : liters;
    var deltaCost = isUpdate ? (amount - oldAmount) : amount;

    // อัปเดต imports_daily_summaries
    var dailyPath = "oil_stock/" + fuelType + "/imports_daily_summaries/" + dailyDocId;
    var dailyRes = callFirestore("GET", dailyPath);
    var curDailyIn = 0, curDailyCost = 0, curDailyCount = 0;

    if (dailyRes && dailyRes.fields) {
      var df = dailyRes.fields;
      curDailyIn = parseFloat(getFirestoreFieldVal(df.totalIn) || 0);
      curDailyCost = parseFloat(getFirestoreFieldVal(df.totalCost) || 0);
      curDailyCount = parseInt(getFirestoreFieldVal(df.recordCount) || 0, 10);
    }

    var dailyPayload = {
      fields: {
        date: { stringValue: dailyDateStr },
        fuelType: { stringValue: fuelType },
        totalIn: { doubleValue: Math.max(0, curDailyIn + deltaLiters) },
        totalCost: { doubleValue: Math.max(0, curDailyCost + deltaCost) },
        recordCount: { integerValue: isUpdate ? curDailyCount : (curDailyCount + 1) },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", dailyPath, dailyPayload);

    // อัปเดต imports_monthly_summaries
    var monthlyPath = "oil_stock/" + fuelType + "/imports_monthly_summaries/" + monthlyDocId;
    var monthlyRes = callFirestore("GET", monthlyPath);
    var curMonthlyIn = 0, curMonthlyCost = 0, curMonthlyCount = 0;

    if (monthlyRes && monthlyRes.fields) {
      var mf = monthlyRes.fields;
      curMonthlyIn = parseFloat(getFirestoreFieldVal(mf.totalIn) || 0);
      curMonthlyCost = parseFloat(getFirestoreFieldVal(mf.totalCost) || 0);
      curMonthlyCount = parseInt(getFirestoreFieldVal(mf.recordCount) || 0, 10);
    }

    var monthlyPayload = {
      fields: {
        month: { stringValue: monthlyDateStr },
        fuelType: { stringValue: fuelType },
        totalIn: { doubleValue: Math.max(0, curMonthlyIn + deltaLiters) },
        totalCost: { doubleValue: Math.max(0, curMonthlyCost + deltaCost) },
        recordCount: { integerValue: isUpdate ? curMonthlyCount : (curMonthlyCount + 1) },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", monthlyPath, monthlyPayload);

  } catch (err) {
    Logger.log("💥 เกิดข้อผิดพลาดใน updateImportSummaries: " + err.toString());
  }
}

/**
 * 3. อัปเดตสต็อกเมื่อบันทึกการซื้อน้ำมัน (Expense)
 */
function updateStockOnFuelPurchase(expenseRecord, isUpdate) {
  try {
    if (!expenseRecord) return { success: false, message: "ไม่พบข้อมูลรายการ" };

    const itemName = String(expenseRecord.itemName || expenseRecord.category || '').trim();
    const liters = parseFloat(expenseRecord.liters || expenseRecord.qty || 0);
    const pricePerLiter = parseFloat(expenseRecord.pricePerLiter || 0);
    const amount = parseFloat(expenseRecord.amount || expenseRecord.totalWithVat || 0);
    const rawExpenseNo = String(expenseRecord.expenseNo || expenseRecord.no || '').trim();
    const cleanExpenseNo = safeDocId(rawExpenseNo);
    const recDate = toStandardYYYYMMDD(expenseRecord.date);

    if (liters <= 0) return { success: false, message: "จำนวนลิตรไม่ถูกต้อง" };

    let docId = null;
    if (itemName === '95' || itemName.includes('95') || itemName.includes('แก๊สโซฮอล์') || itemName.includes('เบนซิน')) {
      docId = '95';
    } else if (itemName.includes('ดีเซล') || itemName.toLowerCase().includes('diesel')) {
      docId = 'diesel';
    }

    if (!docId) return { success: false, message: "ไม่ใช่รายการน้ำมันที่กำหนด" };

    const importDocPath = "oil_stock/" + docId + "/imports/" + cleanExpenseNo;
    let oldLiters = 0;
    let oldAmount = 0;

    if (isUpdate) {
      const oldDocRes = callFirestore("GET", importDocPath);
      if (oldDocRes && oldDocRes.fields) {
        oldLiters = parseFloat(getFirestoreFieldVal(oldDocRes.fields.liters) || 0);
        oldAmount = parseFloat(getFirestoreFieldVal(oldDocRes.fields.amount) || 0);
      }
    }

    // บันทึกลง Sub-collection: imports รายบิล
    const importPayload = {
      fields: {
        expenseNo: { stringValue: rawExpenseNo },
        date: { stringValue: recDate },
        liters: { doubleValue: liters },
        pricePerLiter: { doubleValue: pricePerLiter },
        amount: { doubleValue: amount },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", importDocPath, importPayload);

    // อัปเดต Sub-collection สรุปยอดรายวัน และ รายเดือน
    updateImportSummaries(docId, recDate, liters, amount, oldLiters, oldAmount, isUpdate);

    // อัปเดตเอกสารแม่ oil_stock/{docId}
    const parentRes = callFirestore("GET", "oil_stock/" + docId);
    if (parentRes && parentRes.fields) {
      const f = parentRes.fields;
      const initialStock = parseFloat(getFirestoreFieldVal(f.initialStock) || 0);
      let totalIn = parseFloat(getFirestoreFieldVal(f.totalIn) || 0);
      const totalOut = parseFloat(getFirestoreFieldVal(f.totalOut) || 0);

      totalIn = isUpdate ? (totalIn - oldLiters + liters) : (totalIn + liters);
      const currentStock = initialStock + totalIn - totalOut;

      updateOilStockParentSummary(docId, initialStock, totalIn, totalOut, currentStock);
    }

    return { success: true };
  } catch (err) {
    Logger.log("💥 เกิดข้อผิดพลาดใน updateStockOnFuelPurchase: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

/**
 * 4. อัปเดตยอดสรุปฝั่งขายออก (daily_summaries & monthly_summaries)
 */
function updateSaleSummaries(fuelType, rawDate, liters, cashValue, oldLiters, oldCashValue, isUpdate) {
  try {
    var stdDate = toStandardYYYYMMDD(rawDate);
    if (!stdDate) return;

    var parts = stdDate.split('/');
    if (parts.length < 3) return;

    var year = parts[0];
    var month = parts[1];
    var day = parts[2];

    var dailyDocId = year + '-' + month + '-' + day;
    var dailyDateStr = year + '/' + month + '/' + day;
    var monthlyDocId = year + '-' + month;
    var monthlyDateStr = year + '/' + month;

    var deltaLiters = isUpdate ? (liters - oldLiters) : liters;
    var deltaCash = isUpdate ? (cashValue - oldCashValue) : cashValue;

    // อัปเดต daily_summaries
    var dailyPath = "oil_stock/" + fuelType + "/daily_summaries/" + dailyDocId;
    var dailyRes = callFirestore("GET", dailyPath);
    var curDailyOut = 0, curDailyCash = 0, curDailyCount = 0;

    if (dailyRes && dailyRes.fields) {
      var df = dailyRes.fields;
      curDailyOut = parseFloat(getFirestoreFieldVal(df.totalOut) || 0);
      curDailyCash = parseFloat(getFirestoreFieldVal(df.cashSales) || 0);
      curDailyCount = parseInt(getFirestoreFieldVal(df.recordCount) || 0, 10);
    }

    var dailyPayload = {
      fields: {
        date: { stringValue: dailyDateStr },
        fuelType: { stringValue: fuelType },
        totalOut: { doubleValue: Math.max(0, curDailyOut + deltaLiters) },
        cashSales: { doubleValue: Math.max(0, curDailyCash + deltaCash) },
        recordCount: { integerValue: isUpdate ? curDailyCount : (curDailyCount + 1) },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", dailyPath, dailyPayload);

    // อัปเดต monthly_summaries
    var monthlyPath = "oil_stock/" + fuelType + "/monthly_summaries/" + monthlyDocId;
    var monthlyRes = callFirestore("GET", monthlyPath);
    var curMonthlyOut = 0, curMonthlyCash = 0, curMonthlyCount = 0;

    if (monthlyRes && monthlyRes.fields) {
      var mf = monthlyRes.fields;
      curMonthlyOut = parseFloat(getFirestoreFieldVal(mf.totalOut) || 0);
      curMonthlyCash = parseFloat(getFirestoreFieldVal(mf.cashSales) || 0);
      curMonthlyCount = parseInt(getFirestoreFieldVal(mf.recordCount) || 0, 10);
    }

    var monthlyPayload = {
      fields: {
        month: { stringValue: monthlyDateStr },
        fuelType: { stringValue: fuelType },
        totalOut: { doubleValue: Math.max(0, curMonthlyOut + deltaLiters) },
        cashSales: { doubleValue: Math.max(0, curMonthlyCash + deltaCash) },
        recordCount: { integerValue: isUpdate ? curMonthlyCount : (curMonthlyCount + 1) },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", monthlyPath, monthlyPayload);

  } catch (err) {
    Logger.log("💥 เกิดข้อผิดพลาดใน updateSaleSummaries: " + err.toString());
  }
}

/**
 * 5. อัปเดตสต็อกเมื่อบันทึกการขายน้ำมัน (Sale)
 */
function updateStockOnFuelSale(saleRecord, isUpdate) {
  try {
    if (!saleRecord) return { success: false, message: "ไม่พบข้อมูลรายการ" };

    const itemName = String(saleRecord.itemName || saleRecord.itemType || '').trim();
    const liters = parseFloat(saleRecord.liters || saleRecord.qty || 0);
    const rawSaleNo = String(saleRecord.saleNo || saleRecord.no || '').trim();
    const cleanSaleNo = safeDocId(rawSaleNo);
    const recDate = toStandardYYYYMMDD(saleRecord.date);
    const paymentType = String(saleRecord.paymentType || 'เงินสด').trim();

    if (liters <= 0) return { success: false, message: "จำนวนลิตรไม่ถูกต้อง" };

    const isCash = (paymentType === 'เงินสด' || paymentType.indexOf('เงินสด') !== -1);
    const priceUnit = parseFloat(saleRecord.pricePerLiter || saleRecord.unitPrice || 0);
    const totalAmount = parseFloat(saleRecord.totalAmount || (liters * priceUnit) || 0);
    const cashValue = isCash ? totalAmount : 0;

    let docId = null;
    if (itemName === '95' || itemName.includes('95') || itemName.includes('แก๊สโซฮอล์') || itemName.includes('เบนซิน')) {
      docId = '95';
    } else if (itemName.includes('ดีเซล') || itemName.toLowerCase().includes('diesel')) {
      docId = 'diesel';
    }

    if (!docId) return { success: false, message: "ไม่ใช่รายการน้ำมันที่กำหนด" };

    const exportDocPath = "oil_stock/" + docId + "/exports/" + cleanSaleNo;
    let oldLiters = 0;
    let oldCashValue = 0;

    if (isUpdate) {
      const oldDocRes = callFirestore("GET", exportDocPath);
      if (oldDocRes && oldDocRes.fields) {
        oldLiters = parseFloat(getFirestoreFieldVal(oldDocRes.fields.liters) || 0);
        oldCashValue = parseFloat(getFirestoreFieldVal(oldDocRes.fields.cash) || 0);
      }
    }

    // บันทึกลง Sub-collection: exports รายบิล
    const exportPayload = {
      fields: {
        saleNo: { stringValue: rawSaleNo },
        date: { stringValue: recDate },
        liters: { doubleValue: liters },
        paymentType: { stringValue: paymentType },
        cash: { doubleValue: cashValue },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", exportDocPath, exportPayload);

    // อัปเดต Sub-collection สรุปรายวัน และ รายเดือน
    updateSaleSummaries(docId, recDate, liters, cashValue, oldLiters, oldCashValue, isUpdate);

    // อัปเดตเอกสารแม่ oil_stock/{docId}
    const parentRes = callFirestore("GET", "oil_stock/" + docId);
    if (parentRes && parentRes.fields) {
      const f = parentRes.fields;
      const initialStock = parseFloat(getFirestoreFieldVal(f.initialStock) || 0);
      const totalIn = parseFloat(getFirestoreFieldVal(f.totalIn) || 0);
      let totalOut = parseFloat(getFirestoreFieldVal(f.totalOut) || 0);

      totalOut = isUpdate ? (totalOut - oldLiters + liters) : (totalOut + liters);
      const currentStock = initialStock + totalIn - totalOut;

      updateOilStockParentSummary(docId, initialStock, totalIn, totalOut, currentStock);
    }

    return { success: true };
  } catch (err) {
    Logger.log("💥 เกิดข้อผิดพลาดใน updateStockOnFuelSale: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

/**
 * 6. อัปเดตยอดสรุปในเอกสารหลัก oil_stock/95 หรือ oil_stock/diesel
 */
function updateOilStockParentSummary(docId, initialStock, totalIn, totalOut, currentStock) {
  const payload = {
    fields: {
      fuelType: { stringValue: docId },
      initialStock: { doubleValue: parseFloat(initialStock) || 0 },
      totalIn: { doubleValue: parseFloat(totalIn) || 0 },
      totalOut: { doubleValue: parseFloat(totalOut) || 0 },
      currentStock: { doubleValue: parseFloat(currentStock) || 0 },
      lastUpdated: { timestampValue: new Date().toISOString() }
    }
  };

  return callFirestore("PATCH", "oil_stock/" + docId, payload);
}

/**
 * 7. บันทึกสต็อกตั้งต้น (Initial Stock)
 */
function setInitialOilStock(initial95, initialDiesel) {
  try {
    const stockCurrent = getOilStockData();
    const in95 = stockCurrent.stock95 ? stockCurrent.stock95.totalIn : 0;
    const out95 = stockCurrent.stock95 ? stockCurrent.stock95.totalOut : 0;
    const inDiesel = stockCurrent.stockDiesel ? stockCurrent.stockDiesel.totalIn : 0;
    const outDiesel = stockCurrent.stockDiesel ? stockCurrent.stockDiesel.totalOut : 0;

    const init95Num = parseFloat(initial95) || 0;
    const initDieselNum = parseFloat(initialDiesel) || 0;

    var stock95Curr = init95Num + in95 - out95;
    var stockDieselCurr = initDieselNum + inDiesel - outDiesel;

    updateOilStockParentSummary("95", init95Num, in95, out95, stock95Curr);
    updateOilStockParentSummary("diesel", initDieselNum, inDiesel, outDiesel, stockDieselCurr);

    return { success: true, message: "บันทึกสต็อกตั้งต้นเรียบร้อยแล้ว" };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

///Finance Sumary Section////
///Finance Sumary Section////
///Finance Sumary Section////
/**
 * 🟢 ฟังก์ชันช่วย: แปลง YYYY-MM เป็นช่วงวันที่ YYYY/MM/01 ถึง YYYY/MM/DD
 */
function getMonthDateRange(yearMonth) {
  var ym = parseMonthKey(yearMonth); // เช่น "2026-10"
  if (!ym) return null;
  
  var parts = ym.split("-");
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10);
  
  var startFormatted = year + "/" + String(month).padStart(2, '0') + "/01";
  var lastDay = new Date(year, month, 0).getDate();
  var endFormatted = year + "/" + String(month).padStart(2, '0') + "/" + String(lastDay).padStart(2, '0');
  
  return { startDate: startFormatted, endDate: endFormatted };
}

/**
 * 🟢 ดึงข้อมูลขายเงินเชื่อประจำเดือนโดยใช้ :runQuery ตรงไปยัง field 'date' บน Firestore
 */
function getCreditSalesByMonth(yearMonth, buyerFilter) {
  try {
    var range = getMonthDateRange(yearMonth);
    if (!range) return { success: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };

    Logger.log("=== [getCreditSalesByMonth - Auto Loop Pagination] START ===");
    Logger.log("📌 Target Month Range: " + range.startDate + " to " + range.endDate + " | Buyer: " + (buyerFilter || "ALL"));

    var list = [];
    var pageSize = 1000;
    var offset = 0;
    var hasMore = true;
    var loopCount = 0;

    while (hasMore) {
      loopCount++;
      Logger.log("🔄 Fetching page " + loopCount + " (Offset: " + offset + ")...");

      var queryPayload = {
        structuredQuery: {
          from: [{ collectionId: "sales_records" }],
          orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
          limit: pageSize,
          offset: offset
        }
      };

      var queryRes = callFirestore("POST", ":runQuery", queryPayload);

      if (!queryRes || !Array.isArray(queryRes)) {
        Logger.log("❌ Firestore Query Error: " + JSON.stringify(queryRes));
        return { success: false, message: "Firestore Query Error" };
      }

      var fetchedDocs = 0;

      queryRes.forEach(function(item) {
        if (!item.document || !item.document.fields) return;
        fetchedDocs++;

        var doc = item.document;
        var f = doc.fields;
        var docId = doc.name ? doc.name.split("/").pop() : "";

        var rawDate = f.date ? (f.date.stringValue || "") : "";
        var dateStd = typeof toStandardDateStr === 'function' ? toStandardDateStr(rawDate) : rawDate;

        // 1. กรองช่วงวันที่ประจำเดือนที่เลือก
        if (dateStd && (dateStd < range.startDate || dateStd > range.endDate)) {
          return;
        }

        var buyerName = f.buyerName ? f.buyerName.stringValue : "-";

        // 2. กรองชื่อผู้ซื้อ (ถ้ามีการระบุ)
        if (buyerFilter && buyerFilter !== "ALL" && buyerName !== buyerFilter) {
          return;
        }

        var pType = f.paymentType ? (f.paymentType.stringValue || "") : "";
        var pStatus = f.paymentStatus ? (f.paymentStatus.stringValue || "unpaid") : "unpaid";

        // 3. กรองเฉพาะรายการที่เป็นเงินเชื่อ หรือยังไม่ชำระ (unpaid)
        if (pType === 'เงินเชื่อ' || pStatus === 'unpaid') {
          list.push({
            docId: docId,
            saleNo: f.saleNo ? f.saleNo.stringValue : docId,
            date: rawDate || "-",
            buyerName: buyerName,
            pricePerLiter: f.pricePerLiter ? (f.pricePerLiter.doubleValue || f.pricePerLiter.integerValue || 0) : 0,
            unitPrice: f.unitPrice ? (f.unitPrice.doubleValue || f.unitPrice.integerValue || 0) : 0,
            liters: f.liters ? (f.liters.doubleValue || f.liters.integerValue || 0) : 0,
            qty: f.qty ? (f.qty.doubleValue || f.qty.integerValue || 0) : 0,
            totalAmount: f.totalAmount ? (f.totalAmount.doubleValue || f.totalAmount.integerValue || 0) : 0,
            paymentStatus: pStatus,
            paidDate: f.paidDate ? f.paidDate.stringValue : "",
            remarks: f.remarks ? f.remarks.stringValue : "",
            updatedAt: f.updatedAt ? f.updatedAt.timestampValue : ""
          });
        }
      });

      Logger.log("📦 Page " + loopCount + " fetched: " + fetchedDocs + " docs");

      if (fetchedDocs < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    Logger.log("✅ Total Matching Credit Sales: " + list.length + " รายการ");
    return { success: true, data: list };

  } catch (e) {
    Logger.log("❌ Exception in getCreditSalesByMonth: " + e.toString());
    return { success: false, message: e.toString() };
  }
}

/**
 * 🟢 อัปเดตสถานะชำระเงินของลูกค้าเงินเชื่อ (เปลี่ยน unpaid -> paid)
 */
function updateSalePaymentStatus(docId, paidDate, saleDate) {
  try {
    if (!docId) return { success: false, message: 'ไม่พบรหัสเอกสาร' };

    var updateData = {
      paymentStatus: 'paid',
      paidDate: paidDate || new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString()
    };

    // อัปเดตข้อมูลไปยัง Firestore
    var res = patchFirestoreDoc('sales_records', docId, updateData);
    if (!res || !res.success) {
      return { success: false, message: res ? res.message : 'อัปเดตสถานะไม่สำเร็จ' };
    }

    // คำนวณสรุปยอดรายเดือนใหม่
    if (typeof recalculateMonthlySummary === 'function') {
      recalculateMonthlySummary(saleDate || paidDate);
    }

    return { success: true, message: 'อัปเดตเรียบร้อย' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 🟢 ดึงข้อมูลค่าใช้จ่ายบริษัทประจำเดือน
 */
function getCompanyExpensesByMonth(yearMonth) {
  try {
    var range = getMonthDateRange(yearMonth);
    if (!range) return { success: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };

    var queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "expense_records" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: "date" },
                  op: "GREATER_THAN_OR_EQUAL",
                  value: { stringValue: range.startDate }
                }
              },
              {
                fieldFilter: {
                  field: { fieldPath: "date" },
                  op: "LESS_THAN_OR_EQUAL",
                  value: { stringValue: range.endDate }
                }
              }
            ]
          }
        },
        orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
        limit: 3000
      }
    };

    var queryRes = callFirestore("POST", ":runQuery", queryPayload);
    if (!queryRes || !Array.isArray(queryRes)) {
      return { success: false, message: "Firestore Query Error" };
    }

    var list = [];
    queryRes.forEach(function(item) {
      if (!item.document || !item.document.fields) return;
      var doc = item.document;
      var f = doc.fields;
      var docId = doc.name ? doc.name.split("/").pop() : "";

      var transferDate = f.transferDate ? f.transferDate.stringValue : "";
      var transferStatus = f.transferStatus ? f.transferStatus.stringValue : (transferDate ? "transferred" : "pending");

      list.push({
        docId: docId,
        expenseNo: f.expenseNo ? f.expenseNo.stringValue : docId,
        date: f.date ? f.date.stringValue : "",
        category: f.category ? f.category.stringValue : "-",
        payeeName: f.payeeName ? f.payeeName.stringValue : (f.itemName ? f.itemName.stringValue : "-"),
        itemName: f.itemName ? f.itemName.stringValue : "-",
        totalWithVat: f.totalWithVat ? (f.totalWithVat.doubleValue || f.totalWithVat.integerValue || 0) : (f.amount ? (f.amount.doubleValue || f.amount.integerValue || 0) : 0),
        amount: f.amount ? (f.amount.doubleValue || f.amount.integerValue || 0) : 0,
        paymentType: f.paymentType ? f.paymentType.stringValue : "เงินสด",
        transferStatus: transferStatus,
        transferAccount: f.transferAccount ? f.transferAccount.stringValue : "",
        transferDate: transferDate,
        updatedAt: f.updatedAt ? f.updatedAt.timestampValue : ""
      });
    });

    return { success: true, data: list };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 🟢 อัปเดตสถานะโอนจ่ายค่าใช้จ่ายบริษัท
 */
function updateExpenseTransferStatus(docId, transferAccount, transferDate, expDate) {
  try {
    if (!docId) return { success: false, message: 'ไม่พบรหัสเอกสาร' };

    // 1. อ่านข้อมูลยอดเงินของเอกสารเดิมก่อนลงบันทึกโอน
    var amount = 0;
    var remarks = "โอนจ่ายค่าใช้จ่าย";
    var getRes = callFirestore("GET", "expense_records/" + docId);
    if (getRes && getRes.fields) {
      var f = getRes.fields;
      amount = parseFloat(f.totalWithVat?.doubleValue || f.totalWithVat?.integerValue || f.amount?.doubleValue || f.amount?.integerValue || 0);
      remarks = f.itemName?.stringValue || f.category?.stringValue || remarks;
    }

    // 2. อัปเดตข้อมูลลง expense_records
    var updateData = {
      paymentType: 'เงินโอน',
      transferStatus: 'transferred',
      transferAccount: transferAccount,
      transferDate: transferDate || new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString()
    };

    var res = patchFirestoreDoc('expense_records', docId, updateData);
    if (!res || !res.success) {
      return { success: false, message: res ? res.message : 'อัปเดตโอนจ่ายไม่สำเร็จ' };
    }

    // 3. บันทึกข้อมูลลง Collection transfer_records (ถ้ามี)
    if (typeof saveTransferRecord === 'function') {
      saveTransferRecord({
        date: transferDate || expDate,
        fromAccount: transferAccount,
        amount: amount,
        remarks: remarks
      });
    }

    // 4. คำนวณสรุปยอดรายเดือนใหม่
    if (typeof recalculateMonthlySummary === 'function') {
      recalculateMonthlySummary(expDate || transferDate);
    }

    return { success: true, message: 'บันทึกเรียบร้อย' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 🟢 ฟังก์ชันอัปเดตข้อมูลเฉพาะฟิลด์ (PATCH) โดยส่งผ่าน callFirestore ของระบบ
 * รองรับการเรียกใช้งานแบบ: patchFirestoreDoc("sales_records/" + docId, fieldsToUpdate)
 */
function patchFirestoreDoc(arg1, arg2, arg3) {
  try {
    var docPath = "";
    var fieldsObj = null;

    // รองรับการเรียกแบบ patchFirestoreDoc('sales_records', docId, updateData)
    if (arg3 !== undefined && typeof arg3 === 'object') {
      docPath = arg1 + "/" + arg2;
      fieldsObj = arg3;
    } 
    // รองรับการเรียกแบบ patchFirestoreDoc('sales_records/' + docId, updateData)
    else if (typeof arg2 === 'object') {
      docPath = arg1;
      fieldsObj = arg2;
    } else {
      return { success: false, message: "ระบุ Path หรือข้อมูลอัปเดตไม่ถูกต้อง" };
    }

    if (!docPath || !fieldsObj) {
      return { success: false, message: "ระบุ Path หรือข้อมูลอัปเดตไม่ถูกต้อง" };
    }

    // 1. สร้าง updateMask เพื่อระบุเฉพาะฟิลด์ที่ต้องการอัปเดต
    var updateMaskParams = [];
    for (var key in fieldsObj) {
      updateMaskParams.push("updateMask.fieldPaths=" + encodeURIComponent(key));
    }
    var queryString = updateMaskParams.join("&");

    // 2. ประกอบ Endpoint
    var endpoint = docPath + (docPath.indexOf('?') !== -1 ? "&" : "?") + queryString;

    // 3. แปลงเป็นโครงสร้าง Firestore Field Types ที่ถูกต้อง
    var firestoreFields = toFirestoreFields(fieldsObj);
    var payload = {
      fields: firestoreFields.fields || firestoreFields
    };

    // 4. เรียกใช้งาน callFirestore
    var res = callFirestore("PATCH", endpoint, payload);

    if (res && res.error) {
      var errDetail = res.error.message || JSON.stringify(res.error);
      Logger.log("❌ patchFirestoreDoc Error: " + errDetail);
      return { success: false, message: "Firestore Error: " + errDetail };
    }

    return { success: true, data: res };
  } catch (e) {
    Logger.log("❌ patchFirestoreDoc Exception: " + e.toString());
    return { success: false, message: e.toString() };
  }
}

/**
 * Helper: แปลงรูปแบบวันที่ทุกประเภท (YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, พ.ศ.) ให้เป็น "YYYY-MM" (ค.ศ.)
 */
function parseMonthKey(rawDate) {
  if (!rawDate) return "";
  var str = String(rawDate).trim().replace(/\//g, "-");
  var parts = str.split("-");
  
  if (parts.length >= 2) {
    if (parts[0].length === 4) {
      var y = parseInt(parts[0], 10);
      if (y > 2400) y -= 543;
      var m = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(m)) return "";
      return y + "-" + (m < 10 ? "0" + m : m);
    }
    if (parts.length === 3 && parts[2].length === 4) {
      var y = parseInt(parts[2], 10);
      if (y > 2400) y -= 543;
      var m = parseInt(parts[1], 10);
      if (isNaN(y) || isNaN(m)) return "";
      return y + "-" + (m < 10 ? "0" + m : m);
    }
  }
  return "";
}

/**
 * 1. อ่านข้อมูลสรุปภาพรวมการเงิน และตาราง 12 เดือน (แยกปริมาณขายลิตร 95 / ดีเซล)
 */
function getFinancialSummaryData(selectedYear) {
  try {
    let yearAD = parseInt(selectedYear, 10) || 2026;
    if (yearAD > 2400) {
      yearAD -= 543; // แปลง พ.ศ. เป็น ค.ศ.
    }

    // 1.1 อ่านค่าตั้งต้นเงินทุน
    const capitalRes = callFirestore("GET", "settings/capital");
    const cFields = (capitalRes && capitalRes.fields) ? capitalRes.fields : {};
    
    const companyCapital = parseFloat(cFields.companyCapital?.doubleValue || cFields.companyCapital?.integerValue || 0);
    const paCapital = parseFloat(cFields.paCapital?.doubleValue || cFields.paCapital?.integerValue || 0);
    const borrowedCapital = parseFloat(cFields.borrowedCapital?.doubleValue || cFields.borrowedCapital?.integerValue || 0);

    // โครงสร้าง Map 12 เดือน (เริ่ม ต.ค. ปีที่เลือก ถึง ก.ย. ปีถัดไป)
    const monthlyData = {};
    const validMonthKeys = {};

    for (let i = 0; i < 12; i++) {
      let m = 10 + i;
      let y = yearAD;
      if (m > 12) {
        m -= 12;
        y += 1;
      }
      const monthStr = y + "-" + (m < 10 ? "0" + m : m);
      validMonthKeys[monthStr] = true;
      monthlyData[monthStr] = {
        monthKey: monthStr,
        yearBE: y + 543,
        monthName: getThaiMonthName(m),
        sales: 0,
        cashSales: 0,
        expenses: 0,
        cost: 0,
        otherExp: 0,
        liters: 0,
        liters95: 0,
        litersDiesel: 0,
        ar: 0,
        transferTotal: 0
      };
    }

    // 1.2 อ่านข้อมูลสรุปจาก monthly_summary (เพิ่มการอ่าน cashSales และ transferTotal)
    const summaryRes = callFirestore("GET", "monthly_summary");
    const summaryDocs = (summaryRes && summaryRes.documents) ? summaryRes.documents : [];

    summaryDocs.forEach(doc => {
      const f = doc.fields || {};
      const docName = doc.name ? doc.name.split("/").pop() : "";
      const rawDate = docName || f.monthKey?.stringValue || f.yearMonth?.stringValue || "";
      const mKey = parseMonthKey(rawDate);

      if (mKey && monthlyData[mKey]) {
        const s = parseFloat(f.totalSales?.doubleValue || f.totalSales?.integerValue || f.sales?.doubleValue || 0);
        const cs = parseFloat(f.cashSales?.doubleValue || f.cashSales?.integerValue || f.cash_sales?.doubleValue || 0);
        const e = parseFloat(f.totalExpenses?.doubleValue || f.totalExpenses?.integerValue || f.expenses?.doubleValue || 0);
        const c = parseFloat(f.costExpenses?.doubleValue || f.costExpenses?.integerValue || f.cost?.doubleValue || 0);
        const o = parseFloat(f.otherExpenses?.doubleValue || f.otherExpenses?.integerValue || f.otherExp?.doubleValue || 0);
        const l95 = parseFloat(f.liters95?.doubleValue || f.liters95?.integerValue || 0);
        const lDiesel = parseFloat(f.litersDiesel?.doubleValue || f.litersDiesel?.integerValue || 0);
        const l = parseFloat(f.totalLiters?.doubleValue || f.totalLiters?.integerValue || f.liters?.doubleValue || (l95 + lDiesel));
        const a = parseFloat(f.accountsReceivable?.doubleValue || f.accountsReceivable?.integerValue || f.ar?.doubleValue || 0);
        const tr = parseFloat(f.transferTotal?.doubleValue || f.transferTotal?.integerValue || f.transfer_total?.doubleValue || 0);

        monthlyData[mKey].sales = s;
        monthlyData[mKey].cashSales = cs; // 🟢 ดึงยอดเงินสดลงรายเดือน
        monthlyData[mKey].expenses = e;
        monthlyData[mKey].cost = c;
        monthlyData[mKey].otherExp = o;
        monthlyData[mKey].liters = l;
        monthlyData[mKey].liters95 = l95;
        monthlyData[mKey].litersDiesel = lDiesel;
        monthlyData[mKey].ar = a;
        monthlyData[mKey].transferTotal = tr;
      }
    });

    // 1.3 อ่านรายการขาย (sales_records) เพื่อคำนวณยอดเงินสด และสำรองคำนวณยอดขาย
    let totalCashSalesFallback = 0;
    const salesRes = callFirestore("GET", "sales_records");
    const salesDocs = (salesRes && salesRes.documents) ? salesRes.documents : [];

    salesDocs.forEach(doc => {
      const f = doc.fields || {};
      const amt = parseFloat(f.totalAmount?.doubleValue || f.totalAmount?.integerValue || 0);
      const l = parseFloat(f.liters?.doubleValue || f.liters?.integerValue || f.qty?.doubleValue || 0);
      const dateStr = f.date?.stringValue || "";
      const pType = String(f.paymentType?.stringValue || "").trim();
      const pStatus = String(f.paymentStatus?.stringValue || "").trim();
      const itemName = String(f.itemName?.stringValue || "").trim();
      const itemType = String(f.itemType?.stringValue || "").trim();

      const mKey = parseMonthKey(dateStr);
      if (mKey && validMonthKeys[mKey]) {
        // สะสมยอดเงินสดสำรอง หากใน monthly_summary ยังเป็น 0
        if (pType === 'เงินสด' || pType === 'cash') {
          totalCashSalesFallback += amt;
          if (monthlyData[mKey] && monthlyData[mKey].cashSales === 0) {
            monthlyData[mKey].cashSales += amt;
          }
        }

        // กรณีใน monthly_summary ยอดขายยังเป็น 0
        if (monthlyData[mKey] && monthlyData[mKey].sales === 0 && amt > 0) {
          monthlyData[mKey].sales += amt;
          monthlyData[mKey].liters += l;
          if (itemName.includes("ดีเซล") || itemType.includes("ดีเซล")) {
            monthlyData[mKey].litersDiesel += l;
          } else {
            monthlyData[mKey].liters95 += l;
          }
          if (pType === 'เงินเชื่อ' || pStatus === 'unpaid') {
            monthlyData[mKey].ar += amt;
          }
        }
      }
    });

    // 1.4 อ่านรายการค่าใช้จ่าย (expense_records) เพื่อคำนวณค่าใช้จ่าย/ต้นทุน
    const expRes = callFirestore("GET", "expense_records");
    const expDocs = (expRes && expRes.documents) ? expRes.documents : [];

    expDocs.forEach(doc => {
      const f = doc.fields || {};
      const amt = parseFloat(f.totalWithVat?.doubleValue || f.totalWithVat?.integerValue || f.amount?.doubleValue || f.amount?.integerValue || 0);
      const category = String(f.category?.stringValue || "").trim();
      const itemName = String(f.itemName?.stringValue || "").trim();
      const dateStr = f.date?.stringValue || "";

      const isCost = (category.indexOf("ซื้อน้ำมัน") !== -1 || itemName.includes("95") || itemName.includes("ดีเซล"));
      const mKey = parseMonthKey(dateStr);

      if (mKey && validMonthKeys[mKey] && monthlyData[mKey]) {
        // อัปเดตยอดค่าใช้จ่ายในตารางรายเดือนเฉพาะกรณีที่ค่าใช้จ่ายใน monthly_summary เป็น 0
        if (monthlyData[mKey].expenses === 0 && amt > 0) {
          monthlyData[mKey].expenses += amt;
          if (isCost) {
            monthlyData[mKey].cost += amt;
          } else {
            monthlyData[mKey].otherExp += amt;
          }
        }
      }
    });

    // 1.5 อ่านรายการโอนจ่ายจาก Collection `transfer_records` (หรือ `transfers`)
    let transferRes = callFirestore("GET", "transfer_records");
    if (!transferRes || !transferRes.documents) {
      transferRes = callFirestore("GET", "transfers");
    }
    const transferDocs = (transferRes && transferRes.documents) ? transferRes.documents : [];

    let totalTransferAmount = 0;
    const transferList = [];

    transferDocs.forEach(doc => {
      const f = doc.fields || {};
      const tDate = f.date?.stringValue || f.transferDate?.stringValue || f.createdAt?.timestampValue || "";
      const amt = parseFloat(f.amount?.doubleValue || f.amount?.integerValue || f.totalAmount?.doubleValue || 0);
      const account = f.account?.stringValue || f.fromAccount?.stringValue || f.channel?.stringValue || f.bankAccount?.stringValue || "โอนผ่านธนาคาร";
      const remarks = f.remarks?.stringValue || f.details?.stringValue || f.description?.stringValue || f.note?.stringValue || "-";

      const mKey = parseMonthKey(tDate);
      if (!tDate || (mKey && validMonthKeys[mKey])) {
        totalTransferAmount += amt;
        transferList.push({
          date: tDate,
          account: account,
          amount: amt,
          remarks: remarks
        });
      }
    });

    // เรียงลำดับรายการโอนจ่ายตามวันที่
    transferList.sort((a, b) => new Date(b.date) - new Date(a.date));

    // คำนวณยอดรวมสะสมภาพรวมทั้งหมด
    let totalSales = 0, totalCashSales = 0, totalExpenses = 0, costExpenses = 0, otherExpenses = 0, totalAR = 0;

    const monthlyList = Object.values(monthlyData).map(item => {
      totalSales += item.sales;
      totalCashSales += item.cashSales; // 🟢 บวกสะสมยอดขายเงินสดของแต่ละเดือน
      totalExpenses += item.expenses;
      costExpenses += item.cost;
      otherExpenses += item.otherExp;
      totalAR += item.ar;

      const profit = item.sales - item.expenses; // 🟢 แก้ไข Syntax Error

      return {
        monthKey: item.monthKey,
        yearBE: item.yearBE,
        monthName: item.monthName,
        sales: item.sales,
        cashSales: item.cashSales,
        expenses: item.expenses,
        cost: item.cost,
        otherExp: item.otherExp,
        liters: item.liters,
        liters95: item.liters95,
        litersDiesel: item.litersDiesel,
        netProfit: profit,
        ar: item.ar
      };
    });

    // หาก totalCashSales สะสมได้ 0 ให้ใช้ค่าจาก totalCashSalesFallback
    if (totalCashSales === 0 && totalCashSalesFallback > 0) {
      totalCashSales = totalCashSalesFallback;
    }

    return {
      success: true,
      summary: {
        totalSales: totalSales,
        cashSales: totalCashSales,               // 🟢 ยอดขายเงินสดรวม
        transferTotal: totalTransferAmount,      // ยอดโอนจ่ายรวม
        totalExpenses: totalExpenses,            // ค่าใช้จ่ายสะสม
        costExpenses: costExpenses,              // ต้นทุนจ่าย (ซื้อน้ำมัน)
        otherExpenses: otherExpenses,            // ค่าใช้จ่ายอื่นๆ
        netProfit: totalSales - totalExpenses,  // 🟢 แก้ไข Syntax Error
        borrowedCapital: borrowedCapital,
        totalAR: totalAR,
        companyCapital: companyCapital,
        paCapital: paCapital,
        totalCapital: companyCapital + paCapital
      },
      monthlyList: monthlyList,
      transferList: transferList                 // ตารางโอนจ่าย
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * 2. บันทึกข้อมูลส่วนของทุน และยอดยืมทุน
 */
function saveCapitalSettingsData(companyCapital, paCapital, borrowedCapital) {
  try {
    const payload = {
      fields: {
        companyCapital: { doubleValue: parseFloat(companyCapital) || 0 },
        paCapital: { doubleValue: parseFloat(paCapital) || 0 },
        borrowedCapital: { doubleValue: parseFloat(borrowedCapital) || 0 },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    };
    callFirestore("PATCH", "settings/capital", payload);
    return { success: true, message: "บันทึกตั้งค่าทุนเรียบร้อยแล้ว" };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// Helper: ชื่อเดือนภาษาไทย
function getThaiMonthName(m) {
  const months = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return months[m] || "";
}

/**
 * 4. ซิงค์คำนวณย้อนหลังทุกเดือนที่มีในระบบ
 */

function updateMonthlyFinancialSummary(saleData) {
  try {
    if (!saleData || !saleData.date) return;
    
    var dateStr = parseMonthKey(saleData.date);
    if (!dateStr || dateStr.length < 7) return;

    var docId = dateStr; 
    var url = getFirestoreUrl("monthly_summary/" + docId);

    // ดึงค่าการขายจากข้อมูลที่ส่งเข้ามา
    var totalAmount = parseFloat(saleData.totalAmount) || 0;
    var liters = parseFloat(saleData.liters || saleData.qty) || 0;
    var itemName = String(saleData.itemName || saleData.fuelItemName || "").trim();
    var itemType = String(saleData.itemType || "").trim();
    var isDiesel = itemName.includes("ดีเซล") || itemType.includes("ดีเซล");
    
    // ตรวจสอบประเภทการชำระเงิน
    var pType = String(saleData.paymentType || "").trim();
    var isCredit = (pType === 'เงินเชื่อ');
    var isCash = (pType === 'เงินสด' || pType === 'cash');

    // ตัวแปรเก็บค่าเดิมฝั่งการขาย
    var currentSales = 0;
    var currentCashSales = 0;
    var currentLiters = 0;
    var currentLiters95 = 0;
    var currentLitersDiesel = 0;
    var currentAR = 0;

    // ตัวแปรเก็บค่าเดิมฝั่งค่าใช้จ่าย (รักษาไว้ไม่ให้ถูกลบหาย)
    var currentExpenses = 0;
    var currentCost = 0;
    var currentOther = 0;
    var currentTransfer = 0;

    var getRes = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });

    if (getRes.getResponseCode() === 200) {
      var existingDoc = JSON.parse(getRes.getContentText());
      if (existingDoc && existingDoc.fields) {
        var fields = existingDoc.fields;
        
        // อ่านค่าเดิมฝั่งขาย (รองรับทั้งชื่อเก่าและใหม่)
        var salesField = fields.totalSales || fields.total_sales || fields.sales;
        var cashSalesField = fields.cashSales || fields.cash_sales;
        var litersField = fields.totalLiters || fields.total_liters || fields.liters;
        var l95Field = fields.liters95 || fields.liters_95;
        var lDieselField = fields.litersDiesel || fields.liters_diesel;
        var arField = fields.accountsReceivable || fields.accounts_receivable || fields.ar;

        currentSales = parseFloat(salesField ? (salesField.doubleValue || salesField.integerValue || 0) : 0);
        currentCashSales = parseFloat(cashSalesField ? (cashSalesField.doubleValue || cashSalesField.integerValue || 0) : 0);
        currentLiters = parseFloat(litersField ? (litersField.doubleValue || litersField.integerValue || 0) : 0);
        currentLiters95 = parseFloat(l95Field ? (l95Field.doubleValue || l95Field.integerValue || 0) : 0);
        currentLitersDiesel = parseFloat(lDieselField ? (lDieselField.doubleValue || lDieselField.integerValue || 0) : 0);
        currentAR = parseFloat(arField ? (arField.doubleValue || arField.integerValue || 0) : 0);

        // อ่านค่าเดิมฝั่งค่าใช้จ่าย
        var expField = fields.totalExpenses || fields.total_expenses || fields.expenses;
        var costField = fields.costExpenses || fields.cost_expenses || fields.cost;
        var otherField = fields.otherExpenses || fields.other_expenses || fields.otherExp;
        var transferField = fields.transferTotal || fields.transfer_total;

        currentExpenses = parseFloat(expField ? (expField.doubleValue || expField.integerValue || 0) : 0);
        currentCost = parseFloat(costField ? (costField.doubleValue || costField.integerValue || 0) : 0);
        currentOther = parseFloat(otherField ? (otherField.doubleValue || otherField.integerValue || 0) : 0);
        currentTransfer = parseFloat(transferField ? (transferField.doubleValue || transferField.integerValue || 0) : 0);
      }
    }

    // คำนวณยอดขายใหม่สะสม
    var newSales = currentSales + totalAmount;
    var newCashSales = currentCashSales + (isCash ? totalAmount : 0);
    var newLiters = currentLiters + liters;
    var newLiters95 = currentLiters95 + (isDiesel ? 0 : liters);
    var newLitersDiesel = currentLitersDiesel + (isDiesel ? liters : 0);
    var newAR = currentAR + (isCredit ? totalAmount : 0);

    // จัดโครงสร้าง Payload ครบถ้วนทุกฟิลด์มาตรฐาน
    var summaryPayload = {
      fields: {
        monthKey: { stringValue: dateStr },
        totalSales: { doubleValue: newSales },
        cashSales: { doubleValue: newCashSales },
        totalExpenses: { doubleValue: currentExpenses },
        costExpenses: { doubleValue: currentCost },
        otherExpenses: { doubleValue: currentOther },
        totalLiters: { doubleValue: newLiters },
        liters95: { doubleValue: newLiters95 },
        litersDiesel: { doubleValue: newLitersDiesel },
        accountsReceivable: { doubleValue: newAR },
        transferTotal: { doubleValue: currentTransfer },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };

    UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(summaryPayload),
      muteHttpExceptions: true
    });

  } catch (e) {
    Logger.log("Error in updateMonthlyFinancialSummary: " + e.toString());
  }
}

function recalculateMonthlySummary(dateStr) {
  try {
    const ym = parseMonthKey(dateStr);
    if (!ym) return;

    // 1. คำนวณช่วงวันที่เริ่มต้นและสิ้นสุดของเดือน
    const parts = ym.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const startFormatted = year + "/" + String(month).padStart(2, '0') + "/01";
    const lastDay = new Date(year, month, 0).getDate();
    const endFormatted = year + "/" + String(month).padStart(2, '0') + "/" + String(lastDay).padStart(2, '0');

    // 2. คิวรีดึงรายการขายเฉพาะของเดือนนี้ (สูงสุด 3000 รายการ)
    const salesQuery = {
      structuredQuery: {
        from: [{ collectionId: "sales_records" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: startFormatted } } },
              { fieldFilter: { field: { fieldPath: "date" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: endFormatted } } }
            ]
          }
        },
        limit: 3000
      }
    };
    const salesRes = callFirestore("POST", ":runQuery", salesQuery);

    // 3. คิวรีดึงรายการค่าใช้จ่ายเฉพาะของเดือนนี้ (สูงสุด 3000 รายการ)
    const expQuery = {
      structuredQuery: {
        from: [{ collectionId: "expense_records" }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: [
              { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: startFormatted } } },
              { fieldFilter: { field: { fieldPath: "date" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: endFormatted } } }
            ]
          }
        },
        limit: 3000
      }
    };
    const expRes = callFirestore("POST", ":runQuery", expQuery);

    let sales = 0, cashSales = 0, expenses = 0, cost = 0, otherExp = 0;
    let liters = 0, liters95 = 0, litersDiesel = 0, ar = 0, transferTotal = 0;

    // รวมยอดขาย
    if (Array.isArray(salesRes)) {
      salesRes.forEach(item => {
        if (!item.document || !item.document.fields) return;
        const f = item.document.fields;
        
        const amt = parseFloat(f.totalAmount?.doubleValue || f.totalAmount?.integerValue || 0);
        const l = parseFloat(f.liters?.doubleValue || f.liters?.integerValue || f.qty?.doubleValue || f.qty?.integerValue || 0);
        const itemName = String(f.itemName?.stringValue || "").trim();
        const itemType = String(f.itemType?.stringValue || "").trim();
        const pStatus = String(f.paymentStatus?.stringValue || "unpaid").trim();
        const pType = String(f.paymentType?.stringValue || "").trim();

        const isDiesel = itemName.includes("ดีเซล") || itemType.includes("ดีเซล");
        const isCash = (pType === 'เงินสด' || pType === 'cash');

        sales += amt;
        if (isCash) cashSales += amt;
        liters += l;
        if (isDiesel) litersDiesel += l;
        else liters95 += l;

        // ✅ แก้ไข: คิดเป็นลูกหนี้เฉพาะรายการเงินเชื่อที่ยังไม่ชำระเงิน (unpaid) เท่านั้น
        if ((pType === 'เงินเชื่อ' || pType === 'credit') && pStatus !== 'paid') {
          ar += amt;
        }
      });
    }

    // รวมยอดค่าใช้จ่าย
    if (Array.isArray(expRes)) {
      expRes.forEach(item => {
        if (!item.document || !item.document.fields) return;
        const f = item.document.fields;

        const amt = parseFloat(f.totalWithVat?.doubleValue || f.totalWithVat?.integerValue || f.amount?.doubleValue || f.amount?.integerValue || 0);
        const category = String(f.category?.stringValue || "").trim();
        const itemName = String(f.itemName?.stringValue || "").trim();
        const pType = String(f.paymentType?.stringValue || "").trim();
        const tStatus = String(f.transferStatus?.stringValue || "").trim();

        expenses += amt;
        const isCost = (category.indexOf("ซื้อน้ำมัน") !== -1 || itemName.includes("95") || itemName.includes("ดีเซล"));
        if (isCost) cost += amt;
        else otherExp += amt;

        if (pType === 'เงินโอน' || tStatus === 'transferred') {
          transferTotal += amt;
        }
      });
    }

    const projectId = getProjectId() || "sb-tropical";
    const docPath = "projects/" + projectId + "/databases/(default)/documents/monthly_summary/" + ym;

    const payload = {
      writes: [{
        update: {
          name: docPath,
          fields: {
            monthKey: { stringValue: ym },
            totalSales: { doubleValue: sales },
            cashSales: { doubleValue: cashSales },
            totalExpenses: { doubleValue: expenses },
            costExpenses: { doubleValue: cost },
            otherExpenses: { doubleValue: otherExp },
            totalLiters: { doubleValue: liters },
            liters95: { doubleValue: liters95 },
            litersDiesel: { doubleValue: litersDiesel },
            accountsReceivable: { doubleValue: ar },
            transferTotal: { doubleValue: transferTotal },
            updatedAt: { timestampValue: new Date().toISOString() }
          }
        }
      }]
    };

    callFirestore("POST", ":commit", payload);
  } catch (err) {
    Logger.log("Error in recalculateMonthlySummary: " + err.toString());
  }
}

function updateExpenseMonthlySummary(expData) {
  try {
    if (!expData || !expData.date) return;
    
    var dateStr = parseMonthKey(expData.date);
    if (!dateStr || dateStr.length < 7) return;

    var docId = dateStr;
    var url = getFirestoreUrl("monthly_summary/" + docId);

    var amount = parseFloat(expData.totalWithVat || expData.amount) || 0;
    var category = String(expData.category || "").trim();
    var itemName = String(expData.itemName || "").trim();
    var paymentType = String(expData.paymentType || "").trim();
    
    var isCost = (category.indexOf("ซื้อน้ำมัน") !== -1 || itemName.includes("95") || itemName.includes("ดีเซล"));
    var isTransfer = (paymentType === 'เงินโอน' || paymentType === 'transfer');

    // 🟢 [เพิ่มส่วนนี้] ตัวแปรเก็บค่าเดิมฝั่งการขาย (รักษาไว้ไม่ให้ถูกลบหาย)
    var currentSales = 0;
    var currentCashSales = 0;
    var currentLiters = 0;
    var currentLiters95 = 0;
    var currentLitersDiesel = 0;
    var currentAR = 0;

    // ตัวแปรเก็บค่าเดิมฝั่งค่าใช้จ่าย
    var currentExpenses = 0, currentCost = 0, currentOther = 0, currentTransfer = 0;

    var getRes = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    if (getRes.getResponseCode() === 200) {
      var existingDoc = JSON.parse(getRes.getContentText());
      if (existingDoc && existingDoc.fields) {
        var fields = existingDoc.fields;

        // 🟢 [เพิ่มส่วนนี้] อ่านค่าเดิมฝั่งขายเพื่อรักษาข้อมูลเดิมไว้
        var salesField = fields.totalSales || fields.total_sales || fields.sales;
        var cashSalesField = fields.cashSales || fields.cash_sales;
        var litersField = fields.totalLiters || fields.total_liters || fields.liters;
        var l95Field = fields.liters95 || fields.liters_95;
        var lDieselField = fields.litersDiesel || fields.liters_diesel;
        var arField = fields.accountsReceivable || fields.accounts_receivable || fields.ar;

        currentSales = parseFloat(salesField ? (salesField.doubleValue || salesField.integerValue || 0) : 0);
        currentCashSales = parseFloat(cashSalesField ? (cashSalesField.doubleValue || cashSalesField.integerValue || 0) : 0);
        currentLiters = parseFloat(litersField ? (litersField.doubleValue || litersField.integerValue || 0) : 0);
        currentLiters95 = parseFloat(l95Field ? (l95Field.doubleValue || l95Field.integerValue || 0) : 0);
        currentLitersDiesel = parseFloat(lDieselField ? (lDieselField.doubleValue || lDieselField.integerValue || 0) : 0);
        currentAR = parseFloat(arField ? (arField.doubleValue || arField.integerValue || 0) : 0);

        // อ่านค่าเดิมฝั่งค่าใช้จ่าย
        var expField = fields.totalExpenses || fields.total_expenses || fields.expenses;
        var costField = fields.costExpenses || fields.cost_expenses || fields.cost;
        var otherField = fields.otherExpenses || fields.other_expenses || fields.otherExp;
        var transferField = fields.transferTotal || fields.transfer_total;

        currentExpenses = parseFloat(expField ? (expField.doubleValue || expField.integerValue || 0) : 0);
        currentCost = parseFloat(costField ? (costField.doubleValue || costField.integerValue || 0) : 0);
        currentOther = parseFloat(otherField ? (otherField.doubleValue || otherField.integerValue || 0) : 0);
        currentTransfer = parseFloat(transferField ? (transferField.doubleValue || transferField.integerValue || 0) : 0);
      }
    }

    var newExpenses = currentExpenses + amount;
    var newCost = currentCost + (isCost ? amount : 0);
    var newOther = currentOther + (isCost ? 0 : amount);
    var newTransfer = currentTransfer + (isTransfer ? amount : 0);

    // 🟢 [แก้ไขจุดนี้] จัดโครงสร้าง Payload ครบถ้วนทุกฟิลด์มาตรฐาน (รวมฟิลด์ยอดขายเดิมกลับเข้าไปด้วย)
    var summaryPayload = {
      fields: {
        monthKey: { stringValue: dateStr },
        totalSales: { doubleValue: currentSales },
        cashSales: { doubleValue: currentCashSales },
        totalExpenses: { doubleValue: newExpenses },
        costExpenses: { doubleValue: newCost },
        otherExpenses: { doubleValue: newOther },
        totalLiters: { doubleValue: currentLiters },
        liters95: { doubleValue: currentLiters95 },
        litersDiesel: { doubleValue: currentLitersDiesel },
        accountsReceivable: { doubleValue: currentAR },
        transferTotal: { doubleValue: newTransfer },
        updatedAt: { timestampValue: new Date().toISOString() }
      }
    };

    UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(summaryPayload),
      muteHttpExceptions: true
    });

    // บันทึกลง Collection transfer_records เพื่อใช้สร้างตารางรายการโอนจ่าย
    if (isTransfer) {
      saveTransferRecord({
        date: expData.transferDate || expData.date,
        fromAccount: expData.transferAccount || expData.fromAccount || expData.account || "-",
        amount: amount,
        remarks: expData.remarks || expData.details || itemName || "-"
      });
    }

  } catch (e) {
    Logger.log("Error in updateExpenseMonthlySummary: " + e.toString());
  }
}

/**
 * บันทึกรายการโอนจ่ายลง collection transfer_records
 */
function saveTransferRecord(data) {
  try {
    var docId = "TR-" + new Date().getTime();
    var url = getFirestoreUrl("transfer_records/" + docId);
    
    var payload = {
      fields: {
        date: { stringValue: data.date || '' },
        fromAccount: { stringValue: data.fromAccount || '-' },
        amount: { doubleValue: parseFloat(data.amount) || 0 },
        remarks: { stringValue: data.remarks || '-' },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    };

    UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Error saving transfer_record: " + err.toString());
  }
}

///buyer sumary section////
///buyer sumary section////
///buyer sumary section////
/**
 * ดึงข้อมูลรายชื่อลูกค้าพร้อมยอดขายสะสม (salesSummary) จาก Firestore
 * (ใช้สำหรับหน้ารายงานยอดขายตามลูกค้า)
 */
function getBuyersumary() {
  try {
    var url = getFirestoreUrl("buyer");
    var options = {
      method: "get",
      muteHttpExceptions: true
    };
    
    var res = UrlFetchApp.fetch(url, options);
    var responseCode = res.getResponseCode();

    if (responseCode !== 200) {
      Logger.log("❌ Firestore Error in getBuyersumary: " + res.getContentText());
      return { 
        success: false, 
        message: "เกิดข้อผิดพลาดจาก Firestore (Code " + responseCode + ")" 
      };
    }

    var json = JSON.parse(res.getContentText());
    var documents = json.documents || [];

    var buyersData = documents.map(function(doc) {
      var fields = doc.fields || {};
      
      var nameParts = doc.name ? doc.name.split('/') : [];
      var docId = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';

      var salesSummaryObj = {
        "95": { totalLiters: 0, totalAmount: 0 },
        "diesel": { totalLiters: 0, totalAmount: 0 }
      };

      if (fields.salesSummary && fields.salesSummary.mapValue && fields.salesSummary.mapValue.fields) {
        var mapFields = fields.salesSummary.mapValue.fields;

        ['95', 'diesel'].forEach(function(oilKey) {
          if (mapFields[oilKey] && mapFields[oilKey].mapValue && mapFields[oilKey].mapValue.fields) {
            var itemMap = mapFields[oilKey].mapValue.fields;

            var litersVal = 0;
            if (itemMap.totalLiters) {
              litersVal = parseFloat(itemMap.totalLiters.doubleValue || itemMap.totalLiters.integerValue || 0);
            }

            var amountVal = 0;
            if (itemMap.totalAmount) {
              amountVal = parseFloat(itemMap.totalAmount.doubleValue || itemMap.totalAmount.integerValue || 0);
            }

            salesSummaryObj[oilKey] = {
              totalLiters: isNaN(litersVal) ? 0 : litersVal,
              totalAmount: isNaN(amountVal) ? 0 : amountVal
            };
          }
        });
      }

      return {
        id: docId,
        name: fields.name ? (fields.name.stringValue || '') : '',
        fullname: fields.fullname ? (fields.fullname.stringValue || '') : '',
        address: fields.address ? (fields.address.stringValue || '-') : '-',
        taxid: fields.taxid ? (fields.taxid.stringValue || '-') : '-',
        salesSummary: salesSummaryObj
      };
    });

    Logger.log("✅ ดึงข้อมูลสรุปยอดขายลูกค้าสำเร็จ จำนวน " + buyersData.length + " ราย");
    return {
      success: true,
      data: buyersData
    };

  } catch (err) {
    Logger.log("💥 Exception in getBuyersumary: " + err.toString());
    return {
      success: false,
      message: "เกิดข้อผิดพลาดฝั่ง Server: " + err.toString()
    };
  }
}

////migrat Section/////
////migrat Section/////
////migrat Section/////
/**
 * ฟังก์ชันนำเข้าข้อมูลผู้รับเงิน/ร้านค้า จาก Google Sheet (ชีท "Database" คอลัมน์ M2:M)
 * เข้า Firestore Collection "pay_record" (ใช้ Service Account Auth)
 */
function importPayFromSheet() {
  var spreadsheetId = "17Utvu_PNGEOHok6aaOZZYGWgnuEh-oHFXKNLroPo9Lc";
  var sheetName = "Database";
  
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log("❌ ไม่พบชีทชื่อ " + sheetName);
      return "ไม่พบชีทชื่อ " + sheetName;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("⚠️ ไม่พบข้อมูลตั้งแต่แถวที่ 2 เป็นต้นไป");
      return "ไม่มีข้อมูลให้ย้าย";
    }
    
    var projectId = getProjectId();
    if (!projectId) {
      Logger.log("❌ ไม่พบ FIREBASE_PROJECT_ID ใน Script Properties");
      return "ไม่พบข้อมูลตั้งค่า Firebase";
    }
    
    var numRows = lastRow - 1;
    // อ่านข้อมูลจากคอลัมน์ M (คอลัมน์ที่ 13) เริ่มตั้งแต่แถวที่ 2
    var data = sheet.getRange(2, 13, numRows, 1).getValues();
    
    var allWrites = [];
    var skipCount = 0;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var name = row[0] ? row[0].toString().trim() : "";
      
      if (!name) {
        skipCount++;
        continue;
      }
      
      var docId = "PAY_" + Utilities.getUuid().substring(0, 8);
      var docPath = "projects/" + projectId + "/databases/(default)/documents/pay_record/" + docId;
      
      allWrites.push({
        update: {
          name: docPath,
          fields: {
            name: { stringValue: name }
          }
        }
      });
    }
    
    if (allWrites.length === 0) {
      return "ไม่มีรายการข้อมูลที่จะนำเข้า";
    }
    
    // ส่งข้อมูลแบบ Batch ผ่าน callFirestore (ใช้ Bearer Token ของ Service Account)
    var BATCH_SIZE = 400; 
    var totalImported = 0;
    
    for (var j = 0; j < allWrites.length; j += BATCH_SIZE) {
      var chunk = allWrites.slice(j, j + BATCH_SIZE);
      
      var response = callFirestore("POST", ":commit", { writes: chunk });
      
      if (response && !response.error) {
        totalImported += chunk.length;
        Logger.log("✅ นำเข้าข้อมูลรายชื่อผู้รับเงินก้อนที่ " + (Math.floor(j / BATCH_SIZE) + 1) + " สำเร็จ (" + chunk.length + " รายการ)");
      } else {
        Logger.log("❌ ล้มเหลวในก้อนที่ " + (Math.floor(j / BATCH_SIZE) + 1) + ": " + JSON.stringify(response));
      }
    }
    
    var resultMsg = "🎉 นำเข้าข้อมูลรายชื่อผู้รับเงินสำเร็จทั้งหมด " + totalImported + " รายการ (ข้ามแถวว่าง " + skipCount + " รายการ)";
    Logger.log(resultMsg);
    return resultMsg;
    
  } catch (err) {
    Logger.log("เกิดข้อผิดพลาด: " + err.toString());
    return "เกิดข้อผิดพลาด: " + err.toString();
  }
}

// 6. นำเข้าข้อมูลผู้ซื้อจาก Google Sheet
function importBuyersFromSheet() {
  var spreadsheetId = "17Utvu_PNGEOHok6aaOZZYGWgnuEh-oHFXKNLroPo9Lc";
  var sheetName = "Database";
  
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log("❌ ไม่พบชีทชื่อ " + sheetName);
      return "ไม่พบชีทชื่อ " + sheetName;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("⚠️ ไม่พบข้อมูลตั้งแต่แถวที่ 2 เป็นต้นไป");
      return "ไม่มีข้อมูลให้ย้าย";
    }
    
    var props = PropertiesService.getScriptProperties();
    var projectId = props.getProperty('FIREBASE_PROJECT_ID') || 'sb-tropical';
    var apiKey = props.getProperty('FIREBASE_API_KEY') || '';
    
    var numRows = lastRow - 1;
    var data = sheet.getRange(2, 8, numRows, 5).getValues();
    
    var allWrites = [];
    var skipCount = 0;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var name = row[0] ? row[0].toString().trim() : "";
      var fullname = row[2] ? row[2].toString().trim() : "";
      var address = row[3] ? row[3].toString().trim() : "";
      var taxid = row[4] ? row[4].toString().trim() : "";
      
      if (!name) {
        skipCount++;
        continue;
      }
      
      var docId = "BUYER_" + Utilities.getUuid();
      var docPath = "projects/" + projectId + "/databases/(default)/documents/buyer/" + docId;
      
      allWrites.push({
        update: {
          name: docPath,
          fields: {
            name: { stringValue: name },
            fullname: { stringValue: fullname },
            address: { stringValue: address },
            taxid: { stringValue: taxid }
          }
        }
      });
    }
    
    if (allWrites.length === 0) {
      return "ไม่มีรายการข้อมูลที่จะนำเข้า";
    }
    
    var BATCH_SIZE = 400; 
    var totalImported = 0;
    var batchUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents:batchWrite";
    if (apiKey) {
      batchUrl += "?key=" + apiKey;
    }
    
    for (var j = 0; j < allWrites.length; j += BATCH_SIZE) {
      var chunk = allWrites.slice(j, j + BATCH_SIZE);
      
      var payload = {
        writes: chunk
      };
      
      var options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      var response = UrlFetchApp.fetch(batchUrl, options);
      var statusCode = response.getResponseCode();
      
      if (statusCode >= 200 && statusCode < 300) {
        totalImported += chunk.length;
        Logger.log("✅ ยิงข้อมูลก้อนที่ " + (Math.floor(j / BATCH_SIZE) + 1) + " สำเร็จ (" + chunk.length + " รายการ)");
      } else {
        Logger.log("❌ ล้มเหลวในก้อนที่ " + (Math.floor(j / BATCH_SIZE) + 1) + ": " + response.getContentText());
      }
    }
    
    var resultMsg = "🎉 นำเข้าข้อมูลสำเร็จทั้งหมด " + totalImported + " รายการ (ข้ามแถวว่าง " + skipCount + " รายการ)";
    Logger.log(resultMsg);
    return resultMsg;
    
  } catch (err) {
    Logger.log("เกิดข้อผิดพลาด: " + err.toString());
    return "เกิดข้อผิดพลาด: " + err.toString();
  }
}

/**
 * ฟังก์ชันนำเข้าข้อมูล Sales Record จาก Google Sheet เข้า Firestore
 */
function migrateSalesRecordsFromSheet() {
  var spreadsheetId = "17Utvu_PNGEOHok6aaOZZYGWgnuEh-oHFXKNLroPo9Lc";
  var sheetName = "Sales Record";
  
  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log("❌ ไม่พบชีทชื่อ " + sheetName);
      return "ไม่พบชีทชื่อ " + sheetName;
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      Logger.log("⚠️ ไม่พบข้อมูลตั้งแต่แถวที่ 3 เป็นต้นไป");
      return "ไม่มีข้อมูลให้ย้าย";
    }
    
    var projectId = getProjectId(); 
    if (!projectId) {
      Logger.log("❌ ไม่พบ FIREBASE_API_KEY หรือ FIREBASE_PROJECT_ID ใน Script Properties");
      return "ไม่พบข้อมูลตั้งค่า Firebase";
    }
    
    // ✅ แก้ไข Syntax การคำนวณจำนวนแถว
    var numRows = lastRow - 2;
    var data = sheet.getRange(3, 1, numRows, 21).getValues();
    
    var allWrites = [];
    var skipCount = 0;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      
      var saleNo = row[0] ? row[0].toString().trim() : "";
      var rawDate = row[1];
      var buyerName = row[2] ? row[2].toString().trim() : "";
      var rawOilType = row[3] ? row[3].toString().trim() : "";
      var colE = parseFloat(row[4]) || 0;
      var colF = parseFloat(row[5]) || 0;
      var totalAmount = parseFloat(row[6]) || 0;
      var remarks = row[7] ? row[7].toString().trim() : "";
      
      var cashVal = parseFloat(row[8]) || 0;
      var creditVal = parseFloat(row[9]) || 0;
      var paymentDate = parseAndFormatDate(row[10]);
      var discount = parseFloat(row[11]) || 0;
      var paidAmount = parseFloat(row[12]) || 0;
      var dueAmount = parseFloat(row[13]) || 0;
      var paymentStatus = row[14] ? row[14].toString().trim().toLowerCase() : "unpaid";
      
      // 🧪 สำหรับทดสอบระบบ: บังคับให้เป็นยังไม่ออกใบวางบิล (isBilled = false)
      var isBilled = false; 
      var billNo = "";
      var billDate = "";
      
      var isReceiptIssued = row[18] === true || String(row[18]).toLowerCase() === 'true';
      var receiptNo = row[19] ? row[19].toString().trim() : "";
      var receiptDate = parseAndFormatDate(row[20]);
      
      if (!buyerName && !rawDate && !saleNo) {
        skipCount++;
        continue;
      }
      
      var formattedDate = parseAndFormatDate(rawDate);
      
      var itemType = "อื่นๆ";
      var itemName = rawOilType || remarks || "อื่นๆ";
      var pricePerLiter = 0;
      var liters = 0;
      var unitPrice = colE;
      var qty = colF;
      
      var lowerOil = rawOilType.toLowerCase();
      if (lowerOil.indexOf("95") !== -1 || lowerOil.indexOf("ดีเซล") !== -1 || lowerOil.indexOf("diesel") !== -1) {
        itemType = "น้ำมัน";
        itemName = rawOilType;
        pricePerLiter = colE;
        liters = colF;
        unitPrice = colE;
        qty = colF;
      }
      
      var paymentType = "เงินสด";
      if (creditVal > 0) {
        paymentType = "เงินเชื่อ";
      } else if (cashVal > 0) {
        paymentType = "เงินสด";
      }
      
      var docId;
      if (saleNo) {
        docId = saleNo.replace(/\//g, "-");
      } else {
        docId = "SALE_" + Utilities.getUuid().substring(0, 8);
      }

      var docPath = "projects/" + projectId + "/databases/(default)/documents/sales_records/" + docId;
      
      var recordObj = {
        saleNo: saleNo,
        date: formattedDate,
        buyerName: buyerName,
        itemType: itemType,
        itemName: itemName,
        pricePerLiter: pricePerLiter,
        liters: liters,
        unitPrice: unitPrice,
        qty: qty,
        totalAmount: totalAmount,
        precision: 2,
        paymentType: paymentType,
        remarks: remarks,
        cashAmount: cashVal,
        creditAmount: creditVal,
        paymentDate: paymentDate,
        discount: discount,
        paidAmount: paidAmount,
        dueAmount: dueAmount,
        paymentStatus: paymentStatus,
        isBilled: isBilled,        // 👈 กำหนดเป็น false
        billNo: billNo,            // 👈 ค่าว่าง ""
        billDate: billDate,        // 👈 ค่าว่าง ""
        isReceiptIssued: isReceiptIssued,
        receiptNo: receiptNo,
        receiptDate: receiptDate,
        createdAt: new Date().toISOString()
      };

      allWrites.push({
        update: {
          name: docPath,
          fields: toFirestoreFields(recordObj).fields
        }
      });
    }
    
    if (allWrites.length === 0) {
      return "ไม่มีรายการข้อมูลที่จะนำเข้า";
    }
    
    var BATCH_SIZE = 400; 
    var totalImported = 0;
    
    for (var j = 0; j < allWrites.length; j += BATCH_SIZE) {
      var chunk = allWrites.slice(j, j + BATCH_SIZE);
      var response = callFirestore("POST", ":commit", { writes: chunk });
      
      if (response && !response.error) {
        totalImported += chunk.length;
        Logger.log("✅ นำเข้าข้อมูลการขายชุดที่ " + (Math.floor(j / BATCH_SIZE) + 1) + " สำเร็จ (" + chunk.length + " รายการ)");
      } else {
        Logger.log("❌ ล้มเหลวในชุดที่ " + (Math.floor(j / BATCH_SIZE) + 1) + ": " + JSON.stringify(response));
      }
    }
    
    var resultMsg = "🎉 ย้ายข้อมูลการขายสำเร็จทั้งหมด " + totalImported + " รายการ (ข้ามแถวว่าง " + skipCount + " รายการ)";
    Logger.log(resultMsg);
    return resultMsg;
    
  } catch (err) {
    Logger.log("เกิดข้อผิดพลาด: " + err.toString());
    return "เกิดข้อผิดพลาด: " + err.toString();
  }
}
/**
 * ฟังก์ชันนำเข้าข้อมูลค่าใช้จ่าย/การจ่ายเงิน จาก Google Sheet (ชีท "Pay Record") เข้า Firestore Collection "expense_records"
 */
function migrateExpenseRecordsFromSheet() {
  var spreadsheetId = "17Utvu_PNGEOHok6aaOZZYGWgnuEh-oHFXKNLroPo9Lc";
  var sheetName = "Pay Record";

  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log("❌ ไม่พบชีทชื่อ " + sheetName);
      return "ไม่พบชีทชื่อ " + sheetName;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 3) {
      Logger.log("⚠️ ไม่พบข้อมูลตั้งแต่แถวที่ 3 เป็นต้นไป");
      return "ไม่มีข้อมูลให้ย้าย";
    }

    var projectId = getProjectId();
    if (!projectId) {
      Logger.log("❌ ไม่พบ FIREBASE_API_KEY หรือ FIREBASE_PROJECT_ID ใน Script Properties");
      return "ไม่พบข้อมูลตั้งค่า Firebase";
    }

    var numRows = lastRow - 2;
    var data = sheet.getRange(3, 1, numRows, 20).getValues();

    var allWrites = [];
    var skipCount = 0;

    for (var i = 0; i < data.length; i++) {
      var row = data[i];

      var no = row[0] ? row[0].toString().trim() : "";
      var rawDate = row[1];
      var listName = row[2] ? row[2].toString().trim() : "";
      var itemName = row[3] ? row[3].toString().trim() : "";
      var pricePerLiter = parseFloat(row[4]) || 0;
      var liters = parseFloat(row[5]) || 0;
      var amount = parseFloat(row[6]) || 0;
      var expenseNo = row[7] ? row[7].toString().trim() : "";
      var amountBeforeVat = parseFloat(row[8]) || 0;
      var vatAmount = parseFloat(row[9]) || 0;
      var totalWithVat = parseFloat(row[10]) || 0;

      var isStock = row[12] === true || String(row[12]).toLowerCase() === 'true';
      var remarks = row[13] ? row[13].toString().trim() : "";
      
      var isRequisition = row[14] === true || String(row[14]).toLowerCase() === 'true';
      var requisitionNo = row[15] ? row[15].toString().trim() : "";
      var requisitionDate = parseAndFormatDate(row[16]);
      
      var paymentType = row[17] ? row[17].toString().trim() : "เงินโอน";
      var transferNo = row[18] ? row[18].toString().trim() : "";
      var transferDate = parseAndFormatDate(row[19]);

      if (!listName && !rawDate && !expenseNo && !no) {
        skipCount++;
        continue;
      }

      var formattedDate = parseAndFormatDate(rawDate);

      var docId;
      var refId = expenseNo || no;
      if (refId) {
        docId = refId.replace(/\//g, "-");
      } else {
        docId = "EXP_" + Utilities.getUuid().substring(0, 8);
      }

      var docPath = "projects/" + projectId + "/databases/(default)/documents/expense_records/" + docId;

      var recordObj = {
        no: no,
        expenseNo: expenseNo || no,
        date: formattedDate,
        payeeName: listName,
        category: listName,
        itemName: itemName,
        pricePerLiter: pricePerLiter,
        liters: liters,
        amount: amount,
        amountBeforeVat: amountBeforeVat,
        vatAmount: vatAmount,
        totalWithVat: totalWithVat,
        isStock: isStock,
        remarks: remarks,
        isRequisition: isRequisition,
        requisitionNo: requisitionNo,
        requisitionDate: requisitionDate,
        paymentType: paymentType,
        transferNo: transferNo,
        transferDate: transferDate,
        createdAt: new Date().toISOString()
      };

      allWrites.push({
        update: {
          name: docPath,
          fields: toFirestoreFields(recordObj).fields
        }
      });
    }

    if (allWrites.length === 0) {
      return "ไม่มีรายการข้อมูลที่จะนำเข้า";
    }

    var BATCH_SIZE = 400;
    var totalImported = 0;

    for (var j = 0; j < allWrites.length; j += BATCH_SIZE) {
      var chunk = allWrites.slice(j, j + BATCH_SIZE);
      var response = callFirestore("POST", ":commit", { writes: chunk });

      if (response && !response.error) {
        totalImported += chunk.length;
        Logger.log("✅ นำเข้าข้อมูลค่าใช้จ่ายชุดที่ " + (Math.floor(j / BATCH_SIZE) + 1) + " สำเร็จ (" + chunk.length + " รายการ)");
      } else {
        Logger.log("❌ ล้มเหลวในชุดที่ " + (Math.floor(j / BATCH_SIZE) + 1) + ": " + JSON.stringify(response));
      }
    }

    var resultMsg = "🎉 ย้ายข้อมูลค่าใช้จ่ายสำเร็จทั้งหมด " + totalImported + " รายการ (ข้ามแถวว่าง " + skipCount + " รายการ)";
    Logger.log(resultMsg);
    return resultMsg;

  } catch (err) {
    Logger.log("เกิดข้อผิดพลาด: " + err.toString());
    return "เกิดข้อผิดพลาด: " + err.toString();
  }
}

function syncFuelSalesFromSalesRecords() {
  Logger.log("==================================================");
  Logger.log("🚀 [START] เริ่มต้นซิงค์ประวัติขายน้ำมันเข้า Sub-collection...");

  try {
    let allSalesDocs = [];
    let pageToken = "";
    let pageCount = 0;

    // 1. ดึงเอกสาร sales_records ครบทุกหน้าด้วย Pagination (ครั้งละ 300 รายการ)
    do {
      pageCount++;
      let endpoint = "sales_records?pageSize=300";
      if (pageToken) {
        endpoint += "&pageToken=" + pageToken;
      }

      const res = callFirestore("GET", endpoint);
      if (res && res.documents && Array.isArray(res.documents)) {
        allSalesDocs = allSalesDocs.concat(res.documents);
        pageToken = res.nextPageToken || "";
        Logger.log("📄 ดึงข้อมูล sales_records หน้า " + pageCount + " สำเร็จ (" + res.documents.length + " รายการ, สะสม: " + allSalesDocs.length + ")");
      } else {
        pageToken = "";
      }
    } while (pageToken);

    Logger.log("📦 รวมเอกสารจาก sales_records ได้ทั้งหมด: " + allSalesDocs.length + " รายการ");

    if (allSalesDocs.length === 0) {
      return { success: false, message: "ไม่พบเอกสารใน sales_records" };
    }

    // Helper: ดึงข้อมูลสรุปเดิมจากเอกสารหลัก oil_stock/{docId}
    function getParentStockData(docId) {
      const stockRes = callFirestore("GET", "oil_stock/" + docId);
      let initialStock = 0, totalIn = 0;

      if (stockRes && stockRes.fields) {
        const f = stockRes.fields;
        initialStock = parseFloat(f.initialStock?.doubleValue || f.initialStock?.integerValue || 0);
        totalIn = parseFloat(f.totalIn?.doubleValue || f.totalIn?.integerValue || 0);

        // คำนวณ totalIn จาก imports หากมีข้อมูลใน imports
        if (f.imports?.arrayValue?.values) {
          let sumIn = 0;
          f.imports.arrayValue.values.forEach(function(item) {
            const mapF = item.mapValue?.fields || {};
            sumIn += parseFloat(mapF.liters?.doubleValue || mapF.liters?.integerValue || 0);
          });
          if (sumIn > 0) totalIn = sumIn;
        }
      }

      return {
        initialStock: initialStock,
        totalIn: totalIn
      };
    }

    const stock95Info = getParentStockData('95');
    const stockDieselInfo = getParentStockData('diesel');

    let totalOut95 = 0;
    let totalOutDiesel = 0;
    let count95 = 0;
    let countDiesel = 0;

    // 2. วนลูปคัดแยกและเขียนข้อมูลลง Sub-collection
    allSalesDocs.forEach(function(doc) {
      const f = doc.fields || {};
      const docId = doc.name ? doc.name.split('/').pop() : '';

      const itemName = String(f.itemName?.stringValue || '').trim();
      const itemType = String(f.itemType?.stringValue || '').trim();
      const saleNo = String(f.saleNo?.stringValue || f.no?.stringValue || docId).trim();
      const recDate = String(f.date?.stringValue || f.saleDate?.stringValue || '').trim();
      const paymentType = String(f.paymentType?.stringValue || 'เงินสด').trim();

      // ดึงจำนวนลิตร
      const liters = parseFloat(
        f.liters?.doubleValue || f.liters?.integerValue ||
        f.qty?.doubleValue || f.qty?.integerValue || 0
      );

      // ตรวจสอบเงื่อนไขเงินสด (ถ้าไม่ใช่เงินสด ค่า cash จะเป็น 0)
      const isCash = (paymentType === 'เงินสด' || paymentType.indexOf('เงินสด') !== -1);
      const totalAmount = parseFloat(
        f.totalAmount?.doubleValue || f.totalAmount?.integerValue ||
        f.amount?.doubleValue || f.amount?.integerValue || 0
      );
      const cashValue = isCash ? totalAmount : 0;

      // จำแนกชนิดน้ำมัน
      const is95 = (itemName === '95' || itemName.includes('95') || itemName.includes('แก๊สโซฮอล์') || itemName.includes('เบนซิน'));
      const isDiesel = (itemName.includes('ดีเซล') || itemName.toLowerCase().includes('diesel') || itemName.toLowerCase().includes('b7'));

      if ((is95 || isDiesel || itemType === 'น้ำมัน') && liters > 0) {
        const targetFuel = is95 ? '95' : 'diesel';

        // บันทึกลง Sub-collection: oil_stock/{targetFuel}/exports/{saleNo}
        const exportPath = "oil_stock/" + targetFuel + "/exports/" + saleNo;
        const exportPayload = {
          fields: {
            saleNo: { stringValue: saleNo },
            date: { stringValue: recDate },
            liters: { doubleValue: liters },
            paymentType: { stringValue: paymentType },
            cash: { doubleValue: cashValue },
            updatedAt: { timestampValue: new Date().toISOString() }
          }
        };

        callFirestore("PATCH", exportPath, exportPayload);

        if (is95) {
          totalOut95 += liters;
          count95++;
        } else {
          totalOutDiesel += liters;
          countDiesel++;
        }
      }
    });

    // 3. คำนวณสต็อกคงเหลือ และอัปเดตสรุปยอดสะสมในเอกสารหลัก
    // ⛽ เบนซิน 95
    const currentStock95 = stock95Info.initialStock + stock95Info.totalIn - totalOut95;
    callFirestore("PATCH", "oil_stock/95", {
      fields: {
        fuelType: { stringValue: '95' },
        initialStock: { doubleValue: stock95Info.initialStock },
        totalIn: { doubleValue: stock95Info.totalIn },
        totalOut: { doubleValue: totalOut95 },
        currentStock: { doubleValue: currentStock95 },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    });

    // ⛽ ดีเซล
    const currentStockDiesel = stockDieselInfo.initialStock + stockDieselInfo.totalIn - totalOutDiesel;
    callFirestore("PATCH", "oil_stock/diesel", {
      fields: {
        fuelType: { stringValue: 'diesel' },
        initialStock: { doubleValue: stockDieselInfo.initialStock },
        totalIn: { doubleValue: stockDieselInfo.totalIn },
        totalOut: { doubleValue: totalOutDiesel },
        currentStock: { doubleValue: currentStockDiesel },
        lastUpdated: { timestampValue: new Date().toISOString() }
      }
    });

    Logger.log("==================================================");
    Logger.log("✅ [SUCCESS] ซิงค์ประวัติขายน้ำมันเข้า Sub-collection สำเร็จ!");
    Logger.log("   -> รวมอ่าน sales_records: " + allSalesDocs.length + " รายการ");
    Logger.log("   -> 95: ย้ายลง Sub-collection " + count95 + " รายการ (รวมขายออก " + totalOut95.toLocaleString() + " ลิตร)");
    Logger.log("   -> ดีเซล: ย้ายลง Sub-collection " + countDiesel + " รายการ (รวมขายออก " + totalOutDiesel.toLocaleString() + " ลิตร)");
    Logger.log("==================================================");

    return {
      success: true,
      message: "ซิงค์ประวัติขายน้ำมันเข้า Sub-collection สำเร็จ (95: " + count95 + " รายการ, ดีเซล: " + countDiesel + " รายการ)",
      totalSalesDocs: allSalesDocs.length,
      count95: count95,
      countDiesel: countDiesel
    };

  } catch (err) {
    Logger.log("💥 เกิดข้อผิดพลาดใน syncFuelSalesFromSalesRecords: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

// 📌 ระบุ ID ของ Google Slides Template และ Folder จัดเก็บ
const SLIDE_TEMPLATE_ID = '15WgKUbeDfE1pmPjA3Zlzt12Vpl-W2Q6Z3togesIZPcQ';
const BILLING_FOLDER_ID = '1_Oe1wkVrp53gq0fOrMCkT0w2a1pjVjvb';

function generatePdfFromSlideTemplate(data) {
  console.log('🚀 === [START] generatePdfFromSlideTemplate ===');
  console.log('📌 Payload Data Received:', JSON.stringify(data));

  if (!data) {
    return { success: false, message: 'ไม่พบข้อมูล Data ที่ส่งมาจากหน้าเว็บ' };
  }

  try {
    // 1. ตรวจสอบและดึงไฟล์ Template / Folder
    console.log('1️⃣ Checking Template File ID:', SLIDE_TEMPLATE_ID);
    const templateFile = DriveApp.getFileById(SLIDE_TEMPLATE_ID);
    
    console.log('2️⃣ Checking Target Folder ID:', BILLING_FOLDER_ID);
    const targetFolder = DriveApp.getFolderById(BILLING_FOLDER_ID);

    // 2. สำเนาไฟล์ Template ชั่วคราว
    console.log('3️⃣ Copying Template file...');
    const tempFile = templateFile.makeCopy('Billing_Temp_' + (data.billNo || 'Draft'));
    const presentation = SlidesApp.openById(tempFile.getId());
    const slides = presentation.getSlides();

    console.log(`📊 Total slides in template: ${slides.length}`);
    if (slides.length === 0) {
      throw new Error('ไม่พบ Slide ในไฟล์ Template');
    }

    const templateSlide = slides[0];
    const items = data.items || [];
    const MAX_ROWS = 16; // 16 รายการต่อหน้า

    console.log(`📦 Total items to process: ${items.length}`);

    // 3. คำนวณจำนวนหน้า
    const totalPages = Math.max(1, Math.ceil(items.length / MAX_ROWS));
    console.log(`📄 Total pages to create: ${totalPages}`);

    let pageSlides = [];

    // 4. คัดลอก Slide ตามจำนวนหน้าจริง
    for (let p = 0; p < totalPages; p++) {
      const newSlide = presentation.appendSlide(templateSlide);
      const startIdx = p * MAX_ROWS;
      const endIdx = startIdx + MAX_ROWS;
      const chunk = items.slice(startIdx, endIdx);

      pageSlides.push({
        slide: newSlide,
        chunk: chunk,
        pageNum: p + 1,
        isLastPage: (p + 1 === totalPages)
      });
    }

    // ลบ Slide แม่แบบเริ่มต้นออก
    templateSlide.remove();
    console.log('✂️ Template master slide removed.');

    // 5. วนลูปแทนค่าข้อความและตารางในแต่ละ Slide
    pageSlides.forEach((pData) => {
      console.log(`📝 Processing Page ${pData.pageNum} of ${totalPages}...`);
      const slide = pData.slide;
      const chunk = pData.chunk;
      const pageNum = pData.pageNum;
      const isLastPage = pData.isLastPage;

      // แทนค่าข้อความส่วนหัว
      slide.replaceAllText('{{no}}', data.billNo || '-');
      slide.replaceAllText('{{date}}', data.billDate || '-');
      slide.replaceAllText('{{page}}', `${pageNum} / ${totalPages}`);
      slide.replaceAllText('{{name}}', data.buyerName || '-');
      slide.replaceAllText('{{address}}', data.buyerAddress || '-');
      slide.replaceAllText('{{taxid}}', data.buyerTaxId || '-');
      slide.replaceAllText('{{buyerRemark}}', data.buyerRemark || '-');

    if (isLastPage) {
        // หากเป็นหน้าสุดท้าย (หรือมีหน้าเดียว) -> แสดงยอดเงินจริง
        slide.replaceAllText('{{subtotal}}', formatCurrency(data.subtotal));
        slide.replaceAllText('{{vat}}', formatCurrency(data.vatAmount));
        slide.replaceAllText('{{grandtotal}}', formatCurrency(data.grandTotal));
      } else {
        slide.replaceAllText('{{subtotal}}', 'ยอดยกไป');
        slide.replaceAllText('{{vat}}', '');
        slide.replaceAllText('{{grandtotal}}', '');
      }

      // หยอดข้อมูลลงในตาราง
      const tables = slide.getTables();
      console.log(`🔍 Page ${pageNum} found ${tables.length} table(s).`);

      if (tables.length > 0) {
        const table = tables[0];
        const numRows = table.getNumRows();
        const numCols = table.getNumColumns(); // 📌 แก้ไขชื่อฟังก์ชันจาก getNumberOfColumns เป็น getNumColumns
        console.log(`📐 Table dimensions: ${numRows} Rows x ${numCols} Columns`);

        if (numRows < MAX_ROWS + 1) {
          console.warn(`⚠️ Warning: Table has ${numRows} rows, but ${MAX_ROWS + 1} rows are required for 16 items!`);
        }

        for (let i = 1; i <= MAX_ROWS; i++) {
          const item = chunk[i - 1];

          if (i >= numRows) {
            console.error(`❌ Table Row Error: Attempted to access Row Index ${i}, but Table only has ${numRows} rows!`);
            break;
          }

          if (item) {
            const globalIndex = (pageNum - 1) * MAX_ROWS + i;
            table.getCell(i, 0).getText().setText(String(globalIndex));
            table.getCell(i, 1).getText().setText(item.saleNo || '-');
            table.getCell(i, 2).getText().setText(item.date || '-');
            table.getCell(i, 3).getText().setText(item.fuel || '-');
            table.getCell(i, 4).getText().setText(formatCurrency(item.qty));
            table.getCell(i, 5).getText().setText(formatCurrency(item.pricePerLiter));
            table.getCell(i, 6).getText().setText(formatCurrency(item.total));
            table.getCell(i, 7).getText().setText(item.remark || '');
          } else {
            for (let col = 0; col < Math.min(8, numCols); col++) {
              table.getCell(i, col).getText().setText('');
            }
          }
        }
      } else {
        console.error('❌ Table Error: No tables found in template slide!');
      }
    });

    console.log('💾 Saving and closing presentation...');
    presentation.saveAndClose();

    // 6. แปลงเป็น PDF และบันทึกลงใน Folder
    console.log('📄 Converting presentation to PDF Blob...');
    const pdfBlob = tempFile.getAs('application/pdf');
    const fileName = 'ใบวางบิล_' + (data.billNo || 'Draft') + '.pdf';
    
    console.log(`📁 Creating PDF file "${fileName}" in Folder...`);
    const pdfFile = targetFolder.createFile(pdfBlob).setName(fileName);

    // ลบไฟล์ Presentation ชั่วคราว
    tempFile.setTrashed(true);
    console.log('🗑️ Temp presentation trashed.');

    // เปิดสิทธิ์ให้อ่านผ่านลิงก์
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

        // 2. ดึง File ID และสร้าง Preview URL
        const fileId = pdfFile.getId();
        const pdfUrl = 'https://drive.google.com/file/d/' + fileId + '/view';

        console.log('✅ PDF Successfully Generated! Preview Link:', pdfUrl);

        return {
          success: true,
          pdfUrl: pdfUrl,
          billNo: data.billNo
        };
  } catch (err) {
    console.error('❌ [FATAL ERROR] generatePdfFromSlideTemplate failed:', err.stack || err.toString());
    return {
      success: false,
      message: err.toString()
    };
  }
}

function formatCurrency(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '-';
  if (num === 0) return '0.00';
  return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function authorizeServices() {
  DriveApp.getRootFolder();
  SlidesApp.openById('15WgKUbeDfE1pmPjA3Zlzt12Vpl-W2Q6Z3togesIZPcQ');
  UrlFetchApp.fetch('https://www.google.com');
  console.log('✅ อนุมัติสิทธิ์เรียบร้อยแล้ว!');
}

/**
 * 📌 ฟังก์ชันบังคับปลดล็อกและลงทะเบียนสิทธิ์ (Force Authorize)
 * รันฟังก์ชันนี้ใน Editor เพื่อบีบให้ Google ออกป๊อปอัปขอสิทธิ์ครอบคลุมทุกบริการ
 */
function forceAuthorizeAllScopes() {
  console.log('🔄 กำลังตรวจสอบและบังคับลงทะเบียนสิทธิ์...');

  // 1. บังคับเรียกสิทธิ์ DriveApp
  const rootFolder = DriveApp.getRootFolder();
  console.log('✅ DriveApp Access OK:', rootFolder.getName());

  // 2. บังคับเรียกสิทธิ์ SlidesApp (ใช้ Template ID ของคุณ)
  const templateId = '15WgKUbeDfE1pmPjA3Zlzt12Vpl-W2Q6Z3togesIZPcQ';
  const slide = SlidesApp.openById(templateId);
  console.log('✅ SlidesApp Access OK:', slide.getName());

  // 3. บังคับเรียกสิทธิ์ UrlFetchApp
  const response = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  console.log('✅ UrlFetchApp Access OK:', response.getResponseCode());

  console.log('🎉 [SUCCESS] บังคับปลดล็อกและเปิดสิทธิ์ทุกบริการเรียบร้อยแล้ว!');
}

// ===receipt////////////////////////
// ===receipt////////////////////////
// ===receipt////////////////////////

const RECEIPT_TEMPLATES = {
  OIL: "1cGtZv_7fv5qkxGLWxjzSUZ_eOSS2KpG4xuJV3aGwy98",     // น้ำมัน (95, ดีเซล)
  RENT: "1hb5sMBFLOuTKNn6P8BAzXm9jDrlOP5nA75hH_iXx3xQ",    // ค่าเช่า
  NON_OIL: "1C6rMmP4Usqy97C4Klhls0qDZ6MgSZnSIMPZHN1xcYoE" // สินค้า/บริการอื่น
};
const RECEIPT_FOLDER_ID = "1QnV46twVeqNVJ2b45rYLawk07Lmh1Khf";

/**
 * 1. ดึงรายการขายที่ยังไม่ได้ออกใบเสร็จรับเงิน (receipt_status == false)
 */
function getUnreceiptedSalesRecords(yearMonth, buyerFilter) {
  try {
    var range = getMonthDateRange(yearMonth);
    if (!range) return { success: false, message: 'รูปแบบเดือนไม่ถูกต้อง' };

    Logger.log("=== [getUnreceiptedSalesRecords - Ascending Order] START ===");
    Logger.log("📌 Target Range: " + range.startDate + " to " + range.endDate);

    var records = [];
    var pageSize = 1000;
    var offset = 0;
    var hasMore = true;

    while (hasMore) {
      var queryPayload = {
        structuredQuery: {
          from: [{ collectionId: "sales_records" }],
          orderBy: [{ field: { fieldPath: "date" }, direction: "ASCENDING" }], // 🟢 เรียงตามวันที่ น้อยไปมาก
          limit: pageSize,
          offset: offset
        }
      };

      var queryRes = callFirestore("POST", ":runQuery", queryPayload);
      if (!queryRes || !Array.isArray(queryRes)) break;

      var fetchedDocs = 0;
      queryRes.forEach(function(item) {
        if (!item.document || !item.document.fields) return;
        fetchedDocs++;

        var doc = item.document;
        var f = doc.fields;
        var docId = doc.name ? doc.name.split("/").pop() : "";

        // ข้ามรายการที่ออกใบเสร็จไปแล้ว
        var isReceiptIssued = f.isReceiptIssued ? (f.isReceiptIssued.booleanValue || false) : false;
        if (isReceiptIssued === true) return;

        var rawDate = f.date ? (f.date.stringValue || "") : "";
        var dateStd = typeof toStandardDateStr === 'function' ? toStandardDateStr(rawDate) : rawDate;

        // 1. กรองช่วงวันที่ประจำเดือนที่เลือก
        if (dateStd && (dateStd < range.startDate || dateStd > range.endDate)) return;

        var buyerName = String(f.buyerName ? (f.buyerName.stringValue || "") : "").trim();

        // 2. กรองชื่อผู้ซื้อ (ถ้าระบุ)
        if (buyerFilter && buyerFilter !== "ALL" && buyerName !== buyerFilter) return;

        var pricePerLiter = parseFloat(f.pricePerLiter ? (f.pricePerLiter.doubleValue || f.pricePerLiter.integerValue || 0) : 0);
        var liters        = parseFloat(f.liters ? (f.liters.doubleValue || f.liters.integerValue || 0) : 0);
        var qty           = parseFloat(f.qty ? (f.qty.doubleValue || f.qty.integerValue || 0) : liters);
        var unitPrice     = parseFloat(f.unitPrice ? (f.unitPrice.doubleValue || f.unitPrice.integerValue || 0) : pricePerLiter);
        var totalAmount   = parseFloat(f.totalAmount ? (f.totalAmount.doubleValue || f.totalAmount.integerValue || 0) : 0);

        records.push({
          id: docId,
          saleNo: f.saleNo ? f.saleNo.stringValue : docId,
          date: rawDate || "-",
          dateStd: dateStd || "",
          buyerName: buyerName || "-",
          itemType: f.itemType ? f.itemType.stringValue : "น้ำมัน",
          itemName: f.itemName ? f.itemName.stringValue : (f.itemType ? f.itemType.stringValue : "น้ำมัน"), // 🟢 เพิ่ม field itemName
          pricePerLiter: pricePerLiter,
          unitPrice: unitPrice,
          liters: liters,
          qty: qty,
          totalAmount: totalAmount,
          remarks: f.remarks ? f.remarks.stringValue : ""
        });
      });

      if (fetchedDocs < pageSize) hasMore = false;
      else offset += pageSize;
    }

    // 🟢 เรียงลำดับความชัวร์ซ้ำใน Memory: วันที่น้อยไปมาก ➔ เลขที่บิลน้อยไปมาก
    records.sort(function(a, b) {
      if (a.dateStd !== b.dateStd) {
        return a.dateStd.localeCompare(b.dateStd);
      }
      return (a.saleNo || "").localeCompare(b.saleNo || "", undefined, { numeric: true, sensitivity: 'base' });
    });

    Logger.log("✅ Total Unreceipted Records: " + records.length + " รายการ (เรียงตามวันที่ และ เลขที่บิล ASC)");
    return { success: true, data: records };

  } catch (err) {
    Logger.log("❌ Error in getUnreceiptedSalesRecords: " + err.toString());
    return { success: false, message: err.toString() };
  }
}
/**
 * 2. จัดการรันเลขที่ใบเสร็จรับเงินจาก Firestore (collection: receipt_no / doc: current)
 */
function getNextReceiptNumber() {
  var docPath = "receipt_no/current";
  var res = callFirestore("GET", docPath, null);
  
  var lastPrefix = 315;
  var lastNumber = 0;

  if (res && res.fields) {
    if (res.fields.last_prefix) lastPrefix = parseInt(res.fields.last_prefix.integerValue || res.fields.last_prefix.doubleValue || 315, 10);
    if (res.fields.last_number) lastNumber = parseInt(res.fields.last_number.integerValue || res.fields.last_number.doubleValue || 0, 10);
  }

  // เพิ่มลำดับ
  lastNumber++;
  if (lastNumber > 50) {
    lastPrefix++;
    lastNumber = 1;
  }

  var formattedNo = lastPrefix + "/" + lastNumber;

  // บันทึกค่าล่าสุดกลับลง Firestore
  var updatePayload = {
    fields: {
      last_prefix: { integerValue: lastPrefix },
      last_number: { integerValue: lastNumber },
      updatedAt: { stringValue: Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH:mm:ss") }
    }
  };
  callFirestore("PATCH", docPath, updatePayload);

  return formattedNo;
}

/**
 * 3. แมปข้อมูลลูกค้าตาม customerType/buyerName
 */
// 📌 ตัวแปร Global Cache สำหรับเก็บข้อมูลผู้ซื้อ ลดการดึง Firestore หลายรอบ
var globalBuyerMapCache = null;

/**
 * ดึงข้อมูลผู้ซื้อทั้งหมดจากคอลเลกชัน buyer ใน Firestore มาทำ Map Cache
 */
function getBuyerMapFromFirestore(forceReload) {
  if (globalBuyerMapCache && !forceReload) {
    return globalBuyerMapCache;
  }

  globalBuyerMapCache = {};
  try {
    var queryPayload = {
      structuredQuery: {
        from: [{ collectionId: "buyer" }],
        limit: 1000
      }
    };

    var queryRes = callFirestore("POST", ":runQuery", queryPayload);

    if (queryRes && Array.isArray(queryRes)) {
      queryRes.forEach(function(item) {
        if (!item.document || !item.document.fields) return;
        var f = item.document.fields;

        var name     = f.name ? (f.name.stringValue || "").trim() : "";
        var fullname = f.fullname ? (f.fullname.stringValue || "").trim() : name;
        var address  = f.address ? (f.address.stringValue || "").trim() : "";
        var taxid    = f.taxid ? (f.taxid.stringValue || "").trim() : "";

        if (name) {
          globalBuyerMapCache[name] = {
            name: fullname || name,
            addr: address,
            tax: taxid
          };
        }
      });
    }
    Logger.log("✅ โหลดข้อมูลผู้ซื้อจาก Firestore สำเร็จ: " + Object.keys(globalBuyerMapCache).length + " รายการ");
  } catch (err) {
    Logger.log("❌ Error fetching buyer collection: " + err.toString());
  }

  return globalBuyerMapCache;
}

/**
 * ดึงข้อมูล ชื่อเต็ม, ที่อยู่, เลขภาษี ของลูกค้าโดยอ้างอิงจากคอลเลกชัน buyer
 */
function getCustomerMapping(customerType) {
  customerType = (customerType || "").trim();

  // 1. ตรวจสอบกลุ่มซื้อเงินสด
  const cashGroup = ["พี่วัฒน์", "เงินสด", "บังเปียก", "ปาล์มบีช", "อุทยาน", "เกาะจำ"];
  if (cashGroup.includes(customerType)) {
    return { name: "เงินสด", addr: "", tax: "" };
  }

  // 2. ดึงข้อมูลจากคอลเลกชัน buyer ใน Firestore
  var buyerMap = getBuyerMapFromFirestore();

  // 3. ค้นหาจากชื่อย่อ (name) ในคอลเลกชัน buyer
  if (buyerMap && buyerMap[customerType]) {
    return buyerMap[customerType];
  }

  // 4. กรณีไม่พบข้อมูลในคอลเลกชัน buyer ให้ส่งค่าเดิมกลับไป
  return { 
    name: customerType || "เงินสด", 
    addr: "", 
    tax: "" 
  };
}

/**
 * 4. ฟังก์ชันหลักสร้างใบเสร็จรับเงิน PDF และอัปเดตสถานะ Firestore
 */
function createBatchReceiptsFromFirestore(selectedSaleIds) {
  var tStart = new Date().getTime(); // จับเวลาเริ่มต้นทั้งหมด
  
  // Helper สำหรับบันทึกเวลาแต่ละขั้นตอน
  function logStep(stepName, lastTime) {
    var now = new Date().getTime();
    var diff = ((now - lastTime) / 1000).toFixed(2);
    var total = ((now - tStart) / 1000).toFixed(2);
    Logger.log("⏱️ [" + stepName + "] ใช้เวลา: " + diff + " วิ (สะสม: " + total + " วิ)");
    return now;
  }

  var lap = tStart;
  Logger.log("🚀 === [START LOG - Method 2: fetchAll] createBatchReceiptsFromFirestore ===");
  Logger.log("📦 จำนวนรายการที่เลือกสั่งงาน: " + (selectedSaleIds ? selectedSaleIds.length : 0) + " รายการ");

  try {
    if (!selectedSaleIds || !Array.isArray(selectedSaleIds) || selectedSaleIds.length === 0) {
      return { success: false, message: "กรุณาเลือกรายการที่ต้องการออกใบเสร็จ" };
    }

    var projectId = getProjectId();

    // ---------------------------------------------------------
    // ⏱️ STEP 1A: ดึง Service Account Access Token สำหรับ Firestore
    // ---------------------------------------------------------
    var scriptProperties = PropertiesService.getScriptProperties();
    var keyFileRaw = scriptProperties.getProperty('FIREBASE_KEY');
    if (!keyFileRaw) {
      throw new Error("❌ ไม่พบคีย์ FIREBASE_KEY ใน Script Properties");
    }
    var keyFile = JSON.parse(keyFileRaw);
    var token = getAccessToken(keyFile);

    var requests = selectedSaleIds.map(function(docId) {
      return {
        url: getFirestoreUrl("sales_records/" + docId),
        method: "get",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + token
        },
        muteHttpExceptions: true
      };
    });

    // ---------------------------------------------------------
    // ⏱️ STEP 1B: ยิง Network Request ขนานกันด้วย fetchAll
    // ---------------------------------------------------------
    var tFetchStart = new Date().getTime();
    var responses = UrlFetchApp.fetchAll(requests);
    lap = logStep("STEP 1.1: ยิง Network Request ดึงข้อมูล " + selectedSaleIds.length + " รายการพร้อมกัน (fetchAll)", tFetchStart);

    // ---------------------------------------------------------
    // ⏱️ STEP 1C: แปลงข้อมูล JSON
    // ---------------------------------------------------------
    var tParseStart = new Date().getTime();
    var saleDocs = [];

    responses.forEach(function(res, idx) {
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        var saleDoc = JSON.parse(res.getContentText());
        if (saleDoc && saleDoc.fields) {
          var f = saleDoc.fields;
          var rawDate = f.date ? (f.date.stringValue || "") : "";
          var dateStd = typeof toStandardDateStr === 'function' ? toStandardDateStr(rawDate) : rawDate;

          saleDocs.push({
            docId: selectedSaleIds[idx],
            fields: f,
            dateStd: dateStd || "9999/99/99"
          });
        }
      } else {
        Logger.log("⚠️ ไม่สามารถดึงข้อมูล docId: " + selectedSaleIds[idx] + " (HTTP " + code + "): " + res.getContentText());
      }
    });

    lap = logStep("STEP 1.2: ถอดรหัสและแปลงข้อมูล JSON (" + saleDocs.length + " ใบ)", tParseStart);

    // ---------------------------------------------------------
    // ⏱️ STEP 2: เรียงลำดับรายการตามวันที่
    // ---------------------------------------------------------
    saleDocs.sort(function(a, b) {
      if (a.dateStd < b.dateStd) return -1;
      if (a.dateStd > b.dateStd) return 1;
      return 0;
    });
    lap = logStep("STEP 2: เรียงลำดับรายการตามวันที่", lap);

    // ---------------------------------------------------------
    // ⏱️ STEP 3: โหลดข้อมูลลูกค้าจาก Firestore (Buyers Map)
    // ---------------------------------------------------------
    var allBuyersMap = {};
    if (typeof getAllBuyersFromFirestore === 'function') {
      allBuyersMap = getAllBuyersFromFirestore();
    }
    lap = logStep("STEP 3: โหลดข้อมูลลูกค้าจาก Firestore (Buyers Map)", lap);

    // ---------------------------------------------------------
    // ⏱️ STEP 4: สำเนาไฟล์ Template ใน Google Drive
    // ---------------------------------------------------------
    var folder = DriveApp.getFolderById(RECEIPT_FOLDER_ID);
    var nowStr = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmm");
    var todayFormatted = Utilities.formatDate(new Date(), "GMT+7", "yyyy/MM/dd");

    var tempFile = DriveApp.getFileById(RECEIPT_TEMPLATES.OIL).makeCopy("Batch_Receipt_" + nowStr, folder);
    lap = logStep("STEP 4: คัดลอกสไลด์แม่แบบ (makeCopy) ใน Google Drive", lap);

    // ---------------------------------------------------------
    // ⏱️ STEP 5: เปิดไฟล์ Google Slides Templates ทั้ง 3 ไฟล์
    // ---------------------------------------------------------
    var presentation = SlidesApp.openById(tempFile.getId());
    var masterOilSlide = presentation.getSlides()[0];

    var rentPres = SlidesApp.openById(RECEIPT_TEMPLATES.RENT);
    var masterRentSlide = rentPres.getSlides()[0];

    var nonOilPres = SlidesApp.openById(RECEIPT_TEMPLATES.NON_OIL);
    var masterNonOilSlide = nonOilPres.getSlides()[0];
    lap = logStep("STEP 5: เปิดไฟล์ Google Slides Templates ทั้ง 3 ไฟล์", lap);

    var successCount = 0;
    var batchWrites = [];

    // ---------------------------------------------------------
    // ⏱️ STEP 6: วนลูปสร้างสไลด์และแทนค่าข้อความ
    // ---------------------------------------------------------
    saleDocs.forEach(function(docItem) {
      var docId = docItem.docId;
      var f = docItem.fields;

      var rawDate = f.date ? (f.date.stringValue || "") : "";
      var formattedDate = rawDate;
      if (rawDate) {
        var dateParts = rawDate.split(/[\/\-]/);
        if (dateParts.length === 3) {
          var p0 = parseInt(dateParts[0], 10);
          var p1 = parseInt(dateParts[1], 10);
          var p2 = parseInt(dateParts[2], 10);
          var year = p0 > 1000 ? p0 : p2;
          var month = p1 - 1;
          var day = p0 > 1000 ? p2 : p0;
          if (year > 2500) year -= 543;

          var validDate = new Date(year, month, day);
          if (!isNaN(validDate.getTime())) {
            formattedDate = Utilities.formatDate(validDate, "GMT+7", "dd/MM/yyyy");
          }
        }
      }

      var customerType = f.buyerName ? f.buyerName.stringValue : "";
      var itemTypeVal = f.itemType ? (f.itemType.stringValue || "").trim() : "";
      var itemNameVal = f.itemName ? (f.itemName.stringValue || "").trim() : itemTypeVal;
      var displayItemName = itemNameVal || itemTypeVal || "สินค้า/บริการ";

      var priceVal = parseFloat(f.pricePerLiter ? (f.pricePerLiter.doubleValue || f.pricePerLiter.integerValue || 0) : (f.unitPrice ? (f.unitPrice.doubleValue || f.unitPrice.integerValue || 0) : 0));
      var qtyVal = parseFloat(f.qty ? (f.qty.doubleValue || f.qty.integerValue || 0) : (f.liters ? (f.liters.doubleValue || f.liters.integerValue || 0) : 0));
      var totalAmountVal = parseFloat(f.totalAmount ? (f.totalAmount.doubleValue || f.totalAmount.integerValue || 0) : 0);

      var newReceiptNo = f.receiptNo ? (f.receiptNo.stringValue || "") : "";

      var nonVat = (totalAmountVal * 100 / 107).toFixed(2);
      var vat = (totalAmountVal * 7 / 107).toFixed(2);
      var vat5Val = Math.round((totalAmountVal * 0.05) * 100) / 100;
      var netTotalVal = totalAmountVal - vat5Val;

      var bahtText = arabicToBahtText(totalAmountVal);
      var cInfo = allBuyersMap[customerType] || (typeof getCustomerMapping === 'function' ? getCustomerMapping(customerType) : { name: customerType, addr: "", tax: "" });

      var checkText = (itemNameVal + " " + itemTypeVal).trim();
      var isRent = checkText.includes("ค่าเช่า");
      var newSlide;

      if (checkText.includes("95") || checkText.includes("ดีเซล") || checkText.includes("น้ำมัน")) {
        newSlide = masterOilSlide.duplicate();
        newSlide.replaceAllText('{{price}}', formatCurrency(priceVal));
        newSlide.replaceAllText('{{quantity}}', qtyVal ? qtyVal.toString() : "");
        newSlide.replaceAllText('{{qty}}', qtyVal ? qtyVal.toString() : "");
      } else if (isRent) {
        newSlide = presentation.appendSlide(masterRentSlide);
        newSlide.replaceAllText('{{vat5%}}', formatCurrency(vat5Val));
        newSlide.replaceAllText('{{net_total}}', formatCurrency(netTotalVal));
      } else {
        newSlide = presentation.appendSlide(masterNonOilSlide);
      }

      newSlide.replaceAllText('{{date}}', formattedDate);
      newSlide.replaceAllText('{{no}}', newReceiptNo);
      newSlide.replaceAllText('{{name}}', cInfo.name || customerType);
      newSlide.replaceAllText('{{address}}', cInfo.addr || "");
      newSlide.replaceAllText('{{tax_id}}', cInfo.tax || "");
      newSlide.replaceAllText('{{taxid}}', cInfo.tax || "");
      newSlide.replaceAllText('{{type}}', displayItemName);
      newSlide.replaceAllText('{{item_name}}', displayItemName);
      newSlide.replaceAllText('{{total}}', formatCurrency(totalAmountVal));
      newSlide.replaceAllText('{{non_vat}}', formatCurrency(parseFloat(nonVat)));
      newSlide.replaceAllText('{{vat}}', formatCurrency(parseFloat(vat)));
      newSlide.replaceAllText('{{bahttext}}', bahtText);

      var docPath = "projects/" + projectId + "/databases/(default)/documents/sales_records/" + docId;
      var updateFields = {
        isReceiptIssued: { booleanValue: true },
        receiptDate: { stringValue: todayFormatted }
      };

      var maskPaths = ["isReceiptIssued", "receiptDate"];
      if (isRent) {
        updateFields["5%_tax"] = { doubleValue: vat5Val };
        maskPaths.push("5%_tax");
      }

      batchWrites.push({
        update: {
          name: docPath,
          fields: updateFields
        },
        updateMask: {
          fieldPaths: maskPaths
        }
      });

      successCount++;
    });
    lap = logStep("STEP 6: วนลูปสร้างสไลด์และแทนค่าข้อความครบ " + saleDocs.length + " ใบ", lap);

    // ---------------------------------------------------------
    // ⏱️ STEP 7: อัปเดตสถานะ Firestore แบบ Batch (:commit)
    // ---------------------------------------------------------
    if (batchWrites.length > 0) {
      callFirestore("POST", ":commit", { writes: batchWrites });
    }
    lap = logStep("STEP 7: ส่ง Batch Commit บันทึกสถานะกลับไปยัง Firestore", lap);

    // ---------------------------------------------------------
    // ⏱️ STEP 8: ปิดและบันทึกสไลด์
    // ---------------------------------------------------------
    if (successCount > 0) {
      masterOilSlide.remove();
      presentation.saveAndClose();
      lap = logStep("STEP 8: บันทึกและปิด Google Slides (saveAndClose)", lap);

      // ---------------------------------------------------------
      // ⏱️ STEP 9: แปลงสไลด์เป็น PDF
      // ---------------------------------------------------------
      var pdfBlob = tempFile.getAs(MimeType.PDF).setName("ใบเสร็จรับเงิน_รวม_" + nowStr + ".pdf");
      var pdfFile = folder.createFile(pdfBlob);
      tempFile.setTrashed(true);
      lap = logStep("STEP 9: แปลงไฟล์เป็น PDF และเซฟลง Drive (getAs + createFile)", lap);

      // ---------------------------------------------------------
      // ⏱️ STEP 10: กำหนดสิทธิ์การแชร์ไฟล์ PDF
      // ---------------------------------------------------------
      pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var viewUrl = "https://drive.google.com/file/d/" + pdfFile.getId() + "/view";
      lap = logStep("STEP 10: ตั้งค่าลิงก์แชร์ไฟล์ PDF (setSharing)", lap);

      var totalSec = ((new Date().getTime() - tStart) / 1000).toFixed(2);
      Logger.log("🏁 === [FINISHED] รวมใช้เวลาประมวลผลทั้งสิ้น: " + totalSec + " วินาที ===");

      return {
        success: true,
        count: successCount,
        pdfUrl: viewUrl
      };
    } else {
      tempFile.setTrashed(true);
      return { success: false, message: "ไม่สามารถสร้างใบเสร็จรับเงินได้" };
    }

  } catch (err) {
    Logger.log("❌ Error in createBatchReceiptsFromFirestore: " + err.toString());
    return { success: false, message: err.toString() };
  }
}

/**
 * Helper: แปลงจำนวนเงินเป็นตัวอักษรภาษาไทย (บาทถ้วน)
 */
function arabicToBahtText(numbers) {
  var number = parseFloat(numbers);
  if (isNaN(number)) return "";
  var numberArray = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  var unitArray = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  
  var splitNum = number.toFixed(2).split(".");
  var baht = splitNum[0];
  var satang = splitNum[1];
  var bahtText = "";

  if (parseInt(baht, 10) === 0) {
    bahtText = "ศูนย์บาท";
  } else {
    var len = baht.length;
    for (var i = 0; i < len; i++) {
      var digit = parseInt(baht.charAt(i), 10);
      var pos = len - i - 1;
      if (digit !== 0) {
        if (pos % 6 === 1 && digit === 1) {
          bahtText += (i > 0 && baht.charAt(i - 1) !== '0') ? "" : "สิบ";
        } else if (pos % 6 === 1 && digit === 2) {
          bahtText += "ยี่สิบ";
        } else if (pos % 6 === 0 && digit === 1 && i > 0) {
          bahtText += "เอ็ด";
        } else {
          bahtText += numberArray[digit] + unitArray[pos % 6];
        }
      } else if (pos % 6 === 0 && pos > 0) {
        bahtText += "ล้าน";
      }
    }
    bahtText += "บาท";
  }

  if (parseInt(satang, 10) === 0) {
    bahtText += "ถ้วน";
  } else {
    if (satang.charAt(0) === '1') bahtText += "สิบ";
    else if (satang.charAt(0) === '2') bahtText += "ยี่สิบ";
    else if (satang.charAt(0) !== '0') bahtText += numberArray[parseInt(satang.charAt(0), 10)] + "สิบ";

    if (satang.charAt(1) === '1') bahtText += "เอ็ด";
    else if (satang.charAt(1) !== '0') bahtText += numberArray[parseInt(satang.charAt(1), 10)];
    bahtText += "สตางค์";
  }
  return bahtText;
}

/**
 * ฟังก์ชันปรับปรุงสถานะ isBilled = false แบบ Direct Update (อัปเดตตรงตาม Document ID และ Query ค้นหา)
 */
function runResetIsBilledForTargetSales() {
  const targetSaleNos = [
    "SB1169-0128", "SB1169-0127", "SB1169-0126", "SB1169-0124", "SB1169-0123",
    "SB1169-0122", "SB1169-0121", "SB1169-0119", "SB1169-0118", "SB1169-0116",
    "SB1169-0112", "SB1169-0111", "SB1169-0108", "SB1169-0106", "SB1169-0105",
    "SB1169-0100", "SB1169-0099", "SB1169-0098", "SB1169-0097", "SB1169-0094",
    "SB1169-0087", "SB1169-0086", "SB1169-0085", "SB1169-0084", "SB1169-0083",
    "SB1169-0081", "SB1169-0074", "SB1169-0073", "SB1169-0072", "SB1169-0070",
    "SB1169-0069", "SB1169-0068", "SB1169-0058", "SB1169-0056", "SB1169-0055",
    "SB1169-0053", "SB1169-0051", "SB1169-0050", "SB1169-0039", "SB1169-0036",
    "SB1169-0035", "SB1169-0033", "SB1169-0023", "SB1169-0022", "SB1169-0021",
    "SB1169-0020", "SB1169-0018"
  ];

  var updatedCount = 0;
  var payload = {
    fields: {
      isBilled: { booleanValue: false }
    }
  };

  targetSaleNos.forEach(function(saleNo) {
    var id = saleNo.trim();
    // 1. พยายามอัปเดตตรงไปยัง Document ID
    var patchUrl = "sales_records/" + id + "?updateMask.fieldPaths=isBilled";
    var res = callFirestore("PATCH", patchUrl, payload);

    if (res && !res.error && res.name) {
      updatedCount++;
      Logger.log("✅ [Direct Patch] อัปเดตสำเร็จ: " + id);
    } else {
      // 2. ถ้า Direct Patch ไม่เจอ ให้ลองค้นหาผ่าน query ฟิลด์ saleNo
      var queryRes = findAndPatchSaleRecordByField(id, payload);
      if (queryRes) {
        updatedCount++;
      } else {
        Logger.log("❌ ไม่พบข้อมูล: " + id);
      }
    }
  });

  var summary = "🎉 ปรับปรุงสถานะ isBilled = false สำเร็จทั้งหมด " + updatedCount + " จาก " + targetSaleNos.length + " รายการ";
  Logger.log(summary);
  return summary;
}

/**
 * ค้นหาเอกสารกรณีที่ Document ID ไม่ได้ชื่อตรงกับเลขที่ขาย
 */
function findAndPatchSaleRecordByField(saleNo, payload) {
  var queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "sales_records" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "saleNo" },
          op: "EQUAL",
          value: { stringValue: saleNo }
        }
      },
      limit: 1
    }
  };

  var queryRes = callFirestore("POST", ":runQuery", queryPayload);
  if (Array.isArray(queryRes) && queryRes.length > 0 && queryRes[0].document) {
    var docName = queryRes[0].document.name;
    var docId = docName.split("/").pop();
    var patchUrl = "sales_records/" + docId + "?updateMask.fieldPaths=isBilled";
    var patchRes = callFirestore("PATCH", patchUrl, payload);
    if (patchRes && !patchRes.error) {
      Logger.log("✅ [Query Patch] อัปเดตสำเร็จ: " + saleNo + " (Doc ID: " + docId + ")");
      return true;
    }
  }
  return false;
}

function findRecordBySaleNo(saleNo) {
  var queryPayload = {
    structuredQuery: {
      from: [{ collectionId: "sales_records" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "saleNo" },
          op: "EQUAL",
          value: { stringValue: saleNo } // 👈 ใช้ตัวแปร saleNo ที่รับเข้ามา
        }
      },
      limit: 1
    }
  };

  var queryRes = callFirestore("POST", ":runQuery", queryPayload);
  
  if (Array.isArray(queryRes) && queryRes.length > 0 && queryRes[0].document) {
    var doc = queryRes[0].document;
    var fields = doc.fields || {};
    return {
      success: true,
      id: doc.name.split("/").pop(),
      data: fields
    };
  }
  
  return { success: false, message: "ไม่พบรายการ" };
}

function testFindRecord() {
  // 👈 ใส่เครื่องหมายอัญประกาศ "" ครอบเลขที่ต้องการค้นหา
  var result = findRecordBySaleNo("SB1169-0133"); 
  Logger.log(JSON.stringify(result, null, 2));
}