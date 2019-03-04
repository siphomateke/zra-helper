const path = require('path');
const fs = require('fs');

const contentScriptEntries = {};

function addContentScripts(folder) {
  const contentScriptsPath = path.join('src/backend/content_scripts', folder);
  const contentScripts = fs.readdirSync(contentScriptsPath);
  for (const file of contentScripts) {
    const ext = path.extname(file);
    if (ext === '.js') {
      const filename = path.basename(file, ext);
      const outputPath = path.join('content_scripts', folder, filename);
      contentScriptEntries[outputPath] = path.join(contentScriptsPath, file);
    }
  }
}

addContentScripts('commands');
addContentScripts('pages');

const copy = [
  {
    from: 'node_modules/ocrad.js/ocrad.js',
    to: 'vendor',
  },
  {
    from: 'LICENSE.txt',
    to: '',
  },
  {
    from: 'src/assets/fonts/nunito-license.txt',
    to: 'fonts/',
  },
];

const browser = process.env.BROWSER ? process.env.BROWSER : 'chrome';

module.exports = {
  lintOnSave: false,
  productionSourceMap: false,
  chainWebpack: (config) => {
    config
      .plugin('copy')
      .tap(([paths]) => [paths.concat(copy)]);
    config.resolve.alias.set('styles', path.resolve(__dirname, './src/assets/scss'));

    config
      .plugin('define')
      .tap((args) => {
        args[0]['process.env'].BROWSER = `"${browser}"`;
        return args;
      });
  },
  pages: {
    dashboard: {
      entry: 'src/main.js',
      filename: 'app.html',
      title: 'ZRA Helper',
    },
    options: {
      entry: 'src/options/options.js',
      filename: 'options.html',
      title: 'Options',
    },
  },
  pluginOptions: {
    browserExtension: {
      components: {
        background: true,
        contentScripts: true,
        options: true,
      },
      api: 'browser',
      usePolyfill: true,
      autoImportPolyfill: true,
      componentOptions: {
        background: {
          entry: 'src/backend/background.js',
        },
        contentScripts: {
          entries: contentScriptEntries,
        },
      },
      manifestSync: ['version', 'description'],
      outputDir: `dist/${browser}`,
      manifestTransformer(originalManifest) {
        const manifest = Object.assign({}, originalManifest);
        if (browser === 'firefox') {
          // Remove pageCapture permission in Firefox
          const index = manifest.permissions.indexOf('pageCapture');
          manifest.permissions.splice(index, 1);
        } else if (browser === 'chrome') {
          delete manifest.applications;
        }
        return manifest;
      },
    },
  },
  outputDir: `dist/${browser}`,
};
