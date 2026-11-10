function switchPaymentTab(tabName) {
  currentPaymentTab = tabName;
  const btnCredit = document.getElementById('btnTabCreditSales');
  const btnExp = document.getElementById('btnTabCompanyExpenses');
  const viewCredit = document.getElementById('creditSalesSubView');
  const viewExp = document.getElementById('companyExpenseSubView');

  if (tabName === 'credit') {
    btnCredit.className = "btn btn-lg btn-success w-100 py-3 fw-bold shadow-sm active";
    btnExp.className = "btn btn-lg btn-outline-primary w-100 py-3 fw-bold shadow-sm";
    viewCredit.classList.remove('d-none');
    viewExp.classList.add('d-none');
  } else {
    btnCredit.className = "btn btn-lg btn-outline-success w-100 py-3 fw-bold shadow-sm";
    btnExp.className = "btn btn-lg btn-primary w-100 py-3 fw-bold shadow-sm active";
    viewCredit.classList.add('d-none');
    viewExp.classList.remove('d-none');
  }

  loadPaymentManagementData();
}

function loadPaymentManagementData() {
  const m = document.getElementById('pmtFilterMonth').value;
  const yBE = document.getElementById('pmtFilterYear').value;
  const yAD = parseInt(yBE, 10) - 543;
  const yearMonth = yAD + "-" + m;
  const buyerFilter = document.getElementById('pmtFilterName') ? document.getElementById('pmtFilterName').value : 'ALL';

  if (currentPaymentTab === 'credit') {
    document.getElementById('creditSalesTableBody').innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">กำลังดึงข้อมูลลูกหนี้เงินเชื่อ...</td></tr>';
    backend.run
      .withSuccessHandler(renderCreditSalesTable)
      .getCreditSalesByMonth(yearMonth, buyerFilter);
  } else {
    document.getElementById('companyExpenseTableBody').innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">กำลังดึงข้อมูลค่าใช้จ่ายบริษัท...</td></tr>';
    
    initTransferAccounts(function() {
      backend.run
        .withSuccessHandler(renderCompanyExpenseTable)
        .getCompanyExpensesByMonth(yearMonth);
    });
  }
}

function updatePmtNameFilterDropdown(dataList, tabType) {
  const nameSelect = document.getElementById('pmtFilterName');
  const nameLabel = document.getElementById('lblPmtFilterName');
  if (!nameSelect || !nameLabel) return;

  const currentSelected = nameSelect.value;

  if (tabType === 'credit') {
    nameLabel.innerHTML = '<i class="bi bi-person me-1"></i>กรองผู้ซื้อ';
  } else {
    nameLabel.innerHTML = '<i class="bi bi-shop me-1"></i>กรองร้านค้า/ผู้รับเงิน';
  }

  // ดึงรายชื่อที่ไม่ซ้ำกัน
  let names = [];
  if (Array.isArray(dataList)) {
    dataList.forEach(item => {
      let name = '';
      if (tabType === 'credit') {
        name = (item.buyerName || '').trim();
      } else {
        name = (item.payeeName || item.itemName || '').trim();
      }
      if (name && name !== '-' && !names.includes(name)) {
        names.push(name);
      }
    });
  }

  names.sort((a, b) => a.localeCompare(b, 'th'));

  let defaultText = tabType === 'credit' ? '-- แสดงทุกผู้ซื้อ --' : '-- แสดงทุกร้านค้า/ผู้รับเงิน --';
  let html = `<option value="ALL">${defaultText}</option>`;
  
  names.forEach(n => {
    const selected = (n === currentSelected) ? 'selected' : '';
    html += `<option value="${n}" ${selected}>${n}</option>`;
  });

  nameSelect.innerHTML = html;
}

// 1. เรนเดอร์ตารางลูกค้าเงินเชื่อ
function renderCreditSalesTable(res) {
  const tbody = document.getElementById('creditSalesTableBody');
  if (!res || !res.success || !res.data || res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">ไม่พบรายการขายเงินเชื่อในเดือนนี้</td></tr>';
    creditSalesCache = [];
    updatePmtNameFilterDropdown([], 'credit');
    updateCreditSalesTotal([]);
    return;
  }

  creditSalesCache = res.data;
  updatePmtNameFilterDropdown(creditSalesCache, 'credit');
  filterPaymentTable();
}

// 2. เรนเดอร์ตารางค่าใช้จ่ายบริษัท
function renderCompanyExpenseTable(res) {
  const tbody = document.getElementById('companyExpenseTableBody');
  if (!res || !res.success || !res.data || res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">ไม่พบรายการค่าใช้จ่ายในเดือนนี้</td></tr>';
    companyExpenseCache = [];
    updatePmtNameFilterDropdown([], 'expense');
    return;
  }

  companyExpenseCache = res.data;
  updatePmtNameFilterDropdown(companyExpenseCache, 'expense');
  filterPaymentTable();
}

// กรองตารางตามสถานะ
function filterPaymentTable() {
  const filterStatus = document.getElementById('pmtFilterStatus').value;
  const filterName = document.getElementById('pmtFilterName') ? document.getElementById('pmtFilterName').value : 'ALL';

  if (currentPaymentTab === 'credit') {
    const tbody = document.getElementById('creditSalesTableBody');
    let filtered = creditSalesCache.filter(item => {
      const isPaid = (item.paymentStatus === 'paid');
      let matchStatus = true;
      if (filterStatus === 'PAID') matchStatus = isPaid;
      if (filterStatus === 'UNPAID') matchStatus = !isPaid;

      let matchName = true;
      if (filterName && filterName !== 'ALL') {
        matchName = ((item.buyerName || '').trim() === filterName);
      }

      return matchStatus && matchName;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">ไม่พบรายการตามเงื่อนไขที่กรอง</td></tr>';
      updateCreditSalesTotal([]);
      return;
    }

    let html = '';
    filtered.forEach((item, index) => {
      const isPaid = (item.paymentStatus === 'paid');
      const todayStr = new Date().toISOString().split('T')[0];

      html += `
        <tr>
          <td class="text-center fw-bold">${item.saleNo || (index + 1)}</td>
          <td class="text-center">${item.date || '-'}</td>
          <td>${item.buyerName || '-'}</td>
          <td class="text-end">${fmtNum(item.pricePerLiter || item.unitPrice)}</td>
          <td class="text-end">${fmtNum(item.liters || item.qty)}</td>
          <td class="text-end fw-bold text-primary">${fmtNum(item.totalAmount)}</td>
          <td>${item.remarks || '-'}</td>
          <td class="text-center">
            <button class="btn btn-sm ${isPaid ? 'btn-success' : 'btn-danger'} w-100" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCredit_${item.docId}">
              ${isPaid ? '<i class="bi bi-check-circle-fill me-1"></i> Paid' : '<i class="bi bi-exclamation-circle-fill me-1"></i> Unpaid'}
            </button>
          </td>
        </tr>
        <tr class="collapse bg-light" id="collapseCredit_${item.docId}">
          <td colspan="8" class="p-3">
            <div class="card card-body border-0 shadow-sm">
              ${isPaid ? `
                <div class="text-success fw-bold">
                  <i class="bi bi-calendar-check me-1"></i> ชำระเงินเรียบร้อยแล้วเมื่อวันที่: <span class="badge bg-success fs-6">${item.paidDate || item.updatedAt || '-'}</span>
                </div>
              ` : `
                <div class="row g-2 align-items-center">
                  <div class="col-12 col-md-4">
                    <label class="form-label mb-1 fw-bold">ระบุวันที่ชำระเงิน:</label>
                    <input type="date" id="paidDate_${item.docId}" class="form-select form-select-sm" value="${todayStr}">
                  </div>
                  <div class="col-12 col-md-4 mt-md-4">
                    <button class="btn btn-success btn-sm w-100 fw-bold" onclick="submitCreditPayment('${item.docId}', '${item.date}')">
                      <i class="bi bi-check2-circle me-1"></i> เปลี่ยนเป็น Paid (ชำระแล้ว)
                    </button>
                  </div>
                </div>
              `}
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
    updateCreditSalesTotal(filtered);

  } else {
    const tbody = document.getElementById('companyExpenseTableBody');
    let filtered = companyExpenseCache.filter(item => {
      const isTransferred = (item.transferStatus === 'transferred' || (item.transferDate && item.transferDate.trim() !== ''));
      let matchStatus = true;
      if (filterStatus === 'PAID') matchStatus = isTransferred;
      if (filterStatus === 'UNPAID') matchStatus = !isTransferred;

      let matchName = true;
      if (filterName && filterName !== 'ALL') {
        const name = (item.payeeName || item.itemName || '-').trim();
        matchName = (name === filterName);
      }

      return matchStatus && matchName;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">ไม่พบรายการตามเงื่อนไขที่กรอง</td></tr>';
      return;
    }

    let html = '';
    filtered.forEach((item, index) => {
      const isTransferred = (item.transferStatus === 'transferred' || (item.transferDate && item.transferDate.trim() !== ''));
      const todayStr = new Date().toISOString().split('T')[0];

      let accountOptionsHtml = '<option value="">-- เลือกช่องทางชำระ --</option>';
      if (globalTransferAccounts && globalTransferAccounts.length > 0) {
        globalTransferAccounts.forEach(acc => {
          const selected = (item.transferAccount === acc.name) ? 'selected' : '';
          accountOptionsHtml += `<option value="${acc.name}" ${selected}>${acc.name}</option>`;
        });
      }

      html += `
        <tr>
          <td class="text-center fw-bold">${item.expenseNo || (index + 1)}</td>
          <td class="text-center">${item.date || '-'}</td>
          <td>${item.category || '-'}</td>
          <td>${item.payeeName || item.itemName || '-'}</td>
          <td class="text-end fw-bold text-danger">${fmtNum(item.totalWithVat || item.amount)}</td>
          <td class="text-center">${item.transferAccount || item.paymentType || '-'}</td>
          <td class="text-center">
            <button class="btn btn-sm ${isTransferred ? 'btn-success' : 'btn-warning text-dark'} w-100" type="button" data-bs-toggle="collapse" data-bs-target="#collapseExp_${item.docId}">
              ${isTransferred ? '<i class="bi bi-bank me-1"></i> โอนจ่ายแล้ว' : '<i class="bi bi-clock-history me-1"></i> ยังไม่โอนจ่าย'}
            </button>
          </td>
        </tr>
        <tr class="collapse bg-light" id="collapseExp_${item.docId}">
          <td colspan="7" class="p-3">
            <div class="card card-body border-0 shadow-sm">
              ${isTransferred ? `
                <div class="text-success fw-bold">
                  <i class="bi bi-check-all me-1"></i> โอนจ่ายแล้วผ่านช่องทาง: <span class="badge bg-primary">${item.transferAccount || 'โอนผ่านธนาคาร'}</span> 
                  เมื่อวันที่: <span class="badge bg-success fs-6">${item.transferDate || '-'}</span>
                </div>
              ` : `
                <div class="row g-2 align-items-center">
                  <div class="col-12 col-md-4">
                    <label class="form-label mb-1 fw-bold">เลือกช่องทางชำระ:</label>
                    <select id="transferAccount_${item.docId}" class="form-select form-select-sm">
                      ${accountOptionsHtml}
                    </select>
                  </div>
                  <div class="col-12 col-md-4">
                    <label class="form-label mb-1 fw-bold">ระบุวันที่โอนจ่าย:</label>
                    <input type="date" id="transferDate_${item.docId}" class="form-select form-select-sm" value="${todayStr}">
                  </div>
                  <div class="col-12 col-md-4 mt-md-4">
                    <button class="btn btn-primary btn-sm w-100 fw-bold" onclick="submitExpenseTransfer('${item.docId}', '${item.date}')">
                      <i class="bi bi-send-check me-1"></i> บันทึกโอนจ่ายเรียบร้อย
                    </button>
                  </div>
                </div>
              `}
            </div>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }
}

// สั่งอัปเดตสถานะชำระเงินของลูกค้าเงินเชื่อ
function submitCreditPayment(docId, saleDate) {
  const paidDate = document.getElementById('paidDate_' + docId).value;
  if (!paidDate) {
    alert("กรุณาระบุวันที่ชำระเงิน");
    return;
  }

  if (typeof Swal !== 'undefined') Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  backend.run
    .withSuccessHandler(function(res) {
      if (typeof Swal !== 'undefined') Swal.close();
      if (res && res.success) {
        // ป๊อปอัปแบบมีปุ่มกด OK
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ!',
          text: 'อัปเดตสถานะการชำระเงินเรียบร้อยแล้ว',
          confirmButtonColor: '#3085d6',
          confirmButtonText: 'ตกลง'
        });
        loadPaymentManagementData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: res.message || 'ไม่สามารถอัปเดตได้',
          confirmButtonColor: '#d33',
          confirmButtonText: 'ตกลง'
        });
      }
    })
    .updateSalePaymentStatus(docId, paidDate, saleDate);
}

// สั่งอัปเดตการโอนจ่ายของบริษัท
// ✅ โค้ดที่แก้ไขแล้ว:
function submitExpenseTransfer(docId, expDate) {
  const transferAccount = document.getElementById('transferAccount_' + docId).value;
  const transferDate = document.getElementById('transferDate_' + docId).value;

  if (!transferDate) {
    alert("กรุณาระบุวันที่โอนจ่าย");
    return;
  }

  if (typeof Swal !== 'undefined') Swal.fire({ title: 'กำลังบันทึกการโอน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  backend.run
    .withSuccessHandler(function(res) {
      if (typeof Swal !== 'undefined') Swal.close();
      if (res && res.success) {
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ!',
          text: 'อัปเดตสถานะการโอนจ่ายเรียบร้อยแล้ว',
          confirmButtonColor: '#3085d6',
          confirmButtonText: 'ตกลง'
        });
        loadPaymentManagementData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: res.message || 'ไม่สามารถอัปเดตได้',
          confirmButtonColor: '#d33',
          confirmButtonText: 'ตกลง'
        });
      }
    })
    .updateExpenseTransferStatus(docId, transferAccount, transferDate, expDate);
}

// Helper ฟอร์แมตตัวเลข
function fmtNum(n) {
  return (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initTransferAccounts(callback, forceReload = false) {
  if (isTransferAccountsLoaded && !forceReload && globalTransferAccounts.length > 0) {
    if (typeof callback === 'function') callback();
    return;
  }

  backend.run
    .withSuccessHandler(function(res) {
      if (res && res.success) {
        globalTransferAccounts = res.data || [];
        isTransferAccountsLoaded = true;
      } else {
        console.error('ไม่สามารถดึงข้อมูลบัญชีโอนได้:', res ? res.message : '');
      }
      if (typeof callback === 'function') callback();
    })
    .withFailureHandler(function(err) {
      console.error('Error fetching transfer accounts:', err);
      if (typeof callback === 'function') callback();
    })
    .getTransferAccounts();
}

function confirmPayment(docId, saleDate) {
  // ดึงค่าช่องทางการโอนที่เลือกจาก Dropdown
  var selectedAccount = $('#transferAccount_' + docId).val();

  if (!selectedAccount) {
    Swal.fire({
      icon: 'warning',
      title: 'กรุณาเลือกช่องทางชำระเงิน',
      confirmButtonText: 'ตกลง'
    });
    return;
  }

  // ส่งไปบันทึกที่หลังบ้าน
  backend.run
    .withSuccessHandler(function(res) {
      if (res && res.success) {
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ!',
          text: 'อัปเดตสถานะการชำระเงินเรียบร้อยแล้ว',
          timer: 1500,
          showConfirmButton: false
        });
        renderSalesList(); // รีโหลดรายการใหม่
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: res.message || 'ไม่สามารถอัปเดตได้'
        });
      }
    })
    .updateSalePaymentStatus(docId, selectedAccount, saleDate);
}

/**
 * ฟังก์ชันคำนวณยอดรวมจำนวนเงินจากรายการที่กำลังแสดงผล
 * @param {Array} displayData - รายการขายที่แสดงผลอยู่ ณ ปัจจุบัน
 */
function updateCreditSalesTotal(displayData) {
  var totalSum = 0;

  if (Array.isArray(displayData) && displayData.length > 0) {
    totalSum = displayData.reduce(function(sum, item) {
      var val = parseFloat(item.totalAmount || item.amount || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }

  var totalElem = document.getElementById("creditSalesTotalAmount");
  if (totalElem) {
    totalElem.textContent = totalSum.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}

function calculateTotalFromVisibleRows() {
  var totalSum = 0;
  var visibleRows = document.querySelectorAll("#creditSalesTableBody tr:not(.d-none)");

  visibleRows.forEach(function(row) {
    // 📌 เช็กความปลอดภัย: แถวต้องมีเซลล์ครบอย่างน้อย 6 คอลัมน์ (ป้องกันแถว "ไม่พบข้อมูล")
    if (row.cells && row.cells.length >= 6) {
      var cell = row.cells[5]; 
      if (cell) {
        var numText = cell.textContent.replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
        var val = parseFloat(numText);
        if (!isNaN(val)) {
          totalSum += val;
        }
      }
    }
  });

  var totalElem = document.getElementById("creditSalesTotalAmount");
  if (totalElem) {
    totalElem.textContent = totalSum.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
// ==================== FINANCIAL SUMMARY MODULE LOGIC ====================
// ==================== FINANCIAL SUMMARY MODULE LOGIC ====================
// ==================== FINANCIAL SUMMARY MODULE LOGIC ====================
// ==================== FINANCIAL SUMMARY MODULE LOGIC ====================
// ==================== FINANCIAL SUMMARY MODULE LOGIC ====================

/**
 * ดึงข้อมูลและเรนเดอร์เมนูสรุปยอดรายรับรายจ่าย
 */
