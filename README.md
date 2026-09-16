## Running in Docker

The root `Dockerfile` builds a single image containing both the frontend (built with Vite) and the backend (`server/`, compiled with `tsc`); the backend serves the built frontend itself, so one container is all you need.

```sh
docker compose build
docker compose up
```

Before running, set the backend's real secrets in `server/.env` (see `server/.env.example`) — `docker-compose.yml` loads that file directly. Two values need to match how you actually reach the container:

- `OAUTH_REDIRECT_URI` — must be `http://<host>:8787/callback` and match an Authorized redirect URI on the OAuth client in Google Cloud Console.
- `FRONTEND_ORIGIN` — the origin you load the app from, e.g. `http://localhost:8787` (frontend and backend share one origin in the container, unlike local dev where Vite proxies to a separate backend port).

The SQLite database persists in the `health-data` named volume across restarts. `NODE_ENV=production` is intentionally **not** set in the image — `server/src/session.ts` marks the session cookie `Secure` only when it is, and browsers refuse `Secure` cookies over plain HTTP. Running on `localhost`/a trusted LAN over HTTP works as shipped; if you expose the container beyond that, put a TLS-terminating reverse proxy in front and set `NODE_ENV=production` yourself so the cookie gets the `Secure` attribute.

Without compose:

```sh
docker build -t health-dashboard .
docker run -p 8787:8787 --env-file server/.env -v health-data:/app/data health-dashboard
```

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
