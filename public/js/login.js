// public/js/login.js

window.currentUser = null;
const IS_DEV = false; // ต้องเป็น false เพื่อให้ใช้งานหน้า Login / Logout ได้จริง

document.addEventListener('DOMContentLoaded', function () {
  initLoginSystem();
});

function initLoginSystem() {
  const isLoginPage = window.location.pathname.includes('login.html');

  // 🟢 1. โหมด DEV สำหรับทดสอบระบบ (Bypass Login)
  if (typeof IS_DEV !== 'undefined' && IS_DEV) {
    window.currentUser = { username: 'dev_user', name: 'Developer (Dev Mode)', role: 'admin' };
    sessionStorage.setItem('sbTropicalUser', JSON.stringify(window.currentUser));
    sessionStorage.setItem('sbTropicalSessionToken', 'dev_token_12345');

    if (isLoginPage) {
      window.location.href = 'main.html';
      return;
    }

    updateUserHeaderUI();
    return;
  }

  // 🟢 2. ตรวจสอบสถานะการเข้าสู่ระบบจาก sessionStorage
  const savedUser = sessionStorage.getItem('sbTropicalUser');
  const token = sessionStorage.getItem('sbTropicalSessionToken');

  if (savedUser && token) {
    try {
      window.currentUser = JSON.parse(savedUser);

      // หากล็อกอินอยู่แล้ว แต่เปิดเข้ามาที่หน้า login.html ให้ส่งไปหน้า main.html
      if (isLoginPage) {
        window.location.href = 'main.html';
        return;
      }

      // อัปเดตชื่อผู้ใช้และตำแหน่งบน Navbar
      updateUserHeaderUI();
      return;
    } catch (e) {
      sessionStorage.removeItem('sbTropicalUser');
      sessionStorage.removeItem('sbTropicalSessionToken');
    }
  } else {
    // 🟢 เพิ่มใหม่: หากยังไม่ได้เข้าสู่ระบบ (หรือกดออกจากระบบแล้ว) และไม่ได้อยู่หน้า login.html ให้ดีดกลับหน้า login.html ทันที
    if (!isLoginPage) {
      window.location.href = 'login.html';
      return;
    }
  }

  // 🟢 3. ผูก Event Listener กับฟอร์มเข้าสู่ระบบ (เฉพาะหน้า login.html)
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.removeEventListener('submit', handleLoginSubmit);
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
}

/**
 * อัปเดตชื่อผู้ใช้และบทบาทบน Header Navbar
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

      sessionStorage.setItem('sbTropicalSessionToken', res.token || 'logged_in_token');
      sessionStorage.setItem('sbTropicalUser', JSON.stringify(res.user));

      // ย้ายไปหน้า main.html ทันที
      window.location.href = 'main.html';
    } else {
      if (typeof Swal !== 'undefined') {
        Swal.fire('เข้าสู่ระบบไม่สำเร็จ', res ? res.message : 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง', 'error');
      }
    }
  } catch (err) {
    if (typeof Swal !== 'undefined') {
      Swal.fire('เกิดข้อผิดพลาดจากระบบ', err.message || err.toString(), 'error');
    }
    console.error('Login Error:', err);
  }
}

// ==================== LOGOUT HANDLER (เพิ่มใหม่) ====================
function logout() {
  const performLogout = () => {
    window.currentUser = null;

    // ล้างข้อมูล Session ออกจากเบราว์เซอร์
    sessionStorage.removeItem('sbTropicalUser');
    sessionStorage.removeItem('sbTropicalSessionToken');

    // กลับไปหน้า login.html
    window.location.href = 'login.html';
  };

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'ออกจากระบบ?',
      text: 'คุณต้องการออกจากระบบใช่หรือไม่',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ตกลง',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#d33'
    }).then((res) => {
      if (res.isConfirmed) performLogout();
    });
  } else {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่')) performLogout();
  }
}