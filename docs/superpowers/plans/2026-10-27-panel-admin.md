# Panel de administración — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: superpowers:subagent-driven-development. Los pasos usan casillas (`- [ ]`).

**Objetivo:** un panel web en `/admin` (solo red local, con contraseña) para gestionar proyectos, cuentas, tokens y ajustes. Muestra el estado del kiosko y de la Pi, permite reiniciar pantalla, backend y Pi, y añade un icono de aviso en la barra de estado del kiosko.

**Arquitectura:** un `SettingsService` único es dueño de `backend/state/settings.json`, que contiene config, secretos, admin y meta. Los proveedores y el `DashboardService` le piden los datos en cada uso, así que los cambios se aplican en caliente. Las rutas del panel van en un router de Express protegido por una sesión con cookie firmada. El panel es HTML, CSS y JS vanilla servido desde `frontend/admin/`.

**Tecnología:** Node 24 + Express 4 (`node:test`, `node:crypto`, `node:child_process`), JS vanilla en el navegador. **Sin dependencias nuevas.**

**Spec:** `docs/superpowers/specs/2026-10-23-panel-admin-design.md` (leerla entera antes de cualquier tarea).

## Restricciones globales

- Sin dependencias npm nuevas, ni librerías de frontend, ni CDN.
- Los secretos nunca salen por HTTP sin enmascarar. `settings.json` vive en `backend/state/`, que no se sirve.
- Escritura de `settings.json` siempre atómica (fichero temporal en el mismo directorio y luego `rename`) y solo tras validar.
- Las rutas públicas del kiosko (`/api/dashboard`, `/api/heartbeat`, `/api/kiosk`, `/api/health`) no exigen sesión y siguen respondiendo igual. A `/api/dashboard` solo se le añade el campo `alerts`.
- Comandos de sistema con `execFile` (sin shell) y argumentos fijos.
- Estilo del código existente: espaciado amplio, comentarios en inglés y escasos. Los textos de la interfaz del panel van en español.
- Verificación: `cd backend && npm test` en verde en cada tarea. Commits convencionales en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Puntos a vigilar en la revisión

1. **`settings.json` corrupto** (editado a mano por SSH): el backend NO debe migrar encima ni sobrescribirlo. Arranca con error claro en el log y sin pisar el fichero. Test en la Tarea 1.
2. **Campo de secreto vacío o ausente en un `PUT`:** significa "no cambiar". Solo `null` explícito borra. Test en la Tarea 6.
3. **Borrar el proyecto que está en pantalla:** el kiosko no debe romperse en el siguiente refresco (índice fuera de rango). Verificación en la Tarea 8.
4. **Reiniciar el backend:** la respuesta HTTP debe llegar al navegador antes del `process.exit`. Test en la Tarea 6, inyectando `exit`.
5. **Primera ejecución en la Pi:** la migración debe tomar el `config.json` local de la Pi (con sus 3 proyectos) y los secretos de `.env` y `state/instagram-token.json`, este último con prioridad para el token de Instagram. Test en la Tarea 1.

---

### Tarea 1: SettingsService (fichero, migración, validación, guardado atómico)

**Ficheros:**
- Crear: `backend/services/SettingsService.js`
- Test: `backend/test/SettingsService.test.js`

**Interfaces que produce:**
- `class SettingsService extends EventEmitter`; `constructor({ file, legacyConfigFile, legacyTokenFile, env = process.env })`. Valores por defecto: `state/settings.json`, `config.json`, `state/instagram-token.json`, relativos a `backend/`.
- `load(): void`. Si el fichero existe y es JSON válido, lo carga. Si no existe, migra y guarda. Si existe pero es inválido, lanza `Error("settings.json is invalid: …")` y no escribe nada.
- `config(): object`. Devuelve el bloque `config` (`refreshSeconds`, `slideSeconds`, `transition`, `projects`).
- `secret(name: string): string | null`. Nombres válidos (constante exportada `SECRET_NAMES`): `youtubeApiKey`, `githubToken`, `twitchClientId`, `twitchClientSecret`, `xBearerToken`, `facebookAccessToken`, `instagramAccessToken`, `facebookAppId`, `facebookAppSecret`.
- `admin(): { passwordHash: string|null, sessionSecret: string }`. Si `sessionSecret` no existe, se genera al migrar o cargar con `crypto.randomBytes(32).toString("hex")` y se persiste.
- `meta(): object`. Bloque libre para el estado de los tokens (Tarea 3).
- `update(patch: { config?, secrets?, admin?, meta? }): void`. Hace merge superficial por bloque; dentro de `secrets`, un `null` borra la clave y `undefined` la deja igual. Valida el resultado completo con `validateConfig`; si falla, lanza `ValidationError` (exportada, con `.errors: string[]`) y no escribe. Si pasa, escribe de forma atómica y emite `"change"` con los nombres de los bloques cambiados.
- `validateConfig(config): string[]` (exportada). Mensajes de error en español. Reglas: `projects` es un array; cada proyecto tiene `name` no vacío y `channels` como array; cada canal tiene `type` en `["youtube","github","instagram","tiktok","twitch","x","facebook"]`; identificador obligatorio según el tipo: `youtube → channelId`, `facebook → pageId || username`, el resto `username`; `refreshSeconds`, `slideSeconds` y `cacheSeconds`, si están, son enteros > 0; `transition` es `"fade"` o `"slide"` si está; `primaryChannel`, si está, coincide con el `type` de algún canal del proyecto.

**Migración** (sin `settings.json`):
- `config` sale del contenido de `legacyConfigFile`.
- `secrets` sale de `env`: `YOUTUBE_API_KEY → youtubeApiKey`, `GITHUB_TOKEN`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `X_BEARER_TOKEN`, `FACEBOOK_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`. Las cadenas vacías pasan a `null`.
- Si `legacyTokenFile` existe, su `token` pisa `instagramAccessToken`.

- [ ] **Paso 1: tests que fallan**, cada uno con ficheros en un directorio temporal (`fs.mkdtempSync(os.tmpdir())`):
  - `migra config.json, env y el token guardado`: con un `config.json` de 3 proyectos, `env` con `YOUTUBE_API_KEY:"yt"` e `INSTAGRAM_ACCESS_TOKEN:"envtok"`, y un token file con `{token:"stored"}` → `config().projects.length === 3`, `secret("youtubeApiKey") === "yt"`, `secret("instagramAccessToken") === "stored"`, y `settings.json` existe en disco.
  - `no pisa un settings.json corrupto`: con contenido `"{oops"`, `load()` lanza un error que contiene `invalid` y el fichero sigue siendo `"{oops"`.
  - `update rechaza config inválida sin escribir`: un canal `{type:"youtube"}` sin `channelId` → lanza `ValidationError`, `errors[0]` contiene `channelId`, y el `mtime` y el contenido del fichero no cambian.
  - `secrets: undefined conserva y null borra`: `update({secrets:{githubToken:undefined, xBearerToken:null}})` → `githubToken` conserva su valor previo y `secret("xBearerToken") === null`.
  - `emite change con los bloques`: `update({config})` emite `"change"` con `["config"]`.
  - `no deja temporales`: después de `update`, el directorio solo contiene `settings.json`.
- [ ] **Paso 2:** `cd backend && node --test test/SettingsService.test.js` → FALLA (módulo inexistente).
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** `npm test` → todo en verde.
- [ ] **Paso 5:** commit `feat(backend): SettingsService con migración y guardado atómico`.

### Tarea 2: Conectar el backend a SettingsService (config y secretos en caliente)

**Ficheros:**
- Modificar: `backend/services/DashboardService.js` (`constructor`, `loadConfiguration`, `build`, `fetchMetric`), `backend/services/ProviderFactory.js`, `backend/providers/{Youtube,Github,Twitch,X,Facebook,Instagram}Provider.js`, `backend/server.js`.
- Crear: `backend/services/settings.js`, que exporta una instancia compartida (`module.exports = new SettingsService()`), igual que se hace hoy con `InstagramTokenService`.
- Test: `backend/test/DashboardService.test.js`, `backend/test/providers.test.js`.

**Interfaces:**
- Consume: Tarea 1.
- Produce:
  - Los proveedores leen sus secretos con un getter en cada uso, p. ej. `get apiKey() { return settings.secret("youtubeApiKey"); }`. `FacebookProvider.accessToken` usa `secret("facebookAccessToken") ?? secret("instagramAccessToken")`, e `InstagramProvider.accessToken` usa `secret("instagramAccessToken")`.
  - `DashboardService` recibe en el constructor `settings` (por defecto, la instancia compartida). `this.config` pasa a ser un getter de `settings.config()`, y `loadConfiguration()` queda vacío o se elimina. Al recibir `"change"` con `config` o `secrets`, vacía `this.cache` (`clear()`).
  - Nuevo en `DashboardService`: `channelHealth: Map<cacheKey, { failingSince: number|null, lastError: string|null, lastSuccessAt: number|null }>`. Se actualiza en `fetchMetric`: el éxito pone `failingSince = null`; el fallo fija `failingSince` si estaba a `null` y guarda `lastError`. Lo usan las Tareas 4 y 6.
  - `server.js` llama a `settings.load()` en `start()` antes de todo lo demás.

- [ ] **Paso 1: tests que fallan.** En `DashboardService.test.js`, adaptar `makeService()` para inyectar un `SettingsService` sobre un directorio temporal y añadir:
  - `un cambio de config vacía la caché del dashboard`: hacer `build()`, luego `settings.update({config})` con otro proyecto; el siguiente `build()` refleja el proyecto nuevo.
  - `channelHealth marca failingSince y lo limpia al recuperar`.

  En `providers.test.js`, añadir `YoutubeProvider lee la clave en cada uso`: `settings.update({secrets:{youtubeApiKey:"k2"}})` → `provider.apiKey === "k2"`. Los tests existentes que dependen de `process.env.YOUTUBE_API_KEY` deben pasar a usar settings.
- [ ] **Paso 2:** `npm test` → FALLAN los nuevos.
- [ ] **Paso 3:** implementar. Quitar toda lectura de `process.env` de los proveedores, salvo `PORT` y `NODE_ENV`.
- [ ] **Paso 4:** `npm test` → todo en verde.
- [ ] **Paso 5:** arrancar en local (`cd backend && npm start`) con el `.env` y el `config.json` actuales. Comprobar que se crea `state/settings.json` y que `GET /api/dashboard` devuelve los mismos proyectos que antes.
- [ ] **Paso 6:** commit `refactor(backend): config y secretos desde SettingsService en caliente`.

### Tarea 3: MetaTokenService (sustituye a InstagramTokenService)

**Ficheros:**
- Crear: `backend/services/MetaTokenService.js`, `backend/test/MetaTokenService.test.js`.
- Borrar: `backend/services/InstagramTokenService.js`, `backend/test/InstagramTokenService.test.js`.
- Modificar: `backend/server.js` y los dos proveedores que importaban `InstagramTokenService`.

**Interfaces:**
- Consume: `settings` (Tarea 1/2) y `utils/Http` (`getJson`).
- Produce: `class MetaTokenService`, con `constructor({ settings, http = Http, now = () => Date.now() })`.
  - `async inspect(token): Promise<{ valid: boolean, expiresAt: number|null /* ms; null = never */, error: string|null }>`. Llama a `GET https://graph.facebook.com/v21.0/debug_token` con `input_token=token` y `access_token=${appId}|${appSecret}`. `expires_at === 0` significa que no caduca. Sin `appId`/`appSecret` devuelve `{ valid: null, expiresAt: null, error: "Sin App ID/secret: no se puede comprobar" }` (`valid: null` = desconocido; solo `false` cuenta como inválido para las alertas).
  - `async prepareForSave(token): Promise<{ token: string, status: { valid, expiresAt, error }, warning: string|null }>`. Hace `inspect`. Si `!valid`, lanza `Error(status.error)`. Si caduca en menos de 7 días y hay credenciales de app, hace `fb_exchange_token` (misma llamada que el `refresh()` actual) y vuelve a inspeccionar. Si después sigue caducando en menos de 7 días, rellena `warning`. Si falla la red, devuelve el token sin cambios con `warning: "No se ha podido validar con Meta"`.
  - `async checkAll(): Promise<void>`. Inspecciona `instagramAccessToken` y, si existe, `facebookAccessToken`. Guarda en `settings.update({ meta: { metaTokens: { instagram: {...status, checkedAt}, facebook: {...} } } })`. Hace `console.warn` cuando falten menos de 14 días o el token no sea válido.
  - `start(intervalHours = 24)`: lanza `checkAll()` ya y luego cada `intervalHours`.
  - `status(): object`. Devuelve `settings.meta().metaTokens ?? {}`.
- Constantes exportadas: `EXCHANGE_BELOW_DAYS = 7`, `WARN_BELOW_DAYS = 14`.

- [ ] **Paso 1: tests que fallan**, con un `http` falso que registra URLs y params:
  - `inspect trata expires_at 0 como no caduca` → `expiresAt === null`.
  - `prepareForSave intercambia un token corto`: el primer `debug_token` devuelve una caducidad de +2 h, el intercambio devuelve `access_token:"long"`, el segundo `debug_token` devuelve +60 días → `token === "long"` y `warning === null`.
  - `prepareForSave avisa si no puede alargarlo`: sin `facebookAppSecret` y con +2 h → `warning` no nulo y el token sin cambios.
  - `prepareForSave rechaza un token inválido` → la promesa se rechaza con el mensaje de Meta.
  - `checkAll guarda el estado de ambos tokens`.
- [ ] **Paso 2:** `npm test` → FALLAN.
- [ ] **Paso 3:** implementar y cambiar `server.js`: `metaTokens.start(24)` sustituye a `InstagramTokenService.start(48)`, y `/api/health.instagramToken` pasa a ser `metaTokens: metaTokens.status()`.
- [ ] **Paso 4:** `npm test` → en verde.
- [ ] **Paso 5:** commit `feat(backend): comprobación real de caducidad de tokens de Meta`.

### Tarea 4: Estado de la Pi y alertas (`alerts` en `/api/dashboard`)

**Ficheros:**
- Crear: `backend/services/SystemStatus.js`, `backend/services/AlertService.js` y sus tests `backend/test/SystemStatus.test.js` y `backend/test/AlertService.test.js`.
- Modificar: `backend/server.js` (ruta `/api/dashboard`).

**Interfaces:**
- `SystemStatus`: `constructor({ run = execFile promisificado })`.
  - `async read(): Promise<{ available: boolean, undervoltageNow: boolean, undervoltageSinceBoot: boolean, throttledNow: boolean, raw: string|null, armHz: number|null, memAvailableMb: number|null }>`. Ejecuta `vcgencmd get_throttled` y `vcgencmd measure_clock arm`, y lee `/proc/meminfo`. Si falla, `available: false` y el resto a `null`/`false`.
  - Bits de `get_throttled`: 0 = bajo voltaje ahora, 2 = frenado ahora, 16 = bajo voltaje desde el arranque.
  - Caché de 30 s para no lanzar procesos en cada petición.
- `AlertService`: `constructor({ metaTokens, dashboard, system, now })`.
  - `async codes(): Promise<string[]>`. Códigos posibles, en este orden: `"meta-token-invalid"` (algún token con `valid: false`), `"meta-token-expiring"` (algún token con `expiresAt` a menos de 14 días), `"channel-failing"` (algún canal de `dashboard.channelHealth` con `failingSince` de más de 24 h) y `"undervoltage"` (`undervoltageNow || undervoltageSinceBoot`).
- `/api/dashboard` añade `alerts: await alertService.codes()` a la respuesta, **sin guardarlo en la caché del dashboard**: se calcula en cada petición.

- [ ] **Paso 1: tests que fallan**:
  - `SystemStatus parsea 0x50005` → `undervoltageNow`, `throttledNow` y `undervoltageSinceBoot` a true.
  - `SystemStatus sin vcgencmd` → `available === false`.
  - `AlertService` con un caso por código.
  - `canal fallando 23 h no alerta, 25 h sí`.
- [ ] **Paso 2:** FALLAN.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** `npm test` → en verde.
- [ ] **Paso 5:** commit `feat(backend): alertas del kiosko y estado de la Pi`.

### Tarea 5: App exportable y autenticación del panel

**Ficheros:**
- Crear: `backend/app.js` (`createApp(deps)` monta todas las rutas actuales y las nuevas, sin `listen`), `backend/services/AdminAuth.js`, `backend/test/AdminAuth.test.js`, `backend/test/helpers/server.js` (arranca `createApp` en el puerto 0 y devuelve `{ url, close }`).
- Modificar: `backend/server.js`, que queda solo como arranque (`load`, `start` de los servicios, `createApp(...).listen(PORT)`).

**Interfaces:**
- `AdminAuth`: `constructor({ settings, now })`.
  - `hashPassword(pw): string` con el formato `scrypt$<saltHex>$<hashHex>` (sal de 16 bytes, clave de 64).
  - `verifyPassword(pw, stored): boolean` con `timingSafeEqual`.
  - `issueCookie(): string`, que firma `exp` con HMAC-SHA256 usando `admin().sessionSecret`. TTL de 12 h.
  - `requireSession` (middleware): responde 401 `{error:"auth"}` si falta la cookie o no es válida.
- Rutas en `backend/routes/admin.js` (un router, montado en `/api/admin`):
  - `GET /api/admin/session` → `{ needsSetup: boolean, authenticated: boolean }`.
  - `POST /api/admin/setup {password}` → solo si no hay `passwordHash`; contraseña de al menos 8 caracteres; guarda el hash y fija la cookie. Si ya hay contraseña, 409.
  - `POST /api/admin/login {password}` → fija la cookie, o devuelve 401.
  - `POST /api/admin/logout` → borra la cookie.
- Cookie `fc_admin`, con `HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`, sin `Secure` (el panel va por HTTP en la red local). Se parsea a mano con el header `Cookie` (sin `cookie-parser`).
- `express.json()` limitado a `100kb`.

- [ ] **Paso 1: tests que fallan** (contra un servidor real en el puerto 0, usando `fetch` de Node):
  - `setup solo una vez` (el segundo intento da 409).
  - `login con contraseña mala da 401`.
  - `cookie caducada da 401` (con `now` inyectado).
  - `cookie manipulada da 401`.
  - `las rutas públicas siguen sin pedir sesión` (`GET /api/kiosk` → 200).
- [ ] **Paso 2:** FALLAN.
- [ ] **Paso 3:** implementar. Todas las rutas existentes se mueven a `createApp` sin cambiar su comportamiento.
- [ ] **Paso 4:** `npm test` → en verde, incluidos todos los tests anteriores.
- [ ] **Paso 5:** commit `feat(backend): app exportable y sesión del panel`.

### Tarea 6: API del panel (ajustes, secretos, estado y acciones)

**Ficheros:**
- Modificar: `backend/routes/admin.js`.
- Crear: `backend/services/SystemActions.js`, `backend/test/adminApi.test.js`.

**Interfaces** (todas tras `requireSession`):
- `GET /api/admin/settings` → `{ config, secrets: { [name]: { set: boolean, masked: string|null } } }`. Formato enmascarado: los 4 primeros caracteres + `…` + los 4 últimos; si el secreto tiene 12 caracteres o menos, `"••••"`.
- `PUT /api/admin/config {config}` → `settings.update({config})`. Responde 400 `{errors}` con `ValidationError`, o 200 con la config guardada.
- `PUT /api/admin/secrets {secrets}`. Las claves que no están en `SECRET_NAMES` dan 400; `""` o `undefined` = sin cambio; `null` = borrar. Para `instagramAccessToken` y `facebookAccessToken` no vacíos, pasan antes por `metaTokens.prepareForSave`: si lanza error, 400 con el mensaje; si devuelve `warning`, se incluye en la respuesta. Tras guardar, `metaTokens.checkAll()` sin esperar. Responde `{ secrets: <enmascarados>, warnings: string[] }`.
- `GET /api/admin/status` → `{ alerts: string[], kiosk: kioskMonitor.status(), metaTokens: metaTokens.status(), system: await systemStatus.read(), channels: [{ project, type, id, lastSuccessAt, failingSince, lastError }] }`. Los canales salen de `config.projects` cruzados con `dashboard.channelHealth`.
- `POST /api/admin/actions/:name`, con `name` en `restart-kiosk | restart-backend | reboot`.
  - `SystemActions`: `constructor({ run, exit = process.exit, platform = process.platform })`.
  - `restart-kiosk` → `run("sudo", ["-n","systemctl","restart","followcount-kiosk"])`.
  - `reboot` → `run("sudo", ["-n","systemctl","reboot"])`.
  - `restart-backend` → responde 202 y, en `res.on("finish")`, programa `exit(0)` con un `setTimeout` de 500 ms.
  - Con `platform !== "linux"`, todas responden 501 `{error:"No disponible en este equipo"}`.
  - Un nombre desconocido da 404.

- [ ] **Paso 1: tests que fallan**:
  - `sin sesión todo /api/admin/* (salvo session/setup/login) da 401`.
  - `GET settings nunca devuelve un secreto completo`: con el secreto `"EAAGabcdefghijklmnopX9Q2"`, el cuerpo no contiene la cadena completa y `masked === "EAAG…X9Q2"`.
  - `PUT secrets con "" no cambia y con null borra`.
  - `PUT config inválida da 400 con errors y no cambia el fichero`.
  - `PUT secrets de un token de Meta inválido da 400 y no guarda` (con `metaTokens` falso).
  - `restart-backend responde 202 antes de llamar a exit` (`exit` falso que registra la llamada; se comprueba que se llama después de recibir la respuesta).
  - `acciones en win32 dan 501`.
  - `acción desconocida da 404`.
- [ ] **Paso 2:** FALLAN.
- [ ] **Paso 3:** implementar.
- [ ] **Paso 4:** `npm test` → en verde.
- [ ] **Paso 5:** commit `feat(backend): API del panel de administración`.

### Tarea 7: Interfaz del panel

**Ficheros:**
- Crear: `frontend/admin/index.html`, `frontend/admin/admin.css`, `frontend/admin/admin.js` (módulo ES, sin build).
- Modificar: `backend/app.js`, para que `GET /admin` sirva `frontend/admin/index.html`, antes del comodín del SPA.

**Requisitos:**
- **Arranque:** al cargar, llama a `GET /api/admin/session`. Si `needsSetup`, muestra el formulario para crear la contraseña (dos campos que deben coincidir, mínimo 8 caracteres). Si no hay sesión, muestra el login. Si la hay, muestra el panel. Cualquier 401 posterior vuelve al login.
- **Secciones, en este orden:**
  1. **Estado:** alertas con texto en español, una por código; kiosko (último latido, "congelado" sí/no, diapositiva); tokens de Meta (válido, "caduca el dd/mm/aaaa" o "no caduca", último error); Pi (voltaje en texto, MHz, memoria disponible); tabla de canales con su último éxito y su error. Botón "Actualizar".
  2. **Proyectos y cuentas:** lista editable con añadir, borrar (con `confirm`), subir y bajar. Por proyecto: nombre, logo (opcional), canal principal (desplegable con los tipos de sus canales) y canales. Cada canal tiene un desplegable de tipo y los campos de ese tipo (`youtube: channelId`, `facebook: pageId` o `username`, `instagram: username` y `facebookPageId` opcional, resto: `username`), además de `cacheSeconds` opcional. Un único botón "Guardar" hace `PUT /api/admin/config` y muestra los `errors` junto al formulario.
  3. **Tokens y claves:** un campo por `SECRET_NAMES` con una etiqueta en español. Placeholder = valor enmascarado o "sin configurar". Botones "Guardar" (solo envía los campos rellenados) y "Borrar" por campo (envía `null`, con `confirm`). Muestra los `warnings`.
  4. **Ajustes generales:** `slideSeconds`, `refreshSeconds` y `transition`. Usa el mismo `PUT` de config.
  5. **Acciones:** "Reiniciar pantalla", "Reiniciar backend" y "Reiniciar Pi", cada uno con `confirm`. Tras reiniciar el backend o la Pi, el panel muestra "Reiniciando…" y hace polling de `/api/admin/session` cada 5 s hasta que responda.
- **Formato:** diseño adaptable a móvil (una columna por debajo de 640 px), sin recursos externos, con tema claro y oscuro por `prefers-color-scheme`.

- [ ] **Paso 1:** implementar.
- [ ] **Paso 2:** verificación manual en local. Arrancar el backend, abrir `http://localhost:3000/admin`, crear la contraseña, añadir un canal de prueba, guardar, comprobar que `GET /api/dashboard` lo refleja, borrarlo, provocar un error de validación (canal YouTube sin `channelId`) y ver el mensaje, y comprobar que los botones de acción en Windows muestran "No disponible en este equipo". Anotar el resultado en el informe.
- [ ] **Paso 3:** `npm test` → en verde.
- [ ] **Paso 4:** commit `feat(frontend): interfaz del panel de administración`.

### Tarea 8: Icono de aviso en el kiosko

**Ficheros:**
- Crear: `frontend/icons/alert.svg`, siguiendo el estilo de `wifi.svg` (trazo simple, mismo tamaño).
- Modificar: `frontend/index.html` (`<div id="alertIcon" hidden><img src="icons/alert.svg" alt="aviso"></div>` dentro de `.status`, antes del wifi), `frontend/js/components/StatusBar.js` (nuevo método `setAlerts(codes: string[])` que muestra el icono si la lista no está vacía) y `frontend/js/components/Dashboard.js`, que en `refresh()` llama a `this.#statusBar.setAlerts(Api.dashboard?.alerts ?? [])`. Añadir el estilo en `frontend/css/components.css`, con un tamaño igual que el del wifi.

- [ ] **Paso 1:** implementar.
- [ ] **Paso 2: verificación del punto 3 de la lista de revisión.** Leer el camino `Dashboard.refresh` → `Carousel.setProjects` → `go(current)` y asegurar que, si `current >= projects.length`, se va al 0. Si no lo hace, corregirlo en `Dashboard.#startRefreshLoop` con un `Math.min`.
- [ ] **Paso 3:** verificación manual en local: forzar una alerta (por ejemplo, un token de Instagram inválido desde el panel) y ver el icono en `http://localhost:3000`; quitarla y ver que desaparece.
- [ ] **Paso 4:** commit `feat(frontend): icono de aviso en la barra de estado`.

### Tarea 9: Documentación y limpieza

**Ficheros:**
- Modificar: `README.md` y `backend/.env.example`.

**Contenido:**
- Cambios en el README:
  - Nueva sección "Panel de administración": URL, creación de la contraseña, qué se gestiona y cómo recuperar una contraseña olvidada (`ssh raspiCount`, quitar `admin.passwordHash` de `backend/state/settings.json` y `sudo systemctl restart followcount-backend`).
  - Explicar que `config.json` y `.env` solo sirven para la primera migración.
  - Recomendar el token de usuario del sistema de Meta y quitar las instrucciones de renovación cada 60 días.
- `.env.example`: añadir una cabecera que diga que solo se usa la primera vez y que después todo se gestiona desde `/admin`.

- [ ] **Paso 1:** editar los dos ficheros.
- [ ] **Paso 2:** `npm test` → en verde.
- [ ] **Paso 3:** commit `docs: panel de administración y migración a settings.json`.
