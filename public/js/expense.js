// public/js/expense.js

let rawExpenseData = [];
let expenseTableInstance = null;
let lastSelectedPayType = null;
let addPayRecordModalInstance = null;

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

document.addEventListener('DOMContentLoaded', function () {
  initAllMonthYearFilters();
  loadPayRecords();
  loadTransferAccounts();
  resetExpenseForm();
  loadExpenseData();

  // ผูก Event การเปลี่ยนวันที่เพื่ออัปเดตเลขที่บิล
  const expDateEl = document.getElementById('expenseDate');
  if (expDateEl) {
    expDateEl.addEventListener('change', function () {
      if (!document.getElementById('editExpenseDocId').value) {
        updateExpenseNoPreview();
      }
    });
  }

  // ผูก Event บันทึกฟอร์ม
  const expFormEl = document.getElementById('expenseForm');
  if (expFormEl) {
    expFormEl.addEventListener('submit', handleExpenseFormSubmit);
  }
});

// 🟢 ฟังก์ชันเปิด Modal สำหรับเพิ่มรายการใหม่
function openAddExpenseModal() {
  resetExpenseForm();
  const modalEl = document.getElementById('expenseFormModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  document.getElementById('expenseFormModalLabel').innerHTML = '<i class="bi bi-plus-circle-fill me-2"></i>บันทึกรายการค่าใช้จ่าย';
  modal.show();
}

// 🟢 ฟังก์ชันเปิด Modal สำหรับแก้ไขรายการ
function openEditExpenseModal() {
  const modalEl = document.getElementById('expenseFormModal');
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  document.getElementById('expenseFormModalLabel').innerHTML = '<i class="bi bi-pencil-square me-2"></i>แก้ไขรายการค่าใช้จ่าย';
  modal.show();
}

// 🟢 ฟังก์ชันปิด Modal หลังบันทึกสำเร็จ
function hideExpenseModal() {
  const modalEl = document.getElementById('expenseFormModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();
}

// ==================== HELPER FUNCTIONS ====================
function formatDateForInput(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  let cleanStr = String(dateStr).trim().replace(/-/g, '/');
  let parts = cleanStr.split('/');
  if (parts.length === 3) {
    let year = parseInt(parts[0], 10);
    let month = parts[1].padStart(2, '0');
    let day = parts[2].padStart(2, '0');
    if (year > 2400) year -= 543;
    return `${year}-${month}-${day}`;
  }
  return dateStr;
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

function parseRawNum(valStr) {
  if (!valStr) return 0;
  return parseFloat(String(valStr).replace(/,/g, '')) || 0;
}

function formatNumWithComma(num, precision = 2) {
  if (num === null || num === undefined || isNaN(num) || num === 0) {
    return precision === 0 ? '0' : '0.00';
  }
  return Number(num).toLocaleString('th-TH', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
}

function setupMonthYearDropdowns(startMonthId, startYearId, endMonthId, endYearId) {
  const startM = document.getElementById(startMonthId);
  const endM = document.getElementById(endMonthId);
  const startY = document.getElementById(startYearId);
  const endY = document.getElementById(endYearId);

  if (!startM || !endM || !startY || !endY) return;
  if (startM.options.length > 0) return;

  const currentYearBE = new Date().getFullYear() + 543;
  const currentMonthIdx = new Date().getMonth();

  THAI_MONTHS.forEach((m, idx) => {
    startM.add(new Option(m, idx + 1));
    endM.add(new Option(m, idx + 1));
  });

  for (let y = currentYearBE - 3; y <= currentYearBE + 1; y++) {
    startY.add(new Option(y, y));
    endY.add(new Option(y, y));
  }

  startM.value = currentMonthIdx + 1;
  endM.value = currentMonthIdx + 1;
  startY.value = currentYearBE;
  endY.value = currentYearBE;
}

function initAllMonthYearFilters() {
  setupMonthYearDropdowns('filterExpStartMonth', 'filterExpStartYear', 'filterExpEndMonth', 'filterExpEndYear');
}

// ==================== UI & FORM CONTROLS ====================
async function updateExpenseNoPreview() {
  const selectedDate = document.getElementById('expenseDate').value;
  const res = await getNextExpenseNo(selectedDate);
  if (res && res.success && res.expenseNo) {
    document.getElementById('expenseNo').value = res.expenseNo;
  }
}

function toggleExpenseCategory() {
  const categoryVal = document.getElementById('expenseCategory') ? document.getElementById('expenseCategory').value.trim() : '';
  const fuelSection = document.getElementById('expFuelSection');
  const isOilCategory = (categoryVal === 'ซื้อน้ำมัน ท่าทอง' || categoryVal === 'ซื้อน้ำมัน P.C. Siam');

  if (fuelSection) {
    fuelSection.style.display = isOilCategory ? 'block' : 'none';
  }

  const priceInput = document.getElementById('expPricePerLiter');
  const litersInput = document.getElementById('expLiters');
  
  if (priceInput) priceInput.required = isOilCategory;
  if (litersInput) litersInput.required = isOilCategory;

  calculateExpenseTotal();
}

function handlePayTypeClick(radioEl) {
  if (lastSelectedPayType === radioEl) {
    radioEl.checked = false;
    lastSelectedPayType = null;
  } else {
    lastSelectedPayType = radioEl.checked ? radioEl : null;
  }
  toggleExpensePayType();
}

function toggleExpensePayType() {
  const selectedRadio = document.querySelector('input[name="expensePayType"]:checked');
  const payType = selectedRadio ? selectedRadio.value : '';

  const transferCol = document.getElementById('transferAccountCol');
  const transferDateCol = document.getElementById('transferDateCol');
  const remarksCol = document.getElementById('remarksCol');
  const accountSelect = document.getElementById('expTransferAccount');
  const transferDateInput = document.getElementById('expTransferDate');
  const dateLabel = document.getElementById('expTransferDateLabel');

  if (payType === 'เงินโอน') {
    if (transferCol) transferCol.style.display = 'block';
    if (transferDateCol) transferDateCol.style.display = 'block';
    if (remarksCol) remarksCol.className = 'col-12 col-md-3';

    if (accountSelect) accountSelect.required = true;
    if (transferDateInput) {
      transferDateInput.required = true;
      if (!transferDateInput.value) {
        transferDateInput.value = document.getElementById('expenseDate') ? document.getElementById('expenseDate').value : new Date().toISOString().split('T')[0];
      }
    }
    if (dateLabel) dateLabel.innerHTML = 'วันที่โอนจ่าย <span class="text-danger">*</span>';

  } else if (payType === 'เงินสด') {
    if (transferCol) transferCol.style.display = 'none';
    if (transferDateCol) transferDateCol.style.display = 'block';
    if (remarksCol) remarksCol.className = 'col-12 col-md-6';

    if (accountSelect) {
      accountSelect.required = false;
      accountSelect.value = '';
    }
    if (transferDateInput) {
      transferDateInput.required = true;
      if (!transferDateInput.value) {
        transferDateInput.value = document.getElementById('expenseDate') ? document.getElementById('expenseDate').value : new Date().toISOString().split('T')[0];
      }
    }
    if (dateLabel) dateLabel.innerHTML = 'วันที่จ่ายเงินสด <span class="text-danger">*</span>';

  } else {
    if (transferCol) transferCol.style.display = 'none';
    if (transferDateCol) transferDateCol.style.display = 'none';
    if (remarksCol) remarksCol.className = 'col-12 col-md-6';

    if (accountSelect) {
      accountSelect.required = false;
      accountSelect.value = '';
    }
    if (transferDateInput) {
      transferDateInput.required = false;
      transferDateInput.value = '';
    }
  }
}

function calculateExpenseTotal() {
  const categoryVal = document.getElementById('expenseCategory') ? document.getElementById('expenseCategory').value.trim() : '';
  const isOilCategory = (categoryVal === 'ซื้อน้ำมัน ท่าทอง' || categoryVal === 'ซื้อน้ำมัน P.C. Siam');
  const amountInput = document.getElementById('expenseAmount');

  if (isOilCategory) {
    const price = parseRawNum(document.getElementById('expPricePerLiter').value);
    const liters = parseRawNum(document.getElementById('expLiters').value);
    const calculatedAmount = price * liters;
    
    if (calculatedAmount > 0) {
      amountInput.value = formatNumWithComma(calculatedAmount, 2);
    }
  }

  const baseAmount = parseRawNum(amountInput.value);
  const vatType = document.getElementById('expVatType') ? document.getElementById('expVatType').value : 'NONE';

  let amountBeforeVat = 0;
  let vatAmount = 0;
  let totalWithVat = 0;

  if (vatType === 'INCLUSIVE') {
    amountBeforeVat = baseAmount / 1.07;
    vatAmount = baseAmount - amountBeforeVat;
    totalWithVat = baseAmount;
  } else if (vatType === 'EXCLUSIVE') {
    amountBeforeVat = baseAmount;
    vatAmount = baseAmount * 0.07;
    totalWithVat = baseAmount + vatAmount;
  } else {
    amountBeforeVat = baseAmount;
    vatAmount = 0;
    totalWithVat = baseAmount;
  }

  if (document.getElementById('expAmountDisplay')) {
    document.getElementById('expAmountDisplay').value = formatNumWithComma(baseAmount, 2);
  }
  document.getElementById('expAmountBeforeVat').value = formatNumWithComma(amountBeforeVat, 2);
  document.getElementById('expVatAmount').value = formatNumWithComma(vatAmount, 2);
  document.getElementById('expTotalWithVat').value = formatNumWithComma(totalWithVat, 2);
}

function resetExpenseForm() {
  document.getElementById('expenseForm').reset();
  document.getElementById('editExpenseDocId').value = '';

  const payRadios = document.getElementsByName('expensePayType');
  payRadios.forEach(r => r.checked = false);
  lastSelectedPayType = null;

  const today = new Date().toISOString().split('T')[0];
  if (document.getElementById('expenseDate')) document.getElementById('expenseDate').value = today;

  if (document.getElementById('expFuel95')) document.getElementById('expFuel95').checked = true;
  if (document.getElementById('expVatType')) document.getElementById('expVatType').value = 'NONE';
  if (document.getElementById('expenseCategory')) document.getElementById('expenseCategory').value = '';

  if (document.getElementById('expenseAmount')) document.getElementById('expenseAmount').value = '';
  if (document.getElementById('expAmountDisplay')) document.getElementById('expAmountDisplay').value = '0.00';
  if (document.getElementById('expAmountBeforeVat')) document.getElementById('expAmountBeforeVat').value = '0.00';
  if (document.getElementById('expVatAmount')) document.getElementById('expVatAmount').value = '0.00';
  if (document.getElementById('expTotalWithVat')) document.getElementById('expTotalWithVat').value = '0.00';

  document.getElementById('btnSaveExpense').innerHTML = `<i class="bi bi-save me-1"></i> บันทึกข้อมูลค่าใช้จ่าย`;

  const modalTitleEl = document.getElementById('expenseFormModalLabel');
  if (modalTitleEl) {
    modalTitleEl.innerHTML = '<i class="bi bi-plus-circle-fill me-2"></i>บันทึกรายการค่าใช้จ่าย';
  }

  toggleExpenseCategory();
  toggleExpensePayType();
  updateExpenseNoPreview();
}

// ==================== DATA LOAD & SAVE ====================
async function loadExpenseData() {
  const startMEl = document.getElementById('filterExpStartMonth');
  const startYEl = document.getElementById('filterExpStartYear');
  const endMEl = document.getElementById('filterExpEndMonth');
  const endYEl = document.getElementById('filterExpEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) return;

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const endM = parseInt(endMEl.value, 10);
  const endY = parseInt(endYEl.value, 10) - 543;

  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/01`;
  const lastDayOfEndMonth = new Date(endY, endM, 0).getDate();
  const endDateStr = `${endY}/${String(endM).padStart(2, '0')}/${String(lastDayOfEndMonth).padStart(2, '0')}`;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังโหลดข้อมูลค่าใช้จ่าย...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await getExpenseRecordsRange(startDateStr, endDateStr, 3000);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      rawExpenseData = res.data || [];
      filterExpenseData();
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
  }
}

function filterExpenseData() {
  const reqStatus = document.getElementById('filterRequisitionStatus') ? document.getElementById('filterRequisitionStatus').value : 'ALL';
  const payStatus = document.getElementById('filterTransferStatus') ? document.getElementById('filterTransferStatus').value : 'ALL';

  let filtered = rawExpenseData;

  if (reqStatus === 'REQ_YES') {
    filtered = filtered.filter(x => x.isRequisition === true || (x.requisitionNo && x.requisitionNo.trim() !== ''));
  } else if (reqStatus === 'REQ_NO') {
    filtered = filtered.filter(x => !x.isRequisition && (!x.requisitionNo || x.requisitionNo.trim() === ''));
  }

  if (payStatus === 'PAY_YES') {
    filtered = filtered.filter(x => (x.transferNo && x.transferNo.trim() !== '') || x.transferDate || x.paymentType === 'เงินโอน');
  } else if (payStatus === 'PAY_NO') {
    filtered = filtered.filter(x => (!x.transferNo || x.transferNo.trim() === '') && !x.transferDate && x.paymentType !== 'เงินโอน');
  }

  renderExpenseTable(filtered);
}

function renderExpenseTable(data) {
  if (expenseTableInstance) {
    expenseTableInstance.destroy();
    expenseTableInstance = null;
  }

  const tbody = document.getElementById('expenseTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach(item => {
    const isReq = item.isRequisition || (item.requisitionNo && item.requisitionNo.trim() !== '');
    const isPay = (item.transferNo && item.transferNo.trim() !== '') || item.transferDate || item.paymentType === 'เงินโอน';

    const reqBadge = isReq ? `<span class="badge bg-info text-dark">ตั้งเบิกแล้ว</span>` : `<span class="badge bg-light text-muted border">ยังไม่ตั้งเบิก</span>`;
    const payBadge = isPay ? `<span class="badge bg-success me-1">โอนจ่ายแล้ว</span>` : `<span class="badge bg-warning text-dark me-1">ยังไม่โอนจ่าย</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold text-secondary small">${item.expenseNo || '-'}</td>
      <td>${formatDateThai(item.date)}</td>
      <td><span class="badge bg-secondary">${item.category || '-'}</span></td>
      <td class="fw-bold">${item.payeeName || '-'}</td>
      <td class="text-end fw-bold text-danger">${parseFloat(item.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="text-center"><span class="badge ${item.paymentType === 'เงินสด' ? 'bg-success' : 'bg-primary'}">${item.paymentType || 'เงินสด'}</span></td>
      <td class="text-center">${payBadge}${reqBadge}</td>
      <td class="small text-muted">${item.remarks || '-'}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editExpenseRecord('${item.id}')" title="แก้ไข"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteExpense('${item.id}')" title="ลบ"><i class="bi bi-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  expenseTableInstance = $('#expenseTable').DataTable({
    language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' },
    order: [[1, 'desc']],
    pageLength: 10
  });
}

async function handleExpenseFormSubmit(e) {
  e.preventDefault();

  const categoryVal = document.getElementById('expenseCategory').value.trim();
  const isOilCategory = (categoryVal === 'ซื้อน้ำมัน ท่าทอง' || categoryVal === 'ซื้อน้ำมัน P.C. Siam');
  
  const selectedPayRadio = document.querySelector('input[name="expensePayType"]:checked');
  const paymentType = selectedPayRadio ? selectedPayRadio.value : '';

  const fuelRadio = document.querySelector('input[name="expFuelItemName"]:checked');
  const itemName = isOilCategory ? (fuelRadio ? fuelRadio.value : '95') : categoryVal;

  const rawDate = document.getElementById('expenseDate').value;
  const rawTransferDate = document.getElementById('expTransferDate') ? document.getElementById('expTransferDate').value : '';

  const payload = {
    docId: document.getElementById('editExpenseDocId').value,
    expenseNo: document.getElementById('expenseNo').value.trim(),
    date: rawDate,
    category: categoryVal,
    itemName: itemName,
    payeeName: document.getElementById('payeeName').value.trim(),
    pricePerLiter: isOilCategory ? parseRawNum(document.getElementById('expPricePerLiter').value) : 0,
    liters: isOilCategory ? parseRawNum(document.getElementById('expLiters').value) : 0,
    amount: parseRawNum(document.getElementById('expenseAmount').value),
    amountBeforeVat: parseRawNum(document.getElementById('expAmountBeforeVat').value),
    vatAmount: parseRawNum(document.getElementById('expVatAmount').value),
    totalWithVat: parseRawNum(document.getElementById('expTotalWithVat').value),
    paymentType: paymentType,
    transferAccount: paymentType === 'เงินโอน' ? document.getElementById('expTransferAccount').value : '',
    transferDate: rawTransferDate,
    remarks: document.getElementById('expenseRemarks').value.trim(),
    recordedBy: (window.currentUser ? window.currentUser.username : 'system')
  };

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await saveExpenseRecord(payload);
    if (res && res.success) {
      // 🟢 ปิด Modal ฟอร์มบันทึกหลังบันทึกสำเร็จ
      hideExpenseModal();

      if (typeof Swal !== 'undefined') {
        Swal.fire({ 
          icon: 'success', 
          title: 'บันทึกสำเร็จ!', 
          text: 'บันทึกข้อมูลค่าใช้จ่ายเรียบร้อยแล้ว', 
          confirmButtonColor: '#005f73' 
        });
      }
      resetExpenseForm();
      loadExpenseData();
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
  }
}

function editExpenseRecord(id) {
  const item = rawExpenseData.find(x => String(x.id) === String(id));
  if (!item) return;

  document.getElementById('editExpenseDocId').value = item.id;
  document.getElementById('expenseNo').value = item.expenseNo || '';
  document.getElementById('expenseDate').value = formatDateForInput(item.date);

  document.getElementById('expenseCategory').value = item.category || '';
  document.getElementById('payeeName').value = item.payeeName || '';
  document.getElementById('expenseRemarks').value = item.remarks || '';

  toggleExpenseCategory();

  if (item.category === 'ซื้อน้ำมัน ท่าทอง' || item.category === 'ซื้อน้ำมัน P.C. Siam') {
    if (item.itemName === 'ดีเซล') document.getElementById('expFuelDiesel').checked = true;
    else document.getElementById('expFuel95').checked = true;

    document.getElementById('expPricePerLiter').value = formatNumWithComma(item.pricePerLiter, 2);
    document.getElementById('expLiters').value = formatNumWithComma(item.liters, 2);
  }

  document.getElementById('expenseAmount').value = formatNumWithComma(item.amount, 2);

  if (item.vatAmount > 0) {
    if (Math.abs((item.amountBeforeVat + item.vatAmount) - item.amount) < 0.05) {
      document.getElementById('expVatType').value = 'EXCLUSIVE';
    } else {
      document.getElementById('expVatType').value = 'INCLUSIVE';
    }
  } else {
    document.getElementById('expVatType').value = 'NONE';
  }

  calculateExpenseTotal();

  if (item.paymentType === 'เงินโอน') {
    const radio = document.getElementById('expPayTransfer');
    if (radio) {
      radio.checked = true;
      lastSelectedPayType = radio;
    }
    toggleExpensePayType();
    loadTransferAccounts(item.transferAccount || '');
  } else if (item.paymentType === 'เงินสด') {
    const radio = document.getElementById('expPayCash');
    if (radio) {
      radio.checked = true;
      lastSelectedPayType = radio;
    }
    toggleExpensePayType();
  } else {
    const payRadios = document.getElementsByName('expensePayType');
    payRadios.forEach(r => r.checked = false);
    lastSelectedPayType = null;
    toggleExpensePayType();
  }

  if (document.getElementById('expTransferDate')) {
    document.getElementById('expTransferDate').value = item.transferDate ? formatDateForInput(item.transferDate) : '';
  }

  document.getElementById('btnSaveExpense').innerHTML = `<i class="bi bi-pencil-square me-1"></i> อัปเดตข้อมูลค่าใช้จ่าย`;

  // 🟢 สั่งเปิด Modal Popup เพื่อแก้ไขรายการ
  openEditExpenseModal();
}

// 🟢 ฟังก์ชันยืนยันการลบ (แสดง SweetAlert2 Popup ยืนยัน)
async function confirmDeleteExpense(id) {
  if (typeof Swal === 'undefined') return;

  const result = await Swal.fire({
    title: 'ยืนยันการลบ?',
    text: 'เมื่อลบแล้วจะไม่สามารถคืนค่ารายการนี้ได้',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ลบรายการ',
    cancelButtonText: 'ยกเลิก'
  });

  if (result.isConfirmed) {
    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      // เรียกใช้ฟังก์ชันลบจริงใน firestore.js
      const res = await deleteExpenseRecord(id);
      if (res && res.success) {
        Swal.fire('สำเร็จ', 'ลบรายการเรียบร้อยแล้ว', 'success');
        loadExpenseData();
      } else {
        Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถลบได้', 'error');
      }
    } catch (err) {
      Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    }
  }
}

// ==================== MODALS & PAY RECORDS ====================
function openAddPayRecordModal() {
  document.getElementById('addPayRecordForm').reset();
  if (!addPayRecordModalInstance) {
    addPayRecordModalInstance = new bootstrap.Modal(document.getElementById('addPayRecordModal'));
  }
  addPayRecordModalInstance.show();
}

async function handleSavePayRecord(e) {
  e.preventDefault();
  const nameVal = document.getElementById('modalPayItemName').value.trim();

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกรายการ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await savePayRecord({ name: nameVal });
    if (res && res.success) {
      if (addPayRecordModalInstance) addPayRecordModalInstance.hide();
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มรายการสำเร็จ!',
          text: 'รายการถูกบันทึกลงระบบเรียบร้อยแล้ว',
          confirmButtonColor: '#005f73'
        });
      }
      loadPayRecords(nameVal);
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
  }
}

async function loadPayRecords(setSelectedValue) {
  try {
    const res = await getPayRecords();
    const selectEl = document.getElementById('expenseCategory');
    if (!selectEl) return;
    
    selectEl.innerHTML = '<option value="">-- เลือกรายการ --</option>';

    if (res && res.success && res.data) {
      res.data.forEach(item => {
        if (item.name) {
          const option = document.createElement('option');
          option.value = item.name;
          option.textContent = item.name;
          selectEl.appendChild(option);
        }
      });

      if (setSelectedValue) {
        selectEl.value = setSelectedValue;
      }
    }
  } catch (err) {
    console.error("❌ Error loading pay records:", err);
  }
}

async function loadTransferAccounts(setSelectedValue) {
  try {
    const res = await getTransferAccounts();
    const selectEl = document.getElementById('expTransferAccount');
    if (!selectEl) return;

    selectEl.innerHTML = '<option value="">-- เลือกบัญชีโอน --</option>';

    if (res && res.success && res.data) {
      res.data.forEach(item => {
        if (item.name) {
          const option = document.createElement('option');
          option.value = item.name;
          option.textContent = item.name;
          selectEl.appendChild(option);
        }
      });

      if (setSelectedValue) {
        selectEl.value = setSelectedValue;
      }
    }
  } catch (err) {
    console.error("❌ Error loading transfer accounts:", err);
  }
}