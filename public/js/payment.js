// public/js/payment.js

let currentPaymentTab = 'credit';
let creditSalesCache = [];
let companyExpenseCache = [];
let globalTransferAccounts = [];
let isTransferAccountsLoaded = false;

document.addEventListener('DOMContentLoaded', function () {
  initYearDropdown();
  loadPaymentManagementData();
});

function initYearDropdown() {
  const yearSelect = document.getElementById('pmtFilterYear');
  if (!yearSelect) return;

  const currentYearBE = new Date().getFullYear() + 543;
  let html = '';
  for (let y = currentYearBE - 3; y <= currentYearBE + 1; y++) {
    const selected = (y === currentYearBE) ? 'selected' : '';
    html += `<option value="${y}" ${selected}>${y}</option>`;
  }
  yearSelect.innerHTML = html;

  const monthSelect = document.getElementById('pmtFilterMonth');
  if (monthSelect) {
    const currentM = String(new Date().getMonth() + 1).padStart(2, '0');
    monthSelect.value = currentM;
  }
}

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

async function loadPaymentManagementData() {
  const m = document.getElementById('pmtFilterMonth').value;
  const yBE = document.getElementById('pmtFilterYear').value;
  const yAD = parseInt(yBE, 10) - 543;
  const yearMonth = yAD + "-" + m;
  const buyerFilter = document.getElementById('pmtFilterName') ? document.getElementById('pmtFilterName').value : 'ALL';

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    if (currentPaymentTab === 'credit') {
      document.getElementById('creditSalesTableBody').innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">กำลังดึงข้อมูลลูกหนี้เงินเชื่อ...</td></tr>';
      const res = await getCreditSalesByMonth(yearMonth, buyerFilter);
      if (typeof Swal !== 'undefined') Swal.close();
      renderCreditSalesTable(res);
    } else {
      document.getElementById('companyExpenseTableBody').innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">กำลังดึงข้อมูลค่าใช้จ่ายบริษัท...</td></tr>';
      await initTransferAccounts();
      const res = await getCompanyExpensesByMonth(yearMonth);
      if (typeof Swal !== 'undefined') Swal.close();
      renderCompanyExpenseTable(res);
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    console.error("❌ Error loading payment management data:", err);
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

function renderCompanyExpenseTable(res) {
  const tbody = document.getElementById('companyExpenseTableBody');
  if (!res || !res.success || !res.data || res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">ไม่พบรายการค่าใช้จ่ายในเดือนนี้</td></tr>';
    companyExpenseCache = [];
    updatePmtNameFilterDropdown([], 'expense');
    updateCompanyExpenseTotal([]); // ล้างยอดรวมเป็น 0.00 เมื่อไม่พบข้อมูล
    return;
  }

  companyExpenseCache = res.data;
  updatePmtNameFilterDropdown(companyExpenseCache, 'expense');
  filterPaymentTable();
}

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
      const docIdClean = String(item.docId || item.id).replace(/\//g, "-");

      html += `
        <tr>
          <td class="text-center fw-bold">${item.saleNo || (index + 1)}</td>
          <td class="text-center">${formatDateThai(item.date)}</td>
          <td>${item.buyerName || '-'}</td>
          <td class="text-end">${fmtNum(item.pricePerLiter || item.unitPrice)}</td>
          <td class="text-end">${fmtNum(item.liters || item.qty)}</td>
          <td class="text-end fw-bold text-primary">${fmtNum(item.totalAmount)}</td>
          <td>${item.remarks || '-'}</td>
          <td class="text-center">
            <button class="btn btn-sm ${isPaid ? 'btn-success' : 'btn-danger'} w-100" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCredit_${docIdClean}">
              ${isPaid ? '<i class="bi bi-check-circle-fill me-1"></i> Paid' : '<i class="bi bi-exclamation-circle-fill me-1"></i> Unpaid'}
            </button>
          </td>
        </tr>
        <tr class="collapse bg-light" id="collapseCredit_${docIdClean}">
          <td colspan="8" class="p-3">
            <div class="card card-body border-0 shadow-sm">
              ${isPaid ? `
                <div class="text-success fw-bold">
                  <i class="bi bi-calendar-check me-1"></i> ชำระเงินเรียบร้อยแล้วเมื่อวันที่: <span class="badge bg-success fs-6">${formatDateThai(item.paidDate || item.updatedAt)}</span>
                </div>
              ` : `
                <div class="row g-2 align-items-center">
                  <div class="col-12 col-md-4">
                    <label class="form-label mb-1 fw-bold">ระบุวันที่ชำระเงิน:</label>
                    <input type="date" id="paidDate_${docIdClean}" class="form-select form-select-sm" value="${todayStr}">
                  </div>
                  <div class="col-12 col-md-4 mt-md-4">
                    <button class="btn btn-success btn-sm w-100 fw-bold" onclick="submitCreditPayment('${item.docId || item.id}', '${item.date}')">
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
      updateCompanyExpenseTotal([]); // ล้างยอดรวมเป็น 0.00 เมื่อกรองแล้วไม่พบรายการ
      return;
    }

    let html = '';
    filtered.forEach((item, index) => {
      const isTransferred = (item.transferStatus === 'transferred' || (item.transferDate && item.transferDate.trim() !== ''));
      const todayStr = new Date().toISOString().split('T')[0];
      const docIdClean = String(item.docId || item.id).replace(/\//g, "-");

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
          <td class="text-center">${formatDateThai(item.date)}</td>
          <td>${item.category || '-'}</td>
          <td>${item.payeeName || item.itemName || '-'}</td>
          <td class="text-end fw-bold text-danger">${fmtNum(item.totalWithVat || item.amount)}</td>
          <td class="text-center">${item.transferAccount || item.paymentType || '-'}</td>
          <td class="text-center">
            <button class="btn btn-sm ${isTransferred ? 'btn-success' : 'btn-warning text-dark'} w-100" type="button" data-bs-toggle="collapse" data-bs-target="#collapseExp_${docIdClean}">
              ${isTransferred ? '<i class="bi bi-bank me-1"></i> โอนจ่ายแล้ว' : '<i class="bi bi-clock-history me-1"></i> ยังไม่โอนจ่าย'}
            </button>
          </td>
        </tr>
        <tr class="collapse bg-light" id="collapseExp_${docIdClean}">
          <td colspan="7" class="p-3">
            <div class="card card-body border-0 shadow-sm">
              ${isTransferred ? `
                <div class="text-success fw-bold">
                  <i class="bi bi-check-all me-1"></i> โอนจ่ายแล้วผ่านช่องทาง: <span class="badge bg-primary">${item.transferAccount || 'โอนผ่านธนาคาร'}</span> 
                  เมื่อวันที่: <span class="badge bg-success fs-6">${formatDateThai(item.transferDate)}</span>
                </div>
              ` : `
                <div class="row g-2 align-items-center">
                  <div class="col-12 col-md-4">
                    <label class="form-label mb-1 fw-bold">เลือกช่องทางชำระ:</label>
                    <select id="transferAccount_${docIdClean}" class="form-select form-select-sm">
                      ${accountOptionsHtml}
                    </select>
                  </div>
                  <div class="col-12 col-md-4">
                    <label class="form-label mb-1 fw-bold">ระบุวันที่โอนจ่าย:</label>
                    <input type="date" id="transferDate_${docIdClean}" class="form-select form-select-sm" value="${todayStr}">
                  </div>
                  <div class="col-12 col-md-4 mt-md-4">
                    <button class="btn btn-primary btn-sm w-100 fw-bold" onclick="submitExpenseTransfer('${item.docId || item.id}', '${item.date}')">
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
    updateCompanyExpenseTotal(filtered);
  }
}

async function submitCreditPayment(docId, saleDate) {
  const docIdClean = String(docId).replace(/\//g, "-");
  const paidDateInput = document.getElementById('paidDate_' + docIdClean);
  const paidDate = paidDateInput ? paidDateInput.value : '';

  if (!paidDate) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุวันที่ชำระเงิน', 'warning');
    return;
  }

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await updateSalePaymentStatus(docId, paidDate, saleDate);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ!',
        text: 'อัปเดตสถานะการชำระเงินเรียบร้อยแล้ว',
        confirmButtonColor: '#005f73',
        confirmButtonText: 'ตกลง'
      }).then(() => {
        loadPaymentManagementData();
      });
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถอัปเดตได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}

async function submitExpenseTransfer(docId, expDate) {
  const docIdClean = String(docId).replace(/\//g, "-");
  const accountSelect = document.getElementById('transferAccount_' + docIdClean);
  const dateInput = document.getElementById('transferDate_' + docIdClean);

  const transferAccount = accountSelect ? accountSelect.value : '';
  const transferDate = dateInput ? dateInput.value : '';

  if (!transferDate) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุวันที่โอนจ่าย', 'warning');
    return;
  }

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกการโอน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await updateExpenseTransferStatus(docId, transferAccount, transferDate, expDate);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ!',
        text: 'อัปเดตสถานะการโอนจ่ายเรียบร้อยแล้ว',
        confirmButtonColor: '#005f73',
        confirmButtonText: 'ตกลง'
      }).then(() => {
        loadPaymentManagementData();
      });
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถอัปเดตได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}

function fmtNum(n) {
  return (parseFloat(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateThai(dateStr) {
  if (!dateStr) return '-';
  const parts = String(dateStr).replace(/-/g, '/').split('/');
  if (parts.length === 3) {
    let y = parseInt(parts[0], 10);
    let m = parts[1].padStart(2, '0');
    let d = parts[2].padStart(2, '0');
    if (y < 2400) y += 543;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

async function initTransferAccounts(forceReload = false) {
  if (isTransferAccountsLoaded && !forceReload && globalTransferAccounts.length > 0) {
    return;
  }

  try {
    const res = await getTransferAccounts();
    if (res && res.success) {
      globalTransferAccounts = res.data || [];
      isTransferAccountsLoaded = true;
    }
  } catch (err) {
    console.error('Error fetching transfer accounts:', err);
  }
}

function updateCreditSalesTotal(displayData) {
  let totalSum = 0;
  if (Array.isArray(displayData) && displayData.length > 0) {
    totalSum = displayData.reduce(function(sum, item) {
      const val = parseFloat(item.totalAmount || item.amount || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }

  const totalElem = document.getElementById("creditSalesTotalAmount");
  if (totalElem) {
    totalElem.textContent = totalSum.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}

// ฟังก์ชันคำนวณยอดรวมจำนวนเงินค่าใช้จ่ายบริษัทจากรายการที่กำลังแสดงผล
function updateCompanyExpenseTotal(displayData) {
  let totalSum = 0;
  if (Array.isArray(displayData) && displayData.length > 0) {
    totalSum = displayData.reduce(function(sum, item) {
      const val = parseFloat(item.totalWithVat || item.amount || 0);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }

  const totalElem = document.getElementById("companyExpenseTotalAmount");
  if (totalElem) {
    totalElem.textContent = totalSum.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}