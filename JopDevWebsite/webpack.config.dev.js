const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',

  // Tell Webpack which HTML pages should exist locally
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
    }),

    new HtmlWebpackPlugin({
      template: './rakingpix/index.html',
      filename: 'rakingpix/index.html',
    }),

    new HtmlWebpackPlugin({
      template: './rakingpix/privacy.html',
      filename: 'rakingpix/privacy/index.html',
    }),

    new HtmlWebpackPlugin({
      template: './rakingpix/support.html',
      filename: 'rakingpix/support/index.html',
    }),

    new HtmlWebpackPlugin({
      template: './rakingpix/terms.html',
      filename: 'rakingpix/terms/index.html',
    }),
  ],

  devServer: {
    liveReload: true,
    hot: true,
    open: true,
    static: ['./'],
  },
});
