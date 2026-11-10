function loadUnreceiptedData() {
  const m = document.getElementById('rcpFilterMonth').value;
  const yBE = document.getElementById('rcpFilterYear').value;
  const yAD = parseInt(yBE, 10) - 543;
  const yearMonth = yAD + "-" + m; // โครงสร้าง YYYY-MM

  // 🟢 ใส่ Spinner วงกลมหมุนๆ ควบคู่กับข้อความกำลังดึงข้อมูล
  document.getElementById('unreceiptedTableBody').innerHTML = `
    <tr>
      <td colspan="8" class="text-center py-4 text-muted">
        <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        กำลังดึงข้อมูลรายการค้างออกใบเสร็จ...
      </td>
    </tr>
  `;

  backend.run
    .withSuccessHandler(renderUnreceiptedTable)
    .withFailureHandler(err => Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'))
    .getUnreceiptedSalesRecords(yearMonth);
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
        <td class="text-center fw-bold">${item.saleNo || '-'}</td>
        <td class="text-center">${item.date || '-'}</td>
        <td>${item.buyerName || '-'}</td>
        <td>${item.itemType || '-'}</td>
        <td>${item.itemName || '-'}</td> <!-- 🟢 แสดงรายการสินค้า (itemName) -->
        <td class="text-end">${fmtNum(item.qty || item.liters)}</td>
        <td class="text-end">${fmtNum(item.pricePerLiter || item.unitPrice)}</td>
        <td class="text-end fw-bold text-primary">${fmtNum(item.totalAmount)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function toggleSelectAllRcp(master) {
  document.querySelectorAll('.rcp-item-check').forEach(cb => cb.checked = master.checked);
}

function generateBatchReceipts() {
  const selected = Array.from(document.querySelectorAll('.rcp-item-check:checked')).map(cb => cb.value);

  if (selected.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดเลือกอย่างน้อย 1 รายการเพื่อออกใบเสร็จรับเงิน', 'warning');
    return;
  }

  Swal.fire({
    title: `ยืนยันการออกใบเสร็จ (${selected.length} รายการ)?`,
    text: "ระบบจะรันเลขที่ใบเสร็จรับเงินและรวบรวมเป็นไฟล์ PDF",
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันและสร้าง PDF',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      Swal.fire({
        title: 'กำลังออกใบเสร็จรับเงิน...',
        text: 'กำลังประมวลผลข้อมูลและสร้างไฟล์ PDF',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      backend.run
        .withSuccessHandler(res => {
          if (res && res.success) {
            Swal.fire({
              title: 'สร้างใบเสร็จสำเร็จ!',
              html: `
                <p>ออกใบเสร็จรับเงินจำนวน <b>${res.count}</b> ใบ เรียบร้อยแล้ว</p>
                <div class="p-2 bg-light border rounded mb-3 text-start small">
                  <strong>ลิงก์เอกสาร PDF:</strong><br>
                  <a href="${res.pdfUrl}" target="_blank" class="text-break">${res.pdfUrl}</a>
                </div>
              `,
              icon: 'success',
              showCancelButton: true,
              confirmButtonText: 'เปิดดู PDF',
              cancelButtonText: 'ปิด'
            }).then(r => {
              if (r.isConfirmed) window.open(res.pdfUrl, '_blank');
              loadUnreceiptedData();
            });
          } else {
            Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถสร้างใบเสร็จได้', 'error');
          }
        })
        .withFailureHandler(err => Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'))
        .createBatchReceiptsFromFirestore(selected);
    }
  });
}

// ฟังก์ชันตั้งค่าเริ่มต้นให้ Dropdown เลือกเดือนและปีเป็นปัจจุบัน
function initRcpFilters() {
  var now = new Date();
  
  // 1. ดึงเดือนปัจจุบัน (01 - 12)
  var currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  
  // 2. ดึงปี พ.ศ. ปัจจุบัน (เช่น ค.ศ. 2026 + 543 = พ.ศ. 2569)
  var currentYearBE = String(now.getFullYear() + 543);

  // 3. กำหนดค่าลง Dropdown เดือน
  var monthSelect = document.getElementById("rcpFilterMonth");
  if (monthSelect) {
    monthSelect.value = currentMonth;
  }

  // 4. กำหนดค่าลง Dropdown ปี พ.ศ. (ถ้าปีปัจจุบันยังไม่มีในตัวเลือก จะเพิ่ม <option> ให้อัตโนมัติ)
  var yearSelect = document.getElementById("rcpFilterYear");
  if (yearSelect) {
    var optionExists = Array.from(yearSelect.options).some(function(opt) {
      return opt.value === currentYearBE;
    });

    if (!optionExists) {
      var newOpt = document.createElement("option");
      newOpt.value = currentYearBE;
      newOpt.textContent = currentYearBE;
      yearSelect.appendChild(newOpt);
    }

    yearSelect.value = currentYearBE;
  }

  // 5. (Optional) เรียกโหลดข้อมูลตั้งต้นทันที
  if (typeof loadUnreceiptedData === 'function') {
    loadUnreceiptedData();
  }
}


///monthy section newe////
// ฟังก์ชันตั้งค่าเริ่มต้นและเปิดโมดูลรายงานค่าใช้จ่ายรายเดือน
// ฟังก์ชันตั้งค่าเริ่มต้นเมื่อเปิดโมดูลรายงานค่าใช้จ่ายรายเดือน
