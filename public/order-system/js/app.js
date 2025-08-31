import { createOrder, openSessionBySlug } from './api-session.js';
import { PRODUCT_ID_MAP } from './product-map.js';
import { Tokens } from './tokens.js';   // 세션 토큰 관리
import './config.js';                  // 전역 설정 필요 시

// URL 파라미터 확인 및 세션 오픈
(async () => {
  const url = new URL(location.href);
  const slug = url.searchParams.get('slug'); // ?slug=ezygbX
  const tableParam = url.searchParams.get('table'); // ?table=5 (레거시)
  
  if (slug) {
    // 새로운 slug 방식
    try {
      console.log('Slug 기반 세션 오픈 시도:', slug);
      const sessionData = await openSessionBySlug(slug);
      console.log('✅ 세션 오픈 성공:', sessionData);
      
      // 테이블 정보 자동 설정
      if (sessionData.data?.table) {
        const tableInfo = sessionData.data.table;
        console.log('테이블 정보 설정:', tableInfo);
        
        // 테이블 정보를 JSON으로 저장
        window.sessionStorage.setItem('auto_table_info', JSON.stringify(tableInfo));
        
        // 매장 이용으로 자동 설정
        window.sessionStorage.setItem('auto_order_type', 'dine-in');
      }
    } catch (e) {
      console.warn('세션 오픈 실패:', e.message);
      alert('테이블 세션 연결에 실패했습니다. 관리자에게 문의해주세요.');
    }
  }
})();

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 로드 완료');
    
    // 인기 메뉴 로드 함수 (먼저 정의)
    function loadPopularMenus() {
        if (!db) {
            console.log('Firebase가 연결되지 않아 인기 메뉴를 로드할 수 없습니다');
            const popularMenuList = document.getElementById('popular-menu-list');
            if (popularMenuList) {
                popularMenuList.innerHTML = '<div class="no-data">서버 연결 중...</div>';
            }
            return;
        }
        
        const ordersRef = db.ref('orders');
        ordersRef.on('value', (snapshot) => {
            const orders = snapshot.val();
            const menuStats = {};
            
            if (orders) {
                // 모든 주문에서 메뉴 통계 계산
                Object.values(orders).forEach(order => {
                    if (order.items) {
                        Object.entries(order.items).forEach(([menuName, item]) => {
                            if (menuStats[menuName]) {
                                menuStats[menuName] += item.quantity;
                            } else {
                                menuStats[menuName] = item.quantity;
                            }
                        });
                    }
                });
                
                // 상위 3개 메뉴 추출
                const popularMenus = Object.entries(menuStats)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 3);
                
                displayPopularMenus(popularMenus);
            } else {
                const popularMenuList = document.getElementById('popular-menu-list');
                if (popularMenuList) {
                    popularMenuList.innerHTML = '<div class="no-data">아직 주문 데이터가 없습니다</div>';
                }
            }
        });
    }
    
    // 인기 메뉴 표시 함수
    function displayPopularMenus(popularMenus) {
        const popularMenuList = document.getElementById('popular-menu-list');
        
        if (!popularMenuList) return;
        
        if (popularMenus.length === 0) {
            popularMenuList.innerHTML = '<div class="no-data">아직 주문 데이터가 없습니다</div>';
            return;
        }
        
        let html = '';
        popularMenus.forEach(([menuName, count], index) => {
            const medal = ['🥇', '🥈', '🥉'][index];
            html += `
                <div class="popular-menu-item">
                    <span class="popular-rank">${medal}</span>
                    <span class="popular-name">${menuName}</span>
                    <span class="popular-count">${count}회 주문</span>
                </div>
            `;
        });
        
        popularMenuList.innerHTML = html;
    }
    
    // Firebase 초기화 (안전한 방식으로)
    let db = null;
    let isFirebaseConnected = false;
    
    // Firebase 로드 대기 및 초기화
    function initializeFirebase() {
        try {
            if (typeof firebase !== 'undefined' && typeof firebaseConfig !== 'undefined') {
                // Firebase가 이미 초기화되었는지 확인
                if (firebase.apps.length === 0) {
                    firebase.initializeApp(firebaseConfig);
                }
                
                db = firebase.database();
                console.log('✅ Firebase 초기화 성공');
                
                // 데이터베이스 연결 상태 모니터링
                db.ref('.info/connected').on('value', (snapshot) => {
                    const connected = snapshot.val() === true;
                    if (connected && !isFirebaseConnected) {
                        console.log('✅ Firebase 데이터베이스 연결됨');
                        isFirebaseConnected = true;
                        
                        // 연결 성공 후 인기 메뉴 로드
                        loadPopularMenus();
                    } else if (!connected && isFirebaseConnected) {
                        console.warn('⚠️ Firebase 데이터베이스 연결 끊어짐');
                        isFirebaseConnected = false;
                    }
                });
                
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('❌ Firebase 초기화 실패:', error);
            return false;
        }
    }
    
    // Firebase 초기화 시도
    if (!initializeFirebase()) {
        console.warn('⚠️ Firebase 로드 대기 중...');
        // Firebase 로드 대기 (최대 5초)
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = setInterval(() => {
            retryCount++;
            if (initializeFirebase()) {
                clearInterval(retryInterval);
                console.log('✅ Firebase 로드 완료 (재시도 후)');
            } else if (retryCount >= maxRetries) {
                clearInterval(retryInterval);
                console.warn('⚠️ Firebase 로드 실패 - 오프라인 모드로 동작');
            }
        }, 500);
    }

    // DOM 요소 가져오기
    const welcomeSection = document.getElementById('welcome-section');
    const orderSection = document.getElementById('order-section');
    const startOrderBtn = document.getElementById('start-order-btn');
    const cartItemsList = document.getElementById('cart-items');
    const totalPriceEl = document.getElementById('total-price');
    const customerNameInput = document.getElementById('customer-name');
    const placeOrderBtn = document.getElementById('place-order-btn');
    const dineInBtn = document.getElementById('dine-in-btn');
    const takeoutBtn = document.getElementById('takeout-btn');
    
    // DOM 요소 존재 확인
    console.log('DOM 요소 확인:');
    console.log('- welcomeSection:', !!welcomeSection);
    console.log('- orderSection:', !!orderSection);
    console.log('- startOrderBtn:', !!startOrderBtn);
    console.log('- cartItemsList:', !!cartItemsList);
    console.log('- totalPriceEl:', !!totalPriceEl);
    console.log('- customerNameInput:', !!customerNameInput);
    console.log('- placeOrderBtn:', !!placeOrderBtn);
    
    if (!startOrderBtn) {
        console.error('❌ 주문 시작하기 버튼을 찾을 수 없습니다!');
        return;
    }

    let orderType = 'dine-in'; // 기본값: 매장 이용
    let discountRate = 0; // 할인율 (포장시 0.1)
    const cart = {};
    
    // 자동 설정값 확인 (slug 기반 세션)
    const autoOrderType = sessionStorage.getItem('auto_order_type');
    const autoTableInfo = sessionStorage.getItem('auto_table_info');
    
    if (autoOrderType || autoTableInfo) {
        console.log('자동 설정 감지:', { autoOrderType, autoTableInfo });
        
        // 주문 타입 설정
        if (autoOrderType) {
            orderType = autoOrderType;
            discountRate = autoOrderType === 'takeout' ? 0.1 : 0;
        }
        
        // UI 자동 설정
        if (dineInBtn && takeoutBtn) {
            if (orderType === 'dine-in') {
                dineInBtn.classList.add('selected');
                takeoutBtn.classList.remove('selected');
            } else if (orderType === 'takeout') {
                takeoutBtn.classList.add('selected');
                dineInBtn.classList.remove('selected');
            }
        }

    


    // 포장/매장 선택 버튼 이벤트
    dineInBtn.addEventListener('click', () => {
        orderType = 'dine-in';
        discountRate = 0;
        
        dineInBtn.classList.add('selected');
        takeoutBtn.classList.remove('selected');
        
        tableInputSection.classList.remove('hidden');
        startOrderBtn.classList.remove('hidden');
        
        console.log('매장 이용 선택됨');
    });
    
    takeoutBtn.addEventListener('click', () => {
        orderType = 'takeout';
        discountRate = 0.1;
        
        takeoutBtn.classList.add('selected');
        dineInBtn.classList.remove('selected');
        
        tableInputSection.classList.add('hidden');
        startOrderBtn.classList.remove('hidden');
        
        console.log('포장 선택됨 (10% 할인)');
    });

    // 주문 시작 버튼 클릭 이벤트
    console.log('주문 시작하기 버튼에 이벤트 리스너 추가');
    
    startOrderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('주문 시작하기 버튼 클릭됨!');
        
        if (!orderType) {
            alert('포장 또는 매장 이용을 선택해주세요.');
            return;
        }
        
        // 포장/매장 이용 설정만 확인 (테이블 번호는 slug로 처리됨)
        
        console.log('화면 전환 시작...');
        welcomeSection.classList.add('hidden');
        orderSection.classList.remove('hidden');
        
        const headerTitle = document.querySelector('header h1');
        if (headerTitle) {
            if (orderType === 'takeout') {
                headerTitle.innerText = `⚾ 포장 주문 (10% 할인)`;
            } else {
                headerTitle.innerText = `⚾ 테이블 #${tableNumber}`;
            }
            console.log('헤더 제목 변경됨');
        } else {
            console.warn('헤더 제목 요소를 찾을 수 없습니다');
        }
        
        console.log('주문 페이지로 전환 완료!');
    });
    
    // 추가적인 이벤트 리스너 (혹시 위의 것이 작동하지 않을 경우)
    startOrderBtn.onclick = function(e) {
        console.log('onclick 이벤트로 주문 시작하기 실행');
        e.preventDefault();
        
        if (!orderType) {
            alert('포장 또는 매장 이용을 선택해주세요.');
            return;
        }
        
        if (orderType === 'dine-in') {
            const tableNum = parseInt(tableNumberInput.value);
            if (isNaN(tableNum) || tableNum <= 0) {
                alert('올바른 테이블 번호를 입력하세요.');
                return;
            }
            tableNumber = tableNum;
        } else {
            tableNumber = 0; // 포장은 테이블 번호 없음
        }
        
        tableSection.classList.add('hidden');
        orderSection.classList.remove('hidden');
        
        const headerTitle = document.querySelector('header h1');
        if (headerTitle) {
            if (orderType === 'takeout') {
                headerTitle.innerHTML = '<i class="fas fa-baseball-ball"></i> MEMORY 주점 - 포장 주문 (10% 할인)';
            } else {
                headerTitle.innerHTML = '<i class="fas fa-baseball-ball"></i> MEMORY 주점 - 매장 이용';
            }
        }
    };

    // 메뉴 수량 조절 이벤트 (이벤트 위임 방식으로 변경)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('minus-btn')) {
            const item = e.target.closest('.menu-item');
            const name = item.querySelector('.menu-name').innerText;
            const price = parseInt(item.dataset.price);
            const quantityEl = item.querySelector('.quantity');
            let quantity = parseInt(quantityEl.innerText);
            
            if (quantity > 0) {
                quantity--;
                quantityEl.innerText = quantity;
                updateCart(name, price, quantity);
            }
        }
        
        if (e.target.classList.contains('plus-btn')) {
            const item = e.target.closest('.menu-item');
            const name = item.querySelector('.menu-name').innerText;
            const price = parseInt(item.dataset.price);
            const quantityEl = item.querySelector('.quantity');
            let quantity = parseInt(quantityEl.innerText);
            
            quantity++;
            quantityEl.innerText = quantity;
            updateCart(name, price, quantity);
        }
    });

    // 장바구니 업데이트 함수
    function updateCart(name, price, quantity) {
        if (quantity === 0) {
            delete cart[name];
        } else {
            cart[name] = { price, quantity };
        }
        renderCart();
    }

    // 장바구니 렌더링 및 총액 계산 함수
    function renderCart() {
        cartItemsList.innerHTML = '';
        let totalPrice = 0;

        for (const name in cart) {
            const item = cart[name];
            const li = document.createElement('li');
            li.innerText = `${name} x${item.quantity}`;
            cartItemsList.appendChild(li);
            totalPrice += item.price * item.quantity;
        }

        // 할인 적용
        let discountedPrice = totalPrice;
        if (discountRate > 0) {
            discountedPrice = Math.round(totalPrice * (1 - discountRate));
            
            // 할인 정보 표시
            if (totalPrice > 0) {
                const discountInfo = document.createElement('li');
                discountInfo.style.color = '#dc3545';
                discountInfo.style.fontWeight = 'bold';
                discountInfo.innerText = `포장 할인 (${Math.round(discountRate * 100)}%): -${(totalPrice - discountedPrice).toLocaleString()}원`;
                cartItemsList.appendChild(discountInfo);
            }
        }

        totalPriceEl.innerText = discountedPrice.toLocaleString();
        
        // 할인 적용시 원래 가격도 표시
        if (discountRate > 0 && totalPrice > 0) {
            const originalPriceEl = document.getElementById('original-price');
            if (!originalPriceEl) {
                const originalPriceInfo = document.createElement('p');
                originalPriceInfo.id = 'original-price';
                originalPriceInfo.style.textDecoration = 'line-through';
                originalPriceInfo.style.color = '#6c757d';
                originalPriceInfo.style.fontSize = '0.9em';
                originalPriceInfo.innerHTML = `정가: ${totalPrice.toLocaleString()}원`;
                totalPriceEl.parentNode.insertBefore(originalPriceInfo, totalPriceEl.parentNode.lastChild);
            } else {
                originalPriceEl.innerHTML = `정가: ${totalPrice.toLocaleString()}원`;
            }
        } else {
            const originalPriceEl = document.getElementById('original-price');
            if (originalPriceEl) {
                originalPriceEl.remove();
            }
        }
    }

    // 중복 클릭 방지 변수
    let isOrdering = false;

    // 주문하기 버튼 클릭 이벤트
    placeOrderBtn.addEventListener('click', (e) => {
        e.preventDefault(); // 폼 제출 방지
        
        if (isOrdering) {
            console.log('이미 주문 처리 중입니다. 중복 클릭 방지됨');
            return;
        }
        
        console.log('주문하기 버튼 클릭됨');
        isOrdering = true;
        placeOrderBtn.textContent = '주문 처리 중...';
        placeOrderBtn.disabled = true;
        
        const customerName = customerNameInput.value.trim();
        console.log('입금자명:', customerName);
        console.log('장바구니:', cart);
        console.log('주문 타입:', orderType);
        
        if (Object.keys(cart).length === 0) {
            alert('장바구니가 비어있습니다. 메뉴를 선택해주세요.');
            // 버튼 상태 복원
            isOrdering = false;
            placeOrderBtn.textContent = '주문하기';
            placeOrderBtn.disabled = false;
            return;
        }
        if (customerName === '') {
            alert('입금자명을 입력해주세요.');
            // 버튼 상태 복원
            isOrdering = false;
            placeOrderBtn.textContent = '주문하기';
            placeOrderBtn.disabled = false;
            return;
        }
        
        console.log('주문 데이터 준비 중...');
        
        // API 우선 호출, 실패 시 Firebase 또는 로컬 저장소 사용
        createOrderViaAPI();
    });

    // API를 통한 주문 생성 함수
    async function createOrderViaAPI() {
        try {
            console.log('API를 통한 주문 생성 시도');
            
            const originalTotal = Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const finalTotal = parseInt(totalPriceEl.innerText.replace(/,/g, ''));
            
            // API용 주문 데이터 준비
            const items = Object.entries(cart).map(([name, item]) => {
                // 메뉴 이름을 product_id로 매핑 (임시)
                const productId = PRODUCT_ID_MAP[name] || 1;
                return {
                    product_id: productId,
                    quantity: item.quantity
                };
            });
            
            const apiOrderData = {
                order_type: orderType === 'dine-in' ? 'DINE_IN' : 'TAKEOUT',
                payer_name: customerNameInput.value.trim(),
                items: items
            };
            
            console.log('API 주문 데이터:', apiOrderData);
            
            // API 호출
            const apiResult = await createOrder(apiOrderData);
            console.log('✅ API 주문 생성 성공:', apiResult);
            
            // API 성공 시 Firebase에 미러링 (설정된 경우)
            if (window.RUNTIME?.USE_FIREBASE_WRITE_MIRROR && db) {
                await mirrorOrderToFirebase(apiResult.data.order_id, originalTotal, finalTotal);
            }
            
            // 성공 처리
            handleOrderSuccess(apiResult.data.order_id, finalTotal);
            
        } catch (apiError) {
            console.warn('API 주문 생성 실패:', apiError);
            console.log('Firebase 백업 방식으로 진행');
            
            // API 실패 시 Firebase 백업
            if (db) {
                await createOrderViaFirebase();
            } else {
                // Firebase도 없으면 로컬 저장소
                saveOrderLocally();
            }
        }
    }

    // Firebase 백업 주문 생성
    async function createOrderViaFirebase() {
        const originalTotal = Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const finalTotal = parseInt(totalPriceEl.innerText.replace(/,/g, ''));
        
        const orderData = {
            customerName: customerNameInput.value.trim(),
            items: cart,
            orderType,
            originalPrice: originalTotal,
            discountRate,
            discountAmount: originalTotal - finalTotal,
            totalPrice: finalTotal,
            status: 'Payment Pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        console.log('Firebase에 백업 저장 시작');
        
        const newOrderRef = db.ref('orders').push();
        const orderId = newOrderRef.key;
        console.log('생성된 주문 ID:', orderId);
        
        await newOrderRef.set(orderData);
        console.log('✅ Firebase 백업 저장 성공');
        
        // 성공 처리
        handleOrderSuccess(orderId, finalTotal);
    }

    // Firebase 미러링 함수
    async function mirrorOrderToFirebase(apiOrderId, originalTotal, finalTotal) {
        try {
            const orderData = {
                serverOrderId: apiOrderId, // 서버 주문 ID 연결
                customerName: customerNameInput.value.trim(),
                items: cart,
                orderType,
                originalPrice: originalTotal,
                discountRate,
                discountAmount: originalTotal - finalTotal,
                totalPrice: finalTotal,
                status: 'Payment Pending',
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                source: 'api' // API를 통해 생성됨을 표시
            };

            const newOrderRef = db.ref('orders').push();
            await newOrderRef.set(orderData);
            console.log('✅ Firebase 미러링 성공');
        } catch (error) {
            console.warn('Firebase 미러링 실패:', error);
            // 미러링 실패는 무시 (주문은 이미 API로 성공)
        }
    }

    // 주문 성공 처리 공통 함수
    function handleOrderSuccess(orderId, totalPrice) {
        try {
            const waitingUrl = `waiting.html?orderId=${orderId}`;
            console.log('대기 순번 URL 생성:', waitingUrl);
            
            const totalPriceStr = totalPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const alertMessage = `🏦 주문이 접수되었습니다!\n\n⚠️ 주의: 입금 확인 후 주문이 시작됩니다\n\n💳 결제 정보:\n은행: 신한은행\n계좌번호: 110-123-456789\n예금주: 소프트웨어융합대학 학생회\n총 금액: ${totalPriceStr}원\n입금자명: ${customerNameInput.value.trim()}\n\n🔥 반드시 위 계좌로 이체해주세요!\n입금 확인 후 주문 제작이 시작됩니다.`;
            
            alert(alertMessage);
            
            // 대기 순번 페이지로 이동할지 묻기
            const goToWaiting = confirm('대기 순번 확인 페이지로 이동하시겠습니까?');
            
            if (goToWaiting) {
                window.location.href = waitingUrl;
            } else {
                window.location.reload();
            }
            
        } catch (error) {
            console.error('주문 완료 후 처리 중 오류:', error);
            alert('주문은 완료되었지만 페이지 이동 중 오류가 발생했습니다.');
            window.location.reload();
        }
    }

    // 로컬 저장소에 주문 저장 (Firebase 대체)
    function saveOrderLocally() {
        try {
            const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const originalTotal = Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const finalTotal = parseInt(totalPriceEl.innerText.replace(/,/g, ''));
            
            const orderData = {
                id: orderId,
                customerName: customerNameInput.value.trim(),
                items: cart,
                orderType,
                originalPrice: originalTotal,
                discountRate,
                discountAmount: originalTotal - finalTotal,
                totalPrice: finalTotal,
                status: 'Payment Pending',
                timestamp: Date.now()
            };
            
            console.log('로컬 저장소에 주문 저장:', orderData);
            
            // 기존 주문 목록 가져오기
            const existingOrders = JSON.parse(localStorage.getItem('memoryOrders') || '[]');
            existingOrders.push(orderData);
            
            // 저장
            localStorage.setItem('memoryOrders', JSON.stringify(existingOrders));
            console.log('✅ 로컬 저장 완료');
            
            // 성공 메시지 표시
            const totalPriceStr = orderData.totalPrice.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const alertMessage = `🏦 주문이 접수되었습니다!\n\n⚠️ 주의: 입금 확인 후 주문이 시작됩니다\n\n💳 결제 정보:\n은행: 신한은행\n계좌번호: 110-123-456789\n예금주: 소프트웨어융합대학 학생회\n총 금액: ${totalPriceStr}원\n입금자명: ${orderData.customerName}\n\n🔥 반드시 위 계좌로 이체해주세요!\n입금 확인 후 주문 제작이 시작됩니다.`;
            
            console.log('alert 메시지 표시 중...');
            alert(alertMessage);
            console.log('✅ alert 메시지 표시 완료');
            
            // 대기 순번 페이지로 이동할지 묻기
            const goToWaiting = confirm('대기 순번 확인 페이지로 이동하시겠습니까?');
            console.log('confirm 결과:', goToWaiting);
            
            if (goToWaiting) {
                const waitingUrl = `waiting.html?orderId=${orderId}`;
                console.log('대기 순번 페이지로 이동 시도:', waitingUrl);
                window.location.href = waitingUrl;
            } else {
                console.log('페이지 새로고침 시도');
                window.location.reload();
            }
            
        } catch (error) {
            console.error('로컬 저장 오류:', error);
            alert('주문 처리 중 오류가 발생했습니다.');
            // 버튼 상태 복원
            isOrdering = false;
            placeOrderBtn.textContent = '주문하기';
            placeOrderBtn.disabled = false;
        }
    }


    
    // QR코드 환영 메시지 함수
    function showQRWelcomeMessage(tableNumber) {
        // 환영 메시지 오버레이 생성
        const welcomeOverlay = document.createElement('div');
        welcomeOverlay.className = 'qr-welcome-overlay';
        welcomeOverlay.innerHTML = `
            <div class="qr-welcome-content">
                <div class="qr-welcome-icon">📱</div>
                <h2>환영합니다!</h2>
                <p>QR코드로 <strong>테이블 #${tableNumber}</strong>에 접속하셨습니다</p>
                <p class="qr-welcome-sub">메뉴를 선택하고 주문해보세요!</p>
                <button class="qr-welcome-close">시작하기</button>
            </div>
        `;
        
        document.body.appendChild(welcomeOverlay);
        
        // 닫기 버튼 이벤트
        const closeBtn = welcomeOverlay.querySelector('.qr-welcome-close');
        closeBtn.addEventListener('click', () => {
            welcomeOverlay.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(welcomeOverlay);
            }, 300);
        });
        
                // 3초 후 자동으로 닫기
        setTimeout(() => {
            if (document.body.contains(welcomeOverlay)) {
                closeBtn.click();
            }
        }, 3000);
    }
  }
});

