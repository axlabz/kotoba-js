const path = require('path')

const CopyPlugin = require('copy-webpack-plugin')

const OUTPUT_DIR = path.resolve(__dirname, 'build/web')

module.exports = (env, _args) => {
	const { devServer = false } = env || {}

	// Note: dev-server doesn't preserve module exports
	//
	// https://github.com/webpack/webpack-dev-server/issues/2484
	//
	// To get around that we add `injectClient: false` to the options, but to
	// preserve live reloading we use the `devServer` env trick below (to run
	// this use `npx webpack serve --env devServer`).

	const mainEntry = './src/index.ts'
	const config = {
		entry: devServer ? ['webpack-dev-server/client', mainEntry] : mainEntry,
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					use: 'ts-loader',
					exclude: /node_modules/,
				},
			],
		},
		resolve: {
			extensions: ['.tsx', '.ts', '.js'],
		},
		devtool: 'inline-source-map',
		output: {
			filename: 'kotoba.js',
			path: OUTPUT_DIR,
			library: 'kotoba',
		},
		optimization: {
			usedExports: false,
		},
		plugins: [
			new CopyPlugin({
				patterns: [{ from: 'src/index.html', to: OUTPUT_DIR }],
			}),
		],
		performance: {
			maxEntrypointSize: 2 * 1024 * 1024,
			maxAssetSize: 2 * 1024 * 1024,
		},
		devServer: {
			contentBase: OUTPUT_DIR,
			port: 9090,
			injectClient: false,
		},
	}
	return config
}
