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
| `INSTAGRAM_ACCESS_TOKEN` | — | Recomendado: cifras exactas vía Graph API en vez de scraping. Ver abajo |
| `FACEBOOK_ACCESS_TOKEN` | — | Opcional: si no se indica, se reutiliza `INSTAGRAM_ACCESS_TOKEN` (mismo permiso `pages_read_engagement`); sin ninguno de los dos, se usa el widget público (redondea cifras grandes: "154M") |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | — | Opcional: habilitan el auto-refresco de `INSTAGRAM_ACCESS_TOKEN` (ver abajo) |

TikTok no requiere credenciales (endpoint público); igual que
Instagram sin token, puede fallar puntualmente si la plataforma
bloquea la petición — el canal se omite en ese refresco sin tumbar
el dashboard.

### Token de Instagram/Facebook (Graph API)

Sin `INSTAGRAM_ACCESS_TOKEN`, Instagram se lee haciendo scraping de
endpoints públicos: funciona, pero Meta puede bloquear la IP con
peticiones frecuentes. Con el token, se usa la Graph API oficial:
cifras exactas, sin bloqueos.

**Generar el token inicial** (una vez):

1. Cada cuenta de Instagram debe ser **profesional** (Business o
   Creator, gratis desde la app) y estar vinculada a una página de
   Facebook que administres. Solo hace falta vincular **una** cuenta
   a una página — el resto se leen sin vincular mediante *business
   discovery*.
2. Crea una app en <https://developers.facebook.com> → **My Apps →
   Create App** (tipo Business).
3. Añade el producto **Facebook Login** → Configuración → activa
   *Client OAuth Login* y *Web OAuth Login*.
4. Ve al **Graph API Explorer**
   (<https://developers.facebook.com/tools/explorer>), selecciona tu
   app, y en **Permisos** añade: `pages_show_list`,
   `pages_read_engagement`, `instagram_basic`,
   `instagram_manage_insights` (este último habilita business
   discovery para cuentas no vinculadas directamente).
5. **Generate Access Token** → en el diálogo de autorización, marca
   la página y la cuenta de Instagram.
6. Verifica en la misma consola:
   `me/accounts?fields=name,instagram_business_account{id,username,followers_count}`
   — debe devolver tu página con los datos de Instagram.
7. Cambia el token corto por uno de larga duración (60 días) con tu
   App ID/Secret (Settings → Basic):

   ```
   https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=TOKEN_CORTO
   ```

8. Guarda el `access_token` resultante en `INSTAGRAM_ACCESS_TOKEN`.

**Auto-refresco**: con `FACEBOOK_APP_ID` y `FACEBOOK_APP_SECRET`
también en `.env`, el servidor renueva el token cada 48h
(`fb_exchange_token`, igual que el paso 7) y lo persiste en
`backend/state/instagram-token.json` (fuera de `cache/`, que se
sirve públicamente en `/cache/logos`) — nunca llega a los 60 días de
caducidad y no hace falta reiniciar para que el nuevo token surta
efecto. Esto **no** protege contra una invalidación explícita
(cambio de contraseña de Facebook, cierre de sesión en todos los
dispositivos): en ese caso el token muere igual y hay que repetir
los pasos 4–8 a mano. `GET /api/health` expone
`instagramToken: { hasToken, autoRefreshConfigured, lastRefreshAt,
lastError }` para comprobar el estado sin mirar logs.

## API

- `GET /api/health` — incluye el estado del token de Instagram y un
  resumen del latido del kiosco (`kiosk`).
- `POST /api/heartbeat` — latido que envía el frontend en cada cambio
  de diapositiva y tras cada refresco; responde 204.
- `GET /api/kiosk` — `{ lastHeartbeatAt, ageSeconds, thresholdSeconds,
  stale, last }`. El umbral es `max(180, 3 × max(slideSeconds,
  refreshSeconds))`; sin latidos aún, la edad cuenta desde el arranque
  del backend.
- `GET /api/dashboard` — modelo listo para pintar (proyectos, métricas,
  logos cacheados en `/cache/logos/`).

## Vigilante del kiosco (Raspberry Pi)

El watchdog interno de la página (`location.reload()`) no sirve si el
renderer de Chromium se cuelga. Por eso el frontend envía un latido al
backend y un temporizador de systemd (cada 60 s, y 2 min tras el
arranque) ejecuta `deploy/kiosk-watchdog.sh`: si `/api/kiosk` dice
`stale` y `followcount-kiosk` lleva activo más que el umbral, reinicia
el kiosco y deja en el journal la edad del latido, el último payload,
`vcgencmd get_throttled`, la frecuencia ARM y la memoria libre. Si el
backend no responde no hace nada (ya tiene `Restart=always`).

`scripts/install.sh` lo instala automáticamente. A mano:

```
sudo cp deploy/systemd/followcount-kiosk-watchdog.{service,timer} /etc/systemd/system/
sudo chmod +x deploy/kiosk-watchdog.sh
sudo systemctl daemon-reload
sudo systemctl enable --now followcount-kiosk-watchdog.timer
```

(El `.service` asume el repo en `/home/info/followCount`; ajusta
`ExecStart` si está en otra ruta.) Logs:

```
journalctl -u followcount-kiosk-watchdog
```
