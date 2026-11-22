// public/js/claim.js

let rawExpenseData = [];
let currentSelectedClaimItems = [];

document.addEventListener('DOMContentLoaded', () => {
  initClaimMonthYearFilters();
  loadClaimData();
});

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// ==================== CLAIM SELECTION & SUMMARY ENGINE ====================
function updateClaimSelectionSummary() {
  const count = currentSelectedClaimItems.length;

  const totalCents = currentSelectedClaimItems.reduce((sumCents, item) => {
    const val = parseFloat(item.totalAmount || item.totalWithVat || item.amount || 0);
    return sumCents + Math.round(val * 100);
  }, 0);

  const grandTotal = totalCents / 100;

  const countEl = document.getElementById('selectedClaimCount');
  const amountEl = document.getElementById('selectedClaimAmount');

  if (countEl) countEl.innerText = count;
  if (amountEl) {
    amountEl.innerText = grandTotal.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}

function handleClaimItemSelect(id, isChecked) {
  if (typeof isChecked === 'undefined') {
    const cb = document.querySelector(`.claim-item-check[value="${id}"]`);
    isChecked = cb ? cb.checked : false;
  }

  const item = rawExpenseData.find(x => String(x.id) === String(id));
  if (!item) return;

  if (isChecked) {
    if (!currentSelectedClaimItems.some(x => String(x.id) === String(id))) {
      currentSelectedClaimItems.push(item);
    }
  } else {
    currentSelectedClaimItems = currentSelectedClaimItems.filter(x => String(x.id) !== String(id));
  }

  updateClaimSelectionSummary();
}

function toggleSelectAllClaimItems(masterCheckbox) {
  const isChecked = masterCheckbox ? masterCheckbox.checked : false;
  const checkboxes = document.querySelectorAll('.claim-item-check:not([disabled])');

  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const itemId = cb.value;
    const item = rawExpenseData.find(x => String(x.id) === String(itemId));

    if (item) {
      if (isChecked) {
        if (!currentSelectedClaimItems.some(x => String(x.id) === String(itemId))) {
          currentSelectedClaimItems.push(item);
        }
      } else {
        currentSelectedClaimItems = currentSelectedClaimItems.filter(x => String(x.id) !== String(itemId));
      }
    }
  });

  updateClaimSelectionSummary();
}

// ==================== DROPDOWN & LOAD DATA ====================
function setupClaimMonthYearDropdowns(startMonthId, startYearId, endMonthId, endYearId) {
  const startM = document.getElementById(startMonthId);
  const endM = document.getElementById(endMonthId);
  const startY = document.getElementById(startYearId);
  const endY = document.getElementById(endYearId);

  if (!startM || !endM || !startY || !endY) return;
  if (startM.options.length > 0) return;

  const currentYearBE = new Date().getFullYear() + 543;
  const currentMonthIdx = new Date().getMonth();

  THAI_MONTHS.forEach((m, idx) => {
    startM.add(new Option(m, idx + 1));
    endM.add(new Option(m, idx + 1));
  });

  for (let y = currentYearBE - 3; y <= currentYearBE + 1; y++) {
    startY.add(new Option(y, y));
    endY.add(new Option(y, y));
  }

  startM.value = currentMonthIdx + 1;
  endM.value = currentMonthIdx + 1;
  startY.value = currentYearBE;
  endY.value = currentYearBE;
}

function initClaimMonthYearFilters() {
  setupClaimMonthYearDropdowns('filterClaimStartMonth', 'filterClaimStartYear', 'filterClaimEndMonth', 'filterClaimEndYear');
}

async function loadClaimData() {
  const startMEl = document.getElementById('filterClaimStartMonth');
  const startYEl = document.getElementById('filterClaimStartYear');
  const endMEl   = document.getElementById('filterClaimEndMonth');
  const endYEl   = document.getElementById('filterClaimEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) {
    console.error("❌ ไม่พบ Dropdown ตัวเลือกเดือน/ปี");
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

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังดึงข้อมูลรายการค่าใช้จ่าย...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await getExpenseRecordsForClaim(startDateStr, endDateStr, currentStatus);
    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      rawExpenseData = res.data || [];
      currentSelectedClaimItems = [];

      const masterCheck = document.getElementById('checkAllClaim');
      if (masterCheck) masterCheck.checked = false;

      renderClaimTable(rawExpenseData);
      updateClaimSelectionSummary();
    } else {
      if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') Swal.close();
    if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}

function filterClaimByStatus() {
  loadClaimData();
}

function renderClaimTable(records) {
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
      const amount = parseFloat(item.totalAmount || item.amount || item.totalWithVat) || 0;
      const description = item.description || item.remarks || item.payeeName || '-';
      const claimNoDisplay = item.claimNo || item.requisitionNo || '-';
      const isReq = item.isRequisition === true;

      tr.innerHTML = `
        <td class="text-center">
          <input type="checkbox" class="claim-item-check" value="${item.id}" data-amount="${amount}" ${isChecked} ${isReq ? 'disabled' : ''} onchange="handleClaimItemSelect('${item.id}', this.checked)">
        </td>
        <td>${item.expenseNo || item.id}</td>
        <td class="text-center">${typeof formatDateThai === 'function' ? formatDateThai(item.date) : (item.date || '-')}</td>
        <td>${item.category || item.itemName || 'ค่าใช้จ่ายทั่วไป'}</td>
        <td>${description}</td>
        <td class="text-end fw-bold">${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center">
          ${isReq ? '<span class="badge bg-secondary">ตั้งเบิกแล้ว</span>' : '<span class="badge bg-success">รอนำเบิก</span>'}
        </td>
        <td>${claimNoDisplay}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  $('#claimTable').DataTable({
    pageLength: 25,
    destroy: true,
    language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' }
  });
}

// ==================== PREVIEW, PRINT & ISSUE CLAIM ====================
async function previewClaimNote() {
  if (!Array.isArray(currentSelectedClaimItems) || currentSelectedClaimItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดติ๊กเลือกอย่างน้อย 1 รายการเพื่อตั้งเบิกค่าใช้จ่าย', 'warning');
    return;
  }

  Swal.fire({ title: 'กำลังเตรียมตัวอย่างเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  const todayBE = typeof getTodayBE === 'function' ? getTodayBE() : new Date().toLocaleDateString('th-TH');

  try {
    const res = await getNextClaimNo(todayBE);
    Swal.close();

    const realClaimNo = (res && res.success) ? res.claimNo : 'SBCE-0001';

    document.getElementById('prevClaimNo').innerText = realClaimNo;
    document.getElementById('prevClaimDate').innerText = todayBE;

    const prevTbody = document.getElementById('prevClaimTableBody');
    prevTbody.innerHTML = '';

    let totalCents = 0;

    currentSelectedClaimItems.forEach((item, idx) => {
      const amt = parseFloat(item.totalAmount || item.totalWithVat || item.amount) || 0;
      totalCents += Math.round(amt * 100);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center">${idx + 1}</td>
        <td class="text-center">${item.expenseNo || item.id}</td>
        <td class="text-center">${typeof formatDateThai === 'function' ? formatDateThai(item.date) : item.date}</td>
        <td>${item.category || item.itemName || 'ค่าใช้จ่ายทั่วไป'}</td>
        <td>${item.description || item.remarks || item.payeeName || '-'}</td>
        <td class="text-end fw-bold">${amt.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      `;
      prevTbody.appendChild(tr);
    });

    const grandTotal = totalCents / 100;
    document.getElementById('prevClaimGrandTotal').innerText = grandTotal.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const previewModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('claimPreviewModal'));
    previewModal.show();
  } catch (err) {
    Swal.close();
    Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}

function printClaimDocument(claimNoForLog = '') {
  const printDocEl = document.getElementById('printableClaimDocument');
  if (!printDocEl) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบองค์ประกอบเอกสารใบตั้งเบิกค่าใช้จ่าย', 'error');
    return;
  }

  const claimNo = claimNoForLog || (document.getElementById('prevClaimNo')?.innerText || '');

  const printWindow = window.open('', '_blank', 'width=850,height=1100');
  if (!printWindow) {
    if (typeof writeActivityLog === 'function') {
      writeActivityLog({
        module: 'CLAIM',
        functionName: 'printClaimDocument',
        action: 'ERROR_PRINT_CLAIM',
        docId: claimNo,
        refNo: claimNo,
        summary: `พิมพ์ใบตั้งเบิก ${claimNo} ไม่สำเร็จ เนื่องจากเบราว์เซอร์บล็อก Pop-up`
      });
    }
    Swal.fire('Pop-up ถูกบล็อก', 'กรุณาอนุญาตให้เบราว์เซอร์เปิด Pop-up เพื่อพิมพ์เอกสาร', 'warning');
    return;
  }

  if (typeof writeActivityLog === 'function') {
    writeActivityLog({
      module: 'CLAIM',
      functionName: 'printClaimDocument',
      action: 'PRINT_CLAIM',
      docId: claimNo,
      refNo: claimNo,
      summary: `สั่งพิมพ์เอกสารใบตั้งเบิก ${claimNo}`
    });
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

async function confirmAndIssueClaim() {
  if (!currentSelectedClaimItems || currentSelectedClaimItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดเลือกอย่างน้อย 1 รายการเพื่อยืนยันตั้งเบิก', 'warning');
    return;
  }

  const modalEl = document.getElementById('claimPreviewModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);

  const result = await Swal.fire({
    title: 'ยืนยันการตั้งเบิกค่าใช้จ่าย?',
    text: "ระบบจะทำการบันทึกข้อมูลใบตั้งเบิกและปรับสถานะรายการเป็นตั้งเบิกแล้ว",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#198754',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ยืนยันและสั่งพิมพ์',
    cancelButtonText: 'ยกเลิก'
  });

  if (!result.isConfirmed) return;

  Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  const expenseIds = currentSelectedClaimItems.map(item => item.id);
  const claimDateStr = document.getElementById('prevClaimDate').innerText || (typeof getTodayBE === 'function' ? getTodayBE() : '');
  const grandTotal = parseFloat(document.getElementById('prevClaimGrandTotal').innerText.replace(/,/g, '')) || 0;

  const claimData = {
    grandTotal: grandTotal,
    expenseNos: currentSelectedClaimItems.map(x => x.expenseNo || x.id)
  };

  try {
    const res = await confirmClaim(expenseIds, claimDateStr, claimData);
    Swal.close();

    if (res && res.success) {
      // 📝 บันทึก Log การออกใบตั้งเบิกค่าใช้จ่าย
      if (typeof writeActivityLog === 'function') {
        await writeActivityLog({
          module: 'CLAIM',
          functionName: 'confirmAndIssueClaim',
          action: 'CREATE_CLAIM',
          docId: res.claimNo,
          refNo: res.claimNo,
          summary: `ออกใบตั้งเบิก ${res.claimNo} | จำนวน ${expenseIds.length} รายการ (${claimData.expenseNos.join(', ')}) | ยอดรวม ${grandTotal.toLocaleString('th-TH')} บาท`,
          afterData: {
            claimNo: res.claimNo,
            claimDate: claimDateStr,
            ...claimData,
            expenseIds: expenseIds
          }
        });
      }

      document.getElementById('prevClaimNo').innerText = res.claimNo;
      if (modalInstance) modalInstance.hide();

      // สั่งพิมพ์เอกสารใบตั้งเบิก
      printClaimDocument(res.claimNo);

      Swal.fire({
        title: 'บันทึกตั้งเบิกสำเร็จ!',
        text: 'ออกใบตั้งเบิกเลขที่ ' + res.claimNo + ' เรียบร้อยแล้ว',
        icon: 'success',
        confirmButtonColor: '#005f73'
      }).then(() => {
        loadClaimData();
      });
    } else {
      if (typeof writeActivityLog === 'function') {
        await writeActivityLog({
          module: 'CLAIM',
          functionName: 'confirmAndIssueClaim',
          action: 'ERROR_CREATE_CLAIM',
          summary: `ออกใบตั้งเบิกไม่สำเร็จ: ${res ? res.message : 'ไม่ทราบสาเหตุ'}`,
          afterData: { claimDate: claimDateStr, ...claimData, expenseIds: expenseIds }
        });
      }
      Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
  } catch (err) {
    if (typeof writeActivityLog === 'function') {
      await writeActivityLog({
        module: 'CLAIM',
        functionName: 'confirmAndIssueClaim',
        action: 'ERROR_CREATE_CLAIM',
        summary: `เกิดข้อผิดพลาดระบบตอนออกใบตั้งเบิก: ${err.message || err}`,
        afterData: { claimDate: claimDateStr, ...claimData, expenseIds: expenseIds }
      });
    }
    Swal.close();
    Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
  }
}