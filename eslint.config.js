module.exports = [
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: 12,
			sourceType: "module",
		},
		languageOptions: {
			globals: {
				browser: true,
				commonjs: true,
				es2021: true,
			},
		},
	},
];
