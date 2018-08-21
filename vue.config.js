const path = require('path');
const fs = require('fs');

const contentScriptsPath = 'src/old/content_scripts';
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
  },
  pages: {
    dashboard: {
      entry: 'src/main.js',
      filename: 'dashboard.html',
      title: 'ZRA Helper | Dashboard',
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
          entry: 'src/old/background.js',
        },
        contentScripts: {
          entries: contentScriptEntries,
        },
      },
      manifestSync: ['version', 'description'],
    },
  },
};
