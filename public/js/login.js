// public/js/login.js

window.currentUser = null;
const IS_DEV = true; // Set to true for development mode, false for production

document.addEventListener('DOMContentLoaded', function () {
  initLoginSystem();
});

function initLoginSystem() {
  const isLoginPage = window.location.pathname.includes('login.html');

  // 🟢 1. โหมด DEV สำหรับทดสอบระบบ (Bypass Login)
  if (typeof IS_DEV !== 'undefined' && IS_DEV) {
    window.currentUser = { username: 'dev_user', name: 'Developer (Dev Mode)', role: 'admin' };
    
    // บันทึก Session จำลองไว้ใน sessionStorage
    sessionStorage.setItem('sbTropicalUser', JSON.stringify(window.currentUser));
    sessionStorage.setItem('sbTropicalSessionToken', 'dev_token_12345');

    // หากเปิดผ่านหน้า login.html ให้ข้ามไป main.html ทันที
    if (isLoginPage) {
      window.location.href = 'main.html';
      return;
    }

    // ซ่อนหน้า Login Screen (กรณีใช้โครงสร้าง Single Page)
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';

    // อัปเดตข้อมูลผู้ใช้บน Header Navbar
    updateUserHeaderUI();

    if (typeof showModule === 'function') showModule('mainMenuSection');
    return;
  }

  // 🟢 2. ตรวจสอบ Auto-Login จาก sessionStorage (กรณีผู้ใช้เคยเข้าสู่ระบบแล้ว)
  const savedUser = sessionStorage.getItem('sbTropicalUser');
  const token = sessionStorage.getItem('sbTropicalSessionToken');

  if (savedUser && token) {
    try {
      window.currentUser = JSON.parse(savedUser);

      // หากมี Session แล้วแต่อยู่หน้า login.html ให้ส่งไปหน้า main.html
      if (isLoginPage) {
        window.location.href = 'main.html';
        return;
      }

      const loginScreen = document.getElementById('loginScreen');
      if (loginScreen) loginScreen.style.display = 'none';

      // อัปเดตข้อมูลผู้ใช้บน Header Navbar
      updateUserHeaderUI();

      if (typeof showModule === 'function') showModule('mainMenuSection');
      return;
    } catch (e) {
      sessionStorage.removeItem('sbTropicalUser');
      sessionStorage.removeItem('sbTropicalSessionToken');
    }
  }

  // 🟢 3. ผูก Event Listener กับฟอร์มเข้าสู่ระบบ (หากยังไม่ได้เข้าสู่ระบบ)
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.removeEventListener('submit', handleLoginSubmit);
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
}

/**
 * ฟังก์ชันช่วยอัปเดตชื่อผู้ใช้และบทบาทบน Header
 */
function updateUserHeaderUI() {
  if (!window.currentUser) return;
  const nameEl = document.getElementById('userDisplayName');
  const roleEl = document.getElementById('userRoleBadge');
  
  if (nameEl) nameEl.innerText = window.currentUser.name || window.currentUser.username;
  if (roleEl) roleEl.innerText = window.currentUser.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานขาย';
}

// ==================== LOGIN HANDLER ====================
async function handleLoginSubmit(e) {
  e.preventDefault();

  const userVal = document.getElementById('loginUsername').value.trim();
  const passVal = document.getElementById('loginPassword').value.trim();

  if (!userVal || !passVal) {
    if (typeof Swal !== 'undefined') Swal.fire('กรอกข้อมูลไม่ครบ', 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน', 'warning');
    return;
  }

  if (typeof Swal !== 'undefined') {
    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  }

  try {
    const res = await checkLogin(userVal, passVal);

    if (typeof Swal !== 'undefined') Swal.close();

    if (res && res.success) {
      window.currentUser = res.user;

      if (res.token) sessionStorage.setItem('sbTropicalSessionToken', res.token);
      sessionStorage.setItem('sbTropicalUser', JSON.stringify(res.user));

      // 🟢 หากล็อกอินสำเร็จจากหน้า login.html ให้ย้ายไปหน้า main.html
      if (window.location.pathname.includes('login.html')) {
        window.location.href = 'main.html';
        return;
      }

      const loginScreen = document.getElementById('loginScreen');
      if (loginScreen) loginScreen.style.display = 'none';

      updateUserHeaderUI();

      if (typeof showModule === 'function') showModule('mainMenuSection');
    } else {
      if (typeof Swal !== 'undefined') {
        Swal.fire('เข้าสู่ระบบไม่สำเร็จ', res ? res.message : 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง', 'error');
      }
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
    }
    console.error("Login Error:", err);
  }
}