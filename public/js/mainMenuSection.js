function showModule(sectionId) {
  // 1. รายการ Section ทั้งหมดในระบบ (เพิ่ม monthlyExpenseReportModuleSection)
  const sections = [
    'mainMenuSection', 
    'salesModuleSection', 
    'expenseModuleSection', 
    'billingModuleSection', 
    'claimModuleSection',
    'oilStockModuleSection',
    'financialSummaryModuleSection',
    'paymentManagementModuleSection',
    'customerSalesReportModuleSection',
    'receiptModuleSection',
    'monthlyExpenseReportModuleSection' // 👈 เพิ่มโมดูลรายงานสรุปยอดค่าใช้จ่ายรายเดือน
  ];
  
  // 2. ซ่อนทุก Section และปลดคลาส d-none ออก
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('d-none'); // ลบ d-none ออกเพื่อป้องกัน !important ค้าง
    }
  });

  // 3. แสดง Section ที่เลือก
  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = 'block';
    target.classList.remove('d-none'); // ปลด d-none ที่ตัว target อีกครั้งเพื่อความชัวร์
  }

  // 4. จัดการปุ่ม Home (กลับหน้าหลัก)
  const navBtnHome = document.getElementById('navBtnHome');
  if (navBtnHome) {
    if (sectionId === 'mainMenuSection') {
      navBtnHome.classList.add('d-none');
    } else {
      navBtnHome.classList.remove('d-none');
    }
  }

  // 5. โหลดข้อมูลตามโมดูลที่เปิด
  if (sectionId === 'salesModuleSection') {
    loadBuyers();
    updateSaleNoPreview();
    loadSalesData();
  } else if (sectionId === 'expenseModuleSection') {
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('expenseDate')) document.getElementById('expenseDate').value = today;
    updateExpenseNoPreview();
    loadPayRecords();
    loadTransferAccounts();
    loadExpenseData();
  } else if (sectionId === 'billingModuleSection') {
    setupMonthYearDropdowns('filterBillStartMonth', 'filterBillStartYear', 'filterBillEndMonth', 'filterBillEndYear');
    loadBillingData(); 
  } else if (sectionId === 'claimModuleSection') {
    setupMonthYearDropdowns('filterClaimStartMonth', 'filterClaimStartYear', 'filterClaimEndMonth', 'filterClaimEndYear');
    loadClaimData();
  } else if (sectionId === 'oilStockModuleSection') {
    loadOilStockData();
  } else if (sectionId === 'financialSummaryModuleSection') {
    loadFinancialSummaryData();
  } else if (sectionId === 'paymentManagementModuleSection') {
    loadPaymentManagementData();
  } else if (sectionId === 'customerSalesReportModuleSection') {
    loadCustomerSalesReport();
  } else if (sectionId === 'receiptModuleSection') {
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('rcpEndDate') && !document.getElementById('rcpEndDate').value) {
      document.getElementById('rcpEndDate').value = today;
    }
    loadUnreceiptedData();
  } else if (sectionId === 'monthlyExpenseReportModuleSection') { // 👈 โหลดข้อมูลเมื่อเปิดโมดูลรายงานค่าใช้จ่ายรายเดือน
    initMonthlyExpenseReport();
  }
}

    // ==================== BUYERS SYSTEM ====================
