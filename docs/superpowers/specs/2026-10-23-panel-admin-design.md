# Panel de administración de followCount — diseño

Fecha: 2026-10-23 · Estado: pendiente de aprobación del dueño

## Intención

Hoy, para cambiar algo del kiosko, hay que entrar por SSH en la Raspberry Pi y editar ficheros a mano: `backend/config.json` para las cuentas, y `backend/.env` y `backend/state/instagram-token.json` para tokens y claves. El dueño quiere hacerlo desde un navegador:

- añadir, quitar y editar proyectos y las cuentas (canales) de cada uno;
- cambiar los tokens y claves de las APIs (Meta, YouTube, GitHub, Twitch, X);
- reiniciar el kiosko cuando se queda mal.

El detonante fue la caducidad del token de Meta del 9 de octubre: cambiarlo exige SSH, y nadie se enteró hasta ver datos raros.

## Objetivos

1. Gestionar proyectos y canales desde el navegador, con efecto en la pantalla sin reiniciar nada.
2. Gestionar los secretos (tokens, claves, app id/secret) desde el navegador, con efecto sin reiniciar.
3. Ver de un vistazo el estado: si el kiosko está vivo (latido de `/api/kiosk`), el estado del token de Meta y su caducidad, y el último error de cada canal.
4. Botones de acción: reiniciar la pantalla, reiniciar el backend y reiniciar la Pi.
5. Todo se guarda en JSON. El `.env` deja de hacer falta.

## No objetivos

- Acceso desde fuera de casa. Solo red local; nada de exponerlo a Internet, ni proxies, ni túneles.
- Varios usuarios o roles. Hay un único administrador.
- Restaurar a "fábrica" o borrar datos.
- Editar el diseño visual del kiosko (colores, plantillas). La única excepción es el icono de aviso descrito en "Aviso en la pantalla del kiosko".
- Obtener tokens de Meta mediante OAuth desde el panel. Los tokens se pegan a mano; el panel solo los guarda y valida.

## Anti-objetivos (fallaría aunque "funcione")

- Que los secretos se puedan leer sin contraseña, o que el fichero que los guarda acabe servido por HTTP. Ya pasó una vez y se arregló en `3a352d6`.
- Que el panel rompa el despliegue: un `git pull` en la Pi no debe chocar con los datos que guarda el panel.
- Que un guardado a medias o un JSON inválido deje el kiosko sin datos.
- Que el panel cargue la Pi 3B: es una Pi de 1 GB con Chromium, así que nada de frameworks pesados ni procesos extra.

## Restricciones

- Hardware: Raspberry Pi 3B (1 GB de RAM), con bajo voltaje frecuente. El backend es Node con Express (`backend/server.js`, puerto 3000) y corre como el usuario `info` con el servicio systemd `followcount-backend` (`Restart=always`).
- El frontend del kiosko es JS vanilla sin build (`frontend/`). El panel sigue el mismo enfoque: HTML, CSS y JS vanilla, sin paso de build y sin dependencias nuevas de frontend.
- El backend ya relee `config.json` en caliente cuando cambia su mtime (`DashboardService.loadConfiguration`).
- Los proveedores leen los secretos de `process.env` en su constructor (`backend/providers/*.js`, `InstagramTokenService`), una sola vez.
- `backend/state/` está en `.gitignore` y fuera de lo que sirve `express.static` (solo se sirven `frontend/` y `cache/logos/`).
- `main` está protegida: todo va por PR con el check `test` (`node --test` en `backend/`).
- El usuario `info` de la Pi tiene `sudo` sin contraseña (comprobado con `sudo -n true`).

## Decisiones tomadas

### Dónde viven los datos (decidido por el dueño: "todo al JSON, dejar el env fuera")

- **Ajustes:** `backend/state/settings.json`, un único fichero con dos bloques:
  - `config`: lo que hoy es `config.json` (`refreshSeconds`, `slideSeconds`, `transition`, `projects[]` con sus `channels[]`).
  - `secrets`: `youtubeApiKey`, `githubToken`, `twitchClientId`, `twitchClientSecret`, `xBearerToken`, `facebookAccessToken`, `instagramAccessToken`, `facebookAppId`, `facebookAppSecret`.
- *Decisión de Claude:* no se reescribe `backend/config.json`, porque está en git y la Pi ya tiene cambios locales; si el panel lo editara, cada `git pull` chocaría.
- **Migración al primer arranque:** si `state/settings.json` no existe, se crea a partir de `backend/config.json` (bloque `config`), de las variables de `.env`/`process.env` y, si existe, del token guardado en `state/instagram-token.json` (bloque `secrets`). A partir de ahí `settings.json` es la única fuente; `config.json` y `.env` solo sirven para la primera vez o para una instalación nueva.
- `instagram-token.json` se absorbe: el token vivo pasa a `secrets.instagramAccessToken`, y la fecha de última renovación o validación a un bloque `meta` del mismo fichero.
- **Escritura atómica:** se escribe en un fichero temporal en el mismo directorio y luego se hace `rename`. Si la validación falla, no se escribe nada.
- **Validación antes de guardar:** tipos de canal conocidos (los de `ProviderFactory`); cada canal con su identificador obligatorio (`username`, `channelId`, etc., según lo que lea hoy cada proveedor); números positivos en los segundos; nombres de proyecto no vacíos.

### Secretos en caliente

- Los proveedores dejan de leer `process.env` en el constructor. Leen el secreto en cada uso, a través de un servicio de ajustes común (por ejemplo `SettingsService.secret("youtubeApiKey")`). Así un cambio desde el panel se aplica en la siguiente petición, sin reiniciar.
- Al guardar ajustes se invalida la caché de métricas (`CacheService`) y la caché negativa de los canales afectados, para que el cambio se vea en el siguiente refresco del kiosko.

### Dónde vive el panel y quién entra (decisión de Claude, mostrada al dueño sin objeciones)

- Lo sirve el mismo backend en `/admin`: `http://192.168.1.158:3000/admin`.
- Protección con contraseña, aunque sea solo red local, porque muestra y cambia tokens:
  - La primera vez que se abre `/admin` sin contraseña configurada, pide crear una.
  - Se guarda como hash `scrypt` con sal (módulo `crypto` de Node, sin dependencias) en `state/settings.json → admin.passwordHash`.
  - Sesión con cookie `HttpOnly` y `SameSite=Strict`, firmada con un secreto aleatorio guardado también en `state/`, y caducidad de 12 h.
  - Las rutas de API del panel (`/api/admin/*`) exigen la sesión. Las públicas del kiosko (`/api/dashboard`, `/api/heartbeat`, `/api/kiosk`, `/api/health`) no cambian.
  - Contraseña olvidada: se borra `admin.passwordHash` del JSON por SSH y el panel vuelve a pedir crearla. Se documenta en el README.
- Los secretos se muestran enmascarados (por ejemplo `EAAG…x9Q2`). Al editar se escribe el valor completo nuevo; un campo vacío significa "no cambiar". Hay un botón explícito para borrar.

### Estado que se ve en el panel

- Kiosko: datos de `KioskMonitor.status()` (último latido, si está congelado, diapositiva).
- Tokens de Meta: se vigilan los dos, `instagramAccessToken` y `facebookAccessToken` (si este último está vacío, se indica que se usa el de Instagram), y cada uno se muestra por separado. Validez y fecha de caducidad real, consultadas a Graph API con `debug_token` (`GET /debug_token?input_token=…&access_token={app-id}|{app-secret}`). Se muestra "no caduca" cuando `expires_at` es 0.
  - Hoy `InstagramTokenService` renueva cada 48 h con `fb_exchange_token`. Esa renovación no extiende la caducidad: el token caducó el 9 de octubre, 60 días después del primer intercambio, aunque la última renovación había "salido bien" el día 8. Se sustituye por una comprobación diaria con `debug_token` que guarda la caducidad y avisa en el log cuando falten menos de 14 días.
  - La recomendación al dueño es usar un token de usuario del sistema (Meta Business), que no caduca.
- Por canal: último valor y error, a partir del estado que ya guarda `DashboardService` (`lastGood` y la caché negativa).
- Pi: `vcgencmd get_throttled` traducido a texto ("bajo voltaje ahora" / "hubo bajo voltaje" / "correcto"), frecuencia de la CPU y memoria libre. Si `vcgencmd` no existe, se muestra "no disponible".

### Guardar un token de Meta (decisión de Claude)

- Al guardar un token de Meta nuevo desde el panel, se consulta con `debug_token`.
- Si caduca en menos de 7 días (por ejemplo, un token de corta duración del Graph API Explorer) y hay `facebookAppId` y `facebookAppSecret`, se intercambia en ese momento por uno largo con `fb_exchange_token` y se guarda el resultado.
- Si no se puede intercambiar, o después del intercambio sigue caducando en menos de 7 días, se guarda igualmente, pero el panel muestra un aviso bien visible con la fecha de caducidad.
- Si `debug_token` dice que el token no es válido, no se guarda y se muestra el motivo que da Meta.
- Sin red o con Meta caído, se guarda y se avisa de que no se ha podido validar.

### Aviso en la pantalla del kiosko (decidido por el dueño)

- La barra de estado del kiosko (`frontend/js/components/StatusBar.js`, junto al reloj y al icono de wifi) muestra un icono pequeño de aviso cuando hay algo que atender:
  - un token de Meta caducado, inválido o a menos de 14 días de caducar;
  - un canal que lleva fallando más de 24 h seguidas;
  - bajo voltaje detectado en la Pi desde el arranque. *Decisión de Claude:* entra porque es la causa probable de los cuelgues, y el dueño tampoco se enteraba.
- El icono no lleva texto: con verlo basta para saber que hay que abrir el panel, que es donde se explica qué pasa. Sin icono, todo está bien.
- El kiosko lo obtiene de un campo nuevo, `alerts`, en la respuesta de `/api/dashboard`: una lista de códigos sin detalles ni secretos, por ejemplo `["meta-token-expiring", "channel-failing", "undervoltage"]`. Así no necesita peticiones extra.
- El panel muestra las mismas alertas, con texto, arriba del todo en la sección Estado.

### Acciones de reinicio (decisión de Claude: el dueño pidió "resetearla y volverla a lanzar"; se interpretó así y no hubo objeción)

- **Reiniciar pantalla:** `sudo -n systemctl restart followcount-kiosk`.
- **Reiniciar backend:** responde al navegador y luego llama a `process.exit(0)`; systemd lo relanza (`Restart=always`). No necesita sudo.
- **Reiniciar Pi:** `sudo -n systemctl reboot`, con confirmación en el navegador.
- Todas las acciones van por `POST`, exigen sesión y piden confirmación en la interfaz. Se ejecutan con `child_process.execFile` (sin shell) y con argumentos fijos.
- Fuera de la Pi (desarrollo en Windows) los botones de sistema responden con un error claro "no disponible en este equipo" en vez de fallar de forma rara.

### Interfaz

- Una sola página con secciones: Estado, Proyectos y cuentas, Tokens y claves, Ajustes generales (segundos de diapositiva y de refresco, transición) y Acciones.
- Pensada para usarse desde un PC o un móvil en la wifi de casa: diseño adaptable y sin dependencias externas (nada de CDN, por los bloqueos de red que sufre la Pi).
- Proyectos: lista con editar, borrar (con confirmación) y "añadir proyecto". Dentro de cada uno, sus canales con tipo (desplegable de los tipos soportados) y los campos que ese tipo necesita, más reordenar proyectos (subir y bajar) porque el orden es el del carrusel.

## Lo que queda a criterio del implementador

- Nombres exactos de ficheros y servicios (`SettingsService`, `AdminAuth`, rutas en `backend/routes/admin.js`…), siguiendo el estilo del código existente.
- La forma exacta del JSON de `settings.json`, siempre que respete los bloques `config`, `secrets`, `admin` y `meta` descritos.
- Campos por tipo de canal: salen de lo que lee cada proveedor hoy.
- Estilo visual del panel: sobrio y legible. No hace falta que se parezca al kiosko.
- Tests con `node:test`, como mínimo para: la migración inicial, la validación, la escritura atómica (que un JSON inválido no se escriba), el hash y la verificación de contraseña, las rutas protegidas sin sesión (deben dar 401) y que los secretos nunca se devuelvan sin enmascarar por `GET`.

## Riesgos conocidos

- `sudo` sin contraseña para todo el usuario `info` ya existe; el panel no lo amplía. *Decisión de Claude:* no se toca la configuración de sudo en este proyecto.
- El backend, con la sesión del panel, puede reiniciar la Pi: cualquiera que tenga la contraseña puede apagar la pantalla. Es aceptable para un único administrador en casa.
