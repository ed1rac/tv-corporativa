package websocket

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	Hub         *Hub
	Conn        *websocket.Conn
	Send        chan []byte
	DisplayCode string
}

type OutboundMessage struct {
	Payload           []byte
	TargetDisplayCode string
}

type Hub struct {
	Clients    map[*Client]bool
	Broadcast  chan OutboundMessage
	Register   chan *Client
	Unregister chan *Client
	DB         *sql.DB
	mu         sync.Mutex
}

func NewHub(db *sql.DB) *Hub {
	return &Hub{
		Broadcast:  make(chan OutboundMessage, 128),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Clients:    make(map[*Client]bool),
		DB:         db,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client] = true
			h.mu.Unlock()
		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				code := client.DisplayCode
				delete(h.Clients, client)
				close(client.Send)
				if code != "" && h.DB != nil {
					_, _ = h.DB.Exec(`UPDATE displays SET status = 'offline' WHERE UPPER(code) = UPPER(?)`, code)
				}
			}
			h.mu.Unlock()
		case msg := <-h.Broadcast:
			h.mu.Lock()
			for client := range h.Clients {
				if msg.TargetDisplayCode != "" && !strings.EqualFold(client.DisplayCode, msg.TargetDisplayCode) {
					continue
				}
				select {
				case client.Send <- msg.Payload:
				default:
					close(client.Send)
					delete(h.Clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) BroadcastEvent(eventType string, data interface{}, targetDisplayCode ...string) {
	target := ""
	if len(targetDisplayCode) > 0 {
		target = targetDisplayCode[0]
	}
	payload, err := json.Marshal(map[string]interface{}{
		"type":      eventType,
		"data":      data,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
	if err == nil {
		h.Broadcast <- OutboundMessage{
			Payload:           payload,
			TargetDisplayCode: target,
		}
	}
}

func (h *Hub) BroadcastScreenReload(displayCode ...string) {
	code := ""
	if len(displayCode) > 0 {
		code = displayCode[0]
	}
	h.BroadcastEvent("screen:reload", map[string]string{"displayCode": code}, code)
}

func (h *Hub) BroadcastQueueCall(ticket interface{}) {
	h.BroadcastEvent("queue:call", ticket)
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[WebSocket] Upgrade error:", err)
		return
	}

	client := &Client{
		Hub:  hub,
		Conn: conn,
		Send: make(chan []byte, 256),
	}
	hub.Register <- client

	welcome, _ := json.Marshal(map[string]string{
		"type":    "connected",
		"message": "Conectado ao Hub de Sinalização Digital (Go Engine v1.3.1)",
	})
	client.Send <- welcome

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err == nil {
			t, _ := msg["type"].(string)
			if t == "display:register" {
				if code, ok := msg["displayCode"].(string); ok && code != "" {
					c.DisplayCode = code
					if c.Hub.DB != nil {
						_, _ = c.Hub.DB.Exec(`UPDATE displays SET status = 'online', last_ping = CURRENT_TIMESTAMP WHERE UPPER(code) = UPPER(?)`, code)
					}
					log.Printf("[WebSocket-Go] Display registered: %s\n", code)
				}
			} else if t == "display:ping" {
				if c.DisplayCode != "" && c.Hub.DB != nil {
					_, _ = c.Hub.DB.Exec(`UPDATE displays SET status = 'online', last_ping = CURRENT_TIMESTAMP WHERE UPPER(code) = UPPER(?)`, c.DisplayCode)
				}
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			_ = c.Conn.WriteMessage(websocket.TextMessage, message)
		case <-ticker.C:
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
