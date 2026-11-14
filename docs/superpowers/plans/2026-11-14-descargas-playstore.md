# Plan de implementación: descargas de Google Play en la pantalla

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usa
> superpowers:subagent-driven-development (recomendada) o
> superpowers:executing-plans para implementar este plan tarea a tarea. Los
> pasos usan casillas (`- [ ]`) para ir marcando.

**Objetivo:** que un proyecto de la pantalla pueda mostrar las descargas de su
app en Google Play como una tarjeta más, leyendo la ficha pública.

**Arquitectura:** un tipo de canal nuevo, `playstore`, al lado de los siete que
ya hay. Un provider hace un `GET` a la ficha pública y saca con una expresión
regular el escalón de instalaciones que Google publica (`10+`), su suelo y su
techo. Todo lo demás — refresco, caché, último valor bueno, alertas, tarjeta —
lo hereda de lo que ya existe; las tres o cuatro lecturas al día son el
`cacheSeconds` del canal puesto a 21600.

**Stack:** Node 20 + Express, `node --test`, axios a través de
`backend/utils/Http.js`, frontend en módulos ES sin framework.

**Diseño:** `docs/superpowers/specs/2026-11-11-descargas-tiendas-design.md`

## Restricciones globales

- **Cero dependencias npm nuevas.** Ni `google-play-scraper` ni nada. El `GET`
  va por `backend/utils/Http.js`, que ya envuelve axios.
- **La App Store queda fuera.** Su ficha pública no publica descargas. No
  escribas provider, canal, icono ni hueco para ella.
- **Sin estado nuevo en disco.** Nada de series diarias ni ficheros propios: el
  `lastGood` de `DashboardService` ya persiste el último valor bueno en
  `state/metrics.json`.
- **Sin selector de métrica en `/admin`.** La ficha conoce un número y solo uno.
- **Idioma de la ficha fijo:** `hl=es&gl=es` en la URL, siempre.
- **Imports sin comodines y estilo del fichero vecino** (líneas en blanco entre
  miembros, `require` arriba). Mira `backend/providers/TikTokProvider.js`: es el
  hermano más parecido de lo que vas a escribir.
- **Textos de cara al titular en español** (mensajes de validación, etiquetas
  del panel, documentación). Los identificadores de código, en inglés.
- **Los tests se corren desde `backend/`**, donde está el `package.json`:
  `npm test` para todos, `node --test --test-name-pattern "<nombre>" test/<fichero>.test.js`
  para uno. Las dependencias ya están instaladas en este worktree.

## Puntos de revisión

Cinco cosas que el diseño da por supuestas y que, sin un test que las fije,
romperían la pantalla del titular. Cada una tiene su test en la tarea que posee
el código:

1. **El escalón crece y trae separador de miles** (`1.000+`, con punto en
   español). Es lo que pasará en cuanto las apps despeguen, y es el fallo que
   nadie vería venir. → Tarea 1.
2. **La ficha no existe o Google sirve otra página.** Tiene que lanzar error con
   un mensaje que diga qué app, para que `lastGood` sostenga el valor anterior y
   salte la alerta. Devolver `0` sería pintar una mentira. → Tarea 1.
3. **Un escalón sin `+`.** Google publica también cifras cerradas en algunas
   fichas. El parseo no debe exigir el `+`. → Tarea 1.
4. **`packageName` ausente, vacío o con espacios.** El canal no puede guardarse
   así, y lo que llegue a la URL va codificado. → Tareas 2 y 1.
5. **`playstore` como canal principal.** La validación lo rechaza, pero
   `ProjectViewModel.primary` tiene un respaldo que coge `metrics[0]` cuando el
   principal falla: con un proyecto cuyo único canal vivo sea Play, el contador
   grande de seis dígitos pintaría `000010` y se perdería el `+`. → Tareas 2 y 3.

---

### Tarea 1: el provider de Google Play

**Ficheros:**
- Crear: `backend/providers/PlayStoreProvider.js`
- Test: `backend/test/providers.test.js` (añadir al final; es donde viven los
  tests de los otros providers)

**Interfaces:**
- Consume: `backend/utils/Http.js` (`Http.get(url, config)`) y
  `backend/models/Metric.js`.
- Produce: `class PlayStoreProvider` con
  - `extractInstalls(html: string): { text: string, min: number, max: number } | null`
  - `toMetric(installs, packageName: string): Metric`
  - `async fetch(channel: { packageName: string }): Promise<Metric>`

  El `Metric` que produce lo consumen las tareas 3 y 4:
  `type: "playstore"`, `label: packageName`, `value: min`, `logo: null`,
  `metadata: { text, min, max, suffix, url }`, donde `suffix` es `"+"` cuando el
  texto de la ficha acaba en `+` y `""` cuando no.

- [ ] **Paso 1: escribe los tests que fallan**

Al final de `backend/test/providers.test.js`. El HTML va en línea, como hacen
los tests de `toMetric` de los otros providers: el fragmento de abajo es el real
de la ficha de Expirio del 2026-11-12.

```js
const PlayStoreProvider = require("../providers/PlayStoreProvider");

test("playstore extractInstalls saca el escalón, el suelo y el techo", () => {

    const provider = new PlayStoreProvider();

    const html = `]]],["22 jun 2026",[1782134073,512000000]],null,null,["10+",10,18,"10+"],null,null`;

    assert.deepStrictEqual(
        provider.extractInstalls(html),
        { text: "10+", min: 10, max: 18 }
    );

});

test("playstore extractInstalls aguanta el separador de miles español", () => {

    const provider = new PlayStoreProvider();

    const html = `null,null,["1.000+",1000,4999,"1.000+"],null`;

    assert.deepStrictEqual(
        provider.extractInstalls(html),
        { text: "1.000+", min: 1000, max: 4999 }
    );

});

test("playstore extractInstalls acepta un escalón sin el más", () => {

    const provider = new PlayStoreProvider();

    assert.deepStrictEqual(
        provider.extractInstalls(`null,["500",500,500,"500"],null`),
        { text: "500", min: 500, max: 500 }
    );

});

test("playstore extractInstalls devuelve null cuando el patrón no está", () => {

    const provider = new PlayStoreProvider();

    assert.strictEqual(
        provider.extractInstalls("<html>otra página</html>"),
        null
    );

});

test("playstore toMetric lleva el sufijo en los metadatos", () => {

    const provider = new PlayStoreProvider();

    const metric = provider.toMetric(
        { text: "10+", min: 10, max: 18 },
        "app.expirio"
    );

    assert.strictEqual(metric.type, "playstore");

    assert.strictEqual(metric.label, "app.expirio");

    assert.strictEqual(metric.value, 10);

    assert.strictEqual(metric.logo, null);

    assert.strictEqual(metric.metadata.suffix, "+");

    assert.strictEqual(metric.metadata.max, 18);

    assert.strictEqual(metric.metadata.text, "10+");

});

test("playstore toMetric deja el sufijo vacío sin el más", () => {

    const provider = new PlayStoreProvider();

    const metric = provider.toMetric(
        { text: "500", min: 500, max: 500 },
        "app.expirio"
    );

    assert.strictEqual(metric.metadata.suffix, "");

});

test("playstore fetch lanza cuando la ficha no trae instalaciones", async () => {

    const provider = new PlayStoreProvider();

    provider.extractInstalls = () => null;

    await assert.rejects(
        () => provider.fetch({ packageName: "app.inexistente" }),
        /app\.inexistente/
    );

});
```

- [ ] **Paso 2: córrelos para verlos fallar**

Desde `backend/`:
`node --test --test-name-pattern "playstore" test/providers.test.js`
Esperado: FALLO con `Cannot find module '../providers/PlayStoreProvider'`.

- [ ] **Paso 3: escribe `PlayStoreProvider` en `backend/providers/PlayStoreProvider.js`**

Copia la forma de `TikTokProvider`: la misma cabecera `User-Agent` de navegador
y `Accept: text/html` (sin ella Google sirve otra página), y el mismo reparto
entre un `fetch` que pide y un método puro que parsea.

La URL: `https://play.google.com/store/apps/details?id=<packageName>&hl=es&gl=es`,
con el `packageName` pasado por `encodeURIComponent`.

El patrón, que es el meollo: en el HTML de la ficha el dato viaja como
`["10+",10,18,"10+"]`. La expresión regular que lo pesca es

```js
/\["(\d[\d., \s]*\+?)",(\d+),(\d+),"/
```

y los tres grupos son el texto, el suelo y el techo. Usa el primer match: hoy es
el único, y si algún día hubiera más, el primero es el de la cabecera de la
ficha. `extractInstalls` devuelve `null` si no hay match, y `fetch` convierte ese
`null` en un `Error` cuyo mensaje nombra el `packageName`.

- [ ] **Paso 4: córrelos para verlos pasar**

Desde `backend/`:
`node --test --test-name-pattern "playstore" test/providers.test.js`
Esperado: PASA, 7 tests.

- [ ] **Paso 5: compruébalo contra la ficha de verdad**

Desde `backend/`, un `node -e` de una línea que llame a
`fetch({ packageName: "app.expirio" })` e imprima el metric. Esperado: `value`
10 o más y `metadata.text` acabando en `+`. Si Google ha cambiado la página, esto
es lo que lo dice; los tests con HTML en línea no pueden saberlo.

- [ ] **Paso 6: commit**

```bash
git add backend/providers/PlayStoreProvider.js backend/test/providers.test.js
git commit -m "feat(playstore): provider que lee las instalaciones de la ficha pública"
```

---

### Tarea 2: el canal nuevo en la configuración

**Ficheros:**
- Modificar: `backend/services/ProviderFactory.js` (import y registro)
- Modificar: `backend/services/SettingsService.js` (`CHANNEL_TYPES` en la línea
  30, `validateChannel` en las líneas 60-88, y la comprobación de
  `primaryChannel` en las líneas 135-138)
- Test: `backend/test/SettingsService.test.js` y `backend/test/providers.test.js`

**Interfaces:**
- Consume: `PlayStoreProvider` de la tarea 1.
- Produce: el tipo de canal `playstore` validado, con `packageName` obligatorio
  y vetado como `primaryChannel`. Las tareas 3 y 4 cuentan con que un canal así
  ya se puede guardar.

- [ ] **Paso 1: escribe los tests que fallan**

En `backend/test/SettingsService.test.js`, siguiendo el estilo de los tests de
validación que ya hay:

```js
test("un canal playstore exige packageName", () => {

    const errors = validateConfig({
        projects: [{ name: "Expirio", channels: [{ type: "playstore" }] }]
    });

    assert.strictEqual(errors.length, 1);

    assert.match(errors[0], /packageName/);

});

test("un canal playstore rechaza un packageName en blanco", () => {

    const errors = validateConfig({
        projects: [{
            name: "Expirio",
            channels: [{ type: "playstore", packageName: "   " }]
        }]
    });

    assert.strictEqual(errors.length, 1);

    assert.match(errors[0], /packageName/);

});

test("un canal playstore con packageName es válido", () => {

    const errors = validateConfig({
        projects: [{
            name: "Expirio",
            channels: [{ type: "playstore", packageName: "app.expirio", cacheSeconds: 21600 }]
        }]
    });

    assert.deepStrictEqual(errors, []);

});

test("playstore no puede ser el canal principal", () => {

    const errors = validateConfig({
        projects: [{
            name: "Expirio",
            channels: [{ type: "playstore", packageName: "app.expirio" }],
            primaryChannel: "playstore"
        }]
    });

    assert.strictEqual(errors.length, 1);

    assert.match(errors[0], /principal/);

});
```

Y en `backend/test/providers.test.js`, que es donde vive `makeSettings`:

```js
test("la fábrica conoce el proveedor de playstore", () => {

    const factory = new ProviderFactory(makeSettings());

    assert.ok(factory.has("playstore"));

});
```

- [ ] **Paso 2: córrelos para verlos fallar**

Desde `backend/`: `npm test 2>&1 | tail -20`
Esperado: los cinco fallan — los cuatro primeros porque `playstore` no está en
`CHANNEL_TYPES` y el error que sale es «tipo de canal desconocido», el quinto
porque la fábrica no lo tiene.

- [ ] **Paso 3: añade el tipo**

- `ProviderFactory`: el `require` y
  `this.register("playstore", new PlayStoreProvider())`. Sin `settings`: este
  provider no usa secretos.
- `SettingsService`: `"playstore"` al final de `CHANNEL_TYPES`; en
  `validateChannel`, una rama que exija `channel.packageName` no vacío (los
  demás tipos piden `username`, que este no tiene) con un mensaje en español que
  nombre `packageName`; y donde se comprueba `primaryChannel`, rechazarlo
  cuando apunte a un canal `playstore`, con un mensaje que explique que no puede
  ser el canal principal.

- [ ] **Paso 4: córrelo todo**

Desde `backend/`: `npm test 2>&1 | tail -10`
Esperado: PASA, sin regresiones en los otros tests de validación.

- [ ] **Paso 5: commit**

```bash
git add backend/services/ProviderFactory.js backend/services/SettingsService.js backend/test/
git commit -m "feat(playstore): registrar el canal y validar su packageName"
```

---

### Tarea 3: la tarjeta en la pantalla

**Ficheros:**
- Modificar: `frontend/js/components/SocialCard.js` (el valor se pinta en dos
  sitios: `update` y `#buildBody`)
- Modificar: `frontend/js/viewmodels/ProjectViewModel.js` (el getter `primary`)
- Crear: `frontend/icons/playstore.svg`
- Modificar: `frontend/css/variables.css` (líneas 47-53 y 59-63),
  `frontend/css/components.css` (junto a `.social-card.tiktok`, línea 338) y
  `frontend/css/style.css` (línea 22)

**Interfaces:**
- Consume: el `Metric` de la tarea 1 — lee `metadata.suffix`.
- Produce: nada que otra tarea use.

Este proyecto no tiene tests de lógica de frontend (los de `backend/test` solo
comprueban que los ficheros se sirven), y montar un runner de módulos ES para
tres líneas sería más andamio que obra. Así que aquí la verificación es mirar la
pantalla, y es un paso obligatorio del plan, no un extra.

- [ ] **Paso 1: pinta el sufijo en `SocialCard`**

En los dos sitios donde hoy pone `Formatter.compact(metric.value)`, concatenar
`metric.metadata?.suffix ?? ''`. Nada más: una tarjeta sin sufijo se pinta
exactamente igual que antes.

- [ ] **Paso 2: protege el contador grande en `ProjectViewModel`**

El getter `primary` cae hoy a `metrics[0]` cuando el canal principal ha fallado.
Intercala antes un `find` que prefiera una métrica sin `metadata.suffix`, y deja
`metrics[0]` como último recurso: una pantalla con el escalón en el contador es
mejor que una pantalla vacía, pero solo si no hay nada mejor.

- [ ] **Paso 3: el icono y los colores**

`frontend/icons/playstore.svg`: un SVG de 24×24 como los otros siete —
`viewBox="0 0 24 24"`, un solo `path`, `fill="#01875F"` (el verde de Google
Play), sin clases ni estilos. La silueta del triángulo de Play basta; a 24
píxeles los cuatro colores de la marca no se distinguen.

En `variables.css`, `--playstore:#01875f` y
`--shadow-playstore:0 0 18px rgba(1,135,95,.22)`, en su sitio dentro de cada
bloque. En `components.css`, el par `.social-card.playstore` /
`.social-card.playstore:hover` copiando los de `.tiktok`. En `style.css`, la
línea `.playstore{border-color:#01875f}`.

- [ ] **Paso 4: míralo en la pantalla**

Arranca `npm start` desde `backend/`, añade a un proyecto un canal
`{ "type": "playstore", "packageName": "app.expirio", "cacheSeconds": 21600 }` y
abre la pantalla. Esperado: una tarjeta con el icono verde y `10+` debajo. Haz
una captura y guárdala para la revisión.

- [ ] **Paso 5: commit**

```bash
git add frontend/
git commit -m "feat(playstore): tarjeta de descargas con el escalón de la ficha"
```

---

### Tarea 4: el panel y la documentación

**Ficheros:**
- Modificar: `frontend/admin/admin.js` (`CHANNEL_TYPES` línea 17,
  `channelFields` líneas 456-472, el handler de cambio de tipo líneas 492-504, y
  el select de canal principal líneas 548-552)
- Modificar: `README.md` y lo que haya en `docs/` sobre tipos de canal

**Interfaces:**
- Consume: la validación de la tarea 2. El panel no debe dejar guardar nada que
  el backend vaya a rechazar.

- [ ] **Paso 1: el canal en el panel**

- `playstore` en `CHANNEL_TYPES`.
- `channelFields`: una rama `case "playstore"` con
  `field("Package name", channel, "packageName")`. Sin ella caería en el
  `default`, que pide «Usuario», y el canal se guardaría inválido.
- El handler de cambio de tipo borra los identificadores que el tipo nuevo no
  usa: añade `packageName` a esa lista, igual que `channelId` o `pageId`.
- El select de canal principal se construye con los tipos de los canales del
  proyecto: quita `playstore` de esa lista, porque el backend lo rechaza. Si
  estaba elegido, `dropOrphanPrimary` ya se encarga.

- [ ] **Paso 2: compruébalo en el panel**

Con el servidor arrancado, en `/admin`: añade un canal, elige `playstore`,
comprueba que el campo que pide es «Package name», que `playstore` no aparece en
el desplegable de canal principal, y que al guardar con el campo vacío sale el
mensaje de validación en español y no un 500.

- [ ] **Paso 3: la documentación**

En el `README` y en los documentos de `docs/` que enumeren los tipos de canal:
añade `playstore` con su `packageName`, di que el número es el escalón que
publica Google (`10+` puede ser cualquier cosa entre 10 y 49), recomienda
`cacheSeconds: 21600` y explica en una línea que la App Store no está porque su
ficha pública no publica descargas.

- [ ] **Paso 4: todo verde**

Desde `backend/`: `npm test 2>&1 | tail -10`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add frontend/admin/admin.js README.md docs/
git commit -m "feat(playstore): configurar el canal desde /admin y documentarlo"
```
