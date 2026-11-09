const moduleNames = [
  'loginScreen',
  'mainMenuSection',
  'salesModuleSection',
  'expenseModuleSection',
  'billingModuleSection',
  'claimModuleSection',
  'oilStockModuleSection',
  'paymentManagementModuleSection',
  'receiptModuleSection',
  'financialSummaryModuleSection',
  'customerSalesReportModuleSection',
  'monthlyExpenseReportModuleSection'
];

async function loadModule(name) {
  const response = await fetch(`/modules/${name}.html`);
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลด ${name}.html ได้ (${response.status})`);
  }
  document.body.insertAdjacentHTML('beforeend', await response.text());
}

function loadScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`ไม่สามารถโหลด ${path} ได้`));
    document.body.appendChild(script);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    for (const name of moduleNames) await loadModule(name);

    const scripts = [
      '/js/api-client.js',
      ...moduleNames.map(name => `/js/${name}.js`)
    ];
    for (const path of scripts) await loadScript(path);

    document.dispatchEvent(new Event('app:ready'));
  } catch (error) {
    console.error('Application initialization failed:', error);
    const errorElement = document.getElementById('appLoadError');
    if (errorElement) {
      errorElement.hidden = false;
      errorElement.textContent = `เริ่มต้นระบบไม่สำเร็จ: ${error.message}`;
    }
  }
});
