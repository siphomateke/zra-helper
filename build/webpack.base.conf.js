const path = require('path');
const fs = require('fs');
const utils = require('./utils.js');
const webpack = require('webpack');

const contentScriptsPath = 'src/js/content_scripts';
const contentScripts = fs.readdirSync(utils.resolve(contentScriptsPath));

const entry = {
    background: utils.resolve('src/js/background.js'),
    dashboard: utils.resolve('src/js/dashboard.js'),
}

for (const file of contentScripts) {
    const ext = path.extname(file);
    if (ext === '.js') {
        const filename = path.basename(file, ext);
        entry['content_scripts/'+filename] = utils.resolve(contentScriptsPath + '/' + file);
    }
}

module.exports = {
    entry,
    output: {
        path: utils.resolve('dist/js'),
        filename: '[name].js',
    },
    target: 'web',
    module: {
        rules: [
            {
                test: require.resolve('webextension-polyfill'),
                use: 'imports-loader?browser=>undefined',
            },
        ],
    },
    plugins: [
        new webpack.ProvidePlugin({
            'browser': 'webextension-polyfill',
        }),
    ],
};
