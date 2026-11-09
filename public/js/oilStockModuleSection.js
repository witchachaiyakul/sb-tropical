function initStockDatePicker() {
  if (!stockFp && document.getElementById('filterStockDate')) {
    stockFp = flatpickr("#filterStockDate", {
      locale: "th",
      dateFormat: "d/m/Y",
      defaultDate: new Date(),
      disableMobile: "true",
      onChange: function(selectedDates, dateStr, instance) {
        console.log("📅 [Client] Flatpickr date changed:", dateStr);
        loadOilStockData();
      }
    });

    const btnCal = document.getElementById('btnStockCalendar');
    if (btnCal) {
      btnCal.addEventListener('click', function() {
        if (stockFp) stockFp.open();
      });
    }
  }
}

// 2. ดึงข้อมูลสต็อกน้ำมันจาก Server ตามวันที่เลือก
function loadOilStockData() {
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

  console.log("🔍 [Client] Sending Date to Server:", selectedDateStr);

  if (typeof Swal !== 'undefined') {
    Swal.fire({ 
      title: 'กำลังคำนวณสต็อกน้ำมัน...', 
      allowOutsideClick: false, 
      didOpen: () => Swal.showLoading() 
    });
  }

  backend.run
    .withSuccessHandler(function(res) {
      console.log("📥 [Client] Received Response from Server:", res);
      if (typeof Swal !== 'undefined') Swal.close();

      if (res && res.success) {
        currentOilStockData.stock95 = res.stock95 || {};
        currentOilStockData.stockDiesel = res.stockDiesel || {};

        console.log("⛽ Stock 95 Summary:", res.stock95);
        console.log("⛽ Stock Diesel Summary:", res.stockDiesel);

        renderOilStockCards(res.stock95, res.stockDiesel, selectedDateStr);
      } else {
        console.error("❌ [Client] Server returned error:", res ? res.message : "Unknown error");
        if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถโหลดข้อมูลสต็อกได้', 'error');
      }
    })
    .withFailureHandler(function(err) {
      console.error("💥 [Client] backend.run Failed:", err);
      if (typeof Swal !== 'undefined') Swal.close();
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    })
    .getOilStockData(selectedDateStr);
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
  setTxt('stock95CashSales', fmtNum(s95.cashSales) + ' บาท'); // 🟢 เพิ่มหยอดค่ายอดขายเงินสด
  setTxt('badge95Stock', 'คงเหลือ ณ สิ้นวัน ' + fmtNum(s95.currentStock) + ' ลิตร');

  // ⛽ ดีเซล
  setTxt('stockDieselInitial', fmtNum(sDiesel.initialStock));
  setTxt('stockDieselIn', fmtNum(sDiesel.totalIn));
  setTxt('stockDieselOut', fmtNum(sDiesel.totalOut));
  setTxt('stockDieselCurrent', fmtNum(sDiesel.currentStock) + ' ลิตร');
  setTxt('stockDieselCashSales', fmtNum(sDiesel.cashSales) + ' บาท'); // 🟢 เพิ่มหยอดค่ายอดขายเงินสด
  setTxt('badgeDieselStock', 'คงเหลือ ณ สิ้นวัน ' + fmtNum(sDiesel.currentStock) + ' ลิตร');
}

// 3. เปิด Modal ตั้งค่าสต็อกตั้งต้น
function openSetInitialStockModal() {
  const init95 = currentOilStockData.stock95 ? currentOilStockData.stock95.initialStock : 0;
  const initDiesel = currentOilStockData.stockDiesel ? currentOilStockData.stockDiesel.initialStock : 0;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = parseFloat(val) || 0;
  };

  // ดึงสต็อกตั้งต้นจากตัวแปรสคริปต์ไปใส่ช่อง Input ก่อนเปิด Modal
  setVal('inputInitial95', init95);
  setVal('inputInitialDiesel', initDiesel);

  const modalEl = document.getElementById('setInitialStockModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

// 4. บันทึกสต็อกตั้งต้นไปที่ Firestore
function saveInitialOilStock() {
  const init95 = parseFloat(document.getElementById('inputInitial95').value) || 0;
  const initDiesel = parseFloat(document.getElementById('inputInitialDiesel').value) || 0;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกสต็อกตั้งต้น...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  backend.run
    .withSuccessHandler(function(res) {
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
    })
    .withFailureHandler(function(err) {
      if (typeof Swal !== 'undefined') Swal.close();
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    })
    .setInitialOilStock(init95, initDiesel);
}
// บันทึกการจ่ายเงินของลูกค้า และบันทึกการโอนค่าใช้จ่าย
// บันทึกการจ่ายเงินของลูกค้า และบันทึกการโอนค่าใช้จ่าย
// บันทึกการจ่ายเงินของลูกค้า และบันทึกการโอนค่าใช้จ่าย
// บันทึกการจ่ายเงินของลูกค้า และบันทึกการโอนค่าใช้จ่าย
// บันทึกการจ่ายเงินของลูกค้า และบันทึกการโอนค่าใช้จ่าย
