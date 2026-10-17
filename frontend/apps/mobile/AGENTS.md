This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

This app lives in a pnpm + Turborepo monorepo (`nodeLinker: hoisted`). Run commands from `apps/mobile`
(or from the repo root with `pnpm --filter mobile exec <cmd>`); do not use bun/yarn/npm to add packages.

```bash
pnpm exec expo install <package>  # ALWAYS use instead of pnpm add — resolves SDK-compatible versions
pnpm start                        # expo start (dev server)
pnpm android                      # expo run:android — build + install the development build
pnpm typecheck                    # tsc --noEmit
pnpm dlx expo-doctor              # diagnose dependency and config issues
pnpm exec expo install --fix      # fix incompatible package versions
```

No linter is configured yet (no ESLint config, no `lint` script). Run typecheck before declaring any task done.
Shared logic and constants come from `@geonarrate/core`, design tokens from `@geonarrate/tokens`.

## Navigation & Routing

- Current state: no router yet. The entry point is `index.ts` → `registerRootComponent(App)` with a single `App.tsx` screen.
- The design (docs chapter 05) uses **Expo Router**. When adding navigation, install `expo-router`, switch `main` in `package.json` to `expo-router/entry`, and put routes in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. `eas-cli` is a devDependency here: run it as `pnpm exec eas <command>`. Build profiles (`development`, `preview`, `production`) are in `eas.json`.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
