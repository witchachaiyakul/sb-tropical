function loadBillingBuyerOptions() {
  console.log('🔍 Generating Buyer Options from Unpaid Records...');
  const sel = document.getElementById('filterBillBuyer');
  if (!sel) return;

  // 1. ใส่ตัวเลือกแรก
  sel.innerHTML = '<option value="ALL">-- ลูกค้าทั้งหมด --</option>';

  // 2. ป้องกันกรณี rawUnpaidSalesData ยังไม่มีข้อมูล
  if (!Array.isArray(rawUnpaidSalesData) || rawUnpaidSalesData.length === 0) {
    console.warn('⚠️ No unpaid sales data available to populate buyers.');
    return;
  }

  // 3. สกัดเฉพาะรายชื่อลูกค้าที่ไม่ซ้ำจากรายการค้างชำระจริง
  const unpaidBuyers = [...new Set(rawUnpaidSalesData.map(item => item && item.buyerName ? String(item.buyerName).trim() : '').filter(Boolean))].sort();

  // 4. นำเฉพาะรายชื่อที่มีรายการค้างชำระจริงยัดใส่ Dropdown
  unpaidBuyers.forEach(buyerName => {
    sel.add(new Option(buyerName, buyerName));
  });

  console.log(`✅ Loaded ${unpaidBuyers.length} buyers with unpaid bills into dropdown.`);
}

function loadBillingData() {
  const startMEl = document.getElementById('filterBillStartMonth');
  const startYEl = document.getElementById('filterBillStartYear');
  const endMEl   = document.getElementById('filterBillEndMonth');
  const endYEl   = document.getElementById('filterBillEndYear');

  if (!startMEl || !startYEl || !endMEl || !endYEl) {
    console.warn('⚠️ ไม่พบ Dropdown เลือกเดือน/ปี ในหน้าจอ');
    return;
  }

  const startM = parseInt(startMEl.value, 10);
  const startY = parseInt(startYEl.value, 10) - 543;
  const endM   = parseInt(endMEl.value, 10);
  const endY   = parseInt(endYEl.value, 10) - 543;

  const startDateStr = `${startY}/${String(startM).padStart(2, '0')}/01`;
  const lastDay      = new Date(endY, endM, 0).getDate();
  const endDateStr   = `${endY}/${String(endM).padStart(2, '0')}/${String(lastDay).padStart(2, '0')}`;

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังดึงรายการขายค้างวางบิล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  backend.run
    .withSuccessHandler(function(res) {
      if (typeof Swal !== 'undefined') Swal.close();

      if (res && res.success) {
        rawUnpaidSalesData = res.data || [];
        currentSelectedBillItems = [];

        // อัปเดต Dropdown ลูกค้าตามรายการค้างชำระจริงในเดือนนี้
        updateBillingBuyerDropdown(rawUnpaidSalesData);

        // กรองตารางแสดงผล
        filterBillingByBuyer();
      } else {
        if (typeof Swal !== 'undefined') Swal.fire('ข้อผิดพลาด', res ? res.message : 'ไม่สามารถดึงข้อมูลได้', 'error');
      }
    })
    .withFailureHandler(function(err) {
      if (typeof Swal !== 'undefined') Swal.close();
      if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาดจาก Server', err.toString(), 'error');
    })
    .getUnpaidSalesRecords(startDateStr, endDateStr, 'ALL');
}

function renderBillingTable(records) {
  // 1. ทำลาย DataTables instance เดิมก่อนเรนเดอร์ใหม่
  if ($.fn.DataTable.isDataTable('#billingTable')) {
    $('#billingTable').DataTable().destroy();
  }

  const tbody = document.getElementById('billingTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (records && records.length > 0) {
    records.forEach(item => {
      const tr = document.createElement('tr');
      const isChecked = (typeof currentSelectedBillItems !== 'undefined' && currentSelectedBillItems.some(x => x.id === item.id)) ? 'checked' : '';
      
      const qty = parseFloat(item.qty || item.liters) || 0;
      const pricePerLiter = parseFloat(item.pricePerLiter || item.unitPrice) || 0;
      const totalAmount = parseFloat(item.totalAmount) || 0;
      const itemType = item.itemType || 'น้ำมัน';
      const itemName = item.itemName || '-';

      // 📌 สลับ ${itemType} และ ${itemName} ให้ตรงกับหัวตาราง
      tr.innerHTML = `
        <td class="text-center">
          <input type="checkbox" class="bill-item-check" value="${item.id}" ${isChecked} onchange="handleBillItemSelect('${item.id}', this.checked)">
        </td>
        <td>${item.saleNo || item.id}</td>
        <td class="text-center">${typeof formatDateThai === 'function' ? formatDateThai(item.date) : (item.date || '-')}</td>
        <td>${item.buyerName || '-'}</td>
        <td>${itemType}</td>
        <td>${itemName}</td>
        <td class="text-end">${qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-end">${pricePerLiter > 0 ? pricePerLiter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
        <td class="text-end fw-bold">${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td class="text-center"><span class="badge bg-warning text-dark">ค้างชำระ</span></td>
        <td>${item.remarks || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // 2. เรียกใช้งาน DataTables ใหม่
  $('#billingTable').DataTable({
    pageLength: 25,
    destroy: true,
    language: {
      url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json'
    }
  });
}

function previewBillingNote() {
  if (!Array.isArray(currentSelectedBillItems) || currentSelectedBillItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดติ๊กเลือกอย่างน้อย 1 รายการเพื่อออกใบวางบิล', 'warning');
    return;
  }

  const firstBuyer = String(
    currentSelectedBillItems[0].buyerName || 
    currentSelectedBillItems[0].customerName || 
    currentSelectedBillItems[0].customer || ''
  ).trim();

  const isSameBuyer = currentSelectedBillItems.every(x => {
    const bName = String(x.buyerName || x.customerName || x.customer || '').trim();
    return bName === firstBuyer;
  });

  if (!isSameBuyer) {
    Swal.fire('ลูกค้าไม่ตรงกัน', 'การออกใบวางบิล 1 ใบ ต้องเป็นรายการของลูกค้าคนเดียวกันเท่านั้น กรุณาเลือกเฉพาะลูกค้ารายเดียว', 'warning');
    return;
  }

  Swal.fire({ title: 'กำลังเตรียมตัวอย่างเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  const todayBE = typeof getTodayBE === 'function' ? getTodayBE() : new Date().toLocaleDateString('th-TH');

  // ดึงเลขที่ใบวางบิลถัดไปจากหลังบ้าน
  backend.run
    .withSuccessHandler(function(nextBillRes) {
      const realBillNo = (nextBillRes && nextBillRes.success) ? nextBillRes.billNo : 'SBBS-0001';

      backend.run
        .withSuccessHandler(function(res) {
          Swal.close();
          const buyerData = (res && res.success && res.data) ? res.data : {};
          const finalBuyerName = (buyerData.fullname && buyerData.fullname !== "ไม่ประสงค์ออกนาม") ? buyerData.fullname :
                               (buyerData.name && buyerData.name !== "ไม่ประสงค์ออกนาม") ? buyerData.name : 
                               (firstBuyer || "ไม่ประสงค์ออกนาม");

          // 📌 อัปเดตข้อมูลลงในช่องของแบบฟอร์ม Preview
          document.getElementById('prevBillNo').innerText = realBillNo;
          document.getElementById('prevBillDate').innerText = todayBE;

          document.getElementById('prevBuyerName').innerText = finalBuyerName;
          document.getElementById('prevBuyerTaxId').innerText = buyerData.taxid || '-';
          document.getElementById('prevBuyerAddress').innerText = buyerData.address || '-';
          
          // 📌 อัปเดตช่อง หมายเหตุ ด้วยชื่อผู้ซื้อ/ลูกค้า (เช่น ติล)
          document.getElementById('prevBuyerRemark').innerText = firstBuyer || '-';

          const prevTbody = document.getElementById('prevBillingTableBody');
          prevTbody.innerHTML = '';
          
          let grandTotalCents = 0;

          currentSelectedBillItems.forEach((item, idx) => {
            const itemType = item.itemType || 'น้ำมัน';
            const itemName = item.itemName || '-';
            const qty = parseFloat(item.qty || item.liters) || 0;
            const pricePerLiter = parseFloat(item.pricePerLiter || item.unitPrice) || 0;
            
            const total = Math.round((parseFloat(item.totalAmount || item.total || 0)) * 100) / 100;
            
            grandTotalCents += Math.round(total * 100);

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td class="text-center">${idx + 1}</td>
              <td class="text-center">${item.saleNo || '-'}</td>
              <td class="text-center">${typeof formatDateThai === 'function' ? formatDateThai(item.date) : (item.date || '-')}</td>
              <td class="text-center">${itemName}</td>
              <td class="text-end">${qty.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="text-end">${pricePerLiter > 0 ? pricePerLiter.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
              <td class="text-end fw-bold">${total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td class="text-center">${item.remarks || '-'}</td>
            `;
            prevTbody.appendChild(tr);
          });

          // คำนวณยอดรวมและ VAT
          const grandTotal = grandTotalCents / 100;
          const subtotal = Math.round((grandTotal / 1.07) * 100) / 100;
          const vatAmount = Math.round((grandTotal - subtotal) * 100) / 100;

          document.getElementById('prevBillSubtotal').innerText = subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          document.getElementById('prevBillVat').innerText = vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          document.getElementById('prevBillGrandTotal').innerText = grandTotal.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const previewModal = new bootstrap.Modal(document.getElementById('billingPreviewModal'));
          previewModal.show();
        })
        .getBuyerByName(firstBuyer);
    })
    .getNextBillNo(todayBE);
}
// 1. ฟังก์ชันเปิดหน้าสั่งพิมพ์ PDF แยกหน้าต่างใหม่ (ปรับแต่ง CSS ให้ถอดแบบจาก Preview 100%)
// ฟังก์ชันสั่งพิมพ์ PDF โดยคัดลอก DOM ล่าสุดจากหน้า Preview มาจัดแบ่งหน้าพิมพ์
// ฟังก์ชันสร้างและเปิดเอกสาร PDF จาก Google Slides Template
function printBillingNoteDocument() {
  if (!currentSelectedBillItems || currentSelectedBillItems.length === 0) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบรายการสินค้าสำหรับสร้าง PDF', 'warning');
    return;
  }

  Swal.fire({
    title: 'กำลังสร้างเอกสาร PDF...',
    text: 'กำลังบันทึกข้อมูลลงเอกสาร',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  // 📌 ดึงข้อมูลตรงจาก DOM บนหน้าจอ Preview
  const billNo = document.getElementById('prevBillNo') ? document.getElementById('prevBillNo').innerText.trim() : 'BILL-XXXX';
  const billDate = document.getElementById('prevBillDate') ? document.getElementById('prevBillDate').innerText.trim() : '-';
  const buyerName = document.getElementById('prevBuyerName') ? document.getElementById('prevBuyerName').innerText.trim() : '-';
  const buyerTaxId = document.getElementById('prevBuyerTaxId') ? document.getElementById('prevBuyerTaxId').innerText.trim() : '-';
  const buyerAddress = document.getElementById('prevBuyerAddress') ? document.getElementById('prevBuyerAddress').innerText.trim() : '-';
  
  // 📌 ดึงค่า หมายเหตุ (ชื่อผู้ซื้อ/ลูกค้า) จาก DOM บนหน้าจอ
  const buyerRemarkEl = document.getElementById('prevBuyerRemark');
  const buyerRemark = buyerRemarkEl ? buyerRemarkEl.innerText.trim() : '-';

  const subtotal = parseFloat(document.getElementById('prevBillSubtotal').innerText.replace(/,/g, '')) || 0;
  const vatAmount = parseFloat(document.getElementById('prevBillVat').innerText.replace(/,/g, '')) || 0;
  const grandTotal = parseFloat(document.getElementById('prevBillGrandTotal').innerText.replace(/,/g, '')) || 0;

  const itemsData = currentSelectedBillItems.map(item => ({
    saleNo: item.saleNo || item.id,
    date: typeof formatDateThai === 'function' ? formatDateThai(item.date) : (item.date || '-'),
    fuel: item.itemName || item.fuelType || '95',
    qty: parseFloat(item.qty || item.liters) || 0,
    pricePerLiter: parseFloat(item.pricePerLiter || item.unitPrice) || 0,
    total: Math.round((parseFloat(item.totalAmount || item.total || 0)) * 100) / 100,
    remark: item.remarks || item.remark || item.note || ''
  }));

  const payload = {
    billNo: billNo,
    billDate: billDate,
    buyerName: buyerName,
    buyerTaxId: buyerTaxId,
    buyerAddress: buyerAddress,
    buyerRemark: buyerRemark,
    subtotal: subtotal,
    vatAmount: vatAmount,
    grandTotal: grandTotal,
    items: itemsData
  };

  backend.run
    .withSuccessHandler(function(res) {
      console.log('📌 Response from server:', res);

      if (res && res.success && res.pdfUrl) {
        Swal.fire({
          title: 'สร้าง PDF สำเร็จ!',
          html: `
            <p>ออกใบวางบิลเลขที่ <b>${res.billNo}</b> เรียบร้อยแล้ว</p>
            <div class="p-2 bg-light border rounded mb-3 text-start small">
              <strong>ลิงก์เอกสาร PDF:</strong><br>
              <a href="${res.pdfUrl}" target="_blank" class="text-break">${res.pdfUrl}</a>
            </div>
          `,
          icon: 'success',
          showCancelButton: true,
          confirmButtonText: 'เปิดดู PDF',
          cancelButtonText: 'ปิด'
        }).then((result) => {
          if (result.isConfirmed) {
            window.open(res.pdfUrl, '_blank');
          }
          // 📌 เรียกใช้ฟังก์ชันเคลียร์ฟอร์มและรีโหลดตารางใหม่เมื่อปิด หรือกดเปิด PDF
          resetBillingForm();
        });
      } else {
        Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่ได้รับ URL ของ PDF', 'error');
      }
    })
    .withFailureHandler(function(err) {
      Swal.fire('เกิดข้อผิดพลาดจาก Server', err.message || err.toString(), 'error');
    })
    .generatePdfFromSlideTemplate(payload);
}

// 2. ฟังก์ชันยืนยันออกใบวางบิล -> เรียก confirmBilling หลังบ้าน -> พิมพ์ PDF
function confirmAndIssueBilling() {
  if (!currentSelectedBillItems || currentSelectedBillItems.length === 0) {
    Swal.fire('กรุณาเลือกรายการ', 'โปรดเลือกอย่างน้อย 1 รายการเพื่อออกใบวางบิล', 'warning');
    return;
  }

  const modalEl = document.getElementById('billingPreviewModal');
  const modalInstance = bootstrap.Modal.getInstance(modalEl);

  Swal.fire({
    title: 'ยืนยันการออกใบวางบิล?',
    text: "ระบบจะทำการสร้างเลขที่ใบวางบิลและบันทึกข้อมูลลงฐานข้อมูล",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0d6efd',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'ยืนยันและสั่งพิมพ์',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      Swal.fire({ 
        title: 'กำลังบันทึกข้อมูล...', 
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
      });

      const saleIds = currentSelectedBillItems.map(item => item.id);
      const billDateEl = document.getElementById('prevBillDate');
      const billDateStr = billDateEl ? billDateEl.innerText.trim() : getTodayBE();
      
      const buyerName = document.getElementById('prevBuyerName') ? document.getElementById('prevBuyerName').innerText.trim() : '-';
      const buyerTaxId = document.getElementById('prevBuyerTaxId') ? document.getElementById('prevBuyerTaxId').innerText.trim() : '-';
      const buyerAddress = document.getElementById('prevBuyerAddress') ? document.getElementById('prevBuyerAddress').innerText.trim() : '-';
      
      const buyerRemarkEl = document.getElementById('prevBuyerRemark');
      const buyerRemark = buyerRemarkEl ? buyerRemarkEl.innerText.trim() : '-';

      const subtotal = parseFloat(document.getElementById('prevBillSubtotal').innerText.replace(/,/g, '')) || 0;
      const vatAmount = parseFloat(document.getElementById('prevBillVat').innerText.replace(/,/g, '')) || 0;
      const grandTotal = parseFloat(document.getElementById('prevBillGrandTotal').innerText.replace(/,/g, '')) || 0;

      const billingData = {
        buyerName: buyerName,
        buyerTaxId: buyerTaxId,
        buyerAddress: buyerAddress,
        buyerRemark: buyerRemark,
        subtotal: subtotal,
        vatAmount: vatAmount,
        grandTotal: grandTotal,
        saleNos: currentSelectedBillItems.map(x => x.saleNo || x.id)
      };

      backend.run
        .withSuccessHandler(function(res) {
          if (res && res.success) {
            // อัปเดตเลขที่ใบวางบิลจริงใน Preview
            document.getElementById('prevBillNo').innerText = res.billNo;

            // ซ่อน Modal Preview
            if (modalInstance) modalInstance.hide();

            // เรียกฟังก์ชันสร้าง PDF
            printBillingNoteDocument();
          } else {
            Swal.fire('เกิดข้อผิดพลาด', res ? res.message : 'ไม่สามารถบันทึกข้อมูลได้', 'error');
          }
        })
        .withFailureHandler(function(err) {
          Swal.fire('เกิดข้อผิดพลาดจาก Server', err.message || err.toString(), 'error');
        })
        .confirmBilling(saleIds, billDateStr, billingData);
    }
  });
}

function resetBillingForm() {
  // ล้าง Array รายการที่เลือก
  currentSelectedBillItems = [];

  // ปลด Checkbox เลือกทั้งหมด และ Checkbox รายตัว
  const checkAll = document.getElementById('checkAllBill');
  if (checkAll) checkAll.checked = false;
  document.querySelectorAll('.bill-item-check').forEach(cb => cb.checked = false);

  // อัปเดตแถบสรุปยอดเลือก (ถ้ามี)
  if (typeof updateBillingSelectionSummary === 'function') {
    updateBillingSelectionSummary();
  }

  // 📌 เพิ่มการเช็ก getUnpaidSalesRecords() เป็นลำดับแรกในการโหลดข้อมูลใหม่
  if (typeof getUnpaidSalesRecords === 'function') {
    getUnpaidSalesRecords();
  } else if (typeof loadUnpaidSales === 'function') {
    loadUnpaidSales();
  } else if (typeof fetchUnpaidBillingRecords === 'function') {
    fetchUnpaidBillingRecords();
  } else if (typeof loadBillingData === 'function') {
    loadBillingData();
  } else {
    location.reload();
  }
}

// 📌 Alias Function รองรับชื่อเดิม ให้ส่งต่อไปทำงานที่ loadBillingData()
function loadUnpaidSales() {
  loadBillingData();
}

function updateBillingBuyerDropdown(records) {
  const sel = document.getElementById('filterBillBuyer');
  if (!sel) return;

  const currentSelection = sel.value;
  const availableBuyers = [...new Set(records.map(item => item && item.buyerName ? String(item.buyerName).trim() : '').filter(Boolean))].sort();

  let html = '<option value="ALL">-- ลูกค้าทั้งหมด (' + availableBuyers.length + ' ราย) --</option>';
  availableBuyers.forEach(buyerName => {
    html += `<option value="${buyerName}">${buyerName}</option>`;
  });

  sel.innerHTML = html;

  if (availableBuyers.includes(currentSelection)) {
    sel.value = currentSelection;
  } else {
    sel.value = 'ALL';
  }
}

function handleBillItemSelect(id, isChecked) {
  if (typeof currentSelectedBillItems === 'undefined') currentSelectedBillItems = [];

  // Fallback ป้องกันกรณีไม่ได้ส่ง isChecked มา
  if (typeof isChecked === 'undefined') {
    const cb = document.querySelector(`.bill-item-check[value="${id}"]`);
    isChecked = cb ? cb.checked : false;
  }

  const itemData = rawUnpaidSalesData.find(x => String(x.id) === String(id));
  if (!itemData) return;

  if (isChecked) {
    if (!currentSelectedBillItems.some(x => String(x.id) === String(id))) {
      currentSelectedBillItems.push(itemData);
    }
  } else {
    currentSelectedBillItems = currentSelectedBillItems.filter(x => String(x.id) !== String(id));
  }

  updateBillingSelectionSummary();
}

// 📌 ฟังก์ชันเลือกทั้งหมด (Check All) ให้เลือกเฉพาะรายการที่คัดกรองแสดงบนหน้าจอ
function toggleSelectAllBillItems(masterCb) {
  if (typeof currentSelectedBillItems === 'undefined') currentSelectedBillItems = [];

  const isChecked = masterCb ? masterCb.checked : false;
  const visibleCheckboxes = document.querySelectorAll('.bill-item-check');

  visibleCheckboxes.forEach(cb => {
    cb.checked = isChecked;
    const itemId = cb.value;
    const itemData = rawUnpaidSalesData.find(x => String(x.id) === String(itemId));

    if (itemData) {
      if (isChecked) {
        if (!currentSelectedBillItems.some(x => String(x.id) === String(itemId))) {
          currentSelectedBillItems.push(itemData);
        }
      } else {
        currentSelectedBillItems = currentSelectedBillItems.filter(x => String(x.id) !== String(itemId));
      }
    }
  });

  updateBillingSelectionSummary();
}

function toggleSelectAllBilling(master) {
  toggleSelectAllBillItems(master);
}

function updateBillingSelectionSummary() {
  const count = currentSelectedBillItems.length;

  // 📌 คำนวณเป็นหน่วย "สตางค์" ป้องกันปัญหา Floating Point Precision
  const totalCents = currentSelectedBillItems.reduce((sumCents, item) => {
    const val = parseFloat(item.totalAmount || item.total || 0);
    return sumCents + Math.round(val * 100);
  }, 0);

  const total = totalCents / 100; // แปลงสตางค์กลับเป็นบาท

  const countEl = document.getElementById('selectedBillCount') || document.querySelector('.badge-selected-count');
  const totalEl = document.getElementById('selectedBillTotal') || document.querySelector('.text-selected-total');

  if (countEl) countEl.innerText = count;
  if (totalEl) totalEl.innerText = total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function filterBillingByBuyer() {
  const sel = document.getElementById('filterBillBuyer');
  const selectedBuyer = sel ? sel.value.trim() : 'ALL';
  
  const sourceData = Array.isArray(rawUnpaidSalesData) ? rawUnpaidSalesData : [];
  let filteredRecords = sourceData;

  // กรองตารางเฉพาะลูกค้าที่เลือก
  if (selectedBuyer && selectedBuyer !== 'ALL') {
    filteredRecords = sourceData.filter(item => {
      const bName = item && item.buyerName ? String(item.buyerName).trim() : '';
      return bName === selectedBuyer;
    });
  }

  // รีเซ็ตรายการที่ติ๊กเลือกป้องกันข้ามลูกค้า
  currentSelectedBillItems = [];
  const masterCheck = document.getElementById('checkAllBill');
  if (masterCheck) masterCheck.checked = false;

  // เรนเดอร์ตารางและสรุปยอด
  renderBillingTable(filteredRecords);
  updateBillingSelectionSummary();
}

function populateBuyerDropdown(records) {
  const buyerSelect = document.getElementById('filterBillBuyer');
  if (!buyerSelect) return;

  // ดึงเฉพาะชื่อผู้ซื้อที่มีใน records (ไม่ซ้ำ และไม่เป็นค่าว่าง)
  const unpaidBuyers = [...new Set(records.map(item => item.buyerName).filter(Boolean))].sort();

  // สร้างตัวเลือกใหม่เฉพาะคนที่มีรายการค้างชำระจริง
  let html = '<option value="ALL">-- ลูกค้าทั้งหมด --</option>';
  unpaidBuyers.forEach(buyer => {
    html += `<option value="${buyer}">${buyer}</option>`;
  });

  // เขียนทับดรอปดาวน์เดิมทันที
  buyerSelect.innerHTML = html;
}

// ==================== CLAIM SYSTEM (FIXED) ====================
// ==================== CLAIM SYSTEM (FIXED) ====================
// ==================== CLAIM SYSTEM (FIXED) ====================
// ==================== CLAIM SYSTEM (FIXED) ====================
// ==================== CLAIM SYSTEM (FIXED) ====================

// ประกาศตัวแปรเก็บรายการที่เลือกไว้ใน Global Scope (ถ้ายังไม่มี)
if (typeof window.currentSelectedClaimItems === 'undefined') {
  window.currentSelectedClaimItems = [];
}

// 1. ฟังก์ชันเมื่อติ๊กเลือก/ยกเลิก รายการแต่ละแถวในตาราง
window.handleClaimItemSelect = function(id, isChecked) {
  if (typeof isChecked === 'undefined') {
    const cb = document.querySelector(`.claim-item-check[value="${id}"]`);
    isChecked = cb ? cb.checked : false;
  }

  // ดึงข้อมูลรายการจาก rawExpenseData เข้า currentSelectedClaimItems
  if (typeof rawExpenseData !== 'undefined' && Array.isArray(rawExpenseData)) {
    const itemData = rawExpenseData.find(x => String(x.id) === String(id));
    if (itemData) {
      if (isChecked) {
        if (!currentSelectedClaimItems.some(x => String(x.id) === String(id))) {
          currentSelectedClaimItems.push(itemData);
        }
      } else {
        currentSelectedClaimItems = currentSelectedClaimItems.filter(x => String(x.id) !== String(id));
      }
    }
  }

  window.updateClaimSelectionSummary();
};

// 2. ฟังก์ชันเลือกทั้งหมด (Select All)
window.toggleSelectAllClaimItems = function(masterCb) {
  const isChecked = masterCb ? masterCb.checked : false;
  const checkboxes = document.querySelectorAll('.claim-item-check:not(:disabled)');

  checkboxes.forEach(cb => {
    cb.checked = isChecked;
    const itemId = cb.value;

    if (typeof rawExpenseData !== 'undefined' && Array.isArray(rawExpenseData)) {
      const itemData = rawExpenseData.find(x => String(x.id) === String(itemId));
      if (itemData) {
        if (isChecked) {
          if (!currentSelectedClaimItems.some(x => String(x.id) === String(itemId))) {
            currentSelectedClaimItems.push(itemData);
          }
        } else {
          currentSelectedClaimItems = currentSelectedClaimItems.filter(x => String(x.id) !== String(itemId));
        }
      }
    }
  });

  window.updateClaimSelectionSummary();
};

// 3. ฟังก์ชันคำนวณและอัปเดตตัวเลขบนหน้าจอ
window.updateClaimSelectionSummary = function() {
  const count = currentSelectedClaimItems.length;

  const totalCents = currentSelectedClaimItems.reduce((sum, item) => {
    const val = parseFloat(item.totalAmount || item.amount || 0);
    return sum + Math.round(val * 100);
  }, 0);

  const grandTotal = totalCents / 100;

  const countEl = document.getElementById('selectedClaimCount');
  const amountEl = document.getElementById('selectedClaimAmount');

  if (countEl) countEl.innerText = count;
  if (amountEl) amountEl.innerText = grandTotal.toLocaleString('th-TH', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

// 4. ตัวกรองเดือน/ปี เฉพาะของหน้าตั้งเบิก (แก้ไขชื่อป้องกันฟังก์ชันซ้ำกับ global.html)
