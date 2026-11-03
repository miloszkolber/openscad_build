import CopyPlugin from 'copy-webpack-plugin';
import path from 'node:path';

const webRoot = import.meta.dirname;
const dist = path.resolve(webRoot, '../dist/web');

const common = {
  mode: 'production',
  context: webRoot,
  resolve: {extensions: ['.tsx', '.ts', '.js', '.mjs'], fallback: {fs: false, path: false, module: false}},
  module: {rules: [
    {test: /\.tsx?$/, exclude: /node_modules/, use: {loader: 'ts-loader', options: {transpileOnly: true}}},
    {test: /\.css$/, use: ['style-loader', {loader: 'css-loader', options: {url: false}}]},
    {test: /\.wasm$/, type: 'asset/resource'},
  ]},
};

export default [
  {...common, target: 'web', entry: './src/index.tsx',
    output: {filename: 'index.js', path: dist},
    plugins: [new CopyPlugin({patterns: [
      {from: path.join(webRoot, 'public'), to: '.'},
      {from: path.join(webRoot, '.assets/engine/openscad.wasm'), to: 'openscad.wasm'},
    ]})],
  },
  {...common, target: 'webworker', entry: './src/runner/openscad-worker.ts',
    output: {filename: 'openscad-worker.js', path: dist, globalObject: 'self'},
  },
];
