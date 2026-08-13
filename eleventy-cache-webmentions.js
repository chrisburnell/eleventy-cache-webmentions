import { AssetCache } from "@11ty/eleventy-fetch";
import { styleText } from "node:util";
import sanitizeHTML from "sanitize-html";
import createCore from "./src/core.cjs";

const core = createCore({ AssetCache, styleText, sanitizeHTML });

export const {
	defaults,
	getPublished,
	getWebmentionPublished,
	getReceived,
	getWebmentionReceived,
	getContent,
	getWebmentionContent,
	getSource,
	getWebmentionSource,
	getURL,
	getWebmentionURL,
	getTarget,
	getWebmentionTarget,
	getUniqueKey,
	getWebmentionUniqueKey,
	getType,
	getWebmentionType,
	getByTypes,
	getByType,
	getWebmentionsByTypes,
	getWebmentionsByType,
	processBlocklist,
	processWebmentionBlocklist,
	processWebmentionsBlocklist,
	processAllowlist,
	processWebmentionAllowlist,
	processWebmentionsAllowlist,
	fetchWebmentions,
	retrieveWebmentions,
	webmentionsByURL,
	webmentionsByUrl,
	filteredWebmentions,
	getWebmentions,
	eleventyCacheWebmentions,
} = core;

export default eleventyCacheWebmentions;
