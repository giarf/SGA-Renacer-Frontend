# SGA Renacer Frontend

Aplicación Vue 3 + Vite para gestión operativa de donaciones, compras, entidades, familias, solicitudes, inventario y cuentas.

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
