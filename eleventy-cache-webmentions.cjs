const { AssetCache } = require("@11ty/eleventy-fetch");
const { styleText } = require("node:util");
const sanitizeHTML = require("sanitize-html");

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
 * @property {{[key: string]: string}} urlReplacements
 * @property {number} maximumHtmlLength
 * @property {string} maximumHtmlText
 */
const defaults = {
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
const getPublished = (webmention) => {
	return (
		webmention?.["data"]?.["published"] ||
		webmention["published"] ||
		webmention["wm-received"] ||
		webmention["verified_date"]
	);
};

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
const getReceived = (webmention) => {
	return (
		webmention["wm-received"] ||
		webmention["verified_date"] ||
		webmention["published"] ||
		webmention?.["data"]?.["published"]
	);
};

/**
 * @param {Webmention} webmention
 * @returns {string}
 */
const getContent = (webmention) => {
	return (
		webmention?.["contentSanitized"] ||
		webmention?.["content"]?.["html"] ||
		webmention?.["content"]?.["value"] ||
		webmention?.["content"] ||
		webmention?.["data"]?.["content"] ||
		""
	);
};

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
const getSource = (webmention) => {
	return (
		webmention["wm-source"] ||
		webmention["source"] ||
		webmention?.["data"]?.["url"] ||
		webmention["url"]
	);
};

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
const getURL = (webmention) => {
	return (
		webmention?.["data"]?.["url"] ||
		webmention["url"] ||
		webmention["wm-source"] ||
		webmention["source"]
	);
};

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
const getTarget = (webmention) => {
	return webmention["wm-target"] || webmention["target"];
};

/**
 * @param {Webmention} webmention
 * @returns {string|undefined}
 */
const getType = (webmention) => {
	return (
		webmention["wm-property"] ||
		webmention?.["activity"]?.["type"] ||
		webmention["type"]
	);
};

/**
 * @param {Array<Webmention>} webmentions
 * @param {WebmentionType|Array<WebmentionType>} types
 * @returns {Array<Webmention>}
 */
const getByTypes = (webmentions, types) => {
	return webmentions.filter((webmention) => {
		if (typeof types === "string") {
			return types === getType(webmention);
		}
		return types.includes(getType(webmention));
	});
};

/**
 * @param {Array<Webmention>} webmentions
 * @param {Array<string>} blocklist
 * @returns {Array<Webmention>}
 */
const processBlocklist = (webmentions, blocklist) => {
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

/**
 * @param {Array<Webmention>} webmentions
 * @param {Array<string>} allowlist
 * @returns {Array<Webmention>}
 */
const processAllowlist = (webmentions, allowlist) => {
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

/**
 * @param {Options} options
 * @param {Array<Webmention>} webmentions
 * @param {string} url
 * @returns {Promise<{found: number, webmentions: Array<Webmention>}>}
 */
const fetchWebmentions = async (options, webmentions, url) => {
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
const retrieveWebmentions = async (options) => {
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
 * @returns {Promise<{[key: string]: Array<Webmention>}>}
 */
const webmentionsByURL = async (options) => {
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

/**
 * @param {Options} options
 * @param {string} url
 * @param {WebmentionType|Array<WebmentionType>} [types]
 * @returns {Promise<Array<Webmention>>}
 */
const getWebmentions = async (options, url, types = []) => {
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
const eleventyCacheWebmentions = async (eleventyConfig, options = {}) => {
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

module.exports = eleventyCacheWebmentions;
module.exports.defaults = defaults;
module.exports.getPublished = getPublished;
module.exports.getWebmentionPublished = getPublished;
module.exports.getReceived = getReceived;
module.exports.getWebmentionReceived = getReceived;
module.exports.getContent = getContent;
module.exports.getWebmentionContent = getContent;
module.exports.getSource = getSource;
module.exports.getWebmentionSource = getSource;
module.exports.getURL = getURL;
module.exports.getWebmentionURL = getURL;
module.exports.getTarget = getTarget;
module.exports.getWebmentionTarget = getTarget;
module.exports.getType = getType;
module.exports.getWebmentionType = getType;
module.exports.getByTypes = getByTypes;
module.exports.getByType = getByTypes;
module.exports.getWebmentionsByTypes = getByTypes;
module.exports.getWebmentionsByType = getByTypes;
module.exports.processBlocklist = processBlocklist;
module.exports.processWebmentionBlocklist = processBlocklist;
module.exports.processWebmentionsBlocklist = processBlocklist;
module.exports.processAllowlist = processAllowlist;
module.exports.processWebmentionAllowlist = processAllowlist;
module.exports.processWebmentionsAllowlist = processAllowlist;
module.exports.fetchWebmentions = fetchWebmentions;
module.exports.retrieveWebmentions = retrieveWebmentions;
module.exports.webmentionsByURL = webmentionsByURL;
module.exports.webmentionsByUrl = webmentionsByURL;
module.exports.filteredWebmentions = webmentionsByURL;
module.exports.getWebmentions = getWebmentions;
