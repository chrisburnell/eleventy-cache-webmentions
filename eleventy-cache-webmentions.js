const fetch = require("node-fetch");
const sanitizeHTML = require("sanitize-html");
const uniqBy = require("lodash/uniqBy");
const { AssetCache } = require("@11ty/eleventy-fetch");

const absoluteURL = (url, domain) => {
	try {
		return new URL(url, domain).toString();
	} catch (e) {
		console.log(
			`Trying to convert ${url} to be an absolute url with base ${domain} and failed.`,
		);
		return url;
	}
};

const baseUrl = (url) => {
	let hashSplit = url.split("#");
	let queryparamSplit = hashSplit[0].split("?");
	return queryparamSplit[0];
};

const fixUrl = (url, urlReplacements) => {
	return Object.entries(urlReplacements).reduce(
		(accumulator, [key, value]) => {
			const regex = new RegExp(key, "g");
			return accumulator.replace(regex, value);
		},
		url,
	);
};

const hostname = (value) => {
	if (typeof value === "string" && value.includes("//")) {
		const urlObject = new URL(value);
		return urlObject.hostname;
	}
	return value;
};

const epoch = (value) => {
	return new Date(value).getTime();
};

const getPublished = (webmention) => {
	return (
		webmention?.["data"]?.["published"] ||
		webmention["published"] ||
		webmention["wm-received"] ||
		webmention["verified_date"]
	);
};

const getReceived = (webmention) => {
	return (
		webmention["wm-received"] ||
		webmention["verified_date"] ||
		webmention["published"] ||
		webmention?.["data"]?.["published"]
	);
};

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

const getSource = (webmention) => {
	return (
		webmention["wm-source"] ||
		webmention["source"] ||
		webmention?.["data"]?.["url"] ||
		webmention["url"]
	);
};

const getURL = (webmention) => {
	return (
		webmention?.["data"]?.["url"] ||
		webmention["url"] ||
		webmention["wm-source"] ||
		webmention["source"]
	);
};

const getTarget = (webmention) => {
	return webmention["wm-target"] || webmention["target"];
};

const getType = (webmention) => {
	return (
		webmention["wm-property"] ||
		webmention?.["activity"]?.["type"] ||
		webmention["type"]
	);
};

const getByType = (webmentions, allowedType) => {
	return webmentions.filter((webmention) => {
		return allowedType === getType(webmention);
	});
};

const getByTypes = (webmentions, allowedTypes) => {
	return webmentions.filter((webmention) => {
		return allowedTypes.includes(getType(webmention));
	});
};

const defaults = {
	refresh: false,
	duration: "1d",
	uniqueKey: "webmentions",
	allowedHTML: {
		allowedTags: ["b", "i", "em", "strong", "a"],
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

const performFetch = async (options, webmentions, url) => {
	return await fetch(url)
		.then(async (response) => {
			if (!response.ok) {
				return Promise.reject(response);
			}

			const feed = await response.json();

			if (!options.key in feed) {
				console.log(
					`[${hostname(options.domain)}] ${
						options.key
					} was not found as a key in the response from ${hostname(
						options.feed,
					)}!`,
				);
				return Promise.reject(response);
			}

			// Combine newly-fetched Webmentions with cached Webmentions
			webmentions = feed[options.key].concat(webmentions);
			// Remove duplicates by source URL
			webmentions = uniqBy(
				[...feed[options.key], ...webmentions],
				(webmention) => {
					return getSource(webmention);
				},
			);
			// Process the blocklist, if it has any entries
			if (options.blocklist.length) {
				webmentions = webmentions.filter((webmention) => {
					let url = getSource(webmention);
					let source = getSource(webmention);
					for (let blocklistURL of options.blocklist) {
						if (
							url.includes(blocklistURL.replace(/\/?$/, "/")) ||
							source.includes(blocklistURL.replace(/\/?$/, "/"))
						) {
							return false;
						}
					}
					return true;
				});
			}
			// Process the allowlist, if it has any entries
			if (options.allowlist.length) {
				webmentions = webmentions.filter((webmention) => {
					let url = getSource(webmention);
					let source = getSource(webmention);
					for (let allowlistURL of options.allowlist) {
						if (
							url.includes(allowlistURL.replace(/\/?$/, "/")) ||
							source.includes(allowlistURL.replace(/\/?$/, "/"))
						) {
							return true;
						}
					}
					return false;
				});
			}
			// Sort webmentions by received date for getting most recent Webmention on subsequent requests
			webmentions = webmentions.sort((a, b) => {
				return epoch(getReceived(b)) - epoch(getReceived(a));
			});

			return {
				found: feed[options.key].length,
				filtered: webmentions,
			};
		})
		.catch((error) => {
			console.log(
				`[${hostname(
					options.domain,
				)}] Something went wrong with your request to ${hostname(
					options.feed,
				)}!`,
				error,
			);
		});
};

const fetchWebmentions = async (options) => {
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

	let asset = new AssetCache(options.uniqueKey, options.directory);
	asset.ensureDir();

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
				const fetched = await performFetch(
					options,
					webmentions,
					urlPaginated,
				);

				// An error occurred during fetching paged results → break
				if (!fetched && !fetched.found && !fetched.filtered) {
					break;
				}

				// Page has no Webmentions → break
				if (fetched.found === 0) {
					break;
				}

				webmentions = fetched.filtered;

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
			const fetched = await performFetch(options, webmentions, url);
			webmentions = fetched.filtered;
		}

		await asset.save(webmentions, "json");

		// Add a console message with the number of fetched and processed Webmentions, if any
		if (webmentionsCachedLength < webmentions.length) {
			console.log(
				`[${hostname(options.domain)}] ${
					webmentions.length - webmentionsCachedLength
				} new Webmentions fetched into cache.`,
			);
		}
	}

	return webmentions;
};

let filtered = {};
const filteredWebmentions = async (options) => {
	if (Object.entries(filtered).length) {
		return filtered;
	}

	let rawWebmentions = await fetchWebmentions(options);

	// Fix local URLs based on urlReplacements and sort Webmentions into groups
	// by target base URL
	rawWebmentions.forEach((webmention) => {
		let url = baseUrl(
			fixUrl(
				getTarget(webmention).replace(/\/?$/, "/"),
				options.urlReplacements,
			),
		);

		if (!filtered[url]) {
			filtered[url] = [];
		}

		filtered[url].push(webmention);
	});

	return filtered;
};

const getWebmentions = async (options, url, allowedTypes = {}) => {
	const webmentions = await filteredWebmentions(options);
	url = absoluteURL(url, options.domain);

	if (!url || !webmentions || !webmentions[url]) {
		return [];
	}

	return (
		webmentions[url]
			// Filter webmentions by allowed response post types
			.filter((entry) => {
				return typeof allowedTypes === "object" &&
					Object.keys(allowedTypes).length
					? allowedTypes.includes(getType(entry))
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

const eleventyCacheWebmentions = (eleventyConfig, options = {}) => {
	options = Object.assign(defaults, options);

	// Global Data
	eleventyConfig.addGlobalData("webmentionsDefaults", defaults);
	eleventyConfig.addGlobalData("webmentionsOptions", options);
	const filtered = async () => await filteredWebmentions(options);
	eleventyConfig.addGlobalData("webmentionsByUrl", filtered);
	const unfiltered = async () =>
		await filteredWebmentions(options).then((filtered) =>
			Object.values(filtered).reduce(
				(array, webmentions) => [...array, ...webmentions],
				[],
			),
		);
	eleventyConfig.addGlobalData("webmentionsAll", unfiltered);

	// Liquid Filters
	eleventyConfig.addLiquidFilter("getWebmentionsByType", getByType);
	eleventyConfig.addLiquidFilter("getWebmentionsByTypes", getByTypes);
	eleventyConfig.addLiquidFilter("getWebmentionPublished", getPublished);
	eleventyConfig.addLiquidFilter("getWebmentionReceived", getReceived);
	eleventyConfig.addLiquidFilter("getWebmentionContent", getContent);
	eleventyConfig.addLiquidFilter("getWebmentionSource", getSource);
	eleventyConfig.addLiquidFilter("getWebmentionURL", getURL);
	eleventyConfig.addLiquidFilter("getWebmentionTarget", getTarget);
	eleventyConfig.addLiquidFilter("getWebmentionType", getType);

	// Nunjucks Filters
	eleventyConfig.addNunjucksFilter("getWebmentionsByType", getByType);
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
module.exports.filteredWebmentions = filteredWebmentions;
module.exports.webmentionsByUrl = filteredWebmentions;
module.exports.fetchWebmentions = fetchWebmentions;
module.exports.performFetch = performFetch;
module.exports.getWebmentions = getWebmentions;
module.exports.getByType = getByType;
module.exports.getWebmentionsByType = getByType;
module.exports.getByTypes = getByTypes;
module.exports.getWebmentionsByTypes = getByTypes;
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
