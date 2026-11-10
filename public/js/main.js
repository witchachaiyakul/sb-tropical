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