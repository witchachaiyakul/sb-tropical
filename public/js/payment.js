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
  const startYearSelect = document.getElementById('pmtStartYear');
  const endYearSelect = document.getElementById('pmtEndYear');
  const startMonthSelect = document.getElementById('pmtStartMonth');
  const endMonthSelect = document.getElementById('pmtEndMonth');

  const now = new Date();
  const currentYearBE = now.getFullYear() + 543;
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

  let yearHtml = '';
  for (let y = currentYearBE - 3; y <= currentYearBE + 1; y++) {
    const selected = (y === currentYearBE) ? 'selected' : '';
    yearHtml += `<option value="${y}" ${selected}>${y}</option>`;
  }

  if (startYearSelect) startYearSelect.innerHTML = yearHtml;
  if (endYearSelect) endYearSelect.innerHTML = yearHtml;
  if (startMonthSelect) startMonthSelect.value = currentMonth;
  if (endMonthSelect) endMonthSelect.value = currentMonth;
}

function switchPaymentTab(tabName) {
  currentPaymentTab = tabName;
  const btnCredit = document.getElementById('btnTabCreditSales');
  const btnExp = document.getElementById('btnTabCompanyExpenses');
  const viewCredit = document.getElementById('creditSalesSubView');
  const viewExp = document.getElementById('companyExpenseSubView');

  // รีเซ็ตตัวกรองชื่อเมื่อสลับแท็บระหว่างลูกหนี้กับค่าใช้จ่าย
  const nameSelect = document.getElementById('pmtFilterName');
  if (nameSelect) nameSelect.value = 'ALL';

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
  const startM = document.getElementById('pmtStartMonth').value;
  const startYBE = parseInt(document.getElementById('pmtStartYear').value, 10);
  const endM = document.getElementById('pmtEndMonth').value;
  const endYBE = parseInt(document.getElementById('pmtEndYear').value, 10);

  const startYAD = startYBE - 543;
  const endYAD = endYBE - 543;

  const startDateStr = `${startYAD}/${startM}/01`;
  const lastDay = new Date(endYAD, parseInt(endM, 10), 0).getDate();
  const endDateStr = `${endYAD}/${endM}/${String(lastDay).padStart(2, '0')}`;

  if (startDateStr > endDateStr) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('ช่วงเวลาไม่ถูกต้อง', 'เดือน/ปี เริ่มต้น ต้องไม่มากกว่า เดือน/ปี สิ้นสุด', 'warning');
    }
    return;
  }

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    if (currentPaymentTab === 'credit') {
      document.getElementById('creditSalesTableBody').innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">กำลังดึงข้อมูลลูกหนี้เงินเชื่อ...</td></tr>';
      const res = await getCreditSalesByDateRange(startDateStr, endDateStr, 'ALL');
      if (typeof Swal !== 'undefined') Swal.close();
      renderCreditSalesTable(res);
    } else {
      document.getElementById('companyExpenseTableBody').innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">กำลังดึงข้อมูลค่าใช้จ่ายบริษัท...</td></tr>';
      await initTransferAccounts();
      const res = await getCompanyExpensesByDateRange(startDateStr, endDateStr);
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
    updateCompanyExpenseTotal([]);
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
      updateCompanyExpenseTotal([]);
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

  const targetItem = creditSalesCache.find(x => String(x.docId || x.id) === String(docId)) || null;
  const refSaleNo = targetItem ? (targetItem.saleNo || docId) : docId;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await updateSalePaymentStatus(docId, paidDate, saleDate);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      // 📝 บันทึก Log รับชำระเงินลูกหนี้เงินเชื่อ
      if (typeof writeActivityLog === 'function') {
        const amt = targetItem ? Number(targetItem.totalAmount || 0) : 0;
        await writeActivityLog({
          module: 'PAYMENT',
          functionName: 'submitCreditPayment',
          action: 'MARK_CREDIT_PAID',
          docId: docId,
          refNo: refSaleNo,
          summary: `บันทึกชำระเงินบิลขาย ${refSaleNo} | ลูกค้า: ${targetItem ? (targetItem.buyerName || '-') : '-'} | ยอด ${amt.toLocaleString('th-TH')} บาท | วันที่ชำระ ${formatDateThai(paidDate)}`,
          beforeData: targetItem ? { paymentStatus: targetItem.paymentStatus, paidDate: targetItem.paidDate || '' } : null,
          afterData: { paymentStatus: 'paid', paidDate: paidDate, saleDate: saleDate }
        });
      }

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
      if (typeof writeActivityLog === 'function') {
        await writeActivityLog({
          module: 'PAYMENT',
          functionName: 'submitCreditPayment',
          action: 'ERROR_MARK_CREDIT_PAID',
          docId: docId,
          refNo: refSaleNo,
          summary: `บันทึกชำระเงินบิลขาย ${refSaleNo} ไม่สำเร็จ: ${res ? res.message : 'ไม่ทราบสาเหตุ'}`
        });
      }
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถอัปเดตได้', 'error');
    }
  } catch (err) {
    if (typeof writeActivityLog === 'function') {
      await writeActivityLog({
        module: 'PAYMENT',
        functionName: 'submitCreditPayment',
        action: 'ERROR_MARK_CREDIT_PAID',
        docId: docId,
        refNo: refSaleNo,
        summary: `เกิดข้อผิดพลาดระบบตอนบันทึกชำระเงิน ${refSaleNo}: ${err.message || err}`
      });
    }
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

  if (!transferAccount) {
    Swal.fire('กรุณาเลือกช่องทางชำระ', 'โปรดเลือกบัญชีหรือช่องทางการโอนจ่ายก่อนบันทึก', 'warning');
    return;
  }

  if (!transferDate) {
    Swal.fire('ข้อผิดพลาด', 'กรุณาระบุวันที่โอนจ่าย', 'warning');
    return;
  }

  const targetItem = companyExpenseCache.find(x => String(x.docId || x.id) === String(docId)) || null;
  const refExpNo = targetItem ? (targetItem.expenseNo || docId) : docId;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกการโอน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await updateExpenseTransferStatus(docId, transferAccount, transferDate, expDate);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      // 📝 บันทึก Log การโอนจ่ายค่าใช้จ่ายบริษัท
      if (typeof writeActivityLog === 'function') {
        const amt = targetItem ? Number(targetItem.totalWithVat || targetItem.amount || 0) : 0;
        await writeActivityLog({
          module: 'PAYMENT',
          functionName: 'submitExpenseTransfer',
          action: 'MARK_EXPENSE_TRANSFERRED',
          docId: docId,
          refNo: refExpNo,
          summary: `บันทึกโอนจ่ายค่าใช้จ่าย ${refExpNo} | ผู้รับเงิน: ${targetItem ? (targetItem.payeeName || targetItem.category || '-') : '-'} | บัญชี: ${transferAccount} | ยอด ${amt.toLocaleString('th-TH')} บาท | วันที่โอน ${formatDateThai(transferDate)}`,
          beforeData: targetItem ? { transferStatus: targetItem.transferStatus || '', transferAccount: targetItem.transferAccount || '', transferDate: targetItem.transferDate || '' } : null,
          afterData: { transferStatus: 'transferred', transferAccount: transferAccount, transferDate: transferDate, expDate: expDate }
        });
      }

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
      if (typeof writeActivityLog === 'function') {
        await writeActivityLog({
          module: 'PAYMENT',
          functionName: 'submitExpenseTransfer',
          action: 'ERROR_MARK_EXPENSE_TRANSFERRED',
          docId: docId,
          refNo: refExpNo,
          summary: `บันทึกโอนจ่ายค่าใช้จ่าย ${refExpNo} ไม่สำเร็จ: ${res ? res.message : 'ไม่ทราบสาเหตุ'}`
        });
      }
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถอัปเดตได้', 'error');
    }
  } catch (err) {
    if (typeof writeActivityLog === 'function') {
      await writeActivityLog({
        module: 'PAYMENT',
        functionName: 'submitExpenseTransfer',
        action: 'ERROR_MARK_EXPENSE_TRANSFERRED',
        docId: docId,
        refNo: refExpNo,
        summary: `เกิดข้อผิดพลาดระบบตอนบันทึกโอนจ่าย ${refExpNo}: ${err.message || err}`
      });
    }
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

// 🟢 ดึงรายการขายเงินเชื่อตามช่วงวันที่ (YYYY/MM/DD ถึง YYYY/MM/DD)
async function getCreditSalesByDateRange(startDateStr, endDateStr, buyerFilter = 'ALL') {
  try {
    const startFormatted = startDateStr ? startDateStr.replace(/-/g, '/') : '';
    const endFormatted = endDateStr ? endDateStr.replace(/-/g, '/') : '';

    let query = db.collection('sales_records');
    if (startFormatted) query = query.where('date', '>=', startFormatted);
    if (endFormatted) query = query.where('date', '<=', endFormatted);

    const snapshot = await query.limit(3000).get();
    const list = [];

    snapshot.forEach(doc => {
      const f = doc.data();
      const buyerName = (f.buyerName || '-').trim();
      if (buyerFilter && buyerFilter !== 'ALL' && buyerName !== buyerFilter.trim()) {
        return;
      }

      const pType = String(f.paymentType || '').trim();
      const pStatus = String(f.paymentStatus || 'unpaid').trim().toLowerCase();

      if (pType === 'เงินเชื่อ' || pStatus === 'unpaid') {
        list.push({
          docId: doc.id,
          id: doc.id,
          ...f,
          paymentStatus: pStatus || 'unpaid'
        });
      }
    });

    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return { success: true, data: list };
  } catch (err) {
    console.error("❌ Error in getCreditSalesByDateRange:", err);
    return { success: false, message: err.message, data: [] };
  }
}

// 🟢 ดึงรายการค่าใช้จ่ายบริษัทตามช่วงวันที่ (YYYY/MM/DD ถึง YYYY/MM/DD)
async function getCompanyExpensesByDateRange(startDateStr, endDateStr) {
  try {
    const startFormatted = startDateStr ? startDateStr.replace(/-/g, '/') : '';
    const endFormatted = endDateStr ? endDateStr.replace(/-/g, '/') : '';

    let query = db.collection('expense_records');
    if (startFormatted) query = query.where('date', '>=', startFormatted);
    if (endFormatted) query = query.where('date', '<=', endFormatted);

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
    console.error("❌ Error in getCompanyExpensesByDateRange:", err);
    return { success: false, message: err.message, data: [] };
  }
}