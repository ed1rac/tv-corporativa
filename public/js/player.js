// TV Corporativa - Player Engine v2.1
(function () {
  'use strict';

  // State
  let displayCode = 'TV-01';
  let displayData = null;
  let layoutConfig = null;
  let playlistItems = [];
  let settings = {};
  let currentItemIndex = -1;
  let mediaTimer = null;
  let isPaused = false;
  let ws = null;
  let audioUnlocked = false;
  let weatherInterval = null;
  let clockInterval = null;
  let rssInterval = null;
  let audioCtx = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtx = new AudioCtx();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Play pleasant clinic chime (Do-Mi-Sol-Do chord)
  function playChime() {
    try {
      initAudioContext();
      if (!audioCtx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      let startTime = audioCtx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime + idx * 0.15);

        gain.gain.setValueAtTime(0, startTime + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.4, startTime + idx * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + idx * 0.15 + 0.6);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime + idx * 0.15);
        osc.stop(startTime + idx * 0.15 + 0.6);
      });
    } catch (e) {
      console.warn('[Audio] Could not play chime:', e);
    }
  }

  // Speak ticket call
  function speakTicket(ticket) {
    if (settings.enable_tts === 'false') return;
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        let text = `Atenção. Senha ${ticket.ticket_number}.`;
        if (ticket.patient_name) {
          text += ` ${ticket.patient_name}.`;
        }
        text += ` Comparecer ao ${ticket.location}.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('[TTS] Speech error:', e);
      }
    }
  }

  // Parse Query Params
  const urlParams = new URLSearchParams(window.location.search);
  displayCode = (urlParams.get('code') || 'TV-01').toUpperCase();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
    });
  }

  // DOM Elements
  const zoneContainer = document.getElementById('zoneContainer');
  const queuePopup = document.getElementById('queuePopup');
  const audioUnmuteBtn = document.getElementById('audioUnmuteBtn');
  const queueDrawerBtn = document.getElementById('queueDrawerBtn');
  const queueDrawer = document.getElementById('queueDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const offlineBanner = document.getElementById('offlineBanner');

  // Handle Unmute Button Click
  if (audioUnmuteBtn) {
    audioUnmuteBtn.addEventListener('click', () => {
      audioUnlocked = true;
      initAudioContext();
      playChime();
      audioUnmuteBtn.style.display = 'none';
      if (activeMediaElement && activeMediaElement.tagName === 'VIDEO') {
        activeMediaElement.muted = false;
      }
    });
  }

  // Handle Queue Launcher Drawer
  if (queueDrawerBtn && queueDrawer) {
    queueDrawerBtn.addEventListener('click', () => {
      queueDrawer.classList.add('open');
      fetchRecentQueue();
    });
  }
  if (closeDrawerBtn && queueDrawer) {
    closeDrawerBtn.addEventListener('click', () => {
      queueDrawer.classList.remove('open');
    });
  }

  // Keyboard navigation for slides
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }
    if (e.key === 'ArrowRight') {
      playSlideAt(currentItemIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      playSlideAt(currentItemIndex - 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleCarouselPause();
    }
  });

  // Offline / Online network listeners
  window.addEventListener('online', () => {
    if (offlineBanner) offlineBanner.style.display = 'none';
    fetchDisplayData();
  });

  window.addEventListener('offline', () => {
    if (offlineBanner) offlineBanner.style.display = 'flex';
  });

  // WebSocket Setup
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'display:register', displayCode }));

      setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'display:ping', displayCode }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'screen:reload') {
          fetchDisplayData();
        }

        if (msg.type === 'queue:call') {
          handleQueueCall(msg.data);
        }

        if (msg.type === 'queue:updated') {
          fetchRecentQueue();
        }
      } catch (err) {
        console.error('[WebSocket] Error handling message:', err);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  // Handle Queue Ticket Call
  function handleQueueCall(ticket) {
    playChime();

    setTimeout(() => {
      speakTicket(ticket);
    }, 900);

    if (queuePopup) {
      const tagEl = document.getElementById('popupServiceTag');
      if (tagEl) {
        tagEl.innerText = `${ticket.service_name || 'ATENDIMENTO'} (${ticket.service_type || 'Normal'})`;
      }
      document.getElementById('popupTicket').innerText = ticket.ticket_number;
      document.getElementById('popupLocation').innerText = ticket.location;
      document.getElementById('popupPatient').innerText = ticket.patient_name ? `Paciente: ${ticket.patient_name}` : '';
      queuePopup.classList.add('show');

      setTimeout(() => {
        queuePopup.classList.remove('show');
      }, 9500);
    }

    fetchRecentQueue();
  }

  // Fetch Display & Layout Data
  async function fetchDisplayData() {
    try {
      const res = await fetch(`/api/displays/code/${displayCode}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      displayData = data;
      layoutConfig = data.layout.config;
      playlistItems = data.playlist.items || [];
      settings = data.settings || {};

      localStorage.setItem(`tv_cache_${displayCode}`, JSON.stringify(data));

      applyBrandingAndHeader();
      renderLayout();
    } catch (err) {
      console.warn('[Player] Could not fetch online data, attempting cache:', err);
      const cached = localStorage.getItem(`tv_cache_${displayCode}`);
      if (cached) {
        const data = JSON.parse(cached);
        displayData = data;
        layoutConfig = data.layout.config;
        playlistItems = data.playlist.items || [];
        settings = data.settings || {};
        applyBrandingAndHeader();
        renderLayout();
        if (offlineBanner) offlineBanner.style.display = 'flex';
      }
    }
  }

  // Render Top Company Header Bar (Logo + Company Name)
  function applyBrandingAndHeader() {
    const primaryColor = settings.theme_color || '#1e40af';
    document.documentElement.style.setProperty('--primary-color', primaryColor);

    const headerEl = document.getElementById('companyHeader');
    const logoEl = document.getElementById('headerLogo');
    const titleEl = document.getElementById('headerTitle');
    const subEl = document.getElementById('headerSubtitle');
    const badgeEl = document.getElementById('headerDisplayBadge');

    const showGlobalHeader = settings.show_company_header !== 'false';
    const showScreenHeader = displayData && displayData.display ? displayData.display.show_header !== false : true;

    if (headerEl) {
      if (showGlobalHeader && showScreenHeader) {
        headerEl.style.display = 'flex';
        if (titleEl) titleEl.innerText = settings.site_title || 'TV Corporativa';
        if (subEl) {
          subEl.innerText = settings.company_subtitle || '';
          subEl.style.display = settings.company_subtitle ? 'block' : 'none';
        }
        if (logoEl) {
          if (settings.company_logo) {
            logoEl.src = settings.company_logo.startsWith('/') || settings.company_logo.startsWith('http')
              ? settings.company_logo
              : `/media/${settings.company_logo}`;
            logoEl.style.display = 'block';
          } else {
            logoEl.style.display = 'none';
          }
        }
        if (badgeEl && displayData && displayData.display) {
          badgeEl.innerText = `${displayData.display.name} (${displayData.display.code})`;
        }
      } else {
        headerEl.style.display = 'none';
      }
    }
  }

  // Render Layout & Zones
  function renderLayout() {
    if (!layoutConfig || !layoutConfig.zones) {
      console.error('[Player] No layout zones configured');
      return;
    }

    zoneContainer.innerHTML = '';
    let hasQueueZone = false;

    layoutConfig.zones.forEach((zone) => {
      const zoneDiv = document.createElement('div');
      zoneDiv.className = `tv-zone zone-${zone.type.toLowerCase()}`;
      zoneDiv.id = zone.id;

      if (zone.bounds) {
        const fmtPct = (v) => (String(v).endsWith('%') ? String(v) : `${parseFloat(v) || 0}%`);
        zoneDiv.style.top = fmtPct(zone.bounds.top);
        zoneDiv.style.left = fmtPct(zone.bounds.left);
        zoneDiv.style.width = fmtPct(zone.bounds.width);
        zoneDiv.style.height = fmtPct(zone.bounds.height);
      }

      if (zone.type === 'PLAYLIST') {
        renderMediaZone(zoneDiv);
      } else if (zone.type === 'COMPOSITE' || zone.type === 'SIDEBAR') {
        const subWidgets = zone.sub_widgets || [];
        if (subWidgets.some((w) => w.type === 'QUEUE_CALL')) {
          hasQueueZone = true;
        }
        const isHorizontal = parseFloat(zone.bounds?.height || '100') <= 25 && parseFloat(zone.bounds?.width || '100') >= 80;
        renderSidebarZone(zoneDiv, subWidgets, isHorizontal);
      } else if (zone.type === 'RSS_TICKER' || zone.type === 'ANNOUNCEMENTS_TICKER') {
        renderTickerZone(zoneDiv);
      } else if (zone.type === 'ANNOUNCEMENTS') {
        renderAnnouncementsZone(zoneDiv);
      } else if (zone.type === 'QUEUE_CALL') {
        hasQueueZone = true;
        renderSidebarZone(zoneDiv, [{ type: 'QUEUE_CALL' }], false);
      } else if (zone.type === 'CLOCK') {
        renderSidebarZone(zoneDiv, [{ type: 'CLOCK' }], false);
      } else if (zone.type === 'WEATHER') {
        renderSidebarZone(zoneDiv, [{ type: 'WEATHER' }], false);
      }

      zoneContainer.appendChild(zoneDiv);
    });

    // Show Quick Queue Launcher button if screen has queue functionality
    if (queueDrawerBtn) {
      queueDrawerBtn.style.display = hasQueueZone ? 'flex' : 'none';
    }

    startClock();
    startWeather();
    startRssTicker();
    startMediaPlayer();
  }

  // Media Player Engine + Carousel Controls
  let activeMediaElement = null;

  function renderMediaZone(container) {
    container.innerHTML = `
      <div class="zone-media-wrapper" id="mediaWrapper">
        <div id="mediaPlaceholder" style="color: #6b7280; font-size: 1.4rem; text-align: center;">
          Carregando programação da TV...
        </div>

        <!-- Standard Carousel Prev / Next Arrows -->
        <button class="carousel-nav-btn carousel-prev" id="btnPrevSlide" title="Slide Anterior (Seta Esquerda)">&#10094;</button>
        <button class="carousel-nav-btn carousel-next" id="btnNextSlide" title="Próximo Slide (Seta Direita)">&#10095;</button>

        <!-- Standard Carousel Dots & Pause Bar -->
        <div class="carousel-bottom-bar" id="carouselBottomBar">
          <div class="carousel-dots" id="carouselDots"></div>
          <button class="carousel-pause-btn" id="btnPauseCarousel" title="Pausar / Continuar Rotação (Espaço)">⏸</button>
        </div>
      </div>
    `;

    const prevBtn = container.querySelector('#btnPrevSlide');
    const nextBtn = container.querySelector('#btnNextSlide');
    const pauseBtn = container.querySelector('#btnPauseCarousel');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSlideAt(currentItemIndex - 1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSlideAt(currentItemIndex + 1);
      });
    }
    if (pauseBtn) {
      pauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCarouselPause();
      });
    }
  }

  function renderCarouselDots() {
    const dotsContainer = document.getElementById('carouselDots');
    if (!dotsContainer) return;

    if (!playlistItems || playlistItems.length <= 1) {
      dotsContainer.innerHTML = '';
      return;
    }

    dotsContainer.innerHTML = playlistItems.map((item, idx) => `
      <button class="carousel-dot ${idx === currentItemIndex ? 'active' : ''}"
              data-idx="${idx}"
              title="Slide ${idx + 1}: ${item.original_name || item.filename || ''}"></button>
    `).join('');

    dotsContainer.querySelectorAll('.carousel-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetIdx = parseInt(dot.getAttribute('data-idx'), 10);
        playSlideAt(targetIdx);
      });
    });
  }

  function toggleCarouselPause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('btnPauseCarousel');
    if (pauseBtn) {
      pauseBtn.innerText = isPaused ? '▶' : '⏸';
    }

    if (isPaused) {
      if (mediaTimer) clearTimeout(mediaTimer);
      if (activeMediaElement && activeMediaElement.tagName === 'VIDEO') {
        activeMediaElement.pause();
      }
    } else {
      if (activeMediaElement && activeMediaElement.tagName === 'VIDEO') {
        activeMediaElement.play().catch(() => {});
      } else {
        playSlideAt(currentItemIndex + 1);
      }
    }
  }

  function startMediaPlayer() {
    if (mediaTimer) clearTimeout(mediaTimer);
    currentItemIndex = -1;
    activeMediaElement = null;

    if (!playlistItems || playlistItems.length === 0) {
      const wrapper = document.getElementById('mediaWrapper');
      if (wrapper) {
        wrapper.innerHTML = `
          <div style="color: #9ca3af; font-size: 1.5rem; text-align: center; padding: 20px;">
            <h2>TV Corporativa</h2>
            <p style="font-size: 1.1rem; margin-top: 10px;">Nenhuma mídia ativa cadastrada na playlist desta tela.</p>
          </div>
        `;
      }
      return;
    }

    playSlideAt(0);
  }

  function playSlideAt(targetIndex) {
    if (!playlistItems || playlistItems.length === 0) return;
    if (mediaTimer) clearTimeout(mediaTimer);

    const len = playlistItems.length;
    currentItemIndex = ((targetIndex % len) + len) % len;

    const item = playlistItems[currentItemIndex];
    const wrapper = document.getElementById('mediaWrapper');
    if (!wrapper) return;

    const placeholder = document.getElementById('mediaPlaceholder');
    if (placeholder) placeholder.remove();

    renderCarouselDots();

    const mediaUrl = item.filename ? `/media/${item.filename}` : '';
    const isVideo = item.media_type === 'video';

    let el;
    if (isVideo) {
      el = document.createElement('video');
      el.className = 'media-item';
      el.src = mediaUrl;
      el.autoplay = !isPaused;
      el.playsInline = true;
      el.muted = !audioUnlocked;
      el.controls = false;
      el.preload = 'auto';

      let transitioned = false;
      const transitionNext = () => {
        if (!transitioned && !isPaused) {
          transitioned = true;
          playSlideAt(currentItemIndex + 1);
        }
      };

      el.addEventListener('ended', transitionNext);
      mediaTimer = setTimeout(transitionNext, 90000);

      el.addEventListener('error', () => {
        setTimeout(transitionNext, 3000);
      });
    } else {
      el = document.createElement('img');
      el.className = 'media-item';
      el.src = mediaUrl;

      if (!isPaused) {
        const duration = (item.duration_seconds || 10) * 1000;
        mediaTimer = setTimeout(() => {
          playSlideAt(currentItemIndex + 1);
        }, duration);
      }
    }

    wrapper.appendChild(el);
    void el.offsetWidth;
    el.classList.add('active');

    if (activeMediaElement && activeMediaElement !== el) {
      const oldEl = activeMediaElement;
      oldEl.classList.remove('active');
      if (oldEl.tagName === 'VIDEO') {
        try { oldEl.pause(); } catch (e) {}
      }
      setTimeout(() => {
        if (oldEl && oldEl.parentNode) {
          oldEl.parentNode.removeChild(oldEl);
        }
      }, 650);
    }

    activeMediaElement = el;
  }

  // Announcements Content Builder (Supports Fixed Image + Text)
  function buildAnnouncementsHtml(isFullZone) {
    const title = settings.announcement_title || '📢 COMUNICADOS & AVISOS';
    const text = settings.announcement_text || 'Bem-vindo! Fique atento aos comunicados internos no painel.';
    const rawImg = settings.announcement_image || '';
    const imgUrl = rawImg
      ? (rawImg.startsWith('/') || rawImg.startsWith('http') ? rawImg : `/media/${rawImg}`)
      : '';
    const mode = settings.announcement_mode || 'both'; // 'both', 'image', 'text'

    let innerContent = '';

    if (mode === 'image' && imgUrl) {
      innerContent = `
        <div class="announcement-img-wrapper">
          <img src="${imgUrl}" alt="Comunicado" class="announcement-fixed-img">
        </div>
      `;
    } else if (mode === 'both' && imgUrl) {
      innerContent = `
        <div class="announcement-img-wrapper" style="max-height: 68%;">
          <img src="${imgUrl}" alt="Comunicado" class="announcement-fixed-img">
        </div>
        ${text ? `<div class="announcement-body" style="font-size: 0.95rem;">${escapeHtml(text)}</div>` : ''}
      `;
    } else {
      innerContent = `
        <div class="announcement-body" style="${isFullZone ? 'font-size: 1.25rem;' : ''}">${escapeHtml(text)}</div>
      `;
    }

    return `
      <div class="widget-title">${escapeHtml(title)}</div>
      <div class="announcement-content-area">
        ${innerContent}
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Sidebar / Composite Zone Renderer
  function renderSidebarZone(container, subWidgets, isHorizontal) {
    let html = `<div class="zone-sidebar-wrapper ${isHorizontal ? 'zone-sidebar-horizontal' : ''}">`;

    subWidgets.forEach((w) => {
      const styleAttr = isHorizontal && w.width ? `style="flex: 1;"` : '';
      if (w.type === 'CLOCK') {
        html += `
          <div class="widget-card widget-clock" ${styleAttr}>
            <div class="clock-time" id="clockTime">--:--</div>
            <div class="clock-date" id="clockDate">--</div>
          </div>
        `;
      } else if (w.type === 'WEATHER') {
        html += `
          <div class="widget-card widget-weather" ${styleAttr}>
            <div class="weather-left">
              <div class="weather-icon" id="weatherIcon">⛅</div>
              <div class="weather-temp" id="weatherTemp">--°</div>
            </div>
            <div class="weather-details">
              <div class="weather-city" id="weatherCity">Carregando...</div>
              <div class="weather-cond" id="weatherCond">Previsão do Tempo</div>
              <div class="weather-feels" id="weatherFeels">Sensação: --°</div>
            </div>
          </div>
        `;
      } else if (w.type === 'QUEUE_CALL') {
        html += `
          <div class="widget-card widget-queue" id="queueCard">
            <div class="queue-current-box">
              <div class="queue-badge" id="sidebarQueueBadge">SENHA EM ATENDIMENTO</div>
              <div class="queue-ticket-num" id="sidebarQueueNum">---</div>
              <div class="queue-location" id="sidebarQueueLocation">Aguardando chamada...</div>
              <div class="queue-service-tag" id="sidebarQueueService"></div>
              <div class="queue-patient" id="sidebarQueuePatient"></div>
            </div>
            <div class="queue-history-box">
              <div class="queue-history-title">
                <span>Últimas Chamadas</span>
                <span id="sidebarWaitingCounter">Fila: 0</span>
              </div>
              <div class="queue-history-list" id="sidebarQueueHistory"></div>
            </div>
          </div>
        `;
      } else if (w.type === 'ANNOUNCEMENTS' || w.type === 'QR_ANNOUNCEMENT') {
        html += `
          <div class="widget-card widget-announcements" ${styleAttr}>
            ${buildAnnouncementsHtml(false)}
          </div>
        `;
      } else if (w.type === 'RSS_TICKER') {
        html += `
          <div class="zone-ticker-wrapper" style="border-radius: 8px; min-height: 48px;">
            <div class="ticker-label">NOTÍCIAS</div>
            <div class="ticker-marquee">
              <div class="ticker-content rss-ticker-target">Carregando notícias em tempo real...</div>
            </div>
          </div>
        `;
      }
    });

    html += '</div>';
    container.innerHTML = html;

    fetchRecentQueue();
  }

  // Fetch Queue Data & Populate Sidebar + Launcher Drawer
  async function fetchRecentQueue() {
    try {
      const res = await fetch('/api/queue/recent');
      if (!res.ok) return;
      const data = await res.json();

      const calls = data.calls || [];
      const waiting = data.waiting || [];
      const desks = data.desks || [];
      const services = data.services || [];

      // 1. Update Sidebar Queue Display
      if (calls.length > 0) {
        const last = calls[0];
        const numEl = document.getElementById('sidebarQueueNum');
        const locEl = document.getElementById('sidebarQueueLocation');
        const srvEl = document.getElementById('sidebarQueueService');
        const patEl = document.getElementById('sidebarQueuePatient');
        const badgeEl = document.getElementById('sidebarQueueBadge');

        if (numEl) numEl.innerText = last.ticket_number;
        if (locEl) locEl.innerText = last.location;
        if (srvEl) srvEl.innerText = `${last.service_name || 'Atendimento Geral'} (${last.service_type || 'Normal'})`;
        if (patEl) patEl.innerText = last.patient_name ? `Paciente: ${last.patient_name}` : '';
        if (badgeEl) {
          badgeEl.innerText = last.service_type === 'Prioritário' ? '⭐ ATENDIMENTO PRIORITÁRIO' : 'SENHA CHAMADA';
          badgeEl.style.backgroundColor = last.service_type === 'Prioritário' ? '#d97706' : '#ef4444';
        }

        const historyEl = document.getElementById('sidebarQueueHistory');
        if (historyEl) {
          const previousCalls = calls.slice(1, 4);
          if (previousCalls.length === 0) {
            historyEl.innerHTML = `<div style="font-size: 0.78rem; color: #64748b;">Sem chamadas anteriores</div>`;
          } else {
            historyEl.innerHTML = previousCalls.map((c) => `
              <div class="queue-history-item">
                <span class="qh-num">${c.ticket_number}</span>
                <span class="qh-loc">${c.location}</span>
              </div>
            `).join('');
          }
        }
      }

      const waitCounter = document.getElementById('sidebarWaitingCounter');
      if (waitCounter) {
        waitCounter.innerText = `Aguardando: ${waiting.length}`;
      }

      // 2. Populate Quick Queue Launcher Drawer (if present)
      const qGenService = document.getElementById('qGenService');
      if (qGenService && qGenService.options.length !== services.length) {
        qGenService.innerHTML = services.map((s) => `
          <option value="${s.id}">${s.name} (Prefixo ${s.prefix})</option>
        `).join('');
      }

      const qCallDesk = document.getElementById('qCallDesk');
      if (qCallDesk && qCallDesk.options.length !== desks.length) {
        const prevVal = qCallDesk.value;
        qCallDesk.innerHTML = desks.map((d) => `
          <option value="${d.name}">${d.name}</option>
        `).join('');
        if (prevVal) qCallDesk.value = prevVal;
      }

      const waitingBadge = document.getElementById('waitingCountBadge');
      if (waitingBadge) waitingBadge.innerText = waiting.length;

      const waitingListMini = document.getElementById('waitingListMini');
      if (waitingListMini) {
        if (waiting.length === 0) {
          waitingListMini.innerHTML = `<div style="font-size: 0.8rem; color: #64748b; text-align: center;">Nenhuma senha aguardando na fila.</div>`;
        } else {
          waitingListMini.innerHTML = waiting.map((w) => `
            <div class="waiting-mini-item">
              <div>
                <strong style="color: #fbbf24;">${w.ticket_number}</strong>
                <span style="color: #94a3b8; margin-left: 6px;">${w.service_name || ''} ${w.patient_name ? '(' + w.patient_name + ')' : ''}</span>
              </div>
              <button class="drawer-btn btn-green" style="padding: 3px 8px; font-size: 0.75rem;" data-call-id="${w.id}">
                Chamar
              </button>
            </div>
          `).join('');

          waitingListMini.querySelectorAll('[data-call-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const ticketId = btn.getAttribute('data-call-id');
              const location = document.getElementById('qCallDesk')?.value || 'Consultório 01';
              await fetch('/api/queue/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id: ticketId, location })
              });
            });
          });
        }
      }
    } catch (e) {
      console.warn('Queue fetch error:', e);
    }
  }

  // Bind Drawer Interactive Buttons
  function setupDrawerActions() {
    const btnGenTicket = document.getElementById('btnGenTicket');
    if (btnGenTicket) {
      btnGenTicket.addEventListener('click', async () => {
        const service_id = document.getElementById('qGenService')?.value;
        const patient_name = document.getElementById('qGenPatient')?.value || '';
        const feedback = document.getElementById('genTicketFeedback');

        const res = await fetch('/api/queue/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id, patient_name })
        });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('qGenPatient').value = '';
          if (feedback) {
            feedback.innerText = `✅ Ticket gerado: ${data.ticket.ticket_number} (${data.ticket.service_name})`;
            setTimeout(() => { feedback.innerText = ''; }, 5000);
          }
          fetchRecentQueue();
        }
      });
    }

    const btnCallNext = document.getElementById('btnCallNextQueue');
    if (btnCallNext) {
      btnCallNext.addEventListener('click', async () => {
        const location = document.getElementById('qCallDesk')?.value || 'Consultório 01';
        const feedback = document.getElementById('genTicketFeedback');
        const res = await fetch('/api/queue/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call_next: true, location })
        });
        if (!res.ok) {
          const err = await res.json();
          if (feedback) {
            feedback.innerText = `⚠️ ${err.error || 'Nenhuma senha na fila.'}`;
            setTimeout(() => { feedback.innerText = ''; }, 4000);
          }
        }
      });
    }

    const btnQuickAddDesk = document.getElementById('btnQuickAddDesk');
    const quickAddDeskBox = document.getElementById('quickAddDeskBox');
    const btnSaveInlineDesk = document.getElementById('btnSaveInlineDesk');
    if (btnQuickAddDesk && quickAddDeskBox) {
      btnQuickAddDesk.addEventListener('click', () => {
        const isHidden = quickAddDeskBox.style.display === 'none';
        quickAddDeskBox.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
          document.getElementById('newDeskInlineInput')?.focus();
        }
      });
    }
    if (btnSaveInlineDesk) {
      btnSaveInlineDesk.addEventListener('click', async () => {
        const inp = document.getElementById('newDeskInlineInput');
        const deskName = inp?.value.trim();
        if (!deskName) return;
        await fetch('/api/queue/desks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: deskName, category: 'Consultório' })
        });
        inp.value = '';
        if (quickAddDeskBox) quickAddDeskBox.style.display = 'none';
        fetchRecentQueue();
      });
    }

    const btnCallManual = document.getElementById('btnCallManual');
    if (btnCallManual) {
      btnCallManual.addEventListener('click', async () => {
        const ticket_number = document.getElementById('qManualNumber')?.value.trim();
        const service_name = document.getElementById('qManualService')?.value.trim() || 'Atendimento Geral';
        const patient_name = document.getElementById('qManualPatient')?.value.trim();
        const location = document.getElementById('qCallDesk')?.value || 'Consultório 01';

        if (!ticket_number) return;

        await fetch('/api/queue/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_number,
            location,
            service_name,
            service_type: ticket_number.toUpperCase().startsWith('P') ? 'Prioritário' : 'Normal',
            patient_name
          })
        });
        document.getElementById('qManualNumber').value = '';
        document.getElementById('qManualPatient').value = '';
      });
    }
  }

  // Ticker Zone Renderer
  function renderTickerZone(container) {
    container.innerHTML = `
      <div class="zone-ticker-wrapper">
        <div class="ticker-label">NOTÍCIAS</div>
        <div class="ticker-marquee">
          <div class="ticker-content rss-ticker-target" id="tickerText">
            Carregando notícias em tempo real...
          </div>
        </div>
      </div>
    `;
  }

  function renderAnnouncementsZone(container) {
    container.innerHTML = `
      <div class="widget-card widget-announcements" style="height: 100%; border-radius: 0; padding: 18px;">
        ${buildAnnouncementsHtml(true)}
      </div>
    `;
  }

  // Clock Widget Logic
  function startClock() {
    if (clockInterval) clearInterval(clockInterval);

    function update() {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

      const timeEl = document.getElementById('clockTime');
      const dateEl = document.getElementById('clockDate');
      if (timeEl) timeEl.innerText = timeStr;
      if (dateEl) dateEl.innerText = dateStr;
    }

    update();
    clockInterval = setInterval(update, 1000);
  }

  // Weather Widget Logic
  function startWeather() {
    if (weatherInterval) clearInterval(weatherInterval);

    async function updateWeather() {
      try {
        const res = await fetch('/api/widgets/weather');
        if (!res.ok) return;
        const data = await res.json();

        const iconEl = document.getElementById('weatherIcon');
        const tempEl = document.getElementById('weatherTemp');
        const cityEl = document.getElementById('weatherCity');
        const condEl = document.getElementById('weatherCond');
        const feelsEl = document.getElementById('weatherFeels');

        if (iconEl) iconEl.innerText = data.icon;
        if (tempEl) tempEl.innerText = `${data.temperature}°C`;
        if (cityEl) cityEl.innerText = data.city;
        if (condEl) condEl.innerText = data.condition;
        if (feelsEl) feelsEl.innerText = `Sensação: ${data.apparent_temperature}°C | Umid: ${data.humidity}%`;
      } catch (err) {
        console.warn('[Weather] Fetch error:', err);
      }
    }

    updateWeather();
    weatherInterval = setInterval(updateWeather, 20 * 60 * 1000);
  }

  // RSS Ticker Logic with Dynamic Comfortable Speed Calibration
  function startRssTicker() {
    if (rssInterval) clearInterval(rssInterval);

    async function updateRss() {
      try {
        const res = await fetch('/api/widgets/rss');
        if (!res.ok) return;
        const data = await res.json();

        const tickerTargets = document.querySelectorAll('.rss-ticker-target');
        if (tickerTargets.length > 0 && data.items && data.items.length > 0) {
          const itemsHtml = data.items
            .map((item) => `<span class="ticker-item">${escapeHtml(item.title)}</span><span class="ticker-separator">●</span>`)
            .join(' ');

          const speedPxPerSec = Math.max(15, Math.min(120, parseInt(settings.rss_scroll_speed, 10) || 40));

          tickerTargets.forEach((el) => {
            el.innerHTML = itemsHtml;
            // Measure total pixel width to calculate smooth duration (px / px_per_sec)
            requestAnimationFrame(() => {
              const totalWidth = el.scrollWidth + window.innerWidth;
              const durationSeconds = Math.max(45, Math.round(totalWidth / speedPxPerSec));
              el.style.setProperty('--ticker-duration', `${durationSeconds}s`);
              el.style.animationDuration = `${durationSeconds}s`;
            });
          });
        }
      } catch (err) {
        console.warn('[RSS] Fetch error:', err);
      }
    }

    updateRss();
    rssInterval = setInterval(updateRss, 5 * 60 * 1000);
  }

  // Initialize
  setupDrawerActions();
  fetchDisplayData();
  connectWebSocket();
})();
