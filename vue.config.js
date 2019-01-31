const path = require('path');
const fs = require('fs');

const contentScriptsPath = 'src/backend/content_scripts';
const contentScripts = fs.readdirSync(contentScriptsPath);

const contentScriptEntries = {};
for (const file of contentScripts) {
  const ext = path.extname(file);
  if (ext === '.js') {
    const filename = path.basename(file, ext);
    contentScriptEntries[`content_scripts/${filename}`] = `${contentScriptsPath}/${file}`;
  }
}

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

module.exports = {
  lintOnSave: false,
  productionSourceMap: false,
  chainWebpack: (config) => {
    config
      .plugin('copy')
      .tap(([paths]) => [paths.concat(copy)]);
    config.resolve.alias.set('styles', path.resolve(__dirname, './src/assets/scss'));
  },
  pages: {
    dashboard: {
      entry: 'src/main.js',
      filename: 'app.html',
      title: 'ZRA Helper',
    },
  },
  pluginOptions: {
    browserExtension: {
      components: {
        background: true,
        contentScripts: true,
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
    },
  },
};