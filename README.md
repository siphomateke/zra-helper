# ZRA Helper

A browser extension that automates various aspects of the [ZRA website](https://www.zra.org.zm/).

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
