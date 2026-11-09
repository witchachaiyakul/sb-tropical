const SESSION_TOKEN_KEY = 'sbTropicalSessionToken';
sessionStorage.removeItem(SESSION_TOKEN_KEY);

async function callBackend(method, args) {
  const headers = { 'Content-Type': 'application/json' };
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch('/api/call', {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, args })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || `Backend request failed (${response.status})`);
  }

  if (method === 'checkLogin' && result.success && result.token) {
    sessionStorage.setItem(SESSION_TOKEN_KEY, result.token);
  }

  return result;
}

function createBackendRunner(successHandler, failureHandler) {
  return new Proxy(function () {}, {
    get(_target, property) {
      if (property === 'withSuccessHandler') {
        return handler => createBackendRunner(handler, failureHandler);
      }
      if (property === 'withFailureHandler') {
        return handler => createBackendRunner(successHandler, handler);
      }
      if (property === 'then') return undefined;
      if (typeof property !== 'string') return undefined;

      return (...args) => {
        callBackend(property, args)
          .then(result => {
            if (typeof successHandler === 'function') successHandler(result);
          })
          .catch(error => {
            if (typeof failureHandler === 'function') {
              failureHandler(error);
              return;
            }

            console.error(`Backend request "${property}" failed:`, error);
            if (typeof Swal !== 'undefined') {
              Swal.fire('เกิดข้อผิดพลาดจาก Server', error.message, 'error');
            }
          });
      };
    }
  });
}

globalThis.backend = Object.freeze({ run: createBackendRunner() });
