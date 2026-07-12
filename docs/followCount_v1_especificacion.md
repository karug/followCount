# followCount v1.0 - Especificación de implementación

## Objetivo

Construir un gadget para Raspberry Pi con pantalla SPI 480x320 que
muestre seguidores y métricas de varios proyectos (YouTube, GitHub,
Instagram, TikTok, Twitch y X) con una interfaz de aspecto comercial.

------------------------------------------------------------------------

# Tecnologías

## Backend

-   Node.js 20+
-   Express
-   Axios
-   node-cache
-   Sharp (logos)
-   systemd

## Frontend

-   HTML5
-   CSS3
-   JavaScript ES Modules
-   Sin frameworks

------------------------------------------------------------------------

# Arquitectura

    followCount/
    ├── backend/
    │   ├── server.js
    │   ├── config.json
    │   ├── cache/
    │   ├── providers/
    │   │   ├── youtube.js
    │   │   ├── github.js
    │   │   ├── instagram.js
    │   │   ├── tiktok.js
    │   │   ├── twitch.js
    │   │   └── x.js
    │   ├── services/
    │   │   ├── dashboard.js
    │   │   ├── logoService.js
    │   │   ├── cacheService.js
    │   │   └── scheduler.js
    │   └── public/
    ├── frontend/
    │   ├── index.html
    │   ├── css/
    │   ├── js/
    │   │   ├── app.js
    │   │   ├── carousel.js
    │   │   ├── counter.js
    │   │   ├── cards.js
    │   │   └── api.js
    │   ├── icons/
    │   ├── fonts/
    │   └── assets/
    ├── scripts/
    │   ├── install.sh
    │   ├── update.sh
    │   ├── uninstall.sh
    │   └── start.sh
    └── README.md

------------------------------------------------------------------------

# Configuración

``` json
{
  "refreshSeconds": 60,
  "slideSeconds": 8,
  "theme": "dark",
  "projects": [
    {
      "name": "Expirio",
      "primaryChannel": "youtube",
      "channels": [
        { "type": "youtube", "handle": "ExpirioApp" },
        { "type": "github", "owner": "Expirio" },
        { "type": "instagram", "username": "expirioapp" },
        { "type": "tiktok", "username": "expirioapp" }
      ]
    }
  ]
}
```

------------------------------------------------------------------------

# Backend

## Scheduler

-   Actualiza datos cada `refreshSeconds`.
-   Devuelve un modelo listo para pintar.

## Caché

-   Resolver `handle` -\> ID técnico una sola vez.
-   Descargar y cachear logotipos.
-   Cachear respuestas con TTL.

## Providers

Cada provider implementará:

-   resolve()
-   fetchStats()
-   fetchLogo()

Interfaz común:

``` ts
resolve(config): Promise<Entity>
fetchStats(entity): Promise<Metrics>
fetchLogo(entity): Promise<string>
```

------------------------------------------------------------------------

# Frontend

## Cabecera

-   Logo del proyecto
-   Nombre
-   Handle
-   Hora
-   Estado WiFi

## Tarjeta principal

-   Icono de la red
-   Contador mecánico animado
-   Animación tipo flip
-   Actualización por dígitos

## Tarjetas inferiores

Una tarjeta por canal:

-   SVG oficial
-   Color corporativo
-   Valor
-   Glow suave

## Carrusel

-   Scroll horizontal entre proyectos
-   Fade
-   Indicadores inferiores

------------------------------------------------------------------------

# Diseño

Resolución objetivo:

480x320

Paleta:

-   Fondo: #171717
-   Card: #242424
-   Borde: #303030
-   Texto principal: blanco
-   Texto secundario: #BFBFBF

Fuente:

Inter

------------------------------------------------------------------------

# APIs

## YouTube

-   Resolver handle
-   Subscribers
-   Views
-   Videos
-   Avatar

## GitHub

-   Stars
-   Followers
-   Avatar

## Instagram

-   Followers
-   Avatar

## TikTok

-   Followers
-   Avatar

## Twitch

-   Followers
-   Avatar

## X

-   Followers
-   Avatar

------------------------------------------------------------------------

# Instalación

`install.sh`

-   Instalar dependencias
-   npm install
-   Crear servicios systemd
-   Chromium kiosk
-   unclutter
-   Autostart

------------------------------------------------------------------------

# Mejoras

-   Página de configuración
-   Actualización OTA
-   Exportar/importar configuración
-   Soporte para más plataformas

------------------------------------------------------------------------

# Prioridad

## Fase 1

-   UI definitiva
-   Contador mecánico
-   YouTube

## Fase 2

-   GitHub
-   Instagram
-   TikTok

## Fase 3

-   Twitch
-   X
-   Configuración web

## Fase 4

-   Optimización Raspberry
-   OTA
-   Publicación
