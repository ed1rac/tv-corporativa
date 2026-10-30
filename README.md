# 📺 TV Corporativa & Sinalização Digital (Digital Signage v2.0)

> Sistema moderno, robusto e de alto desempenho para gestão de TVs corporativas, painéis informativos, totens verticais e chamadas de senhas em consultórios/recepções.

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)
![Tests](https://img.shields.io/badge/Tests-16_Passing-success.svg)

---

## 🌟 Principais Recursos e Diferenciais

* **🚀 Arquitetura Moderna e Desacoplada**: Desenvolvido em **TypeScript/Node.js**, com comunicação bidirecional em tempo real via **WebSockets**, banco relacional **SQLite em modo WAL** (*Write-Ahead Logging*) e zero dependências manuais externas.
* **📐 Suporte a Múltiplos Layouts (Multi-Zone)**:
  * **Tela Cheia (16:9 / 9:16)**: Exibição tradicional em 100% da tela para vinhetas e vídeos.
  * **Notícias & TV Corporativa (16:9)**: Área principal para vídeos/imagens (70%), barra lateral direita (30%) com relógio, previsão do tempo e informes, e rodapé com **ticker de notícias RSS contínuo**.
  * **Consultório & Chamada de Senhas (16:9)**: Vídeos educativos na área principal e painel lateral integrado de chamada de senhas de atendimento, com **toque de campainha (*chime*) gerado nativamente via Web Audio API e síntese de voz (TTS)**.
  * **Elevador / Totem Vertical (9:16 Portrait)**: Cabeçalho com data/hora e tempo, centro com mídia vertical e base com manchetes RSS e QR Code.
  * **Grid 4 Zonas (2x2)**: 4 quadrantes simultâneos e independentes.
* **🎬 Smart Video Engine (Vídeos sem Cortes)**:
  * O reprodutor escuta o evento `ended` da tag HTML5 `<video>`, respeitando a duração exata de cada vídeo.
  * *Double buffering* com transição suave em *cross-fade* CSS via GPU (`opacity`), eliminando telas pretas entre os slides.
  * Conformidade total com as políticas de *autoplay* dos navegadores (vídeos iniciam com segurança e botão flutuante para liberar áudio global).
* **⛅ Widgets Nativos em Tempo Real**:
  * **Clima e Temperatura**: Integração com API gratuita e global (Open-Meteo), exibindo temperatura, sensação térmica, umidade e condição meteorológica.
  * **Relógio e Data de Precisão**: Atualização por segundo com formatação completa em português.
  * **Ticker RSS Contínuo**: Parser de notícias com efeito *marquee* acelerado por hardware sem engasgos.
* **⚡ Resiliência Offline (Offline-First)**:
  * Equipado com **Service Worker** e cache local de mídias e manifesto. Se a rede cair ou o servidor reiniciar, a TV continua reproduzindo sem travar ou mostrar tela de erro.
* **🐳 100% Conteinerizado em Docker**:
  * `Dockerfile` multi-stage otimizado em Alpine Linux.
  * `docker-compose.yml` com volumes persistentes para banco de dados (`tv_data`) e arquivos de mídia (`tv_media`).

---

## 👥 Usuários Padrão Iniciais

O sistema já é inicializado com dois usuários pré-configurados:

| Usuário | Senha Padrão | Perfil | Permissões |
| :--- | :--- | :--- | :--- |
| **`admin`** | `tvcorporativa` | Administrador Geral | Acesso irrestrito a todas as funções e telas |
| **`edkallenn`** | `123456` | Administrador / Gestor | Gestão de telas, uploads de mídia, layouts e senhas |

---

## 📺 Telas Padrão Pré-Configuradas

Ao inicializar, o sistema já disponibiliza 3 telas prontas para visualização imediata:

1. **`TV-01` (Recepção Principal)**: Layout Corporativo com Vídeo, Sidebar com Clima/Hora e Rodapé RSS.  
   🔗 `http://localhost:8080/player?code=TV-01`
2. **`TV-02` (Consultório / Sala de Espera)**: Layout com Painel de Chamada de Senhas e Mídia.  
   🔗 `http://localhost:8080/player?code=TV-02`
3. **`TV-03` (Totem Vertical Elevador)**: Layout Retrato 9:16 com Clima no Topo, Vídeo Central e Notícias na Base.  
   🔗 `http://localhost:8080/player?code=TV-03`

---

## 🔀 Versão Alternativa em Go (Golang)

> 💡 **Nota Arquitetural**: Conforme especificado no planejamento, uma versão alternativa completa implementada em **Go (Golang)** de altíssimo desempenho (< 25MB RAM, binário estático compilado) está disponível na branch **`feature/go-alternative`** deste repositório. Para alternar e inspecionar a versão em Go:
> ```bash
> git checkout feature/go-alternative
> ```

---

## 🚀 Como Executar o Sistema

### Opção 1: Execução com Docker (Recomendado para Produção)

Basta clonar o projeto e executar um único comando:

```bash
# Subir o ambiente completo conteinerizado
docker compose up -d
```

O serviço iniciará na porta `8080`:
* **Painel Administrativo CMS**: [http://localhost:8080/admin](http://localhost:8080/admin)
* **Web Player da TV**: [http://localhost:8080/player?code=TV-01](http://localhost:8080/player?code=TV-01)
* **Verificação de Saúde (Healthcheck)**: [http://localhost:8080/api/health](http://localhost:8080/api/health)

Para parar os containers:
```bash
docker compose down
```

### Opção 2: Execução Local (Node.js)

Se desejar executar nativamente na sua máquina:

```bash
# 1. Instalar dependências
npm install

# 2. Executar em modo de desenvolvimento (Live Reload)
npm run dev

# Ou compilar e rodar a versão de produção:
npm run build
npm start
```

---

## 🧪 Testes Automatizados

O sistema conta com suíte abrangente de testes de integração cobrindo autenticação, telas, layouts multi-zonas, widgets e chamada de senhas:

```bash
npm test
```

Resultado dos testes:
```
PASS tests/widgets.test.ts
PASS tests/layouts.test.ts
PASS tests/displays.test.ts
PASS tests/queue.test.ts
PASS tests/auth.test.ts

Test Suites: 5 passed, 5 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        6.3 s
```

---

## 📁 Estrutura de Diretórios

```
tv-corporativa/
├── data/                   # Volume persistente do banco SQLite (tv_corporativa.db)
├── media/                  # Volume persistente de vídeos e imagens enviados
├── public/                 # Front-end da aplicação
│   ├── css/
│   │   ├── admin.css       # Estilos do painel de controle CMS
│   │   └── player.css      # Estilos acelerados por GPU do reprodutor da TV
│   ├── js/
│   │   ├── admin.js        # Lógica SPA do CMS administrativo
│   │   └── player.js       # Motor do player (Multi-Zone, Vídeo, WebSockets, Áudio)
│   ├── index.html          # Interface do Painel Administrativo
│   ├── player.html         # Interface da TV Player
│   └── sw.js               # Service Worker para suporte offline
├── src/                    # Código-fonte TypeScript do Backend
│   ├── config/             # Variáveis de ambiente e caminhos
│   ├── database/           # Conexão SQLite (WAL mode), migrações e seed inicial
│   ├── middleware/         # Autenticação JWT e upload com Multer
│   ├── routes/             # Endpoints REST (Auth, Displays, Layouts, Media, Queue, Widgets)
│   ├── services/           # Hub WebSockets e parser RSS com cache
│   ├── app.ts              # Configuração da aplicação Express
│   └── server.ts           # Ponto de entrada (Bootstrap HTTP + WS)
├── tests/                  # Testes automatizados (Jest / Supertest)
├── Dockerfile              # Imagem Docker multi-stage otimizada
├── docker-compose.yml      # Orquestração com volumes persistentes
├── package.json            # Dependências e scripts
└── tsconfig.json           # Configurações do compilador TypeScript
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Livre para uso comercial e corporativo.
