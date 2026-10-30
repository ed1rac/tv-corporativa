package config

import (
	"os"
)

type Config struct {
	Port         string
	DBPath       string
	MediaPath    string
	JWTSecret    string
	DefaultCity  string
	DefaultRSS   string
}

func Load() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "data/tv_corporativa.db"
	}

	mediaPath := os.Getenv("MEDIA_PATH")
	if mediaPath == "" {
		mediaPath = "media"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "tvcorporativa_secret_jwt_key_2026_super_secure"
	}

	return &Config{
		Port:        port,
		DBPath:      dbPath,
		MediaPath:   mediaPath,
		JWTSecret:   jwtSecret,
		DefaultCity: "São Paulo",
		DefaultRSS:  "https://g1.globo.com/rss/g1/",
	}
}
