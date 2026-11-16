// public/js/bill.js

let rawUnpaidSalesData = [];
let currentSelectedBillItems = [];

document.addEventListener('DOMContentLoaded', function () {
  initMonthYearDropdowns();
  loadBillingData();
});

const GAS_PDF_SERVICE_URL = "https://script.google.com/macros/s/AKfycbzEuhTvEqFMUa6yNXkEFm7NC8UeJhUVXAu9cvavdWJZltiJTcG7S2AgWrBkEVJz90pxSQ/exec";

// ==================== DROPDOWN & DATE HELPERS ====================
function initMonthYearDropdowns() {
  const startM = document.getElementById('filterBillStartMonth');
  const startY = document.getElementById('filterBillStartYear');
  const endM = document.getElementById('filterBillEndMonth');
  const endY = document.getElementById('filterBillEndYear');

  if (!startM || !startY || !endM || !endY) return;

  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];

  let mOptions = '';
  monthNames.forEach((name, idx) => {
    const val = idx + 1;
    mOptions += `<option value="${val}">${name}</option>`;
  });
  startM.innerHTML = mOptions;
  endM.innerHTML = mOptions;

  const currentYearBE = new Date().getFullYear() + 543;
  let yOptions = '';
  for (let y = currentYearBE - 2; y <= currentYearBE + 2; y++) {
    yOptions += `<option value="${y}">${y}</option>`;
  }
  startY.innerHTML = yOptions;
  endY.innerHTML = yOptions;

  // กำหนดค่าเริ่มต้นเป็นเดือนปัจจุบัน
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  startM.value = curMonth;
  endM.value = curMonth;
  startY.value = currentYearBE;
  endY.value = currentYearBE;
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

function getTodayBE() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear() + 543;
  return `${d}/${m}/${y}`;
}

// ==================== LOAD & FILTER DATA ====================
async function loadBillingData() {
  const startMEl = document.getElementById('filterBillStartMonth');
  const startYEl = document.getElementById('filterBillStartYear');
  const endMEl = document.getElementById('filterBillEndMonth');
  const endYEl = document.getElementById('filterBillEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) {
    console.warn('⚠️ ไม่พบ Dropdown เลือกเดือน/ปี ในหน้าจอ');
    return;
  }

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const endM = parseInt(endMEl.value, 10);
  const endY = parseInt(endYEl.value, 10) - 543;

  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/01`;
  const lastDay = new Date(endY, endM, 0).getDate();
  const endDateStr = `${endY}/${String(endM).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังดึงรายการขายค้างวางบิล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await getUnpaidSalesRecords(startDateStr, endDateStr, 'ALL');
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      rawUnpaidSalesData = res.data || [];
      currentSelectedBillItems = [];

      updateBillingBuyerDropdown(rawUnpaidSalesData);
      filterBillingByBuyer();
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
  }
}

function updateBillingBuyerDropdown(records) {
  const sel = document.getElementById('filterBillBuyer');
  if (!sel) return;

  const currentSelection = sel.value;
  const availableBuyers = [...new Set(records.map(item => item && item.buyerName ? String(item.buyerName).trim() : '').filter(Boolean))].sort();

  let html = '<option value="ALL">-- ลูกค้าทั้งหมด (' + availableBuyers.length + ' ราย) --</option>';
  availableBuyers.forEach(buyerName => {
    html += `<option value="${buyerName}">${buyerName}</option>`;
  });

  sel.innerHTML = html;

  if (availableBuyers.includes(currentSelection)) {
    sel.value = currentSelection;
  } else {
    sel.value = 'ALL';
  }
}

function filterBillingByBuyer() {
  const sel = document.getElementById('filterBillBuyer');
  const selectedBuyer = sel ? sel.value.trim() : 'ALL';
  
  const sourceData = Array.isArray(rawUnpaidSalesData) ? rawUnpaidSalesData : [];
  let filteredRecords = sourceData;

  if (selectedBuyer && selectedBuyer !== 'ALL') {
    filteredRecords = sourceData.filter(item => {
      const bName = item && item.buyerName ? String(item.buyerName).trim() : '';
      return bName === selectedBuyer;
    });
  }

  currentSelectedBillItems = [];
  const masterCheck = document.getElementById('checkAllBill');
  if (masterCheck) masterCheck.checked = false;

  renderBillingTable(filteredRecords);
  updateBillingSelectionSummary();
}

// ==================== TABLE RENDER & SELECTION ====================
function renderBillingTable(records) {
  if ($.fn.DataTable.isDataTable('#billingTable')) {
    $('#billingTable').DataTable().destroy();
  }

  const tbody = document.getElementById('billingTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (records && records.length > 0) {
    records.forEach(item => {
      const tr = document.createElement('tr');
      const isChecked = (typeof currentSelectedBillItems !== 'undefined' && currentSelectedBillItems.some(x => String(x.id) === String(item.id))) ? 'checked' : '';
      
      const qty = parseFloat(item.qty || item.liters) || 0;
      const pricePerLiter = parseFloat(item.pricePerLiter || item.unitPrice) || 0;
      const totalAmount = parseFloat(item.totalAmount) || 0;
      const itemType = item.itemType || 'น้ำมัน';
      const itemName = item.itemName || '-';

      tr.innerHTML = `
        <td class="text-center">
          <input type="checkbox" class="bill-item-check" value="${item.id}" ${isChecked} onchange="handleBillItemSelect('${item.id}', this.checked)">
        </td>
        <td>${item.saleNo || item.id}</td>
        <td class="text-center">${formatDateThai(item.date)}</td>
        <td>${item.buyerName || '-'}</td>
        <td>${itemType}</td>
        <td>${itemName}</td>
        <td class="text-end">${qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-end">${pricePerLiter > 0 ? pricePerLiter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
        <td class="text-end fw-bold">${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="badge bg-warning text-dark">ค้างชำระ</span></td>
        <td>${item.remarks || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  $('#billingTable').DataTable({
    pageLength: 25,
    destroy: true,
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json'
    }
  });
}

function handleBillItemSelect(id, isChecked) {
  if (typeof currentSelectedBillItems === 'undefined') currentSelectedBillItems = [];

  if (typeof isChecked === 'undefined') {
    const cb = document.querySelector(`.bill-item-check[value="${id}"]`);
    isChecked = cb ? cb.checked : false;
  }

  const itemData = rawUnpaidSalesData.find(x => String(x.id) === String(id));
  if (!itemData) return;

  if (isChecked) {
    if (!currentSelectedBillItems.some(x => String(x.id) === String(id))) {
      currentSelectedBillItems.push(itemData);
    }
  } else {
    currentSelectedBillItems = currentSelectedBillItems.filter(x => String(x.id) !== String(id));
  }

  updateBillingSelectionSummary();
}

function toggleSelectAllBillItems(masterCb) {
  if (typeof currentSelectedBillItems === 'undefined') currentSelectedBillItems = [];

  const isChecked = masterCb ? masterCb.checked : false;
  const visibleCheckboxes = document.querySelectorAll('.bill-item-check');

  visibleCheckboxes.forEach(cb => {
    cb.checked = isChecked;
    const itemId = cb.value;
    const itemData = rawUnpaidSalesData.find(x => String(x.id) === String(itemId));

    if (itemData) {
      if (isChecked) {
        if (!currentSelectedBillItems.some(x => String(x.id) === String(itemId))) {
          currentSelectedBillItems.push(itemData);
        }
      } else {
        currentSelectedBillItems = currentSelectedBillItems.filter(x => String(x.id) !== String(itemId));
      }
    }
  });

  updateBillingSelectionSummary();
}

function updateBillingSelectionSummary() {
  const count = currentSelectedBillItems.length;

  const totalCents = currentSelectedBillItems.reduce((sumCents, item) => {
    const val = parseFloat(item.totalAmount || item.total || 0);
    return sumCents + Math.round(val * 100);
  }, 0);

  const total = totalCents / 100;

  const countEl = document.getElementById('selectedBillCount');
  const totalEl = document.getElementById('selectedBillTotal');

  if (countEl) countEl.innerText = count;
  if (totalEl) totalEl.innerText = total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ==================== PREVIEW & CONFIRM BILLING ====================
async function previewBillingNote() {
  if (!Array.isArray(currentSelectedBillItems) || currentSelectedBillItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดติ๊กเลือกอย่างน้อย 1 รายการเพื่อออกใบวางบิล', 'warning');
    return;
  }

  const firstBuyer = String(
    currentSelectedBillItems[0].buyerName || 
    currentSelectedBillItems[0].customerName || 
    currentSelectedBillItems[0].customer || ''
  ).trim();

  const isSameBuyer = currentSelectedBillItems.every(x => {
    const bName = String(x.buyerName || x.customerName || x.customer || '').trim();
    return bName === firstBuyer;
  });

  if (!isSameBuyer) {
    Swal.fire('ลูกค้าไม่ตรงกัน', 'การออกใบวางบิล 1 ใบ ต้องเป็นรายการของลูกค้าคนเดียวกันเท่านั้น กรุณาเลือกเฉพาะลูกค้ารายเดียว', 'warning');
    return;
  }

  Swal.fire({ title: 'กำลังเตรียมตัวอย่างเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  const todayBE = getTodayBE();

  try {
    const nextBillRes = await getNextBillNo();
    const realBillNo = (nextBillRes && nextBillRes.success) ? nextBillRes.billNo : 'SBBS-0001';

    const buyerRes = await getBuyerByName(firstBuyer);
    Swal.close();

    const buyerData = (buyerRes && buyerRes.success && buyerRes.data) ? buyerRes.data : {};
    const finalBuyerName = (buyerData.fullname && buyerData.fullname !== "ไม่ประสงค์ออกนาม") ? buyerData.fullname :
                           (buyerData.name && buyerData.name !== "ไม่ประสงค์ออกนาม") ? buyerData.name : 
                           (firstBuyer || "ไม่ประสงค์ออกนาม");

    document.getElementById('prevBillNo').innerText = realBillNo;
    document.getElementById('prevBillDate').innerText = todayBE;

    document.getElementById('prevBuyerName').innerText = finalBuyerName;
    document.getElementById('prevBuyerTaxId').innerText = buyerData.taxid || '-';
    document.getElementById('prevBuyerAddress').innerText = buyerData.address || '-';
    document.getElementById('prevBuyerRemark').innerText = firstBuyer || '-';

    const prevTbody = document.getElementById('prevBillingTableBody');
    prevTbody.innerHTML = '';
    
    let grandTotalCents = 0;

    currentSelectedBillItems.forEach((item, idx) => {
      const itemName = item.itemName || '-';
      const qty = parseFloat(item.qty || item.liters) || 0;
      const pricePerLiter = parseFloat(item.pricePerLiter || item.unitPrice) || 0;
      const total = Math.round((parseFloat(item.totalAmount || item.total || 0)) * 100) / 100;
      
      grandTotalCents += Math.round(total * 100);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center">${idx + 1}</td>
        <td class="text-center">${item.saleNo || '-'}</td>
        <td class="text-center">${formatDateThai(item.date)}</td>
        <td class="text-center">${itemName}</td>
        <td class="text-end">${qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-end">${pricePerLiter > 0 ? pricePerLiter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
        <td class="text-end fw-bold">${total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center">${item.remarks || '-'}</td>
      `;
      prevTbody.appendChild(tr);
    });

    const grandTotal = grandTotalCents / 100;
    const subtotal = Math.round((grandTotal / 1.07) * 100) / 100;
    const vatAmount = Math.round((grandTotal - subtotal) * 100) / 100;

    document.getElementById('prevBillSubtotal').innerText = subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('prevBillVat').innerText = vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('prevBillGrandTotal').innerText = grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const previewModal = new bootstrap.Modal(document.getElementById('billingPreviewModal'));
    previewModal.show();
  } catch (err) {
    Swal.close();
    Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}

async function confirmAndIssueBilling() {
  if (!currentSelectedBillItems || currentSelectedBillItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดเลือกอย่างน้อย 1 รายการเพื่อออกใบวางบิล', 'warning');
    return;
  }

  const modalEl = document.getElementById('billingPreviewModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);

  const result = await Swal.fire({
    title: 'ยืนยันการออกใบวางบิล?',
    text: "ระบบจะทำการสร้างเลขที่ใบวางบิล บันทึกฐานข้อมูล และสร้างเอกสาร PDF",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0d6efd',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ยืนยันและสร้าง PDF',
    cancelButtonText: 'ยกเลิก'
  });

  if (!result.isConfirmed) return;

  Swal.fire({ 
    title: 'กำลังบันทึกข้อมูล...', 
    text: 'กรุณารอสักครู่',
    allowOutsideClick: false, 
    didOpen: () => Swal.showLoading() 
  });

  const saleIds = currentSelectedBillItems.map(item => item.id);
  const billDateEl = document.getElementById('prevBillDate');
  const billDateStr = billDateEl ? billDateEl.innerText.trim() : getTodayBE();
  
  const buyerName = document.getElementById('prevBuyerName') ? document.getElementById('prevBuyerName').innerText.trim() : '-';
  const buyerTaxId = document.getElementById('prevBuyerTaxId') ? document.getElementById('prevBuyerTaxId').innerText.trim() : '-';
  const buyerAddress = document.getElementById('prevBuyerAddress') ? document.getElementById('prevBuyerAddress').innerText.trim() : '-';
  const buyerRemark = document.getElementById('prevBuyerRemark') ? document.getElementById('prevBuyerRemark').innerText.trim() : '-';

  const subtotal = parseFloat(document.getElementById('prevBillSubtotal').innerText.replace(/,/g, '')) || 0;
  const vatAmount = parseFloat(document.getElementById('prevBillVat').innerText.replace(/,/g, '')) || 0;
  const grandTotal = parseFloat(document.getElementById('prevBillGrandTotal').innerText.replace(/,/g, '')) || 0;

  const billingData = {
    buyerName: buyerName,
    buyerTaxId: buyerTaxId,
    buyerAddress: buyerAddress,
    buyerRemark: buyerRemark,
    subtotal: subtotal,
    vatAmount: vatAmount,
    grandTotal: grandTotal,
    saleNos: currentSelectedBillItems.map(x => x.saleNo || x.id)
  };

  try {
    // 1. บันทึกลง Firestore Direct
    const res = await confirmBilling(saleIds, billDateStr, billingData);

    if (res && res.success) {
      if (modalInstance) modalInstance.hide();

      // 2. เรียกฟังก์ชันสั่งสร้าง PDF ไปยัง GAS Generator Service
      await printBillingNoteDocument(res.billNo, billDateStr, billingData);
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
  }
}

async function printBillingNoteDocument(billNo, billDateStr, billingData) {
  Swal.fire({
    title: 'กำลังสร้างเอกสาร PDF...',
    text: 'กำลังส่งข้อมูลเข้าสู่ Google Slides Template',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const itemsData = currentSelectedBillItems.map(item => ({
    saleNo: item.saleNo || item.id,
    date: typeof formatDateThai === 'function' ? formatDateThai(item.date) : (item.date || '-'),
    fuel: item.itemName || item.fuelType || '95',
    qty: parseFloat(item.qty || item.liters) || 0,
    pricePerLiter: parseFloat(item.pricePerLiter || item.unitPrice) || 0,
    total: Math.round((parseFloat(item.totalAmount || item.total || 0)) * 100) / 100,
    remark: item.remarks || item.remark || item.note || ''
  }));

  const payload = {
    billNo: billNo,
    billDate: billDateStr,
    buyerName: billingData.buyerName,
    buyerTaxId: billingData.buyerTaxId,
    buyerAddress: billingData.buyerAddress,
    buyerRemark: billingData.buyerRemark,
    subtotal: billingData.subtotal,
    vatAmount: billingData.vatAmount,
    grandTotal: billingData.grandTotal,
    items: itemsData
  };

  try {
    // 📌 ส่ง POST Request ไปยัง GAS Web App (ใช้ text/plain เพื่อเลี่ยงการติด CORS Preflight)
    const response = await fetch(GAS_PDF_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const res = await response.json();

    if (res && res.success && res.pdfUrl) {
      Swal.fire({
        title: 'สร้าง PDF สำเร็จ!',
        html: `
          <p>ออกใบวางบิลเลขที่ <b>${res.billNo}</b> เรียบร้อยแล้ว</p>
          <div class="p-2 bg-light border rounded mb-3 text-start small">
            <strong>ลิงก์เอกสาร PDF:</strong><br>
            <a href="${res.pdfUrl}" target="_blank" class="text-break">${res.pdfUrl}</a>
          </div>
        `,
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'เปิดดู PDF',
        cancelButtonText: 'ปิด'
      }).then((result) => {
        if (result.isConfirmed) {
          window.open(res.pdfUrl, '_blank');
        }
        resetBillingForm();
      });
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
    }
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาดจาก PDF Service', err.toString(), 'error');
  }
}

function resetBillingForm() {
  currentSelectedBillItems = [];
  const checkAll = document.getElementById('checkAllBill');
  if (checkAll) checkAll.checked = false;
  document.querySelectorAll('.bill-item-check').forEach(cb => cb.checked = false);

  updateBillingSelectionSummary();
  loadBillingData();
}

function loadUnpaidSales() {
  loadBillingData();
}

// ==================== EDIT / CANCEL BILLING NOTE ====================
function openEditBillingModal() {
  const inputEl = document.getElementById('searchEditBillNoInput');
  if (inputEl) inputEl.value = '';

  const modalEl = document.getElementById('editBillingModal');
  if (modalEl) {
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
    searchBillingNotesForEdit();
  }
}

function formatBillCreatedAt(createdAt) {
  if (!createdAt) return '-';
  try {
    let dateObj = null;
    if (typeof createdAt.toDate === 'function') {
      dateObj = createdAt.toDate();
    } else if (createdAt.seconds) {
      dateObj = new Date(createdAt.seconds * 1000);
    } else {
      dateObj = new Date(createdAt);
    }

    if (isNaN(dateObj.getTime())) return String(createdAt);

    return dateObj.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return '-';
  }
}

async function searchBillingNotesForEdit() {
  const inputEl = document.getElementById('searchEditBillNoInput');
  const tbody = document.getElementById('editBillingTableBody');
  if (!tbody) return;

  const queryStr = inputEl ? inputEl.value.trim() : '';
  tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>กำลังค้นหาข้อมูล...</td></tr>`;

  try {
    const res = await searchBillingNotes(queryStr);

    if (!res || !res.success) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">เกิดข้อผิดพลาด: ${res ? res.message : 'ไม่สามารถดึงข้อมูลได้'}</td></tr>`;
      return;
    }

    const list = res.data || [];
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">ไม่พบข้อมูลใบวางบิลที่ค้นหา</td></tr>`;
      return;
    }

    let html = '';
    list.forEach(item => {
      const billNo = item.billNo || item.id || '-';
      const buyerName = item.buyerName || '-';
      const createdAtText = formatBillCreatedAt(item.createdAt);
      const grandTotal = parseFloat(item.grandTotal || 0).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      const saleNosArr = Array.isArray(item.saleNos) ? item.saleNos : [];
      const saleNosBadges = saleNosArr.length > 0
        ? saleNosArr.map(s => `<span class="badge bg-light text-dark border me-1 mb-1">${s}</span>`).join('')
        : '-';

      html += `
        <tr>
          <td class="text-center fw-bold text-primary">${billNo}</td>
          <td>${buyerName}</td>
          <td class="text-center small">${createdAtText}</td>
          <td class="text-end fw-bold text-success">${grandTotal}</td>
          <td>${saleNosBadges}</td>
          <td class="text-center">
            <button type="button" class="btn btn-sm btn-warning fw-bold text-dark" onclick="confirmEditBillingNote('${billNo}')">
              <i class="bi bi-pencil-fill me-1"></i> แก้ไข
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
  }
}

async function confirmEditBillingNote(billNo) {
  const confirmResult = await Swal.fire({
    title: `ยืนยันการแก้ไขใบวางบิล ${billNo}?`,
    html: `ระบบจะดำเนินการ:<br>
           1. ลบใบวางบิลเลขที่ <b>${billNo}</b> ออกจากระบบ<br>
           2. คืนสถานะรายการขายทั้งหมดในบิลนี้กลับเป็น <b>ยังไม่วางบิล</b> เพื่อให้คุณเลือกและออกใบวางบิลใหม่`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#f59e0b',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ยืนยันแก้ไข',
    cancelButtonText: 'ยกเลิก'
  });

  if (!confirmResult.isConfirmed) return;

  Swal.fire({
    title: 'กำลังอัปเดตข้อมูล...',
    text: 'กำลังลบใบวางบิลและคืนสถานะรายการขาย',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const res = await revertBillingNoteForEdit(billNo);

    if (res && res.success) {
      // ปิด Modal แก้ไขใบวางบิล
      const modalEl = document.getElementById('editBillingModal');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      await Swal.fire({
        title: 'ดำเนินการสำเร็จ!',
        text: res.message,
        icon: 'success'
      });

      // โหลดตารางรายการขายค้างวางบิลใหม่เพื่อให้รายการที่ถูกปลดล็อกแสดงขึ้นมาทันที
      await loadBillingData();
    } else {
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถแก้ไขใบวางบิลได้', 'error');
    }
  } catch (err) {
    Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
  }
}