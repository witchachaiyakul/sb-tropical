// public/js/sale-record.js

let fp = null;
let rawSalesData = [];
let dataTableInstance = null;
let saleModalInstance = null;
let addBuyerModalInstance = null;

document.addEventListener('DOMContentLoaded', function () {
  initFlatpickr();
  initSalesModuleEvents();
  loadBuyers();
  loadSalesData();
});

// ==================== POPUP CONTROL ====================
function openSaleModal() {
  resetForm();
  
  const modalEl = document.getElementById('saleModal');
  if (modalEl) {
    if (!saleModalInstance) {
      saleModalInstance = new bootstrap.Modal(modalEl);
    }
    document.getElementById('saleModalLabel').innerHTML = `<i class="bi bi-cart-plus-fill me-2"></i>บันทึกรายการขาย`;
    saleModalInstance.show();
  }
}

function closeSaleModal() {
  if (saleModalInstance) {
    saleModalInstance.hide();
  }
}

// ==================== FLATPICKR DATEPICKER ====================
function initFlatpickr() {
  const saleDateEl = document.getElementById('saleDate');
  if (saleDateEl && typeof flatpickr !== 'undefined') {
    fp = flatpickr("#saleDate", {
      dateFormat: "d/m/Y",
      defaultDate: new Date(),
      disableMobile: true,
      onReady: function (selectedDates, dateStr, instance) {
        updateDisplayToBE(instance);
      },
      onChange: function (selectedDates, dateStr, instance) {
        updateDisplayToBE(instance);
        updateSaleNoPreview();
      }
    });

    const btnCal = document.getElementById('btnCalendar');
    if (btnCal) {
      btnCal.addEventListener('click', function () {
        if (fp) fp.open();
      });
    }
  } else if (saleDateEl) {
    saleDateEl.value = getTodayBE();
  }
}

function updateDisplayToBE(instance) {
  if (instance && instance.selectedDates && instance.selectedDates.length > 0) {
    const d = instance.selectedDates[0];
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const yearBE = d.getFullYear() + 543;
    instance.input.value = `${day}/${month}/${yearBE}`;
  }
}

function initSalesModuleEvents() {
  const salesForm = document.getElementById('salesForm');
  if (salesForm) {
    salesForm.removeEventListener('submit', handleSalesSubmit);
    salesForm.addEventListener('submit', handleSalesSubmit);
  }
}

// ==================== BUYERS SYSTEM ====================
async function loadBuyers() {
  try {
    const res = await getBuyers();
    if (res.success && res.data) {
      const datalist = document.getElementById('buyerList');
      if (!datalist) return;
      datalist.innerHTML = '';
      res.data.forEach(buyer => {
        if (buyer.name) {
          const option = document.createElement('option');
          option.value = buyer.name;
          if (buyer.fullname && buyer.fullname !== buyer.name) {
            option.label = buyer.fullname;
          }
          datalist.appendChild(option);
        }
      });
    }
  } catch (err) {
    console.error("Error loading buyers:", err);
  }
}

function openAddBuyerModal() {
  const form = document.getElementById('addBuyerForm');
  if (form) form.reset();

  const modalEl = document.getElementById('addBuyerModal');
  if (modalEl) {
    if (!addBuyerModalInstance) {
      addBuyerModalInstance = new bootstrap.Modal(modalEl);
    }
    addBuyerModalInstance.show();
  }
}

async function handleSaveBuyer(e) {
  e.preventDefault();
  const nameVal = document.getElementById('modalBuyerName').value.trim();
  const fullnameVal = document.getElementById('modalBuyerFullname').value.trim();
  const taxIdVal = document.getElementById('modalBuyerTaxId').value.trim();
  const addressVal = document.getElementById('modalBuyerAddress').value.trim();

  const payload = {
    name: nameVal,
    fullname: fullnameVal,
    taxid: taxIdVal,
    address: addressVal
  };

  if (typeof Swal !== 'undefined') Swal.fire({ title: 'กำลังบันทึกผู้ซื้อ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const res = await saveBuyerRecord(payload);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res.success) {
      if (addBuyerModalInstance) addBuyerModalInstance.hide();
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'เพิ่มผู้ซื้อสำเร็จ!',
          text: 'รายชื่อผู้ซื้อถูกเพิ่มลงระบบเรียบร้อยแล้ว',
          confirmButtonColor: '#005f73'
        });
      }
      await loadBuyers();
      const buyerInput = document.getElementById('buyerName');
      if (buyerInput) buyerInput.value = nameVal;
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
  }
}

// ==================== FORM & CALCULATION LOGIC ====================
function toggleItemType() {
  const isFuel = document.getElementById('itemTypeFuel') ? document.getElementById('itemTypeFuel').checked : true;

  if (document.getElementById('fuelNameCol')) document.getElementById('fuelNameCol').style.display = isFuel ? 'block' : 'none';
  if (document.getElementById('fuelPriceCol')) document.getElementById('fuelPriceCol').style.display = isFuel ? 'block' : 'none';
  if (document.getElementById('fuelQtyCol')) document.getElementById('fuelQtyCol').style.display = isFuel ? 'block' : 'none';

  if (document.getElementById('pricePerLiter')) document.getElementById('pricePerLiter').required = isFuel;
  if (document.getElementById('liters')) document.getElementById('liters').required = isFuel;

  if (document.getElementById('otherNameCol')) document.getElementById('otherNameCol').style.display = isFuel ? 'none' : 'block';
  if (document.getElementById('otherQtyCol')) document.getElementById('otherQtyCol').style.display = isFuel ? 'none' : 'block';
  if (document.getElementById('otherUnitPriceCol')) document.getElementById('otherUnitPriceCol').style.display = isFuel ? 'none' : 'block';

  if (document.getElementById('otherItemName')) document.getElementById('otherItemName').required = !isFuel;
  if (document.getElementById('otherQty')) document.getElementById('otherQty').required = !isFuel;
  if (document.getElementById('otherUnitPrice')) document.getElementById('otherUnitPrice').required = !isFuel;

  calculateTotal();
}

function calculateTotal() {
  const isFuel = document.getElementById('itemTypeFuel') ? document.getElementById('itemTypeFuel').checked : true;
  const precisionMode = document.getElementById('decimalPrecision') ? document.getElementById('decimalPrecision').value : '2';
  let rawTotal = 0;

  if (isFuel) {
    const price = parseFloat(document.getElementById('pricePerLiter').value) || 0;
    const liters = parseFloat(document.getElementById('liters').value) || 0;
    rawTotal = price * liters;
  } else {
    const qty = parseFloat(document.getElementById('otherQty').value) || 0;
    const unitPrice = parseFloat(document.getElementById('otherUnitPrice').value) || 0;
    rawTotal = qty * unitPrice;
  }

  let finalTotal = rawTotal;
  let displayPrecision = 2;

  if (precisionMode === '0') {
    finalTotal = Math.ceil(rawTotal);
    displayPrecision = 0;
  } else if (precisionMode === 'floor') {
    finalTotal = Math.floor(rawTotal);
    displayPrecision = 0;
  } else {
    finalTotal = parseFloat(rawTotal.toFixed(2));
    displayPrecision = 2;
  }

  if (document.getElementById('totalAmount')) document.getElementById('totalAmount').value = finalTotal;
  if (document.getElementById('totalAmountDisplay')) {
    document.getElementById('totalAmountDisplay').innerText = finalTotal.toLocaleString('th-TH', {
      minimumFractionDigits: displayPrecision,
      maximumFractionDigits: displayPrecision
    }) + ' บาท';
  }
}

async function updateSaleNoPreview() {
  const dateEl = document.getElementById('saleDate');
  const rawDate = dateEl ? dateEl.value : '';
  const dateForDB = formatDateForDB(rawDate) || new Date().toISOString().split('T')[0];

  try {
    const res = await getNextSaleNo(dateForDB);
    if (res && res.success && res.saleNo) {
      const saleNoEl = document.getElementById('saleNo');
      if (saleNoEl) saleNoEl.value = res.saleNo;
    }
  } catch (err) {
    console.error("Error updating SaleNo preview:", err);
  }
}

function resetForm() {
  const form = document.getElementById('salesForm');
  if (form) form.reset();

  if (document.getElementById('editDocId')) document.getElementById('editDocId').value = '';

  if (fp) fp.setDate(new Date(), false);

  if (document.getElementById('fuelItemName')) document.getElementById('fuelItemName').value = '95';
  if (document.getElementById('itemTypeFuel')) document.getElementById('itemTypeFuel').checked = true;
  if (document.getElementById('payCash')) document.getElementById('payCash').checked = true;
  if (document.getElementById('btnSaveRecord')) {
    document.getElementById('btnSaveRecord').innerHTML = `<i class="bi bi-save me-1"></i> บันทึกข้อมูลการขาย`;
  }
  if (document.getElementById('decimalPrecision')) document.getElementById('decimalPrecision').value = '2';

  toggleItemType();
  updateSaleNoPreview();
}

async function handleSalesSubmit(e) {
  e.preventDefault();
  const isFuel = document.getElementById('itemTypeFuel') ? document.getElementById('itemTypeFuel').checked : true;
  const itemType = isFuel ? 'น้ำมัน' : 'อื่นๆ';
  const precisionMode = document.getElementById('decimalPrecision').value;

  const rawDate = document.getElementById('saleDate').value;
  const dateForDB = formatDateForDB(rawDate);

  const price = parseFloat(document.getElementById('pricePerLiter').value) || 0;
  const liters = parseFloat(document.getElementById('liters').value) || 0;

  const fuelItemName = document.getElementById('fuelItemName') ? document.getElementById('fuelItemName').value : '95';
  const otherItemName = document.getElementById('otherItemName') ? document.getElementById('otherItemName').value.trim() : '';
  const itemName = isFuel ? fuelItemName : otherItemName;

  const otherQty = document.getElementById('otherQty') ? (parseFloat(document.getElementById('otherQty').value) || 0) : 0;
  const otherUnitPrice = document.getElementById('otherUnitPrice') ? (parseFloat(document.getElementById('otherUnitPrice').value) || 0) : 0;

  const rawTotal = isFuel ? (price * liters) : (otherQty * otherUnitPrice);
  let finalTotal = rawTotal;
  let precisionVal = 2;

  if (precisionMode === '0') {
    finalTotal = Math.ceil(rawTotal);
    precisionVal = 0;
  } else if (precisionMode === 'floor') {
    finalTotal = Math.floor(rawTotal);
    precisionVal = 0;
  } else {
    finalTotal = parseFloat(rawTotal.toFixed(2));
    precisionVal = 2;
  }

  const selectedPayRadio = document.querySelector('input[name="paymentType"]:checked');
  const paymentType = selectedPayRadio ? selectedPayRadio.value : 'เงินสด';

  const payload = {
    docId: document.getElementById('editDocId').value,
    saleNo: document.getElementById('saleNo').value,
    date: dateForDB,
    buyerName: document.getElementById('buyerName').value.trim(),
    itemType: itemType,
    itemName: itemName,
    pricePerLiter: isFuel ? price : 0,
    liters: isFuel ? liters : 0,
    qty: isFuel ? liters : otherQty,
    unitPrice: isFuel ? price : otherUnitPrice,
    precision: precisionVal,
    totalAmount: finalTotal,
    paymentType: paymentType,
    remarks: document.getElementById('remarks').value.trim(),
    recordedBy: window.currentUser ? window.currentUser.username : 'system'
  };

  if (typeof Swal !== 'undefined') Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const res = await saveSaleRecord(payload);
    if (res.success) {
      closeSaleModal(); // ซ่อน Modal เมื่อบันทึกสำเร็จ
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ!',
          text: 'ข้อมูลรายการขายถูกบันทึกลงระบบเรียบร้อยแล้ว',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#005f73'
        });
      }
      resetForm();
      await loadSalesData();
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res.message, 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
  }
}

// ==================== TABLE & FETCH DATA ====================
async function loadSalesData() {
  initMonthYearFilters();

  const startMEl = document.getElementById('filterStartMonth');
  const startYEl = document.getElementById('filterStartYear');
  const endMEl = document.getElementById('filterEndMonth');
  const endYEl = document.getElementById('filterEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) return;

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const endM = parseInt(endMEl.value, 10);
  const endY = parseInt(endYEl.value, 10) - 543;

  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/01`;
  const lastDayOfEndMonth = new Date(endY, endM, 0).getDate();
  const endDateStr = `${endY}/${String(endM).padStart(2, '0')}/${String(lastDayOfEndMonth).padStart(2, '0')}`;

  if (typeof Swal !== 'undefined') Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const res = await getSalesRecordsRange(startDateStr, endDateStr, 3000);
    if (typeof Swal !== 'undefined') Swal.close();
    if (res && res.success) {
      rawSalesData = res.data || [];
      filterData();
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.toString(), 'error');
  }
}

function filterData() {
  const typeSelect = document.getElementById('filterPaymentType');
  const type = typeSelect ? typeSelect.value : 'ALL';
  let filtered = rawSalesData;
  if (type !== 'ALL') {
    filtered = rawSalesData.filter(x => x.paymentType === type);
  }
  renderTable(filtered);
}

function initMonthYearFilters() {
  if (typeof setupMonthYearDropdowns === 'function') {
    setupMonthYearDropdowns('filterStartMonth', 'filterStartYear', 'filterEndMonth', 'filterEndYear');
  }
}

function loadSalesDataByMonthRange() {
  loadSalesData();
}

function renderTable(data) {
  if (dataTableInstance) {
    dataTableInstance.destroy();
    dataTableInstance = null;
  }

  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach(item => {
    const precision = (item.precision !== undefined && item.precision !== null) ? Number(item.precision) : 2;
    const badgeClass = item.paymentType === 'เงินสด' ? 'badge-cash' : 'badge-credit';

    const isOther = item.itemType === 'อื่นๆ';
    const displayUnitPrice = isOther ? (item.unitPrice || 0) : (item.pricePerLiter || 0);
    const displayQty = isOther ? (item.qty || 0) : (item.liters || 0);

    const displayItemName = item.itemName || (isOther ? 'อื่นๆ' : '95');
    const itemLabel = `<br><small class="text-primary fw-normal">(${displayItemName})</small>`;

    const unitPriceNum = parseFloat(displayUnitPrice) || 0;
    const qtyNum = parseFloat(displayQty) || 0;
    const totalNum = parseFloat(item.totalAmount) || 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold text-secondary small">${item.saleNo || '-'}</td>
      <td>${formatDateThai(item.date)}</td>
      <td class="fw-bold">${item.buyerName || '-'}${itemLabel}</td>
      <td class="text-end">${unitPriceNum.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="text-end fw-bold text-info">${qtyNum.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="text-end fw-bold text-success">${totalNum.toLocaleString('th-TH', { minimumFractionDigits: precision, maximumFractionDigits: precision })}</td>
      <td class="text-center"><span class="${badgeClass}">${item.paymentType || 'เงินสด'}</span></td>
      <td class="small text-muted">${item.remarks || '-'}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editRecord('${item.id}')" title="แก้ไข"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteRecord('${item.id}')" title="ลบ"><i class="bi bi-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (typeof $ !== 'undefined' && $.fn.DataTable) {
    dataTableInstance = $('#salesTable').DataTable({
      language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' },
      order: [[1, 'desc']],
      pageLength: 10
    });
  }
}

// ==================== HELPER FUNCTIONS ====================
function getTodayBE() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const yearBE = now.getFullYear() + 543;
  return `${day}/${month}/${yearBE}`;
}

function formatDateThai(dateStr) {
  if (!dateStr) return "-";
  let str = String(dateStr).trim();
  let parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let year, month, day;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parts[1].padStart(2, '0');
      day = parts[2].padStart(2, '0');
    } else {
      day = parts[0].padStart(2, '0');
      month = parts[1].padStart(2, '0');
      year = parseInt(parts[2], 10);
    }
    if (year < 2400) year += 543;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

function formatDateForDB(dateStr) {
  if (!dateStr) return "";
  let str = String(dateStr).trim();
  let parts = str.split(/[\/\-]/);
  if (parts.length === 3) {
    let year, month, day;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parts[1].padStart(2, '0');
      day = parts[2].padStart(2, '0');
    } else {
      day = parts[0].padStart(2, '0');
      month = parts[1].padStart(2, '0');
      year = parseInt(parts[2], 10);
    }
    if (year > 2400) year -= 543;
    return `${year}/${month}/${day}`;
  }
  return dateStr;
}

function editRecord(id) {
  const item = rawSalesData.find(x => x.id === id);
  if (!item) return;

  document.getElementById('editDocId').value = item.id;
  document.getElementById('saleNo').value = item.saleNo || '';

  if (item.date) {
    let parts = String(item.date).trim().split(/[\/\-]/);
    if (parts.length === 3) {
      let y, m, d;
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10) - 1;
        d = parseInt(parts[2], 10);
      } else {
        d = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10) - 1;
        y = parseInt(parts[2], 10);
      }
      if (y > 2400) y -= 543;
      if (typeof fp !== 'undefined' && fp) {
        fp.setDate(new Date(y, m, d), true);
      } else {
        document.getElementById('saleDate').value = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y + 543}`;
      }
    }
  }

  document.getElementById('buyerName').value = item.buyerName || '';

  const isOther = item.itemType === 'อื่นๆ';
  if (isOther) {
    if (document.getElementById('itemTypeOther')) document.getElementById('itemTypeOther').checked = true;
  } else {
    if (document.getElementById('itemTypeFuel')) document.getElementById('itemTypeFuel').checked = true;
  }
  toggleItemType();

  if (isOther) {
    if (document.getElementById('otherItemName')) document.getElementById('otherItemName').value = item.itemName || '';
    if (document.getElementById('otherQty')) document.getElementById('otherQty').value = item.qty || item.liters || '';
    if (document.getElementById('otherUnitPrice')) document.getElementById('otherUnitPrice').value = item.unitPrice || item.pricePerLiter || '';
  } else {
    const fuelSelect = document.getElementById('fuelItemName');
    if (fuelSelect) {
      let rawFuelName = item.itemName ? String(item.itemName).trim() : '95';
      if (rawFuelName === 'น้ำมัน' || !rawFuelName) rawFuelName = '95';
      fuelSelect.value = rawFuelName;
      if (!fuelSelect.value) fuelSelect.value = '95';
    }

    if (document.getElementById('pricePerLiter')) document.getElementById('pricePerLiter').value = item.pricePerLiter || '';
    if (document.getElementById('liters')) document.getElementById('liters').value = item.liters || '';
  }

  document.getElementById('decimalPrecision').value = item.precision === 0 ? '0' : (item.precision === 'floor' ? 'floor' : '2');
  document.getElementById('remarks').value = item.remarks || '';

  if (item.paymentType === 'เงินสด') {
    if (document.getElementById('payCash')) document.getElementById('payCash').checked = true;
  } else {
    if (document.getElementById('payCredit')) document.getElementById('payCredit').checked = true;
  }

  calculateTotal();
  if (document.getElementById('btnSaveRecord')) {
    document.getElementById('btnSaveRecord').innerHTML = `<i class="bi bi-pencil-square me-1"></i> อัปเดตข้อมูลการขาย`;
  }

  // เปิด Modal แก้ไข
  const modalEl = document.getElementById('saleModal');
  if (modalEl) {
    if (!saleModalInstance) {
      saleModalInstance = new bootstrap.Modal(modalEl);
    }
    document.getElementById('saleModalLabel').innerHTML = `<i class="bi bi-pencil-square me-2"></i>แก้ไขรายการขาย (${item.saleNo})`;
    saleModalInstance.show();
  }
}

function deleteRecord(id) {
  if (typeof Swal === 'undefined') return;

  Swal.fire({
    title: 'ยืนยันการลบ?',
    text: 'เมื่อลบแล้วจะไม่สามารถกู้คืนรายการนี้ได้',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'ลบข้อมูล',
    cancelButtonText: 'ยกเลิก'
  }).then(async (result) => {
    if (result.isConfirmed) {
      Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const res = await deleteSaleRecord(id);
        if (res.success) {
          Swal.fire('สำเร็จ', 'ลบรายการเรียบร้อยแล้ว', 'success');
          await loadSalesData();
        } else {
          Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
      } catch (err) {
        Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
      }
    }
  });
}