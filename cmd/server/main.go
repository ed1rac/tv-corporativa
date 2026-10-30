package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"

	"tv-corporativa/internal/config"
	"tv-corporativa/internal/websocket"
)

var (
	cfg *config.Config
	db  *sql.DB
	hub *websocket.Hub
)

func main() {
	cfg = config.Load()

	// Ensure directories exist
	os.MkdirAll(filepath.Dir(cfg.DBPath), 0755)
	os.MkdirAll(cfg.MediaPath, 0755)

	var err error
	db, err = sql.Open("sqlite3", cfg.DBPath+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		log.Fatalf("Erro ao conectar no banco SQLite: %v", err)
	}
	defer db.Close()

	initDatabase()

	hub = websocket.NewHub()
	go hub.Run()

	mux := http.NewServeMux()

	// Static routes
	mux.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(cfg.MediaPath))))
	mux.Handle("/css/", http.FileServer(http.Dir("public")))
	mux.Handle("/js/", http.FileServer(http.Dir("public")))
	mux.Handle("/sw.js", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/sw.js")
	}))

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

	// WebSockets
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websocket.ServeWs(hub, w, r)
	})

	// API Routes
	mux.HandleFunc("/api/health", handleHealth)
	mux.HandleFunc("/api/auth/login", handleLogin)
	mux.HandleFunc("/api/displays", handleDisplays)
	mux.HandleFunc("/api/displays/code/", handleDisplayByCode)
	mux.HandleFunc("/api/layouts", handleLayouts)
	mux.HandleFunc("/api/playlists", handlePlaylists)
	mux.HandleFunc("/api/media", handleMedia)
	mux.HandleFunc("/api/widgets/weather", handleWeather)
	mux.HandleFunc("/api/widgets/rss", handleRSS)
	mux.HandleFunc("/api/queue/recent", handleQueueRecent)
	mux.HandleFunc("/api/queue/call", handleQueueCall)

	// Server Start
	addr := ":" + cfg.Port
	log.Printf("==================================================")
	log.Printf("  🚀 TV Corporativa Engine em Go (v2.0-go)")
	log.Printf("==================================================")
	log.Printf("[Go Server] Rodando na porta %s", cfg.Port)
	log.Printf("[Painel Admin] Acesse http://localhost:%s/admin", cfg.Port)
	log.Printf("[Player TV]   Acesse http://localhost:%s/player?code=TV-01", cfg.Port)
	log.Printf("[Memória]     Consumo base estimado: ~15MB RAM", )

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

func initDatabase() {
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'operator'
	);
	CREATE TABLE IF NOT EXISTS displays (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		code TEXT UNIQUE NOT NULL,
		layout_id TEXT,
		orientation TEXT NOT NULL DEFAULT 'landscape',
		resolution TEXT DEFAULT '1920x1080',
		status TEXT NOT NULL DEFAULT 'offline'
	);
	CREATE TABLE IF NOT EXISTS layouts (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		aspect_ratio TEXT NOT NULL DEFAULT '16:9',
		description TEXT,
		config_json TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS queue_calls (
		id TEXT PRIMARY KEY,
		ticket_number TEXT NOT NULL,
		location TEXT NOT NULL,
		service_type TEXT NOT NULL,
		patient_name TEXT,
		called_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := db.Exec(query)
	if err != nil {
		log.Printf("[Database Init Error]: %v", err)
	}
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"engine":    "go",
		"version":   "2.0.0-go",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

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

	// Validate default credentials
	if (req.Username == "admin" && req.Password == "tvcorporativa") ||
		(req.Username == "edkallenn" && req.Password == "123456") {
		jsonResponse(w, http.StatusOK, map[string]interface{}{
			"message": "Autenticado com sucesso",
			"token":   "mock-jwt-token-go-" + req.Username,
			"user": map[string]string{
				"username": req.Username,
				"name":     strings.Title(req.Username),
				"role":     "admin",
			},
		})
		return
	}

	jsonResponse(w, http.StatusUnauthorized, map[string]string{"error": "Credenciais inválidas"})
}

func handleDisplays(w http.ResponseWriter, r *http.Request) {
	// Query displays
	displays := []map[string]interface{}{
		{"id": "d1", "code": "TV-01", "name": "TV Recepção Principal", "layout_name": "Notícias & TV Corporativa", "status": "online", "resolution": "1920x1080", "orientation": "landscape"},
		{"id": "d2", "code": "TV-02", "name": "TV Sala de Espera / Consultório", "layout_name": "Consultório & Chamada de Senhas", "status": "online", "resolution": "1920x1080", "orientation": "landscape"},
		{"id": "d3", "code": "TV-03", "name": "Totem Vertical Elevador", "layout_name": "Elevador / Totem Vertical (9:16)", "status": "offline", "resolution": "1080x1920", "orientation": "portrait"},
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"displays": displays})
}

func handleDisplayByCode(w http.ResponseWriter, r *http.Request) {
	code := strings.TrimPrefix(r.URL.Path, "/api/displays/code/")
	if code == "" {
		code = "TV-01"
	}

	layoutConfig := map[string]interface{}{
		"name":         "Notícias & TV Corporativa",
		"aspect_ratio": "16:9",
		"zones": []map[string]interface{}{
			{
				"id":     "zone_media",
				"name":   "Vídeo & Imagens",
				"type":   "PLAYLIST",
				"bounds": map[string]string{"top": "0%", "left": "0%", "width": "70%", "height": "90%"},
			},
			{
				"id":     "zone_sidebar",
				"name":   "Barra Lateral (Clima & Avisos)",
				"type":   "COMPOSITE",
				"bounds": map[string]string{"top": "0%", "left": "70%", "width": "30%", "height": "90%"},
				"sub_widgets": []map[string]string{
					{"type": "CLOCK", "height": "25%"},
					{"type": "WEATHER", "height": "35%"},
					{"type": "ANNOUNCEMENTS", "height": "40%"},
				},
			},
			{
				"id":     "zone_ticker",
				"name":   "Rodapé de Notícias (RSS)",
				"type":   "RSS_TICKER",
				"bounds": map[string]string{"top": "90%", "left": "0%", "width": "100%", "height": "10%"},
			},
		},
	}

	items := []map[string]interface{}{
		{"id": "1", "filename": "luds01.png", "media_type": "image", "duration_seconds": 8},
		{"id": "2", "filename": "mov_bbb.mp4", "media_type": "video", "duration_seconds": 10},
		{"id": "3", "filename": "luds02.png", "media_type": "image", "duration_seconds": 8},
		{"id": "4", "filename": "movie.mp4", "media_type": "video", "duration_seconds": 12},
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"display": map[string]string{
			"code":   code,
			"name":   "Tela " + code,
			"status": "online",
		},
		"layout": map[string]interface{}{
			"name":   "Layout Corporativo",
			"config": layoutConfig,
		},
		"playlist": map[string]interface{}{
			"items": items,
		},
		"settings": map[string]string{
			"weather_city": "São Paulo",
		},
	})
}

func handleLayouts(w http.ResponseWriter, r *http.Request) {
	layouts := []map[string]interface{}{
		{"id": "l1", "name": "Tela Cheia (16:9 / 9:16)", "aspect_ratio": "16:9", "description": "100% de área útil para mídias."},
		{"id": "l2", "name": "Notícias & TV Corporativa", "aspect_ratio": "16:9", "description": "Área de vídeo 70%, lateral de clima/hora e rodapé com ticker RSS."},
		{"id": "l3", "name": "Consultório & Chamada de Senhas", "aspect_ratio": "16:9", "description": "Vídeos educativos e chamada de senhas de atendimento com voz."},
		{"id": "l4", "name": "Elevador / Totem Vertical (9:16)", "aspect_ratio": "9:16", "description": "Layout vertical para totens e halls de elevadores."},
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"layouts": layouts})
}

func handlePlaylists(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"playlists": []map[string]interface{}{
			{"id": "p1", "name": "Programação Geral", "description": "Grade oficial da TV Corporativa"},
		},
	})
}

func handleMedia(w http.ResponseWriter, r *http.Request) {
	files, _ := os.ReadDir(cfg.MediaPath)
	var mediaList []map[string]interface{}
	for _, f := range files {
		if f.IsDir() || f.Name() == ".gitkeep" {
			continue
		}
		ext := strings.ToLower(filepath.Ext(f.Name()))
		mediaType := "image"
		if ext == ".mp4" || ext == ".webm" {
			mediaType = "video"
		}
		info, _ := f.Info()
		mediaList = append(mediaList, map[string]interface{}{
			"id":               f.Name(),
			"filename":         f.Name(),
			"original_name":    f.Name(),
			"media_type":       mediaType,
			"file_size":        info.Size(),
			"duration_seconds": 10,
		})
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"media": mediaList})
}

func handleWeather(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"city":                 "São Paulo",
		"temperature":          24,
		"apparent_temperature": 25,
		"humidity":             65,
		"condition":            "Parcialmente Nublado",
		"icon":                 "⛅",
	})
}

func handleRSS(w http.ResponseWriter, r *http.Request) {
	items := []map[string]string{
		{"title": "TV Corporativa (Go Engine): Alta performance com menos de 25MB de memória RAM", "link": "#"},
		{"title": "Comunicação interna ágil e integrada para toda a organização", "link": "#"},
		{"title": "Consulte o painel de atendimento para acompanhar sua senha", "link": "#"},
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"items": items})
}

func handleQueueRecent(w http.ResponseWriter, r *http.Request) {
	calls := []map[string]interface{}{
		{"ticket_number": "A-101", "location": "Consultório 01", "service_type": "Normal", "called_at": time.Now().Format(time.RFC3339)},
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"calls": calls})
}

func handleQueueCall(w http.ResponseWriter, r *http.Request) {
	var call map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&call); err != nil {
		jsonResponse(w, http.StatusBadRequest, map[string]string{"error": "Payload inválido"})
		return
	}
	call["called_at"] = time.Now().Format(time.RFC3339)

	// Broadcast via WebSocket
	hub.BroadcastEvent("queue:call", call)

	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"message": "Senha chamada com sucesso",
		"call":    call,
	})
}
