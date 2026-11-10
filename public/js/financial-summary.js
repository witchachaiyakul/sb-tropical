function loadFinancialSummaryData() {
  const yearSelect = document.getElementById('finSummaryYearSelect');
  const selectedYear = yearSelect ? yearSelect.value : '2026';
  
  const startYearBE = parseInt(selectedYear, 10) + 543;
  const labelStartYear = document.getElementById('labelStartYear');
  if (labelStartYear) labelStartYear.innerText = startYearBE;

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'กำลังคำนวณข้อมูลการเงิน...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  backend.run
    .withSuccessHandler(function (res) {
      if (typeof Swal !== 'undefined') Swal.close();
      console.log("Data from Server:", res);

      if (res && res.success) {
        const s = res.summary || {};
        const fmt = (num) => (parseFloat(num) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

        // 1. อัปเดตส่วนการเงินหลัก
        setTxt('finTotalSales', fmt(s.totalSales));
        setTxt('finTotalExpenses', fmt(s.totalExpenses));
        setTxt('finCostExpenses', fmt(s.costExpenses));
        setTxt('finOtherExpenses', fmt(s.otherExpenses));

        // 2. อัปเดตส่วนสรุปกำไร/ทุน
        setTxt('finNetProfit', fmt(s.netProfit));
        setTxt('finBorrowedCapital', fmt(s.borrowedCapital));
        setTxt('finTotalAR', fmt(s.totalAR));
        setTxt('finCompanyCapital', fmt(s.companyCapital));
        setTxt('finPaCapital', fmt(s.paCapital));
        setTxt('finTotalCapital', fmt(s.totalCapital));

        // 3. 🟢 อัปเดตส่วนที่เพิ่มใหม่: ยอดเงินสด & ยอดโอนจ่าย
        setTxt('finCashSales', fmt(s.cashSales || s.cash_sales));
        setTxt('finTransferTotal', fmt(s.transferTotal));

        // 4. 🟢 เรนเดอร์ ตารางรายการโอนจ่าย
        const transferTbody = document.getElementById('finTransferTableBody');
        const transferList = res.transferList || [];
        setTxt('transferRecordCount', transferList.length + ' รายการ');

        if (transferTbody) {
          transferTbody.innerHTML = '';
          if (transferList.length === 0) {
            transferTbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูลการโอนจ่าย</td></tr>`;
          } else {
            transferList.forEach(t => {
              const tr = document.createElement('tr');
              tr.innerHTML = `
                <td>${t.date || '-'}</td>
                <td><span class="badge bg-secondary">${t.account || '-'}</span></td>
                <td class="text-end fw-bold text-info">${fmt(t.amount)}</td>
                <td>${t.remarks || '-'}</td>
              `;
              transferTbody.appendChild(tr);
            });
          }
        }

        // 5. เรนเดอร์ ตารางสรุปรายเดือน 12 เดือน (9 คอลัมน์)
        const tbody = document.getElementById('finMonthlyTableBody');
        if (tbody) {
          tbody.innerHTML = '';
          let sumSales = 0, sumExp = 0, sumCost = 0, sumOtherExp = 0;
          let sumLiters95 = 0, sumLitersDiesel = 0;
          let sumProfit = 0, sumAR = 0;

          const monthlyList = res.monthlyList || [];

          monthlyList.forEach(m => {
            const sales = parseFloat(m.sales) || 0;
            const expenses = parseFloat(m.expenses) || 0;
            const cost = parseFloat(m.cost) || 0;
            const otherExp = parseFloat(m.otherExp) || 0;
            const l95 = parseFloat(m.liters95) || 0;
            const lDiesel = parseFloat(m.litersDiesel) || 0;
            const profit = parseFloat(m.netProfit) || (sales - expenses);
            const ar = parseFloat(m.ar) || 0;

            sumSales += sales;
            sumExp += expenses;
            sumCost += cost;
            sumOtherExp += otherExp;
            sumLiters95 += l95;
            sumLitersDiesel += lDiesel;
            sumProfit += profit;
            sumAR += ar;

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td class="fw-bold">${m.monthName} พ.ศ. ${m.yearBE}</td>
              <td class="text-end text-primary">${fmt(sales)}</td>
              <td class="text-end text-danger">${fmt(expenses)}</td>
              <td class="text-end">${fmt(cost)}</td>
              <td class="text-end">${fmt(otherExp)}</td>
              <td class="text-end fw-bold">${fmt(l95)}</td>
              <td class="text-end fw-bold">${fmt(lDiesel)}</td>
              <td class="text-end fw-bold ${profit >= 0 ? 'text-success' : 'text-danger'}">${fmt(profit)}</td>
              <td class="text-end text-warning">${fmt(ar)}</td>
            `;
            tbody.appendChild(tr);
          });

          // อัปเดต Tfoot
          setTxt('ftSales', fmt(sumSales));
          setTxt('ftExpenses', fmt(sumExp));
          setTxt('ftCost', fmt(sumCost));
          setTxt('ftOtherExp', fmt(sumOtherExp));
          setTxt('ftLiters95', fmt(sumLiters95));
          setTxt('ftLitersDiesel', fmt(sumLitersDiesel));
          setTxt('ftProfit', fmt(sumProfit));
          setTxt('ftAR', fmt(sumAR));
        }

      } else {
        if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถโหลดข้อมูลการเงินได้', 'error');
      }
    })
    .withFailureHandler(function (err) {
      if (typeof Swal !== 'undefined') Swal.close();
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    })
    .getFinancialSummaryData(selectedYear);
}

/**
 * เปิด Modal สำหรับตั้งค่าเงินทุน
 */
function openCapitalModal() {
  const companyCap = (document.getElementById('finCompanyCapital')?.innerText || '0').replace(/,/g, '');
  const paCap = (document.getElementById('finPaCapital')?.innerText || '0').replace(/,/g, '');
  const borrowedCap = (document.getElementById('finBorrowedCapital')?.innerText || '0').replace(/,/g, '');

  if (document.getElementById('inputCompanyCapital')) document.getElementById('inputCompanyCapital').value = parseFloat(companyCap) || 0;
  if (document.getElementById('inputPaCapital')) document.getElementById('inputPaCapital').value = parseFloat(paCap) || 0;
  if (document.getElementById('inputBorrowedCapital')) document.getElementById('inputBorrowedCapital').value = parseFloat(borrowedCap) || 0;

  const modalEl = document.getElementById('capitalModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }
}

/**
 * บันทึกตั้งค่าเงินทุนลง Firestore
 */
function saveCapitalSettings() {
  const compCap = document.getElementById('inputCompanyCapital')?.value || 0;
  const paCap = document.getElementById('inputPaCapital')?.value || 0;
  const borrowedCap = document.getElementById('inputBorrowedCapital')?.value || 0;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  backend.run
    .withSuccessHandler(function (res) {
      if (res && res.success) {
        const modalEl = document.getElementById('capitalModal');
        if (modalEl) {
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }
        if (typeof Swal !== 'undefined') {
          Swal.fire('สำเร็จ', res.message, 'success').then(() => loadFinancialSummaryData());
        } else {
          loadFinancialSummaryData();
        }
      } else {
        if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'บันทึกไม่สำเร็จ', 'error');
      }
    })
    .withFailureHandler(function (err) {
      if (typeof Swal !== 'undefined') Swal.close();
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
    })
    .saveCapitalSettingsData(compCap, paCap, borrowedCap);
}

///customersales section///
///customersales section///
///customersales section///
/**
 * โหลดข้อมูลรายงานยอดขายตามลูกค้าจาก Collection buyer
 */
