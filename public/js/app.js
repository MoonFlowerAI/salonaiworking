/* ==========================================
   LUXE SALON & SPA - Complete SPA Application
   ========================================== */

(function () {
  'use strict';

  // ==========================================
  // STATE
  // ==========================================
  const state = {
    user: null,
    token: localStorage.getItem('salon_token'),
    services: [],
    staff: [],
    business: {},
    reviews: [],
    currentPage: 'home',
    booking: {
      step: 1,
      serviceId: null,
      service: null,
      staffId: null,
      staffMember: null,
      date: null,
      time: null,
      timeDisplay: null,
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      notes: ''
    },
    chat: {
      messages: [],
      open: false
    },
    reviewIndex: 0,
    reviewTimer: null
  };

  // ==========================================
  // UTILITIES
  // ==========================================
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    return fetch(endpoint, { ...options, headers: { ...headers, ...options.headers } })
      .then(res => res.json().then(data => ({ ok: res.ok, status: res.status, data })));
  }

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function formatPrice(price) {
    return '$' + price.toFixed(0);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==========================================
  // ROUTER
  // ==========================================
  function navigate(page) {
    if (!page || page === '') page = 'home';

    // Auth guards
    if (page === 'appointments' && !state.user) {
      openAuthModal();
      return;
    }
    if (page === 'admin' && (!state.user || state.user.role !== 'admin')) {
      toast('Admin access required', 'error');
      navigate('home');
      return;
    }

    state.currentPage = page;

    // Hide all pages, show current
    $$('.page').forEach(p => p.classList.remove('active'));
    const pageEl = $('#page-' + page);
    if (pageEl) {
      pageEl.classList.add('active');
    } else {
      $('#page-home').classList.add('active');
      state.currentPage = 'home';
    }

    // Update nav active state
    $$('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.page === state.currentPage) link.classList.add('active');
    });

    // Close mobile menu
    $('#navLinks').classList.remove('open');
    $('#hamburger').classList.remove('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Page-specific init
    if (page === 'services') loadServicesPage();
    if (page === 'book') initBookingPage();
    if (page === 'appointments') loadAppointments();
    if (page === 'admin') loadAdminDashboard();
    if (page === 'contact') loadContactInfo();
    if (page === 'gallery') loadGallery();
  }

  // Pricing section anchors — scroll only, not hash routes
  const SCROLL_ANCHORS = new Set(['basic', 'pro', 'premium']);

  function initRouter() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1) || 'home';
      if (SCROLL_ANCHORS.has(hash)) {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      navigate(hash);
    });

    // Handle all internal links
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href^="#"]');
      if (link) {
        const hash = link.getAttribute('href').slice(1);
        if (hash && hash !== '') {
          e.preventDefault();
          window.location.hash = hash;
        }
      }
    });

    // Initial route
    const hash = window.location.hash.slice(1) || 'home';
    if (SCROLL_ANCHORS.has(hash)) {
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 200);
    } else {
      navigate(hash);
    }
  }

  // ==========================================
  // AUTH
  // ==========================================
  function openAuthModal() {
    $('#authModal').classList.add('show');
    switchAuthTab('login');
  }

  function closeAuthModal() {
    $('#authModal').classList.remove('show');
    $('#loginError').textContent = '';
    $('#registerError').textContent = '';
    $('#loginForm').reset();
    $('#registerForm').reset();
  }

  function switchAuthTab(tab) {
    if (tab === 'login') {
      $('#loginTab').classList.add('active');
      $('#registerTab').classList.remove('active');
      $('#loginForm').style.display = 'block';
      $('#registerForm').style.display = 'none';
    } else {
      $('#loginTab').classList.remove('active');
      $('#registerTab').classList.add('active');
      $('#loginForm').style.display = 'none';
      $('#registerForm').style.display = 'block';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;
    $('#loginError').textContent = '';

    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (res.ok) {
      state.token = res.data.token;
      state.user = res.data.user;
      localStorage.setItem('salon_token', state.token);
      closeAuthModal();
      updateAuthUI();
      toast('Welcome back, ' + state.user.name + '!', 'success');
      // Pre-fill booking form if on booking page
      prefillBookingForm();
    } else {
      $('#loginError').textContent = res.data.error || 'Login failed';
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const phone = $('#regPhone').value.trim();
    const password = $('#regPassword').value;
    $('#registerError').textContent = '';

    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone, password })
    });

    if (res.ok) {
      state.token = res.data.token;
      state.user = res.data.user;
      localStorage.setItem('salon_token', state.token);
      closeAuthModal();
      updateAuthUI();
      toast('Account created! Welcome, ' + state.user.name + '!', 'success');
      prefillBookingForm();
    } else {
      $('#registerError').textContent = res.data.error || 'Registration failed';
    }
  }

  async function checkAuth() {
    if (!state.token) return;
    const res = await api('/api/auth/me');
    if (res.ok) {
      state.user = res.data;
      updateAuthUI();
    } else {
      state.token = null;
      state.user = null;
      localStorage.removeItem('salon_token');
    }
  }

  function logout() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('salon_token');
    updateAuthUI();
    toast('Logged out successfully', 'info');
    if (state.currentPage === 'appointments' || state.currentPage === 'admin') {
      window.location.hash = 'home';
    }
  }

  function updateAuthUI() {
    const loggedIn = !!state.user;
    const isAdmin = loggedIn && state.user.role === 'admin';

    $('#navLoginItem').style.display = loggedIn ? 'none' : '';
    $('#navUserItem').style.display = loggedIn ? '' : 'none';
    $('#navAppointments').style.display = loggedIn ? '' : 'none';
    $('#navAdmin').style.display = isAdmin ? '' : 'none';

    if (loggedIn) {
      $('#navUserName').textContent = state.user.name.split(' ')[0];
      $('#navUserAvatar').textContent = state.user.name.charAt(0).toUpperCase();
    }
  }

  function prefillBookingForm() {
    if (state.user) {
      const nameInput = $('#bookName');
      const emailInput = $('#bookEmail');
      const phoneInput = $('#bookPhone');
      if (nameInput && !nameInput.value) nameInput.value = state.user.name;
      if (emailInput && !emailInput.value) emailInput.value = state.user.email;
      if (phoneInput && !phoneInput.value && state.user.phone) phoneInput.value = state.user.phone;
    }
  }

  // ==========================================
  // DATA LOADING
  // ==========================================
  async function loadInitialData() {
    const [servicesRes, staffRes, businessRes, reviewsRes] = await Promise.all([
      api('/api/services'),
      api('/api/staff'),
      api('/api/business'),
      api('/api/reviews')
    ]);

    if (servicesRes.ok) state.services = servicesRes.data;
    if (staffRes.ok) state.staff = staffRes.data;
    if (businessRes.ok) state.business = businessRes.data;
    if (reviewsRes.ok) state.reviews = reviewsRes.data;

    applyTheme(state.business);
    applyBusinessInfo();
    renderPricingCards();
    applyTerminology(state.business);
    renderCategoryTabs(state.business);
    renderFeaturedServices();
    renderReviews();
  }

  // Derive a short display name by stripping common trailing descriptors.
  function deriveShortName(name) {
    if (!name) return '';
    return name
      .replace(/\s*(Salon\s*&\s*Spa|Salon|Spa|HVAC|Electric|Electrical|Handyman|Services?|Co\.?|LLC|Inc\.?|Studio)\s*$/i, '')
      .trim() || name;
  }

  // Inject business.theme colors as CSS custom properties
  function applyTheme(b) {
    if (!b || !b.theme) return;
    const root = document.documentElement;
    const map = {
      primary: '--rose',
      primaryDark: '--rose-dark',
      dark: '--dark',
      cream: '--cream',
      gold: '--gold'
    };
    Object.entries(map).forEach(([k, v]) => {
      if (b.theme[k]) root.style.setProperty(v, b.theme[k]);
    });
    // Also update <meta name="theme-color">
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor && b.theme.primary) themeColor.setAttribute('content', b.theme.primary);
  }

  // Swap any element with [data-term="KEY"] to use the configured term.
  // If no business terminology is set, the original text stays.
  function applyTerminology(b) {
    const terms = (b && b.terminology) || {};
    document.querySelectorAll('[data-term]').forEach(el => {
      const key = el.dataset.term;
      if (terms[key]) el.textContent = terms[key];
    });
  }

  // Populate the Services and Booking category tabs from business.categories.
  function renderCategoryTabs(b) {
    const categories = (b && Array.isArray(b.categories) && b.categories.length) ? b.categories : ['Hair', 'Nails', 'Skin', 'Makeup'];
    ['#categoryTabs', '#bookCategoryTabs'].forEach(sel => {
      const container = $(sel);
      if (!container) return;
      const html = [`<button class="tab-btn active" data-category="all">All</button>`]
        .concat(categories.map(c => `<button class="tab-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`))
        .join('');
      container.innerHTML = html;
    });
  }

  // ==========================================
  // PRICING SECTION (rendered from JS — keeps raw HTML empty)
  // ==========================================
  function renderPricingCards() {
    const grid = document.getElementById('pricingGrid');
    if (!grid) return;
    const INTAKE = '/salonai/intake';
    const plans = [
      {
        id: 'basic', name: 'Basic', tag: 'Launch your salon online.',
        monthly: 79, setup: 899, setupWas: 1500, token: 180,
        features: ['Custom salon website','24/7 AI chat assistant','Online booking + calendar','Admin dashboard'],
        highlight: false, badge: null
      },
      {
        id: 'pro', name: 'Pro', tag: 'For salons with an audience.',
        monthly: 129, setup: 1499, setupWas: 2500, token: 300,
        features: ['Everything in Basic','Email + SMS reminders','Installable mobile app','Social promotion (FB or IG)','<strong>1 AI post per month</strong>','Priority email support'],
        highlight: true, badge: 'Most popular'
      },
      {
        id: 'premium', name: 'Premium', tag: 'The full concierge experience.',
        monthly: 229, setup: 1999, setupWas: 3500, token: 400,
        features: ['Everything in Pro','<strong>Voice AI phone assistant</strong> <small>(300 min/mo, $0.50/min after)</small>','4-platform social (TikTok/YT/IG/FB)','<strong>4 AI posts per month</strong>','Same-day priority support'],
        highlight: false, badge: null
      }
    ];
    grid.innerHTML = plans.map(p => `
      <article class="pricing-card${p.highlight ? ' pricing-card-highlight' : ''}" id="${p.id}">
        ${p.badge ? `<div class="pricing-badge">${p.badge}</div>` : ''}
        <h3 class="pricing-name">${p.name}</h3>
        <p class="pricing-tag">${p.tag}</p>
        <div class="pricing-amt"><span class="pricing-dollar">$${p.monthly}</span><span class="pricing-per">/month</span></div>
        <div class="pricing-setup">
          <span class="pricing-setup-now">$${p.setup.toLocaleString()} setup</span>
          <span class="pricing-setup-was">$${p.setupWas.toLocaleString()}</span>
          <br>$${p.token} nonrefundable token at intake
        </div>
        <ul class="pricing-features">${p.features.map(f => `<li>${f}</li>`).join('')}</ul>
        <a class="pricing-cta" href="${INTAKE}?tier=${p.id}" target="_blank" rel="noopener">
          Sign up for ${p.name} &rarr;
        </a>
      </article>`).join('');

    // Build-Only card — below the 3-column grid
    const buildOnly = document.getElementById('buildOnlyCard');
    if (buildOnly) {
      buildOnly.innerHTML = `
        <div class="build-only-inner">
          <div class="build-only-left">
            <div class="build-only-eyebrow">No subscription</div>
            <h3 class="build-only-title">Website Build Only</h3>
            <p class="build-only-tag">Own your site outright. No monthly fees.</p>
            <ul class="build-only-features">
              <li>Custom web portal (mobile-ready)</li>
              <li>Home, services, gallery, and contact pages</li>
              <li>Your branding, colors, and photos</li>
              <li>Contact form so clients can reach you</li>
              <li>30-day bug-fix warranty included</li>
              <li><small style="color:#9ca3af">Static pages only. No AI, booking, or dashboard.</small></li>
            </ul>
          </div>
          <div class="build-only-right">
            <div class="build-only-price-row">
              <div class="build-only-price-block">
                <span class="build-only-label">One-time build</span>
                <span class="build-only-amount">$499</span>
              </div>
              <div class="build-only-price-block">
                <span class="build-only-label">Annual maintenance</span>
                <span class="build-only-amount">$199<span class="build-only-per">/yr</span></span>
              </div>
              <div class="build-only-price-block">
                <span class="build-only-label">Per fix after 30 days</span>
                <span class="build-only-amount">$89<span class="build-only-per">/issue</span></span>
              </div>
            </div>
            <a class="pricing-cta build-only-cta" href="${INTAKE}?tier=build-only" target="_blank" rel="noopener">
              Get a quote &rarr;
            </a>
            <p class="build-only-note">$240 nonrefundable token at intake. Balance due on launch day.</p>
            <div class="build-only-upgrade">
              <span>&#9650;</span> Want AI chat, online booking, calendar, or an admin dashboard? Those are included in the <strong>Basic plan</strong> at $79/month.
            </div>
          </div>
        </div>`;
    }
  }

  // ==========================================
  // HOME PAGE
  // ==========================================
  function applyBusinessInfo() {
    const b = state.business;
    if (!b || !b.name) return;

    const name = b.name;
    const shortName = b.shortName || deriveShortName(name);
    const tagline = b.tagline || '';
    const industry = b.industry || '';
    const servicesNoun = ((b.terminology && b.terminology.services) || 'services').toLowerCase();

    // Page title & meta
    document.title = name;
    const metaDesc = $('#metaDesc');
    if (metaDesc) metaDesc.setAttribute('content', `${name}${tagline ? '. ' + tagline : ''}. Book appointments and explore our ${servicesNoun}.`);

    // Nav logo
    const logoIcon = $('#logoIcon');
    if (logoIcon) logoIcon.textContent = name[0];
    const logoText = $('#logoText');
    if (logoText) logoText.textContent = name;

    // Hero
    const heroTitle = $('#heroTitle');
    if (heroTitle) heroTitle.innerHTML = name.replace(/&/g, '<span class="accent">&</span>');
    const heroTagline = $('#heroTagline');
    if (heroTagline) heroTagline.textContent = tagline;
    const heroSubtitle = $('#heroSubtitle');
    if (heroSubtitle && b.heroSubtitle) heroSubtitle.textContent = b.heroSubtitle;
    else if (heroSubtitle) heroSubtitle.textContent = industry ? `${industry.charAt(0).toUpperCase() + industry.slice(1)} in Louisville, done right.` : '';

    // About section
    const aboutTitle = $('#aboutTitle');
    if (aboutTitle) aboutTitle.textContent = 'About ' + name;
    const aboutText1 = $('#aboutText1');
    if (aboutText1 && b.aboutText1) aboutText1.textContent = b.aboutText1;
    else if (aboutText1) aboutText1.textContent = `At ${name}, we take pride in the details. Our team is dedicated to making every visit a great experience.`;
    const aboutText2 = $('#aboutText2');
    if (aboutText2 && b.aboutText2) aboutText2.textContent = b.aboutText2;
    else if (aboutText2) aboutText2.textContent = `Every customer deserves clear communication, honest pricing, and reliable service. That's what we show up to deliver — every single time.`;

    // Chat
    const chatHeader = $('#chatHeaderName');
    if (chatHeader) chatHeader.textContent = shortName + ' Assistant';
    const chatWelcome = $('#chatWelcome');
    if (chatWelcome) chatWelcome.textContent = `Welcome to ${name}! I'm here to help with ${servicesNoun}, booking, pricing, or any questions. How can I assist?`;

    // Footer
    const footerBrand = $('#footerBrand');
    if (footerBrand) footerBrand.textContent = name;
    const footerCopy = $('#footerCopy');
    if (footerCopy) footerCopy.textContent = `\u00A9 ${new Date().getFullYear()} ${name}. All rights reserved.`;

    // Contact info
    const contactAddr = $('#contactAddress');
    if (contactAddr) contactAddr.textContent = b.address || '';
    const contactPhone = $('#contactPhone');
    if (contactPhone) contactPhone.textContent = b.phone || '';
    const contactEmail = $('#contactEmail');
    if (contactEmail) contactEmail.textContent = b.email || '';
  }

  function renderFeaturedServices() {
    // Prefer services explicitly marked { featured: true }, fall back to first 3.
    const explicit = state.services.filter(s => s.featured);
    const featured = (explicit.length >= 3 ? explicit.slice(0, 3) : state.services.slice(0, 3));

    const icons = { Hair: '&#9986;', Nails: '&#128133;', Skin: '&#10024;', Makeup: '&#128132;' };
    const grid = $('#featuredServices');
    if (!grid) return;
    grid.innerHTML = featured.map(s => `
      <div class="featured-card">
        <div class="featured-card-icon">${icons[s.category] || '&#10024;'}</div>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description)}</p>
        <div class="price">${formatServicePrice(s)}</div>
        <div class="duration">${formatServiceDuration(s)}</div>
      </div>
    `).join('');
  }

  function renderReviews() {
    const carousel = $('#reviewsCarousel');
    const dotsContainer = $('#carouselDots');

    if (!state.reviews.length) {
      carousel.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">No reviews yet.</p>';
      return;
    }

    const track = document.createElement('div');
    track.className = 'reviews-track';
    track.innerHTML = state.reviews.map(r => `
      <div class="review-card">
        <div class="review-card-inner">
          <div class="review-stars">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
          <p class="review-text">"${escapeHtml(r.text)}"</p>
          <p class="review-author">${escapeHtml(r.name)}</p>
          <p class="review-service">${escapeHtml(r.service)}</p>
        </div>
      </div>
    `).join('');

    carousel.innerHTML = '';
    carousel.appendChild(track);

    dotsContainer.innerHTML = state.reviews.map((_, i) =>
      `<button class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Review ${i + 1}"></button>`
    ).join('');

    state.reviewIndex = 0;
    updateCarousel();
    startCarouselTimer();
  }

  function updateCarousel() {
    const track = $('.reviews-track');
    if (!track) return;
    track.style.transform = `translateX(-${state.reviewIndex * 100}%)`;
    $$('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === state.reviewIndex);
    });
  }

  function nextReview() {
    state.reviewIndex = (state.reviewIndex + 1) % state.reviews.length;
    updateCarousel();
    resetCarouselTimer();
  }

  function prevReview() {
    state.reviewIndex = (state.reviewIndex - 1 + state.reviews.length) % state.reviews.length;
    updateCarousel();
    resetCarouselTimer();
  }

  function startCarouselTimer() {
    state.reviewTimer = setInterval(nextReview, 5000);
  }

  function resetCarouselTimer() {
    clearInterval(state.reviewTimer);
    startCarouselTimer();
  }

  // ==========================================
  // SERVICES PAGE
  // ==========================================
  function loadServicesPage() {
    renderServicesGrid('all');
  }

  function renderServicesGrid(category) {
    const filtered = category === 'all'
      ? state.services
      : state.services.filter(s => s.category === category);

    const grid = $('#servicesGrid');
    grid.innerHTML = filtered.map(s => `
      <div class="service-card">
        <div class="service-card-category">${escapeHtml(s.category)}</div>
        <h3>${escapeHtml(s.name)}</h3>
        <p class="service-card-desc">${escapeHtml(s.description)}</p>
        <div class="service-card-meta">
          <span class="service-card-price">${formatServicePrice(s)}</span>
          <span class="service-card-duration">${formatServiceDuration(s)}</span>
        </div>
      </div>
    `).join('');
  }

  // ==========================================
  // BOOKING FLOW
  // ==========================================
  function initBookingPage() {
    resetBooking();
    renderBookServices('all');
    prefillBookingForm();
    setMinBookingDate();
  }

  function resetBooking() {
    state.booking = {
      step: 1,
      serviceId: null,
      service: null,
      staffId: null,
      staffMember: null,
      date: null,
      time: null,
      timeDisplay: null,
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      notes: ''
    };
    goToBookingStep(1);
    $('#bookStep1Next').disabled = true;
    $('#bookStep2Next').disabled = true;
    $('#bookStep3Next').disabled = true;
    $('#bookDate').value = '';
    $('#timeSlots').innerHTML = '<p class="slots-placeholder">Please select a date to see available times.</p>';
  }

  function setMinBookingDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    $('#bookDate').setAttribute('min', `${yyyy}-${mm}-${dd}`);
  }

  function goToBookingStep(step) {
    state.booking.step = step;

    for (let i = 1; i <= 5; i++) {
      const stepEl = $('#bookStep' + i);
      if (stepEl) stepEl.classList.toggle('active', i === step);
    }

    // Update progress indicators
    $$('.progress-step').forEach(el => {
      const s = parseInt(el.dataset.step);
      el.classList.remove('active', 'completed');
      if (s === step) el.classList.add('active');
      else if (s < step) el.classList.add('completed');
    });

    $$('.progress-line').forEach((line, i) => {
      line.classList.toggle('completed', i + 1 < step);
    });
  }

  function formatServicePrice(s) {
    if (s.pricingModel === 'hourly') {
      const rate = s.hourlyRate || s.price;
      return `$${Number(rate).toFixed(0)}/hr`;
    }
    return formatPrice(s.price);
  }

  function formatServiceDuration(s) {
    if (s.pricingModel === 'hourly') return `${(s.duration / 60).toFixed(1)} hr window`;
    return `${s.duration} min`;
  }

  function renderBookServices(category) {
    const filtered = category === 'all'
      ? state.services
      : state.services.filter(s => s.category === category);

    const grid = $('#bookServicesGrid');
    grid.innerHTML = filtered.map(s => {
      const locationBadge = s.appointmentType === 'at-customer'
        ? '<span class="svc-badge">On-site</span>'
        : (s.appointmentType === 'either' ? '<span class="svc-badge">On-site or in-shop</span>' : '');
      return `
      <div class="book-service-card ${state.booking.serviceId === s.id ? 'selected' : ''}" data-id="${s.id}">
        <h4>${escapeHtml(s.name)} ${locationBadge}</h4>
        <div class="meta">
          <span class="price">${formatServicePrice(s)}</span>
          <span>${formatServiceDuration(s)}</span>
          <span>${escapeHtml(s.category)}</span>
        </div>
        <p class="desc">${escapeHtml(s.description)}</p>
      </div>
      `;
    }).join('');
  }

  function selectBookService(id) {
    state.booking.serviceId = id;
    state.booking.service = state.services.find(s => s.id === id);
    $$('.book-service-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === id);
    });
    $('#bookStep1Next').disabled = false;
    // Auto-advance to step 2 after a brief highlight
    setTimeout(() => {
      renderBookStaff();
      goToBookingStep(2);
    }, 300);
  }

  function renderBookStaff() {
    const service = state.booking.service;
    if (!service) return;

    const matching = state.staff.filter(s => s.specialties.includes(service.name));
    const grid = $('#bookStaffGrid');

    if (matching.length === 0) {
      grid.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">No stylists available for this service.</p>';
      return;
    }

    grid.innerHTML = matching.map(s => `
      <div class="staff-card ${state.booking.staffId === s.id ? 'selected' : ''}" data-id="${s.id}">
        <div class="staff-avatar">${s.avatar}</div>
        <h4>${escapeHtml(s.name)}</h4>
        <p class="role">${escapeHtml(s.role)}</p>
        <div class="specialties">
          ${s.specialties.slice(0, 3).map(sp => `<span class="specialty-tag">${escapeHtml(sp)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  function selectBookStaff(id) {
    state.booking.staffId = id;
    state.booking.staffMember = state.staff.find(s => s.id === id);
    $$('.staff-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === id);
    });
    $('#bookStep2Next').disabled = false;
  }

  async function loadTimeSlots() {
    const date = $('#bookDate').value;
    if (!date || !state.booking.staffId || !state.booking.service) return;

    state.booking.date = date;
    state.booking.time = null;
    state.booking.timeDisplay = null;
    $('#bookStep3Next').disabled = true;

    const slotsContainer = $('#timeSlots');
    slotsContainer.innerHTML = '<p class="slots-placeholder">Loading available times...</p>';

    const duration = state.booking.service.duration;
    const res = await api(`/api/availability/${state.booking.staffId}/${date}?duration=${duration}`);

    if (!res.ok) {
      slotsContainer.innerHTML = '<p class="slots-placeholder">Failed to load availability. Please try again.</p>';
      return;
    }

    const { slots, message } = res.data;

    if (message) {
      slotsContainer.innerHTML = `<p class="slots-placeholder">${escapeHtml(message)}</p>`;
      return;
    }

    if (slots.length === 0) {
      slotsContainer.innerHTML = '<p class="slots-placeholder">No available time slots for this date. Please try another date.</p>';
      return;
    }

    slotsContainer.innerHTML = slots.map(slot => `
      <button type="button" class="time-slot" data-time="${slot.time}" data-display="${escapeHtml(slot.displayTime)}">${escapeHtml(slot.displayTime)}</button>
    `).join('');
  }

  function selectTimeSlot(time, display) {
    state.booking.time = time;
    state.booking.timeDisplay = display;
    $$('#timeSlots .time-slot').forEach(el => {
      el.classList.toggle('selected', el.dataset.time === time);
    });
    $('#bookStep3Next').disabled = false;
  }

  function renderBookingSummary() {
    const b = state.booking;
    const container = $('#bookingSummary');
    container.innerHTML = `
      <h3>Booking Summary</h3>
      <div class="summary-row"><span>Service</span><span>${escapeHtml(b.service.name)}</span></div>
      <div class="summary-row"><span>Stylist</span><span>${escapeHtml(b.staffMember.name)}</span></div>
      <div class="summary-row"><span>Date</span><span>${formatDate(b.date)}</span></div>
      <div class="summary-row"><span>Time</span><span>${escapeHtml(b.timeDisplay)}</span></div>
      <div class="summary-row"><span>Duration</span><span>${b.service.duration} min</span></div>
      <div class="summary-row total"><span>Total</span><span>${formatPrice(b.service.price)}</span></div>
    `;
  }

  async function submitBooking() {
    const b = state.booking;
    const name = $('#bookName').value.trim();
    const email = $('#bookEmail').value.trim();
    const phone = $('#bookPhone').value.trim();
    const notes = $('#bookNotes').value.trim();
    const addressInput = $('#bookServiceAddress');
    const serviceAddress = addressInput ? addressInput.value.trim() : '';

    if (!name || !email) {
      toast('Please fill in your name and email', 'error');
      return;
    }
    if (b.service && b.service.appointmentType === 'at-customer' && !serviceAddress) {
      toast('Please enter the service address', 'error');
      return;
    }

    const payload = {
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      staffId: b.staffId,
      serviceId: b.serviceId,
      date: b.date,
      time: b.time,
      duration: b.service.duration,
      notes: notes,
      serviceAddress: serviceAddress
    };

    const res = await api('/api/appointments', { method: 'POST', body: JSON.stringify(payload) });

    if (res.ok) {
      const appt = res.data.appointment;

      // If this service required a deposit, redirect the customer to Stripe Checkout.
      if (res.data.depositSessionUrl) {
        toast('Redirecting to secure deposit payment...', 'info');
        setTimeout(() => { window.location.href = res.data.depositSessionUrl; }, 800);
        return;
      }

      goToBookingStep(5);
      $('#confirmationContent').innerHTML = `
        <div class="confirmation-icon">&#10003;</div>
        <h2>Booking Confirmed!</h2>
        <p>Your appointment has been successfully booked.</p>
        <div class="confirmation-details">
          <div class="detail-row"><span class="detail-label">Confirmation ID</span><span class="detail-value">${escapeHtml(appt.id)}</span></div>
          <div class="detail-row"><span class="detail-label">Service</span><span class="detail-value">${escapeHtml(appt.serviceName)}</span></div>
          <div class="detail-row"><span class="detail-label">Stylist</span><span class="detail-value">${escapeHtml(b.staffMember.name)}</span></div>
          <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${formatDate(appt.date)}</span></div>
          <div class="detail-row"><span class="detail-label">Time</span><span class="detail-value">${escapeHtml(b.timeDisplay)}</span></div>
          <div class="detail-row"><span class="detail-label">Duration</span><span class="detail-value">${appt.duration} min</span></div>
          <div class="detail-row"><span class="detail-label">Total</span><span class="detail-value">${formatPrice(appt.price)}</span></div>
        </div>
        <p style="margin-top:20px;color:#888;">A confirmation has been noted for <strong>${escapeHtml(email)}</strong>.</p>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <a href="#appointments" class="btn btn-outline">View My Appointments</a>
          <a href="#home" class="btn btn-primary">Back to Home</a>
        </div>
      `;
      toast('Appointment booked successfully!', 'success');
    } else {
      toast(res.data.error || 'Failed to book appointment', 'error');
    }
  }

  // ==========================================
  // APPOINTMENTS PAGE
  // ==========================================
  async function loadAppointments() {
    if (!state.user) return;

    const container = $('#appointmentsList');
    container.innerHTML = '<div class="loading-spinner">Loading your appointments...</div>';

    const res = await api('/api/appointments/' + encodeURIComponent(state.user.email));

    if (!res.ok) {
      container.innerHTML = '<div class="no-appointments"><h3>Could not load appointments</h3><p>Please try again later.</p></div>';
      return;
    }

    const appointments = res.data;

    if (appointments.length === 0) {
      container.innerHTML = `
        <div class="no-appointments">
          <h3>No Appointments Yet</h3>
          <p>You have not booked any appointments. Ready to schedule one?</p>
          <a href="#book" class="btn btn-primary" style="margin-top:16px;">Book Now</a>
        </div>
      `;
      return;
    }

    container.innerHTML = appointments.map(a => `
      <div class="appointment-card ${a.status}">
        <div class="appt-info">
          <h3>${escapeHtml(a.serviceName)}</h3>
          <p class="appt-datetime">${formatDate(a.date)} at ${escapeHtml(formatTimeDisplay(a.time))}</p>
          <p>Stylist: ${escapeHtml(a.staffName)}</p>
          <p>Duration: ${a.duration} min &middot; ${formatPrice(a.price)}</p>
          <span class="appt-status ${a.status}">${a.status}</span>
        </div>
        <div class="appt-actions">
          ${a.status === 'confirmed' ? `
            <button class="btn btn-outline btn-sm" onclick="window.app.rescheduleAppt('${a.id}', '${a.staffId}', ${a.duration})">Reschedule</button>
            <button class="btn btn-danger btn-sm" onclick="window.app.cancelAppt('${a.id}')">Cancel</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  function formatTimeDisplay(time) {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  async function cancelAppointment(id) {
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    const res = await api(`/api/appointments/${id}/cancel`, { method: 'PUT' });
    if (res.ok) {
      toast('Appointment cancelled', 'success');
      loadAppointments();
    } else {
      toast(res.data.error || 'Failed to cancel', 'error');
    }
  }

  // Reschedule state
  let rescheduleState = { id: null, staffId: null, duration: 0, date: null, time: null };

  function openReschedule(id, staffId, duration) {
    rescheduleState = { id, staffId, duration, date: null, time: null };
    $('#rescheduleModal').classList.add('show');
    $('#rescheduleDate').value = '';
    $('#rescheduleSlots').innerHTML = '<p class="slots-placeholder">Select a date to see available times.</p>';
    $('#rescheduleConfirmBtn').disabled = true;
    $('#rescheduleError').textContent = '';

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    $('#rescheduleDate').setAttribute('min', `${yyyy}-${mm}-${dd}`);
  }

  function closeReschedule() {
    $('#rescheduleModal').classList.remove('show');
  }

  async function loadRescheduleSlots() {
    const date = $('#rescheduleDate').value;
    if (!date) return;

    rescheduleState.date = date;
    rescheduleState.time = null;
    $('#rescheduleConfirmBtn').disabled = true;

    const slotsContainer = $('#rescheduleSlots');
    slotsContainer.innerHTML = '<p class="slots-placeholder">Loading...</p>';

    const res = await api(`/api/availability/${rescheduleState.staffId}/${date}?duration=${rescheduleState.duration}`);

    if (!res.ok) {
      slotsContainer.innerHTML = '<p class="slots-placeholder">Failed to load availability.</p>';
      return;
    }

    const { slots, message } = res.data;
    if (message) {
      slotsContainer.innerHTML = `<p class="slots-placeholder">${escapeHtml(message)}</p>`;
      return;
    }
    if (slots.length === 0) {
      slotsContainer.innerHTML = '<p class="slots-placeholder">No available slots. Try another date.</p>';
      return;
    }

    slotsContainer.innerHTML = slots.map(slot => `
      <button type="button" class="time-slot" data-time="${slot.time}" data-display="${escapeHtml(slot.displayTime)}">${escapeHtml(slot.displayTime)}</button>
    `).join('');
  }

  async function confirmReschedule() {
    if (!rescheduleState.date || !rescheduleState.time) return;

    const res = await api(`/api/appointments/${rescheduleState.id}/reschedule`, {
      method: 'PUT',
      body: JSON.stringify({ date: rescheduleState.date, time: rescheduleState.time })
    });

    if (res.ok) {
      toast('Appointment rescheduled!', 'success');
      closeReschedule();
      loadAppointments();
    } else {
      $('#rescheduleError').textContent = res.data.error || 'Failed to reschedule';
    }
  }

  // ==========================================
  // ADMIN DASHBOARD
  // ==========================================
  async function loadAdminDashboard() {
    if (!state.user || state.user.role !== 'admin') return;

    // Load stats
    const statsRes = await api('/api/admin/stats');
    if (statsRes.ok) {
      const s = statsRes.data;
      const popular = s.popularServices.length > 0 ? s.popularServices[0].name : 'N/A';
      $('#adminStats').innerHTML = `
        <div class="admin-stat-card">
          <div class="stat-icon">&#128197;</div>
          <div class="stat-value">${s.bookings.today}</div>
          <div class="stat-label">Bookings Today</div>
        </div>
        <div class="admin-stat-card">
          <div class="stat-icon">&#128200;</div>
          <div class="stat-value">${s.bookings.week}</div>
          <div class="stat-label">This Week</div>
        </div>
        <div class="admin-stat-card">
          <div class="stat-icon">&#128176;</div>
          <div class="stat-value">$${s.revenue.month}</div>
          <div class="stat-label">Revenue (Month)</div>
        </div>
        <div class="admin-stat-card">
          <div class="stat-icon">&#11088;</div>
          <div class="stat-value" style="font-size:1.2rem;">${escapeHtml(popular)}</div>
          <div class="stat-label">Most Popular</div>
        </div>
      `;
    }

    // Load appointments
    loadAdminAppointments();

    // Load management lists
    loadAdminServices();
    loadAdminStaff();
    loadAdminGallery();
    loadAdminCustomers();
    loadAdminFeedback();
  }

  async function loadAdminAppointments(date, status) {
    let url = '/api/admin/appointments?';
    const params = [];
    if (date) params.push('date=' + date);
    if (status) params.push('status=' + status);
    url += params.join('&');

    const res = await api(url);
    if (!res.ok) {
      $('#adminTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">Failed to load appointments.</td></tr>';
      return;
    }

    const appointments = res.data;
    if (appointments.length === 0) {
      $('#adminTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">No appointments found.</td></tr>';
      return;
    }

    $('#adminTableBody').innerHTML = appointments.map(a => `
      <tr>
        <td>${escapeHtml(a.date)}</td>
        <td>${escapeHtml(formatTimeDisplay(a.time))}</td>
        <td>${escapeHtml(a.customerName)}</td>
        <td>${escapeHtml(a.serviceName)}</td>
        <td>${escapeHtml(a.staffName)}</td>
        <td>${formatPrice(a.price)}</td>
        <td><span class="appt-status ${a.status}">${a.status}</span></td>
      </tr>
    `).join('');
  }

  async function loadAdminServices() {
    const res = await api('/api/services');
    const container = $('#adminServicesList');
    if (!container) return;
    if (!res.ok) {
      container.innerHTML = '<div class="admin-empty">Failed to load services.</div>';
      return;
    }
    const services = res.data || [];
    if (services.length === 0) {
      container.innerHTML = '<div class="admin-empty">No services yet. Add your first one.</div>';
      return;
    }
    container.innerHTML = services.map(s => {
      const depositBadge = s.requiresDeposit
        ? `<span class="admin-crud-badge">Deposit $${Number(s.depositAmount || 0).toFixed(0)}</span>`
        : '';
      return `
      <div class="admin-crud-row">
        <div class="admin-crud-main">
          <strong>${escapeHtml(s.name)} ${depositBadge}</strong>
          <span class="admin-crud-meta">${escapeHtml(s.category || '')} &middot; ${s.duration} min &middot; ${formatPrice(s.price)}</span>
        </div>
        <div class="admin-crud-actions">
          <button class="btn btn-outline btn-sm" data-action="delete-service" data-id="${s.id}">Delete</button>
        </div>
      </div>
      `;
    }).join('');
  }

  async function loadAdminCustomers() {
    const res = await api('/api/admin/customers');
    const container = $('#adminCustomersList');
    if (!container) return;
    if (!res.ok) {
      container.innerHTML = '<div class="admin-empty">Failed to load customers.</div>';
      return;
    }
    const customers = res.data || [];
    if (customers.length === 0) {
      container.innerHTML = '<div class="admin-empty">No customers yet. Bookings will show up here.</div>';
      return;
    }
    container.innerHTML = customers.slice(0, 50).map(c => `
      <div class="admin-crud-row">
        <div class="admin-crud-main">
          <strong>${escapeHtml(c.name || c.email)}</strong>
          <span class="admin-crud-meta">${escapeHtml(c.email)} &middot; ${c.completedVisits} visits &middot; ${formatPrice(c.totalSpent)} lifetime</span>
        </div>
        <div class="admin-crud-actions">
          <button class="btn btn-outline btn-sm" data-action="view-customer" data-email="${escapeHtml(c.email.toLowerCase())}">View</button>
        </div>
      </div>
    `).join('') + (customers.length > 50 ? `<div class="admin-empty">Showing 50 of ${customers.length}. Export CSV for the full list.</div>` : '');
  }

  async function loadAdminFeedback() {
    const res = await api('/api/admin/feedback');
    const container = $('#adminFeedbackList');
    if (!container) return;
    if (!res.ok) {
      container.innerHTML = '<div class="admin-empty">Failed to load feedback.</div>';
      return;
    }
    const items = res.data || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="admin-empty">No feedback yet.</div>';
      return;
    }
    container.innerHTML = items.slice(0, 20).map(f => {
      const stars = '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating);
      const date = (f.createdAt || '').split('T')[0];
      return `
      <div class="admin-crud-row">
        <div class="admin-crud-main">
          <strong>${stars} — ${escapeHtml(f.customerName || f.customerEmail)}</strong>
          <span class="admin-crud-meta">${escapeHtml(f.serviceName || '')} &middot; ${escapeHtml(date)} &middot; ${f.routedTo === 'google' ? 'Routed to Google' : 'Private feedback'}</span>
          ${f.comment ? `<span class="admin-crud-meta" style="margin-top:6px;color:var(--gray-700);font-style:italic;">"${escapeHtml(f.comment)}"</span>` : ''}
        </div>
      </div>
      `;
    }).join('');
  }

  async function openCustomerProfile(email) {
    const res = await api('/api/admin/customers/' + encodeURIComponent(email));
    if (!res.ok) {
      toast(res.data.error || 'Failed to load customer', 'error');
      return;
    }
    const c = res.data;
    const body = `
      <h2 class="modal-title">${escapeHtml(c.name || c.email)}</h2>
      <p style="color:var(--gray-500);margin-bottom:16px;">${escapeHtml(c.email)}${c.phone ? ' &middot; ' + escapeHtml(c.phone) : ''}</p>
      <div class="customer-stat-row">
        <div class="customer-stat"><strong>${c.completedVisits}</strong><span>Visits</span></div>
        <div class="customer-stat"><strong>${c.cancelledVisits}</strong><span>Cancellations</span></div>
        <div class="customer-stat"><strong>${formatPrice(c.totalSpent)}</strong><span>Lifetime</span></div>
      </div>
      <div class="form-group" style="margin-top:20px;">
        <label class="form-label" for="customerNote">Private notes (only admins see this)</label>
        <textarea id="customerNote" class="form-input form-textarea" rows="3" placeholder="Allergies, preferences, conversation topics...">${escapeHtml(c.note || '')}</textarea>
      </div>
      <div class="step-actions">
        <button class="btn btn-outline" id="customerProfileDismiss">Close</button>
        <button class="btn btn-primary" id="customerNoteSave">Save note</button>
      </div>
      <h3 style="margin-top:28px;margin-bottom:12px;font-size:1.1rem;">Visit history</h3>
      <div class="customer-history">
        ${c.history.map(h => `
          <div class="customer-history-row">
            <div>
              <strong>${escapeHtml(h.date)} ${escapeHtml(h.time)}</strong>
              <span class="admin-crud-meta">${escapeHtml(h.serviceName)} &middot; ${escapeHtml(h.staffName)} &middot; ${formatPrice(h.price)}</span>
            </div>
            <span class="appt-status ${h.status}">${h.status}</span>
          </div>
        `).join('')}
      </div>
    `;
    $('#customerProfileBody').innerHTML = body;
    $('#customerProfileModal').classList.add('show');

    $('#customerProfileDismiss').onclick = closeCustomerProfile;
    $('#customerNoteSave').onclick = async () => {
      const note = $('#customerNote').value;
      const saveRes = await api('/api/admin/customers/' + encodeURIComponent(email) + '/note', {
        method: 'PUT',
        body: JSON.stringify({ note })
      });
      if (saveRes.ok) {
        toast('Note saved', 'success');
        closeCustomerProfile();
      } else {
        toast(saveRes.data.error || 'Save failed', 'error');
      }
    };
  }

  function closeCustomerProfile() {
    const modal = $('#customerProfileModal');
    if (modal) modal.classList.remove('show');
  }

  async function loadAdminStaff() {
    const res = await api('/api/staff');
    const container = $('#adminStaffList');
    if (!container) return;
    if (!res.ok) {
      container.innerHTML = '<div class="admin-empty">Failed to load staff.</div>';
      return;
    }
    const staff = res.data || [];
    if (staff.length === 0) {
      container.innerHTML = '<div class="admin-empty">No staff yet. Add your first team member.</div>';
      return;
    }
    container.innerHTML = staff.map(s => `
      <div class="admin-crud-row">
        <div class="admin-crud-main">
          <strong>${escapeHtml(s.avatar || '')} ${escapeHtml(s.name)}</strong>
          <span class="admin-crud-meta">${escapeHtml(s.role || '')} &middot; ${(s.workHours && s.workHours.start) || ''}–${(s.workHours && s.workHours.end) || ''}</span>
        </div>
        <div class="admin-crud-actions">
          <button class="btn btn-outline btn-sm" data-action="delete-staff" data-id="${s.id}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadAdminGallery() {
    const res = await api('/api/admin/gallery');
    const container = $('#adminGalleryList');
    if (!container) return;
    if (!res.ok) {
      container.innerHTML = '<div class="admin-empty">Failed to load gallery.</div>';
      return;
    }
    const items = res.data || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="admin-empty">No gallery images yet. Add an image URL.</div>';
      return;
    }
    container.innerHTML = items.map(i => `
      <div class="admin-crud-row">
        <div class="admin-crud-main">
          <strong>${escapeHtml(i.caption || '(no caption)')}</strong>
          <span class="admin-crud-meta">${escapeHtml(i.category || 'General')} &middot; <a href="${escapeHtml(i.url)}" target="_blank" rel="noopener">view image</a></span>
        </div>
        <div class="admin-crud-actions">
          <button class="btn btn-outline btn-sm" data-action="delete-gallery" data-id="${i.id}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // Simple form modal helpers
  function openAdminForm(title, fields, onSave) {
    $('#adminFormTitle').textContent = title;
    const body = $('#adminFormBody');
    body.innerHTML = fields.map(f => `
      <div class="form-group">
        <label class="form-label" for="af_${f.name}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
        ${f.type === 'textarea'
          ? `<textarea class="form-input form-textarea" id="af_${f.name}" rows="3" placeholder="${escapeHtml(f.placeholder || '')}"></textarea>`
          : `<input type="${f.type || 'text'}" class="form-input" id="af_${f.name}" placeholder="${escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}>`
        }
      </div>
    `).join('');
    $('#adminFormError').textContent = '';
    $('#adminFormModal').classList.add('show');
    $('#adminFormSave').onclick = async () => {
      const values = {};
      for (const f of fields) {
        values[f.name] = $('#af_' + f.name).value.trim();
      }
      for (const f of fields) {
        if (f.required && !values[f.name]) {
          $('#adminFormError').textContent = 'Please fill all required fields.';
          return;
        }
      }
      try {
        $('#adminFormError').textContent = '';
        await onSave(values);
        closeAdminForm();
      } catch (err) {
        $('#adminFormError').textContent = err && err.message ? err.message : 'Save failed.';
      }
    };
  }

  function closeAdminForm() {
    $('#adminFormModal').classList.remove('show');
    $('#adminFormSave').onclick = null;
  }

  function openAddServiceForm() {
    openAdminForm('Add Service', [
      { name: 'name', label: 'Service name', required: true, placeholder: 'e.g., Haircut & Style' },
      { name: 'category', label: 'Category', placeholder: 'e.g., Hair' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'duration', label: 'Duration (minutes)', type: 'number', required: true, placeholder: '45' },
      { name: 'price', label: 'Price (USD)', type: 'number', required: true, placeholder: '55' },
      { name: 'pricingModel', label: 'Pricing (fixed or hourly)', placeholder: 'fixed' },
      { name: 'hourlyRate', label: 'Hourly rate (USD, if hourly)', type: 'number', placeholder: '85' },
      { name: 'appointmentType', label: 'Location (at-business, at-customer, either)', placeholder: 'at-business' },
      { name: 'depositAmount', label: 'Deposit amount (USD, 0 = no deposit)', type: 'number', placeholder: '0' }
    ], async (v) => {
      const depositAmount = Number(v.depositAmount) || 0;
      const pricingModel = (v.pricingModel || 'fixed').trim().toLowerCase();
      const appointmentType = (v.appointmentType || 'at-business').trim().toLowerCase();
      const res = await api('/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({
          name: v.name,
          category: v.category,
          description: v.description,
          duration: Number(v.duration),
          price: Number(v.price),
          pricingModel: pricingModel === 'hourly' ? 'hourly' : 'fixed',
          hourlyRate: Number(v.hourlyRate) || 0,
          appointmentType: ['at-business', 'at-customer', 'either'].includes(appointmentType) ? appointmentType : 'at-business',
          depositAmount,
          requiresDeposit: depositAmount > 0
        })
      });
      if (!res.ok) throw new Error(res.data.error || 'Failed to add service');
      toast('Service added', 'success');
      loadAdminServices();
    });
  }

  function openAddStaffForm() {
    openAdminForm('Add Staff', [
      { name: 'name', label: 'Name', required: true, placeholder: 'Full name' },
      { name: 'role', label: 'Role', required: true, placeholder: 'e.g., Senior Stylist' },
      { name: 'avatar', label: 'Avatar (emoji)', placeholder: '👤' },
      { name: 'workStart', label: 'Work start (HH:MM)', placeholder: '09:00' },
      { name: 'workEnd', label: 'Work end (HH:MM)', placeholder: '17:00' }
    ], async (v) => {
      const body = {
        name: v.name,
        role: v.role,
        avatar: v.avatar || '👤'
      };
      if (v.workStart || v.workEnd) {
        body.workHours = { start: v.workStart || '09:00', end: v.workEnd || '17:00' };
      }
      const res = await api('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(res.data.error || 'Failed to add staff');
      toast('Staff added', 'success');
      loadAdminStaff();
    });
  }

  function openAddGalleryForm() {
    openAdminForm('Add Gallery Image', [
      { name: 'url', label: 'Image URL', required: true, placeholder: 'https://...' },
      { name: 'caption', label: 'Caption', placeholder: 'e.g., Balayage Artistry' },
      { name: 'category', label: 'Category', placeholder: 'e.g., Hair' }
    ], async (v) => {
      const res = await api('/api/admin/gallery', {
        method: 'POST',
        body: JSON.stringify(v)
      });
      if (!res.ok) throw new Error(res.data.error || 'Failed to add image');
      toast('Image added', 'success');
      loadAdminGallery();
    });
  }

  async function deleteAdminItem(kind, id) {
    const labels = { service: 'service', staff: 'staff member', gallery: 'image' };
    if (!confirm(`Delete this ${labels[kind]}?`)) return;
    const urls = {
      service: `/api/admin/services/${id}`,
      staff: `/api/admin/staff/${id}`,
      gallery: `/api/admin/gallery/${id}`
    };
    const res = await api(urls[kind], { method: 'DELETE' });
    if (!res.ok) {
      toast(res.data.error || 'Delete failed', 'error');
      return;
    }
    toast('Deleted', 'success');
    if (kind === 'service') loadAdminServices();
    if (kind === 'staff') loadAdminStaff();
    if (kind === 'gallery') loadAdminGallery();
  }

  function exportAppointmentsCsv() {
    if (!state.token) {
      toast('Admin login required', 'error');
      return;
    }
    // Fetch with auth header, then trigger download from blob
    fetch('/api/admin/export/appointments.csv', {
      headers: { 'Authorization': 'Bearer ' + state.token }
    }).then(res => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `appointments-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }).catch(() => toast('Export failed', 'error'));
  }

  // ==========================================
  // GALLERY PAGE
  // ==========================================
  async function loadGallery() {
    const grid = $('#galleryGrid');
    if (!grid) return;
    const res = await api('/api/gallery');
    if (!res.ok) {
      grid.innerHTML = '<div class="gallery-empty">Gallery unavailable right now.</div>';
      return;
    }
    const items = res.data || [];
    if (items.length === 0) {
      grid.innerHTML = '<div class="gallery-empty">New images coming soon.</div>';
      return;
    }
    grid.innerHTML = items.map((item, i) => {
      const sizeClass = i % 5 === 0 ? 'gallery-tall' : (i % 7 === 0 ? 'gallery-wide' : '');
      return `
        <div class="gallery-item ${sizeClass}" style="background-image:url('${escapeHtml(item.url)}');background-size:cover;background-position:center;">
          ${item.caption ? `<span>${escapeHtml(item.caption)}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // CONTACT PAGE
  // ==========================================
  function loadContactInfo() {
    if (state.business.address) $('#contactAddress').textContent = state.business.address;
    if (state.business.phone) $('#contactPhone').textContent = state.business.phone;
    if (state.business.email) $('#contactEmail').textContent = state.business.email;
  }

  function handleContactForm(e) {
    e.preventDefault();
    toast('Thank you for your message! We will get back to you soon.', 'success');
    e.target.reset();
  }

  // ==========================================
  // CHAT WIDGET
  // ==========================================
  function toggleChat() {
    state.chat.open = !state.chat.open;
    $('#chatPanel').classList.toggle('show', state.chat.open);
    $('#chatFab').classList.toggle('hidden', state.chat.open);
    if (state.chat.open) {
      $('#chatInput').focus();
    }
  }

  async function sendChatMessage(text) {
    if (!text.trim()) return;

    // Add user message
    state.chat.messages.push({ role: 'user', content: text });
    appendChatBubble('user', text);

    // Show typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'chat-msg bot chat-typing';
    typingEl.id = 'chatTyping';
    typingEl.innerHTML = '<div class="chat-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    $('#chatMessages').appendChild(typingEl);
    scrollChat();

    try {
      const res = await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: state.chat.messages,
          user: state.user ? { name: state.user.name, email: state.user.email, phone: state.user.phone } : null
        })
      });

      // Remove typing indicator
      const typing = $('#chatTyping');
      if (typing) typing.remove();

      if (res.ok) {
        const reply = res.data.reply;
        state.chat.messages.push({ role: 'assistant', content: reply });
        appendChatBubble('bot', reply);
      } else {
        appendChatBubble('bot', 'Sorry, I am having trouble connecting right now. Please try again or call us at ' + (state.business.phone || '(502) 555-0123') + '.');
      }
    } catch (err) {
      const typing = $('#chatTyping');
      if (typing) typing.remove();
      appendChatBubble('bot', 'Sorry, something went wrong. Please try again later.');
    }
  }

  function renderMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^\d+\.\s+(.+)$/gm, '<div style="margin:2px 0">$&</div>')
      .replace(/^[-•]\s+(.+)$/gm, '<div style="margin:2px 0">• $1</div>')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function appendChatBubble(type, text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ' + type;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (type === 'bot') {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }
    msgEl.appendChild(bubble);
    $('#chatMessages').appendChild(msgEl);
    scrollChat();
  }

  function scrollChat() {
    const container = $('#chatMessages');
    container.scrollTop = container.scrollHeight;
  }

  // ==========================================
  // VOICE ASSISTANT
  // ==========================================
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let voiceMode = false;

  function initVoice() {
    const micBtn = $('#chatMic');
    if (!SpeechRecognition || !micBtn) {
      if (micBtn) micBtn.classList.add('unsupported');
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      stopListening();
      voiceMode = true;
      sendChatMessage(transcript);
    };

    recognition.onerror = (event) => {
      stopListening();
      if (event.error === 'not-allowed') {
        appendChatBubble('bot', 'Microphone access denied. Please allow mic permissions.');
      }
    };

    recognition.onend = () => stopListening();
  }

  function startListening() {
    if (!recognition || isListening) return;
    if (!state.chat.open) toggleChat();
    speechSynthesis.cancel();
    isListening = true;
    $('#chatMic').classList.add('listening');
    $('#chatInput').placeholder = 'Listening...';
    recognition.start();
  }

  function stopListening() {
    if (!isListening) return;
    isListening = false;
    const micBtn = $('#chatMic');
    if (micBtn) micBtn.classList.remove('listening');
    const input = $('#chatInput');
    if (input) input.placeholder = 'Ask me anything...';
    try { recognition.stop(); } catch (e) {}
  }

  function speakText(text) {
    if (!window.speechSynthesis) return;
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\n/g, '. ');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    speechSynthesis.speak(utterance);
  }

  // Hook into chat response to speak if voice mode
  const _originalAppendChat = appendChatBubble;
  appendChatBubble = function (type, text) {
    _originalAppendChat(type, text);
    if (type === 'bot' && voiceMode) {
      voiceMode = false;
      speakText(text);
    }
  };

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function bindEvents() {
    // Hamburger
    $('#hamburger').addEventListener('click', () => {
      $('#hamburger').classList.toggle('active');
      $('#navLinks').classList.toggle('open');
    });

    // Navbar scroll
    window.addEventListener('scroll', () => {
      $('#navbar').classList.toggle('scrolled', window.scrollY > 20);
    });

    // Auth modal
    $('#navLoginBtn').addEventListener('click', e => { e.preventDefault(); openAuthModal(); });
    $('#authModalClose').addEventListener('click', closeAuthModal);
    $('#authModal').addEventListener('click', e => { if (e.target === $('#authModal')) closeAuthModal(); });
    $('#loginTab').addEventListener('click', () => switchAuthTab('login'));
    $('#registerTab').addEventListener('click', () => switchAuthTab('register'));
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#registerForm').addEventListener('submit', handleRegister);
    $('#logoutBtn').addEventListener('click', logout);

    // User dropdown
    $('#navUserBtn').addEventListener('click', () => {
      $('#navUserDropdown').classList.toggle('show');
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav-user-menu')) {
        $('#navUserDropdown').classList.remove('show');
      }
    });

    // Reviews carousel
    $('#reviewPrev').addEventListener('click', prevReview);
    $('#reviewNext').addEventListener('click', nextReview);
    $('#carouselDots').addEventListener('click', e => {
      if (e.target.classList.contains('carousel-dot')) {
        state.reviewIndex = parseInt(e.target.dataset.index);
        updateCarousel();
        resetCarouselTimer();
      }
    });

    // Services category tabs
    $('#categoryTabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      $$('#categoryTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderServicesGrid(btn.dataset.category);
    });

    // Booking: category tabs
    $('#bookCategoryTabs').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      $$('#bookCategoryTabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBookServices(btn.dataset.category);
    });

    // Booking: select service
    $('#bookServicesGrid').addEventListener('click', e => {
      const card = e.target.closest('.book-service-card');
      if (card) selectBookService(card.dataset.id);
    });

    // Booking: select staff
    $('#bookStaffGrid').addEventListener('click', e => {
      const card = e.target.closest('.staff-card');
      if (card) selectBookStaff(card.dataset.id);
    });

    // Booking: step navigation
    $('#bookStep1Next').addEventListener('click', () => {
      if (!state.booking.serviceId) return;
      renderBookStaff();
      goToBookingStep(2);
    });

    $('#bookStep2Back').addEventListener('click', () => goToBookingStep(1));
    $('#bookStep2Next').addEventListener('click', () => {
      if (!state.booking.staffId) return;
      goToBookingStep(3);
      setMinBookingDate();
    });

    $('#bookStep3Back').addEventListener('click', () => goToBookingStep(2));
    $('#bookStep3Next').addEventListener('click', () => {
      if (!state.booking.time) return;
      renderBookingSummary();
      prefillBookingForm();
      // Show service address field if service needs it
      const svc = state.booking.service;
      const needsAddress = svc && (svc.appointmentType === 'at-customer' || svc.appointmentType === 'either');
      const group = $('#bookServiceAddressGroup');
      if (group) {
        group.style.display = needsAddress ? 'block' : 'none';
        const input = $('#bookServiceAddress');
        if (input) input.required = svc.appointmentType === 'at-customer';
      }
      goToBookingStep(4);
    });

    $('#bookStep4Back').addEventListener('click', () => goToBookingStep(3));
    $('#bookStep4Next').addEventListener('click', submitBooking);

    // Booking: date picker
    $('#bookDate').addEventListener('change', loadTimeSlots);

    // Booking: time slot selection
    $('#timeSlots').addEventListener('click', e => {
      const slot = e.target.closest('.time-slot');
      if (slot) selectTimeSlot(slot.dataset.time, slot.dataset.display);
    });

    // Reschedule modal
    $('#rescheduleModalClose').addEventListener('click', closeReschedule);
    $('#rescheduleCancelBtn').addEventListener('click', closeReschedule);
    $('#rescheduleModal').addEventListener('click', e => { if (e.target === $('#rescheduleModal')) closeReschedule(); });
    $('#rescheduleDate').addEventListener('change', loadRescheduleSlots);
    $('#rescheduleSlots').addEventListener('click', e => {
      const slot = e.target.closest('.time-slot');
      if (slot) {
        rescheduleState.time = slot.dataset.time;
        $$('#rescheduleSlots .time-slot').forEach(el => {
          el.classList.toggle('selected', el.dataset.time === slot.dataset.time);
        });
        $('#rescheduleConfirmBtn').disabled = false;
      }
    });
    $('#rescheduleConfirmBtn').addEventListener('click', confirmReschedule);

    // Admin filter
    $('#adminFilterBtn').addEventListener('click', () => {
      const date = $('#adminDateFilter').value || undefined;
      const status = $('#adminStatusFilter').value || undefined;
      loadAdminAppointments(date, status);
    });

    // Admin: add buttons
    const addSvcBtn = $('#adminAddServiceBtn');
    if (addSvcBtn) addSvcBtn.addEventListener('click', openAddServiceForm);
    const addStaffBtn = $('#adminAddStaffBtn');
    if (addStaffBtn) addStaffBtn.addEventListener('click', openAddStaffForm);
    const addGalleryBtn = $('#adminAddGalleryBtn');
    if (addGalleryBtn) addGalleryBtn.addEventListener('click', openAddGalleryForm);

    // Admin: delete buttons (delegated)
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'delete-service') deleteAdminItem('service', id);
      if (action === 'delete-staff') deleteAdminItem('staff', id);
      if (action === 'delete-gallery') deleteAdminItem('gallery', id);
      if (action === 'view-customer') openCustomerProfile(btn.dataset.email);
    });

    // Customer profile modal close
    const custClose = $('#customerProfileClose');
    if (custClose) custClose.addEventListener('click', closeCustomerProfile);
    const custModal = $('#customerProfileModal');
    if (custModal) custModal.addEventListener('click', e => { if (e.target === custModal) closeCustomerProfile(); });

    // Admin: form modal
    const afClose = $('#adminFormModalClose');
    if (afClose) afClose.addEventListener('click', closeAdminForm);
    const afCancel = $('#adminFormCancel');
    if (afCancel) afCancel.addEventListener('click', closeAdminForm);
    const afModal = $('#adminFormModal');
    if (afModal) afModal.addEventListener('click', e => { if (e.target === afModal) closeAdminForm(); });

    // Admin: CSV export
    const exportBtn = $('#adminExportBtn');
    if (exportBtn) exportBtn.addEventListener('click', e => { e.preventDefault(); exportAppointmentsCsv(); });

    // Contact form
    $('#contactForm').addEventListener('submit', handleContactForm);

    // Chat
    $('#chatFab').addEventListener('click', toggleChat);
    $('#heroChatBtn').addEventListener('click', toggleChat);
    $('#chatClose').addEventListener('click', toggleChat);
    $('#chatForm').addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#chatInput');
      const text = input.value.trim();
      if (text) {
        sendChatMessage(text);
        input.value = '';
      }
    });

    // Voice
    initVoice();
    const micBtn = $('#chatMic');
    if (micBtn) micBtn.addEventListener('click', () => {
      isListening ? stopListening() : startListening();
    });
  }

  // ==========================================
  // PUBLIC API (for inline onclick handlers)
  // ==========================================
  window.app = {
    cancelAppt: cancelAppointment,
    rescheduleAppt: openReschedule
  };

  // ==========================================
  // SERVICE WORKER
  // ==========================================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      // Unregister old service workers and clear all caches
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.unregister());
      });
      caches.keys().then(keys => {
        keys.forEach(k => caches.delete(k));
      });
    }
  }

  // ==========================================
  // INIT
  // ==========================================
  async function init() {
    renderPricingCards(); // first — no dependencies, must not be blocked by errors below
    bindEvents();
    registerSW();
    await loadInitialData();
    await checkAuth();
    initRouter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
