// TV Corporativa - Admin CMS v2.0
(function () {
  'use strict';

  let token = localStorage.getItem('tv_token');
  let currentUser = null;

  // API helper
  async function api(path, options = {}) {
    options.headers = options.headers || {};
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(`/api${path}`, options);
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro na requisição');
    }
    return data;
  }

  // Auth functions
  async function checkAuth() {
    if (!token) {
      showLogin();
      return;
    }
    try {
      const data = await api('/auth/me');
      currentUser = data.user;
      hideLogin();
      document.getElementById('loggedUserName').innerText = currentUser.name;
      document.getElementById('loggedUserRole').innerText = currentUser.role.toUpperCase();
      loadView('dashboard');
    } catch (e) {
      showLogin();
    }
  }

  function showLogin() {
    document.getElementById('loginContainer').style.display = 'flex';
  }

  function hideLogin() {
    document.getElementById('loginContainer').style.display = 'none';
  }

  function logout() {
    localStorage.removeItem('tv_token');
    token = null;
    currentUser = null;
    showLogin();
  }

  // Login Form Submission
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value.trim();
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';

    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { username, password }
      });
      token = data.token;
      localStorage.setItem('tv_token', token);
      currentUser = data.user;
      hideLogin();
      document.getElementById('loggedUserName').innerText = currentUser.name;
      document.getElementById('loggedUserRole').innerText = currentUser.role.toUpperCase();
      loadView('dashboard');
    } catch (err) {
      errorEl.innerText = err.message;
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', logout);

  // View Navigation
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      const view = item.getAttribute('data-view');
      loadView(view);
    });
  });

  const contentBody = document.getElementById('viewContent');
  const pageTitle = document.getElementById('pageTitle');

  async function loadView(viewName) {
    if (viewName === 'dashboard') {
      pageTitle.innerText = 'Painel de Controle';
      await renderDashboard();
    } else if (viewName === 'displays') {
      pageTitle.innerText = 'Gerenciamento de Telas (Displays)';
      await renderDisplays();
    } else if (viewName === 'media') {
      pageTitle.innerText = 'Biblioteca de Mídias (Vídeos e Imagens)';
      await renderMedia();
    } else if (viewName === 'playlists') {
      pageTitle.innerText = 'Playlists & Programação';
      await renderPlaylists();
    } else if (viewName === 'layouts') {
      pageTitle.innerText = 'Layouts & Multi-Zonas';
      await renderLayouts();
    } else if (viewName === 'queue') {
      pageTitle.innerText = 'Terminal de Chamada de Senhas (Consultório)';
      await renderQueue();
    } else if (viewName === 'settings') {
      pageTitle.innerText = 'Configurações do Sistema';
      await renderSettings();
    }
  }

  // 1. Dashboard View
  async function renderDashboard() {
    contentBody.innerHTML = '<p>Carregando dados...</p>';
    try {
      const [displaysData, mediaData, playlistsData] = await Promise.all([
        api('/displays'),
        api('/media'),
        api('/playlists')
      ]);

      const totalScreens = displaysData.displays.length;
      const onlineScreens = displaysData.displays.filter((d) => d.status === 'online').length;
      const totalMedia = mediaData.media.length;
      const totalPlaylists = playlistsData.playlists.length;

      contentBody.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">📺</div>
            <div>
              <div class="stat-value">${totalScreens}</div>
              <div class="stat-label">Total de Telas</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🟢</div>
            <div>
              <div class="stat-value" style="color: var(--success);">${onlineScreens}</div>
              <div class="stat-label">Telas Conectadas</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">🎬</div>
            <div>
              <div class="stat-value">${totalMedia}</div>
              <div class="stat-label">Mídias Armazenadas</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">📑</div>
            <div>
              <div class="stat-value">${totalPlaylists}</div>
              <div class="stat-label">Playlists Ativas</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Telas Cadastradas & Status de Transmissão</div>
            <button class="btn btn-primary" onclick="window.adminApp.openNewDisplayModal()">+ Nova Tela</button>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome da Tela</th>
                  <th>Localização</th>
                  <th>Layout Vinculado</th>
                  <th>Orientação</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${displaysData.displays.map((d) => `
                  <tr>
                    <td><strong>${d.code}</strong></td>
                    <td>${d.name}</td>
                    <td>${d.location || '-'}</td>
                    <td><span style="color: #60a5fa;">${d.layout_name || 'Padrão'}</span></td>
                    <td>${d.orientation === 'portrait' ? 'Vertical (9:16)' : 'Horizontal (16:9)'}</td>
                    <td>
                      <span class="badge ${d.status === 'online' ? 'badge-online' : 'badge-offline'}">
                        ${d.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </td>
                    <td>
                      <a href="/player?code=${d.code}" target="_blank" class="btn btn-sm btn-success">Abrir Player TV</a>
                      <button class="btn btn-sm btn-secondary" onclick="window.adminApp.reloadDisplay('${d.code}')">Recarregar</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      contentBody.innerHTML = `<p style="color: var(--danger)">Erro: ${err.message}</p>`;
    }
  }

  // 2. Displays View
  async function renderDisplays() {
    contentBody.innerHTML = '<p>Carregando telas...</p>';
    try {
      const [displaysData, layoutsData] = await Promise.all([
        api('/displays'),
        api('/layouts')
      ]);

      contentBody.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Telas Conectadas</div>
            <button class="btn btn-primary" onclick="window.adminApp.openNewDisplayModal()">+ Cadastrar Nova Tela</button>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Layout</th>
                  <th>Resolução</th>
                  <th>Status</th>
                  <th>Link do Reprodutor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${displaysData.displays.map((d) => `
                  <tr>
                    <td><strong>${d.code}</strong></td>
                    <td>${d.name}</td>
                    <td>${d.layout_name || 'Sem layout'}</td>
                    <td>${d.resolution}</td>
                    <td>
                      <span class="badge ${d.status === 'online' ? 'badge-online' : 'badge-offline'}">
                        ${d.status}
                      </span>
                    </td>
                    <td>
                      <a href="/player?code=${d.code}" target="_blank" style="color: #60a5fa;">
                        /player?code=${d.code}
                      </a>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="window.adminApp.reloadDisplay('${d.code}')">Sinal de Reload</button>
                      <button class="btn btn-sm btn-danger" onclick="window.adminApp.deleteDisplay('${d.id}')">Excluir</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      contentBody.innerHTML = `<p style="color: var(--danger)">Erro: ${err.message}</p>`;
    }
  }

  // 3. Media View
  async function renderMedia() {
    contentBody.innerHTML = '<p>Carregando mídias...</p>';
    try {
      const data = await api('/media');
      contentBody.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Enviar Nova Mídia (Vídeo ou Imagem)</div>
          </div>
          <form id="uploadForm" style="display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap;">
            <div class="form-group" style="flex: 2; min-width: 250px; margin-bottom: 0;">
              <label class="form-label">Selecione o arquivo (MP4, WebM, PNG, JPG)</label>
              <input type="file" id="mediaFileInput" class="form-control" required accept="image/*,video/mp4,video/webm">
            </div>
            <div class="form-group" style="flex: 1; min-width: 150px; margin-bottom: 0;">
              <label class="form-label">Duração padrão (s)</label>
              <input type="number" id="mediaDurationInput" class="form-control" value="10" min="1" max="300">
            </div>
            <button type="submit" class="btn btn-primary" id="btnUploadSubmit">Fazer Upload</button>
          </form>
          <div id="uploadProgress" style="display: none; margin-top: 10px; color: var(--warning);">
            Enviando arquivo para o servidor...
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Arquivos Disponíveis (${data.media.length})</div>
          </div>
          <div class="media-grid">
            ${data.media.map((m) => `
              <div class="media-card">
                <div class="media-thumb">
                  ${m.media_type === 'video'
                    ? `<video src="/media/${m.filename}" muted preload="metadata"></video>`
                    : `<img src="/media/${m.filename}" alt="${m.original_name}">`
                  }
                </div>
                <div class="media-meta">
                  <div class="media-name" title="${m.original_name}">${m.original_name}</div>
                  <div class="media-sub">
                    ${m.media_type.toUpperCase()} | ${(m.file_size / (1024 * 1024)).toFixed(1)} MB | ~${m.duration_seconds}s
                  </div>
                </div>
                <div class="media-actions">
                  <button class="btn btn-sm btn-danger" onclick="window.adminApp.deleteMedia('${m.id}')">Excluir</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('mediaFileInput');
        const durationInput = document.getElementById('mediaDurationInput');
        if (!fileInput.files || fileInput.files.length === 0) return;

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('duration', durationInput.value);

        const progressEl = document.getElementById('uploadProgress');
        const submitBtn = document.getElementById('btnUploadSubmit');
        progressEl.style.display = 'block';
        submitBtn.disabled = true;

        try {
          await api('/media/upload', {
            method: 'POST',
            body: formData
          });
          renderMedia();
        } catch (err) {
          alert('Erro no upload: ' + err.message);
        } finally {
          progressEl.style.display = 'none';
          submitBtn.disabled = false;
        }
      });
    } catch (err) {
      contentBody.innerHTML = `<p style="color: var(--danger)">Erro: ${err.message}</p>`;
    }
  }

  // 4. Playlists View
  async function renderPlaylists() {
    contentBody.innerHTML = '<p>Carregando playlists...</p>';
    try {
      const [playlistsData, mediaData] = await Promise.all([
        api('/playlists'),
        api('/media')
      ]);

      const currentPlaylist = playlistsData.playlists[0];
      let items = [];
      if (currentPlaylist) {
        const full = await api(`/playlists/${currentPlaylist.id}`);
        items = full.playlist.items || [];
      }

      contentBody.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Playlist Ativa: ${currentPlaylist ? currentPlaylist.name : 'Nenhuma'}</div>
            <button class="btn btn-primary" onclick="window.adminApp.openAddItemModal('${currentPlaylist ? currentPlaylist.id : ''}')">+ Adicionar Mídia à Programação</button>
          </div>
          <p style="color: var(--text-muted); margin-bottom: 20px;">
            ${currentPlaylist ? currentPlaylist.description : ''}
          </p>

          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Mídia / Item</th>
                  <th>Tipo</th>
                  <th>Duração</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item) => `
                  <tr>
                    <td><strong>#${item.order_num}</strong></td>
                    <td>${item.original_name || 'Item'}</td>
                    <td>${item.media_type ? item.media_type.toUpperCase() : 'WIDGET'}</td>
                    <td>${item.duration_seconds}s</td>
                    <td>
                      <span class="badge ${item.is_active ? 'badge-online' : 'badge-offline'}">
                        ${item.is_active ? 'ATIVO' : 'PAUSADO'}
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="window.adminApp.toggleItemStatus('${item.id}', ${item.is_active ? 0 : 1})">
                        ${item.is_active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button class="btn btn-sm btn-danger" onclick="window.adminApp.deletePlaylistItem('${item.id}')">Remover</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      contentBody.innerHTML = `<p style="color: var(--danger)">Erro: ${err.message}</p>`;
    }
  }

  // 5. Layouts View
  async function renderLayouts() {
    contentBody.innerHTML = '<p>Carregando layouts...</p>';
    try {
      const data = await api('/layouts');
      contentBody.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-title">Layouts Pré-Configurados (Multi-Zonas)</div>
          </div>
          <div class="media-grid">
            ${data.layouts.map((l) => `
              <div class="card" style="border: 1px solid rgba(59, 130, 246, 0.4);">
                <div class="card-title" style="color: #60a5fa;">${l.name}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin: 6px 0;">
                  Proporção: <strong>${l.aspect_ratio}</strong> | Zonas: <strong>${l.config.zones ? l.config.zones.length : 0}</strong>
                </div>
                <p style="font-size: 0.9rem; line-height: 1.4; margin: 12px 0;">
                  ${l.description}
                </p>
                <div style="margin-top: 10px;">
                  <span class="badge badge-online">ATIVO & DISPONÍVEL</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      contentBody.innerHTML = `<p style="color: var(--danger)">Erro: ${err.message}</p>`;
    }
  }

  // 6. Queue Calling View (Clinic Terminal)
  async function renderQueue() {
    contentBody.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div class="card-title">Chamar Nova Senha de Atendimento</div>
        </div>
        <p style="color: var(--text-muted); margin-bottom: 20px;">
          Ao clicar em "Chamar Senha", todas as TVs configuradas com o layout de consultório/hospital emitirão sinal sonoro (chime), síntese de voz (TTS) e destaque visual imediato na tela!
        </p>

        <form id="callTicketForm" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; align-items: flex-end;">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Número da Senha *</label>
            <input type="text" id="ticketNumber" class="form-control" placeholder="Ex: A-105" required style="font-size: 1.2rem; font-weight: bold; text-transform: uppercase;">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Destino / Local *</label>
            <input type="text" id="ticketLocation" class="form-control" placeholder="Ex: Consultório 02" required value="Consultório 01">
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Tipo de Atendimento</label>
            <select id="ticketType" class="form-control">
              <option value="Normal">Normal</option>
              <option value="Prioritário">Prioritário (Idoso / Gestante)</option>
              <option value="Exame">Coleta de Exames</option>
              <option value="Triagem">Triagem</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label">Nome do Paciente (Opcional)</label>
            <input type="text" id="ticketPatient" class="form-control" placeholder="Nome do paciente">
          </div>
          <div>
            <button type="submit" class="btn btn-success" style="width: 100%; height: 42px; font-size: 1rem;">
              📢 Chamar Senha Agora
            </button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Histórico de Chamadas Recentes</div>
          <button class="btn btn-sm btn-danger" onclick="window.adminApp.clearQueue()">Limpar Histórico</button>
        </div>
        <div class="table-responsive" id="queueTableWrapper">
          Carregando histórico...
        </div>
      </div>
    `;

    loadQueueTable();

    document.getElementById('callTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticket_number = document.getElementById('ticketNumber').value.trim();
      const location = document.getElementById('ticketLocation').value.trim();
      const service_type = document.getElementById('ticketType').value;
      const patient_name = document.getElementById('ticketPatient').value.trim();

      try {
        await api('/queue/call', {
          method: 'POST',
          body: { ticket_number, location, service_type, patient_name }
        });
        document.getElementById('ticketNumber').value = '';
        document.getElementById('ticketPatient').value = '';
        loadQueueTable();
      } catch (err) {
        alert('Erro ao chamar senha: ' + err.message);
      }
    });
  }

  async function loadQueueTable() {
    const wrapper = document.getElementById('queueTableWrapper');
    if (!wrapper) return;
    try {
      const data = await api('/queue/recent');
      wrapper.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Senha</th>
              <th>Destino</th>
              <th>Tipo</th>
              <th>Paciente</th>
            </tr>
          </thead>
          <tbody>
            ${data.calls.map((c) => `
              <tr>
                <td>${new Date(c.called_at).toLocaleTimeString('pt-BR')}</td>
                <td><strong style="color: #fbbf24; font-size: 1.1rem;">${c.ticket_number}</strong></td>
                <td>${c.location}</td>
                <td>${c.service_type}</td>
                <td>${c.patient_name || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      wrapper.innerHTML = `<p style="color: var(--danger)">Erro: ${e.message}</p>`;
    }
  }

  // 7. Settings View
  async function renderSettings() {
    contentBody.innerHTML = '<p>Carregando configurações...</p>';
    try {
      const data = await api('/settings');
      const s = data.settings;

      contentBody.innerHTML = `
        <div class="card" style="max-width: 650px;">
          <div class="card-header">
            <div class="card-title">Configurações Gerais da TV Corporativa</div>
          </div>
          <form id="settingsForm">
            <div class="form-group">
              <label class="form-label">Título do Sistema (Header)</label>
              <input type="text" id="set_site_title" class="form-control" value="${s.site_title || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Cidade para Previsão do Tempo (Open-Meteo)</label>
              <input type="text" id="set_weather_city" class="form-control" value="${s.weather_city || 'São Paulo'}">
            </div>
            <div class="form-group">
              <label class="form-label">URL do Feed de Notícias RSS (Ticker)</label>
              <input type="url" id="set_rss_feed_url" class="form-control" value="${s.rss_feed_url || 'https://g1.globo.com/rss/g1/'}">
            </div>
            <div class="form-group">
              <label class="form-label">Cor Primária (Hexadecimal)</label>
              <input type="color" id="set_theme_color" class="form-control" value="${s.theme_color || '#1e40af'}" style="height: 45px;">
            </div>
            <button type="submit" class="btn btn-primary">Salvar Alterações</button>
          </form>
        </div>
      `;

      document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const settings = {
          site_title: document.getElementById('set_site_title').value.trim(),
          weather_city: document.getElementById('set_weather_city').value.trim(),
          rss_feed_url: document.getElementById('set_rss_feed_url').value.trim(),
          theme_color: document.getElementById('set_theme_color').value
        };

        try {
          await api('/settings', {
            method: 'PUT',
            body: { settings }
          });
          alert('Configurações salvas e transmitidas às TVs conectadas!');
        } catch (err) {
          alert('Erro ao salvar: ' + err.message);
        }
      });
    } catch (err) {
      contentBody.innerHTML = `<p style="color: var(--danger)">Erro: ${err.message}</p>`;
    }
  }

  // Global Admin App Actions
  window.adminApp = {
    async reloadDisplay(code) {
      try {
        await api(`/displays/${code}/reload`, { method: 'POST' });
        alert(`Sinal de recarregamento enviado para a tela ${code}!`);
      } catch (e) {
        alert(e.message);
      }
    },

    async deleteDisplay(id) {
      if (!confirm('Deseja realmente remover esta tela?')) return;
      try {
        await api(`/displays/${id}`, { method: 'DELETE' });
        loadView('displays');
      } catch (e) {
        alert(e.message);
      }
    },

    async deleteMedia(id) {
      if (!confirm('Deseja realmente excluir este arquivo de mídia?')) return;
      try {
        await api(`/media/${id}`, { method: 'DELETE' });
        loadView('media');
      } catch (e) {
        alert(e.message);
      }
    },

    async toggleItemStatus(itemId, newStatus) {
      try {
        await api(`/playlists/items/${itemId}`, {
          method: 'PUT',
          body: { is_active: newStatus }
        });
        loadView('playlists');
      } catch (e) {
        alert(e.message);
      }
    },

    async deletePlaylistItem(itemId) {
      if (!confirm('Deseja remover este item da playlist?')) return;
      try {
        await api(`/playlists/items/${itemId}`, { method: 'DELETE' });
        loadView('playlists');
      } catch (e) {
        alert(e.message);
      }
    },

    async clearQueue() {
      if (!confirm('Deseja limpar todo o histórico de chamadas de senha?')) return;
      try {
        await api('/queue/clear', { method: 'POST' });
        loadQueueTable();
      } catch (e) {
        alert(e.message);
      }
    },

    async openNewDisplayModal() {
      const name = prompt('Informe o nome da tela (ex: TV Corredor Principal):');
      if (!name) return;
      const code = prompt('Informe o código único da tela (ex: TV-04):');
      if (!code) return;

      try {
        await api('/displays', {
          method: 'POST',
          body: { name, code, layout_id: 'layout-corporate-news' }
        });
        loadView('displays');
      } catch (e) {
        alert(e.message);
      }
    },

    async openAddItemModal(playlistId) {
      if (!playlistId) return;
      const mediaList = await api('/media');
      if (mediaList.media.length === 0) {
        alert('Nenhuma mídia disponível na biblioteca. Faça o upload de imagens ou vídeos primeiro!');
        loadView('media');
        return;
      }

      const promptText = mediaList.media.map((m, idx) => `${idx + 1}. ${m.original_name} (${m.media_type})`).join('\n');
      const selection = prompt(`Escolha o número da mídia para adicionar:\n\n${promptText}`);
      const index = parseInt(selection, 10) - 1;

      if (!isNaN(index) && mediaList.media[index]) {
        const selectedMedia = mediaList.media[index];
        const duration = prompt('Duração de exibição em segundos:', selectedMedia.duration_seconds || 10);
        try {
          await api(`/playlists/${playlistId}/items`, {
            method: 'POST',
            body: {
              media_id: selectedMedia.id,
              duration_seconds: parseInt(duration, 10) || 10
            }
          });
          loadView('playlists');
        } catch (e) {
          alert(e.message);
        }
      }
    }
  };

  // Start Auth Check
  checkAuth();
})();
