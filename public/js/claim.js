function initClaimMonthYearFilters() {
  if (typeof setupMonthYearDropdowns === 'function') {
    setupMonthYearDropdowns('filterClaimStartMonth', 'filterClaimStartYear', 'filterClaimEndMonth', 'filterClaimEndYear');
  }
}

// 5. ดึงข้อมูลค่าใช้จ่ายจาก Firestore
function loadClaimData() {
  console.log("========================================");
  console.log("🚀 [loadClaimData] START");

  const startMEl = document.getElementById('filterClaimStartMonth');
  const startYEl = document.getElementById('filterClaimStartYear');
  const endMEl   = document.getElementById('filterClaimEndMonth');
  const endYEl   = document.getElementById('filterClaimEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) {
    console.error("❌ ไม่พบ Dropdown ตัวเลือกเดือน/ปี บนหน้าจอ!");
    return;
  }

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const endM   = parseInt(endMEl.value, 10);
  const endY   = parseInt(endYEl.value, 10) - 543;

  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/01`;
  const lastDay      = new Date(endY, endM, 0).getDate();
  const endDateStr   = `${endY}/${String(endM).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;

  const toggleEl = document.querySelector('input[name="claimStatusToggle"]:checked');
  const currentStatus = toggleEl ? toggleEl.value : 'unclaimed';

  console.log("📅 ช่วงวันที่คัดกรอง -> เริ่มต้น:", startDateStr, "| สิ้นสุด:", endDateStr);
  console.log("🔘 สถานะที่เลือก ->", currentStatus);

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังดึงข้อมูลรายการค่าใช้จ่าย...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  console.log("📡 กำลังส่งคำขอไปยัง Server (backend.run.getExpenseRecordsForClaim)...");

  backend.run
    .withSuccessHandler(function(res) {
      console.log("📥 ได้รับผลลัพธ์ตอบกลับจาก Server:", res);
      if (typeof Swal !== 'undefined') Swal.close();

      if (res && res.success) {
        rawExpenseData = res.data || [];
        console.log("✅ ดึงข้อมูลสำเร็จ! จำนวนรายการที่ได้รับ:", rawExpenseData.length);
        console.table(rawExpenseData); // แสดงตารางข้อมูลใน Console

        currentSelectedClaimItems = [];
        const masterCheck = document.getElementById('checkAllClaim');
        if (masterCheck) masterCheck.checked = false;

        renderClaimTable(rawExpenseData);
        updateClaimSelectionSummary();
      } else {
        console.error("❌ Server ตอบกลับข้อผิดพลาด:", res ? res.message : 'ไม่ทราบสาเหตุ');
        if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
      }
    })
    .withFailureHandler(function(err) {
      console.error("❌ backend.run ทำงานล้มเหลว (Failure):", err);
      if (typeof Swal !== 'undefined') Swal.close();
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    })
    .getExpenseRecordsForClaim(startDateStr, endDateStr, currentStatus);
}

// 6. เมื่อเปลี่ยนสถานะ Toggle "ยังไม่ตั้งเบิก / ตั้งเบิกแล้ว" ให้สั่งยิงดึงข้อมูลใหม่
function filterClaimByStatus() {
  loadClaimData();
}

// 7. เรนเดอร์ตารางรายการค่าใช้จ่าย
function renderClaimTable(records) {
  console.log("🎨 [renderClaimTable] กำลังเรนเดอร์ตาราง จำนวนรายการ:", records ? records.length : 0);

  if ($.fn.DataTable.isDataTable('#claimTable')) {
    $('#claimTable').DataTable().destroy();
  }

  const tbody = document.getElementById('claimTableBody');
  if (!tbody) {
    console.error("❌ ไม่พบแท็ก #claimTableBody ในโครงสร้าง HTML!");
    return;
  }
  tbody.innerHTML = '';

  if (records && records.length > 0) {
    records.forEach(item => {
      const tr = document.createElement('tr');
      const isChecked = currentSelectedClaimItems.some(x => String(x.id) === String(item.id)) ? 'checked' : '';
      const amount = parseFloat(item.totalAmount || item.amount) || 0;
      const isReq = item.isRequisition === true;

      tr.innerHTML = `
        <td class="text-center">
          <input type="checkbox" class="claim-item-check" value="${item.id}" data-amount="${amount}" ${isChecked} ${isReq ? 'disabled' : ''} onchange="handleClaimItemSelect('${item.id}', this.checked)">
        </td>
        <td>${item.expenseNo || item.id}</td>
        <td class="text-center">${typeof formatDateThai === 'function' ? formatDateThai(item.date) : (item.date || '-')}</td>
        <td>${item.category || item.itemName || 'ค่าใช้จ่ายทั่วไป'}</td>
        <td>${item.description || item.remarks || '-'}</td>
        <td class="text-end fw-bold">${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center">
          ${isReq ? '<span class="badge bg-secondary">ตั้งเบิกแล้ว</span>' : '<span class="badge bg-success">รอนำเบิก</span>'}
        </td>
        <td>${item.remarks || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    console.warn("⚠️ ไม่พบข้อมูลรายการที่จะนำมาแสดงในตาราง");
  }

  $('#claimTable').DataTable({
    pageLength: 25,
    destroy: true,
    language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' }
  });
}

// 8. ดูตัวอย่างใบตั้งเบิก (Preview)
function previewClaimNote() {
  if (!Array.isArray(currentSelectedClaimItems) || currentSelectedClaimItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดติ๊กเลือกอย่างน้อย 1 รายการเพื่อตั้งเบิกค่าใช้จ่าย', 'warning');
    return;
  }

  Swal.fire({ title: 'กำลังเตรียมตัวอย่างเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  const todayBE = typeof getTodayBE === 'function' ? getTodayBE() : new Date().toLocaleDateString('th-TH');

  backend.run
    .withSuccessHandler(function(res) {
      Swal.close();
      const realClaimNo = (res && res.success) ? res.claimNo : 'SBCE-0001';

      document.getElementById('prevClaimNo').innerText = realClaimNo;
      document.getElementById('prevClaimDate').innerText = todayBE;

      const prevTbody = document.getElementById('prevClaimTableBody');
      prevTbody.innerHTML = '';

      let totalCents = 0;

      currentSelectedClaimItems.forEach((item, idx) => {
        const amt = parseFloat(item.totalAmount || item.amount) || 0;
        totalCents += Math.round(amt * 100);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="text-center">${idx + 1}</td>
          <td class="text-center">${item.expenseNo || item.id}</td>
          <td class="text-center">${typeof formatDateThai === 'function' ? formatDateThai(item.date) : item.date}</td>
          <td>${item.category || item.itemName || 'ค่าใช้จ่ายทั่วไป'}</td>
          <td>${item.description || item.remarks || '-'}</td>
          <td class="text-end fw-bold">${amt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        `;
        prevTbody.appendChild(tr);
      });

      const grandTotal = totalCents / 100;
      document.getElementById('prevClaimGrandTotal').innerText = grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const previewModal = new bootstrap.Modal(document.getElementById('claimPreviewModal'));
      previewModal.show();
    })
    .withFailureHandler(function(err) {
      Swal.close();
      Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
    })
    .getNextClaimNo(todayBE);
}

// 9. ฟังก์ชันสั่งพิมพ์เอกสารใบตั้งเบิก (เพิ่มเข้ามาใหม่เพื่อแก้ปัญหา ReferenceError)
function printClaimDocument() {
  const printDocEl = document.getElementById('printableClaimDocument');
  if (!printDocEl) {
    if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', 'ไม่พบองค์ประกอบเอกสารใบตั้งเบิกค่าใช้จ่าย', 'error');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=850,height=1100');
  if (!printWindow) {
    if (typeof Swal !== 'undefined') Swal.fire('Pop-up ถูกบล็อก', 'กรุณาอนุญาตให้เบราว์เซอร์เปิด Pop-up เพื่อทำการพิมพ์เอกสาร', 'warning');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>พิมพ์ใบตั้งเบิกค่าใช้จ่าย</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        html, body { font-family: 'Sarabun', sans-serif !important; font-size: 12px; background: #fff; padding: 0; margin: 0; }
        #printableClaimDocument { width: 100% !important; max-width: 100% !important; border: none !important; box-shadow: none !important; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th, td { border: 1px solid #000 !important; padding: 5px 8px; font-size: 11px; }
        th { background-color: #f8f9fa !important; font-weight: bold; text-align: center; }
      </style>
    </head>
    <body>
      ${printDocEl.outerHTML}
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
            window.close();
          }, 400);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// 10. ยืนยันออกใบตั้งเบิกและสั่งพิมพ์ PDF
function confirmAndIssueClaim() {
  if (!currentSelectedClaimItems || currentSelectedClaimItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดเลือกอย่างน้อย 1 รายการเพื่อยืนยันตั้งเบิก', 'warning');
    return;
  }

  const modalEl = document.getElementById('claimPreviewModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);

  Swal.fire({
    title: 'ยืนยันการตั้งเบิกค่าใช้จ่าย?',
    text: "ระบบจะทำการบันทึกข้อมูลใบตั้งเบิกและปรับสถานะรายการเป็นตั้งเบิกแล้ว",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#198754',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ยืนยันและสั่งพิมพ์',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      const expenseIds = currentSelectedClaimItems.map(item => item.id);
      const claimDateStr = document.getElementById('prevClaimDate').innerText || (typeof getTodayBE === 'function' ? getTodayBE() : '');
      const grandTotal = parseFloat(document.getElementById('prevClaimGrandTotal').innerText.replace(/,/g, '')) || 0;

      const claimData = {
        grandTotal: grandTotal,
        expenseNos: currentSelectedClaimItems.map(x => x.expenseNo || x.id)
      };

      backend.run
        .withSuccessHandler(function(res) {
          Swal.close();
          if (res && res.success) {
            document.getElementById('prevClaimNo').innerText = res.claimNo;

            if (modalInstance) modalInstance.hide();

            // เรียกพิมพ์เอกสาร PDF ใบตั้งเบิก
            printClaimDocument();

            Swal.fire({
              title: 'บันทึกตั้งเบิกสำเร็จ!',
              text: 'ออกใบตั้งเบิกเลขที่ ' + res.claimNo + ' เรียบร้อยแล้ว',
              icon: 'success',
              confirmButtonColor: '#005f73'
            }).then(() => {
              loadClaimData();
            });
          } else {
            Swal.fire('เกิดข้อผิดพลาด', res.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
          }
        })
        .withFailureHandler(function(err) {
          Swal.close();
          Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
        })
        .confirmClaim(expenseIds, claimDateStr, claimData);
    }
  });
}

// ==================== OIL STOCK CLIENT SYSTEM ====================

// ==================== OIL STOCK CLIENT SYSTEM ===================
// ==================== OIL STOCK CLIENT SYSTEM ====================

// 1. กำหนดค่าปฏิทิน Flatpickr ให้แสดงผลเป็น dd/mm/yyyy
