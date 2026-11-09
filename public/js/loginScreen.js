    // ==================== GLOBAL VARIABLES ====================
    let currentUser = null;
    let rawSalesData = [];
    let dataTableInstance = null;
    let rawExpenseData = [];
    let expenseTableInstance = null;
    let addBuyerModalInstance = null;
    let fp = null;
    let addPayRecordModalInstance = null;
    let lastSelectedPayType = null;
    let rawUnpaidSalesData = [];
    let billingTableInstance = null;
    let currentSelectedBillItems = [];
    let currentBillingBuyerInfo = null;
    let currentSelectedClaimItems = [];
    let currentPaymentTab = 'credit';
    let creditSalesCache = [];
    let companyExpenseCache = [];
    let globalTransferAccounts = [];
    let isTransferAccountsLoaded = false;
    let rawOilStockSummary = { stock95: {}, stockDiesel: {} };
    let rawOilStockMovements = [];
    let currentOilStockData = { stock95: {}, stockDiesel: {} };
    let stockFp = null;
    let unreceiptedCache = [];
        

    const THAI_MONTHS = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];

    const IS_DEV = false;

    // ==================== APP INITIALIZATION ====================
    document.addEventListener("app:ready", function () {
      initFlatpickr();
      initAllMonthYearFilters();
      initRcpFilters();

      // ตั้งค่าวันที่ปัจจุบันสำหรับฟอร์มบันทึกค่าใช้จ่าย
      const today = new Date().toISOString().split('T')[0];
      if (document.getElementById('expenseDate')) {
        document.getElementById('expenseDate').value = today;
      }

      // ตั้งค่าเริ่มต้นเดือนและ พ.ศ. ปัจจุบันสำหรับระบบบันทึกการชำระเงินและการโอนจ่าย
      const currentMonth = ("0" + (new Date().getMonth() + 1)).slice(-2);
      const currentYearBE = new Date().getFullYear() + 543;

      if (document.getElementById('pmtFilterMonth')) {
        document.getElementById('pmtFilterMonth').value = currentMonth;
      }
      if (document.getElementById('pmtFilterYear')) {
        document.getElementById('pmtFilterYear').value = String(currentYearBE);
      }

      // โหมด DEV บายพาสระบบ Login
      if (typeof IS_DEV !== 'undefined' && IS_DEV) {
        currentUser = { username: 'dev_user', name: 'Developer (Dev Mode)', role: 'admin' };
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.style.display = 'none';
        
        const nameEl = document.getElementById('userDisplayName');
        const roleEl = document.getElementById('userRoleBadge');
        if (nameEl) nameEl.innerText = currentUser.name;
        if (roleEl) roleEl.innerText = 'ผู้ดูแลระบบ (DEV)';

        showModule('mainMenuSection');
      }

    });

    // ==================== LOGIN & LOGOUT SYSTEM ====================
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      const userVal = document.getElementById('loginUsername').value.trim();
      const passVal = document.getElementById('loginPassword').value.trim();

      Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      backend.run
        .withSuccessHandler(function(res) {
          Swal.close();
          if (res.success) {
            currentUser = res.user;
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('userDisplayName').innerText = currentUser.name || currentUser.username;
            document.getElementById('userRoleBadge').innerText = currentUser.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานขาย';
            showModule('mainMenuSection');
          } else {
            Swal.fire('เข้าสู่ระบบไม่สำเร็จ', res.message, 'error');
          }
        })
        .withFailureHandler(function(err) {
          Swal.fire('เกิดข้อผิดพลาดจาก Server', err.message || err.toString(), 'error');
        })
        .checkLogin(userVal, passVal);
    });

    function logout() {
      Swal.fire({ title: 'ออกจากระบบ?', icon: 'question', showCancelButton: true, confirmButtonText: 'ตกลง', cancelButtonText: 'ยกเลิก' })
        .then((res) => {
          if (res.isConfirmed) {
            currentUser = null;
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            document.getElementById('mainMenuSection').style.display = 'none';
            document.getElementById('salesModuleSection').style.display = 'none';
            if (document.getElementById('expenseModuleSection')) document.getElementById('expenseModuleSection').style.display = 'none';
            if (document.getElementById('billingModuleSection')) document.getElementById('billingModuleSection').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('loginForm').reset();
          }
        });
    }

    // ==================== FLATPICKR DATEPICKER ====================
    function initFlatpickr() {
      fp = flatpickr("#saleDate", {
        locale: "th",
        dateFormat: "d/m/Y",
        defaultDate: new Date(),
        disableMobile: "true",
        onReady: function(selectedDates, dateStr, instance) {
          updateDisplayToBE(instance);
        },
        onChange: function(selectedDates, dateStr, instance) {
          updateDisplayToBE(instance);
          updateSaleNoPreview();
        }
      });

      const btnCal = document.getElementById('btnCalendar');
      if (btnCal) {
        btnCal.addEventListener('click', function() {
          if (fp) fp.open();
        });
      }
    }

    function updateDisplayToBE(instance) {
      if (instance && instance.selectedDates && instance.selectedDates.length > 0) {
        const d = instance.selectedDates[0];
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const yearBE = d.getFullYear() + 543;
        instance.input.value = `${day}/${month}/${yearBE}`;
      }
    }

    // ==================== NAVIGATION SWITCHER ====================
