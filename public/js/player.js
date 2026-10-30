// TV Corporativa - Player Engine v2.0
(function () {
  'use strict';

  // State
  let displayCode = 'TV-01';
  let displayData = null;
  let layoutConfig = null;
  let playlistItems = [];
  let currentItemIndex = -1;
  let mediaTimer = null;
  let ws = null;
  let audioUnlocked = false;
  let weatherInterval = null;
  let clockInterval = null;

  // Audio Context for Chime (zero external dependencies)
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

  // Play pleasant clinic chime (Do-Mi-Sol chord)
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
  function speakTicket(ticketNum, location) {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const text = `Atenção. Senha ${ticketNum}. Comparecer ao ${location}.`;
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
  const offlineBanner = document.getElementById('offlineBanner');

  // Handle Unmute Button Click
  if (audioUnmuteBtn) {
    audioUnmuteBtn.addEventListener('click', () => {
      audioUnlocked = true;
      initAudioContext();
      playChime();
      audioUnmuteBtn.style.display = 'none';
      console.log('[Audio] Audio policy unlocked by user gesture.');
    });
  }

  // Offline / Online network listeners
  window.addEventListener('online', () => {
    if (offlineBanner) offlineBanner.style.display = 'none';
    console.log('[Network] Online');
    fetchDisplayData();
  });

  window.addEventListener('offline', () => {
    if (offlineBanner) offlineBanner.style.display = 'flex';
    console.warn('[Network] Offline mode active');
  });

  // WebSocket Setup
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected. Registering display:', displayCode);
      ws.send(JSON.stringify({ type: 'display:register', displayCode }));

      // Heartbeat ping every 25 seconds
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
          console.log('[WebSocket] Received screen:reload event. Refreshing content...');
          fetchDisplayData();
        }

        if (msg.type === 'queue:call') {
          console.log('[WebSocket] Received queue:call event:', msg.data);
          handleQueueCall(msg.data);
        }
      } catch (err) {
        console.error('[WebSocket] Error handling message:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[WebSocket] Disconnected. Reconnecting in 5 seconds...');
      setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
      console.warn('[WebSocket] Error:', err);
      ws.close();
    };
  }

  // Handle Queue Ticket Call
  function handleQueueCall(ticket) {
    // 1. Play Chime
    playChime();

    // 2. Speak Ticket (after chime delay)
    setTimeout(() => {
      speakTicket(ticket.ticket_number, ticket.location);
    }, 900);

    // 3. Show Big Screen Popup
    if (queuePopup) {
      document.getElementById('popupTicket').innerText = ticket.ticket_number;
      document.getElementById('popupLocation').innerText = ticket.location;
      document.getElementById('popupPatient').innerText = ticket.patient_name ? `Paciente: ${ticket.patient_name}` : '';
      queuePopup.classList.add('show');

      // Auto-hide popup after 10 seconds
      setTimeout(() => {
        queuePopup.classList.remove('show');
      }, 10000);
    }

    // 4. Update any sidebar queue widget in DOM
    const sidebarTicketNum = document.getElementById('sidebarQueueNum');
    const sidebarLocation = document.getElementById('sidebarQueueLocation');
    const sidebarPatient = document.getElementById('sidebarQueuePatient');
    if (sidebarTicketNum) sidebarTicketNum.innerText = ticket.ticket_number;
    if (sidebarLocation) sidebarLocation.innerText = ticket.location;
    if (sidebarPatient) sidebarPatient.innerText = ticket.patient_name ? `Paciente: ${ticket.patient_name}` : '';
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

      // Save to localStorage for offline fallback
      localStorage.setItem(`tv_cache_${displayCode}`, JSON.stringify(data));

      renderLayout();
    } catch (err) {
      console.warn('[Player] Could not fetch online data, attempting cache:', err);
      const cached = localStorage.getItem(`tv_cache_${displayCode}`);
      if (cached) {
        const data = JSON.parse(cached);
        displayData = data;
        layoutConfig = data.layout.config;
        playlistItems = data.playlist.items || [];
        renderLayout();
        if (offlineBanner) offlineBanner.style.display = 'flex';
      }
    }
  }

  // Render Layout & Zones
  function renderLayout() {
    if (!layoutConfig || !layoutConfig.zones) {
      console.error('[Player] No layout zones configured');
      return;
    }

    // Clear container
    zoneContainer.innerHTML = '';

    // Create DOM for each zone
    layoutConfig.zones.forEach((zone) => {
      const zoneDiv = document.createElement('div');
      zoneDiv.className = `tv-zone zone-${zone.type.toLowerCase()}`;
      zoneDiv.id = zone.id;

      // Apply bounds
      if (zone.bounds) {
        zoneDiv.style.top = zone.bounds.top;
        zoneDiv.style.left = zone.bounds.left;
        zoneDiv.style.width = zone.bounds.width;
        zoneDiv.style.height = zone.bounds.height;
      }

      // Render Zone content based on type
      if (zone.type === 'PLAYLIST') {
        renderMediaZone(zoneDiv);
      } else if (zone.type === 'COMPOSITE' || zone.type === 'SIDEBAR') {
        renderSidebarZone(zoneDiv, zone.sub_widgets || []);
      } else if (zone.type === 'RSS_TICKER' || zone.type === 'ANNOUNCEMENTS_TICKER') {
        renderTickerZone(zoneDiv);
      } else if (zone.type === 'ANNOUNCEMENTS') {
        renderAnnouncementsZone(zoneDiv);
      }

      zoneContainer.appendChild(zoneDiv);
    });

    // Start Widgets
    startClock();
    startWeather();
    startRssTicker();

    // Start Media Player Engine
    startMediaPlayer();
  }

  // Media Player Engine
  let activeMediaElement = null;
  let nextMediaElement = null;

  function renderMediaZone(container) {
    container.innerHTML = `
      <div class="zone-media-wrapper" id="mediaWrapper">
        <div id="mediaPlaceholder" style="color: #6b7280; font-size: 1.5rem; text-align: center;">
          Carregando playlist da TV...
        </div>
      </div>
    `;
  }

  function startMediaPlayer() {
    if (mediaTimer) clearTimeout(mediaTimer);
    currentItemIndex = -1;

    if (!playlistItems || playlistItems.length === 0) {
      const wrapper = document.getElementById('mediaWrapper');
      if (wrapper) {
        wrapper.innerHTML = `
          <div style="color: #9ca3af; font-size: 1.8rem; text-align: center; padding: 20px;">
            <h2>TV Corporativa</h2>
            <p style="font-size: 1.2rem; margin-top: 10px;">Nenhuma mídia ativa cadastrada na playlist desta tela.</p>
          </div>
        `;
      }
      return;
    }

    playNextMedia();
  }

  function playNextMedia() {
    if (playlistItems.length === 0) return;

    currentItemIndex = (currentItemIndex + 1) % playlistItems.length;
    const item = playlistItems[currentItemIndex];
    const wrapper = document.getElementById('mediaWrapper');
    if (!wrapper) return;

    // Remove placeholder
    const placeholder = document.getElementById('mediaPlaceholder');
    if (placeholder) placeholder.remove();

    const mediaUrl = item.filename ? `/media/${item.filename}` : '';
    const isVideo = item.media_type === 'video';

    // Create new media element
    let el;
    if (isVideo) {
      el = document.createElement('video');
      el.className = 'media-item';
      el.src = mediaUrl;
      el.autoplay = true;
      el.playsInline = true;
      el.muted = !audioUnlocked; // muted by default unless user unmuted
      el.controls = false;
      el.preload = 'auto';

      let transitioned = false;
      const transitionNext = () => {
        if (!transitioned) {
          transitioned = true;
          playNextMedia();
        }
      };

      // Video finishes naturally
      el.addEventListener('ended', transitionNext);

      // Safety timeout: if video fails or freezes, advance after 60s max
      mediaTimer = setTimeout(transitionNext, 60000);

      el.addEventListener('error', (err) => {
        console.warn('[Video Error] Could not play video:', mediaUrl, err);
        setTimeout(transitionNext, 3000);
      });
    } else {
      // Image item
      el = document.createElement('img');
      el.className = 'media-item';
      el.src = mediaUrl;

      const duration = (item.duration_seconds || 10) * 1000;
      mediaTimer = setTimeout(() => {
        playNextMedia();
      }, duration);
    }

    wrapper.appendChild(el);

    // Force reflow for CSS opacity fade
    void el.offsetWidth;
    el.classList.add('active');

    // Remove previous element after crossfade (800ms)
    if (activeMediaElement) {
      const oldEl = activeMediaElement;
      oldEl.classList.remove('active');
      setTimeout(() => {
        if (oldEl && oldEl.parentNode) {
          oldEl.parentNode.removeChild(oldEl);
        }
      }, 900);
    }

    activeMediaElement = el;
  }

  // Sidebar Zone Renderer
  function renderSidebarZone(container, subWidgets) {
    let html = '<div class="zone-sidebar-wrapper">';

    subWidgets.forEach((w) => {
      if (w.type === 'CLOCK') {
        html += `
          <div class="widget-card widget-clock" id="clockCard">
            <div class="clock-time" id="clockTime">--:--</div>
            <div class="clock-date" id="clockDate">--</div>
          </div>
        `;
      } else if (w.type === 'WEATHER') {
        html += `
          <div class="widget-card widget-weather" id="weatherCard">
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
            <div class="queue-badge">ÚLTIMA SENHA CHAMADA</div>
            <div class="queue-ticket-num" id="sidebarQueueNum">---</div>
            <div class="queue-location" id="sidebarQueueLocation">Aguardando chamada...</div>
            <div class="queue-patient" id="sidebarQueuePatient"></div>
          </div>
        `;
      } else if (w.type === 'ANNOUNCEMENTS') {
        html += `
          <div class="widget-card widget-announcements">
            <div class="widget-title">📢 COMUNICADOS</div>
            <div class="announcement-body">
              Seja bem-vindo(a). Por gentileza, aguarde a chamada de sua senha no painel digital.
            </div>
          </div>
        `;
      }
    });

    html += '</div>';
    container.innerHTML = html;

    // Load recent queue call immediately
    fetchRecentQueue();
  }

  async function fetchRecentQueue() {
    try {
      const res = await fetch('/api/queue/recent');
      if (res.ok) {
        const data = await res.json();
        if (data.calls && data.calls.length > 0) {
          const last = data.calls[0];
          const numEl = document.getElementById('sidebarQueueNum');
          const locEl = document.getElementById('sidebarQueueLocation');
          const patEl = document.getElementById('sidebarQueuePatient');
          if (numEl) numEl.innerText = last.ticket_number;
          if (locEl) locEl.innerText = last.location;
          if (patEl) patEl.innerText = last.patient_name ? `Paciente: ${last.patient_name}` : '';
        }
      }
    } catch (e) {
      console.warn('Queue fetch error:', e);
    }
  }

  // Ticker Zone Renderer
  function renderTickerZone(container) {
    container.innerHTML = `
      <div class="zone-ticker-wrapper">
        <div class="ticker-label">NOTÍCIAS</div>
        <div class="ticker-marquee">
          <div class="ticker-content" id="tickerText">
            Carregando notícias em tempo real...
          </div>
        </div>
      </div>
    `;
  }

  function renderAnnouncementsZone(container) {
    container.innerHTML = `
      <div class="widget-card widget-announcements" style="height: 100%; border-radius: 0;">
        <div class="widget-title">📢 INFORMATIVO GERAL</div>
        <div class="announcement-body" style="font-size: 1.3rem;">
          Mantenha a atenção aos anúncios da tela. Em caso de dúvidas, procure o balcão de atendimento.
        </div>
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
    weatherInterval = setInterval(updateWeather, 20 * 60 * 1000); // 20 mins
  }

  // RSS Ticker Logic
  function startRssTicker() {
    async function updateRss() {
      try {
        const res = await fetch('/api/widgets/rss');
        if (!res.ok) return;
        const data = await res.json();

        const tickerEl = document.getElementById('tickerText');
        if (tickerEl && data.items && data.items.length > 0) {
          const itemsHtml = data.items
            .map((item) => `<span class="ticker-item">${item.title}</span><span class="ticker-separator">●</span>`)
            .join(' ');
          tickerEl.innerHTML = itemsHtml;
        }
      } catch (err) {
        console.warn('[RSS] Fetch error:', err);
      }
    }

    updateRss();
    setInterval(updateRss, 5 * 60 * 1000); // 5 mins
  }

  // Initialize
  console.log(`[Player] Initializing TV Corporativa Player for screen: ${displayCode}`);
  fetchDisplayData();
  connectWebSocket();
})();
