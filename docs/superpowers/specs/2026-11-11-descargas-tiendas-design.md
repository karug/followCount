# Descargas de las tiendas en la pantalla

> Diseño. 2026-11-12 (reescrito: la versión anterior usaba las APIs de las dos
> consolas; el titular las ha descartado).

## Intención

Que cada proyecto de la pantalla pueda mostrar, junto a sus seguidores, cuánta
gente se ha descargado su app.

## La restricción que manda

**Sin APIs nuevas y sin credenciales.** Solo lo que se puede leer de la web
pública. Y refresco de tres o cuatro veces al día, no cada minuto.

Esto decide el diseño entero, porque la web pública de las dos tiendas no
ofrece lo mismo:

| Tienda | ¿Publica descargas en la ficha? |
|---|---|
| Google Play | Sí, como escalón: `10+`, `1.000+`, `1 M+` |
| App Store | No. La ficha de Apple solo publica la nota y el número de valoraciones |

Apple, por tanto, queda fuera. No es una decisión de diseño: el dato no existe
en ninguna página pública de Apple. Para tenerlo hay que pedirle un informe con
la API de App Store Connect y una clave `.p8`, que es exactamente lo que se ha
descartado. Y ya estaba dicho: si Apple no se puede, se muestra solo Play.

## Qué se vería hoy en la pantalla

Comprobado contra las fichas reales el 2026-11-12:

| App | Identificador | Ficha pública | Suelo | Techo |
|---|---|---|---|---|
| Expirio | `app.expirio` | `10+` | 10 | 18 |
| SavePiks | `com.savepiks.app` | `1+` | 1 | 2 |

El HTML de la ficha trae los tres juntos, en esta forma:
`["10+",10,18,"10+"]`. El primero es el texto que Google muestra; los otros dos
son el suelo y el techo del escalón.

Dos cosas que conviene mirar de frente:

1. **Es un escalón, no una cifra.** Hoy Expirio diría `10+`, que puede ser 10 o
   49. Cuando el escalón sea `1.000+`, puede ser 1.000 o 4.999. El dato no se
   afina nunca; es así en la ficha.
2. **A este volumen se ve pequeño.** `1+` ocupando una tarjeta entera es poco
   premio. Mejora solo cuando las apps crezcan: la tarjeta cobra sentido a
   partir de `1.000+`.

## Decisiones del titular

1. Las dos tiendas, si se puede. (Apple no se puede: ver arriba.)
2. La métrica debía poder elegirse en `/admin` entre totales, activas y últimos
   30 días.
3. Una sola tarjeta «Descargas» con las dos tiendas dentro (la opción C de las
   maquetas).
4. Si Apple no hay forma, se muestra solo Play.
5. Sin APIs externas ni accesos; de la web pública; tres o cuatro veces al día.
6. De la forma más sencilla posible.

Las decisiones 5 y 6 son posteriores y se comen a la 2 y a la 3:

- **La 2 se cae.** La ficha pública solo conoce un número. No hay activas ni
  últimos 30 días que elegir, así que un selector con una sola opción sería un
  mueble vacío. Si algún día entra otra fuente, el selector se añade entonces.
- **La 3 se cae.** La tarjeta compartida existía para meter dos celdas, Play y
  Apple. Con una sola celda no hay nada que compartir, y una tarjeta especial de
  una celda es más código que la tarjeta normal que ya existe.

## Decisiones mías

1. **Es un canal más, no un subsistema.** `playstore` se suma a los siete tipos
   de canal que ya hay, con su `packageName`, y entra en el array `channels` del
   proyecto como `youtube` o `tiktok`. Hereda sin escribir nada: el refresco, la
   caché, el `lastGood` persistido de `metrics.json`, la caché negativa, las
   alertas y la tarjeta. Es lo más sencillo que puede ser.
2. **Las tres o cuatro veces al día son `cacheSeconds: 21600`.** El campo ya
   existe por canal y nadie más lo necesita; seis horas son cuatro lecturas al
   día. Sin servicio de refresco propio, sin estado nuevo, sin serie diaria.
3. **Cero dependencias npm.** Un `GET` con el axios que ya está y una expresión
   regular contra `\["(\d[\d.,\s]*\+?)",(\d+),(\d+),"\1"` sacan el texto, el
   suelo y el techo de una vez. La retrorreferencia final no es adorno: en la
   ficha el cuarto campo repite literalmente el primero, y anclarlo es lo que
   impide que un array vecino de la misma forma cuele un número ajeno como si
   fuera bueno. `google-play-scraper` traería 20 ficheros y un árbol de
   dependencias para esta línea. El despliegue en la Pi sigue siendo `git pull`
   y reiniciar.
4. **Se muestra el suelo de la ficha con su sufijo, no un número inventado.** El
   `Metric` lleva `value: 10` (el suelo) y el sufijo `+` aparte; la tarjeta pinta
   el suelo compactado con el sufijo detrás, como las otras siete tarjetas
   compactan (con `1.000+` en la ficha, la pantalla dirá `1.0K+`), y
   `metadata.text` guarda el texto literal de la ficha para diagnosticar.
   Pintar `10` a secas convertiría un escalón en una cifra exacta, que es
   mentira por abajo; pintar el techo lo sería por arriba.
5. **No puede ser el canal principal.** El contador grande es `FlipCounter`,
   seis dígitos numéricos: no sabe pintar `10+`. Y `ProjectViewModel` saca de la
   fila de tarjetas al canal principal, con lo que un proyecto con solo esto
   arriba se quedaría sin fila. `validateChannel` lo rechaza con un mensaje
   claro.
6. **Si la ficha cambia de forma, el canal desaparece con su alerta.** Es lo que
   ya hace cualquier provider que falla: `lastGood` sostiene el último valor
   bueno mientras se arregla la expresión regular. Nada de pintar un cero.

## Lo que hay que construir

Un canal nuevo cuesta exactamente esto en este proyecto, y nada más:

- `backend/providers/PlayStoreProvider.js` — el `GET` a
  `play.google.com/store/apps/details?id=<packageName>&hl=es&gl=es`, la
  expresión regular y el `Metric`. Cabecera `User-Agent` de navegador: sin ella
  Google responde otra página.
- `backend/services/ProviderFactory.js` — una línea de registro.
- `backend/services/SettingsService.js` — `playstore` en `CHANNEL_TYPES`, y en
  `validateChannel` exigir `packageName` (en vez del `username` que piden los
  demás) y rechazarlo como `primaryChannel`.
- `frontend/admin/admin.js` — `playstore` en su `CHANNEL_TYPES`, con el campo
  `packageName`.
- `frontend/js/components/SocialCard.js` — pintar el sufijo cuando venga.
- `frontend/icons/playstore.svg`, y el color y la sombra de la tarjeta en
  `variables.css`, `components.css` y `style.css`, como los otros siete.
- Tests: el provider contra un HTML de ficha guardado como fixture (uno real de
  Expirio, recortado), la validación del canal nuevo en
  `SettingsService.test.js`, y el caso del escalón grande (`1.000+`, con el
  punto de los miles español) para que el parseo no se rompa cuando las apps
  crezcan.
- `README` y `docs/`: el tipo de canal nuevo, qué significa el `+` y por qué
  Apple no está.

## Lo que queda abierto para quien construya

1. El `hl=es&gl=es` fija el idioma y el país de la ficha. Con otro idioma el
   separador de miles cambia. Déjalo fijo y que el fixture del test sea español.
2. Google puede servir una página distinta sin avisar. El test del fixture
   detecta que el parseo se rompió, no que Google cambió: si la pantalla pierde
   la tarjeta, lo primero que hay que mirar es si el patrón sigue ahí.
3. Cerrado: el título de la tarjeta lo pone `SocialCard` a partir del `type`,
   igual que en las otras siete, así que dirá «Playstore». El `label` del
   `Metric` lleva el `packageName`, que es lo que identifica a la app. Poner
   «Descargas» en el título obligaría a tocar `SocialCard` para una excepción, y
   en una tarjeta de Play el número que se espera son descargas.
