# ZRA Helper

A browser extension that automates various aspects of the [ZRA website](https://www.zra.org.zm/).

## Chrome Build

The chrome build currently doesn't work because it uses a different extension API. We previously automatically imported the `webextension-polyfill` API depending on which browser we were building for. But now we will probably have to update our code to manually import the polyfill everywhere `browser` is used.

## Project setup

```bash
yarn install
```

### Compiles and auto-reloads for development

```bash
yarn run serve:chrome
yarn run serve:firefox
```

### Compiles and minifies for production

```bash
yarn run build:chrome
yarn run build:firefox
yarn run build:all # Builds for all browsers (only works on UNIX based operating systems)
```

### Lints and fixes files

```bash
yarn run lint
```

### Debug with developer tools

First, change the `devtools` debug setting to true.
Then run:

```bash
yarn run devtools
```
