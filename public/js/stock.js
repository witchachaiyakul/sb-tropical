// public/js/stock.js

let stockFp = null;
let currentOilStockData = {
  stock95: {},
  stockDiesel: {}
};

document.addEventListener('DOMContentLoaded', function () {
  initStockDatePicker();
  loadOilStockData();
});

// 1. เริ่มต้นใช้งาน Flatpickr Datepicker (พ.ศ.)
function initStockDatePicker() {
  if (!stockFp && document.getElementById('filterStockDate')) {
    stockFp = flatpickr("#filterStockDate", {
      locale: "th",
      dateFormat: "d/m/Y",
      defaultDate: new Date(),
      disableMobile: true,
      onReady: function (selectedDates, dateStr, instance) {
        updateStockDisplayToBE(instance);
      },
      onChange: function (selectedDates, dateStr, instance) {
        updateStockDisplayToBE(instance);
        console.log("📅 [Client] Flatpickr date changed:", instance.input.value);
        loadOilStockData();
      }
    });

    const btnCal = document.getElementById('btnStockCalendar');
    if (btnCal) {
      btnCal.addEventListener('click', function () {
        if (stockFp) stockFp.open();
      });
    }
  }
}

function updateStockDisplayToBE(instance) {
  if (instance && instance.selectedDates && instance.selectedDates.length > 0) {
    const d = instance.selectedDates[0];
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const yearBE = d.getFullYear() + 543;
    instance.input.value = `${day}/${month}/${yearBE}`;
  }
}

// 2. ดึงข้อมูลสต็อกน้ำมันตามวันที่เลือก
async function loadOilStockData() {
  initStockDatePicker();

  let selectedDateStr = "";
  if (stockFp && stockFp.selectedDates && stockFp.selectedDates.length > 0) {
    const d = stockFp.selectedDates[0];
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear(); // ค.ศ.
    selectedDateStr = `${year}/${month}/${day}`;
  } else {
    const filterInput = document.getElementById('filterStockDate');
    selectedDateStr = filterInput ? filterInput.value : '';
  }

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'กำลังคำนวณสต็อกน้ำมัน...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    const res = await getOilStockData(selectedDateStr);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      currentOilStockData.stock95 = res.stock95 || {};
      currentOilStockData.stockDiesel = res.stockDiesel || {};

      renderOilStockCards(res.stock95, res.stockDiesel, selectedDateStr);
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถโหลดข้อมูลสต็อกได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.toString(), 'error');
  }
}

// 3. ฟังก์ชันอัปเดตการ์ดแสดงผลบนหน้าจอ
function renderOilStockCards(s95, sDiesel, dateVal) {
  const statusLabel = document.getElementById('stockFilterDateStatus');

  const fmtNum = (num) => {
    const n = parseFloat(num) || 0;
    return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = parseFloat(val) || 0;
  };

  s95 = s95 || { initialStock: 0, totalIn: 0, totalOut: 0, cashSales: 0, currentStock: 0 };
  sDiesel = sDiesel || { initialStock: 0, totalIn: 0, totalOut: 0, cashSales: 0, currentStock: 0 };

  setVal('inputInitial95', s95.initialStock);
  setVal('inputInitialDiesel', sDiesel.initialStock);

  if (statusLabel && dateVal) {
    let cleanDate = String(dateVal).trim().replace(/-/g, '/');
    let parts = cleanDate.split('/');
    if (parts.length === 3) {
      let day, month, yearBE;
      if (parts[0].length === 4) {
        yearBE = parseInt(parts[0], 10);
        if (yearBE < 2400) yearBE += 543;
        month = parts[1].padStart(2, '0');
        day = parts[2].padStart(2, '0');
      } else {
        day = parts[0].padStart(2, '0');
        month = parts[1].padStart(2, '0');
        yearBE = parseInt(parts[2], 10);
        if (yearBE < 2400) yearBE += 543;
      }
      statusLabel.innerText = 'แสดงผล ณ วันที่: ' + day + '/' + month + '/' + yearBE;
    }
  }

  // ⛽ เบนซิน 95
  setTxt('stock95Initial', fmtNum(s95.initialStock));
  setTxt('stock95In', fmtNum(s95.totalIn));
  setTxt('stock95Out', fmtNum(s95.totalOut));
  setTxt('stock95Current', fmtNum(s95.currentStock) + ' ลิตร');
  setTxt('stock95CashSales', fmtNum(s95.cashSales) + ' บาท');
  setTxt('badge95Stock', 'คงเหลือ ณ สิ้นวัน ' + fmtNum(s95.currentStock) + ' ลิตร');

  // ⛽ ดีเซล
  setTxt('stockDieselInitial', fmtNum(sDiesel.initialStock));
  setTxt('stockDieselIn', fmtNum(sDiesel.totalIn));
  setTxt('stockDieselOut', fmtNum(sDiesel.totalOut));
  setTxt('stockDieselCurrent', fmtNum(sDiesel.currentStock) + ' ลิตร');
  setTxt('stockDieselCashSales', fmtNum(sDiesel.cashSales) + ' บาท');
  setTxt('badgeDieselStock', 'คงเหลือ ณ สิ้นวัน ' + fmtNum(sDiesel.currentStock) + ' ลิตร');
}

// 4. เปิด Modal ตั้งค่าสต็อกตั้งต้น
function openSetInitialStockModal() {
  const init95 = currentOilStockData.stock95 ? currentOilStockData.stock95.initialStock : 0;
  const initDiesel = currentOilStockData.stockDiesel ? currentOilStockData.stockDiesel.initialStock : 0;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = parseFloat(val) || 0;
  };

  setVal('inputInitial95', init95);
  setVal('inputInitialDiesel', initDiesel);

  const modalEl = document.getElementById('setInitialStockModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

// 5. บันทึกสต็อกตั้งต้นไปที่ Firestore
async function saveInitialOilStock() {
  const init95 = parseFloat(document.getElementById('inputInitial95').value) || 0;
  const initDiesel = parseFloat(document.getElementById('inputInitialDiesel').value) || 0;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกสต็อกตั้งต้น...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await setInitialOilStock(init95, initDiesel);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      const modalEl = document.getElementById('setInitialStockModal');
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      if (typeof Swal !== 'undefined') {
        Swal.fire('บันทึกสำเร็จ', 'อัปเดตสต็อกตั้งต้นเรียบร้อยแล้ว', 'success').then(() => {
          loadOilStockData();
        });
      }
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.toString(), 'error');
  }
}