/**
 * TV Corporativa — Admin CMS Frontend Controller (v1.1.0)
 * Zero window.prompt() — Totalmente baseado em Modais, Toasts e Clipboard Paste (Ctrl+V)
 */

const API_BASE = '/api';
let token = localStorage.getItem('tv_corp_token') || null;
let currentUser = JSON.parse(localStorage.getItem('tv_corp_user') || 'null');
let currentView = 'dashboard';

// Preset Layouts Backup (para restaurar pré-configurações de fábrica a qualquer momento)
const DEFAULT_LAYOUT_PRESETS = {
  'layout-fullscreen': {
    name: 'Tela Cheia',
    aspect_ratio: '16:9',
    zones: [
      {
        id: 'zone_main',
        name: 'Mídia Principal',
        type: 'PLAYLIST',
        bounds: { top: '0%', left: '0%', width: '100%', height: '100%' }
      }
    ]
  },
  'layout-corporate-news': {
    name: 'Notícias & TV Corporativa',
    aspect_ratio: '16:9',
    zones: [
      {
        id: 'zone_media',
        name: 'Vídeo & Imagens',
        type: 'PLAYLIST',
        bounds: { top: '0%', left: '0%', width: '70%', height: '90%' }
      },
      {
        id: 'zone_sidebar',
        name: 'Barra Lateral (Clima & Comunicados)',
        type: 'COMPOSITE',
        bounds: { top: '0%', left: '70%', width: '30%', height: '90%' },
        sub_widgets: [
          { type: 'CLOCK', height: '22%' },
          { type: 'WEATHER', height: '28%' },
          { type: 'ANNOUNCEMENTS', height: '50%' }
        ]
      },
      {
        id: 'zone_ticker',
        name: 'Rodapé de Notícias (RSS)',
        type: 'RSS_TICKER',
        bounds: { top: '90%', left: '0%', width: '100%', height: '10%' }
      }
    ]
  },
  'layout-clinic-reception': {
    name: 'Consultório & Chamada de Senhas',
    aspect_ratio: '16:9',
    zones: [
      {
        id: 'zone_media',
        name: 'Vídeos Institucionais / Saúde',
        type: 'PLAYLIST',
        bounds: { top: '0%', left: '0%', width: '65%', height: '90%' }
      },
      {
        id: 'zone_sidebar',
        name: 'Painel de Senhas & Horário',
        type: 'COMPOSITE',
        bounds: { top: '0%', left: '65%', width: '35%', height: '90%' },
        sub_widgets: [
          { type: 'CLOCK', height: '18%' },
          { type: 'WEATHER', height: '22%' },
          { type: 'QUEUE_CALL', height: '60%' }
        ]
      },
      {
        id: 'zone_footer',
        name: 'Rodapé de Notícias (RSS)',
        type: 'RSS_TICKER',
        bounds: { top: '90%', left: '0%', width: '100%', height: '10%' }
      }
    ]
  },
  'layout-elevator-vertical': {
    name: 'Elevador / Totem Vertical',
    aspect_ratio: '9:16',
    zones: [
      {
        id: 'zone_header',
        name: 'Cabeçalho (Data, Hora e Tempo)',
        type: 'COMPOSITE',
        bounds: { top: '0%', left: '0%', width: '100%', height: '18%' },
        sub_widgets: [
          { type: 'CLOCK', width: '50%' },
          { type: 'WEATHER', width: '50%' }
        ]
      },
      {
        id: 'zone_media',
        name: 'Mídia Vertical',
        type: 'PLAYLIST',
        bounds: { top: '18%', left: '0%', width: '100%', height: '58%' }
      },
      {
        id: 'zone_announcements',
        name: 'Comunicados & Avisos',
        type: 'ANNOUNCEMENTS',
        bounds: { top: '76%', left: '0%', width: '100%', height: '16%' }
      },
      {
        id: 'zone_footer',
        name: 'Rodapé de Notícias (RSS)',
        type: 'RSS_TICKER',
        bounds: { top: '92%', left: '0%', width: '100%', height: '8%' }
      }
    ]
  },
  'layout-grid-quad': {
    name: 'Grid 4 Zonas',
    aspect_ratio: '16:9',
    zones: [
      {
        id: 'zone_q1',
        name: 'Quadrante Superior Esquerdo (Vídeos)',
        type: 'PLAYLIST',
        bounds: { top: '0%', left: '0%', width: '50%', height: '50%' }
      },
      {
        id: 'zone_q2',
        name: 'Quadrante Superior Direito (Clima & Relógio)',
        type: 'COMPOSITE',
        bounds: { top: '0%', left: '50%', width: '50%', height: '50%' },
        sub_widgets: [{ type: 'CLOCK', height: '40%' }, { type: 'WEATHER', height: '60%' }]
      },
      {
        id: 'zone_q3',
        name: 'Quadrante Inferior Esquerdo (Comunicados)',
        type: 'ANNOUNCEMENTS',
        bounds: { top: '50%', left: '0%', width: '50%', height: '50%' }
      },
      {
        id: 'zone_q4',
        name: 'Quadrante Inferior Direito (Notícias RSS)',
        type: 'RSS_TICKER',
        bounds: { top: '50%', left: '50%', width: '50%', height: '50%' }
      }
    ]
  }
};

// DOM Elements
const loginContainer = document.getElementById('loginContainer');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const viewContainer = document.getElementById('viewContent');
const pageTitle = document.getElementById('pageTitle');
const loggedUserName = document.getElementById('loggedUserName');
const loggedUserRole = document.getElementById('loggedUserRole');
const logoutBtn = document.getElementById('btnLogout');
const reloadScreensBtn = document.getElementById('reloadScreensBtn');

// Modal Elements
const globalModal = document.getElementById('globalModal');
const modalTitle = document.getElementById('globalModalTitle');
const modalBody = document.getElementById('globalModalBody');
const modalFooter = document.getElementById('globalModalFooter');
const modalCloseBtn = document.getElementById('globalModalClose');

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parsePct(val) {
  return Math.max(0, Math.min(100, parseInt(String(val ?? '0').replace('%', ''), 10) || 0));
}

function isVideoMedia(mediaType) {
  return String(mediaType || '').toLowerCase() === 'video';
}

function isImageMedia(mediaType) {
  return String(mediaType || '').toLowerCase() === 'image';
}

function isOnlineStatus(status) {
  return String(status || '').toLowerCase() === 'online';
}

function isPortraitOrientation(orient) {
  return String(orient || '').toLowerCase() === 'portrait';
}

// ============================================================================
// TOAST & MODAL SYSTEM
// ============================================================================
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'error' ? '❌' : (type === 'info' ? 'ℹ️' : '✅');
  toast.innerHTML = `<span>${icon}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function openModal({ title, bodyHtml, footerHtml, onMount }) {
  modalTitle.textContent = title || 'Janela';
  modalBody.innerHTML = bodyHtml || '';
  modalFooter.innerHTML = footerHtml || '';
  globalModal.classList.remove('hidden');
  if (typeof onMount === 'function') {
    onMount(modalBody, modalFooter);
  }
}

function closeModal() {
  globalModal.classList.add('hidden');
  modalBody.innerHTML = '';
  modalFooter.innerHTML = '';
}

window.closeModal = closeModal;

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
if (globalModal) {
  globalModal.addEventListener('click', (e) => {
    if (e.target === globalModal) closeModal();
  });
}

// ============================================================================
// API & CLIPBOARD UPLOAD HELPERS
// ============================================================================
async function apiFetch(endpoint, options = {}) {
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erro na requisição');
  }
  return data;
}

/**
 * Faz upload de um File/Blob (ex: imagem colada da Área de Transferência Ctrl+V)
 * e retorna o objeto media criado ({ filename, original_name, ... })
 */
async function uploadImageFileOrBlob(fileOrBlob, customName = null, duration = 10) {
  const formData = new FormData();
  let fileToUpload = fileOrBlob;
  if (!(fileOrBlob instanceof File) || !fileOrBlob.name || fileOrBlob.name === 'image.png') {
    const ext = (fileOrBlob.type && fileOrBlob.type.split('/')[1]) || 'png';
    const fileName = customName || `colado_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
    fileToUpload = new File([fileOrBlob], fileName, { type: fileOrBlob.type || 'image/png' });
  }
  formData.append('file', fileToUpload);
  formData.append('duration_seconds', String(duration));
  const res = await apiFetch('/media/upload', {
    method: 'POST',
    body: formData
  });
  return res.media;
}

// ============================================================================
// AUTH & NAVIGATION
// ============================================================================
function checkAuth() {
  if (token && currentUser) {
    if (currentUser.username === 'edkallenn' && currentUser.name === 'Ed Kallenn') {
      currentUser.name = 'Edkallenn';
      localStorage.setItem('tv_corp_user', JSON.stringify(currentUser));
    }
    if (loginContainer) loginContainer.classList.add('hidden');
    if (loggedUserName) loggedUserName.textContent = currentUser.name || currentUser.username;
    if (loggedUserRole) loggedUserRole.textContent = String(currentUser.role || 'admin').toUpperCase();
    loadView(currentView);
  } else {
    if (loginContainer) loginContainer.classList.remove('hidden');
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('tv_corp_token');
  localStorage.removeItem('tv_corp_user');
  checkAuth();
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.classList.add('hidden');
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('tv_corp_token', token);
      localStorage.setItem('tv_corp_user', JSON.stringify(currentUser));
      showToast(`Bem-vindo, ${currentUser.name || currentUser.username}!`);
      checkAuth();
    } catch (err) {
      if (loginError) {
        loginError.textContent = err.message;
        loginError.classList.remove('hidden');
        loginError.style.display = 'block';
      }
    }
  });
}

if (logoutBtn) logoutBtn.addEventListener('click', logout);

if (reloadScreensBtn) {
  reloadScreensBtn.addEventListener('click', async () => {
    try {
      await apiFetch('/settings/reload-screens', { method: 'POST' });
      showToast('Sinal de atualização instantânea enviado para todas as TVs!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    const view = item.getAttribute('data-view');
    loadView(view);
  });
});

async function loadView(view) {
  currentView = view;
  const titles = {
    dashboard: 'Dashboard & Monitoramento',
    displays: 'Telas & Displays',
    media: 'Biblioteca de Mídias',
    playlists: 'Playlists & Slides',
    layouts: 'Layouts Multi-Zonas',
    announcements: 'Comunicados & Identidade Visual (Marca)',
    queue: 'Chamador de Senhas, Atendimentos & Guichês',
    settings: 'Configurações Globais'
  };
  pageTitle.textContent = titles[view] || 'Painel';
  viewContainer.innerHTML = `<p style="color:var(--text-muted)">Carregando...</p>`;

  try {
    if (view === 'dashboard') await renderDashboard();
    else if (view === 'displays') await renderDisplays();
    else if (view === 'media') await renderMedia();
    else if (view === 'playlists') await renderPlaylists();
    else if (view === 'layouts') await renderLayouts();
    else if (view === 'announcements') await renderAnnouncements();
    else if (view === 'queue') await renderQueue();
    else if (view === 'settings') await renderSettings();
  } catch (err) {
    viewContainer.innerHTML = `<div class="card"><p style="color:var(--danger)">Erro ao carregar visão: ${escHtml(err.message)}</p></div>`;
  }
}

// ============================================================================
// 1. DASHBOARD VIEW
// ============================================================================
async function renderDashboard() {
  const [displaysData, mediaData, playlistsData, queueData] = await Promise.all([
    apiFetch('/displays'),
    apiFetch('/media'),
    apiFetch('/playlists'),
    apiFetch('/queue/recent')
  ]);

  const onlineCount = displaysData.displays.filter((d) => isOnlineStatus(d.status)).length;
  const waitingCount = (queueData.waiting || []).length;

  viewContainer.innerHTML = `
    <div class="grid-4">
      <div class="stat-card">
        <div>
          <div class="stat-label">Telas Cadastradas</div>
          <div class="stat-value">${displaysData.displays.length}</div>
          <span class="badge badge-success">${onlineCount} Online agora</span>
        </div>
        <div style="font-size:2rem;">🖥️</div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-label">Arquivos de Mídia</div>
          <div class="stat-value">${mediaData.media.length}</div>
          <span class="badge badge-info">Imagens & Vídeos</span>
        </div>
        <div style="font-size:2rem;">🎬</div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-label">Playlists Ativas</div>
          <div class="stat-value">${playlistsData.playlists.length}</div>
          <span class="badge badge-info">Programação</span>
        </div>
        <div style="font-size:2rem;">📋</div>
      </div>
      <div class="stat-card">
        <div>
          <div class="stat-label">Última Senha / Fila</div>
          <div class="stat-value">${escHtml(queueData.calls[0]?.ticket_number || '---')}</div>
          <span class="badge badge-warning">${waitingCount} aguardando</span>
        </div>
        <div style="font-size:2rem;">🎫</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Status das Telas (Displays)</span>
        <button class="btn btn-sm btn-primary" onclick="document.querySelector('[data-view=displays]').click()">Gerenciar Telas</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome da Tela</th>
              <th>Layout Atual</th>
              <th>Orientação</th>
              <th>Status</th>
              <th>Ações Rápidas</th>
            </tr>
          </thead>
          <tbody>
            ${displaysData.displays.map((d) => `
              <tr>
                <td><strong>${escHtml(d.code)}</strong></td>
                <td>${escHtml(d.name)}<br><small style="color:var(--text-muted)">${escHtml(d.location || '')}</small></td>
                <td><span class="badge badge-info">${escHtml(d.layout_name || 'Padrão')}</span></td>
                <td>${isPortraitOrientation(d.orientation) ? '📱 Vertical (9:16)' : '🖥️ Horizontal (16:9)'} (${escHtml(d.resolution)})</td>
                <td>
                  <span class="badge ${isOnlineStatus(d.status) ? 'badge-success' : 'badge-warning'}">
                    ${escHtml(String(d.status || '').toUpperCase())}
                  </span>
                </td>
                <td style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                  <a href="/player?code=${encodeURIComponent(d.code)}" target="_blank" class="btn btn-sm btn-primary">▶ Abrir Player</a>
                  <button class="btn btn-sm btn-outline" onclick="editDisplayById('${d.id}')">✏️ Editar</button>
                  <button class="btn btn-sm btn-outline" onclick="reloadSingleScreen('${escHtml(d.code)}')">🔄</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.reloadSingleScreen = async (code) => {
  try {
    await apiFetch('/settings/reload-screens', {
      method: 'POST',
      body: JSON.stringify({ screenCode: code })
    });
    showToast(`Tela ${code} recarregada!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.editDisplayById = async (id) => {
  try {
    const [dispRes, layoutsRes, playlistsRes] = await Promise.all([
      apiFetch(`/displays/${id}`),
      apiFetch('/layouts'),
      apiFetch('/playlists')
    ]);
    openDisplayModal(dispRes.display, layoutsRes.layouts, playlistsRes.playlists);
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================================
// 2. DISPLAYS VIEW (COM EDIÇÃO COMPLETA E MODAL MODERNO)
// ============================================================================
let cachedDisplays = [];
let cachedLayouts = [];
let cachedPlaylists = [];

async function renderDisplays() {
  const [displaysData, layoutsData, playlistsData] = await Promise.all([
    apiFetch('/displays'),
    apiFetch('/layouts'),
    apiFetch('/playlists')
  ]);

  cachedDisplays = displaysData.displays;
  cachedLayouts = layoutsData.layouts;
  cachedPlaylists = playlistsData.playlists;

  viewContainer.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">Gerenciar Telas & Pontos de Exibição</span>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
            Edite qualquer tela (nome, código, layout, playlist, resolução, cabeçalho da empresa e orientação) ou cadastre novos pontos.
          </p>
        </div>
        <button class="btn btn-primary" id="btnNewDisplay">+ Nova Tela</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nome / Localização</th>
              <th>Layout Multi-Zona</th>
              <th>Playlist Vinculada</th>
              <th>Cabeçalho Marca</th>
              <th>Orientação</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${cachedDisplays.map((d) => {
              const pl = cachedPlaylists.find((p) => p.id === d.playlist_id);
              return `
              <tr>
                <td><strong style="color:var(--accent);font-size:0.95rem;">${escHtml(d.code)}</strong></td>
                <td>
                  <strong>${escHtml(d.name)}</strong>
                  <div style="font-size:0.75rem;color:var(--text-muted)">📍 ${escHtml(d.location || 'Sem local definido')}</div>
                </td>
                <td>
                  <select class="form-control" style="padding:0.35rem;font-size:0.82rem;" onchange="updateDisplayQuickLayout('${d.id}', this.value)">
                    ${cachedLayouts.map((l) => `<option value="${l.id}" ${d.layout_id === l.id ? 'selected' : ''}>${escHtml(l.name)} (${escHtml(l.aspect_ratio)})</option>`).join('')}
                  </select>
                </td>
                <td>
                  <span class="badge badge-info">${escHtml(pl ? pl.name : 'Playlist Padrão')}</span>
                </td>
                <td>
                  <span class="badge ${d.show_header !== 0 ? 'badge-success' : 'badge-warning'}">
                    ${d.show_header !== 0 ? 'Visível' : 'Oculto'}
                  </span>
                </td>
                <td>${isPortraitOrientation(d.orientation) ? '📱 Vertical (9:16)' : '🖥️ Horizontal (16:9)'}<br><small style="color:var(--text-muted)">${escHtml(d.resolution)}</small></td>
                <td><span class="badge ${isOnlineStatus(d.status) ? 'badge-success' : 'badge-warning'}">${escHtml(String(d.status || '').toUpperCase())}</span></td>
                <td>
                  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <a href="/player?code=${encodeURIComponent(d.code)}" target="_blank" class="btn btn-sm btn-primary">▶ Abrir</a>
                    <button class="btn btn-sm btn-outline" onclick="openEditDisplayModalByIndex('${d.id}')">✏️ Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteDisplay('${d.id}', '${escHtml(d.code)}')">🗑️</button>
                  </div>
                </td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btnNewDisplay').addEventListener('click', () => {
    openDisplayModal(null, cachedLayouts, cachedPlaylists);
  });
}

window.openEditDisplayModalByIndex = (id) => {
  const disp = cachedDisplays.find((d) => d.id === id);
  if (disp) {
    openDisplayModal(disp, cachedLayouts, cachedPlaylists);
  }
};

function openDisplayModal(display, layouts, playlists) {
  const isEdit = Boolean(display);
  const d = display || {
    name: '',
    code: `TV-0${cachedDisplays.length + 1}`,
    location: '',
    layout_id: layouts[0]?.id || 'layout-corporate-news',
    playlist_id: 'playlist-default',
    orientation: 'landscape',
    resolution: '1920x1080',
    show_header: 1
  };

  const currentOrient = isPortraitOrientation(d.orientation) ? 'portrait' : 'landscape';

  openModal({
    title: isEdit ? `✏️ Editar Tela: ${d.code}` : '🖥️ Cadastrar Nova Tela / Display',
    bodyHtml: `
      <form id="displayModalForm">
        <div class="grid-2">
          <div class="form-group">
            <label>Código Identificador (URL do Player)</label>
            <input type="text" id="dmCode" class="form-control" value="${escHtml(d.code)}" placeholder="Ex: TV-01, TOTEM-01" required />
          </div>
          <div class="form-group">
            <label>Nome da Tela</label>
            <input type="text" id="dmName" class="form-control" value="${escHtml(d.name)}" placeholder="Ex: Recepção Principal" required />
          </div>
        </div>

        <div class="form-group">
          <label>Localização Física</label>
          <input type="text" id="dmLocation" class="form-control" value="${escHtml(d.location || '')}" placeholder="Ex: Hall de Entrada - Térreo" />
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Layout Multi-Zonas</label>
            <select id="dmLayout" class="form-control">
              ${layouts.map((l) => `<option value="${l.id}" ${d.layout_id === l.id ? 'selected' : ''}>${escHtml(l.name)} (${escHtml(l.aspect_ratio)})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Playlist de Mídias</label>
            <select id="dmPlaylist" class="form-control">
              ${playlists.map((p) => `<option value="${p.id}" ${(d.playlist_id || 'playlist-default') === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid-3">
          <div class="form-group">
            <label>Orientação da Tela</label>
            <select id="dmOrientation" class="form-control">
              <option value="landscape" ${currentOrient === 'landscape' ? 'selected' : ''}>Horizontal (16:9 - TV)</option>
              <option value="portrait" ${currentOrient === 'portrait' ? 'selected' : ''}>Vertical (9:16 - Totem)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Resolução Nativa</label>
            <select id="dmResolution" class="form-control">
              <option value="1920x1080" ${d.resolution === '1920x1080' ? 'selected' : ''}>1920x1080 (Full HD Horizontal)</option>
              <option value="1080x1920" ${d.resolution === '1080x1920' ? 'selected' : ''}>1080x1920 (Full HD Vertical Totem)</option>
              <option value="3840x2160" ${d.resolution === '3840x2160' ? 'selected' : ''}>3840x2160 (4K Ultra HD)</option>
              <option value="1280x720" ${d.resolution === '1280x720' ? 'selected' : ''}>1280x720 (HD)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Cabeçalho da Empresa (Logo + Nome)</label>
            <select id="dmShowHeader" class="form-control">
              <option value="1" ${d.show_header !== 0 ? 'selected' : ''}>✅ Exibir no Topo</option>
              <option value="0" ${d.show_header === 0 ? 'selected' : ''}>🚫 Ocultar nesta Tela</option>
            </select>
          </div>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" id="dmCancelBtn">Cancelar</button>
      <button type="button" class="btn btn-primary" id="dmSaveBtn">${isEdit ? '💾 Salvar Alterações' : '➕ Criar Tela'}</button>
    `,
    onMount: (body, footer) => {
      const orientEl = body.querySelector('#dmOrientation');
      const resEl = body.querySelector('#dmResolution');
      orientEl.addEventListener('change', () => {
        if (orientEl.value === 'portrait' && resEl.value === '1920x1080') {
          resEl.value = '1080x1920';
        } else if (orientEl.value === 'landscape' && resEl.value === '1080x1920') {
          resEl.value = '1920x1080';
        }
      });

      footer.querySelector('#dmCancelBtn').addEventListener('click', closeModal);
      footer.querySelector('#dmSaveBtn').addEventListener('click', async () => {
        const payload = {
          code: body.querySelector('#dmCode').value.trim().toUpperCase(),
          name: body.querySelector('#dmName').value.trim(),
          location: body.querySelector('#dmLocation').value.trim(),
          layout_id: body.querySelector('#dmLayout').value,
          playlist_id: body.querySelector('#dmPlaylist').value,
          orientation: body.querySelector('#dmOrientation').value,
          resolution: body.querySelector('#dmResolution').value,
          show_header: body.querySelector('#dmShowHeader').value === '1'
        };

        if (!payload.code || !payload.name) {
          showToast('Preencha o Código e o Nome da tela.', 'error');
          return;
        }

        try {
          if (isEdit) {
            await apiFetch(`/displays/${d.id}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            showToast(`Tela ${payload.code} atualizada com sucesso!`);
          } else {
            await apiFetch('/displays', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            showToast(`Tela ${payload.code} criada com sucesso!`);
          }
          closeModal();
          loadView(currentView);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
}

window.updateDisplayQuickLayout = async (id, layout_id) => {
  try {
    await apiFetch(`/displays/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ layout_id })
    });
    showToast('Layout atualizado e tela recarregada!');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteDisplay = async (id, code) => {
  openModal({
    title: `🗑️ Remover Tela ${code}`,
    bodyHtml: `<p>Tem certeza que deseja excluir a tela <strong>${escHtml(code)}</strong>?</p>`,
    footerHtml: `
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-danger" id="confirmDeleteDisplayBtn">Sim, Excluir</button>
    `,
    onMount: (_, footer) => {
      footer.querySelector('#confirmDeleteDisplayBtn').addEventListener('click', async () => {
        try {
          await apiFetch(`/displays/${id}`, { method: 'DELETE' });
          closeModal();
          showToast(`Tela ${code} removida.`);
          renderDisplays();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
};

// ============================================================================
// 3. MEDIA LIBRARY VIEW (COM UPLOAD + COLAR DA ÁREA DE TRANSFERÊNCIA CTRL+V)
// ============================================================================
async function renderMedia() {
  const data = await apiFetch('/media');

  viewContainer.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Enviar Nova Mídia (Imagem ou Vídeo)</span>
      </div>
      <div class="grid-2" style="margin-bottom:0;">
        <form id="uploadMediaForm" style="display:flex;flex-direction:column;gap:0.85rem;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Arquivo (PNG, JPG, GIF, WEBP, MP4, WEBM)</label>
            <input type="file" id="mediaFile" class="form-control" accept="image/*,video/*" required />
          </div>
          <div style="display:flex;gap:0.75rem;align-items:flex-end;">
            <div class="form-group" style="margin-bottom:0;flex:1;">
              <label>Duração Padrão no Slide (segundos)</label>
              <input type="number" id="mediaDuration" class="form-control" value="10" min="3" max="600" />
            </div>
            <button type="submit" class="btn btn-primary">⬆️ Enviar Arquivo</button>
          </div>
        </form>

        <div id="mediaPasteZone" class="paste-dropzone" tabindex="0">
          <div style="font-size:1.8rem;margin-bottom:0.35rem;">📋</div>
          <strong>Colar Imagem da Área de Transferência (Ctrl+V)</strong>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem;">
            Copie qualquer imagem ou print do seu computador e pressione <kbd style="background:#0f172a;padding:2px 6px;border-radius:4px;border:1px solid #334155;">Ctrl + V</kbd> aqui para enviar instantaneamente!
          </p>
        </div>
      </div>
    </div>

    <div class="media-grid">
      ${data.media.map((m) => `
        <div class="media-card">
          ${isVideoMedia(m.media_type)
            ? `<video class="media-thumb" src="/media/${encodeURIComponent(m.filename)}" muted preload="metadata" onmouseover="this.play()" onmouseout="this.pause()"></video>`
            : `<img class="media-thumb" src="/media/${encodeURIComponent(m.filename)}" alt="${escHtml(m.original_name)}" />`
          }
          <div class="media-info">
            <div class="media-title" title="${escHtml(m.original_name)}">${escHtml(m.original_name)}</div>
            <div class="media-meta">
              <span class="badge ${isVideoMedia(m.media_type) ? 'badge-warning' : 'badge-info'}">${escHtml(String(m.media_type || '').toUpperCase())}</span>
              <span>⏱️ ${m.duration_seconds}s</span>
            </div>
            <div style="margin-top:0.75rem;display:flex;gap:0.4rem;">
              <button class="btn btn-sm btn-outline" style="flex:1" onclick="openEditMediaModal('${m.id}', '${escHtml(m.original_name)}', ${m.duration_seconds})">✏️ Editar</button>
              <button class="btn btn-sm btn-danger" onclick="deleteMedia('${m.id}', '${escHtml(m.original_name)}')">🗑️</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById('uploadMediaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('mediaFile');
    const durationInput = document.getElementById('mediaDuration');
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('duration_seconds', durationInput.value);

    try {
      await apiFetch('/media/upload', {
        method: 'POST',
        body: formData
      });
      showToast('Mídia enviada com sucesso!');
      renderMedia();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  const pasteZone = document.getElementById('mediaPasteZone');
  if (pasteZone) {
    pasteZone.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          const dur = parseInt(document.getElementById('mediaDuration')?.value || '10', 10);
          showToast('Enviando imagem colada da área de transferência...', 'info');
          try {
            await uploadImageFileOrBlob(blob, null, dur);
            showToast('Imagem colada e salva na biblioteca!');
            renderMedia();
          } catch (err) {
            showToast(err.message, 'error');
          }
          return;
        }
      }
      showToast('Nenhuma imagem encontrada na área de transferência.', 'error');
    });
  }
}

window.openEditMediaModal = (id, currentName, currentDuration) => {
  openModal({
    title: '✏️ Editar Mídia',
    bodyHtml: `
      <div class="form-group">
        <label>Nome de Exibição</label>
        <input type="text" id="emName" class="form-control" value="${escHtml(currentName)}" />
      </div>
      <div class="form-group">
        <label>Duração Padrão (segundos)</label>
        <input type="number" id="emDuration" class="form-control" value="${currentDuration}" min="3" max="600" />
      </div>
    `,
    footerHtml: `
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="emSaveBtn">💾 Salvar</button>
    `,
    onMount: (body, footer) => {
      footer.querySelector('#emSaveBtn').addEventListener('click', async () => {
        try {
          await apiFetch(`/media/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              original_name: body.querySelector('#emName').value.trim(),
              duration_seconds: parseInt(body.querySelector('#emDuration').value, 10) || 10
            })
          });
          closeModal();
          showToast('Mídia atualizada!');
          renderMedia();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
};

window.deleteMedia = async (id, name) => {
  openModal({
    title: '🗑️ Remover Mídia',
    bodyHtml: `<p>Deseja remover <strong>${escHtml(name)}</strong> das galerias e playlists?</p>`,
    footerHtml: `
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-danger" id="confirmDelMediaBtn">Excluir</button>
    `,
    onMount: (_, footer) => {
      footer.querySelector('#confirmDelMediaBtn').addEventListener('click', async () => {
        try {
          await apiFetch(`/media/${id}`, { method: 'DELETE' });
          closeModal();
          showToast('Mídia removida!');
          renderMedia();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
};

// ============================================================================
// 4. PLAYLISTS & SLIDES VIEW (SELETOR VISUAL COM MINIATURAS + REORDENAÇÃO)
// ============================================================================
let selectedPlaylistId = 'playlist-default';
let currentPlaylistItems = [];

async function renderPlaylists() {
  const [playlistsData, mediaData] = await Promise.all([
    apiFetch('/playlists'),
    apiFetch('/media')
  ]);

  if (!playlistsData.playlists.some((p) => p.id === selectedPlaylistId) && playlistsData.playlists[0]) {
    selectedPlaylistId = playlistsData.playlists[0].id;
  }

  const activePlaylist = await apiFetch(`/playlists/${selectedPlaylistId}`);
  currentPlaylistItems = activePlaylist.playlist.items || [];

  viewContainer.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">Programação de Slides: ${escHtml(activePlaylist.playlist.name)}</span>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
            Ordene os slides, defina o tempo de cada um ou adicione novas mídias visualmente através do seletor de miniaturas.
          </p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
          <select id="playlistSelector" class="form-control" style="width:auto;" onchange="switchPlaylist(this.value)">
            ${playlistsData.playlists.map((p) => `<option value="${p.id}" ${p.id === selectedPlaylistId ? 'selected' : ''}>📋 ${escHtml(p.name)} (${p.item_count} itens)</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm" id="btnNewPlaylist">+ Nova Playlist</button>
          <button class="btn btn-primary btn-sm" id="btnAddMediaModal">+ Adicionar Mídia à Playlist</button>
        </div>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style="width:90px;">Ordem</th>
              <th style="width:95px;">Miniatura</th>
              <th>Arquivo de Mídia</th>
              <th>Tipo</th>
              <th style="width:140px;">Duração (seg)</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${currentPlaylistItems.length === 0 ? `
              <tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Nenhum slide nesta playlist. Clique em "+ Adicionar Mídia à Playlist".</td></tr>
            ` : currentPlaylistItems.map((item, idx) => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:0.35rem;">
                    <strong>#${idx + 1}</strong>
                    <button class="btn btn-sm btn-outline" style="padding:0.15rem 0.4rem;" ${idx === 0 ? 'disabled' : ''} onclick="movePlaylistItem(${idx}, -1)" title="Subir">⬆️</button>
                    <button class="btn btn-sm btn-outline" style="padding:0.15rem 0.4rem;" ${idx === currentPlaylistItems.length - 1 ? 'disabled' : ''} onclick="movePlaylistItem(${idx}, 1)" title="Descer">⬇️</button>
                  </div>
                </td>
                <td>
                  ${isVideoMedia(item.media_type)
                    ? `<video src="/media/${encodeURIComponent(item.filename)}" style="width:72px;height:44px;object-fit:cover;border-radius:6px;background:#000;" muted></video>`
                    : `<img src="/media/${encodeURIComponent(item.filename)}" style="width:72px;height:44px;object-fit:cover;border-radius:6px;background:#000;" />`
                  }
                </td>
                <td><strong>${escHtml(item.original_name || item.filename || item.widget_type)}</strong></td>
                <td><span class="badge ${isVideoMedia(item.media_type) ? 'badge-warning' : 'badge-info'}">${escHtml(String(item.media_type || 'WIDGET').toUpperCase())}</span></td>
                <td>
                  <div style="display:flex;align-items:center;gap:0.35rem;">
                    <input type="number" class="form-control" style="width:75px;padding:0.3rem 0.45rem;" value="${item.duration_seconds}" min="3" max="600" onchange="updatePlaylistItemDuration('${item.id}', this.value)" />
                    <span style="font-size:0.75rem;color:var(--text-muted)">seg</span>
                  </div>
                </td>
                <td>
                  <span class="badge ${item.is_active ? 'badge-success' : 'badge-danger'}">
                    ${item.is_active ? 'Ativo' : 'Pausado'}
                  </span>
                </td>
                <td>
                  <div style="display:flex;gap:0.4rem;">
                    <button class="btn btn-sm btn-outline" onclick="togglePlaylistItem('${item.id}', ${!item.is_active})">
                      ${item.is_active ? '⏸ Pausar' : '▶ Ativar'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="removePlaylistItem('${item.id}')">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btnNewPlaylist').addEventListener('click', () => {
    openModal({
      title: '📋 Criar Nova Playlist',
      bodyHtml: `
        <div class="form-group">
          <label>Nome da Playlist</label>
          <input type="text" id="npName" class="form-control" placeholder="Ex: Campanha Outubro Rosa" required />
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <input type="text" id="npDesc" class="form-control" placeholder="Ex: Slides exclusivos para a recepção" />
        </div>
      `,
      footerHtml: `
        <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" id="npSaveBtn">➕ Criar Playlist</button>
      `,
      onMount: (body, footer) => {
        footer.querySelector('#npSaveBtn').addEventListener('click', async () => {
          const name = body.querySelector('#npName').value.trim();
          const description = body.querySelector('#npDesc').value.trim();
          if (!name) {
            showToast('Informe o nome da playlist.', 'error');
            return;
          }
          try {
            const res = await apiFetch('/playlists', {
              method: 'POST',
              body: JSON.stringify({ name, description })
            });
            selectedPlaylistId = res.playlist.id;
            closeModal();
            showToast('Playlist criada com sucesso!');
            renderPlaylists();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    });
  });

  document.getElementById('btnAddMediaModal').addEventListener('click', () => {
    openMediaPickerForPlaylist(mediaData.media, activePlaylist.playlist);
  });
}

window.switchPlaylist = (id) => {
  selectedPlaylistId = id;
  renderPlaylists();
};

function openMediaPickerForPlaylist(mediaList, playlist) {
  let chosenMediaId = mediaList[0]?.id || null;

  openModal({
    title: `🎬 Adicionar Mídia em "${playlist.name}"`,
    bodyHtml: `
      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.85rem;">
        Clique em uma miniatura abaixo para selecioná-la e defina o tempo de exibição:
      </p>
      ${mediaList.length === 0
        ? `<p style="color:var(--warning)">Nenhuma mídia cadastrada. Envie um arquivo na aba Biblioteca de Mídias primeiro.</p>`
        : `
          <div class="picker-grid" id="mediaPickerGrid">
            ${mediaList.map((m, idx) => `
              <div class="picker-item ${idx === 0 ? 'selected' : ''}" data-id="${m.id}" data-duration="${m.duration_seconds || 10}">
                ${isVideoMedia(m.media_type)
                  ? `<video src="/media/${encodeURIComponent(m.filename)}" muted></video>`
                  : `<img src="/media/${encodeURIComponent(m.filename)}" alt="${escHtml(m.original_name)}" />`
                }
                <div class="picker-item-name" title="${escHtml(m.original_name)}">${escHtml(m.original_name)}</div>
                <span class="badge ${isVideoMedia(m.media_type) ? 'badge-warning' : 'badge-info'}" style="margin-top:0.25rem;font-size:0.65rem;">${escHtml(String(m.media_type || '').toUpperCase())}</span>
              </div>
            `).join('')}
          </div>
          <div class="form-group" style="margin-top:1.1rem;max-width:260px;">
            <label>Tempo de Exibição deste Slide (segundos)</label>
            <input type="number" id="pickerDuration" class="form-control" value="${mediaList[0]?.duration_seconds || 10}" min="3" max="600" />
          </div>
        `
      }
    `,
    footerHtml: `
      <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" id="confirmAddMediaToPlBtn" ${mediaList.length === 0 ? 'disabled' : ''}>➕ Adicionar Slide à Playlist</button>
    `,
    onMount: (body, footer) => {
      const cards = body.querySelectorAll('.picker-item');
      const durInput = body.querySelector('#pickerDuration');
      cards.forEach((card) => {
        card.addEventListener('click', () => {
          cards.forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          chosenMediaId = card.getAttribute('data-id');
          if (durInput) durInput.value = card.getAttribute('data-duration') || 10;
        });
      });

      footer.querySelector('#confirmAddMediaToPlBtn')?.addEventListener('click', async () => {
        if (!chosenMediaId) return;
        const duration_seconds = parseInt(durInput?.value || '10', 10) || 10;
        try {
          await apiFetch(`/playlists/${playlist.id}/items`, {
            method: 'POST',
            body: JSON.stringify({ media_id: chosenMediaId, duration_seconds })
          });
          closeModal();
          showToast('Slide adicionado à playlist e TVs atualizadas!');
          renderPlaylists();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
}

window.movePlaylistItem = async (index, direction) => {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= currentPlaylistItems.length) return;
  const ids = currentPlaylistItems.map((i) => i.id);
  const temp = ids[index];
  ids[index] = ids[targetIndex];
  ids[targetIndex] = temp;

  try {
    await apiFetch(`/playlists/${selectedPlaylistId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ itemIds: ids })
    });
    showToast('Ordem dos slides atualizada!');
    renderPlaylists();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.updatePlaylistItemDuration = async (itemId, duration_seconds) => {
  try {
    await apiFetch(`/playlists/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ duration_seconds: parseInt(duration_seconds, 10) || 10 })
    });
    showToast('Duração do slide atualizada!');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.togglePlaylistItem = async (itemId, is_active) => {
  try {
    await apiFetch(`/playlists/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_active })
    });
    renderPlaylists();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.removePlaylistItem = async (itemId) => {
  try {
    await apiFetch(`/playlists/items/${itemId}`, { method: 'DELETE' });
    showToast('Slide removido da playlist.');
    renderPlaylists();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================================
// 5. MULTI-ZONE LAYOUTS VIEW (COM EDITOR DE ZONAS E PREVIEW PROPORCIONAL)
// ============================================================================
let allLayoutsCache = [];

function buildWireframeHtml(zones, aspectRatio = '16:9') {
  const heightStyle = aspectRatio === '9:16' ? 'height:230px;width:135px;margin:0 auto;' : 'height:170px;width:100%;';
  return `
    <div class="layout-preview-canvas" style="${heightStyle}">
      ${(zones || []).map((z) => {
        const t = parsePct(z.bounds?.top);
        const l = parsePct(z.bounds?.left);
        const w = parsePct(z.bounds?.width);
        const h = parsePct(z.bounds?.height);
        return `
          <div class="layout-preview-zone" style="top:${t}%;left:${l}%;width:${w}%;height:${h}%;">
            <strong>${escHtml(z.name)}</strong>
            <span style="font-size:0.65rem;opacity:0.8;">${escHtml(z.type)} (${w}%x${h}%)</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function renderLayouts() {
  const data = await apiFetch('/layouts');
  allLayoutsCache = data.layouts;

  viewContainer.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">Arquitetura de Layouts Multi-Zonas</span>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
            Edite as zonas (posição, largura, altura, tipo de widget e sub-widgets) de qualquer layout mantendo as pré-configurações seguras.
          </p>
        </div>
        <button class="btn btn-primary" id="btnCreateLayout">+ Criar Novo Layout</button>
      </div>

      <div class="grid-2">
        ${allLayoutsCache.map((l) => {
          const isPreset = Boolean(DEFAULT_LAYOUT_PRESETS[l.id]);
          return `
            <div class="card" style="background:var(--bg-input);margin-bottom:0;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div class="card-header" style="margin-bottom:0.6rem;">
                  <div>
                    <span class="card-title">${escHtml(l.name)}</span>
                    ${isPreset ? `<span class="badge badge-info" style="margin-left:0.4rem;">Pré-configurado</span>` : `<span class="badge badge-success" style="margin-left:0.4rem;">Customizado</span>`}
                  </div>
                  <span class="badge badge-info">${escHtml(l.aspect_ratio)}</span>
                </div>
                <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.85rem;">${escHtml(l.description || '')}</p>
                ${buildWireframeHtml(l.config?.zones || [], l.aspect_ratio)}
              </div>

              <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end;flex-wrap:wrap;">
                ${isPreset
                  ? `<button class="btn btn-sm btn-outline" onclick="restorePresetLayout('${l.id}')">↺ Restaurar Pré-configuração</button>`
                  : `<button class="btn btn-sm btn-danger" onclick="deleteCustomLayout('${l.id}', '${escHtml(l.name)}')">🗑️ Excluir</button>`
                }
                <button class="btn btn-sm btn-primary" onclick="openLayoutEditor('${l.id}')">✏️ Editar Zonas (${(l.config?.zones || []).length})</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('btnCreateLayout').addEventListener('click', () => {
    openLayoutEditorModal(null);
  });
}

window.openLayoutEditor = (id) => {
  const layout = allLayoutsCache.find((l) => l.id === id);
  if (layout) openLayoutEditorModal(layout);
};

window.restorePresetLayout = async (id) => {
  const layout = allLayoutsCache.find((l) => l.id === id);
  const preset = DEFAULT_LAYOUT_PRESETS[id];
  if (!layout || !preset) return;
  try {
    await apiFetch(`/layouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: layout.name,
        aspect_ratio: layout.aspect_ratio,
        description: layout.description,
        config: preset
      })
    });
    showToast(`Layout "${layout.name}" restaurado para a pré-configuração original!`);
    renderLayouts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteCustomLayout = async (id, name) => {
  try {
    await apiFetch(`/layouts/${id}`, { method: 'DELETE' });
    showToast(`Layout "${name}" removido.`);
    renderLayouts();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function openLayoutEditorModal(layout) {
  const isEdit = Boolean(layout);
  const workingLayout = layout
    ? JSON.parse(JSON.stringify(layout))
    : {
        name: 'Novo Layout Corporativo',
        aspect_ratio: '16:9',
        description: 'Layout personalizado multi-zonas',
        config: {
          name: 'Novo Layout Corporativo',
          aspect_ratio: '16:9',
          zones: [
            { id: 'zone_media', name: 'Mídia Principal', type: 'PLAYLIST', bounds: { top: '0%', left: '0%', width: '70%', height: '90%' } },
            {
              id: 'zone_sidebar',
              name: 'Barra Lateral',
              type: 'COMPOSITE',
              bounds: { top: '0%', left: '70%', width: '30%', height: '90%' },
              sub_widgets: [{ type: 'CLOCK', height: '25%' }, { type: 'WEATHER', height: '25%' }, { type: 'ANNOUNCEMENTS', height: '50%' }]
            },
            { id: 'zone_ticker', name: 'Rodapé RSS', type: 'RSS_TICKER', bounds: { top: '90%', left: '0%', width: '100%', height: '10%' } }
          ]
        }
      };

  const zoneTypes = [
    { value: 'PLAYLIST', label: '🎬 Carrossel de Mídia (Imagens & Vídeos)' },
    { value: 'COMPOSITE', label: '📊 Barra Composta (Relógio, Clima, Comunicados, Senhas)' },
    { value: 'RSS_TICKER', label: '📰 Rodapé / Faixa de Notícias RSS Deslizante' },
    { value: 'ANNOUNCEMENTS', label: '📢 Quadro Exclusivo de Comunicados (Imagem Fixa / Texto)' },
    { value: 'QUEUE_CALL', label: '🎫 Painel Chamador de Senhas & Guichês' },
    { value: 'CLOCK', label: '🕒 Relógio Digital & Data' },
    { value: 'WEATHER', label: '⛅ Previsão do Tempo' }
  ];

  const availableSubWidgets = [
    { type: 'CLOCK', label: '🕒 Relógio' },
    { type: 'WEATHER', label: '⛅ Clima' },
    { type: 'ANNOUNCEMENTS', label: '📢 Comunicados' },
    { type: 'QUEUE_CALL', label: '🎫 Chamada de Senhas' }
  ];

  openModal({
    title: isEdit ? `✏️ Editar Zonas do Layout: ${workingLayout.name}` : '📐 Novo Layout Multi-Zonas',
    bodyHtml: `
      <div class="grid-3">
        <div class="form-group">
          <label>Nome do Layout</label>
          <input type="text" id="leName" class="form-control" value="${escHtml(workingLayout.name)}" />
        </div>
        <div class="form-group">
          <label>Proporção (Aspect Ratio)</label>
          <select id="leRatio" class="form-control">
            <option value="16:9" ${workingLayout.aspect_ratio === '16:9' ? 'selected' : ''}>16:9 (Horizontal TV)</option>
            <option value="9:16" ${workingLayout.aspect_ratio === '9:16' ? 'selected' : ''}>9:16 (Vertical Totem)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <input type="text" id="leDesc" class="form-control" value="${escHtml(workingLayout.description || '')}" />
        </div>
      </div>

      <div style="margin-bottom:1rem;">
        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:0.35rem;">Pré-visualização em Tempo Real das Zonas (% da Tela):</label>
        <div id="leWireframePreview"></div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;">
        <strong style="font-size:0.9rem;">Zonas Configuradas (${workingLayout.config.zones.length})</strong>
        <button type="button" class="btn btn-sm btn-outline" id="leAddZoneBtn">+ Adicionar Nova Zona</button>
      </div>

      <div id="leZonesList" style="display:flex;flex-direction:column;gap:0.75rem;"></div>
    `,
    footerHtml: `
      <button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>
      <button type="button" class="btn btn-primary" id="leSaveBtn">💾 Salvar Layout & Atualizar Telas</button>
    `,
    onMount: (body, footer) => {
      const zonesListEl = body.querySelector('#leZonesList');
      const previewEl = body.querySelector('#leWireframePreview');
      const ratioEl = body.querySelector('#leRatio');

      function refreshZonesEditor() {
        previewEl.innerHTML = buildWireframeHtml(workingLayout.config.zones, ratioEl.value);
        zonesListEl.innerHTML = workingLayout.config.zones.map((z, idx) => {
          const topVal = parsePct(z.bounds?.top);
          const leftVal = parsePct(z.bounds?.left);
          const widthVal = parsePct(z.bounds?.width);
          const heightVal = parsePct(z.bounds?.height);
          const currentSubs = (z.sub_widgets || []).map((sw) => (typeof sw === 'string' ? sw : sw.type));

          return `
          <div style="background:rgba(15,23,42,0.75);border:1px solid var(--border);border-radius:8px;padding:0.85rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;gap:0.5rem;">
              <input type="text" class="form-control z-name" data-idx="${idx}" value="${escHtml(z.name)}" style="max-width:240px;font-weight:600;" placeholder="Nome da Zona" />
              <select class="form-control z-type" data-idx="${idx}" style="flex:1;">
                ${zoneTypes.map((zt) => `<option value="${zt.value}" ${z.type === zt.value ? 'selected' : ''}>${zt.label}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-sm btn-danger z-del" data-idx="${idx}" ${workingLayout.config.zones.length <= 1 ? 'disabled' : ''}>🗑️</button>
            </div>
            <div class="grid-4" style="margin-bottom:${z.type === 'COMPOSITE' ? '0.6rem' : '0'};">
              <div>
                <label style="font-size:0.72rem;color:var(--text-muted)">Topo (%)</label>
                <input type="number" class="form-control z-bound" data-idx="${idx}" data-prop="top" value="${topVal}" min="0" max="100" />
              </div>
              <div>
                <label style="font-size:0.72rem;color:var(--text-muted)">Esquerda (%)</label>
                <input type="number" class="form-control z-bound" data-idx="${idx}" data-prop="left" value="${leftVal}" min="0" max="100" />
              </div>
              <div>
                <label style="font-size:0.72rem;color:var(--text-muted)">Largura (%)</label>
                <input type="number" class="form-control z-bound" data-idx="${idx}" data-prop="width" value="${widthVal}" min="5" max="100" />
              </div>
              <div>
                <label style="font-size:0.72rem;color:var(--text-muted)">Altura (%)</label>
                <input type="number" class="form-control z-bound" data-idx="${idx}" data-prop="height" value="${heightVal}" min="5" max="100" />
              </div>
            </div>
            ${z.type === 'COMPOSITE' ? `
              <div style="padding-top:0.5rem;border-top:1px dashed var(--border);display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
                <span style="font-size:0.75rem;color:var(--text-muted);">Widgets Internos da Barra:</span>
                ${availableSubWidgets.map((sw) => `
                  <label style="font-size:0.8rem;display:flex;align-items:center;gap:0.3rem;cursor:pointer;">
                    <input type="checkbox" class="z-subwidget" data-idx="${idx}" value="${sw.type}" ${currentSubs.includes(sw.type) ? 'checked' : ''} />
                    ${sw.label}
                  </label>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `}).join('');

        zonesListEl.querySelectorAll('.z-name').forEach((inp) => {
          inp.addEventListener('input', () => {
            const i = parseInt(inp.getAttribute('data-idx'), 10);
            workingLayout.config.zones[i].name = inp.value;
            previewEl.innerHTML = buildWireframeHtml(workingLayout.config.zones, ratioEl.value);
          });
        });

        zonesListEl.querySelectorAll('.z-type').forEach((sel) => {
          sel.addEventListener('change', () => {
            const i = parseInt(sel.getAttribute('data-idx'), 10);
            workingLayout.config.zones[i].type = sel.value;
            if (sel.value === 'COMPOSITE' && !workingLayout.config.zones[i].sub_widgets) {
              workingLayout.config.zones[i].sub_widgets = [
                { type: 'CLOCK', height: '25%' },
                { type: 'WEATHER', height: '25%' },
                { type: 'ANNOUNCEMENTS', height: '50%' }
              ];
            }
            refreshZonesEditor();
          });
        });

        zonesListEl.querySelectorAll('.z-bound').forEach((inp) => {
          inp.addEventListener('input', () => {
            const i = parseInt(inp.getAttribute('data-idx'), 10);
            const prop = inp.getAttribute('data-prop');
            const num = Math.max(0, Math.min(100, parseInt(inp.value, 10) || 0));
            workingLayout.config.zones[i].bounds[prop] = `${num}%`;
            previewEl.innerHTML = buildWireframeHtml(workingLayout.config.zones, ratioEl.value);
          });
        });

        zonesListEl.querySelectorAll('.z-subwidget').forEach((cb) => {
          cb.addEventListener('change', () => {
            const i = parseInt(cb.getAttribute('data-idx'), 10);
            const checkedBoxes = Array.from(zonesListEl.querySelectorAll(`.z-subwidget[data-idx="${i}"]:checked`));
            const share = Math.max(20, Math.floor(100 / Math.max(1, checkedBoxes.length)));
            workingLayout.config.zones[i].sub_widgets = checkedBoxes.map((box) => ({
              type: box.value,
              height: `${share}%`
            }));
          });
        });

        zonesListEl.querySelectorAll('.z-del').forEach((btn) => {
          btn.addEventListener('click', () => {
            const i = parseInt(btn.getAttribute('data-idx'), 10);
            workingLayout.config.zones.splice(i, 1);
            refreshZonesEditor();
          });
        });
      }

      ratioEl.addEventListener('change', refreshZonesEditor);

      body.querySelector('#leAddZoneBtn').addEventListener('click', () => {
        workingLayout.config.zones.push({
          id: `zone_${Date.now()}`,
          name: `Nova Zona ${workingLayout.config.zones.length + 1}`,
          type: 'ANNOUNCEMENTS',
          bounds: { top: '10%', left: '10%', width: '40%', height: '40%' }
        });
        refreshZonesEditor();
      });

      refreshZonesEditor();

      footer.querySelector('#leSaveBtn').addEventListener('click', async () => {
        const name = body.querySelector('#leName').value.trim();
        workingLayout.config.name = name;
        workingLayout.config.aspect_ratio = ratioEl.value;
        const payload = {
          name,
          aspect_ratio: ratioEl.value,
          description: body.querySelector('#leDesc').value.trim(),
          config: workingLayout.config
        };
        if (!payload.name) {
          showToast('Informe o nome do layout.', 'error');
          return;
        }
        try {
          if (isEdit) {
            await apiFetch(`/layouts/${workingLayout.id}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            showToast('Zonas do layout salvas e TVs atualizadas!');
          } else {
            await apiFetch('/layouts', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            showToast('Novo layout criado com sucesso!');
          }
          closeModal();
          renderLayouts();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
}

// ============================================================================
// 6. COMUNICADOS & MARCA (COMPANY HEADER + ANNOUNCEMENTS + CTRL+V PASTE + FONTS)
// ============================================================================
const WEB_FONT_OPTIONS = [
  { value: "'Roboto', sans-serif", label: 'Roboto (Moderna & Limpa — Recomendada)' },
  { value: "'Titillium Web', sans-serif", label: 'Titillium Web (Tecnológica & Elegante — Recomendada)' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat (Geométrica & Destaque)' },
  { value: "'Poppins', sans-serif", label: 'Poppins (Corporativa & Suave)' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans (Alta Legibilidade)' },
  { value: "'Segoe UI', system-ui, sans-serif", label: 'Segoe UI (Padrão Windows)' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial / Helvetica (Clássica Web)' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana (Larga para Leitura à Distância)' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS (Humanista)' },
  { value: 'Georgia, serif', label: 'Georgia (Serifada Editorial)' }
];

async function renderAnnouncements() {
  const [settingsRes, mediaRes] = await Promise.all([
    apiFetch('/settings'),
    apiFetch('/media')
  ]);
  const s = settingsRes.settings;
  const imageMedia = (mediaRes.media || []).filter((m) => isImageMedia(m.media_type));

  const currentLogoUrl = s.company_logo || '/media/luds_logo100.png';
  const currentAnnImgUrl = s.announcement_image || '';
  const currentAnnFont = s.announcement_font_family || "'Roboto', sans-serif";
  const currentAnnSize = Math.max(14, Math.min(34, parseInt(s.announcement_font_size || '20', 10) || 20));
  const currentRssFont = s.rss_font_family || "'Titillium Web', sans-serif";
  const currentRssSize = Math.max(16, Math.min(34, parseInt(s.rss_font_size || '22', 10) || 22));

  viewContainer.innerHTML = `
    <div class="grid-2">
      <!-- CARD 1: MARCA E CABEÇALHO DA EMPRESA (TODAS AS TELAS E TOTEM) -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">🏢 Cabeçalho & Marca da Empresa (TVs e Totem)</span>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
              Exibe o símbolo (logo) e o nome da empresa no topo das telas (TV-01, Consultório e Totem Vertical).
            </p>
          </div>
        </div>

        <form id="brandForm">
          <div class="form-group">
            <label>Exibir Barra de Marca no Topo das Telas?</label>
            <select id="brShowHeader" class="form-control">
              <option value="true" ${s.show_company_header !== 'false' ? 'selected' : ''}>✅ Sim, exibir Nome e Símbolo da Empresa</option>
              <option value="false" ${s.show_company_header === 'false' ? 'selected' : ''}>🚫 Não, ocultar barra superior</option>
            </select>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Nome da Empresa / Título Principal</label>
              <input type="text" id="brTitle" class="form-control" value="${escHtml(s.site_title || 'TV Corporativa')}" required />
            </div>
            <div class="form-group">
              <label>Subtítulo / Slogan Institucional</label>
              <input type="text" id="brSubtitle" class="form-control" value="${escHtml(s.company_subtitle || '')}" placeholder="Ex: Comunicação Interna & Atendimento" />
            </div>
          </div>

          <div class="form-group">
            <label>Símbolo / Logo da Empresa (Imagem)</label>
            <div style="display:flex;gap:0.75rem;align-items:center;">
              <img id="brLogoPreview" src="${escHtml(currentLogoUrl)}" style="width:56px;height:56px;object-fit:contain;background:#fff;padding:4px;border-radius:10px;border:1px solid var(--border);" />
              <select id="brLogoSelect" class="form-control" style="flex:1;">
                <option value="/media/luds_logo100.png" ${currentLogoUrl === '/media/luds_logo100.png' ? 'selected' : ''}>Símbolo Padrão (luds_logo100.png)</option>
                ${imageMedia.map((m) => {
                  const url = `/media/${m.filename}`;
                  return `<option value="${escHtml(url)}" ${currentLogoUrl === url || currentLogoUrl === m.filename ? 'selected' : ''}>${escHtml(m.original_name)} (${escHtml(m.filename)})</option>`;
                }).join('')}
              </select>
            </div>
          </div>

          <div id="logoPasteDropzone" class="paste-dropzone" tabindex="0" style="margin-bottom:1rem;padding:0.9rem;">
            <strong>📋 Colar Novo Símbolo da Área de Transferência (Ctrl+V)</strong>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
              Ou <label for="logoFileUpload" style="color:var(--accent);text-decoration:underline;cursor:pointer;">clique aqui para escolher uma imagem</label> do computador
            </div>
            <input type="file" id="logoFileUpload" accept="image/*" style="display:none;" />
          </div>

          <button type="submit" class="btn btn-primary" style="width:100%;">💾 Salvar Marca & Atualizar Telas</button>
        </form>
      </div>

      <!-- CARD 2: EDITOR DO ESPAÇO DE COMUNICADOS (TV-01 E SIDEBAR) -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">📢 Editor do Espaço de Comunicados (TV-01 e Totem)</span>
            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
              Personalize o quadro de Comunicados com texto, fonte, tamanho seguro e imagem fixa (cole da Área de Trabalho com Ctrl+V!).
            </p>
          </div>
        </div>

        <form id="announcementForm">
          <div class="grid-2">
            <div class="form-group">
              <label>Título do Quadro</label>
              <input type="text" id="annTitle" class="form-control" value="${escHtml(s.announcement_title || '📢 COMUNICADOS & AVISOS')}" required />
            </div>
            <div class="form-group">
              <label>Modo de Exibição</label>
              <select id="annMode" class="form-control">
                <option value="both" ${(s.announcement_mode || 'both') === 'both' ? 'selected' : ''}>🖼️ + 📝 Imagem Fixa + Texto</option>
                <option value="image" ${s.announcement_mode === 'image' ? 'selected' : ''}>🖼️ Somente Imagem Fixa (Destaque Total)</option>
                <option value="text" ${s.announcement_mode === 'text' ? 'selected' : ''}>📝 Somente Texto</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Mensagem / Texto do Comunicado</label>
            <textarea id="annText" class="form-control" rows="3" placeholder="Digite o aviso importante para os colaboradores e visitantes...">${escHtml(s.announcement_text || '')}</textarea>
          </div>

          <!-- FONTE E TAMANHO DO TEXTO DO COMUNICADO -->
          <div class="grid-2" style="background:rgba(15,23,42,0.55);padding:12px;border-radius:10px;border:1px solid var(--border);margin-bottom:14px;">
            <div class="form-group" style="margin-bottom:0;">
              <label>🔤 Fonte do Texto (Comunicado)</label>
              <select id="annFontFamily" class="form-control">
                ${WEB_FONT_OPTIONS.map((f) => `<option value="${escHtml(f.value)}" ${currentAnnFont === f.value ? 'selected' : ''}>${escHtml(f.label)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>📏 Tamanho da Fonte (<span id="annFontSizeVal">${currentAnnSize}px</span> — máx. seguro 34px)</label>
              <input type="range" id="annFontSize" class="form-control" min="14" max="34" step="1" value="${currentAnnSize}" style="padding:6px 0;cursor:pointer;" />
            </div>
          </div>

          <div style="background:#0b1329;border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:14px;max-height:110px;overflow-y:auto;">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">Prévia do Texto do Comunicado:</div>
            <div id="annLiveTextPreview" style="font-family:${escHtml(currentAnnFont)};font-size:${currentAnnSize}px;line-height:1.35;color:#e5e7eb;word-break:break-word;">${escHtml(s.announcement_text || 'Prévia do texto do comunicado com a fonte escolhida.')}</div>
          </div>

          <div class="form-group">
            <label>Imagem Fixa do Comunicado</label>
            <div style="display:flex;gap:0.5rem;">
              <select id="annImageSelect" class="form-control" style="flex:1;">
                <option value="">-- Sem imagem fixa --</option>
                ${imageMedia.map((m) => {
                  const url = `/media/${m.filename}`;
                  return `<option value="${escHtml(url)}" ${currentAnnImgUrl === url || currentAnnImgUrl === m.filename ? 'selected' : ''}>🖼️ ${escHtml(m.original_name)} (${escHtml(m.filename)})</option>`;
                }).join('')}
              </select>
              <button type="button" class="btn btn-outline btn-sm" id="annClearImgBtn">Limpar</button>
            </div>
          </div>

          <div id="annPasteDropzone" class="paste-dropzone" tabindex="0" style="margin-bottom:1rem;">
            <div style="font-size:1.5rem;">📋 🖼️</div>
            <strong>Clique aqui e pressione <kbd style="background:#0f172a;padding:2px 6px;border-radius:4px;border:1px solid #334155;">Ctrl + V</kbd> para colar uma imagem copiada da Área de Trabalho!</strong>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.25rem;">
              Ou <label for="annFileUpload" style="color:var(--accent);text-decoration:underline;cursor:pointer;">selecione um arquivo de imagem</label>
            </div>
            <input type="file" id="annFileUpload" accept="image/*" style="display:none;" />
            <img id="annLiveImgPreview" class="paste-preview-img ${currentAnnImgUrl ? '' : 'hidden'}" src="${escHtml(currentAnnImgUrl)}" />
          </div>

          <button type="submit" class="btn btn-primary" style="width:100%;">💾 Publicar Comunicado no Player TV-01</button>
        </form>
      </div>
    </div>

    <!-- CARD 3: ESTILO DE FONTE E TAMANHO DAS NOTÍCIAS RSS (RODAPÉ) -->
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">📰 Tipografia & Tamanho das Notícias (Rodapé RSS)</span>
          <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">
            Altere a fonte (incluindo Roboto e Titillium Web) e o tamanho da letra das notícias que deslizam na barra inferior das TVs sem estourar a faixa.
          </p>
        </div>
      </div>
      <form id="rssTypographyQuickForm">
        <div class="grid-3" style="align-items:flex-end;">
          <div class="form-group" style="margin-bottom:0;">
            <label>🔤 Fonte das Notícias RSS</label>
            <select id="quickRssFontFamily" class="form-control">
              ${WEB_FONT_OPTIONS.map((f) => `<option value="${escHtml(f.value)}" ${currentRssFont === f.value ? 'selected' : ''}>${escHtml(f.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>📏 Tamanho da Fonte (<span id="quickRssFontSizeVal">${currentRssSize}px</span> — máx. seguro 34px)</label>
            <input type="range" id="quickRssFontSize" class="form-control" min="16" max="34" step="1" value="${currentRssSize}" style="padding:6px 0;cursor:pointer;" />
          </div>
          <button type="submit" class="btn btn-primary">💾 Aplicar Fonte nas Notícias</button>
        </div>
        <div style="background:#0b1329;border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-top:12px;overflow:hidden;white-space:nowrap;">
          <span style="background:#ef4444;color:#fff;font-weight:800;font-size:0.75rem;padding:3px 10px;border-radius:4px;margin-right:10px;">NOTÍCIAS</span>
          <span id="quickRssLivePreview" style="font-family:${escHtml(currentRssFont)};font-size:${currentRssSize}px;color:#f3f4f6;">Últimas notícias em tempo real na TV Corporativa com leitura confortável ●</span>
        </div>
      </form>
    </div>
  `;

  // Handlers de Marca / Logo
  const brLogoSelect = document.getElementById('brLogoSelect');
  const brLogoPreview = document.getElementById('brLogoPreview');
  brLogoSelect.addEventListener('change', () => {
    if (brLogoSelect.value) {
      brLogoPreview.src = brLogoSelect.value;
    }
  });

  const handleLogoFile = async (fileOrBlob) => {
    showToast('Enviando novo símbolo da empresa...', 'info');
    try {
      const uploaded = await uploadImageFileOrBlob(fileOrBlob, 'logo_empresa.png', 10);
      const url = `/media/${uploaded.filename}`;
      const opt = document.createElement('option');
      opt.value = url;
      opt.textContent = `${uploaded.original_name} (${uploaded.filename})`;
      opt.selected = true;
      brLogoSelect.appendChild(opt);
      brLogoPreview.src = url;
      showToast('Logo enviado! Clique em Salvar Marca para aplicar.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('logoPasteDropzone').addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        handleLogoFile(item.getAsFile());
        return;
      }
    }
  });

  document.getElementById('logoFileUpload').addEventListener('change', (e) => {
    if (e.target.files[0]) handleLogoFile(e.target.files[0]);
  });

  document.getElementById('brandForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          show_company_header: document.getElementById('brShowHeader').value,
          site_title: document.getElementById('brTitle').value.trim(),
          company_subtitle: document.getElementById('brSubtitle').value.trim(),
          company_logo: brLogoSelect.value
        })
      });
      showToast('Cabeçalho e Marca da Empresa atualizados em todas as TVs e Totens!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Handlers de Comunicados (TV-01)
  const annImageSelect = document.getElementById('annImageSelect');
  const annLiveImgPreview = document.getElementById('annLiveImgPreview');

  annImageSelect.addEventListener('change', () => {
    if (annImageSelect.value) {
      annLiveImgPreview.src = annImageSelect.value;
      annLiveImgPreview.classList.remove('hidden');
    } else {
      annLiveImgPreview.classList.add('hidden');
    }
  });

  document.getElementById('annClearImgBtn').addEventListener('click', () => {
    annImageSelect.value = '';
    annLiveImgPreview.src = '';
    annLiveImgPreview.classList.add('hidden');
  });

  const handleAnnImageUpload = async (fileOrBlob) => {
    showToast('Enviando imagem colada para o Comunicado...', 'info');
    try {
      const uploaded = await uploadImageFileOrBlob(fileOrBlob, 'comunicado.png', 15);
      const url = `/media/${uploaded.filename}`;
      const opt = document.createElement('option');
      opt.value = url;
      opt.textContent = `🖼️ ${uploaded.original_name} (${uploaded.filename})`;
      opt.selected = true;
      annImageSelect.appendChild(opt);
      annLiveImgPreview.src = url;
      annLiveImgPreview.classList.remove('hidden');
      showToast('Imagem pronta! Clique em "Publicar Comunicado" para atualizar a TV-01.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('annPasteDropzone').addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        handleAnnImageUpload(item.getAsFile());
        return;
      }
    }
  });

  document.getElementById('annFileUpload').addEventListener('change', (e) => {
    if (e.target.files[0]) handleAnnImageUpload(e.target.files[0]);
  });

  // Live Typography Preview for Announcements
  const annFontFamilyEl = document.getElementById('annFontFamily');
  const annFontSizeEl = document.getElementById('annFontSize');
  const annFontSizeValEl = document.getElementById('annFontSizeVal');
  const annTextEl = document.getElementById('annText');
  const annLiveTextPreviewEl = document.getElementById('annLiveTextPreview');

  const updateAnnTypographyPreview = () => {
    const f = annFontFamilyEl.value;
    const sz = Math.max(14, Math.min(34, parseInt(annFontSizeEl.value, 10) || 20));
    annFontSizeValEl.textContent = `${sz}px`;
    annLiveTextPreviewEl.style.fontFamily = f;
    annLiveTextPreviewEl.style.fontSize = `${sz}px`;
    annLiveTextPreviewEl.textContent = annTextEl.value.trim() || 'Prévia do texto do comunicado com a fonte escolhida.';
  };

  annFontFamilyEl.addEventListener('change', updateAnnTypographyPreview);
  annFontSizeEl.addEventListener('input', updateAnnTypographyPreview);
  annTextEl.addEventListener('input', updateAnnTypographyPreview);

  document.getElementById('announcementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          announcement_title: document.getElementById('annTitle').value.trim(),
          announcement_mode: document.getElementById('annMode').value,
          announcement_text: document.getElementById('annText').value.trim(),
          announcement_image: annImageSelect.value,
          announcement_font_family: annFontFamilyEl.value,
          announcement_font_size: String(Math.max(14, Math.min(34, parseInt(annFontSizeEl.value, 10) || 20)))
        })
      });
      showToast('Comunicado (com fonte e tamanho) publicado instantaneamente na TV!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Live Typography Preview & Save for RSS News Ticker
  const quickRssFontFamilyEl = document.getElementById('quickRssFontFamily');
  const quickRssFontSizeEl = document.getElementById('quickRssFontSize');
  const quickRssFontSizeValEl = document.getElementById('quickRssFontSizeVal');
  const quickRssLivePreviewEl = document.getElementById('quickRssLivePreview');

  const updateQuickRssPreview = () => {
    const f = quickRssFontFamilyEl.value;
    const sz = Math.max(16, Math.min(34, parseInt(quickRssFontSizeEl.value, 10) || 22));
    quickRssFontSizeValEl.textContent = `${sz}px`;
    quickRssLivePreviewEl.style.fontFamily = f;
    quickRssLivePreviewEl.style.fontSize = `${sz}px`;
  };

  quickRssFontFamilyEl.addEventListener('change', updateQuickRssPreview);
  quickRssFontSizeEl.addEventListener('input', updateQuickRssPreview);

  document.getElementById('rssTypographyQuickForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({
          rss_font_family: quickRssFontFamilyEl.value,
          rss_font_size: String(Math.max(16, Math.min(34, parseInt(quickRssFontSizeEl.value, 10) || 22)))
        })
      });
      showToast('Fonte e tamanho das notícias RSS atualizados nas TVs!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ============================================================================
// 7. QUEUE CALLER VIEW (GERAR SENHAS, ATENDIMENTOS, GUICHÊS E CHAMADA)
// ============================================================================
async function renderQueue() {
  const data = await apiFetch('/queue/recent');
  const calls = data.calls || [];
  const waiting = data.waiting || [];
  const desks = data.desks || [];
  const services = data.services || [];

  viewContainer.innerHTML = `
    <!-- LINHA 1: GERADOR DE SENHAS + CHAMADA DIRETA -->
    <div class="grid-2">
      <!-- CARD A: GERAR NOVA SENHA NA FILA DE ESPERA -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">🎟️ 1. Gerar Nova Senha (Recepção / Triagem)</span>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
              Escolha qual será o atendimento e onde será atendido para gerar novas senhas.
            </p>
          </div>
        </div>
        <form id="generateTicketForm">
          <div class="form-group">
            <label>Qual o Atendimento?</label>
            <select id="genServiceId" class="form-control">
              ${services.map((s) => `<option value="${s.id}">${escHtml(s.prefix)} — ${escHtml(s.name)} (${s.is_priority ? '⭐ Prioritário' : 'Normal'})</option>`).join('')}
            </select>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label>Onde será atendido? (Guichê / Consultório)</label>
              <select id="genPreferredLocation" class="form-control">
                ${desks.map((d) => `<option value="${escHtml(d.name)}">📍 ${escHtml(d.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Paciente / Visitante (Opcional)</label>
              <input type="text" id="genPatientName" class="form-control" placeholder="Ex: Maria Oliveira" />
            </div>
          </div>
          <div style="display:flex;gap:0.6rem;">
            <button type="submit" class="btn btn-outline" style="flex:1;">➕ Gerar Senha na Fila</button>
            <button type="button" class="btn btn-primary" id="genAndCallNowBtn" style="flex:1;">📢 Gerar & Já Chamar na TV</button>
          </div>
        </form>

        <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.65rem;">
            <strong style="font-size:0.9rem;">⏳ Fila de Espera (${waiting.length} aguardando)</strong>
            <div style="display:flex;gap:0.4rem;align-items:center;">
              <select id="callNextDeskSelect" class="form-control" style="padding:0.3rem 0.5rem;font-size:0.8rem;width:auto;">
                ${desks.map((d) => `<option value="${escHtml(d.name)}">📍 ${escHtml(d.name)}</option>`).join('')}
              </select>
              <button class="btn btn-sm btn-success" id="btnCallNextQueue" ${waiting.length === 0 ? 'disabled' : ''}>📢 Chamar Próxima</button>
            </div>
          </div>

          <div class="table-wrapper" style="max-height:210px;overflow-y:auto;">
            <table>
              <thead>
                <tr>
                  <th>Senha</th>
                  <th>Qual Atendimento</th>
                  <th>Prioridade</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                ${waiting.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Nenhuma senha aguardando na fila.</td></tr>` : waiting.map((w) => `
                  <tr>
                    <td><strong style="color:var(--accent);font-size:1rem;">${escHtml(w.ticket_number)}</strong>${w.patient_name ? `<br><small>${escHtml(w.patient_name)}</small>` : ''}</td>
                    <td>${escHtml(w.service_name || 'Geral')}</td>
                    <td><span class="badge ${w.service_type === 'Prioritário' ? 'badge-warning' : 'badge-info'}">${escHtml(w.service_type)}</span></td>
                    <td>
                      <button class="btn btn-sm btn-primary" onclick="callWaitingTicket('${w.id}')">📢 Chamar</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- CARD B: CHAMADA DIRETA / PERSONALIZADA COM QUAL ATENDIMENTO E ONDE SERÁ ATENDIDO -->
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">📢 2. Chamar Senha Diretamente na TV</span>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
              Informe a senha, qual o atendimento e onde será atendido (Guichê ou Consultório).
            </p>
          </div>
        </div>

        <form id="directCallForm">
          <div class="grid-2">
            <div class="form-group">
              <label>Código da Senha</label>
              <input type="text" id="dcTicket" class="form-control" placeholder="Ex: A-105 ou P-045" required />
            </div>
            <div class="form-group">
              <label>Tipo / Prioridade</label>
              <select id="dcPriority" class="form-control">
                <option value="Normal">Normal</option>
                <option value="Prioritário">⭐ Prioritário (Preferencial)</option>
              </select>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Qual o Atendimento?</label>
              <select id="dcServiceName" class="form-control">
                ${services.map((s) => `<option value="${escHtml(s.name)}">${escHtml(s.name)}</option>`).join('')}
                <option value="Atendimento Geral">Outro / Atendimento Geral</option>
              </select>
            </div>
            <div class="form-group">
              <label>Onde será atendido? (Guichê / Consultório)</label>
              <select id="dcLocation" class="form-control">
                ${desks.map((d) => `<option value="${escHtml(d.name)}">${escHtml(d.name)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>Nome do Paciente / Cliente (Opcional)</label>
            <input type="text" id="dcPatient" class="form-control" placeholder="Ex: João da Silva" />
          </div>

          <button type="submit" class="btn btn-primary" style="width:100%;padding:0.8rem;">
            🔔 Disparar Chamada Sonora na TV Agora
          </button>
        </form>

        <!-- GESTÃO DE GUICHÊS E ATENDIMENTOS -->
        <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
          <div>
            <strong style="font-size:0.85rem;">⚙️ Configurar Locais & Atendimentos</strong>
            <div style="font-size:0.75rem;color:var(--text-muted);">${desks.length} Guichês/Consultórios • ${services.length} Tipos de Atendimento</div>
          </div>
          <div style="display:flex;gap:0.4rem;">
            <button type="button" class="btn btn-sm btn-outline" id="btnManageDesks">🏢 Guichês / Salas</button>
            <button type="button" class="btn btn-sm btn-outline" id="btnManageServices">🩺 Tipos de Atendimento</button>
          </div>
        </div>
      </div>
    </div>

    <!-- LINHA 2: HISTÓRICO DE SENHAS CHAMADAS COM BOTÃO DE RECHAMAR -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">🔊 Últimas Senhas Chamadas nas Telas</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Senha</th>
              <th>Qual o Atendimento</th>
              <th>Onde Será Atendido (Local)</th>
              <th>Paciente</th>
              <th>Prioridade</th>
              <th>Horário</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${calls.map((c) => `
              <tr>
                <td><strong style="font-size:1.1rem;color:var(--accent)">${escHtml(c.ticket_number)}</strong></td>
                <td>${escHtml(c.service_name || 'Atendimento Geral')}</td>
                <td><strong>📍 ${escHtml(c.location)}</strong></td>
                <td>${escHtml(c.patient_name || '-')}</td>
                <td>
                  <span class="badge ${c.service_type === 'Prioritário' ? 'badge-warning' : 'badge-info'}">
                    ${escHtml(c.service_type)}
                  </span>
                </td>
                <td>${new Date(c.called_at).toLocaleTimeString('pt-BR')}</td>
                <td>
                  <button class="btn btn-sm btn-outline" onclick="recallTicket('${c.id}')">🔊 Rechamar na TV</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Handler: Gerar Senha na Fila
  document.getElementById('generateTicketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const service_id = document.getElementById('genServiceId').value;
    const preferred_location = document.getElementById('genPreferredLocation').value;
    const patient_name = document.getElementById('genPatientName').value.trim();

    try {
      const res = await apiFetch('/queue/generate', {
        method: 'POST',
        body: JSON.stringify({ service_id, preferred_location, patient_name })
      });
      showToast(`Senha ${res.ticket.ticket_number} (${res.ticket.service_name}) gerada na fila!`);
      renderQueue();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Handler: Gerar e já chamar imediatamente
  document.getElementById('genAndCallNowBtn').addEventListener('click', async () => {
    const service_id = document.getElementById('genServiceId').value;
    const location = document.getElementById('genPreferredLocation').value || desks[0]?.name || 'Guichê 01';
    const patient_name = document.getElementById('genPatientName').value.trim();

    try {
      const genRes = await apiFetch('/queue/generate', {
        method: 'POST',
        body: JSON.stringify({ service_id, preferred_location: location, patient_name })
      });
      await apiFetch('/queue/call', {
        method: 'POST',
        body: JSON.stringify({
          ticket_id: genRes.ticket.id,
          location
        })
      });
      showToast(`Senha ${genRes.ticket.ticket_number} gerada e chamada para ${location}!`);
      renderQueue();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Handler: Chamar próxima da fila
  document.getElementById('btnCallNextQueue')?.addEventListener('click', async () => {
    const location = document.getElementById('callNextDeskSelect')?.value || 'Guichê 01';
    try {
      const res = await apiFetch('/queue/call', {
        method: 'POST',
        body: JSON.stringify({ call_next: true, location })
      });
      showToast(`Chamando ${res.call.ticket_number} em ${res.call.location}!`);
      renderQueue();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Handler: Chamada Direta
  document.getElementById('directCallForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticket_number = document.getElementById('dcTicket').value.trim().toUpperCase();
    const service_type = document.getElementById('dcPriority').value;
    const service_name = document.getElementById('dcServiceName').value;
    const location = document.getElementById('dcLocation').value;
    const patient_name = document.getElementById('dcPatient').value.trim();

    try {
      await apiFetch('/queue/call', {
        method: 'POST',
        body: JSON.stringify({ ticket_number, service_type, service_name, location, patient_name })
      });
      showToast(`Senha ${ticket_number} chamada para ${location}!`);
      renderQueue();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Modal: Gerenciar Guichês / Consultórios
  document.getElementById('btnManageDesks').addEventListener('click', () => {
    openManageDesksModal(desks);
  });

  // Modal: Gerenciar Tipos de Atendimento
  document.getElementById('btnManageServices').addEventListener('click', () => {
    openManageServicesModal(services);
  });
}

window.callWaitingTicket = async (ticket_id) => {
  const location = document.getElementById('callNextDeskSelect')?.value || 'Guichê 01';
  try {
    const res = await apiFetch('/queue/call', {
      method: 'POST',
      body: JSON.stringify({ ticket_id, location })
    });
    showToast(`Senha ${res.call.ticket_number} chamada para ${res.call.location}!`);
    renderQueue();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.recallTicket = async (id) => {
  try {
    const res = await apiFetch(`/queue/recall/${id}`, { method: 'POST' });
    showToast(`Senha ${res.call.ticket_number} rechamada nas TVs!`);
    renderQueue();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function openManageDesksModal(desks) {
  openModal({
    title: '🏢 Gerenciar Guichês, Salas e Consultórios (Onde será atendido)',
    bodyHtml: `
      <form id="addDeskModalForm" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
        <input type="text" id="newDeskName" class="form-control" placeholder="Ex: Consultório 04 - Cardiologia ou Guichê 04" required style="flex:1;" />
        <button type="submit" class="btn btn-primary">+ Adicionar Local</button>
      </form>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Local de Atendimento</th><th>Categoria</th><th>Ação</th></tr></thead>
          <tbody>
            ${desks.map((d) => `
              <tr>
                <td><strong>📍 ${escHtml(d.name)}</strong></td>
                <td><span class="badge badge-info">${escHtml(d.category || 'Geral')}</span></td>
                <td><button class="btn btn-sm btn-danger" onclick="deleteDeskItem('${d.id}')">🗑️</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `,
    footerHtml: `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`,
    onMount: (body) => {
      body.querySelector('#addDeskModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = body.querySelector('#newDeskName').value.trim();
        if (!name) return;
        try {
          await apiFetch('/queue/desks', {
            method: 'POST',
            body: JSON.stringify({ name })
          });
          closeModal();
          showToast('Local de atendimento cadastrado!');
          renderQueue();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
}

window.deleteDeskItem = async (id) => {
  try {
    await apiFetch(`/queue/desks/${id}`, { method: 'DELETE' });
    closeModal();
    showToast('Local removido.');
    renderQueue();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function openManageServicesModal(services) {
  openModal({
    title: '🩺 Gerenciar Tipos de Atendimento (Qual o atendimento)',
    bodyHtml: `
      <form id="addServiceModalForm" class="grid-3" style="margin-bottom:1rem;align-items:flex-end;">
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted)">Prefixo da Senha</label>
          <input type="text" id="newSvcPrefix" class="form-control" placeholder="Ex: E, C, P" maxlength="4" required />
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-muted)">Nome do Atendimento</label>
          <input type="text" id="newSvcName" class="form-control" placeholder="Ex: Exames de Imagem" required />
        </div>
        <button type="submit" class="btn btn-primary">+ Adicionar</button>
      </form>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Prefixo</th><th>Atendimento</th><th>Prioridade</th><th>Ação</th></tr></thead>
          <tbody>
            ${services.map((s) => `
              <tr>
                <td><span class="badge badge-info">${escHtml(s.prefix)}</span></td>
                <td><strong>${escHtml(s.name)}</strong></td>
                <td>${s.is_priority ? '⭐ Prioritário' : 'Normal'}</td>
                <td><button class="btn btn-sm btn-danger" onclick="deleteServiceItem('${s.id}')">🗑️</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `,
    footerHtml: `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`,
    onMount: (body) => {
      body.querySelector('#addServiceModalForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const prefix = body.querySelector('#newSvcPrefix').value.trim().toUpperCase();
        const name = body.querySelector('#newSvcName').value.trim();
        if (!prefix || !name) return;
        try {
          await apiFetch('/queue/services', {
            method: 'POST',
            body: JSON.stringify({ prefix, name })
          });
          closeModal();
          showToast('Tipo de atendimento adicionado!');
          renderQueue();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
  });
}

window.deleteServiceItem = async (id) => {
  try {
    await apiFetch(`/queue/services/${id}`, { method: 'DELETE' });
    closeModal();
    showToast('Atendimento removido.');
    renderQueue();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ============================================================================
// 8. GLOBAL SETTINGS VIEW (CLIMA, RSS FEED, FONTE/TAMANHO & VELOCIDADE DO TICKER)
// ============================================================================
async function renderSettings() {
  const data = await apiFetch('/settings');
  const s = data.settings;
  const currentSpeed = parseInt(s.rss_scroll_speed || '40', 10) || 40;
  const currentRssFont = s.rss_font_family || "'Titillium Web', sans-serif";
  const currentRssSize = Math.max(16, Math.min(34, parseInt(s.rss_font_size || '22', 10) || 22));

  viewContainer.innerHTML = `
    <div class="card" style="max-width:780px;">
      <div class="card-header">
        <span class="card-title">Configurações de Clima, Notícias RSS, Tipografia & Áudio</span>
      </div>
      <form id="settingsForm">
        <div class="grid-3">
          <div class="form-group">
            <label>Cidade do Clima</label>
            <input type="text" id="setCity" class="form-control" value="${escHtml(s.weather_city || '')}" />
          </div>
          <div class="form-group">
            <label>Latitude</label>
            <input type="text" id="setLat" class="form-control" value="${escHtml(s.weather_latitude || '')}" />
          </div>
          <div class="form-group">
            <label>Longitude</label>
            <input type="text" id="setLon" class="form-control" value="${escHtml(s.weather_longitude || '')}" />
          </div>
        </div>

        <div class="form-group">
          <label>URL do Feed de Notícias RSS (Exibido na TV-01, Consultório e Totem)</label>
          <input type="url" id="setRss" class="form-control" value="${escHtml(s.rss_feed_url || 'https://g1.globo.com/rss/g1/')}" />
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>🔤 Fonte das Notícias (Rodapé RSS)</label>
            <select id="setRssFontFamily" class="form-control">
              ${WEB_FONT_OPTIONS.map((f) => `<option value="${escHtml(f.value)}" ${currentRssFont === f.value ? 'selected' : ''}>${escHtml(f.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>📏 Tamanho da Fonte das Notícias (<span id="setRssFontSizeVal">${currentRssSize}px</span> — máx. 34px)</label>
            <input type="range" id="setRssFontSize" class="form-control" min="16" max="34" step="1" value="${currentRssSize}" style="padding:6px 0;cursor:pointer;" />
          </div>
        </div>

        <div class="grid-2">
          <div class="form-group">
            <label>Velocidade de Rolagem das Notícias (RSS Ticker)</label>
            <select id="setRssSpeed" class="form-control">
              <option value="25" ${currentSpeed <= 28 ? 'selected' : ''}>🐢 Bem Lenta e Calma (25 px/s)</option>
              <option value="40" ${currentSpeed > 28 && currentSpeed <= 48 ? 'selected' : ''}>👌 Leitura Confortável — Recomendado (40 px/s)</option>
              <option value="60" ${currentSpeed > 48 && currentSpeed <= 70 ? 'selected' : ''}>🚶 Moderada (60 px/s)</option>
              <option value="85" ${currentSpeed > 70 ? 'selected' : ''}>⚡ Rápida (85 px/s)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Voz Sintetizada (TTS) na Chamada de Senha</label>
            <select id="setTts" class="form-control">
              <option value="true" ${s.enable_tts !== 'false' ? 'selected' : ''}>🔊 Ativado (Falar senha e guichê em Português)</option>
              <option value="false" ${s.enable_tts === 'false' ? 'selected' : ''}>🔕 Somente Sinal Sonoro (Ding-Dong)</option>
            </select>
          </div>
        </div>

        <button type="submit" class="btn btn-primary">💾 Salvar Configurações & Recarregar Telas</button>
      </form>
    </div>
  `;

  const setRssFontSizeEl = document.getElementById('setRssFontSize');
  const setRssFontSizeValEl = document.getElementById('setRssFontSizeVal');
  setRssFontSizeEl.addEventListener('input', () => {
    setRssFontSizeValEl.textContent = `${setRssFontSizeEl.value}px`;
  });

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      weather_city: document.getElementById('setCity').value.trim(),
      weather_latitude: document.getElementById('setLat').value.trim(),
      weather_longitude: document.getElementById('setLon').value.trim(),
      rss_feed_url: document.getElementById('setRss').value.trim(),
      rss_font_family: document.getElementById('setRssFontFamily').value,
      rss_font_size: String(Math.max(16, Math.min(34, parseInt(setRssFontSizeEl.value, 10) || 22))),
      rss_scroll_speed: document.getElementById('setRssSpeed').value,
      enable_tts: document.getElementById('setTts').value
    };

    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Configurações salvas e aplicadas nas TVs!');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Initialize
checkAuth();
