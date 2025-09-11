// 관리자 전용 API 래퍼 (JWT Bearer)
import './config.js';

function waitForRuntime() {
  return new Promise((resolve) => {
    if (window.RUNTIME) return resolve();
    const tick = () => (window.RUNTIME ? resolve() : setTimeout(tick, 10));
    tick();
  });
}

function getBase() {
  const rt = window.RUNTIME || {};
  const base = rt.API_BASE || 'https://api.limswoo.shop';

  // base가 로컬인지 판단
  const isLocalBase =
    /(^http:\/\/(?:localhost|127\.0\.0\.1)|^https?:\/\/192\.168\.)/i.test(base);

  let prefix = rt.API_PREFIX;
  // null/undefined이거나 빈 문자열인데 로컬이 아니면 강제로 '/api'
  if (prefix == null || (prefix === '' && !isLocalBase)) {
    prefix = '/api';
  }
  return `${base}${prefix}`;
}

function apiUrl(path, params) {
  const base = getBase();
  const url = new URL(String(path).replace(/^\//, ''), base.endsWith('/') ? base : base + '/');
  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  }
  console.debug('[admin.apiUrl]', url.href);
  return url.href;
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try { return { data: JSON.parse(text), text }; }
  catch { return { data: {}, text }; }
}

/* -----------------------------
 * 인증/토큰 유틸
 * ----------------------------- */
function getAdminToken() {
  return sessionStorage.getItem('admin_token') || localStorage.getItem('accesstoken') || '';
}
function setAdminToken(jwt) {
  sessionStorage.setItem('admin_token', jwt);
  sessionStorage.setItem('admin_logged_in', 'true');
  sessionStorage.setItem('admin_login_time', String(Date.now()));
}
function clearAdminSession() {
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_logged_in');
  sessionStorage.removeItem('admin_login_time');
  localStorage.removeItem('accesstoken'); // 구버전 호환
}
function adminHeaders() {
  const token = getAdminToken();
  const headers = { 'Content-Type':'application/json', 'Accept':'application/json' };
  if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  return headers;
}
function isTokenValid() {
  const token = getAdminToken();
  if (!token) return false;

  // JWT exp 확인
  try {
    const parts = token.replace(/^Bearer\s+/i,'').split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.exp && Date.now() > payload.exp * 1000) return false;
      return true;
    }
  } catch {
    // 형식 이상: 로그인 시간으로 24h 체크
  }
  const loginTime = Number(sessionStorage.getItem('admin_login_time') || 0);
  const maxAge = 24 * 60 * 60 * 1000;
  return !!loginTime && (Date.now() - loginTime) < maxAge;
}

/* -----------------------------
 *  🔐 관리자 로그인
 * ----------------------------- */
export async function adminLogin(pin) {
  await waitForRuntime();
  const url = apiUrl('/admin/login'); // 운영에선 자동으로 /api/admin/login
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
    body: JSON.stringify({ pin })
  });

  const { data, text } = await parseJsonSafe(res);
  console.log('[adminLogin]', url, res.status, text);

  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `로그인 실패 (${res.status})`);
  }

  const jwt = data?.data?.token || data?.token;
  if (jwt) setAdminToken(jwt);
  return data;
}

/* -----------------------------
 *  (선택) 토큰 서버 검증
 * ----------------------------- */
export async function validateAndRefreshToken() {
  const token = getAdminToken();
  if (!token) {
    console.log('❌ No token found');
    return false;
  }

  // 클라이언트 만료 체크
  if (!isTokenValid()) {
    console.log('❌ Token invalid/expired (client check)');
    clearAdminSession();
    return false;
  }

  // 서버 검증 엔드포인트가 있으면 사용
  try {
    await waitForRuntime();
    const url = apiUrl('/admin/validate');
    const res = await fetch(url, { method:'GET', headers: adminHeaders() });
    if (res.ok) {
      console.log('✅ Server token validation passed');
      return true;
    }
    console.log('❌ Server token validation failed:', res.status);
    clearAdminSession();
    return false;
  } catch (e) {
    // 엔드포인트 없으면 통과
    console.log('⚠️ Token validation endpoint not available:', e?.message);
    return true;
  }
}

/* -----------------------------
 *  테이블 슬러그 발급
 * ----------------------------- */
export async function ensureTable(label, active = true) {
  await waitForRuntime();
  if (!isTokenValid()) {
    clearAdminSession();
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  const url = apiUrl('/admin/tables/ensure');
  console.log('Calling ensureTable API:', { label, active, url });

  const res = await fetch(url, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ label, active }),
  });

  console.log('ensureTable response status:', res.status, res.statusText);
  if (res.status === 401) {
    clearAdminSession();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  const { data } = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `테이블 발급 실패 (${res.status}: ${res.statusText})`);
  }
  return data?.data || data;
}

/* -----------------------------
 *  진행중 주문(관리자)
 * ----------------------------- */
export async function getActiveOrders() {
  await waitForRuntime();
  const url = apiUrl('/admin/orders/active');
  const res = await fetch(url, { headers: adminHeaders() });
  const { data } = await parseJsonSafe(res);
  if (!res.ok || !data?.success) throw new Error(data?.message || `주문 로드 실패 (${res.status})`);
  return data;
}

/* -----------------------------
 *  관리자용 주문 상세 (경로 호환)
 *  1차: /admin/orders/:id
 *  2차: /orders/admin/:id  (서버가 이렇게 줄 수도 있어 폴백)
 * ----------------------------- */
export async function getOrderDetails(orderId) {
  await waitForRuntime();
  if (!isTokenValid()) {
    clearAdminSession();
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  // 1차 시도
  let url = apiUrl(`/admin/orders/${orderId}`);
  let res = await fetch(url, { method: 'GET', headers: adminHeaders() });

  // 404면 폴백 경로도 시도
  if (res.status === 404) {
    url = apiUrl(`/orders/admin/${orderId}`);
    res = await fetch(url, { method: 'GET', headers: adminHeaders() });
  }

  if (res.status === 401) {
    clearAdminSession();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  const { data } = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `주문 조회 실패 (${res.status})`);
  }
  return data?.data || data;
}

/* -----------------------------
 *  주문 상태 변경 (경로 호환)
 *  1차: /admin/orders/:id/status
 *  2차: /orders/:id/status
 * ----------------------------- */
export async function patchOrderStatus(orderId, action, reason) {
  await waitForRuntime();
  if (!isTokenValid()) {
    clearAdminSession();
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  // 1차 시도
  let url = apiUrl(`/admin/orders/${orderId}/status`);
  let res = await fetch(url, {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify({ action, reason }),
  });

  // 404면 폴백
  if (res.status === 404) {
    url = apiUrl(`/orders/${orderId}/status`);
    res = await fetch(url, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ action, reason }),
    });
  }

  if (res.status === 401) {
    clearAdminSession();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  const { data } = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `상태 변경 실패 (${res.status})`);
  }
  return data;
}

/* -----------------------------
 *  세션 강제 종료 (경로 호환)
 *  1차: /admin/sessions/:id/close
 *  2차: /sessions/:id/close
 * ----------------------------- */
export async function forceCloseSession(sessionId) {
  await waitForRuntime();
  if (!isTokenValid()) {
    clearAdminSession();
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  // 1차
  let url = apiUrl(`/admin/sessions/${sessionId}/close`);
  let res = await fetch(url, { method: 'POST', headers: adminHeaders() });

  // 404 폴백
  if (res.status === 404) {
    url = apiUrl(`/sessions/${sessionId}/close`);
    res = await fetch(url, { method: 'POST', headers: adminHeaders() });
  }

  if (res.status === 401) {
    clearAdminSession();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  const { data } = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `세션 강제 종료 실패 (${res.status})`);
  }
  return data;
}

/* -----------------------------
 *  관리자용 전체 메뉴 조회 (경로 호환)
 *  1차: /admin/menu
 *  2차: /menu/admin
 * ----------------------------- */
export async function getAdminMenu() {
  await waitForRuntime();
  if (!isTokenValid()) {
    clearAdminSession();
    throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
  }

  // 1차
  let url = apiUrl('/admin/menu');
  let res = await fetch(url, { method:'GET', headers: adminHeaders() });

  // 404면 폴백
  if (res.status === 404) {
    url = apiUrl('/menu/admin');
    res = await fetch(url, { method:'GET', headers: adminHeaders() });
  }

  if (res.status === 401) {
    clearAdminSession();
    throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
  }

  const { data } = await parseJsonSafe(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `메뉴 조회 실패 (${res.status})`);
  }
  return data?.data || [];
}

/* -----------------------------
 *  실시간 주문 스트림 (SSE)
 *  ⚠️ 브라우저 EventSource는 헤더 설정 불가 → 토큰은 쿼리로 전달 필요
 *  서버가 ?token=... 지원 안하면 폴링으로 폴백
 * ----------------------------- */
export function createOrderStream(onMessage, onError) {
  return new Promise(async (resolve, reject) => {
    await waitForRuntime();

    // 토큰 체크
    if (!isTokenValid()) {
      clearAdminSession();
      const err = new Error('로그인이 필요합니다. 다시 로그인해주세요.');
      if (onError) onError(err);
      return reject(err);
    }

    const rawToken = getAdminToken().replace(/^Bearer\s+/i,'');
    const sseUrlPrimary = apiUrl('/admin/sse/orders/stream', { token: rawToken }); // 권장
    const sseUrlFallback = apiUrl('/sse/orders/stream',       { token: rawToken }); // 폴백

    let es;
    try {
      // 1차 시도
      es = new EventSource(sseUrlPrimary, { withCredentials: false });
      wire(es);
      resolve(es);
    } catch (e1) {
      console.warn('SSE 1차 연결 실패, 폴백 시도:', e1);
      try {
        es = new EventSource(sseUrlFallback, { withCredentials: false });
        wire(es);
        resolve(es);
      } catch (e2) {
        console.error('SSE 폴백도 실패, 폴링으로 전환:', e2);
        startPolling(onMessage);
        resolve({ close: () => clearInterval(window.__ADMIN_POLL_TIMER__) });
      }
    }

    function wire(eventSource) {
      eventSource.onopen = () => console.log('✅ SSE 연결 성공');
      eventSource.onerror = (err) => {
        console.error('❌ SSE 오류:', err);
        if (onError) onError(err);
      };

      // 스냅샷
      eventSource.addEventListener('snapshot', (ev) => {
        try { onMessage && onMessage('snapshot', JSON.parse(ev.data)); }
        catch(e){ console.error('snapshot parse error', e); }
      });
      // 변경 이벤트
      eventSource.addEventListener('orders_changed', (ev) => {
        try { onMessage && onMessage('orders_changed', JSON.parse(ev.data)); }
        catch(e){ console.error('orders_changed parse error', e); }
      });
      // 핑
      eventSource.addEventListener('ping', (ev) => {
        onMessage && onMessage('ping', ev.data);
      });
    }

    function startPolling(cb) {
      // 10초 폴링
      const poll = async () => {
        try {
          const data = await getActiveOrders(); // { data:{urgent,waiting,preparing}, meta }
          cb && cb('snapshot', data);
        } catch (e) {
          onError && onError(e);
        }
      };
      poll();
      window.__ADMIN_POLL_TIMER__ = setInterval(poll, 10_000);
    }
  });
}
