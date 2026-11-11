// public/js/fin-sum.js

document.addEventListener('DOMContentLoaded', function () {
  initFinSummaryYearSelect();
  loadFinancialSummaryData();
});

function initFinSummaryYearSelect() {
  const yearSelect = document.getElementById('finSummaryYearSelect');
  if (!yearSelect) return;

  const currentYearAD = new Date().getFullYear();
  let html = '';
  for (let yAD = currentYearAD - 2; yAD <= currentYearAD + 2; yAD++) {
    const yBE = yAD + 543;
    const selected = (yAD === currentYearAD) ? 'selected' : '';
    html += `<option value="${yAD}" ${selected}>${yBE}</option>`;
  }
  yearSelect.innerHTML = html;
}

/**
 * 🟢 โหลดข้อมูลสรุปการเงินผ่าน Firestore Direct (Firebase SDK)
 */
async function loadFinancialSummaryData() {
  const yearSelect = document.getElementById('finSummaryYearSelect');
  const selectedYear = yearSelect ? yearSelect.value : String(new Date().getFullYear());
  
  const startYearBE = parseInt(selectedYear, 10) + 543;
  const labelStartYear = document.getElementById('labelStartYear');
  if (labelStartYear) labelStartYear.innerText = startYearBE;

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'กำลังคำนวณข้อมูลการเงิน...',
      text: 'ดึงข้อมูลตรงจาก Firestore...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });
  }

  try {
    // 🟢 เรียกใช้ฟังก์ชัน Firebase SDK Direct จาก firestore.js
    const res = await getFinancialSummaryData(selectedYear);

    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      const s = res.summary || {};
      const fmt = (num) => (parseFloat(num) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

      // 1. ภาพรวมรายได้และค่าใช้จ่าย
      setTxt('finTotalSales', fmt(s.totalSales));
      setTxt('finTotalExpenses', fmt(s.totalExpenses));
      setTxt('finCostExpenses', fmt(s.costExpenses));
      setTxt('finOtherExpenses', fmt(s.otherExpenses));

      // 2. สรุปกำไร/หนี้สิน และส่วนของทุน
      setTxt('finNetProfit', fmt(s.netProfit));
      setTxt('finBorrowedCapital', fmt(s.borrowedCapital));
      setTxt('finTotalAR', fmt(s.totalAR));
      setTxt('finCompanyCapital', fmt(s.companyCapital));
      setTxt('finPaCapital', fmt(s.paCapital));
      setTxt('finTotalCapital', fmt(s.totalCapital));

      // 3. ยอดเงินสด & ยอดโอนจ่าย
      setTxt('finCashSales', fmt(s.cashSales));
      setTxt('finTransferTotal', fmt(s.transferTotal));

      // 4. ตารางรายการโอนจ่าย
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

      // 5. ตารางสรุปรายเดือน 12 เดือน (9 คอลัมน์)
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
          const profit = sales - expenses;
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

        // อัปเดต Tfoot รวมทั้งหมด
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

  } catch (err) {
    console.error("❌ Error loading financial summary:", err);
    if (typeof Swal !== 'undefined') {
      Swal.close();
      Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
    }
  }
}

/**
 * 🟢 บันทึกเงินทุนผ่าน Firestore Direct
 */
async function saveCapitalSettings() {
  const compCap = parseFloat(document.getElementById('inputCompanyCapital')?.value || 0);
  const paCap = parseFloat(document.getElementById('inputPaCapital')?.value || 0);
  const borrowedCap = parseFloat(document.getElementById('inputBorrowedCapital')?.value || 0);

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await saveCapitalSettingsData(compCap, paCap, borrowedCap);

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
  } catch (err) {
    console.error("❌ Error saving capital settings:", err);
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}