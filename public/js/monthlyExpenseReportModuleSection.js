function initMonthlyExpenseReport() {
  const currentYearBE = new Date().getFullYear() + 543;
  const startYearEl = document.getElementById('expRepStartYear');
  const endYearEl = document.getElementById('expRepEndYear');
  
  if (startYearEl && endYearEl && startYearEl.options.length === 0) {
    let optionsHtml = '';
    for (let y = 2567; y <= currentYearBE + 1; y++) {
      const selected = (y === currentYearBE) ? 'selected' : '';
      optionsHtml += `<option value="${y}" ${selected}>${y}</option>`;
    }
    startYearEl.innerHTML = optionsHtml;
    endYearEl.innerHTML = optionsHtml;
    
    document.getElementById('expRepStartMonth').value = '01';
    document.getElementById('expRepEndMonth').value = String(new Date().getMonth() + 1).padStart(2, '0');
  }

  // โหลดหมวดหมู่ค่าใช้จ่ายใส่ Dropdown ตัวกรอง
  populateExpenseCategoryFilter();
}

// ดึงหมวดหมู่ค่าใช้จ่ายมาใส่ Dropdown
function populateExpenseCategoryFilter() {
  const catSelect = document.getElementById('expRepCategoryFilter');
  if (!catSelect) return;

  backend.run
    .withSuccessHandler(function(res) {
      if (res && res.success) {
        updateCategoryDropdown(res.data || []);
      }
    })
    .getExpenseRecordsRange('', '', '');
}

function updateCategoryDropdown(data) {
  const catSelect = document.getElementById('expRepCategoryFilter');
  const categories = [...new Set(data.map(item => item.category).filter(Boolean))];
  let html = '<option value="">-- ทุกหมวดหมู่ --</option>';
  categories.forEach(cat => {
    html += `<option value="${cat}">${cat}</option>`;
  });
  catSelect.innerHTML = html;
}

// ฟังก์ชันค้นหาและประมวลผลรายงานค่าใช้จ่ายรายเดือน (เพิ่มการสรุปแยกตามหมวดหมู่)
async function loadMonthlyExpenseReport() {
  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังประมวลผลข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  const startMonth = document.getElementById('expRepStartMonth').value;
  const startYearBE = parseInt(document.getElementById('expRepStartYear').value);
  const endMonth = document.getElementById('expRepEndMonth').value;
  const endYearBE = parseInt(document.getElementById('expRepEndYear').value);
  const currentSelectedCategory = document.getElementById('expRepCategoryFilter').value;

  const startYearCE = startYearBE - 543;
  const endYearCE = endYearBE - 543;
  
  const startDateStr = `${startYearCE}-${startMonth}-01`;
  const lastDay = new Date(endYearCE, parseInt(endMonth), 0).getDate();
  const endDateStr = `${endYearCE}-${endMonth}-${String(lastDay).padStart(2, '0')}`;

  // 1. ดึงข้อมูลค่าใช้จ่ายทั้งหมดตามช่วงวันที่เลือก
  const res = await new Promise(resolve => {
    backend.run
      .withSuccessHandler(resolve)
      .withFailureHandler(error => resolve({ success: false, message: error.message }))
      .getExpenseRecordsRange(startDateStr, endDateStr, 5000);
  });

  if (typeof Swal !== 'undefined') Swal.close();

  if (res && res.success) {
    const rawRecords = res.data || [];

    // 2. อัปเดตตัวเลือกใน Dropdown หมวดหมู่ ให้แสดงเฉพาะที่มีรายการจริงในช่วงเวลานี้
    updateCategoryDropdownFromData(rawRecords, currentSelectedCategory);

    // อ่านค่าหมวดหมู่ปัจจุบันอีกครั้ง (เผื่อค่าเดิมถูกรีเซ็ตหากไม่มีในข้อมูลใหม่)
    const activeCategory = document.getElementById('expRepCategoryFilter').value;

    // 3. กรองรายการตามหมวดหมู่ที่เลือก
    let records = rawRecords;
    if (activeCategory) {
      records = rawRecords.filter(item => item.category === activeCategory);
    }

    // ==================== คำนวณยอดรวม & จัดกลุ่มตามหมวดหมู่ ====================
    let totalAmount = 0;
    let categoryGroup = {};

    records.forEach(item => {
      const amt = parseFloat(item.amount) || 0;
      totalAmount += amt;
      const cat = item.category || 'อื่นๆ';

      if (!categoryGroup[cat]) {
        categoryGroup[cat] = { amount: 0, count: 0 };
      }
      categoryGroup[cat].amount += amt;
      categoryGroup[cat].count += 1;
    });

    let categorySummaryList = Object.keys(categoryGroup).map(cat => ({
      category: cat,
      amount: categoryGroup[cat].amount,
      count: categoryGroup[cat].count
    })).sort((a, b) => b.amount - a.amount);

    let topCat = '-';
    if (categorySummaryList.length > 0) {
      topCat = `${categorySummaryList[0].category} (${categorySummaryList[0].amount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿)`;
    }

    // อัปเดต Summary Cards
    document.getElementById('expRepTotalAmount').innerText = totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
    document.getElementById('expRepTotalCount').innerText = records.length.toLocaleString('th-TH') + ' รายการ';
    document.getElementById('expRepTopCategory').innerText = topCat;

    // ==================== เติมตาราง 1: สรุปตามหมวดหมู่ ====================
    const catTbody = document.getElementById('monthlyCategorySummaryTableBody');
    if (catTbody) {
      if (categorySummaryList.length === 0) {
        catTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">ไม่พบข้อมูลค่าใช้จ่าย</td></tr>`;
      } else {
        let catHtml = '';
        categorySummaryList.forEach((item, idx) => {
          const percent = totalAmount > 0 ? ((item.amount / totalAmount) * 100).toFixed(2) : '0.00';
          catHtml += `
            <tr>
              <td class="text-center text-secondary">${idx + 1}</td>
              <td class="fw-bold text-dark">${item.category}</td>
              <td class="text-center"><span class="badge bg-secondary rounded-pill">${item.count.toLocaleString('th-TH')}</span></td>
              <td class="text-end fw-bold text-danger">${item.amount.toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
              <td class="text-end text-muted small">${percent}%</td>
            </tr>
          `;
        });
        catTbody.innerHTML = catHtml;
      }
    }

    // ==================== เติมตาราง 2: รายละเอียดรายการ ====================
const tbody = document.getElementById('monthlyExpenseReportTableBody');
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">ไม่พบข้อมูลค่าใช้จ่ายในช่วงเวลาที่เลือก</td></tr>`;
      return;
    }

    let tableHtml = '';
    records.forEach(item => {
      // จัดฟอร์แมตจำนวนลิตร (ถ้าเป็น 0 หรือไม่มีข้อมูลให้ขึ้น -)
      const litersDisplay = item.liters ? (parseFloat(item.liters) || 0).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-';
      
      tableHtml += `
        <tr>
          <td>${item.date || ''}</td>
          <td><span class="badge bg-light text-dark border">${item.category || '-'}</span></td>
          <td>${item.itemName || '-'}</td> <!-- 👈 แสดงรายการสินค้า/บริการ -->
          <td class="text-end">${litersDisplay}</td> <!-- 👈 แสดงจำนวนลิตร -->
          <td class="text-end fw-bold text-danger">${(parseFloat(item.amount) || 0).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
          <td>${item.transferAccount || '-'}</td>
          <td>${item.transferDate || '-'}</td>
          <td>${item.remarks || '-'}</td>
        </tr>
      `;
    });
    tbody.innerHTML = tableHtml;

  } else {
    if (typeof Swal !== 'undefined') {
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
    }
  }
}

// อัปเดต Dropdown หมวดหมู่ ให้มีเฉพาะหมวดหมู่ที่มีรายการจริงในข้อมูลที่ดึงมาได้
function updateCategoryDropdownFromData(records, currentSelectedCat) {
  const catSelect = document.getElementById('expRepCategoryFilter');
  if (!catSelect) return;

  // ดึงเฉพาะหมวดหมู่ที่ไม่ซ้ำ และมีอยู่จริงในรายการที่ดึงมา
  const uniqueCategories = [...new Set(records.map(item => item.category).filter(Boolean))].sort();

  let html = '<option value="">-- ทุกหมวดหมู่ --</option>';
  uniqueCategories.forEach(cat => {
    const isSelected = (cat === currentSelectedCat) ? 'selected' : '';
    html += `<option value="${cat}" ${isSelected}>${cat}</option>`;
  });

  catSelect.innerHTML = html;
}
