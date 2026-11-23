// public/js/sale-record.js

let fp = null;
let rawSalesData = [];
let dataTableInstance = null;
let saleModalInstance = null;
let addBuyerModalInstance = null;
let isSubmittingSale = false; // 🔒 ตัวแปรล็อกป้องกันการกดบันทึกซ้ำซ้อน

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
  // 1. ผูก Event Submit ฟอร์มการขาย
  const salesForm = document.getElementById('salesForm');
  if (salesForm) {
    salesForm.removeEventListener('submit', handleSalesSubmit);
    salesForm.addEventListener('submit', handleSalesSubmit);
  }

  // 2. 🔒 ดักจับตอนปิด Modal (กดปุ่ม X หรือกดยกเลิก) ให้ล้างค่าฟอร์มและ editDocId ทันที
  const saleModalEl = document.getElementById('saleModal');
  if (saleModalEl && !saleModalEl.dataset.resetBound) {
    saleModalEl.addEventListener('hidden.bs.modal', function () {
      if (typeof resetForm === 'function') {
        resetForm();
      }
      const modalLabel = document.getElementById('saleModalLabel');
      if (modalLabel) {
        modalLabel.innerHTML = `<i class="bi bi-plus-circle me-2"></i>บันทึกข้อมูลการขาย`;
      }
    });
    saleModalEl.dataset.resetBound = 'true'; // ป้องกันการผูก Event ซ้ำ
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
      // 📝 บันทึก Log เพิ่มรายชื่อผู้ซื้อ
      if (typeof writeActivityLog === 'function') {
        await writeActivityLog({
          module: 'SALES',
          functionName: 'handleSaveBuyer',
          action: 'CREATE_BUYER',
          docId: res.id || '',
          refNo: nameVal,
          summary: `เพิ่มรายชื่อผู้ซื้อใหม่: ${nameVal}${fullnameVal ? ` (${fullnameVal})` : ''}`,
          afterData: payload
        });
      }

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
    if (typeof writeActivityLog === 'function') {
      await writeActivityLog({
        module: 'SALES',
        functionName: 'handleSaveBuyer',
        action: 'ERROR_CREATE_BUYER',
        refNo: nameVal,
        summary: `เพิ่มรายชื่อผู้ซื้อไม่สำเร็จ: ${err.message || err}`,
        afterData: payload
      });
    }
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
  // ✅ ป้องกันไม่ให้รันเลขที่เอกสารใหม่มาทับเลขเดิม หากกำลังอยู่ในโหมดแก้ไข
  const editDocId = document.getElementById('editDocId')?.value;
  if (editDocId) return;

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
  updateDisplayToBE(fp);

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

  // 🔒 1. ป้องกันการกดปุ่มซ้ำหรือกด Enter รัวๆ ขณะกำลังบันทึก
  if (isSubmittingSale) return;

  const saveBtn = document.getElementById('btnSaveRecord');
  const parseCleanNum = (elId) => {
    const el = document.getElementById(elId);
    if (!el || !el.value) return 0;
    const cleaned = String(el.value).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const isFuel = document.getElementById('itemTypeFuel') ? document.getElementById('itemTypeFuel').checked : true;
  const itemType = isFuel ? 'น้ำมัน' : 'อื่นๆ';
  const precisionMode = document.getElementById('decimalPrecision').value;

  const rawDate = document.getElementById('saleDate').value;
  const dateForDB = formatDateForDB(rawDate);

  const price = parseCleanNum('pricePerLiter');
  const liters = parseCleanNum('liters');

  const fuelItemName = document.getElementById('fuelItemName') ? document.getElementById('fuelItemName').value : '95';
  const otherItemName = document.getElementById('otherItemName') ? document.getElementById('otherItemName').value.trim() : '';
  const itemName = isFuel ? fuelItemName : otherItemName;

  const otherQty = parseCleanNum('otherQty');
  const otherUnitPrice = parseCleanNum('otherUnitPrice');

  // 🔍 2. ตรวจสอบความครบถ้วนของข้อมูลก่อนส่งบันทึก
  if (!dateForDB) {
    if (typeof Swal !== 'undefined') Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุวันที่ขายให้ถูกต้อง', 'warning');
    return;
  }
  if (!isFuel && !otherItemName) {
    if (typeof Swal !== 'undefined') Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อรายการสินค้า (ประเภทอื่นๆ)', 'warning');
    return;
  }

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

  const editDocId = (document.getElementById('editDocId')?.value || '').trim();
  const isUpdate = !!editDocId;
  const beforeItem = isUpdate ? (rawSalesData.find(x => x.id === editDocId) || null) : null;
  const actor = typeof getCurrentActor === 'function' ? getCurrentActor() : { username: 'system' };

  const payload = {
    docId: editDocId,
    saleNo: document.getElementById('saleNo').value.trim(),
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
    recordedBy: actor.username
  };

  // 🔒 ล็อกสถานะและปุ่มกดทันที
  isSubmittingSale = true;
  if (saveBtn) saveBtn.disabled = true;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await saveSaleRecord(payload);
    if (res && res.success) {
      const savedSaleNo = res.saleNo || payload.saleNo;
      const savedDocId = res.docId || editDocId || savedSaleNo;

      // 📝 บันทึก Log สร้างใหม่ / แก้ไขรายการขาย
      if (typeof writeActivityLog === 'function') {
        const qtyUnit = isFuel ? `${liters} ลิตร` : `${otherQty} หน่วย`;
        await writeActivityLog({
          module: 'SALES',
          functionName: 'handleSalesSubmit',
          action: isUpdate ? 'UPDATE_SALE' : 'CREATE_SALE',
          docId: savedDocId,
          refNo: savedSaleNo,
          summary: isUpdate
            ? `แก้ไขรายการขาย ${savedSaleNo} | ลูกค้า: ${payload.buyerName} | ${itemName} (${qtyUnit}) | ยอด ${finalTotal.toLocaleString('th-TH')} บาท (${paymentType})`
            : `บันทึกรายการขายใหม่ ${savedSaleNo} | ลูกค้า: ${payload.buyerName} | ${itemName} (${qtyUnit}) | ยอด ${finalTotal.toLocaleString('th-TH')} บาท (${paymentType})`,
          beforeData: beforeItem,
          afterData: { ...payload, saleNo: savedSaleNo, docId: savedDocId }
        });
      }

      closeSaleModal();
      resetForm();

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ!',
          text: `บันทึกข้อมูลรายการขายเลขที่ ${savedSaleNo} เรียบร้อยแล้ว`,
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#005f73'
        });
      }
      await loadSalesData();
    } else {
      if (typeof writeActivityLog === 'function') {
        await writeActivityLog({
          module: 'SALES',
          functionName: 'handleSalesSubmit',
          action: isUpdate ? 'ERROR_UPDATE_SALE' : 'ERROR_CREATE_SALE',
          docId: editDocId,
          refNo: payload.saleNo,
          summary: `บันทึกรายการขายไม่สำเร็จ (${payload.saleNo}): ${res ? res.message : 'ไม่ทราบสาเหตุ'}`,
          beforeData: beforeItem,
          afterData: payload
        });
      }
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
  } catch (err) {
    if (typeof writeActivityLog === 'function') {
      await writeActivityLog({
        module: 'SALES',
        functionName: 'handleSalesSubmit',
        action: isUpdate ? 'ERROR_UPDATE_SALE' : 'ERROR_CREATE_SALE',
        docId: editDocId,
        refNo: payload.saleNo,
        summary: `เกิดข้อผิดพลาดระบบตอนบันทึกรายการขาย (${payload.saleNo}): ${err.message || err}`,
        beforeData: beforeItem,
        afterData: payload
      });
    }
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
  } finally {
    // 🔓 ปลดล็อกปุ่มเสมอไม่ว่าจะบันทึกสำเร็จหรือเกิด Error
    isSubmittingSale = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ==================== TABLE & FETCH DATA ====================
async function loadSalesData() {
  initMonthYearFilters();

  const startDEl = document.getElementById('filterStartDay');
  const startMEl = document.getElementById('filterStartMonth');
  const startYEl = document.getElementById('filterStartYear');
  const endDEl = document.getElementById('filterEndDay');
  const endMEl = document.getElementById('filterEndMonth');
  const endYEl = document.getElementById('filterEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) return;

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const maxStartDays = new Date(startY, startM, 0).getDate();
  const startD = startDEl ? Math.min(parseInt(startDEl.value, 10) || 1, maxStartDays) : 1;

  const endM = parseInt(endMEl.value, 10);
  const endY = parseInt(endYEl.value, 10) - 543;
  const maxEndDays = new Date(endY, endM, 0).getDate();
  const endD = endDEl ? Math.min(parseInt(endDEl.value, 10) || maxEndDays, maxEndDays) : maxEndDays;

  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/${String(startD).padStart(2, '0')}`;
  const endDateStr = `${endY}/${String(endM).padStart(2, '0')}/${String(endD).padStart(2, '0')}`;

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
  // ✅ สร้างตัวเลือกวันที่ 1-30/31 เฉพาะครั้งแรกที่โหลดหน้า (ไม่รีเซ็ตทับค่าที่ผู้ใช้เลือกไว้ตอนกดค้นหา)
  const startDEl = document.getElementById('filterStartDay');
  if (startDEl && startDEl.options.length === 0) {
    updateFilterDayOptions(true);
  }
}

function updateFilterDayOptions(isInitial = false) {
  const startDEl = document.getElementById('filterStartDay');
  const startMEl = document.getElementById('filterStartMonth');
  const startYEl = document.getElementById('filterStartYear');

  const endDEl = document.getElementById('filterEndDay');
  const endMEl = document.getElementById('filterEndMonth');
  const endYEl = document.getElementById('filterEndYear');

  if (!startDEl || !startMEl || !startYEl || !endDEl || !endMEl || !endYEl) return;

  // 1. คำนวณจำนวนวันสูงสุดของเดือนเริ่มต้น
  const sMonth = parseInt(startMEl.value, 10) || (new Date().getMonth() + 1);
  const sYearAD = (parseInt(startYEl.value, 10) || (new Date().getFullYear() + 543)) - 543;
  const maxStartDays = new Date(sYearAD, sMonth, 0).getDate();
  const prevStartDay = parseInt(startDEl.value, 10) || 1;

  let startDayHtml = '';
  for (let d = 1; d <= maxStartDays; d++) {
    startDayHtml += `<option value="${d}">${d}</option>`;
  }
  startDEl.innerHTML = startDayHtml;
  startDEl.value = isInitial ? '1' : String(Math.min(prevStartDay, maxStartDays));

  // 2. คำนวณจำนวนวันสูงสุดของเดือนสิ้นสุด
  const eMonth = parseInt(endMEl.value, 10) || (new Date().getMonth() + 1);
  const eYearAD = (parseInt(endYEl.value, 10) || (new Date().getFullYear() + 543)) - 543;
  const maxEndDays = new Date(eYearAD, eMonth, 0).getDate();
  const prevEndDay = parseInt(endDEl.value, 10) || maxEndDays;

  let endDayHtml = '';
  for (let d = 1; d <= maxEndDays; d++) {
    endDayHtml += `<option value="${d}">${d}</option>`;
  }
  endDEl.innerHTML = endDayHtml;
  endDEl.value = isInitial ? String(maxEndDays) : String(Math.min(prevEndDay, maxEndDays));
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

  // 📝 บันทึก Log ว่ามีพนักงานกดเปิดหน้าต่างแก้ไขรายการนี้
  if (typeof writeActivityLog === 'function') {
    writeActivityLog({
      module: 'SALES',
      functionName: 'editRecord',
      action: 'OPEN_EDIT_SALE',
      docId: item.id,
      refNo: item.saleNo || item.id,
      summary: `เปิดหน้าต่างแก้ไขรายการขาย ${item.saleNo || item.id} (ลูกค้า: ${item.buyerName || '-'})`,
      beforeData: item
    });
  }

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
        // ✅ เปลี่ยนจาก true เป็น false เพื่อไม่ให้กระตุ้น onChange ตอนโหลดข้อมูลเดิม
        fp.setDate(new Date(y, m, d), false);
        updateDisplayToBE(fp);
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

  const targetItem = rawSalesData.find(x => x.id === id) || null;
  const targetSaleNo = targetItem ? (targetItem.saleNo || id) : id;

  Swal.fire({
    title: 'ยืนยันการลบ?',
    text: `เมื่อลบรายการ ${targetSaleNo} แล้วจะไม่สามารถกู้คืนได้`,
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
          // 📝 บันทึก Log การลบรายการขาย พร้อมข้อมูลเดิมก่อนถูกลบ
          if (typeof writeActivityLog === 'function') {
            await writeActivityLog({
              module: 'SALES',
              functionName: 'deleteRecord',
              action: 'DELETE_SALE',
              docId: id,
              refNo: targetSaleNo,
              summary: targetItem
                ? `ลบรายการขาย ${targetSaleNo} | ลูกค้า: ${targetItem.buyerName} | ${targetItem.itemName} | ยอด ${Number(targetItem.totalAmount || 0).toLocaleString('th-TH')} บาท`
                : `ลบรายการขาย ID: ${id}`,
              beforeData: targetItem
            });
          }

          Swal.fire('สำเร็จ', 'ลบรายการเรียบร้อยแล้ว', 'success');
          await loadSalesData();
        } else {
          if (typeof writeActivityLog === 'function') {
            await writeActivityLog({
              module: 'SALES',
              functionName: 'deleteRecord',
              action: 'ERROR_DELETE_SALE',
              docId: id,
              refNo: targetSaleNo,
              summary: `ลบรายการขาย ${targetSaleNo} ไม่สำเร็จ: ${res.message}`,
              beforeData: targetItem
            });
          }
          Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
      } catch (err) {
        if (typeof writeActivityLog === 'function') {
          await writeActivityLog({
            module: 'SALES',
            functionName: 'deleteRecord',
            action: 'ERROR_DELETE_SALE',
            docId: id,
            refNo: targetSaleNo,
            summary: `เกิดข้อผิดพลาดระบบตอนลบรายการขาย ${targetSaleNo}: ${err.message || err}`,
            beforeData: targetItem
          });
        }
        Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
      }
    }
  });
}