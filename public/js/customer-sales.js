function loadCustomerSalesReport() {
  const tbody = document.getElementById('customerSalesReportTableBody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div>กำลังโหลดข้อมูล...</td></tr>`;

  backend.run
    .withSuccessHandler(function(res) {
      if (!res || !res.success || !res.data) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">ไม่พบข้อมูลลูกค้า หรือดึงข้อมูลไม่สำเร็จ</td></tr>`;
        return;
      }

      const buyers = res.data;
      let totalCustomers = 0;
      let grand95Liters = 0;
      let grand95Amount = 0;
      let grandDieselLiters = 0;
      let grandDieselAmount = 0;
      let grandTotalSum = 0;

      let rowsHtml = '';

      buyers.forEach((b) => {
        const summary = b.salesSummary || {};
        const s95 = summary['95'] || { totalLiters: 0, totalAmount: 0 };
        const sDiesel = summary['diesel'] || { totalLiters: 0, totalAmount: 0 };

        const l95 = parseFloat(s95.totalLiters || 0);
        const a95 = parseFloat(s95.totalAmount || 0);
        const lDiesel = parseFloat(sDiesel.totalLiters || 0);
        const aDiesel = parseFloat(sDiesel.totalAmount || 0);

        const totalCustomerAmount = a95 + aDiesel;

        if (l95 > 0 || lDiesel > 0 || totalCustomerAmount > 0) {
          totalCustomers++;
          grand95Liters += l95;
          grand95Amount += a95;
          grandDieselLiters += lDiesel;
          grandDieselAmount += aDiesel;
          grandTotalSum += totalCustomerAmount;

          const displayName = b.name || b.fullname || 'ไม่ระบุชื่อ';

          rowsHtml += `
            <tr>
              <td class="text-center fw-bold">${totalCustomers}</td>
              <td>
                <div class="fw-bold text-dark">${displayName}</div>
                ${b.fullname && b.fullname !== displayName ? `<small class="text-muted fs-7">${b.fullname}</small>` : ''}
              </td>
              <td class="text-end text-danger">${l95.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td class="text-end text-danger">${a95.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td class="text-end text-dark">${lDiesel.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td class="text-end text-dark">${aDiesel.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
              <td class="text-end fw-bold text-success bg-light">${totalCustomerAmount.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            </tr>
          `;
        }
      });

      if (totalCustomers === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">ยังไม่มีข้อมูลยอดขายสะสมของลูกค้าในระบบ</td></tr>`;
      } else {
        tbody.innerHTML = rowsHtml;
      }

      document.getElementById('ft95Liters').innerText = grand95Liters.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('ft95Amount').innerText = grand95Amount.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('ftDieselLiters').innerText = grandDieselLiters.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('ftDieselAmount').innerText = grandDieselAmount.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      document.getElementById('ftGrandTotal').innerText = grandTotalSum.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    })
    .withFailureHandler(function(err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">เกิดข้อผิดพลาด: ${err.message}</td></tr>`;
    })
    .getBuyersumary(); // 🟢 เปลี่ยนจาก .getBuyers() เป็น .getBuyersumary()
}

/////////receipt//////////////////////////
/////////receipt//////////////////////////
/////////receipt//////////////////////////
// โหลดข้อมูลตาม เดือน/ปี ที่เลือก
