import CopyPlugin from 'copy-webpack-plugin';
import path from 'node:path';
import webpack from 'webpack';

const webRoot = import.meta.dirname;
const dist = path.resolve(webRoot, 'dist');

// @gltf-transform/core dynamically imports node:fs and node:path for its
// optional NodeIO file reader. The browser only uses in-memory buffers.
const stripNodeScheme = new webpack.NormalModuleReplacementPlugin(/^node:(fs|path)$/, (resource) => {
  resource.request = resource.request.replace(/^node:/, '');
});

const common = {
  mode: 'production',
  context: webRoot,
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.mjs'],
    fallback: {fs: false, path: false, module: false}
  },
  plugins: [stripNodeScheme],
  module: {rules: [
    {test: /\.tsx?$/, exclude: /node_modules/, use: {loader: 'ts-loader', options: {transpileOnly: true}}},
    {test: /\.css$/, use: ['style-loader', {loader: 'css-loader', options: {url: false}}]},
    {test: /\.wasm$/, type: 'asset/resource'},
  ]},
};

export default [
  {...common, target: 'web', entry: './src/index.tsx',
    output: {filename: 'index.js', path: dist, publicPath: ''},
    plugins: [...common.plugins, new CopyPlugin({patterns: [
      {from: path.join(webRoot, 'public'), to: '.'},
      {from: path.join(webRoot, '.assets/engine/openscad.wasm'), to: 'openscad.wasm'},
    ]})],
  },
  {...common, target: 'webworker', entry: './src/runner/openscad-worker.ts',
    output: {filename: 'openscad-worker.js', path: dist, globalObject: 'self', publicPath: ''},
  },
];
