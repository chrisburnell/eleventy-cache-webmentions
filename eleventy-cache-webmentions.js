import { AssetCache } from "@11ty/eleventy-fetch";
import { styleText } from "node:util";
import sanitizeHTML from "sanitize-html";

/**
 * @typedef {sanitizeHTML.IOptions} AllowedHTML
 */

/**
 * @typedef {object} OptionsDefaults
 * @property {boolean} refresh
 * @property {string} duration
 * @property {string} uniqueKey
 * @property {string} [cacheDirectory]
 * @property {AllowedHTML} allowedHTML
 * @property {Array<string>} allowlist
 * @property {Array<string>} blocklist
 * @property {{[key: string], string}} urlReplacements
 * @property {number} maximumHtmlLength
 * @property {string} maximumHtmlText
 */

/**
 * @typedef {object} OptionsUserInput
 * @property {string} domain
 * @property {string} feed
 * @property {string} key
 */

/**
 * @typedef {OptionsDefaults & OptionsUserInput} Options
 */

/**
 * @typedef {object} Webmention
 * @property {string} [source]
 * @property {string} [url]
 * @property {string} [target]
 * @property {string} [published]
 * @property {string} [contentSanitized]
 * @property {object} [content]
 * @property {string} [content.html]
 * @property {string} [content.value]
 * @property {object} [data]
 * @property {string} [data.title]
 * @property {string} [data.url]
 * @property {string} [data.published]
 * @property {string} [data.content]
 * @property {string} [type]
 * @property {object} [activity]
 * @property {string} [activity.type]
 * @property {boolean} [verified]
 * @property {string} ["wm-property"]
 * @property {string} ["wm-received"]
 * @property {string} ["wm-source"]
 * @property {string} ["wm-target"]
 * @property {string} ["verified_date"]
 */

/**
 * @typedef {"bookmark-of"|"like-of"|"repost-of"|"mention-of"|"in-reply-to"} WebmentionType
 */

/**
 * @type {OptionsDefaults}
 */
export const defaults = {
	refresh: false,
	duration: "1d",
	uniqueKey: "webmentions",
	cacheDirectory: undefined,
	allowedHTML: {
		allowedTags: ["a", "b", "em", "i", "strong"],
		allowedAttributes: {
			a: ["href"],
		},
	},
	allowlist: [],
	blocklist: [],
	urlReplacements: {},
	maximumHtmlLength: 1000,
	maximumHtmlText: "mentioned this in",
};

/**
 * @param {string} url
 * @param {string} domain
 * @returns {string}
 */
const absoluteURL = (url, domain) => {
	try {
		return new URL(url, domain).toString();
	} catch (error) {
		console.error(
			`Trying to convert ${styleText(
				"bold",
				url,
			)} to be an absolute url with base ${styleText(
				"bold",
				domain,
			)} and failed.`,
			error,
		);
		return url;
	}
};

/**
 * @param {string} url
 * @returns {string}
 */
const baseURL = (url) => {
	let hashSplit = url.split("#");
	let queryparamSplit = hashSplit[0].split("?");
	return queryparamSplit[0];
};

/**
 * @param {string} url
 * @param {{[key: string], string}} [urlReplacements]
 * @returns {string}
 */
const fixURL = (url, urlReplacements) => {
	return Object.entries(urlReplacements).reduce(
		(accumulator, [key, value]) => {
			const regex = new RegExp(key, "g");
			return accumulator.replace(regex, value);
		},
		url,
	);
};

/**
 * @param {string} url
 * @returns {string}
 */
const hostname = (url) => {
	if (typeof url === "string" && url.includes("//")) {
		const urlObject = new URL(url);
		return urlObject.hostname;
	}
	return url;
};

/**
 * @param {string|number|Date} date
 * @returns {number}
 */
const epoch = (date) => {
	return new Date(date).getTime();
};

/**
 * @param {Array<Webmention>} webmentions
 * @returns {Array<Webmention>}
 */
const removeDuplicates = (webmentions) => {
	return [
		...webmentions
			.reduce((map, webmention) => {
				const key =
					webmention === null || webmention === undefined
						? webmention
						: getSource(webmention);
				if (!map.has(key)) {
					map.set(key, webmention);
				}
				return map;
			}, new Map())
			.values(),
	];
};

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
export const getPublished = (webmention) => {
	return (
		webmention?.["data"]?.["published"] ||
		webmention["published"] ||
		webmention["wm-received"] ||
		webmention["verified_date"]
	);
};
export const getWebmentionPublished = getPublished;

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
export const getReceived = (webmention) => {
	return (
		webmention["wm-received"] ||
		webmention["verified_date"] ||
		webmention["published"] ||
		webmention?.["data"]?.["published"]
	);
};
export const getWebmentionReceived = getReceived;

/**
 * @param {Webmention} webmention
 * @returns {string}
 */
export const getContent = (webmention) => {
	return (
		webmention?.["contentSanitized"] ||
		webmention?.["content"]?.["html"] ||
		webmention?.["content"]?.["value"] ||
		webmention?.["content"] ||
		webmention?.["data"]?.["content"] ||
		""
	);
};
export const getWebmentionContent = getContent;

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
export const getSource = (webmention) => {
	return (
		webmention["wm-source"] ||
		webmention["source"] ||
		webmention?.["data"]?.["url"] ||
		webmention["url"]
	);
};
export const getWebmentionSource = getSource;

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
export const getURL = (webmention) => {
	return (
		webmention?.["data"]?.["url"] ||
		webmention["url"] ||
		webmention["wm-source"] ||
		webmention["source"]
	);
};
export const getWebmentionURL = getURL;

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
export const getTarget = (webmention) => {
	return webmention["wm-target"] || webmention["target"];
};
export const getWebmentionTarget = getTarget;

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
export const getType = (webmention) => {
	return (
		webmention["wm-property"] ||
		webmention?.["activity"]?.["type"] ||
		webmention["type"]
	);
};
export const getWebmentionType = getType;

/**
 * @param {Array<Webmention>} webmentions
 * @param {WebmentionType|Array<WebmentionType>} types
 * @returns {Array<Webmention>}
 */
export const getByTypes = (webmentions, types) => {
	return webmentions.filter((webmention) => {
		if (typeof types === "string") {
			return types === getType(webmention);
		}
		return types.includes(getType(webmention));
	});
};
export const getByType = getByTypes;
export const getWebmentionsByTypes = getByTypes;
export const getWebmentionsByType = getByTypes;

/**
 * @param {Array<Webmention>} webmentions
 * @param {Array<string>} blocklist
 * @returns {Array<Webmention>}
 */
export const processBlocklist = (webmentions, blocklist) => {
	return webmentions.filter((webmention) => {
		let url = getSource(webmention);
		let source = getSource(webmention);
		for (let blocklistURL of blocklist) {
			if (
				url.includes(blocklistURL.replace(/\/?$/, "/")) ||
				source.includes(blocklistURL.replace(/\/?$/, "/"))
			) {
				return false;
			}
		}
		return true;
	});
};
export const processWebmentionBlocklist = processBlocklist;
export const processWebmentionsBlocklist = processBlocklist;

/**
 * @param {Array<Webmention>} webmentions
 * @param {Array<string>} allowlist
 * @returns {Array<Webmention>}
 */
export const processAllowlist = (webmentions, allowlist) => {
	return webmentions.filter((webmention) => {
		let url = getSource(webmention);
		let source = getSource(webmention);
		for (let allowlistURL of allowlist) {
			if (
				url.includes(allowlistURL.replace(/\/?$/, "/")) ||
				source.includes(allowlistURL.replace(/\/?$/, "/"))
			) {
				return true;
			}
		}
		return false;
	});
};
export const processWebmentionAllowlist = processAllowlist;
export const processWebmentionsAllowlist = processAllowlist;

/**
 * @param {Options} options
 * @param {Array<Webmention>} webmentions
 * @param {string} url
 * @returns {Promise<{found: number, webmentions: Array<Webmention>}>}
 */
export const fetchWebmentions = async (options, webmentions, url) => {
	return await fetch(url)
		.then(async (response) => {
			if (!response.ok) {
				return Promise.reject(response);
			}

			const feed = await response.json();

			if (!(options.key in feed)) {
				console.log(
					`${styleText("grey", `[${hostname(options.domain)}]`)} ${
						options.key
					} was not found as a key in the response from ${styleText(
						"bold",
						hostname(options.feed),
					)}!`,
				);
				return Promise.reject(response);
			}

			// Combine newly-fetched Webmentions with cached Webmentions
			webmentions = feed[options.key].concat(webmentions);
			// Remove duplicates by source URL
			webmentions = removeDuplicates(webmentions);
			// Process the blocklist, if it has any entries
			if (options.blocklist.length) {
				webmentions = processBlocklist(webmentions, options.blocklist);
			}
			// Process the allowlist, if it has any entries
			if (options.allowlist.length) {
				webmentions = processAllowlist(webmentions, options.allowlist);
			}
			// Sort webmentions by received date for getting most recent Webmention on subsequent requests
			webmentions = webmentions.sort((a, b) => {
				return epoch(getReceived(b)) - epoch(getReceived(a));
			});

			return {
				found: feed[options.key].length,
				webmentions: webmentions,
			};
		})
		.catch((error) => {
			console.warn(
				`${styleText(
					"grey",
					`[${hostname(options.domain)}]`,
				)} Something went wrong with your Webmention request to ${styleText(
					"bold",
					hostname(options.feed),
				)}!`,
			);
			console.warn(error instanceof Error ? error.message : error);

			return {
				found: 0,
				webmentions: webmentions,
			};
		});
};

/**
 * @param {Options} options
 * @returns {Promise<Array<Webmention>>}
 */
export const retrieveWebmentions = async (options) => {
	if (!options.domain) {
		throw new Error(
			"`domain` is a required field when attempting to retrieve Webmentions. See https://www.npmjs.com/package/@chrisburnell/eleventy-cache-webmentions#installation for more information.",
		);
	}

	if (!options.feed) {
		throw new Error(
			"`feed` is a required field when attempting to retrieve Webmentions. See https://www.npmjs.com/package/@chrisburnell/eleventy-cache-webmentions#installation for more information.",
		);
	}

	if (!options.key) {
		throw new Error(
			"`key` is a required field when attempting to retrieve Webmentions. See https://www.npmjs.com/package/@chrisburnell/eleventy-cache-webmentions#installation for more information.",
		);
	}

	let asset = new AssetCache(
		options.uniqueKey || `webmentions-${hostname(options.domain)}`,
		options.cacheDirectory,
	);

	let webmentions = [];

	// Unless specifically getting fresh Webmentions, if there is a cached file
	// at all, grab its contents now
	if (asset.isCacheValid("9001y") && !options.refresh) {
		webmentions = await asset.getCachedValue();
	}

	// Get the number of cached Webmentions for diffing against fetched
	// Webmentions later
	const webmentionsCachedLength = webmentions.length;

	// If there is a cached file but it is outside of expiry, fetch fresh
	// results since the most recent Webmention
	if (!asset.isCacheValid(options.refresh ? "0s" : options.duration)) {
		const performanceStart = process.hrtime();
		// Get the received date of the most recent Webmention, if it exists
		const since = webmentions.length ? getReceived(webmentions[0]) : false;
		// Build the URL for the fetch request
		const url = `${options.feed}${
			since
				? `${options.feed.includes("?") ? "&" : "?"}since=${since}`
				: ""
		}`;

		// If using webmention.io, loop through pages until no results found
		if (url.includes("https://webmention.io")) {
			const urlObject = new URL(url);
			const perPage =
				Number(urlObject.searchParams.get("per-page")) || 1000;
			urlObject.searchParams.delete("per-page");
			// Start on page 0, to increment per subsequent request
			let page = 0;
			// Loop until a break condition is hit
			while (true) {
				const urlPaginated =
					urlObject.href + `&per-page=${perPage}&page=${page}`;
				const fetched = await fetchWebmentions(
					options,
					webmentions,
					urlPaginated,
				);

				// An error occurred during fetching paged results → break
				if (!fetched && !fetched.found && !fetched.webmentions) {
					break;
				}

				// Page has no Webmentions → break
				if (fetched.found === 0) {
					break;
				}

				webmentions = fetched.webmentions;

				// If there are less Webmentions found than should be in each
				// page → break
				if (fetched.found < perPage) {
					break;
				}

				// Increment page
				page += 1;
				// Throttle next request
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
		} else {
			const fetched = await fetchWebmentions(options, webmentions, url);
			webmentions = fetched.webmentions;
		}

		// Process the blocklist, if it has any entries
		if (options.blocklist.length) {
			webmentions = processBlocklist(webmentions, options.blocklist);
		}

		// Process the allowlist, if it has any entries
		if (options.allowlist.length) {
			webmentions = processAllowlist(webmentions, options.allowlist);
		}

		await asset.save(webmentions, "json");

		const performance = process.hrtime(performanceStart);

		// Add a console message with the number of fetched and processed Webmentions, if any
		if (webmentionsCachedLength < webmentions.length) {
			console.log(
				`${styleText(
					"grey",
					`[${hostname(options.domain)}]`,
				)} ${styleText(
					"bold",
					String(webmentions.length - webmentionsCachedLength),
				)} new Webmentions fetched into cache in ${styleText(
					"bold",
					(performance[0] + performance[1] / 1e9).toFixed(3) +
						" seconds",
				)}.`,
			);
		}
	}

	return webmentions;
};

/** @type {Array<Webmention>} */
const WEBMENTIONS = {};

/**
 * @param {Options} options
 * @returns {Promise<{[key: string], Array<Webmention>}>}
 */
export const webmentionsByURL = async (options) => {
	if (Object.keys(WEBMENTIONS).length) {
		return WEBMENTIONS;
	}

	let rawWebmentions = await retrieveWebmentions(options);

	// Fix local URLs based on urlReplacements and sort Webmentions into groups
	// by target base URL
	rawWebmentions.forEach((webmention) => {
		let url = baseURL(
			fixURL(
				getTarget(webmention).replace(/\/?$/, "/"),
				options.urlReplacements,
			),
		);

		if (!WEBMENTIONS[url]) {
			WEBMENTIONS[url] = [];
		}

		WEBMENTIONS[url].push(webmention);
	});

	return WEBMENTIONS;
};
export const webmentionsByUrl = webmentionsByURL;
export const filteredWebmentions = webmentionsByURL;

/**
 * @param {Options} options
 * @param {string} url
 * @param {WebmentionType|Array<WebmentionType>} [types]
 * @returns {Promise<Array<Webmention>>}
 */
export const getWebmentions = async (options, url, types = []) => {
	const webmentions = await webmentionsByURL(options);
	url = absoluteURL(url, options.domain);

	if (!url || !webmentions || !webmentions[url]) {
		return [];
	}

	return (
		webmentions[url]
			// Filter webmentions by allowed response post types
			.filter((entry) => {
				return typeof types === "object" && Object.keys(types).length
					? types.includes(getType(entry))
					: typeof types === "string"
					? types === getType(entry)
					: true;
			})
			// Sanitize content of webmentions against HTML limit
			.map((entry) => {
				const html = getContent(entry);

				if (html.length) {
					entry.contentSanitized = sanitizeHTML(
						html,
						options.allowedHTML,
					);
					if (html.length > options.maximumHtmlLength) {
						entry.contentSanitized = `${
							options.maximumHtmlText
						} <a href="${getSource(entry)}">${getSource(
							entry,
						)}</a>`;
					}
				}

				return entry;
			})
			// Sort by published
			.sort((a, b) => {
				return epoch(getPublished(a)) - epoch(getPublished(b));
			})
	);
};

/**
 * @param {object} eleventyConfig
 * @param {Options} [options]
 */
export const eleventyCacheWebmentions = async (
	eleventyConfig,
	options = {},
) => {
	options = Object.assign(defaults, options);

	const byURL = await webmentionsByURL(options);
	const all = Object.values(byURL).reduce(
		(array, webmentions) => [...array, ...webmentions],
		[],
	);

	// Global Data
	eleventyConfig.addGlobalData("webmentionsDefaults", defaults);
	eleventyConfig.addGlobalData("webmentionsOptions", options);
	eleventyConfig.addGlobalData("webmentionsByURL", byURL);
	eleventyConfig.addGlobalData("webmentionsByUrl", byURL);
	eleventyConfig.addGlobalData("webmentionsAll", all);

	// Liquid Filters
	eleventyConfig.addLiquidFilter("getWebmentionsByType", getByTypes);
	eleventyConfig.addLiquidFilter("getWebmentionsByTypes", getByTypes);
	eleventyConfig.addLiquidFilter("getWebmentionPublished", getPublished);
	eleventyConfig.addLiquidFilter("getWebmentionReceived", getReceived);
	eleventyConfig.addLiquidFilter("getWebmentionContent", getContent);
	eleventyConfig.addLiquidFilter("getWebmentionSource", getSource);
	eleventyConfig.addLiquidFilter("getWebmentionURL", getURL);
	eleventyConfig.addLiquidFilter("getWebmentionTarget", getTarget);
	eleventyConfig.addLiquidFilter("getWebmentionType", getType);

	// Nunjucks Filters
	eleventyConfig.addNunjucksFilter("getWebmentionsByType", getByTypes);
	eleventyConfig.addNunjucksFilter("getWebmentionsByTypes", getByTypes);
	eleventyConfig.addNunjucksFilter("getWebmentionPublished", getPublished);
	eleventyConfig.addNunjucksFilter("getWebmentionReceived", getReceived);
	eleventyConfig.addNunjucksFilter("getWebmentionContent", getContent);
	eleventyConfig.addNunjucksFilter("getWebmentionSource", getSource);
	eleventyConfig.addNunjucksFilter("getWebmentionURL", getURL);
	eleventyConfig.addNunjucksFilter("getWebmentionTarget", getTarget);
	eleventyConfig.addNunjucksFilter("getWebmentionType", getType);
};

export default eleventyCacheWebmentions;
