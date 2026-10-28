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

## Panel de administración

Proyectos, cuentas, tokens y ajustes se gestionan desde el panel web
en `/admin`, sin tocar ficheros ni reiniciar nada:

- En la Pi: `http://<ip-de-la-pi>:3000/admin` (en casa,
  `http://192.168.1.158:3000/admin`).
- En desarrollo: <http://localhost:3000/admin>.

**Úsalo solo en la red local.** El panel tiene contraseña, pero no
está pensado para exponerse a Internet: no abras el puerto 3000 en el
router ni lo publiques detrás de un proxy.

**Primer acceso**: la primera vez, `/admin` pide crear la contraseña
(mínimo 8 caracteres). Las siguientes veces pide esa contraseña.

El panel tiene cuatro secciones:

- **Estado**: estado del kiosco y de la Pi, alertas activas y
  botones para reiniciar la pantalla, el backend o la Pi.
- **Proyectos y cuentas**: proyectos, canales y canal principal de
  cada uno.
- **Tokens y claves**: credenciales de YouTube, GitHub, Twitch, X y
  Meta (Instagram/Facebook). Nunca se muestran enteras; dejar un campo
  vacío significa "no cambiar".
- **Ajustes generales**: `refreshSeconds`, `slideSeconds` y
  `transition`.

Los cambios se aplican en caliente. Todo se guarda en
`backend/state/settings.json` (fuera de `cache/`, que se sirve
públicamente), con permisos restringidos y escritura atómica.

**Aviso en el kiosco**: si aparece un icono de aviso ámbar en la
barra de estado del kiosco, hay alertas activas (por ejemplo, un token
de Meta inválido o a punto de caducar). Se ven en `/admin` → Estado.

### Migración desde `config.json` y `.env`

`backend/config.json` y `backend/.env` solo sirven para la **primera
migración**: la primera vez que arranca el backend sin
`state/settings.json`, lo crea a partir de `config.json`, de las
variables de `.env` y, si existe, de `state/instagram-token.json` (que
tiene prioridad para el token de Instagram). A partir de ahí esos
ficheros se ignoran: edita todo desde `/admin`.

Si `settings.json` existe pero es JSON inválido (p. ej. editado a mano
por SSH), el backend no arranca y lo dice en el log; no lo
sobrescribe. Corrige el fichero y reinicia.

### Contraseña olvidada

```bash
ssh raspiCount
cd ~/followCount/backend
nano state/settings.json     # elimina admin.passwordHash
sudo systemctl restart followcount-backend
```

Sin `admin.passwordHash`, `/admin` vuelve a pedir la creación de una
contraseña nueva.

## Configuración

Estructura de la configuración (la que se edita en `/admin`; en la
primera migración se lee de `backend/config.json` con este mismo
formato):

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

Los cambios guardados en el panel se aplican en caliente, sin
reiniciar.

## Credenciales

Se gestionan en `/admin` → **Tokens y claves** y viven en
`backend/state/settings.json`, nunca en `config.json`. El
[backend/.env.example](backend/.env.example) solo sirve para la
primera migración:

| Variable | Necesaria para | Notas |
|---|---|---|
| `YOUTUBE_API_KEY` | youtube | YouTube Data API v3 |
| `GITHUB_TOKEN` | — | Opcional, sube el rate limit |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | twitch | App en dev.twitch.tv |
| `X_BEARER_TOKEN` | x | X API v2 |
| `INSTAGRAM_ACCESS_TOKEN` | — | Recomendado: cifras exactas vía Graph API en vez de scraping. Ver abajo |
| `FACEBOOK_ACCESS_TOKEN` | — | Opcional: si no se indica, se reutiliza el de Instagram (mismo permiso `pages_read_engagement`); sin ninguno de los dos, se usa el widget público (redondea cifras grandes: "154M") |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | — | Opcional: permiten al backend comprobar la caducidad real de los tokens de Meta y alargar los de corta duración |

TikTok no requiere credenciales (endpoint público); igual que
Instagram sin token, puede fallar puntualmente si la plataforma
bloquea la petición — el canal se omite en ese refresco sin tumbar
el dashboard.

### Token de Instagram/Facebook (Graph API)

Sin token de Instagram, se lee haciendo scraping de endpoints
públicos: funciona, pero Meta puede bloquear la IP con peticiones
frecuentes. Con el token, se usa la Graph API oficial: cifras
exactas, sin bloqueos.

**Requisitos previos**:

1. Cada cuenta de Instagram debe ser **profesional** (Business o
   Creator, gratis desde la app) y estar vinculada a una página de
   Facebook que administres. Solo hace falta vincular **una** cuenta
   a una página — el resto se leen sin vincular mediante *business
   discovery*.
2. Crea una app en <https://developers.facebook.com> → **My Apps →
   Create App** (tipo Business).

**Recomendado: token de usuario del sistema** (no caduca). Un token
de usuario normal dura 60 días y hay que regenerarlo; el de usuario
del sistema se genera una vez y no vuelve a tocarse:

1. En el Business Manager → **Configuración del negocio → Usuarios
   → Usuarios del sistema → Añadir** (rol **Administrador**).
2. Asígnale la app y los activos: la página de Facebook y la cuenta
   de Instagram.
3. **Generar token** con caducidad **Nunca** y los permisos
   `instagram_basic`, `pages_show_list`, `pages_read_engagement` e
   `instagram_manage_insights` (este último habilita business
   discovery para cuentas no vinculadas directamente).
4. Pégalo en `/admin` → **Tokens y claves**.

Con el App ID y el App Secret (Meta app → Settings → Basic) también
guardados en el panel, el backend comprueba cada 24 h la caducidad
real de los tokens (`debug_token`). Si un token es inválido o caduca
en menos de 14 días, aparece una alerta en `/admin` → Estado y el
icono de aviso del kiosco. Un token de corta duración pegado en el
panel se alarga automáticamente (`fb_exchange_token`) antes de
guardarlo. Nada protege contra una invalidación explícita (cambio de
contraseña de Facebook, retirada de la app al usuario del sistema):
el token deja de valer y hay que generar otro.

## API

- `GET /api/health` — incluye `metaTokens` (estado de los tokens de
  Meta por plataforma, p. ej. `{ instagram: { valid, expiresAt,
  error, checkedAt }, facebook: {...} }`; vacío si aún no se ha
  comprobado ninguno) y un resumen del latido del kiosco (`kiosk`).
- `POST /api/heartbeat` — latido que envía el frontend en cada cambio
  de diapositiva y tras cada refresco; responde 204.
- `GET /api/kiosk` — `{ lastHeartbeatAt, ageSeconds, thresholdSeconds,
  stale, last }`. El umbral es `max(180, 3 × max(slideSeconds,
  refreshSeconds))`; sin latidos aún, la edad cuenta desde el arranque
  del backend.
- `GET /api/dashboard` — modelo listo para pintar (proyectos, métricas,
  alertas, logos cacheados en `/cache/logos/`).

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
