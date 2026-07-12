# followCount

Gadget para Raspberry Pi con pantalla SPI 480x320 que muestra seguidores
y métricas de varios proyectos (YouTube, GitHub, Instagram, TikTok,
Twitch, X y Facebook Pages).

## Requisitos

- Node.js 20+

## Instalación rápida (Raspberry Pi)

```bash
./scripts/install.sh
```

## Desarrollo

```bash
cd backend
cp .env.example .env   # rellena tus credenciales
npm install
npm run dev
```

Abre <http://localhost:3000>.

## Configuración

Proyectos y canales en `backend/config.json`:

```json
{
  "refreshSeconds": 60,
  "slideSeconds": 8,
  "transition": "fade",
  "projects": [
    {
      "name": "Expirio",
      "primaryChannel": "youtube",
      "channels": [
        { "type": "youtube", "channelId": "UC..." },
        { "type": "github", "username": "karug", "cacheSeconds": 900 },
        { "type": "instagram", "username": "expirioapp" },
        { "type": "tiktok", "username": "expirioapp" },
        { "type": "twitch", "username": "expirioapp" },
        { "type": "x", "username": "expirioapp" },
        { "type": "facebook", "username": "expirioapp" }
      ]
    }
  ]
}
```

- `primaryChannel`: canal mostrado en el contador principal.
- `slideSeconds`: segundos que se muestra cada proyecto en el carrusel.
- `transition`: animación al cambiar de proyecto. La siguiente pantalla
  se precarga completa (imágenes incluidas) antes de animar:
  - `"fade"` (por defecto): fundido de 450ms donde solo se anima la
    pantalla entrante. Recomendado para pantallas SPI de pocos FPS.
  - `"slide"`: deslizamiento lateral de 500ms de ambas pantallas.
    Requiere composición por GPU real (HDMI); en paneles SPI se ve a
    trompicones.
- `cacheSeconds` (opcional, por canal): TTL de caché superior al
  refresco del dashboard; útil con límites de API (GitHub sin token:
  60 peticiones/hora).
- Facebook admite `username` o `pageId` (id numérico de la página).

Los cambios en `config.json` se recargan en caliente: el servidor
comprueba la fecha de modificación del fichero en cada refresco del
dashboard (cada `refreshSeconds`), sin reiniciar. Si el JSON guardado
es inválido, mantiene la configuración anterior y avisa por log.

## Credenciales

Solo en `backend/.env` (nunca en `config.json`). Ver
[backend/.env.example](backend/.env.example):

| Variable | Necesaria para | Notas |
|---|---|---|
| `YOUTUBE_API_KEY` | youtube | YouTube Data API v3 |
| `GITHUB_TOKEN` | — | Opcional, sube el rate limit |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | twitch | App en dev.twitch.tv |
| `X_BEARER_TOKEN` | x | X API v2 |
| `FACEBOOK_ACCESS_TOKEN` | — | Opcional: sin él se usa el widget público, que redondea cifras grandes ("154M") |

Instagram y TikTok no requieren credenciales (endpoints públicos);
pueden fallar puntualmente si la plataforma bloquea la petición — el
canal se omite en ese refresco sin tumbar el dashboard.

## API

- `GET /api/health`
- `GET /api/dashboard` — modelo listo para pintar (proyectos, métricas,
  logos cacheados en `/cache/logos/`).
