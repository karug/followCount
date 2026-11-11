# Descargas de las apps en Google Play y App Store

**Fecha:** 2026-11-11
**Rama:** `feature/descargas-tiendas`

## Intención

followCount muestra hoy, por proyecto, los seguidores de sus redes sociales.
Falta el dato que para una marca con app es el más importante de todos: cuánta
gente la ha descargado. Este diseño añade ese dato, leído de las dos tiendas,
para que el gadget deje de contar solo audiencia y cuente también adopción.

Todas las apps son del titular (Dirosoft), así que hay acceso de desarrollador a
Play Console y a App Store Connect. Eso permite cifras reales en vez de
estimaciones de terceros.

## Objetivos

- Una tarjeta nueva en la pantalla de cada proyecto con las descargas de su app
  en Google Play y en el App Store.
- Cifras exactas cuando haya credenciales configuradas.
- La métrica mostrada se elige desde `/admin`, no está fijada en el código.
- Degradación limpia: si una tienda no da el dato, la tarjeta muestra la otra sin
  romperse y sin tumbar el dashboard.

## No objetivos

- Apps de terceros. Solo apps propias.
- Estimaciones de pago (Sensor Tower, Appfigures, 42matters). Se descartaron: son
  cálculos aproximados, caros, y peores que el dato propio que las tiendas dan
  gratis al desarrollador.
- Ingresos, valoraciones, retención, ASO, embudos de conversión de la ficha.
- Histórico navegable o gráficas. La pantalla muestra un número, como el resto.

## Anti objetivos

Cosas que harían fracasar esto aunque funcionara:

- **Mostrar un número que parezca exacto sin serlo.** A los volúmenes actuales
  (ver más abajo) el dato público de Play solo da un rango. Pintar "18" cuando
  pueden ser 11 es peor que no pintar nada.
- **Que la tarjeta no diga qué está contando.** Al ser la métrica configurable,
  un número sin etiqueta es un número ambiguo.
- **Tumbar o ralentizar el dashboard.** Estas dos fuentes son ficheros, no
  endpoints de un número: si se piden en el ciclo normal de refresco, el kiosco
  se queda esperando.
- **Guardar las credenciales fuera de `/admin`.** Todo lo demás ya se gestiona
  desde el panel; esto no puede ser la excepción que obligue a entrar por SSH.

## Restricciones reales de las dos tiendas

Verificado contra documentación oficial el 2026-11-11. Esto no es contexto de
fondo: define la arquitectura, porque **ninguna de las dos tiendas tiene un
endpoint que devuelva un número de descargas**.

### Google Play

- La **Play Developer Reporting API no sirve**. Sus metric sets son todos de
  Android vitals (`vitals.anrrate`, `vitals.crashrate`, `vitals.slowstartrate`,
  `vitals.errors.counts`, etc.). No hay ninguno de instalaciones, descargas ni
  usuarios activos.
  <https://developers.google.com/play/developer/reporting/metricset-intro>
- La vía oficial son **CSV mensuales en un bucket privado de Cloud Storage** de
  la cuenta de desarrollador:
  `gs://<developer_bucket_id>/stats/installs/installs_<package>_<yyyyMM>_<dimensión>.csv`
  El `developer_bucket_id` empieza por `pubsite_prod_rev` y se copia a mano desde
  Play Console (*Play apps reports* → botón **Copy Cloud Storage URI**); no hay
  forma de calcularlo ni de listarlo por API.
- Dimensiones documentadas y su sufijo: `_app_version`, `_carrier`, `_country`,
  `_device`, `_language`, `_os_version`. **La documentación no menciona un
  `_overview`**; hay que listar el bucket para ver qué ficheros existen de verdad.
- Columnas del CSV: `Date`, `Package Name`, la dimensión, `Current Device
  Installs`, `Installs on active devices`, `Daily Device Installs`, `Daily Device
  Uninstalls`, `Daily Device Upgrades`, `Current User Installs`, `Total User
  Installs`, `Daily User Installs`, `Daily User Uninstalls`. Google **no define**
  en esa página qué significa cada una; el nombre es toda la pista.
- **Retraso de 3 a 7 días**: "Data is captured daily and posted within 3 to 7 days
  in monthly CSV files". El número nunca será el de hoy.
- Los ficheros vienen en **UTF-16** (la propia página pide convertirlos a UTF-8
  para importarlos a BigQuery).
- Acceso: cuenta de servicio de Google Cloud con su JSON, invitada en Play Console
  con el permiso **View app information en «Global»**, y scope
  `https://www.googleapis.com/auth/devstorage.read_only`.
  <https://support.google.com/googleplay/android-developer/answer/6135870>
- **Alternativa sin credenciales**: la ficha pública lleva `installs` (redondeado),
  `minInstalls` y `maxInstalls`. Medido el 2026-11-11 con
  [google-play-scraper](https://github.com/facundoolano/google-play-scraper) 10.1.4:

  | App | Paquete | `installs` | `minInstalls` | `maxInstalls` |
  |---|---|---|---|---|
  | SavePiks | `com.savepiks.app` | `1+` | 1 | 2 |
  | Expirio | `app.expirio` | `10+` | 10 | 18 |

  A este volumen `maxInstalls` es el techo de un cubo, no una cifra. Sirve de
  respaldo, no de dato principal.

### App Store

- La vía es la **Analytics Reports API** de App Store Connect, en varios pasos:
  1. `POST /v1/analyticsReportRequests` con `attributes.accessType` y la relación
     con la app. `ONE_TIME_SNAPSHOT` da todo el histórico disponible pero **no
     genera datos nuevos** después del día en que se pide; `ONGOING` genera
     informes diarios hacia adelante, pero no trae el pasado. Hacen falta las dos
     por app (ver decisión 9).
  2. `GET /v1/analyticsReportRequests/{id}/reports?filter[category]=COMMERCE`
  3. `GET /v1/analyticsReports/{id}/instances` (`filter[granularity]` =
     `DAILY`/`WEEKLY`/`MONTHLY`)
  4. `GET /v1/analyticsReportInstances/{id}/segments` → da `url`, `checksum`
     (md5) y `sizeInBytes`
  5. Descarga del segmento: fichero **TSV comprimido** (`.txt.gz`). Una instancia
     puede tener varios segmentos.
- El informe es el **"App Store Downloads"**, categoría *App Store commerce*.
  **El valor exacto de su campo `name` no está publicado** en la documentación;
  hay variantes *Standard* y *Detailed*. Se descubre listando los informes de la
  categoría `COMMERCE` y leyendo los `name` reales.
  <https://developer.apple.com/documentation/analytics-reports/app-download>
- Columnas: `Date`, `App Name`, `App Apple Identifier`, `Download Type`, `App
  Version`, `Device`, `Platform Version`, `Source Type`, `Page Type`, `Pre-Order`,
  `Territory`, `Counts`. `Counts` es el número de descargas.
- `Download Type` distingue `First-time Download`, `Redownload`, `Manual update`,
  `Auto-update` y `Restore`. **Hay que filtrar**, o se cuentan actualizaciones
  automáticas como descargas.
- **No existe un total acumulado.** Son filas diarias que hay que sumar.
- **El histórico empieza el 1 de enero de 2024** ("On request, data is available
  beginning from January 1, 2024"). No afecta a este caso: SavePiks salió el
  2026-10-23 y Expirio el 2026-07-17, así que el histórico cubre toda su vida.
- El primer informe tarda **1 o 2 días** en generarse tras crear la petición. Los
  datos de un día se consideran completos **dos días después**.
- Una petición que pasa mucho tiempo sin que se descarguen datos se marca
  `stoppedDueToInactivity` y hay que crear otra.
- Roles: **Admin** para crear la petición la primera vez; **Sales and Reports**
  basta para descargar informes ya pedidos.
  <https://developer.apple.com/help/app-store-connect-analytics/overview/analytics-reports-api>
- El antiguo informe `INSTALLS` de Sales and Trends, que era la otra vía,
  **Apple lo retiró el 2026-11-04 sin sustituto**. No usarlo.
- **No hay equivalente de "instalaciones activas"**. Existe un *App Store
  Installations and Deletions Report*, pero es de la categoría *App usage*, que se
  calcula solo con usuarios que aceptaron compartir datos de uso, y además Apple
  aplica umbrales de privacidad y ruido estadístico. No es comparable con el dato
  de Play y no se usa.

### Apps publicadas hoy

| App | Play | App Store | Salida |
|---|---|---|---|
| SavePiks | `com.savepiks.app` | `6821197874` | Play 2026-10-06 · iOS 2026-10-23 |
| Expirio | `app.expirio` | `6783035891` | Play 2026-06-22 · iOS 2026-07-17 |

GiftMeThis, DiroTPV, Avicore y DJBeat no están publicadas en ninguna de las dos
tiendas. La función se estrena con dos apps.

Credenciales que ya existen en `G:\Mi unidad\Android`:
`giftmethis-play-service-account.json` (cuenta de servicio de Play, habrá que
comprobar si tiene el permiso Global y si vale para toda la cuenta) y
`AuthKey_API_TR96R5VW7Y.p8` con su Key ID e Issuer ID en `ios-INFO-comun.txt`
(comprobar que su rol es Admin).

## Decisiones del titular

1. **Las dos tiendas**, no una.
2. **La métrica es configurable** desde `/admin`, no fija en el código.
3. **Una sola tarjeta "Descargas" con las dos tiendas dentro** (elegida sobre
   maqueta, frente a dos tarjetas separadas). Razón: en una pantalla de 480×320
   con la fila de tarjetas repartiéndose el ancho a partes iguales, dos tarjetas
   más estrechan demasiado a las de redes.
4. **Si una métrica no se puede obtener de Apple, se muestra solo la de Play.**
   No un guión, no un hueco: solo el lado que tiene dato.

## Decisiones mías

Las tomo yo porque un constructor sensato las resolvería igual, pero quedan
marcadas para que se puedan cambiar:

1. **El título de la tarjeta es el nombre de la métrica elegida**: "Descargas",
   "Activas" o "30 días". Resuelve la ambigüedad que introducía la tarjeta
   compartida sin gastar una línea extra en una pantalla donde no sobra ninguna.
2. **Dos providers independientes, `googleplay` y `appstore`**, agrupados en una
   sola tarjeta por el frontend. La alternativa (un canal único con dos
   identificadores) ahorraría una entrada de configuración pero rompería el
   patrón del resto del código y haría que el fallo de una tienda arrastrase a la
   otra. Cada provider mantiene su caché, su estado y su modo de fallo.
3. **Patrón Instagram para la exactitud**: con credenciales, cifras exactas por
   la vía oficial; sin ellas, Play cae al dato público y el lado del App Store
   simplemente no aparece. Es exactamente cómo se comporta ya Instagram con y sin
   token, así que no introduce un concepto nuevo.
4. **Con el dato público de Play se muestra el límite inferior con un `+`**
   (`minInstalls` → "10+"), nunca `maxInstalls` a secas. Es lo que la tienda
   afirma; `maxInstalls` es una inferencia.
5. **La métrica es un ajuste global** (`downloadsMetric` en *Ajustes generales*),
   no por proyecto ni por canal. Al ser una tarjeta compartida, una métrica por
   canal podría entrar en contradicción consigo misma.
6. **Solo cuentan las descargas de verdad**: en Apple, únicamente
   `Download Type = First-time Download`. Las redescargas, restauraciones y
   actualizaciones no son descargas nuevas y contarlas infla la cifra.
7. **Refresco diario y propio, fuera del ciclo del dashboard.** Las fuentes se
   actualizan una vez al día como mucho (Play con 3-7 días de retraso), así que
   pedirlas cada `refreshSeconds` sería absurdo y lento. El valor vive en estado
   persistido y el dashboard lo lee de ahí, siempre instantáneo.
8. **Estas dos tiendas no pueden ser el canal principal.** El contador grande es
   `FlipCounter`, seis dígitos numéricos: no sabe pintar "10+" ni advertir de que
   el dato tiene una semana. Además `ProjectViewModel` saca de la fila de
   tarjetas el canal principal, así que con Play arriba la tarjeta compartida se
   quedaría con una sola celda. Rectifica una decisión anterior mía que decía lo
   contrario; la pantalla pierde una posibilidad y gana no poder mentir.
9. **Dos peticiones por app en el App Store, no una**: un `ONE_TIME_SNAPSHOT`
   para recuperar el histórico (que no genera datos nuevos después del día en que
   se pide) y un `ONGOING` para el flujo diario. Con una sola, o falta el pasado
   o falta el presente. El estado persistido guarda los dos ids.
10. **El respaldo público de Play solo vale para «Descargas».** La ficha pública
    no sabe de instalaciones activas ni de ventanas de 30 días. Con esas dos
    métricas elegidas y sin cuenta de servicio, la celda de Play desaparece y
    salta una alerta; si Apple tampoco puede, desaparece la tarjeta entera. En
    el selector de `/admin` esas dos métricas quedan marcadas como dependientes
    de credenciales. Pintar "10+" bajo el título «Activas» sería justo el número
    mentiroso que prohíbe el anti objetivo 1.
11. **El estado guarda la serie diaria por app y por tienda**, no solo el
    acumulado, y el refresco diario calcula las tres métricas de una pasada. Son
    unos pocos números por día: a cambio, cambiar de métrica en `/admin` se ve al
    instante en vez de esperar hasta 24 h, y «30 días» deja de necesitar dos CSV
    mensuales de Play en cada consulta.
12. **Cero dependencias npm nuevas.** El backend tiene tres (`axios`, `dotenv`,
    `express`) y todos los providers hablan HTTP a mano. `crypto` de Node firma
    los dos JWT que hacen falta (RS256 para Google, ES256 para Apple), Cloud
    Storage tiene API JSON sobre HTTPS, y el respaldo público de Play se parsea
    aquí, igual de frágil que el de TikTok e Instagram y por las mismas razones.
    Así el despliegue en la Pi sigue siendo `git pull` + `systemctl restart`, sin
    `npm install` ni el árbol de `@google-cloud/storage` en una máquina con
    subtensión crónica.

## Las tres métricas

| Métrica | Google Play | App Store |
|---|---|---|
| **Descargas** (total histórico) | `Total User Installs` del último día disponible | Suma de `Counts` con `Download Type = First-time Download` desde el inicio del histórico |
| **Activas** (instalada ahora) | `Installs on active devices` | **No disponible** → la tarjeta muestra solo Play |
| **30 días** | Suma de `Daily User Installs` de los últimos 30 días | Suma de `First-time Download` de los últimos 30 días |

El nombre exacto de cada columna hay que confirmarlo contra un CSV real antes de
depender de él: Google documenta los nombres pero no su significado.

## Constructo: qué hay que hacer

### Backend

- `providers/GooglePlayProvider.js`: lee el CSV mensual del bucket con la cuenta
  de servicio, o cae al dato público si no hay credenciales. Devuelve un `Metric`
  como el resto de providers.
- `providers/AppStoreProvider.js`: firma el JWT, recorre el flujo de informes,
  descarga y descomprime el TSV, filtra y suma.
- Un servicio de acumulación con **estado persistido en `state/`** (no en
  `cache/`, que se sirve en público, ni en `CacheService`, que es en memoria y se
  pierde al reiniciar): guarda por app y tienda la serie diaria, la última fecha
  procesada y los dos ids de petición de Apple, para no volver a bajar todo el
  histórico cada día y para poder cambiar de métrica sin volver a pedir nada.
- Refresco diario propio, con su hora y su reintento, independiente de
  `refreshSeconds`.
- `ProviderFactory`: registrar los dos tipos.
- `SettingsService`: añadir a `CHANNEL_TYPES` `googleplay` y `appstore`; a
  `SECRET_NAMES` las credenciales nuevas; validar la configuración nueva.
- `AlertService`: alertas para credenciales ausentes o inválidas, informe de
  Apple todavía no generado, petición detenida por inactividad y datos obsoletos
  más allá de lo esperable. Se verán en `/admin` → Estado y en el icono de aviso
  del kiosco, como ya pasa con los tokens de Meta.

### Panel `/admin`

- **Tokens y claves**: JSON de la cuenta de servicio de Play (multilínea), URI del
  bucket, y para Apple el `.p8`, el Key ID y el Issuer ID. Mismas reglas que el
  resto: nunca se muestran enteras, vacío significa "no cambiar".
- **Ajustes generales**: selector de `downloadsMetric`.
- **Proyectos y cuentas**: los dos tipos de canal nuevos, con `packageName` y
  `appleId`.

### Frontend

- Componente de tarjeta de tiendas que agrupa los `Metric` de tipo `googleplay` y
  `appstore` en una sola tarjeta, con el título = métrica y una celda por tienda.
  Si solo hay una tienda con dato, se pinta solo esa celda.
- Iconos `googleplay.svg` y `appstore.svg`.
- Maqueta de referencia (opción C):
  `.superpowers/brainstorm/7539-1794408973/content/tarjetas-descargas.html`

### Tests

El repo tiene test por servicio y por provider, sin red. Hacen falta, como
mínimo: fixtures de un CSV de Play **en UTF-16** y de un TSV `.gz` de Apple;
el filtrado por `Download Type`; la acumulación incremental y su persistencia;
el respaldo público de Play; y el caso de la métrica que Apple no tiene.

### Documentación

El `README.md` necesita la puesta en marcha de las dos tiendas, al nivel de
detalle de la sección que ya existe para el token de Instagram/Facebook: cómo
invitar la cuenta de servicio en Play Console con *View app information* en
Global, de dónde se copia el URI del bucket, y que la clave de App Store Connect
necesita rol **Admin** para crear la petición la primera vez y que el primer
informe tarda 1 o 2 días.

## Lo que queda abierto para quien construya

1. **Qué fichero del bucket usar.** La documentación no confirma un `_overview`;
   hay que listar el bucket real y elegir la dimensión con menos ruido (si hay
   que usar una dimensionada, agregar las filas del día).
2. **El `name` exacto del informe de Apple.** Se descubre listando los informes
   de la categoría `COMMERCE`; hay variantes *Standard* y *Detailed*. Elegir la
   más barata que traiga `Download Type` y `Counts`.
3. **El significado real de las columnas de Play.** Confirmar con un CSV de
   verdad que `Total User Installs` es el acumulado histórico y no un total del
   mes antes de usarlo como "total".
4. **La hora del refresco diario** y la política de reintento.
5. **Qué hacer los primeros dos días**, mientras Apple genera su primer informe:
   lo coherente con la decisión 4 del titular es mostrar solo Play, con la alerta
   explicando por qué.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
