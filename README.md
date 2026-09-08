# SGA Renacer Frontend

Aplicación Vue 3 + Vite para gestión operativa de donaciones, compras, entidades, familias, solicitudes, inventario y cuentas.

## Asistencia en Comunidad

En **Comunidad → Asistencia**, crea un evento con nombre y fecha. La lista comienza vacía: busca personas por nombre o RUT y selecciónalas cuando lleguen. “Nueva persona” reutiliza el formulario existente y agrega a la persona creada al evento, incluso si no tiene RUT.

Cada evento admite columnas de **Sí/No**, **Texto** y **Número**, con nombres libres. Las casillas se guardan al marcarlas; texto y números al salir del campo o presionar Enter. Los encabezados muestran conteos y sumas del evento completo, aunque la tabla esté filtrada.

“Copiar enlace” permite abrir el mismo evento en otro equipo con acceso. La lista se actualiza cada tres segundos mientras está visible. Las altas repetidas no se duplican y una edición simultánea de la misma casilla muestra un conflicto para revisar el valor actual. Las ediciones de texto en curso se conservan durante las actualizaciones.

Disponible para los grupos de operación diaria (administradores y miembros). Las eliminaciones requieren confirmación en pantalla. Para habilitarlo en producción, desplegar primero el backend con las rutas `/api/asistencia/eventos` y luego este frontend.

## Desarrollo

```bash
pnpm install
pnpm dev
```

## Producción

```bash
pnpm build
```

## Deploy

Nixpacks/Coolify usa `nixpacks.toml`: instala con `pnpm install --frozen-lockfile`, compila con `pnpm build` y sirve `dist` con `pnpm start` en `$PORT`.

El proyecto usa `pnpm-lock.yaml`; no mantener `package-lock.json` en este repositorio.
