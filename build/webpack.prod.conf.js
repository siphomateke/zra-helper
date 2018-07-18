const merge = require('webpack-merge');
const baseWebpackConfig = require('./webpack.base.conf');
const utils = require('./utils.js');

module.exports = merge(baseWebpackConfig, {
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.js$/,
                loader: 'babel-loader',
                include: [utils.resolve('src')],
            },
        ]
    }
});