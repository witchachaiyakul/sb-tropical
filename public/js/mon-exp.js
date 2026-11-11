// public/js/mon-exp.js

let rawExpenseRecordsData = [];        // ข้อมูลทั้งหมดที่ดึงได้ตามช่วงเวลา
let filteredExpenseRecordsData = [];   // ข้อมูลที่ผ่านการกรองตามหมวดหมู่
let currentExpSortCol = '';
let isExpSortAscending = true;

document.addEventListener('DOMContentLoaded', async () => {
  if (document.getElementById('monthlyExpenseReportModuleSection')) {
    await initMonthlyExpenseReport();
  }
});

/**
 * 🟢 1. ตั้งค่าเริ่มต้นเป็นเดือน และ พ.ศ. ปัจจุบัน + ประมวลผลค้นหาข้อมูลอัตโนมัติทันที
 */
async function initMonthlyExpenseReport() {
  const now = new Date();
  const currentYearBE = now.getFullYear() + 543;
  const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');

  const startYearEl = document.getElementById('expRepStartYear');
  const endYearEl = document.getElementById('expRepEndYear');
  const startMonthEl = document.getElementById('expRepStartMonth');
  const endMonthEl = document.getElementById('expRepEndMonth');
  
  // 1. เติม Option ปี พ.ศ. หากยังไม่มี
  if (startYearEl && endYearEl && startYearEl.options.length === 0) {
    let optionsHtml = '';
    for (let y = 2567; y <= currentYearBE + 1; y++) {
      const selected = (y === currentYearBE) ? 'selected' : '';
      optionsHtml += `<option value="${y}" ${selected}>${y}</option>`;
    }
    startYearEl.innerHTML = optionsHtml;
    endYearEl.innerHTML = optionsHtml;
  }

  // 🟢 2. ตั้งค่า Default ทั้งช่วงเริ่มต้นและสิ้นสุด ให้เป็น เดือน และ พ.ศ. ปัจจุบัน
  if (startMonthEl) startMonthEl.value = currentMonthStr;
  if (endMonthEl) endMonthEl.value = currentMonthStr;
  if (startYearEl) startYearEl.value = String(currentYearBE);
  if (endYearEl) endYearEl.value = String(currentYearBE);

  // 3. โหลดหมวดหมู่ใส่ตัวกรอง Dropdown
  await populateExpenseCategories();

  // 🟢 4. เรียกค้นหาและประมวลผลแสดงข้อมูลทันทีเมื่อเปิดหน้า
  loadMonthlyExpenseReport();
}

/**
 * 🟢 2. ดึงรายการหมวดหมู่ทั้งหมดมาใส่ตัวกรอง Dropdown
 */
async function populateExpenseCategories() {
  const catSelect = document.getElementById('expRepCategoryFilter');
  if (!catSelect) return;

  try {
    const res = await getExpenseRecordsRange('', '', 3000);
    if (res && res.success && res.data) {
      updateCategoryDropdown(res.data);
    }
  } catch (err) {
    console.warn("⚠️ ไม่สามารถดึงหมวดหมู่เริ่มต้นได้:", err);
  }
}

function updateCategoryDropdown(data) {
  const catSelect = document.getElementById('expRepCategoryFilter');
  if (!catSelect) return;
  const currentVal = catSelect.value;
  const categories = [...new Set(data.map(item => item.category).filter(Boolean))].sort();
  
  let html = '<option value="">-- ทุกหมวดหมู่ --</option>';
  categories.forEach(cat => {
    const selected = (cat === currentVal) ? 'selected' : '';
    html += `<option value="${cat}" ${selected}>${cat}</option>`;
  });
  catSelect.innerHTML = html;
}

/**
 * 🟢 3. ค้นหาและประมวลผลรายงานค่าใช้จ่ายรายเดือน
 */
async function loadMonthlyExpenseReport() {
  const startMEl = document.getElementById('expRepStartMonth');
  const startYEl = document.getElementById('expRepStartYear');
  const endMEl = document.getElementById('expRepEndMonth');
  const endYEl = document.getElementById('expRepEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) return;

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'กำลังประมวลผลข้อมูล...',
      text: 'ดึงข้อมูลค่าใช้จ่ายจากระบบ...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const endM = parseInt(endMEl.value, 10);
  const endY = parseInt(endYEl.value, 10) - 543;

  // รูปแบบวันที่ YYYY/MM/DD สำหรับ Firestore
  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/01`;
  const lastDay = new Date(endY, endM, 0).getDate();
  const endDateStr = `${endY}/${String(endM).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;

  const selectedCategory = document.getElementById('expRepCategoryFilter') ? document.getElementById('expRepCategoryFilter').value : '';

  try {
    const res = await getExpenseRecordsRange(startDateStr, endDateStr, 3000);
    
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      rawExpenseRecordsData = res.data || [];

      // อัปเดตตัวเลือกหมวดหมู่ตามข้อมูลที่มีจริงในช่วงเวลานี้
      updateCategoryDropdown(rawExpenseRecordsData);

      // กรองหมวดหมู่
      if (selectedCategory) {
        filteredExpenseRecordsData = rawExpenseRecordsData.filter(item => item.category === selectedCategory);
      } else {
        filteredExpenseRecordsData = [...rawExpenseRecordsData];
      }

      // 1. คำนวณสรุปการ์ดและตารางแยกตามหมวดหมู่
      renderExpenseSummaryCardsAndCategoryTable(filteredExpenseRecordsData);

      // 2. แสดงข้อมูลตารางรายละเอียด
      currentExpSortCol = '';
      isExpSortAscending = true;
      renderExpenseDetailTable();

    } else {
      if (typeof Swal !== 'undefined') {
        Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
      }
    }

  } catch (err) {
    console.error("❌ Error loading monthly expense report:", err);
    if (typeof Swal !== 'undefined') {
      Swal.close();
      Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    }
  }
}

/**
 * 🟢 4. สรุปผลรวมเข้า Cards และตารางหมวดหมู่
 */
function renderExpenseSummaryCardsAndCategoryTable(records) {
  let totalAmount = 0;
  const catMap = {};

  records.forEach(item => {
    const amt = parseFloat(item.amount || item.totalWithVat || 0);
    totalAmount += amt;
    const cat = item.category || 'อื่นๆ';

    if (!catMap[cat]) {
      catMap[cat] = { amount: 0, count: 0 };
    }
    catMap[cat].amount += amt;
    catMap[cat].count += 1;
  });

  const catList = Object.keys(catMap).map(cat => ({
    category: cat,
    amount: catMap[cat].amount,
    count: catMap[cat].count
  })).sort((a, b) => b.amount - a.amount);

  const fmt = num => (parseFloat(num) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const setTxt = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };
  setTxt('expRepTotalAmount', fmt(totalAmount) + ' บาท');
  setTxt('expRepTotalCount', records.length.toLocaleString('th-TH') + ' รายการ');
  setTxt('expRepTopCategory', catList.length > 0 ? `${catList[0].category} (${fmt(catList[0].amount)} ฿)` : '-');

  const catTbody = document.getElementById('monthlyCategorySummaryTableBody');
  if (catTbody) {
    if (catList.length === 0) {
      catTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">ไม่พบข้อมูลค่าใช้จ่ายในช่วงเวลานี้</td></tr>`;
    } else {
      let html = '';
      catList.forEach((item, idx) => {
        const percent = totalAmount > 0 ? ((item.amount / totalAmount) * 100).toFixed(2) : '0.00';
        html += `
          <tr>
            <td class="text-center text-secondary">${idx + 1}</td>
            <td class="fw-bold text-dark">${item.category}</td>
            <td class="text-center"><span class="badge bg-secondary rounded-pill">${item.count.toLocaleString('th-TH')}</span></td>
            <td class="text-end fw-bold text-danger">${fmt(item.amount)}</td>
            <td class="text-end text-muted small">${percent}%</td>
          </tr>
        `;
      });
      catTbody.innerHTML = html;
    }
  }
}

/**
 * 🟢 5. จัดเรียงตารางรายละเอียดเมื่อคลิกหัวตาราง
 */
function sortExpenseReportTable(colKey) {
  if (currentExpSortCol === colKey) {
    isExpSortAscending = !isExpSortAscending;
  } else {
    currentExpSortCol = colKey;
    isExpSortAscending = true;
  }

  const keys = ['date', 'category', 'itemName', 'liters', 'amount', 'transferAccount', 'transferDate', 'remarks'];
  keys.forEach(k => {
    const icon = document.getElementById(`sortIcon_${k}`);
    if (icon) icon.className = 'bi bi-arrow-down-up ms-1 text-muted small';
  });

  const activeIcon = document.getElementById(`sortIcon_${colKey}`);
  if (activeIcon) {
    activeIcon.className = isExpSortAscending ? 'bi bi-arrow-up text-primary ms-1 small' : 'bi bi-arrow-down text-primary ms-1 small';
  }

  filteredExpenseRecordsData.sort((a, b) => {
    let valA = a[colKey];
    let valB = b[colKey];

    if (colKey === 'amount') {
      valA = parseFloat(a.amount || a.totalWithVat || 0);
      valB = parseFloat(b.amount || b.totalWithVat || 0);
    } else if (colKey === 'liters') {
      valA = parseFloat(a.liters || 0);
      valB = parseFloat(b.liters || 0);
    } else if (colKey === 'itemName') {
      valA = a.itemName || a.payeeName || '';
      valB = b.itemName || b.payeeName || '';
    }

    if (typeof valA === 'string') {
      return isExpSortAscending ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
    }
    return isExpSortAscending ? (valA - valB) : (valB - valA);
  });

  renderExpenseDetailTable();
}

/**
 * 🟢 6. เติมข้อมูลลงตารางรายละเอียดรายการค่าใช้จ่าย
 */
function renderExpenseDetailTable() {
  const tbody = document.getElementById('monthlyExpenseReportTableBody');
  if (!tbody) return;

  if (filteredExpenseRecordsData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูลค่าใช้จ่ายในช่วงเวลาที่เลือก</td></tr>`;
    return;
  }

  const fmt = num => (parseFloat(num) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let html = '';

  filteredExpenseRecordsData.forEach(item => {
    const litersVal = parseFloat(item.liters || 0);
    const litersDisplay = litersVal > 0 ? fmt(litersVal) : '-';
    const amountVal = parseFloat(item.amount || item.totalWithVat || 0);
    const itemDisplayName = item.itemName || item.payeeName || '-';

    html += `
      <tr>
        <td>${item.date || '-'}</td>
        <td><span class="badge bg-light text-dark border">${item.category || '-'}</span></td>
        <td>${itemDisplayName}</td>
        <td class="text-end">${litersDisplay}</td>
        <td class="text-end fw-bold text-danger">${fmt(amountVal)}</td>
        <td>${item.transferAccount || '-'}</td>
        <td>${item.transferDate || '-'}</td>
        <td>${item.remarks || '-'}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}