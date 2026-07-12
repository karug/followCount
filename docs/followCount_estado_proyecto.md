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

Funciona correctamente pero todavía necesita una pasada de diseño.

Pendiente:

-   Ajustar márgenes generales.
-   Aprovechar mejor los 480x320.
-   Cuadrícula definitiva de tarjetas.
-   Mejorar espaciado del header.
-   Ajustar tamaño del logo (≈56px).
-   Revisar alineación del reloj.
-   Optimizar layout cuando solo exista una tarjeta inferior.

## Backend pendiente

### GitHub

-   Añadir estrellas.
-   Añadir repositorios públicos.
-   Cache configurable.

### Instagram

Implementar provider.

### TikTok

Implementar provider.

### Twitch

Implementar provider.

### X

Implementar provider.

Todos deben implementar la misma interfaz:

    fetch(channel) -> Metric

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

-   Dashboard estable.
-   Cambio automático de proyectos.
-   Datos reales.
-   Logos cacheados.
-   Sin dependencias innecesarias.
-   Funcionamiento continuo en Raspberry Pi.

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
