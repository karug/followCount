# followCount

Gadget para Raspberry Pi con pantalla SPI 480x320 que muestra seguidores
y métricas de varios proyectos (YouTube, GitHub, Instagram, TikTok,
Twitch y X).

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
        { "type": "x", "username": "expirioapp" }
      ]
    }
  ]
}
```

- `primaryChannel`: canal mostrado en el contador principal.
- `cacheSeconds` (opcional, por canal): TTL de caché superior al
  refresco del dashboard; útil con límites de API (GitHub sin token:
  60 peticiones/hora).

## Credenciales

Solo en `backend/.env` (nunca en `config.json`). Ver
[backend/.env.example](backend/.env.example):

| Variable | Necesaria para | Notas |
|---|---|---|
| `YOUTUBE_API_KEY` | youtube | YouTube Data API v3 |
| `GITHUB_TOKEN` | — | Opcional, sube el rate limit |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | twitch | App en dev.twitch.tv |
| `X_BEARER_TOKEN` | x | X API v2 |

Instagram y TikTok no requieren credenciales (endpoints públicos);
pueden fallar puntualmente si la plataforma bloquea la petición — el
canal se omite en ese refresco sin tumbar el dashboard.

## API

- `GET /api/health`
- `GET /api/dashboard` — modelo listo para pintar (proyectos, métricas,
  logos cacheados en `/cache/logos/`).
