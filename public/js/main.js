// public/js/mainMenuSection.js

document.addEventListener('DOMContentLoaded', function () {
  checkAppAuth();
});

/**
 * 🟢 ตรวจสอบสถานะการเข้าสู่ระบบเมื่อเริ่มโหลดหน้าเว็บ
 */
function checkAppAuth() {
  const savedUser = sessionStorage.getItem('sbTropicalUser');
  const token = sessionStorage.getItem('sbTropicalSessionToken');

  if (savedUser && token) {
    try {
      window.currentUser = JSON.parse(savedUser);
      updateUserHeaderUI();
      
      // แสดงหน้าเมนูหลักหากยังไม่ได้เลือกโมดูลใด
      showModule('mainMenuSection');
    } catch (e) {
      console.error("Session Parse Error:", e);
      redirectToLogin();
    }
  } else {
    // ถ้าไม่มี Session ให้กลับไปหน้า Login
    redirectToLogin();
  }
}

/**
 * 🟢 อัปเดตข้อมูลชื่อและ Role ผู้ใช้บน Navbar
 */
function updateUserHeaderUI() {
  if (!window.currentUser) return;
  
  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userRoleBadge');

  if (nameEl) nameEl.innerText = window.currentUser.name || window.currentUser.username;
  if (roleEl) roleEl.innerText = window.currentUser.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานขาย';
}

/**
 * 🟢 ส่งกลับหน้า Login หากไม่ได้เข้าสู่ระบบ
 */
function redirectToLogin() {
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) {
    loginScreen.style.display = 'flex';
    const mainSection = document.getElementById('mainMenuSection');
    if (mainSection) mainSection.style.display = 'none';
  } else {
    window.location.href = 'login.html';
  }
}

/**
 * 🟢 ฟังก์ชันหลักในการสลับโมดูลการทำงาน (Section Navigation)
 */
function showModule(sectionId) {
  // 1. รายการ Section ทั้งหมดในระบบ
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
    'monthlyExpenseReportModuleSection'
  ];
  
  // 2. ซ่อนทุก Section และปลดคลาส d-none
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('d-none');
    }
  });

  // 3. แสดง Section ที่เลือก
  const target = document.getElementById(sectionId);
  if (target) {
    target.style.display = 'block';
    target.classList.remove('d-none');
  }

  // 4. จัดการแสดง/ซ่อน ปุ่ม Home (กลับหน้าหลัก)
  const navBtnHome = document.getElementById('navBtnHome');
  if (navBtnHome) {
    if (sectionId === 'mainMenuSection') {
      navBtnHome.classList.add('d-none');
    } else {
      navBtnHome.classList.remove('d-none');
    }
  }

  // 5. โหลดข้อมูลตามโมดูลที่เปิดอย่างปลอดภัย (เช็คฟังก์ชันก่อนเรียก)
  try {
    if (sectionId === 'salesModuleSection') {
      if (typeof loadBuyers === 'function') loadBuyers();
      if (typeof updateSaleNoPreview === 'function') updateSaleNoPreview();
      if (typeof loadSalesData === 'function') loadSalesData();
    } else if (sectionId === 'expenseModuleSection') {
      const today = new Date().toISOString().split('T')[0];
      const dateInput = document.getElementById('expenseDate');
      if (dateInput) dateInput.value = today;

      if (typeof updateExpenseNoPreview === 'function') updateExpenseNoPreview();
      if (typeof loadPayRecords === 'function') loadPayRecords();
      if (typeof loadTransferAccounts === 'function') loadTransferAccounts();
      if (typeof loadExpenseData === 'function') loadExpenseData();
    } else if (sectionId === 'billingModuleSection') {
      if (typeof setupMonthYearDropdowns === 'function') {
        setupMonthYearDropdowns('filterBillStartMonth', 'filterBillStartYear', 'filterBillEndMonth', 'filterBillEndYear');
      }
      if (typeof loadBillingData === 'function') loadBillingData(); 
    } else if (sectionId === 'claimModuleSection') {
      if (typeof setupMonthYearDropdowns === 'function') {
        setupMonthYearDropdowns('filterClaimStartMonth', 'filterClaimStartYear', 'filterClaimEndMonth', 'filterClaimEndYear');
      }
      if (typeof loadClaimData === 'function') loadClaimData();
    } else if (sectionId === 'oilStockModuleSection') {
      if (typeof loadOilStockData === 'function') loadOilStockData();
    } else if (sectionId === 'financialSummaryModuleSection') {
      if (typeof loadFinancialSummaryData === 'function') loadFinancialSummaryData();
    } else if (sectionId === 'paymentManagementModuleSection') {
      if (typeof loadPaymentManagementData === 'function') loadPaymentManagementData();
    } else if (sectionId === 'customerSalesReportModuleSection') {
      if (typeof loadCustomerSalesReport === 'function') loadCustomerSalesReport();
    } else if (sectionId === 'receiptModuleSection') {
      const today = new Date().toISOString().split('T')[0];
      const rcpEndDate = document.getElementById('rcpEndDate');
      if (rcpEndDate && !rcpEndDate.value) {
        rcpEndDate.value = today;
      }
      if (typeof loadUnreceiptedData === 'function') loadUnreceiptedData();
    } else if (sectionId === 'monthlyExpenseReportModuleSection') {
      if (typeof initMonthlyExpenseReport === 'function') initMonthlyExpenseReport();
    }
  } catch (err) {
    console.error(`❌ Error loading module (${sectionId}):`, err);
  }
}

/**
 * 🟢 ฟังก์ชันช่วยสำหรับการตั้งค่าตัวเลือก เดือน/ปี ใน Dropdown Filter
 */
function setupMonthYearDropdowns(startMonthId, startYearId, endMonthId, endYearId) {
  const months = [
    { val: '01', text: 'มกราคม' }, { val: '02', text: 'กุมภาพันธ์' },
    { val: '03', text: 'มีนาคม' }, { val: '04', text: 'เมษายน' },
    { val: '05', text: 'พฤษภาคม' }, { val: '06', text: 'มิถุนายน' },
    { val: '07', text: 'กรกฎาคม' }, { val: '08', text: 'สิงหาคม' },
    { val: '09', text: 'กันยายน' }, { val: '10', text: 'ตุลาคม' },
    { val: '11', text: 'พฤศจิกายน' }, { val: '12', text: 'ธันวาคม' }
  ];

  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentYearBE = now.getFullYear() + 543;

  const monthIds = [startMonthId, endMonthId];
  const yearIds = [startYearId, endYearId];

  monthIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length <= 1) {
      el.innerHTML = '<option value="">-- เลือกเดือน --</option>';
      months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.val;
        opt.textContent = m.text;
        if (m.val === currentMonth) opt.selected = true;
        el.appendChild(opt);
      });
    }
  });

  yearIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length <= 1) {
      el.innerHTML = '<option value="">-- เลือกปี พ.ศ. --</option>';
      for (let y = currentYearBE; y >= currentYearBE - 5; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === currentYearBE) opt.selected = true;
        el.appendChild(opt);
      }
    }
  });
}