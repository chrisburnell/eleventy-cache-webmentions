const { AssetCache } = require("@11ty/eleventy-fetch");
const { styleText } = require("node:util");
const sanitizeHTML = require("sanitize-html");
const createCore = require("./src/core.cjs");

const core = createCore({ AssetCache, styleText, sanitizeHTML });

module.exports = core.eleventyCacheWebmentions;
Object.assign(module.exports, core);
