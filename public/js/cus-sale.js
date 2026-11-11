// public/js/cus-sale.js

// ตัวแปรสำหรับ Cache ข้อมูลและจัดการสถานะจัดเรียง
let rawCustomerSalesReportData = [];
let currentCusSortColumn = '';
let isCusSortAsc = true;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('customerSalesReportTableBody')) {
    loadCustomerSalesReport();
  }
});

/**
 * 🟢 โหลดข้อมูลรายงานยอดขายตามลูกค้า
 */
async function loadCustomerSalesReport() {
  const tbody = document.getElementById('customerSalesReportTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center text-muted py-4">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        กำลังโหลดข้อมูลรายงานยอดขายลูกค้า...
      </td>
    </tr>
  `;

  try {
    const res = await getCustomerSalesReportFromFirestore();

    if (!res || !res.success || !res.data) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${res ? res.message : 'ไม่พบข้อมูลลูกค้า หรือดึงข้อมูลไม่สำเร็จ'}</td></tr>`;
      return;
    }

    // แปลงโครงสร้างข้อมูลเก็บเข้า Cache
    rawCustomerSalesReportData = res.data.map(b => {
      const summary = b.salesSummary || {};
      const s95 = summary['95'] || { totalLiters: 0, totalAmount: 0 };
      const sDiesel = summary['diesel'] || { totalLiters: 0, totalAmount: 0 };

      const l95 = parseFloat(s95.totalLiters || 0);
      const a95 = parseFloat(s95.totalAmount || 0);
      const lDiesel = parseFloat(sDiesel.totalLiters || 0);
      const aDiesel = parseFloat(sDiesel.totalAmount || 0);
      const totalAmount = a95 + aDiesel;

      return {
        id: b.id,
        name: b.name || b.fullname || 'ไม่ระบุชื่อ',
        fullname: b.fullname || '',
        l95: l95,
        a95: a95,
        lDiesel: lDiesel,
        aDiesel: aDiesel,
        totalAmount: totalAmount
      };
    }).filter(b => b.l95 > 0 || b.lDiesel > 0 || b.totalAmount > 0);

    // รีเซ็ตการจัดเรียง และเรนเดอร์ตาราง
    currentCusSortColumn = '';
    isCusSortAsc = true;
    renderCustomerSalesReportTable();

  } catch (err) {
    console.error("❌ Error loading customer sales report:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
  }
}

/**
 * 🟢 ฟังก์ชันจัดเรียงตารางเมื่อคลิกหัวตาราง
 */
function sortCustomerReportTable(columnKey) {
  if (currentCusSortColumn === columnKey) {
    isCusSortAsc = !isCusSortAsc; // สลับทิศทางจัดเรียง
  } else {
    currentCusSortColumn = columnKey;
    isCusSortAsc = true;
  }

  // รีเซ็ตไอคอนทั้งหมดเป็น neutral
  const keys = ['name', 'l95', 'a95', 'lDiesel', 'aDiesel', 'totalAmount'];
  keys.forEach(k => {
    const icon = document.getElementById(`sortIcon_${k}`);
    if (icon) {
      icon.className = 'bi bi-arrow-down-up ms-1 text-muted small';
    }
  });

  // อัปเดตไอคอนคอลัมน์ที่เลือก
  const activeIcon = document.getElementById(`sortIcon_${columnKey}`);
  if (activeIcon) {
    activeIcon.className = isCusSortAsc ? 'bi bi-arrow-up text-primary ms-1 small' : 'bi bi-arrow-down text-primary ms-1 small';
  }

  // ทำการเรียงลำดับข้อมูลใน Cache
  rawCustomerSalesReportData.sort((a, b) => {
    let valA = a[columnKey];
    let valB = b[columnKey];

    if (typeof valA === 'string') {
      return isCusSortAsc ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
    }
    return isCusSortAsc ? (valA - valB) : (valB - valA);
  });

  renderCustomerSalesReportTable();
}

/**
 * 🟢 เรนเดอร์ข้อมูลลงในตาราง HTML
 */
function renderCustomerSalesReportTable() {
  const tbody = document.getElementById('customerSalesReportTableBody');
  if (!tbody) return;

  if (rawCustomerSalesReportData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">ยังไม่มีข้อมูลยอดขายสะสมของลูกค้าในระบบ</td></tr>`;
    return;
  }

  let grand95Liters = 0;
  let grand95Amount = 0;
  let grandDieselLiters = 0;
  let grandDieselAmount = 0;
  let grandTotalSum = 0;

  let rowsHtml = '';
  const fmt = (num) => (parseFloat(num) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  rawCustomerSalesReportData.forEach((b, index) => {
    grand95Liters += b.l95;
    grand95Amount += b.a95;
    grandDieselLiters += b.lDiesel;
    grandDieselAmount += b.aDiesel;
    grandTotalSum += b.totalAmount;

    rowsHtml += `
      <tr>
        <td class="text-center fw-bold">${index + 1}</td>
        <td>
          <div class="fw-bold text-dark">${b.name}</div>
          ${b.fullname && b.fullname !== b.name ? `<small class="text-muted fs-7">${b.fullname}</small>` : ''}
        </td>
        <td class="text-end text-danger">${fmt(b.l95)}</td>
        <td class="text-end text-danger">${fmt(b.a95)}</td>
        <td class="text-end text-dark">${fmt(b.lDiesel)}</td>
        <td class="text-end text-dark">${fmt(b.aDiesel)}</td>
        <td class="text-end fw-bold text-success bg-light">${fmt(b.totalAmount)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;

  // อัปเดตยอดสรุปรวมท้ายตาราง
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setTxt('ft95Liters', fmt(grand95Liters));
  setTxt('ft95Amount', fmt(grand95Amount));
  setTxt('ftDieselLiters', fmt(grandDieselLiters));
  setTxt('ftDieselAmount', fmt(grandDieselAmount));
  setTxt('ftGrandTotal', fmt(grandTotalSum));
}