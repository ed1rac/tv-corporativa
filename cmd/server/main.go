package main

import (
	"compress/gzip"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"

	"tv-corporativa/internal/config"
	"tv-corporativa/internal/websocket"
)

var (
	cfg      *config.Config
	db       *sql.DB
	hub      *websocket.Hub
	rssMu    sync.Mutex
	rssCache = map[string]cachedRss{}
)

type cachedRss struct {
	Items     []map[string]string
	ExpiresAt time.Time
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]),
	)
}

func main() {
	cfg = config.Load()

	_ = os.MkdirAll(filepath.Dir(cfg.DBPath), 0755)
	_ = os.MkdirAll(cfg.MediaPath, 0755)

	var err error
	db, err = sql.Open("sqlite3", cfg.DBPath+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		log.Fatalf("Erro ao conectar no banco SQLite: %v", err)
	}
	defer db.Close()

	runMigrations()
	runSeed()

	hub = websocket.NewHub(db)
	go hub.Run()

	mux := http.NewServeMux()

	// Static routes
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(cfg.MediaPath))))
	mux.Handle("/css/", http.FileServer(http.Dir("public")))
	mux.Handle("/js/", http.FileServer(http.Dir("public")))
	mux.HandleFunc("/sw.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/sw.js")
	})

	// SPA Views
	mux.HandleFunc("/player", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/player.html")
	})
	mux.HandleFunc("/admin", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/index.html")
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "public/index.html")
			return
		}
		http.FileServer(http.Dir("public")).ServeHTTP(w, r)
	})

	// WebSocket Hub
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r)
	})

	// API Routes
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/auth/login", handleLogin)
	mux.HandleFunc("/api/auth/me", handleAuthMe)

	mux.HandleFunc("/api/displays/code/", handleDisplayByCode)
	mux.HandleFunc("/api/displays/", handleDisplayByIDOrAction)
	mux.HandleFunc("/api/displays", handleDisplays)

	mux.HandleFunc("/api/layouts/", handleLayoutByID)
	mux.HandleFunc("/api/layouts", handleLayouts)

	mux.HandleFunc("/api/playlists/items/", handlePlaylistItemByID)
	mux.HandleFunc("/api/playlists/", handlePlaylistByIDOrSubroute)
	mux.HandleFunc("/api/playlists", handlePlaylists)

	mux.HandleFunc("/api/media/upload", handleMediaUpload)
	mux.HandleFunc("/api/media/stream/", handleMediaStream)
	mux.HandleFunc("/api/media/", handleMediaByID)
	mux.HandleFunc("/api/media", handleMedia)

	mux.HandleFunc("/api/queue/recent", handleQueueRecent)
	mux.HandleFunc("/api/queue/generate", handleQueueGenerate)
	mux.HandleFunc("/api/queue/call", handleQueueCall)
	mux.HandleFunc("/api/queue/recall/", handleQueueRecall)
	mux.HandleFunc("/api/queue/desks/", handleQueueDeskDelete)
	mux.HandleFunc("/api/queue/desks", handleQueueDeskCreate)
	mux.HandleFunc("/api/queue/services/", handleQueueServiceDelete)
	mux.HandleFunc("/api/queue/services", handleQueueServiceCreate)
	mux.HandleFunc("/api/queue/clear", handleQueueClear)

	mux.HandleFunc("/api/settings/reload-screens", handleSettingsReloadScreens)
	mux.HandleFunc("/api/settings", handleSettings)

	mux.HandleFunc("/api/widgets/weather", handleWeather)
	mux.HandleFunc("/api/widgets/rss", handleRSS)

	addr := ":" + cfg.Port
	log.Printf("==================================================")
	log.Printf("  🚀 TV Corporativa Engine em Go (v1.3.1-go)")
	log.Printf("  feito por EDkallenn")
	log.Printf("==================================================")
	log.Printf("[Go Server]    Rodando em http://localhost:%s", cfg.Port)
	log.Printf("[Painel Admin] http://localhost:%s/admin", cfg.Port)
	log.Printf("[Player TV-01] http://localhost:%s/player?code=TV-01", cfg.Port)
	log.Printf("[Memória]      Consumo base estimado: ~15MB RAM")

	if err := http.ListenAndServe(addr, enableCORS(mux)); err != nil {
		log.Fatalf("Erro no servidor: %v", err)
	}
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func safeAddColumn(table, colDef string) {
	_, _ = db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s;", table, colDef))
}

func runMigrations() {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'operator',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS layouts (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		aspect_ratio TEXT NOT NULL DEFAULT '16:9',
		description TEXT,
		config_json TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS displays (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		code TEXT UNIQUE NOT NULL,
		layout_id TEXT,
		playlist_id TEXT,
		orientation TEXT NOT NULL DEFAULT 'landscape',
		resolution TEXT DEFAULT '1920x1080',
		location TEXT,
		show_header INTEGER NOT NULL DEFAULT 1,
		status TEXT NOT NULL DEFAULT 'offline',
		last_ping DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS playlists (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS media (
		id TEXT PRIMARY KEY,
		filename TEXT NOT NULL,
		original_name TEXT NOT NULL,
		media_type TEXT NOT NULL,
		mime_type TEXT NOT NULL,
		file_size INTEGER NOT NULL,
		duration_seconds INTEGER DEFAULT 10,
		storage_path TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS playlist_items (
		id TEXT PRIMARY KEY,
		playlist_id TEXT NOT NULL,
		media_id TEXT,
		widget_type TEXT,
		widget_config_json TEXT,
		order_num INTEGER NOT NULL DEFAULT 1,
		duration_seconds INTEGER NOT NULL DEFAULT 10,
		is_active INTEGER NOT NULL DEFAULT 1,
		start_date DATETIME,
		end_date DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS queue_calls (
		id TEXT PRIMARY KEY,
		ticket_number TEXT NOT NULL,
		location TEXT NOT NULL,
		service_type TEXT NOT NULL DEFAULT 'Normal',
		service_name TEXT DEFAULT 'Atendimento Geral',
		patient_name TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		called_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		status TEXT NOT NULL DEFAULT 'active'
	);
	CREATE TABLE IF NOT EXISTS service_desks (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		category TEXT DEFAULT 'Consultório',
		is_active INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS service_types (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		prefix TEXT NOT NULL DEFAULT 'A',
		is_priority INTEGER NOT NULL DEFAULT 0,
		current_seq INTEGER NOT NULL DEFAULT 100,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE TABLE IF NOT EXISTS system_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		description TEXT,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	if _, err := db.Exec(schema); err != nil {
		log.Printf("[Database Migration Error]: %v", err)
	}
	safeAddColumn("displays", "playlist_id TEXT")
	safeAddColumn("displays", "show_header INTEGER NOT NULL DEFAULT 1")
	safeAddColumn("queue_calls", "service_name TEXT DEFAULT 'Atendimento Geral'")
	safeAddColumn("queue_calls", "created_at DATETIME")
}

func runSeed() {
	// 1. Seed Users
	var count int
	_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE username = 'admin'`).Scan(&count)
	if count == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("tvcorporativa"), 10)
		_, _ = db.Exec(`INSERT INTO users (id, name, username, password_hash, role) VALUES (?, 'Administrador', 'admin', ?, 'admin')`, newUUID(), string(hash))
	}
	_ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE username = 'edkallenn'`).Scan(&count)
	if count == 0 {
		hash, _ := bcrypt.GenerateFromPassword([]byte("123456"), 10)
		_, _ = db.Exec(`INSERT INTO users (id, name, username, password_hash, role) VALUES (?, 'Edkallenn', 'edkallenn', ?, 'admin')`, newUUID(), string(hash))
	} else {
		_, _ = db.Exec(`UPDATE users SET name = 'Edkallenn' WHERE username = 'edkallenn'`)
	}

	// 2. Seed Default Layouts, Playlist, Displays, Desks & Services if DB is new
	_ = db.QueryRow(`SELECT COUNT(*) FROM layouts`).Scan(&count)
	if count == 0 {
		layoutsSeed := []struct {
			ID, Name, Aspect, Desc, JSON string
		}{
			{
				"layout-fullscreen", "Tela Cheia (16:9 / 9:16)", "16:9",
				"Exibição em 100% da tela para vídeos e imagens de alto impacto sem barras laterais.",
				`{"name":"Tela Cheia","aspect_ratio":"16:9","zones":[{"id":"zone_main","name":"Mídia Principal","type":"PLAYLIST","bounds":{"top":"0%","left":"0%","width":"100%","height":"100%"}}]}`,
			},
			{
				"layout-corporate-news", "Notícias & TV Corporativa", "16:9",
				"Área de vídeo 70%, barra lateral direita com relógio, clima e informes/imagem fixa, e rodapé com ticker de notícias RSS contínuo.",
				`{"name":"Notícias & TV Corporativa","aspect_ratio":"16:9","zones":[{"id":"zone_media","name":"Vídeo & Imagens","type":"PLAYLIST","bounds":{"top":"0%","left":"0%","width":"70%","height":"90%"}},{"id":"zone_sidebar","name":"Barra Lateral (Clima & Comunicados)","type":"COMPOSITE","bounds":{"top":"0%","left":"70%","width":"30%","height":"90%"},"sub_widgets":[{"type":"CLOCK","height":"22%"},{"type":"WEATHER","height":"28%"},{"type":"ANNOUNCEMENTS","height":"50%"}]},{"id":"zone_ticker","name":"Rodapé de Notícias (RSS)","type":"RSS_TICKER","bounds":{"top":"90%","left":"0%","width":"100%","height":"10%"}}]}`,
			},
			{
				"layout-clinic-reception", "Consultório & Chamada de Senhas", "16:9",
				"Área principal de vídeos educativos, painel lateral com chamada de senhas de atendimento em tempo real (com som/voz) e rodapé de notícias RSS.",
				`{"name":"Consultório & Chamada de Senhas","aspect_ratio":"16:9","zones":[{"id":"zone_media","name":"Vídeos Institucionais / Saúde","type":"PLAYLIST","bounds":{"top":"0%","left":"0%","width":"65%","height":"90%"}},{"id":"zone_sidebar","name":"Painel de Senhas & Horário","type":"COMPOSITE","bounds":{"top":"0%","left":"65%","width":"35%","height":"90%"},"sub_widgets":[{"type":"CLOCK","height":"18%"},{"type":"WEATHER","height":"22%"},{"type":"QUEUE_CALL","height":"60%"}]},{"id":"zone_footer","name":"Rodapé de Notícias (RSS)","type":"RSS_TICKER","bounds":{"top":"90%","left":"0%","width":"100%","height":"10%"}}]}`,
			},
			{
				"layout-elevator-vertical", "Elevador / Totem Vertical (9:16)", "9:16",
				"Layout vertical otimizado para telas em formato retrato. Topo com clima e relógio, centro com mídias e base com comunicados e notícias RSS.",
				`{"name":"Elevador / Totem Vertical","aspect_ratio":"9:16","zones":[{"id":"zone_header","name":"Cabeçalho (Data, Hora e Tempo)","type":"COMPOSITE","bounds":{"top":"0%","left":"0%","width":"100%","height":"18%"},"sub_widgets":[{"type":"CLOCK","width":"50%"},{"type":"WEATHER","width":"50%"}]},{"id":"zone_media","name":"Mídia Vertical","type":"PLAYLIST","bounds":{"top":"18%","left":"0%","width":"100%","height":"58%"}},{"id":"zone_announcements","name":"Comunicados & Avisos","type":"ANNOUNCEMENTS","bounds":{"top":"76%","left":"0%","width":"100%","height":"16%"}},{"id":"zone_footer","name":"Rodapé de Notícias (RSS)","type":"RSS_TICKER","bounds":{"top":"92%","left":"0%","width":"100%","height":"8%"}}]}`,
			},
			{
				"layout-grid-quad", "Grid 4 Zonas (2x2)", "16:9",
				"Divisão da tela em 4 quadrantes simultâneos para monitoramento, centros de operações ou vitrines multimídia.",
				`{"name":"Grid 4 Zonas","aspect_ratio":"16:9","zones":[{"id":"zone_q1","name":"Quadrante Superior Esquerdo (Vídeos)","type":"PLAYLIST","bounds":{"top":"0%","left":"0%","width":"50%","height":"50%"}},{"id":"zone_q2","name":"Quadrante Superior Direito (Clima & Relógio)","type":"COMPOSITE","bounds":{"top":"0%","left":"50%","width":"50%","height":"50%"},"sub_widgets":[{"type":"CLOCK","height":"40%"},{"type":"WEATHER","height":"60%"}]},{"id":"zone_q3","name":"Quadrante Inferior Esquerdo (Comunicados)","type":"ANNOUNCEMENTS","bounds":{"top":"50%","left":"0%","width":"50%","height":"50%"}},{"id":"zone_q4","name":"Quadrante Inferior Direito (Notícias RSS)","type":"RSS_TICKER","bounds":{"top":"50%","left":"50%","width":"50%","height":"50%"}}]}`,
			},
		}
		for _, l := range layoutsSeed {
			_, _ = db.Exec(`INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`, l.ID, l.Name, l.Aspect, l.Desc, l.JSON)
		}
	}

	_ = db.QueryRow(`SELECT COUNT(*) FROM playlists`).Scan(&count)
	if count == 0 {
		_, _ = db.Exec(`INSERT INTO playlists (id, name, description) VALUES ('playlist-default', 'Playlist Padrão da Empresa', 'Campanhas institucionais e informes gerais da TV Corporativa.')`)
	}

	_ = db.QueryRow(`SELECT COUNT(*) FROM displays`).Scan(&count)
	if count == 0 {
		_, _ = db.Exec(`INSERT INTO displays (id, name, code, layout_id, playlist_id, orientation, resolution, location, show_header, status) VALUES (?, 'TV Recepção Principal', 'TV-01', 'layout-corporate-news', 'playlist-default', 'landscape', '1920x1080', 'Recepção Térreo', 1, 'online')`, newUUID())
		_, _ = db.Exec(`INSERT INTO displays (id, name, code, layout_id, playlist_id, orientation, resolution, location, show_header, status) VALUES (?, 'TV Sala de Espera / Consultório', 'TV-02', 'layout-clinic-reception', 'playlist-default', 'landscape', '1920x1080', 'Ambulatório 2º Andar', 1, 'online')`, newUUID())
		_, _ = db.Exec(`INSERT INTO displays (id, name, code, layout_id, playlist_id, orientation, resolution, location, show_header, status) VALUES (?, 'Totem Vertical Elevador', 'TV-03', 'layout-elevator-vertical', 'playlist-default', 'portrait', '1080x1920', 'Hall dos Elevadores', 1, 'offline')`, newUUID())
	}

	_ = db.QueryRow(`SELECT COUNT(*) FROM service_desks`).Scan(&count)
	if count == 0 {
		desks := [][2]string{
			{"Guichê 01 - Recepção", "Guichê"},
			{"Guichê 02 - Atendimento Geral", "Guichê"},
			{"Guichê 03 - Prioritário", "Guichê"},
			{"Consultório 01 - Clínica Médica", "Consultório"},
			{"Consultório 02 - Pediatria", "Consultório"},
			{"Consultório 03 - Ortopedia", "Consultório"},
		}
		for _, d := range desks {
			_, _ = db.Exec(`INSERT INTO service_desks (id, name, category, is_active) VALUES (?, ?, ?, 1)`, newUUID(), d[0], d[1])
		}
	}

	_ = db.QueryRow(`SELECT COUNT(*) FROM service_types`).Scan(&count)
	if count == 0 {
		_, _ = db.Exec(`INSERT INTO service_types (id, name, prefix, is_priority, current_seq) VALUES ('srv-geral', 'Atendimento Geral (Recepção)', 'A', 0, 102)`)
		_, _ = db.Exec(`INSERT INTO service_types (id, name, prefix, is_priority, current_seq) VALUES ('srv-prio', 'Atendimento Prioritário (Idoso/Gestante/PCD)', 'P', 1, 43)`)
		_, _ = db.Exec(`INSERT INTO service_types (id, name, prefix, is_priority, current_seq) VALUES ('srv-cons', 'Consulta Médica', 'C', 0, 201)`)
	}

	// 3. Seed Default Settings (v1.3.1)
	defaultSettings := []struct {
		Key, Value, Desc string
	}{
		{"site_title", "TV Corporativa & Sinalização Digital", "Título / Nome da Empresa exibido na barra superior"},
		{"company_subtitle", "Comunicação Interna & Atendimento Integrado", "Subtítulo ou Slogan da Empresa"},
		{"company_logo", "/media/luds_logo100.png", "URL do símbolo/logo da empresa no topo das TVs e Totens"},
		{"show_company_header", "true", "Exibir barra superior com nome e logo da empresa"},
		{"theme_color", "#1e40af", "Cor primária de destaque (hex)"},
		{"weather_city", "São Paulo", "Cidade padrão para previsão do tempo"},
		{"weather_latitude", "-23.5505", "Latitude da cidade"},
		{"weather_longitude", "-46.6333", "Longitude da cidade"},
		{"rss_feed_url", "https://g1.globo.com/rss/g1/", "URL do feed RSS de notícias"},
		{"rss_scroll_speed", "40", "Velocidade do ticker RSS em pixels por segundo"},
		{"enable_tts", "true", "Habilitar síntese de voz para chamada de senhas"},
		{"default_slide_duration", "10", "Duração padrão para imagens em segundos"},
		{"announcement_title", "📢 COMUNICADOS & AVISOS", "Título do quadro de comunicados na TV-01 e painéis"},
		{"announcement_text", "Seja bem-vindo(a)! Fique atento aos comunicados internos e informes importantes da organização neste painel.", "Texto do quadro de comunicados"},
		{"announcement_image", "", "Imagem fixa do quadro de comunicados"},
		{"announcement_mode", "both", "Modo de exibição do comunicado"},
		{"announcement_font_family", "'Roboto', sans-serif", "Fonte tipográfica do texto dos comunicados"},
		{"announcement_font_size", "20", "Tamanho da fonte dos comunicados em px (14 a 34)"},
		{"announcement_stream_url", "", "URL de streaming de TV ou Rádio para o espaço de comunicados"},
		{"announcement_stream_type", "auto", "Tipo de streaming no comunicado: auto, tv ou radio"},
		{"rss_font_family", "'Titillium Web', sans-serif", "Fonte tipográfica das notícias do rodapé RSS"},
		{"rss_font_size", "22", "Tamanho da fonte das notícias do rodapé RSS em px (16 a 34)"},
	}
	for _, s := range defaultSettings {
		_, _ = db.Exec(`INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)`, s.Key, s.Value, s.Desc)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"engine":    "go",
		"version":   "1.3.1-go",
		"author":    "Edkallenn",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// ============================================================================
// AUTH
// ============================================================================
func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	var id, name, username, passHash, role string
	err := db.QueryRow(`SELECT id, name, username, password_hash, role FROM users WHERE username = ?`, req.Username).
		Scan(&id, &name, &username, &passHash, &role)
	if err != nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "Usuário ou senha inválidos."})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(passHash), []byte(req.Password)) != nil {
		jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "Usuário ou senha inválidos."})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":       id,
		"username": username,
		"name":     name,
		"role":     role,
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	})
	signed, _ := token.SignedString([]byte(cfg.JWTSecret))

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"message": "Autenticado com sucesso",
		"token":   signed,
		"user": map[string]string{
			"id":       id,
			"username": username,
			"name":     name,
			"role":     role,
		},
	})
}

func handleAuthMe(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"user": map[string]string{
			"username": "edkallenn",
			"name":     "Edkallenn",
			"role":     "admin",
		},
	})
}

// ============================================================================
// DISPLAYS
// ============================================================================
func handleDisplays(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		rows, err := db.Query(`
			SELECT d.id, d.name, d.code, COALESCE(d.layout_id,''), COALESCE(d.playlist_id,''),
			       d.orientation, COALESCE(d.resolution,'1920x1080'), COALESCE(d.location,''),
			       d.show_header, d.status, COALESCE(l.name,''), COALESCE(l.aspect_ratio,'16:9'), COALESCE(p.name,'')
			FROM displays d
			LEFT JOIN layouts l ON d.layout_id = l.id
			LEFT JOIN playlists p ON d.playlist_id = p.id
			ORDER BY d.code ASC
		`)
		if err != nil {
			jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		defer rows.Close()

		displays := []map[string]interface{}{}
		for rows.Next() {
			var id, name, code, layoutID, playlistID, orient, res, loc, status, layoutName, aspect, playlistName string
			var showHeader int
			_ = rows.Scan(&id, &name, &code, &layoutID, &playlistID, &orient, &res, &loc, &showHeader, &status, &layoutName, &aspect, &playlistName)
			displays = append(displays, map[string]interface{}{
				"id":            id,
				"name":          name,
				"code":          code,
				"layout_id":     layoutID,
				"playlist_id":   playlistID,
				"orientation":   orient,
				"resolution":    res,
				"location":      loc,
				"show_header":   showHeader,
				"status":        status,
				"layout_name":   layoutName,
				"aspect_ratio":  aspect,
				"playlist_name": playlistName,
			})
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{"displays": displays})
		return
	}

	if r.Method == http.MethodPost {
		var body struct {
			Name        string `json:"name"`
			Code        string `json:"code"`
			LayoutID    string `json:"layout_id"`
			PlaylistID  string `json:"playlist_id"`
			Orientation string `json:"orientation"`
			Resolution  string `json:"resolution"`
			Location    string `json:"location"`
			ShowHeader  *bool  `json:"show_header"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.Code == "" {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Nome e código da tela são obrigatórios."})
			return
		}
		id := newUUID()
		code := strings.ToUpper(strings.TrimSpace(body.Code))
		showH := 1
		if body.ShowHeader != nil && !*body.ShowHeader {
			showH = 0
		}
		if body.LayoutID == "" {
			body.LayoutID = "layout-corporate-news"
		}
		if body.PlaylistID == "" {
			body.PlaylistID = "playlist-default"
		}
		if body.Orientation == "" {
			body.Orientation = "landscape"
		}
		if body.Resolution == "" {
			body.Resolution = "1920x1080"
		}
		_, err := db.Exec(`
			INSERT INTO displays (id, name, code, layout_id, playlist_id, orientation, resolution, location, show_header, status)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'offline')
		`, id, strings.TrimSpace(body.Name), code, body.LayoutID, body.PlaylistID, body.Orientation, body.Resolution, body.Location, showH)
		if err != nil {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		jsonResponse(w, http.StatusCreated, map[string]interface{}{
			"message": "Tela cadastrada com sucesso.",
			"display": map[string]interface{}{"id": id, "name": body.Name, "code": code},
		})
	}
}

func handleDisplayByIDOrAction(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/displays/")
	if strings.HasSuffix(trimmed, "/reload") && r.Method == http.MethodPost {
		code := strings.ToUpper(strings.TrimSuffix(trimmed, "/reload"))
		hub.BroadcastScreenReload(code)
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Sinal de recarregamento transmitido."})
		return
	}

	id := trimmed
	if r.Method == http.MethodGet {
		var dID, name, code, layoutID, playlistID, orient, res, loc, status string
		var showHeader int
		err := db.QueryRow(`
			SELECT id, name, code, COALESCE(layout_id,''), COALESCE(playlist_id,''),
			       orientation, COALESCE(resolution,'1920x1080'), COALESCE(location,''), show_header, status
			FROM displays WHERE id = ?
		`, id).Scan(&dID, &name, &code, &layoutID, &playlistID, &orient, &res, &loc, &showHeader, &status)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": "Tela não encontrada."})
			return
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"display": map[string]interface{}{
				"id":          dID,
				"name":        name,
				"code":        code,
				"layout_id":   layoutID,
				"playlist_id": playlistID,
				"orientation": orient,
				"resolution":  res,
				"location":    loc,
				"show_header": showHeader,
				"status":      status,
			},
		})
		return
	}

	if r.Method == http.MethodPut {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		var name, code, layoutID, playlistID, orient, res, loc string
		var showHeader int
		err := db.QueryRow(`
			SELECT name, code, COALESCE(layout_id,''), COALESCE(playlist_id,''),
			       orientation, COALESCE(resolution,'1920x1080'), COALESCE(location,''), show_header
			FROM displays WHERE id = ?
		`, id).Scan(&name, &code, &layoutID, &playlistID, &orient, &res, &loc, &showHeader)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": "Tela não encontrada."})
			return
		}
		oldCode := code
		if v, ok := body["name"].(string); ok && v != "" {
			name = strings.TrimSpace(v)
		}
		if v, ok := body["code"].(string); ok && v != "" {
			code = strings.ToUpper(strings.TrimSpace(v))
		}
		if v, ok := body["layout_id"].(string); ok && v != "" {
			layoutID = v
		}
		if v, ok := body["playlist_id"].(string); ok && v != "" {
			playlistID = v
		}
		if v, ok := body["orientation"].(string); ok && v != "" {
			orient = v
		}
		if v, ok := body["resolution"].(string); ok && v != "" {
			res = v
		}
		if v, ok := body["location"].(string); ok {
			loc = v
		}
		if v, ok := body["show_header"].(bool); ok {
			if v {
				showHeader = 1
			} else {
				showHeader = 0
			}
		}
		_, _ = db.Exec(`
			UPDATE displays
			SET name=?, code=?, layout_id=?, playlist_id=?, orientation=?, resolution=?, location=?, show_header=?, updated_at=CURRENT_TIMESTAMP
			WHERE id=?
		`, name, code, layoutID, playlistID, orient, res, loc, showHeader, id)

		hub.BroadcastScreenReload(oldCode)
		if code != oldCode {
			hub.BroadcastScreenReload(code)
		}
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Tela atualizada com sucesso."})
		return
	}

	if r.Method == http.MethodDelete {
		_, _ = db.Exec(`DELETE FROM displays WHERE id = ?`, id)
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Tela removida com sucesso."})
	}
}

func handleDisplayByCode(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(strings.TrimPrefix(r.URL.Path, "/api/displays/code/"))
	if code == "" {
		code = "TV-01"
	}

	var id, name, dCode, layoutID, playlistID, orient, res, loc, status, layoutName, aspect, configJSON string
	var showHeader int
	err := db.QueryRow(`
		SELECT d.id, d.name, d.code, COALESCE(d.layout_id,''), COALESCE(d.playlist_id,''),
		       d.orientation, COALESCE(d.resolution,'1920x1080'), COALESCE(d.location,''), d.show_header, d.status,
		       COALESCE(l.name,''), COALESCE(l.aspect_ratio,'16:9'), COALESCE(l.config_json,'{}')
		FROM displays d
		LEFT JOIN layouts l ON d.layout_id = l.id
		WHERE UPPER(d.code) = ?
	`, code).Scan(&id, &name, &dCode, &layoutID, &playlistID, &orient, &res, &loc, &showHeader, &status, &layoutName, &aspect, &configJSON)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "Tela não encontrada."})
		return
	}

	var layoutConfig map[string]interface{}
	_ = json.Unmarshal([]byte(configJSON), &layoutConfig)

	if playlistID == "" {
		_ = db.QueryRow(`SELECT id FROM playlists LIMIT 1`).Scan(&playlistID)
	}
	var playlistName string
	_ = db.QueryRow(`SELECT name FROM playlists WHERE id = ?`, playlistID).Scan(&playlistName)

	itemRows, _ := db.Query(`
		SELECT pi.id, pi.playlist_id, COALESCE(pi.media_id,''), COALESCE(pi.widget_type,''),
		       pi.order_num, pi.duration_seconds, pi.is_active,
		       COALESCE(m.filename,''), COALESCE(m.original_name,''), COALESCE(m.media_type,'image')
		FROM playlist_items pi
		LEFT JOIN media m ON pi.media_id = m.id
		WHERE pi.playlist_id = ? AND pi.is_active = 1
		ORDER BY pi.order_num ASC
	`, playlistID)
	items := []map[string]interface{}{}
	if itemRows != nil {
		defer itemRows.Close()
		for itemRows.Next() {
			var piID, plID, mID, wType, fn, origName, mType string
			var orderNum, dur, active int
			_ = itemRows.Scan(&piID, &plID, &mID, &wType, &orderNum, &dur, &active, &fn, &origName, &mType)
			items = append(items, map[string]interface{}{
				"id":               piID,
				"playlist_id":      plID,
				"media_id":         mID,
				"widget_type":      wType,
				"order_num":        orderNum,
				"duration_seconds": dur,
				"is_active":        active,
				"filename":         fn,
				"original_name":    origName,
				"media_type":       mType,
			})
		}
	}

	settings := map[string]string{}
	sRows, _ := db.Query(`SELECT key, value FROM system_settings`)
	if sRows != nil {
		defer sRows.Close()
		for sRows.Next() {
			var k, v string
			_ = sRows.Scan(&k, &v)
			settings[k] = v
		}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"display": map[string]interface{}{
			"id":          id,
			"name":        name,
			"code":        dCode,
			"layout_id":   layoutID,
			"playlist_id": playlistID,
			"orientation": orient,
			"resolution":  res,
			"location":    loc,
			"show_header": showHeader != 0,
			"status":      status,
		},
		"layout": map[string]interface{}{
			"id":           layoutID,
			"name":         layoutName,
			"aspect_ratio": aspect,
			"config":       layoutConfig,
		},
		"playlist": map[string]interface{}{
			"id":    playlistID,
			"name":  playlistName,
			"items": items,
		},
		"settings": settings,
	})
}

// ============================================================================
// LAYOUTS
// ============================================================================
func handleLayouts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		rows, _ := db.Query(`SELECT id, name, aspect_ratio, COALESCE(description,''), config_json FROM layouts ORDER BY name ASC`)
		layouts := []map[string]interface{}{}
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var id, name, aspect, desc, cfgJSON string
				_ = rows.Scan(&id, &name, &aspect, &desc, &cfgJSON)
				var cfgObj interface{}
				_ = json.Unmarshal([]byte(cfgJSON), &cfgObj)
				layouts = append(layouts, map[string]interface{}{
					"id":           id,
					"name":         name,
					"aspect_ratio": aspect,
					"description":  desc,
					"config":       cfgObj,
				})
			}
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{"layouts": layouts})
		return
	}

	if r.Method == http.MethodPost {
		var body struct {
			Name        string      `json:"name"`
			AspectRatio string      `json:"aspect_ratio"`
			Description string      `json:"description"`
			Config      interface{} `json:"config"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Nome e configuração do layout são obrigatórios."})
			return
		}
		id := newUUID()
		cfgBytes, _ := json.Marshal(body.Config)
		if body.AspectRatio == "" {
			body.AspectRatio = "16:9"
		}
		_, _ = db.Exec(`INSERT INTO layouts (id, name, aspect_ratio, description, config_json) VALUES (?, ?, ?, ?, ?)`,
			id, body.Name, body.AspectRatio, body.Description, string(cfgBytes))
		jsonResponse(w, http.StatusCreated, map[string]interface{}{
			"message": "Layout criado com sucesso.",
			"layout":  map[string]interface{}{"id": id, "name": body.Name, "aspect_ratio": body.AspectRatio, "config": body.Config},
		})
	}
}

func handleLayoutByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/layouts/")
	if r.Method == http.MethodPut {
		var body struct {
			Name        string      `json:"name"`
			AspectRatio string      `json:"aspect_ratio"`
			Description string      `json:"description"`
			Config      interface{} `json:"config"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		cfgBytes, _ := json.Marshal(body.Config)
		_, _ = db.Exec(`UPDATE layouts SET name=?, aspect_ratio=?, description=?, config_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
			body.Name, body.AspectRatio, body.Description, string(cfgBytes), id)
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Layout atualizado com sucesso."})
		return
	}
	if r.Method == http.MethodDelete {
		_, _ = db.Exec(`DELETE FROM layouts WHERE id = ?`, id)
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Layout removido com sucesso."})
	}
}

// ============================================================================
// PLAYLISTS
// ============================================================================
func handlePlaylists(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		rows, _ := db.Query(`
			SELECT p.id, p.name, COALESCE(p.description,''), COUNT(pi.id) as item_count
			FROM playlists p
			LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
			GROUP BY p.id
			ORDER BY p.name ASC
		`)
		playlists := []map[string]interface{}{}
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var id, name, desc string
				var cnt int
				_ = rows.Scan(&id, &name, &desc, &cnt)
				playlists = append(playlists, map[string]interface{}{
					"id":          id,
					"name":        name,
					"description": desc,
					"item_count":  cnt,
				})
			}
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{"playlists": playlists})
		return
	}
	if r.Method == http.MethodPost {
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := newUUID()
		_, _ = db.Exec(`INSERT INTO playlists (id, name, description) VALUES (?, ?, ?)`, id, body.Name, body.Description)
		jsonResponse(w, http.StatusCreated, map[string]interface{}{
			"message":  "Playlist criada com sucesso.",
			"playlist": map[string]interface{}{"id": id, "name": body.Name, "description": body.Description},
		})
	}
}

func handlePlaylistByIDOrSubroute(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/playlists/")
	if strings.HasSuffix(trimmed, "/items") && r.Method == http.MethodPost {
		playlistID := strings.TrimSuffix(trimmed, "/items")
		var body struct {
			MediaID         string `json:"media_id"`
			WidgetType      string `json:"widget_type"`
			DurationSeconds int    `json:"duration_seconds"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.DurationSeconds <= 0 {
			body.DurationSeconds = 10
		}
		var maxOrder int
		_ = db.QueryRow(`SELECT COALESCE(MAX(order_num), 0) FROM playlist_items WHERE playlist_id = ?`, playlistID).Scan(&maxOrder)
		itemID := newUUID()
		_, _ = db.Exec(`
			INSERT INTO playlist_items (id, playlist_id, media_id, widget_type, order_num, duration_seconds, is_active)
			VALUES (?, ?, ?, ?, ?, ?, 1)
		`, itemID, playlistID, body.MediaID, body.WidgetType, maxOrder+1, body.DurationSeconds)
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusCreated, map[string]string{"message": "Item adicionado à playlist com sucesso."})
		return
	}

	if strings.HasSuffix(trimmed, "/reorder") && r.Method == http.MethodPost {
		playlistID := strings.TrimSuffix(trimmed, "/reorder")
		var body struct {
			ItemIDs []string `json:"itemIds"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		for i, itemID := range body.ItemIDs {
			_, _ = db.Exec(`UPDATE playlist_items SET order_num = ? WHERE id = ? AND playlist_id = ?`, i+1, itemID, playlistID)
		}
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Itens reordenados com sucesso."})
		return
	}

	id := trimmed
	if r.Method == http.MethodGet {
		var name, desc string
		err := db.QueryRow(`SELECT name, COALESCE(description,'') FROM playlists WHERE id = ?`, id).Scan(&name, &desc)
		if err != nil {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": "Playlist não encontrada."})
			return
		}
		rows, _ := db.Query(`
			SELECT pi.id, pi.playlist_id, COALESCE(pi.media_id,''), COALESCE(pi.widget_type,''),
			       pi.order_num, pi.duration_seconds, pi.is_active,
			       COALESCE(m.filename,''), COALESCE(m.original_name,''), COALESCE(m.media_type,'image')
			FROM playlist_items pi
			LEFT JOIN media m ON pi.media_id = m.id
			WHERE pi.playlist_id = ?
			ORDER BY pi.order_num ASC
		`, id)
		items := []map[string]interface{}{}
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var piID, plID, mID, wType, fn, origName, mType string
				var orderNum, dur, active int
				_ = rows.Scan(&piID, &plID, &mID, &wType, &orderNum, &dur, &active, &fn, &origName, &mType)
				items = append(items, map[string]interface{}{
					"id":               piID,
					"playlist_id":      plID,
					"media_id":         mID,
					"widget_type":      wType,
					"order_num":        orderNum,
					"duration_seconds": dur,
					"is_active":        active,
					"filename":         fn,
					"original_name":    origName,
					"media_type":       mType,
				})
			}
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"playlist": map[string]interface{}{
				"id":          id,
				"name":        name,
				"description": desc,
				"items":       items,
			},
		})
		return
	}

	if r.Method == http.MethodDelete {
		_, _ = db.Exec(`DELETE FROM playlists WHERE id = ?`, id)
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Playlist removida com sucesso."})
	}
}

func handlePlaylistItemByID(w http.ResponseWriter, r *http.Request) {
	itemID := strings.TrimPrefix(r.URL.Path, "/api/playlists/items/")
	if r.Method == http.MethodPut {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if dur, ok := body["duration_seconds"].(float64); ok {
			_, _ = db.Exec(`UPDATE playlist_items SET duration_seconds = ? WHERE id = ?`, int(dur), itemID)
		}
		if active, ok := body["is_active"].(bool); ok {
			actInt := 0
			if active {
				actInt = 1
			}
			_, _ = db.Exec(`UPDATE playlist_items SET is_active = ? WHERE id = ?`, actInt, itemID)
		}
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Item atualizado com sucesso."})
		return
	}
	if r.Method == http.MethodDelete {
		_, _ = db.Exec(`DELETE FROM playlist_items WHERE id = ?`, itemID)
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Item removido da playlist com sucesso."})
	}
}

// ============================================================================
// MEDIA
// ============================================================================
func handleMedia(w http.ResponseWriter, r *http.Request) {
	rows, _ := db.Query(`SELECT id, filename, original_name, media_type, mime_type, file_size, duration_seconds FROM media ORDER BY created_at DESC`)
	mediaList := []map[string]interface{}{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, fn, orig, mType, mime string
			var size, dur int
			_ = rows.Scan(&id, &fn, &orig, &mType, &mime, &size, &dur)
			mediaList = append(mediaList, map[string]interface{}{
				"id":               id,
				"filename":         fn,
				"original_name":    orig,
				"media_type":       mType,
				"mime_type":        mime,
				"file_size":        size,
				"duration_seconds": dur,
			})
		}
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"media": mediaList})
}

func handleMediaUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_ = r.ParseMultipartForm(100 << 20)
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Nenhum arquivo enviado."})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("%d-%s%s", time.Now().UnixMilli(), newUUID()[:8], ext)
	dstPath := filepath.Join(cfg.MediaPath, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		jsonResponse(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	written, _ := io.Copy(dst, file)
	dst.Close()

	mediaType := "image"
	mimeType := header.Header.Get("Content-Type")
	if ext == ".mp4" || ext == ".webm" || ext == ".ogg" || strings.HasPrefix(mimeType, "video/") {
		mediaType = "video"
	}
	id := newUUID()
	dur := 10
	if dStr := r.FormValue("duration_seconds"); dStr != "" {
		if dVal, err := strconv.Atoi(dStr); err == nil && dVal > 0 {
			dur = dVal
		}
	}
	customName := r.FormValue("name")
	if customName == "" {
		customName = header.Filename
	}

	_, _ = db.Exec(`
		INSERT INTO media (id, filename, original_name, media_type, mime_type, file_size, duration_seconds, storage_path)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, id, filename, customName, mediaType, mimeType, written, dur, filename)

	mediaObj := map[string]interface{}{
		"id":               id,
		"filename":         filename,
		"original_name":    customName,
		"media_type":       mediaType,
		"mime_type":        mimeType,
		"file_size":        written,
		"duration_seconds": dur,
	}
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"message": "Arquivo enviado com sucesso.",
		"media":   mediaObj,
		"url":     "/media/" + filename,
	})
}

func handleMediaByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/media/")
	if r.Method == http.MethodPut {
		var body struct {
			OriginalName    string `json:"original_name"`
			DurationSeconds int    `json:"duration_seconds"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.DurationSeconds <= 0 {
			body.DurationSeconds = 10
		}
		_, _ = db.Exec(`UPDATE media SET original_name = ?, duration_seconds = ? WHERE id = ?`, body.OriginalName, body.DurationSeconds, id)
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Mídia atualizada com sucesso."})
		return
	}
	if r.Method == http.MethodDelete {
		_, _ = db.Exec(`DELETE FROM media WHERE id = ?`, id)
		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Arquivo de mídia removido com sucesso."})
	}
}

func handleMediaStream(w http.ResponseWriter, r *http.Request) {
	filename := strings.TrimPrefix(r.URL.Path, "/api/media/stream/")
	http.ServeFile(w, r, filepath.Join(cfg.MediaPath, filename))
}

// ============================================================================
// QUEUE (CHAMADOR DE SENHAS, FILA DE ESPERA, GUICHÊS E ATENDIMENTOS)
// ============================================================================
func handleQueueRecent(w http.ResponseWriter, r *http.Request) {
	calls := queryQueueList(`SELECT id, ticket_number, location, service_type, COALESCE(service_name,'Atendimento Geral'), COALESCE(patient_name,''), called_at, status FROM queue_calls WHERE status = 'active' ORDER BY called_at DESC LIMIT 12`)
	waiting := queryQueueList(`SELECT id, ticket_number, location, service_type, COALESCE(service_name,'Atendimento Geral'), COALESCE(patient_name,''), called_at, status FROM queue_calls WHERE status = 'waiting' ORDER BY CASE WHEN service_type = 'Prioritário' THEN 0 ELSE 1 END ASC, called_at ASC`)

	desks := []map[string]interface{}{}
	dRows, _ := db.Query(`SELECT id, name, category, is_active FROM service_desks WHERE is_active = 1 ORDER BY category ASC, name ASC`)
	if dRows != nil {
		defer dRows.Close()
		for dRows.Next() {
			var id, name, cat string
			var active int
			_ = dRows.Scan(&id, &name, &cat, &active)
			desks = append(desks, map[string]interface{}{"id": id, "name": name, "category": cat, "is_active": active})
		}
	}

	services := []map[string]interface{}{}
	sRows, _ := db.Query(`SELECT id, name, prefix, is_priority, current_seq FROM service_types ORDER BY is_priority DESC, name ASC`)
	if sRows != nil {
		defer sRows.Close()
		for sRows.Next() {
			var id, name, prefix string
			var prio, seq int
			_ = sRows.Scan(&id, &name, &prefix, &prio, &seq)
			services = append(services, map[string]interface{}{"id": id, "name": name, "prefix": prefix, "is_priority": prio, "current_seq": seq})
		}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"calls":    calls,
		"waiting":  waiting,
		"desks":    desks,
		"services": services,
	})
}

func queryQueueList(q string) []map[string]interface{} {
	list := []map[string]interface{}{}
	rows, _ := db.Query(q)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var id, ticket, loc, sType, sName, pat, calledAt, status string
			_ = rows.Scan(&id, &ticket, &loc, &sType, &sName, &pat, &calledAt, &status)
			list = append(list, map[string]interface{}{
				"id":            id,
				"ticket_number": ticket,
				"location":      loc,
				"service_type":  sType,
				"service_name":  sName,
				"patient_name":  pat,
				"called_at":     calledAt,
				"status":        status,
			})
		}
	}
	return list
}

func handleQueueGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ServiceID         string `json:"service_id"`
		PatientName       string `json:"patient_name"`
		PreferredLocation string `json:"preferred_location"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	var srvID, srvName, prefix string
	var isPrio, seq int
	err := db.QueryRow(`SELECT id, name, prefix, is_priority, current_seq FROM service_types WHERE id = ?`, body.ServiceID).
		Scan(&srvID, &srvName, &prefix, &isPrio, &seq)
	if err != nil {
		_ = db.QueryRow(`SELECT id, name, prefix, is_priority, current_seq FROM service_types LIMIT 1`).
			Scan(&srvID, &srvName, &prefix, &isPrio, &seq)
	}

	nextSeq := seq + 1
	_, _ = db.Exec(`UPDATE service_types SET current_seq = ? WHERE id = ?`, nextSeq, srvID)
	if prefix == "" {
		prefix = "A"
	}
	if srvName == "" {
		srvName = "Atendimento Geral"
	}
	ticketNumber := fmt.Sprintf("%s-%03d", prefix, nextSeq)
	serviceType := "Normal"
	if isPrio != 0 {
		serviceType = "Prioritário"
	}
	loc := strings.TrimSpace(body.PreferredLocation)
	if loc == "" {
		loc = "Aguardando Guichê/Consultório"
	}

	id := newUUID()
	now := time.Now().UTC().Format(time.RFC3339)
	_, _ = db.Exec(`
		INSERT INTO queue_calls (id, ticket_number, location, service_type, service_name, patient_name, status, created_at, called_at)
		VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?)
	`, id, ticketNumber, loc, serviceType, srvName, strings.TrimSpace(body.PatientName), now, now)

	ticket := map[string]interface{}{
		"id":            id,
		"ticket_number": ticketNumber,
		"location":      loc,
		"service_type":  serviceType,
		"service_name":  srvName,
		"patient_name":  strings.TrimSpace(body.PatientName),
		"status":        "waiting",
		"called_at":     now,
	}
	hub.BroadcastEvent("queue:updated", map[string]interface{}{"ticket": ticket})
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"message": fmt.Sprintf("Senha %s gerada com sucesso!", ticketNumber),
		"ticket":  ticket,
	})
}

func handleQueueCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		TicketID     string `json:"ticket_id"`
		CallNext     bool   `json:"call_next"`
		TicketNumber string `json:"ticket_number"`
		Location     string `json:"location"`
		ServiceType  string `json:"service_type"`
		ServiceName  string `json:"service_name"`
		PatientName  string `json:"patient_name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if strings.TrimSpace(body.Location) == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Local / Guichê / Consultório é obrigatório."})
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if body.TicketID != "" || body.CallNext {
		var id, ticketNum, sType, sName, pat string
		var err error
		if body.TicketID != "" {
			err = db.QueryRow(`SELECT id, ticket_number, service_type, COALESCE(service_name,'Atendimento Geral'), COALESCE(patient_name,'') FROM queue_calls WHERE id = ?`, body.TicketID).
				Scan(&id, &ticketNum, &sType, &sName, &pat)
		} else {
			err = db.QueryRow(`SELECT id, ticket_number, service_type, COALESCE(service_name,'Atendimento Geral'), COALESCE(patient_name,'') FROM queue_calls WHERE status = 'waiting' ORDER BY CASE WHEN service_type = 'Prioritário' THEN 0 ELSE 1 END ASC, called_at ASC LIMIT 1`).
				Scan(&id, &ticketNum, &sType, &sName, &pat)
		}
		if err != nil {
			jsonResponse(w, http.StatusNotFound, map[string]string{"error": "Nenhuma senha aguardando na fila de espera."})
			return
		}
		if body.ServiceName != "" {
			sName = body.ServiceName
		}
		if body.PatientName != "" {
			pat = body.PatientName
		}
		_, _ = db.Exec(`UPDATE queue_calls SET location=?, service_name=?, patient_name=?, status='active', called_at=? WHERE id=?`,
			strings.TrimSpace(body.Location), sName, pat, now, id)

		called := map[string]interface{}{
			"id":            id,
			"ticket_number": ticketNum,
			"location":      strings.TrimSpace(body.Location),
			"service_type":  sType,
			"service_name":  sName,
			"patient_name":  pat,
			"status":        "active",
			"called_at":     now,
		}
		hub.BroadcastQueueCall(called)
		jsonResponse(w, http.StatusCreated, map[string]interface{}{
			"message": fmt.Sprintf("Senha %s chamada para %s!", ticketNum, body.Location),
			"call":    called,
		})
		return
	}

	if strings.TrimSpace(body.TicketNumber) == "" {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Número da senha e local/consultório são obrigatórios."})
		return
	}
	id := newUUID()
	if body.ServiceType == "" {
		body.ServiceType = "Normal"
	}
	if body.ServiceName == "" {
		body.ServiceName = "Atendimento Geral"
	}
	ticketNum := strings.ToUpper(strings.TrimSpace(body.TicketNumber))
	loc := strings.TrimSpace(body.Location)
	_, _ = db.Exec(`
		INSERT INTO queue_calls (id, ticket_number, location, service_type, service_name, patient_name, status, called_at)
		VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
	`, id, ticketNum, loc, body.ServiceType, body.ServiceName, strings.TrimSpace(body.PatientName), now)

	called := map[string]interface{}{
		"id":            id,
		"ticket_number": ticketNum,
		"location":      loc,
		"service_type":  body.ServiceType,
		"service_name":  body.ServiceName,
		"patient_name":  strings.TrimSpace(body.PatientName),
		"status":        "active",
		"called_at":     now,
	}
	hub.BroadcastQueueCall(called)
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"message": "Senha chamada com sucesso.",
		"call":    called,
	})
}

func handleQueueRecall(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/queue/recall/")
	now := time.Now().UTC().Format(time.RFC3339)
	_, _ = db.Exec(`UPDATE queue_calls SET called_at = ? WHERE id = ?`, now, id)
	var ticketNum, loc, sType, sName, pat string
	err := db.QueryRow(`SELECT ticket_number, location, service_type, COALESCE(service_name,'Atendimento Geral'), COALESCE(patient_name,'') FROM queue_calls WHERE id = ?`, id).
		Scan(&ticketNum, &loc, &sType, &sName, &pat)
	if err != nil {
		jsonResponse(w, http.StatusNotFound, map[string]string{"error": "Senha não encontrada."})
		return
	}
	called := map[string]interface{}{
		"id":            id,
		"ticket_number": ticketNum,
		"location":      loc,
		"service_type":  sType,
		"service_name":  sName,
		"patient_name":  pat,
		"status":        "active",
		"called_at":     now,
	}
	hub.BroadcastQueueCall(called)
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"message": fmt.Sprintf("Senha %s rechamada no painel!", ticketNum),
		"call":    called,
	})
}

func handleQueueDeskCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		return
	}
	var body struct {
		Name     string `json:"name"`
		Category string `json:"category"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Category == "" {
		body.Category = "Consultório"
	}
	id := newUUID()
	_, _ = db.Exec(`INSERT INTO service_desks (id, name, category, is_active) VALUES (?, ?, ?, 1)`, id, strings.TrimSpace(body.Name), body.Category)
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"message": "Guichê/Consultório cadastrado.",
		"desk":    map[string]interface{}{"id": id, "name": body.Name, "category": body.Category, "is_active": 1},
	})
}

func handleQueueDeskDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/queue/desks/")
	_, _ = db.Exec(`DELETE FROM service_desks WHERE id = ?`, id)
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Guichê/Consultório removido."})
}

func handleQueueServiceCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		return
	}
	var body struct {
		Name       string `json:"name"`
		Prefix     string `json:"prefix"`
		IsPriority bool   `json:"is_priority"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	id := newUUID()
	prio := 0
	if body.IsPriority {
		prio = 1
	}
	_, _ = db.Exec(`INSERT INTO service_types (id, name, prefix, is_priority, current_seq) VALUES (?, ?, ?, ?, 100)`,
		id, strings.TrimSpace(body.Name), strings.ToUpper(strings.TrimSpace(body.Prefix)), prio)
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"message": "Tipo de atendimento cadastrado.",
		"service": map[string]interface{}{"id": id, "name": body.Name, "prefix": body.Prefix, "is_priority": prio},
	})
}

func handleQueueServiceDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/queue/services/")
	_, _ = db.Exec(`DELETE FROM service_types WHERE id = ?`, id)
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Tipo de atendimento removido."})
}

func handleQueueClear(w http.ResponseWriter, r *http.Request) {
	_, _ = db.Exec(`DELETE FROM queue_calls`)
	hub.BroadcastEvent("queue:updated", map[string]bool{"cleared": true})
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Histórico e fila de senhas limpos com sucesso."})
}

// ============================================================================
// SETTINGS
// ============================================================================
func handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		rows, _ := db.Query(`SELECT key, value, COALESCE(description,'') FROM system_settings`)
		settings := map[string]string{}
		list := []map[string]string{}
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var k, v, d string
				_ = rows.Scan(&k, &v, &d)
				settings[k] = v
				list = append(list, map[string]string{"key": k, "value": v, "description": d})
			}
		}
		jsonResponse(w, http.StatusOK, map[string]interface{}{"settings": settings, "list": list})
		return
	}

	if r.Method == http.MethodPut {
		var raw map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&raw); err != nil || len(raw) == 0 {
			jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Objeto de configurações inválido."})
			return
		}
		target := raw
		if nested, ok := raw["settings"].(map[string]interface{}); ok {
			target = nested
		}
		for k, v := range target {
			valStr := fmt.Sprintf("%v", v)
			if v == nil {
				valStr = ""
			}
			_, _ = db.Exec(`
				INSERT INTO system_settings (key, value, updated_at)
				VALUES (?, ?, CURRENT_TIMESTAMP)
				ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
			`, k, valStr)
		}
		rssMu.Lock()
		rssCache = map[string]cachedRss{}
		rssMu.Unlock()

		hub.BroadcastScreenReload()
		jsonResponse(w, http.StatusOK, map[string]string{"message": "Configurações atualizadas com sucesso."})
	}
}

func handleSettingsReloadScreens(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ScreenCode string `json:"screenCode"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	hub.BroadcastScreenReload(body.ScreenCode)
	jsonResponse(w, http.StatusOK, map[string]string{"message": "Sinal de recarregamento enviado para as telas."})
}

// ============================================================================
// WIDGETS (WEATHER & RSS WITH GZIP DECOMPRESSION)
// ============================================================================
func handleWeather(w http.ResponseWriter, r *http.Request) {
	var city, lat, lon string
	_ = db.QueryRow(`SELECT value FROM system_settings WHERE key = 'weather_city'`).Scan(&city)
	_ = db.QueryRow(`SELECT value FROM system_settings WHERE key = 'weather_latitude'`).Scan(&lat)
	_ = db.QueryRow(`SELECT value FROM system_settings WHERE key = 'weather_longitude'`).Scan(&lon)
	if city == "" {
		city = "São Paulo"
	}
	if lat == "" {
		lat = "-23.5505"
	}
	if lon == "" {
		lon = "-46.6333"
	}

	url := fmt.Sprintf("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto", lat, lon)
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var data struct {
			Current struct {
				Temperature2m       float64 `json:"temperature_2m"`
				ApparentTemperature float64 `json:"apparent_temperature"`
				RelativeHumidity2m  int     `json:"relative_humidity_2m"`
				WindSpeed10m        float64 `json:"wind_speed_10m"`
				WeatherCode         int     `json:"weather_code"`
			} `json:"current"`
		}
		if json.NewDecoder(resp.Body).Decode(&data) == nil {
			code := data.Current.WeatherCode
			condition, icon := "Céu Limpo", "☀️"
			switch {
			case code >= 1 && code <= 3:
				condition, icon = "Parcialmente Nublado", "⛅"
			case code >= 45 && code <= 48:
				condition, icon = "Nevoeiro", "🌫️"
			case code >= 51 && code <= 67:
				condition, icon = "Chuva Leve", "🌧️"
			case code >= 71 && code <= 77:
				condition, icon = "Frio Intenso", "❄️"
			case code >= 80 && code <= 82:
				condition, icon = "Pancadas de Chuva", "🌦️"
			case code >= 95:
				condition, icon = "Tempestade", "⛈️"
			}
			jsonResponse(w, http.StatusOK, map[string]interface{}{
				"city":                 city,
				"temperature":          int(math.Round(data.Current.Temperature2m)),
				"apparent_temperature": int(math.Round(data.Current.ApparentTemperature)),
				"humidity":             data.Current.RelativeHumidity2m,
				"wind_speed":           data.Current.WindSpeed10m,
				"condition":            condition,
				"icon":                 icon,
			})
			return
		}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"city":                 city,
		"temperature":          24,
		"apparent_temperature": 25,
		"humidity":             65,
		"wind_speed":           12,
		"condition":            "Parcialmente Nublado",
		"icon":                 "⛅",
	})
}

var (
	reItem  = regexp.MustCompile(`(?is)<item[^>]*>(.*?)</item>`)
	reTitle = regexp.MustCompile(`(?is)<title[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))</title>`)
	reLink  = regexp.MustCompile(`(?is)<link[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))</link>`)
)

func handleRSS(w http.ResponseWriter, r *http.Request) {
	feedURL := r.URL.Query().Get("url")
	if feedURL == "" {
		_ = db.QueryRow(`SELECT value FROM system_settings WHERE key = 'rss_feed_url'`).Scan(&feedURL)
	}
	if feedURL == "" {
		feedURL = "https://g1.globo.com/rss/g1/"
	}

	rssMu.Lock()
	if cached, ok := rssCache[feedURL]; ok && time.Now().Before(cached.ExpiresAt) {
		rssMu.Unlock()
		jsonResponse(w, http.StatusOK, map[string]interface{}{"feedUrl": feedURL, "items": cached.Items})
		return
	}
	rssMu.Unlock()

	client := &http.Client{Timeout: 8 * time.Second}
	req, _ := http.NewRequest("GET", feedURL, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TVCorporativa/1.3.1")
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml, */*")

	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var reader io.Reader = resp.Body
		if strings.Contains(strings.ToLower(resp.Header.Get("Content-Encoding")), "gzip") {
			if gz, gzErr := gzip.NewReader(resp.Body); gzErr == nil {
				defer gz.Close()
				reader = gz
			}
		}
		bodyBytes, _ := io.ReadAll(reader)
		if len(bodyBytes) >= 2 && bodyBytes[0] == 0x1f && bodyBytes[1] == 0x8b {
			if gz, gzErr := gzip.NewReader(strings.NewReader(string(bodyBytes))); gzErr == nil {
				defer gz.Close()
				bodyBytes, _ = io.ReadAll(gz)
			}
		}

		xmlStr := string(bodyBytes)
		matches := reItem.FindAllStringSubmatch(xmlStr, 20)
		items := []map[string]string{}
		for _, m := range matches {
			block := m[1]
			titleMatch := reTitle.FindStringSubmatch(block)
			title := ""
			if len(titleMatch) > 2 {
				title = titleMatch[1]
				if title == "" {
					title = titleMatch[2]
				}
			}
			linkMatch := reLink.FindStringSubmatch(block)
			link := "#"
			if len(linkMatch) > 2 {
				link = linkMatch[1]
				if link == "" {
					link = linkMatch[2]
				}
			}
			title = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(title, "&amp;", "&"), "&quot;", `"`))
			if title != "" {
				items = append(items, map[string]string{
					"title":   title,
					"link":    strings.TrimSpace(link),
					"pubDate": time.Now().UTC().Format(time.RFC3339),
				})
			}
		}

		if len(items) > 0 {
			rssMu.Lock()
			rssCache[feedURL] = cachedRss{Items: items, ExpiresAt: time.Now().Add(5 * time.Minute)}
			rssMu.Unlock()
			jsonResponse(w, http.StatusOK, map[string]interface{}{"feedUrl": feedURL, "items": items})
			return
		}
	}

	fallback := []map[string]string{
		{"title": "Bem-vindo ao Sistema de TV Corporativa & Sinalização Digital (Go Engine)", "link": "#"},
		{"title": "Mantenha sua equipe e visitantes informados em tempo real com baixo consumo de recursos", "link": "#"},
		{"title": "Acompanhe os comunicados internos, previsão do tempo e chamadas de atendimento no painel", "link": "#"},
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"feedUrl": feedURL, "items": fallback})
}
