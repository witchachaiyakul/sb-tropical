// public/js/receipt.js

let unreceiptedCache = [];

document.addEventListener('DOMContentLoaded', function () {
  initRcpFilters();
});

function initRcpFilters() {
  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearBE = String(now.getFullYear() + 543);

  const monthSelect = document.getElementById("rcpFilterMonth");
  if (monthSelect) {
    monthSelect.value = currentMonth;
  }

  const yearSelect = document.getElementById("rcpFilterYear");
  if (yearSelect) {
    let html = '';
    const startYearBE = parseInt(currentYearBE, 10) - 2;
    for (let y = startYearBE; y <= startYearBE + 4; y++) {
      const selected = (String(y) === currentYearBE) ? 'selected' : '';
      html += `<option value="${y}" ${selected}>${y}</option>`;
    }
    yearSelect.innerHTML = html;
  }

  loadUnreceiptedData();
}

async function loadUnreceiptedData() {
  const m = document.getElementById('rcpFilterMonth').value;
  const yBE = document.getElementById('rcpFilterYear').value;
  const yAD = parseInt(yBE, 10) - 543;
  const yearMonth = `${yAD}-${m}`;

  const tbody = document.getElementById('unreceiptedTableBody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          กำลังดึงข้อมูลรายการค้างออกใบเสร็จ...
        </td>
      </tr>
    `;
  }

  try {
    const res = await getUnreceiptedSalesRecords(yearMonth);
    renderUnreceiptedTable(res);
  } catch (err) {
    console.error("❌ Error loading unreceipted data:", err);
    if (typeof Swal !== 'undefined') {
      Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
    }
  }
}

function updateRcpBuyerDropdown(dataList) {
  const selectEl = document.getElementById('rcpBuyerFilter');
  if (!selectEl) return;

  const currentVal = selectEl.value;
  let buyers = [];

  if (Array.isArray(dataList)) {
    dataList.forEach(item => {
      const bName = (item.buyerName || '').trim();
      if (bName && bName !== '-' && !buyers.includes(bName)) {
        buyers.push(bName);
      }
    });
  }

  buyers.sort((a, b) => a.localeCompare(b, 'th'));

  let html = '<option value="ALL">-- แสดงทั้งหมด --</option>';
  buyers.forEach(b => {
    const selected = (b === currentVal) ? 'selected' : '';
    html += `<option value="${b}" ${selected}>${b}</option>`;
  });

  selectEl.innerHTML = html;
}

function renderUnreceiptedTable(res) {
  const tbody = document.getElementById('unreceiptedTableBody');
  if (!tbody) return;

  if (!res || !res.success || !res.data || res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">ไม่พบรายการที่ค้างออกใบเสร็จรับเงินในเดือนนี้</td></tr>';
    unreceiptedCache = [];
    updateRcpBuyerDropdown([]);
    return;
  }

  unreceiptedCache = res.data;
  updateRcpBuyerDropdown(unreceiptedCache);
  filterUnreceiptedTable();
}

function filterUnreceiptedTable() {
  const buyerFilter = document.getElementById('rcpBuyerFilter') ? document.getElementById('rcpBuyerFilter').value : 'ALL';
  const tbody = document.getElementById('unreceiptedTableBody');
  if (!tbody) return;

  let filtered = unreceiptedCache.filter(item => {
    if (buyerFilter && buyerFilter !== 'ALL') {
      return ((item.buyerName || '').trim() === buyerFilter);
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">ไม่พบรายการตามผู้ซื้อที่กรอง</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach((item) => {
    html += `
      <tr>
        <td class="text-center"><input type="checkbox" class="rcp-item-check" value="${item.id}"></td>
        <td class="text-center fw-bold text-secondary">${item.saleNo || '-'}</td>
        <td class="text-center">${formatDateThai(item.date)}</td>
        <td class="fw-bold">${item.buyerName || '-'}</td>
        <td><span class="badge bg-secondary">${item.itemType || '-'}</span></td>
        <td>${item.itemName || '-'}</td>
        <td class="text-end">${fmtNum(item.qty || item.liters)}</td>
        <td class="text-end">${fmtNum(item.pricePerLiter || item.unitPrice)}</td>
        <td class="text-end fw-bold text-primary">${fmtNum(item.totalAmount)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;

  const checkAll = document.getElementById('checkAllRcp');
  if (checkAll) checkAll.checked = false;
}

function toggleSelectAllRcp(master) {
  document.querySelectorAll('.rcp-item-check').forEach(cb => cb.checked = master.checked);
}

// 🟢 ออกใบเสร็จรับเงิน (ส่งข้อมูลให้ GAS สร้าง PDF แล้วอัปเดตสถานะลง Firestore)
async function generateBatchReceipts() {
  const selectedIds = Array.from(document.querySelectorAll('.rcp-item-check:checked')).map(cb => cb.value);

  if (selectedIds.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดเลือกอย่างน้อย 1 รายการเพื่อออกใบเสร็จรับเงิน', 'warning');
    return;
  }

  const result = await Swal.fire({
    title: `ยืนยันการออกใบเสร็จ (${selectedIds.length} รายการ)?`,
    text: "ระบบจะรันสร้างไฟล์ PDF จาก Google Slides Template 3 รูปแบบตามประเภทสินค้า",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#198754',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ยืนยันและสร้าง PDF',
    cancelButtonText: 'ยกเลิก'
  });

  if (!result.isConfirmed) return;

  Swal.fire({
    title: 'กำลังออกใบเสร็จรับเงิน...',
    text: 'กำลังประมวลผลข้อมูลและสร้างไฟล์ PDF',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    // 1. ดึงรายการขายที่เลือกจาก Cache
    const selectedItems = unreceiptedCache.filter(item => selectedIds.includes(item.id));

    // 2. ดึงข้อมูล Buyer Map เพื่อแมปชื่อเต็ม ที่อยู่ เลขภาษี
    const buyerMap = await getBuyerMapFromFirestore();
    const salesDataForGas = selectedItems.map(item => {
      const bInfo = buyerMap[item.buyerName] || {};
      return {
        id: item.id,
        saleNo: item.saleNo,
        date: item.date,
        buyerName: item.buyerName,
        buyerFullName: bInfo.name || item.buyerName,
        buyerAddress: bInfo.addr || '',
        buyerTaxId: bInfo.tax || '',
        itemType: item.itemType,
        itemName: item.itemName,
        pricePerLiter: item.pricePerLiter,
        unitPrice: item.unitPrice,
        liters: item.liters,
        qty: item.qty,
        totalAmount: item.totalAmount,
        remarks: item.remarks
      };
    });

    // 3. ส่งข้อมูลให้ GAS หลังบ้านสร้าง PDF (ผ่าน google.script.run หรือ callBackendApi)
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(async (res) => {
          await handleReceiptResult(res, selectedIds);
        })
        .withFailureHandler((err) => {
          Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
        })
        .createBatchReceiptsFromSalesData(salesDataForGas);
    } else if (typeof callBackendApi === 'function') {
      const res = await callBackendApi('createBatchReceiptsFromSalesData', { salesDataList: salesDataForGas });
      await handleReceiptResult(res, selectedIds);
    } else {
      throw new Error("ไม่พบช่องทางการเชื่อมต่อ Google Apps Script (google.script.run หรือ callBackendApi)");
    }

  } catch (err) {
    console.error("❌ Error generating receipts:", err);
    Swal.fire('เกิดข้อผิดพลาด', err.toString(), 'error');
  }
}

// Helper ประมวลผลผลลัพธ์หลังสร้าง PDF
async function handleReceiptResult(res, selectedIds) {
  if (res && res.success) {
    // อัปเดตสถานะ isReceiptIssued ลง Firestore Direct
    await updateSalesReceiptStatusInFirestore(selectedIds);

    let pdfHtml = `<p>ออกใบเสร็จรับเงินจำนวน <b>${res.count}</b> ใบ เรียบร้อยแล้ว</p>`;
    if (res.pdfUrl) {
      pdfHtml += `
        <div class="p-2 bg-light border rounded mb-3 text-start small">
          <strong>ลิงก์เอกสาร PDF:</strong><br>
          <a href="${res.pdfUrl}" target="_blank" class="text-break">${res.pdfUrl}</a>
        </div>
      `;
    }

    Swal.fire({
      title: 'สร้างใบเสร็จสำเร็จ!',
      html: pdfHtml,
      icon: 'success',
      showCancelButton: true,
      confirmButtonText: res.pdfUrl ? 'เปิดดู PDF' : 'ตกลง',
      cancelButtonText: 'ปิด',
      confirmButtonColor: '#005f73'
    }).then(r => {
      if (r.isConfirmed && res.pdfUrl) {
        window.open(res.pdfUrl, '_blank');
      }
      loadUnreceiptedData();
    });
  } else {
    Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถสร้างใบเสร็จได้', 'error');
  }
}

function fmtNum(n) {
  return (parseFloat(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateThai(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  const parts = String(dateStr).replace(/-/g, '/').split('/');
  if (parts.length === 3) {
    let y = parseInt(parts[0], 10);
    let m = parts[1].padStart(2, '0');
    let d = parts[2].padStart(2, '0');
    if (y < 2400) y += 543;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}