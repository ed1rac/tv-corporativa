import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db } from './connection.js';

export async function runSeed(): Promise<void> {
  console.log('[Database] Checking initial seed data...');

  // 1. Seed Users (admin & edkallenn)
  const existingAdmin = await db.get('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!existingAdmin) {
    const adminPassHash = await bcrypt.hash('tvcorporativa', 10);
    await db.run(
      `INSERT INTO users (id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), 'Administrador', 'admin', adminPassHash, 'admin']
    );
    console.log('[Seed] Created default user: admin (password: tvcorporativa)');
  }

  const existingEd = await db.get('SELECT id FROM users WHERE username = ?', ['edkallenn']);
  if (!existingEd) {
    const edPassHash = await bcrypt.hash('123456', 10);
    await db.run(
      `INSERT INTO users (id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), 'Ed Kallenn', 'edkallenn', edPassHash, 'admin']
    );
    console.log('[Seed] Created default user: edkallenn (password: 123456)');
  }

  // 2. Seed Default Layouts
  const existingLayouts = await db.all('SELECT id FROM layouts');
  if (existingLayouts.length === 0) {
    const layout1Id = 'layout-fullscreen';
    const layout2Id = 'layout-corporate-news';
    const layout3Id = 'layout-clinic-reception';
    const layout4Id = 'layout-elevator-vertical';
    const layout5Id = 'layout-grid-quad';

    // Layout 1: Tela Cheia
    await db.run(
      `INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`,
      [
        layout1Id,
        'Tela Cheia (16:9 / 9:16)',
        '16:9',
        'Exibição em 100% da tela para vídeos e imagens de alto impacto sem barras laterais.',
        JSON.stringify({
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
        })
      ]
    );

    // Layout 2: Notícias & TV Corporativa (16:9)
    await db.run(
      `INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`,
      [
        layout2Id,
        'Notícias & TV Corporativa',
        '16:9',
        'Área de vídeo 70%, barra lateral direita com relógio, clima e informes, e rodapé com ticker de notícias RSS contínuo.',
        JSON.stringify({
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
              name: 'Barra Lateral (Clima & Avisos)',
              type: 'COMPOSITE',
              bounds: { top: '0%', left: '70%', width: '30%', height: '90%' },
              sub_widgets: [
                { type: 'CLOCK', height: '25%' },
                { type: 'WEATHER', height: '35%' },
                { type: 'ANNOUNCEMENTS', height: '40%' }
              ]
            },
            {
              id: 'zone_ticker',
              name: 'Rodapé de Notícias (RSS)',
              type: 'RSS_TICKER',
              bounds: { top: '90%', left: '0%', width: '100%', height: '10%' }
            }
          ]
        })
      ]
    );

    // Layout 3: Consultório / Recepção Médica (16:9)
    await db.run(
      `INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`,
      [
        layout3Id,
        'Consultório & Chamada de Senhas',
        '16:9',
        'Área principal de vídeos educativos, painel lateral com chamada de senhas de atendimento em tempo real (com som/voz) e rodapé institucional.',
        JSON.stringify({
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
                { type: 'CLOCK', height: '20%' },
                { type: 'WEATHER', height: '25%' },
                { type: 'QUEUE_CALL', height: '55%' }
              ]
            },
            {
              id: 'zone_footer',
              name: 'Rodapé de Avisos do Consultório',
              type: 'ANNOUNCEMENTS_TICKER',
              bounds: { top: '90%', left: '0%', width: '100%', height: '10%' }
            }
          ]
        })
      ]
    );

    // Layout 4: Elevador / Totem Vertical (9:16 Portrait)
    await db.run(
      `INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`,
      [
        layout4Id,
        'Elevador / Totem Vertical (9:16)',
        '9:16',
        'Layout vertical otimizado para telas em formato retrato. Topo com clima e relógio, centro com mídias e base com notícias e QR Code.',
        JSON.stringify({
          name: 'Elevador / Totem Vertical',
          aspect_ratio: '9:16',
          zones: [
            {
              id: 'zone_header',
              name: 'Cabeçalho (Data, Hora e Tempo)',
              type: 'COMPOSITE',
              bounds: { top: '0%', left: '0%', width: '100%', height: '15%' },
              sub_widgets: [
                { type: 'CLOCK', width: '50%' },
                { type: 'WEATHER', width: '50%' }
              ]
            },
            {
              id: 'zone_media',
              name: 'Mídia Vertical',
              type: 'PLAYLIST',
              bounds: { top: '15%', left: '0%', width: '100%', height: '65%' }
            },
            {
              id: 'zone_footer',
              name: 'Notícias & QR Code',
              type: 'COMPOSITE',
              bounds: { top: '80%', left: '0%', width: '100%', height: '20%' },
              sub_widgets: [
                { type: 'RSS_TICKER', height: '50%' },
                { type: 'QR_ANNOUNCEMENT', height: '50%' }
              ]
            }
          ]
        })
      ]
    );

    // Layout 5: Grid Multi-Zonas (2x2)
    await db.run(
      `INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`,
      [
        layout5Id,
        'Grid 4 Zonas (2x2)',
        '16:9',
        'Divisão da tela em 4 quadrantes simultâneos para monitoramento, centros de operações ou vitrines multimídia.',
        JSON.stringify({
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
              name: 'Quadrante Inferior Esquerdo (Avisos)',
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
        })
      ]
    );
    console.log('[Seed] Created default layouts (Fullscreen, Corporate News, Clinic Reception, Elevator 9:16, Grid 4)');
  }

  // 3. Seed Default Playlists
  const existingPlaylists = await db.all('SELECT id FROM playlists');
  let defaultPlaylistId = 'playlist-default';
  if (existingPlaylists.length === 0) {
    await db.run(
      `INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)`,
      [defaultPlaylistId, 'Playlist Padrão da Empresa', 'Campanhas institucionais e informes gerais da TV Corporativa.']
    );
    console.log('[Seed] Created default playlist');
  } else {
    defaultPlaylistId = existingPlaylists[0].id;
  }

  // 4. Seed Default Displays (Screens)
  const existingDisplays = await db.all('SELECT id FROM displays');
  if (existingDisplays.length === 0) {
    await db.run(
      `INSERT INTO displays (id, name, code, layout_id, orientation, resolution, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        'TV Recepção Principal',
        'TV-01',
        'layout-corporate-news',
        'landscape',
        '1920x1080',
        'Recepção Térreo',
        'online'
      ]
    );
    await db.run(
      `INSERT INTO displays (id, name, code, layout_id, orientation, resolution, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        'TV Sala de Espera / Consultório',
        'TV-02',
        'layout-clinic-reception',
        'landscape',
        '1920x1080',
        'Ambulatório 2º Andar',
        'online'
      ]
    );
    await db.run(
      `INSERT INTO displays (id, name, code, layout_id, orientation, resolution, location, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        'Totem Vertical Elevador',
        'TV-03',
        'layout-elevator-vertical',
        'portrait',
        '1080x1920',
        'Hall dos Elevadores',
        'offline'
      ]
    );
    console.log('[Seed] Created default displays: TV-01, TV-02, TV-03');
  }

  // 4.1 Seed Sample Media & Playlist Items
  const existingMedia = await db.all('SELECT id FROM media');
  if (existingMedia.length === 0) {
    const samples = [
      { id: 'media-1', filename: 'luds01.png', name: 'Banner Institucional 01', type: 'image', size: 43028, duration: 8 },
      { id: 'media-2', filename: 'mov_bbb.mp4', name: 'Vídeo Promocional (Big Buck Bunny)', type: 'video', size: 788493, duration: 10 },
      { id: 'media-3', filename: 'luds02.png', name: 'Banner Informativo 02', type: 'image', size: 135806, duration: 8 },
      { id: 'media-4', filename: 'movie.mp4', name: 'Vídeo Comercial 02', type: 'video', size: 318465, duration: 12 },
      { id: 'media-5', filename: 'luds03.png', name: 'Campanha de Segurança', type: 'image', size: 742950, duration: 8 }
    ];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      await db.run(
        `INSERT INTO media (id, filename, original_name, media_type, mime_type, file_size, duration_seconds, storage_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.filename, s.name, s.type, s.type === 'video' ? 'video/mp4' : 'image/png', s.size, s.duration, s.filename]
      );

      // Add to default playlist
      await db.run(
        `INSERT INTO playlist_items (id, playlist_id, media_id, order_num, duration_seconds, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [randomUUID(), defaultPlaylistId, s.id, i + 1, s.duration]
      );
    }
    console.log('[Seed] Seeded sample media library and playlist items (images & videos).');
  }

  // 5. Seed Initial Queue Calls
  const existingQueue = await db.all('SELECT id FROM queue_calls');
  if (existingQueue.length === 0) {
    await db.run(
      `INSERT INTO queue_calls (id, ticket_number, location, service_type, patient_name, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), 'A-101', 'Consultório 01', 'Normal', 'Carlos Alberto', 'active']
    );
    await db.run(
      `INSERT INTO queue_calls (id, ticket_number, location, service_type, patient_name, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), 'P-042', 'Consultório 03', 'Prioritário', 'Maria Aparecida', 'active']
    );
    console.log('[Seed] Created sample queue calls for clinic layout');
  }

  // 6. Seed System Settings
  const settings = [
    { key: 'site_title', value: 'TV Corporativa & Sinalização Digital', description: 'Título exibido na barra superior' },
    { key: 'theme_color', value: '#1e40af', description: 'Cor primária de destaque (hex)' },
    { key: 'weather_city', value: 'São Paulo', description: 'Cidade padrão para previsão do tempo' },
    { key: 'weather_latitude', value: '-23.5505', description: 'Latitude da cidade' },
    { key: 'weather_longitude', value: '-46.6333', description: 'Longitude da cidade' },
    { key: 'rss_feed_url', value: 'https://g1.globo.com/rss/g1/', description: 'URL do feed RSS de notícias' },
    { key: 'rss_scroll_speed', value: '50', description: 'Velocidade do ticker RSS em px/s' },
    { key: 'enable_tts', value: 'true', description: 'Habilitar síntese de voz para chamada de senhas' },
    { key: 'default_slide_duration', value: '10', description: 'Duração padrão para imagens em segundos' }
  ];

  for (const s of settings) {
    const existing = await db.get('SELECT key FROM system_settings WHERE key = ?', [s.key]);
    if (!existing) {
      await db.run(
        `INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)`,
        [s.key, s.value, s.description]
      );
    }
  }

  console.log('[Seed] Database initialization and seed completed.');
}
