# followCount - Estado del proyecto

## Estado actual

El proyecto ya dispone de una arquitectura separada:

    frontend/
    backend/

### Backend

Implementado:

-   Express
-   `/api/dashboard`
-   CacheService
-   LogoService
-   ProviderFactory
-   DashboardService
-   Modelos `Project` y `Metric`
-   Provider de GitHub
-   Provider de YouTube mediante YouTube Data API v3
-   Descarga y cacheado de logos
-   Configuración mediante `.env`
-   `config.json` con proyectos

Actualmente el backend devuelve correctamente:

-   Logo del proyecto
-   Nombre
-   Canal principal
-   Métricas
-   Logo de GitHub
-   Logo de YouTube

### Frontend

Implementado:

-   Arquitectura modular ES Modules
-   Dashboard
-   Carousel
-   Header
-   ProjectView
-   FlipCounter (simplificado a contador tipo odómetro)
-   SocialCard
-   StatusBar
-   Api
-   DashboardService
-   Formatter
-   Dom

CSS separado en:

-   variables.css
-   reset.css
-   layout.css
-   components.css
-   animations.css

## Estado visual

Pasada de diseño completada (2026-07-12):

-   Márgenes ajustados para 480x320.
-   Logo a 56px, header a 60px.
-   Reloj y WiFi alineados en una fila.
-   Cuadrícula de tarjetas con `grid-auto-flow: column`: cualquier
    número de tarjetas reparte el ancho; una sola tarjeta ocupa todo.
-   Dígitos 40x64 para que quepan contadores de 9 cifras.

## Backend

Todos los providers implementados (2026-07-12) con la interfaz común
`fetch(channel) -> Metric`:

-   **GitHub**: followers, estrellas (suma de repos), repos públicos.
    `GITHUB_TOKEN` opcional para subir el rate limit.
-   **Instagram**: endpoint público `web_profile_info` (sin credenciales).
-   **TikTok**: parseo del JSON embebido en la página de perfil
    (sin credenciales).
-   **Twitch**: Helix API con token de aplicación
    (`TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`).
-   **X**: API v2 (`X_BEARER_TOKEN`).

Caché por canal configurable con `cacheSeconds` en `config.json`.
El dashboard expone `refreshSeconds` y `slideSeconds` y el frontend
los usa (ya no están hardcodeados).

## Configuración

Mantener:

    config.json

Ejemplo:

``` json
{
  "refreshSeconds": 60,
  "projects": [
    {
      "name": "Expirio",
      "primaryChannel": "youtube",
      "channels": [
        {
          "type": "youtube",
          "channelId": "UC..."
        },
        {
          "type": "github",
          "username": "karug"
        }
      ]
    }
  ]
}
```

Credenciales únicamente en:

    .env

## Objetivo V1

-   [x] Dashboard estable.
-   [x] Cambio automático de proyectos.
-   [x] Datos reales.
-   [x] Logos cacheados.
-   [x] Sin dependencias innecesarias.
-   [ ] Funcionamiento continuo en Raspberry Pi (pendiente de
    probar en el dispositivo con `scripts/install.sh`).

## V2

-   Configuración web.
-   Edición de proyectos desde UI.
-   Hot reload de configuración.
-   Más proveedores.
-   Temas.
-   Exportación/importación.

## Observaciones

La arquitectura ya es suficientemente buena para continuar.

No se recomienda volver a reorganizar carpetas ni responsabilidades.

Las próximas iteraciones deberían centrarse únicamente en:

1.  Mejorar layout.
2.  Completar providers.
3.  Corregir pequeños bugs.
4.  Añadir funcionalidades.
