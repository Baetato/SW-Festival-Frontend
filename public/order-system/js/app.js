import './config.js'; // ← RUNTIME을 제일 먼저 준비
import { createOrder, openSessionBySlug, getUserOrderDetails, getPublicMenu, getTopMenu } from './api-session.js';
import { PRODUCT_ID_MAP } from './product-map.js';
import { Tokens } from './tokens.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 MEMORY 주점 주문 시스템 시작');

    // 0) 상태 변수들 — 가장 먼저 선언
    let orderType = 'dine-in'; // 기본값: 매장 이용
    let discountRate = 0; // 할인율 (포장시 0.1)
    const cart = {}; // 장바구니
    let isProcessing = false; // 주문 처리 중 플래그

    // 1) 1단계 → 2단계 전환 함수 (호이스팅 이슈 피하려고 먼저 선언)
    function goToMenuStep(type) {
        const headerTitle = document.querySelector('header h1');
        if (headerTitle) {
        headerTitle.innerHTML = (type === 'takeout')
            ? `<i class="fas fa-shopping-bag"></i> 포장 주문 (10% 할인)`
            : `<i class="fas fa-utensils"></i> 매장 이용`;
        }
        const dineInBtn  = document.getElementById('dine-in-btn');
        const takeoutBtn = document.getElementById('takeout-btn');
        if (dineInBtn && takeoutBtn) {
        if (type === 'takeout') { takeoutBtn.classList.add('selected'); dineInBtn.classList.remove('selected'); }
        else { dineInBtn.classList.add('selected'); takeoutBtn.classList.remove('selected'); }
        }
        const orderTypeSection = document.getElementById('order-type-section');
        const menuSection = document.getElementById('menu-section');
        if (orderTypeSection) orderTypeSection.classList.add('hidden');
        if (menuSection) menuSection.classList.remove('hidden');
        console.log('타입 자동결정으로 메뉴 단계 진입:', type);
    }

    // 2) slug 추출 → 주문 유형 자동 결정
    function extractSlug() {
        const { pathname, href } = window.location;
        const m = pathname.match(/\/t\/([^/?#]+)/);
        const fromPath = m ? decodeURIComponent(m[1]) : null;
        if (fromPath) return fromPath.replace(/^:/, '').trim();
        const sp = new URL(href).searchParams;
        const fromQuery = sp.get('slug');
        if (fromQuery) return fromQuery.replace(/^:/, '').trim();
        return (window.RUNTIME?.DEFAULT_SLUG || '').trim();
    }
    const slug = extractSlug();
    console.log('Slug:', slug);

    const TAKEOUT_SET = new Set(window.RUNTIME?.TAKEOUT_SLUGS || []);
    const isTakeoutBySlug = !!slug && TAKEOUT_SET.has(slug);
    orderType = isTakeoutBySlug ? 'takeout' : 'dine-in';
    discountRate = isTakeoutBySlug ? 0.1 : 0;

    // 3) 1단계 스킵하고 바로 메뉴 화면
    goToMenuStep(orderType);
    
    const orderTypeSection = document.getElementById('order-type-section');
    const menuSection = document.getElementById('menu-section');
    const codeModal = document.getElementById('code-modal');
    
    const dineInBtn = document.getElementById('dine-in-btn');
    const takeoutBtn = document.getElementById('takeout-btn');
    const startOrderBtn = document.getElementById('start-order-btn');
    
    const menuList = document.getElementById('menu-list');
    const cartItems = document.getElementById('cart-items');
    const totalPriceEl = document.getElementById('total-price');
    const customerNameInput = document.getElementById('customer-name');
    const placeOrderBtn = document.getElementById('place-order-btn');
    
    const codeInput = document.getElementById('code-input');
    const verifyBtn = document.getElementById('verify-btn');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const codeError = document.getElementById('code-error');
    const codeLoading = document.getElementById('code-loading');
    
    // 인기 메뉴 로드
    loadPopularMenus();
    
    // 메뉴 동적 로드 (선택적)
    loadDynamicMenus();
    
    // ========================================
    // 1단계: 주문 방식 선택
    // ========================================
    function goToMenuStep(type) {
        // 헤더 제목
        const headerTitle = document.querySelector('header h1');
        if (headerTitle) {
        if (type === 'takeout') {
            headerTitle.innerHTML = `<i class="fas fa-shopping-bag"></i> 포장 주문 (10% 할인)`;
        } else {
            headerTitle.innerHTML = `<i class="fas fa-utensils"></i> 매장 이용`;
        }
        }

        // 버튼 선택 스타일(있다면)
        const dineInBtn = document.getElementById('dine-in-btn');
        const takeoutBtn = document.getElementById('takeout-btn');
        if (dineInBtn && takeoutBtn) {
        if (type === 'takeout') {
            takeoutBtn.classList.add('selected');
            dineInBtn.classList.remove('selected');
        } else {
            dineInBtn.classList.add('selected');
            takeoutBtn.classList.remove('selected');
        }
        }

        // 섹션 전환
        const orderTypeSection = document.getElementById('order-type-section');
        const menuSection = document.getElementById('menu-section');
        if (orderTypeSection) orderTypeSection.classList.add('hidden');
        if (menuSection) menuSection.classList.remove('hidden');

        console.log('타입 자동결정으로 메뉴 단계 진입:', type);
    }

    // 매장이용 버튼 클릭
    if (dineInBtn) {
        dineInBtn.addEventListener('click', () => {
            orderType = 'dine-in';
            discountRate = 0;
            
            dineInBtn.classList.add('selected');
            takeoutBtn.classList.remove('selected');
            
            console.log('매장 이용 선택됨');
        });
    }
    
    // 포장 버튼 클릭
    if (takeoutBtn) {
        takeoutBtn.addEventListener('click', () => {
            orderType = 'takeout';
            discountRate = 0.1;
            
            takeoutBtn.classList.add('selected');
            dineInBtn.classList.remove('selected');
            
            console.log('포장 선택됨 (10% 할인)');
        });
    }

    // 주문하기 버튼 클릭 (1단계 → 2단계)
    if (startOrderBtn) {
        startOrderBtn.addEventListener('click', () => {
            console.log('1단계 → 2단계 전환');
            
            // 헤더 제목 변경
            const headerTitle = document.querySelector('header h1');
            if (headerTitle) {
                if (orderType === 'takeout') {
                        headerTitle.innerHTML = `<i class="fas fa-shopping-bag"></i> 포장 주문 (10% 할인)`;
                } else {
                        headerTitle.innerHTML = `<i class="fas fa-utensils"></i> 매장 이용`;
                    }
                }
                
                // 화면 전환
                orderTypeSection.classList.add('hidden');
                menuSection.classList.remove('hidden');
                
                console.log('메뉴 선택 단계로 전환 완료');
            });
    }
    
    // ========================================
    // 2단계: 메뉴 선택
    // ========================================
    
    // 메뉴 수량 조절 이벤트
    if (menuList) {
        menuList.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (!menuItem) return;
            
            const menuName = menuItem.querySelector('.menu-name').textContent;
            const menuPrice = parseInt(menuItem.dataset.price);
            const quantityEl = menuItem.querySelector('.quantity');
            let currentQuantity = parseInt(quantityEl.textContent);
            
            if (e.target.classList.contains('plus-btn')) {
                // 수량 증가
                currentQuantity++;
                quantityEl.textContent = currentQuantity;
                
                // 장바구니에 추가/업데이트
                if (cart[menuName]) {
                    cart[menuName].quantity = currentQuantity;
            } else {
                    cart[menuName] = {
                        name: menuName,
                        price: menuPrice,
                        quantity: currentQuantity
                    };
                }
                
                console.log(`${menuName} 수량 증가: ${currentQuantity}`);
                
            } else if (e.target.classList.contains('minus-btn') && currentQuantity > 0) {
                // 수량 감소
                currentQuantity--;
                quantityEl.textContent = currentQuantity;
                
                if (currentQuantity === 0) {
                    // 장바구니에서 제거
                    delete cart[menuName];
                } else {
                    // 수량 업데이트
                    cart[menuName].quantity = currentQuantity;
                }
                
                console.log(`${menuName} 수량 감소: ${currentQuantity}`);
            }
            
            // 장바구니 UI 업데이트
            updateCartDisplay();
        });
    }
    
    // 주문하기 버튼 클릭 (2단계 → 3단계 모달)
    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', async () => {
        console.log('주문 시도');

        if (Object.keys(cart).length === 0) { alert('메뉴를 선택해주세요.'); return; }
        if (!customerNameInput.value.trim()) {
            alert('입금자명을 입력해주세요.'); customerNameInput.focus(); return;
        }

        if (!Tokens.getSession?.()) {
            // 첫 주문: 코드 모달
            showCodeModal();
            return;
        }

        // 재주문: 바로 주문
        await placeOrderWithExistingSession();
        });
    }

    async function placeOrderWithExistingSession() {
        try {
        if (isProcessing) return;
        isProcessing = true;

        const orderData = prepareOrderData();
        console.log('주문 데이터 준비 완료:', orderData);

        const result = await createOrder(orderData);
        console.log('주문 생성 성공:', result);

        handleOrderSuccess(result.data.order_id);
        } catch (e) {
        console.error('주문 실패:', e);
        const msg = String(e?.message || e);
        if (msg.includes('세션') || msg.includes('401') || msg.toLowerCase().includes('token')) {
            Tokens.clearSession?.();
            showCodeModal();
            return;
        }
        alert('주문 중 오류가 발생했습니다: ' + msg);
        } finally {
        isProcessing = false;
        }
    }
    
    // ========================================
    // 3단계: 코드 입력 모달
    // ========================================

    // 모달 표시
    function showCodeModal() {
        codeModal.classList.remove('hidden');
        codeInput.value = '';
        codeInput.focus();
        hideModalMessages();
        console.log('코드 입력 모달 표시');
    }
    
    // 모달 숨기기
    function hideCodeModal() {
        codeModal.classList.add('hidden');
        console.log('코드 입력 모달 숨김');
    }
    
    // 모달 메시지 숨기기
    function hideModalMessages() {
        codeError.classList.add('hidden');
        codeLoading.classList.add('hidden');
    }
    
    // 모달 닫기 버튼
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', hideCodeModal);
    }
    
    // 모달 배경 클릭시 닫기
    if (codeModal) {
        codeModal.addEventListener('click', (e) => {
            if (e.target === codeModal) {
                hideCodeModal();
            }
        });
    }
    
    // 코드 입력 후 엔터키
    if (codeInput) {
        codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                verifyBtn.click();
            }
        });
    }
    
    // 접속하기 버튼 클릭
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
        if (isProcessing) return;

        const code = codeInput.value.trim();
        if (!code) { alert('접속 코드를 입력해주세요.'); codeInput.focus(); return; }
        if (!slug) { alert('슬러그 정보가 없습니다. /t/{slug}로 접속해주세요.'); return; }

        console.log('코드 검증 및 세션 열기 시작:', code);
        isProcessing = true;
        hideModalMessages();
        codeLoading.classList.remove('hidden');
        verifyBtn.disabled = true;

        try {
            await openSessionBySlug(slug, code);
            const tokenPreview = (Tokens.getSession?.() || '').slice(0, 12);
            console.log('세션 열기 성공, token=', tokenPreview ? tokenPreview + '...' : '(없음)');

            codeLoading.classList.add('hidden');
            hideCodeModal();

            await placeOrderWithExistingSession();
        } catch (error) {
            console.error('주문 처리 실패:', error);
            codeLoading.classList.add('hidden');
            codeError.classList.remove('hidden');
        } finally {
            isProcessing = false;
            verifyBtn.disabled = false;
        }
        });
    }
    
    // ========================================
    // 유틸리티 함수들
    // ========================================
    // async function placeOrderWithExistingSession() {
    //     try {
    //         if (isProcessing) return;
    //         isProcessing = true;

    //         const orderData = prepareOrderData();
    //         console.log('주문 데이터 준비 완료:', orderData);

    //         const result = await createOrder(orderData);
    //         console.log('주문 생성 성공:', result);

    //         handleOrderSuccess(result.data.order_id);
    //     } catch (e) {
    //         console.error('주문 실패:', e);
    //         const msg = String(e?.message || e);
    //         // 세션 만료/부재 시 재인증 유도
    //         if (msg.includes('세션') || msg.includes('401') || msg.toLowerCase().includes('token')) {
    //         Tokens.clearSession?.();
    //         showCodeModal();
    //         return;
    //         }
    //         alert('주문 중 오류가 발생했습니다: ' + msg);
    //     } finally {
    //         isProcessing = false;
    //     }
    // }

    // 인기 메뉴 로드 (API 기반)
    async function loadPopularMenus() {
        try {
            console.log('📊 인기 메뉴 API 로드 중...');
            const topMenus = await getTopMenu(3);
            const popularMenuList = document.getElementById('popular-menu-list');
            
            if (popularMenuList && topMenus.length > 0) {
                const medals = ['🥇', '🥈', '🥉'];
                let menuHTML = '';
                
                topMenus.forEach((menu, index) => {
                    const medal = medals[index] || '🏆';
                    menuHTML += `
                        <div class="popular-menu-item">
                            <span class="medal">${medal}</span>
                            <span class="menu-name">${menu.name}</span>
                            <span class="order-count">판매 ${menu.qty_sold}개</span>
                        </div>
                    `;
                });
                
                popularMenuList.innerHTML = menuHTML;
                console.log('✅ 인기 메뉴 로드 완료:', topMenus.length, '개');
            } else if (popularMenuList) {
                // 폴백: 기본 메뉴
                popularMenuList.innerHTML = `
                    <div class="popular-menu-item">
                        <span class="medal">🥇</span>
                        <span class="menu-name">SSG 문학철판구이</span>
                        <span class="order-count">인기 메뉴</span>
                    </div>
                    <div class="popular-menu-item">
                        <span class="medal">🥈</span>
                        <span class="menu-name">NC 빙하기공룡고기</span>
                        <span class="order-count">맛있는 메뉴</span>
                    </div>
                    <div class="popular-menu-item">
                        <span class="medal">🥉</span>
                        <span class="menu-name">KIA 호랑이 생고기</span>
                        <span class="order-count">추천 메뉴</span>
                    </div>
                `;
                console.log('⚠️ API 실패, 기본 메뉴 표시');
            }
        } catch (error) {
            console.error('인기 메뉴 로드 실패:', error);
            // 폴백 처리
            const popularMenuList = document.getElementById('popular-menu-list');
            if (popularMenuList) {
                popularMenuList.innerHTML = '<div class="no-data">인기 메뉴를 불러올 수 없습니다</div>';
            }
        }
    }
    
    // 메뉴 동적 로드 (API 기반)
    async function loadDynamicMenus() {
        try {
            console.log('📋 메뉴 API 로드 중...');
            const menuData = await getPublicMenu();
            
            if (menuData && menuData.length > 0) {
                console.log('✅ 메뉴 API 로드 완료:', menuData.length, '개 메뉴');
                
                // 기존 하드코딩된 메뉴와 API 메뉴 비교
                const menuList = document.getElementById('menu-list');
                if (menuList) {
                    // 품절된 메뉴가 있는지 확인하고 UI 업데이트
                    updateMenuAvailability(menuData);
                }
            } else {
                console.log('⚠️ 메뉴 API에서 데이터를 받지 못함, 기본 메뉴 사용');
            }
        } catch (error) {
            console.error('❌ 메뉴 로드 실패:', error);
            console.log('📋 기본 메뉴로 계속 진행');
        }
    }
    
    // 메뉴 가용성 업데이트
    function updateMenuAvailability(apiMenuData) {
        const menuItems = document.querySelectorAll('.menu-item');
        
        menuItems.forEach(menuItem => {
            const menuName = menuItem.querySelector('.menu-name').textContent;
            const apiMenu = apiMenuData.find(item => item.name === menuName);
            
            if (apiMenu) {
                // API에서 품절 상태 확인
                if (apiMenu.is_sold_out) {
                    menuItem.classList.add('sold-out');
                    menuItem.style.opacity = '0.5';
                    
                    // 품절 표시 추가
                    const soldOutLabel = document.createElement('div');
                    soldOutLabel.className = 'sold-out-label';
                    soldOutLabel.innerHTML = '<span style="color: red; font-weight: bold;">품절</span>';
                    menuItem.appendChild(soldOutLabel);
                    
                    // 수량 조절 버튼 비활성화
                    const quantityBtns = menuItem.querySelectorAll('.quantity-btn');
                    quantityBtns.forEach(btn => {
                        btn.disabled = true;
                        btn.style.opacity = '0.3';
                    });
                    
                    console.log(`🚫 품절 메뉴: ${menuName}`);
            } else {
                    // 품절이 아닌 경우 정상 표시
                    menuItem.classList.remove('sold-out');
                    menuItem.style.opacity = '1';
                }
                
                // 가격 업데이트 (API와 다른 경우)
                const priceEl = menuItem.querySelector('.menu-price');
                const currentPrice = parseInt(menuItem.dataset.price);
                if (apiMenu.price !== currentPrice) {
                    priceEl.textContent = `${apiMenu.price.toLocaleString()}원`;
                    menuItem.dataset.price = apiMenu.price;
                    console.log(`💰 가격 업데이트: ${menuName} ${currentPrice} → ${apiMenu.price}`);
                }
            }
        });
    }
    
    // 장바구니 UI 업데이트
    function updateCartDisplay() {
        if (!cartItems || !totalPriceEl) return;
        
        const cartKeys = Object.keys(cart);
        
        if (cartKeys.length === 0) {
            cartItems.innerHTML = `
                <p style="text-align: center; color: #666; padding: 2rem;">
                    선택한 메뉴가 여기에 표시됩니다.
                </p>
            `;
            totalPriceEl.textContent = '0';
            return;
        }
        
        // 장바구니 아이템 표시
        let cartHTML = '';
        let subtotal = 0;
        
        cartKeys.forEach(menuName => {
            const item = cart[menuName];
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            
            cartHTML += `
                <div class="cart-item">
                    <div>
                        <strong>${item.name}</strong><br>
                        <small>${item.price.toLocaleString()}원 × ${item.quantity}개</small>
                    </div>
                    <div style="font-weight: bold; color: #1a5490;">
                        ${itemTotal.toLocaleString()}원
                    </div>
                </div>
            `;
        });
        
        cartItems.innerHTML = cartHTML;
        
        // 할인 적용
        const discount = Math.round(subtotal * discountRate);
        const total = subtotal - discount;
        
        // 할인 정보 표시
        if (discount > 0) {
            cartItems.innerHTML += `
                <div class="cart-item" style="color: #28a745;">
                    <div>포장 할인 (10%)</div>
                    <div>-${discount.toLocaleString()}원</div>
                </div>
            `;
        }
        
        totalPriceEl.textContent = total.toLocaleString();
        
        console.log('장바구니 업데이트:', { subtotal, discount, total, items: cartKeys.length });
    }
    
    // 주문 데이터 준비
    function prepareOrderData() {
        const items = Object.values(cart).map(item => ({
        product_id: PRODUCT_ID_MAP[item.name],
        quantity: item.quantity
        }));

        return {
        order_type: orderType === 'dine-in' ? 'DINE_IN' : 'TAKEOUT', // ✅ slug로 결정된 값 사용
        payer_name: customerNameInput.value.trim(),
        items
        };
    }
    
    // 주문 성공 처리
    function handleOrderSuccess(orderId) {
        console.log('주문 성공 처리:', orderId);
        
        // 모달 닫기
        hideCodeModal();
        
        // 성공 메시지
        alert('주문이 성공적으로 완료되었습니다!');
        
        // 대기 페이지로 이동
        const waitingUrl = `/waiting.html?orderId=${orderId}`;
        // slug 포함이 필요하면 아래 주석 해제
        // const waitingUrl = `/waiting.html?orderId=${orderId}&slug=${encodeURIComponent(slug)}`;
        console.log('대기 페이지로 이동:', waitingUrl);
        window.location.href = waitingUrl;
    }
    
    console.log('주문 시스템 초기화 완료');
});
