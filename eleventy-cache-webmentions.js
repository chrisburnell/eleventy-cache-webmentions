const fetch = require("node-fetch")
const sanitizeHTML = require("sanitize-html")
const uniqBy = require("lodash/uniqBy")
const { AssetCache } = require("@11ty/eleventy-fetch")

const absoluteURL = (url, domain) => {
	try {
		return new URL(url, domain).toString()
	} catch (e) {
		console.log(`Trying to convert ${url} to be an absolute url with base ${domain} and failed.`)
		return url
	}
}

const baseUrl = (url) => {
	let hashSplit = url.split("#")
	let queryparamSplit = hashSplit[0].split("?")
	return queryparamSplit[0]
}

const fixUrl = (url, urlReplacements) => {
	return Object.entries(urlReplacements).reduce((accumulator, [key, value]) => {
		const regex = new RegExp(key, "g")
		return accumulator.replace(regex, value)
	}, url)
}

const hostname = (value) => {
	if (typeof value === "string" && value.includes("//")) {
		const urlObject = new URL(value)
		return urlObject.hostname
	}
	return value
}

const epoch = (value) => {
	return new Date(value).getTime()
}

const getPublished = (webmention) => {
	return webmention?.["data"]?.["published"] || webmention["published"] || webmention["wm-received"] || webmention["verified_date"]
}

const getContent = (webmention) => {
	return webmention?.["contentSanitized"] || webmention?.["content"]?.["html"] || webmention?.["content"]?.["value"] || webmention?.["content"] || webmention?.["data"]?.["content"] || ""
}

const getSource = (webmention) => {
	return webmention?.["data"]?.["url"] || webmention["url"] || webmention["wm-source"] || webmention["source"]
}

const getTarget = (webmention) => {
	return webmention["wm-target"] || webmention["target"]
}

const getType = (webmention) => {
	return webmention["wm-property"] || webmention?.["activity"]?.["type"] || webmention["type"]
}

const getByTypes = (webmentions, allowedTypes) => {
	return webmentions.filter((webmention) => {
		return allowedTypes.includes(getType(webmention))
	})
}

const defaults = {
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
}

const fetchWebmentions = async (options) => {
	if (!options.domain) {
		throw new Error("domain is a required field when attempting to retrieve Webmentions. See https://www.npmjs.com/package/@chrisburnell/eleventy-cache-webmentions#installation for more information.")
	}

	if (!options.feed) {
		throw new Error("feed is a required field when attempting to retrieve Webmentions. See https://www.npmjs.com/package/@chrisburnell/eleventy-cache-webmentions#installation for more information.")
	}

	if (!options.key) {
		throw new Error("key is a required field when attempting to retrieve Webmentions. See https://www.npmjs.com/package/@chrisburnell/eleventy-cache-webmentions#installation for more information.")
	}

	let asset = new AssetCache(options.uniqueKey, options.directory)
	asset.ensureDir()

	let webmentions = []

	// If there is a cached file at all, grab its contents now
	if (asset.isCacheValid("9001y")) {
		webmentions = await asset.getCachedValue()
	}

	// If there is a cached file but it is outside of expiry, fetch fresh
	// results since the most recent Webmention
	if (!asset.isCacheValid(options.duration)) {
		// Get the published date of the most recent Webmention, if it exists
		const since = webmentions.length ? getPublished(webmentions[0]) : false
		// Build the URL for the fetch request
		const url = `${options.feed}${since ? `${options.feed.includes("?") ? "&" : "?"}since=${since}` : ""}`
		await fetch(url).then(async (response) => {
			if (response.ok) {
				const feed = await response.json()
				if (feed[options.key].length) {
					// Combine newly-fetched Webmentions with cached Webmentions
					webmentions = feed[options.key].concat(webmentions)
					// Remove duplicates by source URL
					webmentions = uniqBy([...feed[options.key], ...webmentions], (webmention) => {
						return getSource(webmention)
					})
					// Process the blocklist, if it has any entries
					if (options.blocklist.length) {
						webmentions = webmentions.filter((webmention) => {
							let sourceUrl = getSource(webmention)
							for (let url of options.blocklist) {
								if (sourceUrl.includes(url.replace(/\/?$/, "/"))) {
									return false
								}
							}
							return true
						})
					}
					// Process the allowlist, if it has any entries
					if (options.allowlist.length) {
						webmentions = webmentions.filter((webmention) => {
							let sourceUrl = getSource(webmention)
							for (let url of options.allowlist) {
								if (sourceUrl.includes(url.replace(/\/?$/, "/"))) {
									return true
								}
							}
							return false
						})
					}
					if (webmentions.length) {
						console.log(`[${hostname(options.domain)}] ${webmentions.length} new Webmentions fetched into cache.`)
					}
				}
				await asset.save(webmentions, "json")
				return webmentions
			}
			return Promise.reject(response)
		})
		.catch((error) => {
			console.log(`[${hostname(options.domain)}] Something went wrong with your request to ${hostname(options.feed)}!`, error)
		})
	}

	return webmentions
}

let filtered = {}
const filteredWebmentions = async (options) => {
	if (Object.entries(filtered).length) {
		return filtered
	}

	let rawWebmentions = await fetchWebmentions(options)

	// Fix local URLs based on urlReplacements and sort Webmentions into groups
	// by target base URL
	rawWebmentions.forEach((webmention) => {
		let url = baseUrl(fixUrl(getTarget(webmention).replace(/\/?$/, "/"), options.urlReplacements))

		if (!filtered[url]) {
			filtered[url] = []
		}

		filtered[url].push(webmention)
	})

	return filtered
}

const getWebmentions = async (options, url, allowedTypes = {}) => {
	const webmentions = await filteredWebmentions(options)
	url = absoluteURL(url, options.domain)

	if (!url || !webmentions || !webmentions[url]) {
		return []
	}

	return (
		webmentions[url]
			// Filter webmentions by allowed response post types
			.filter((entry) => {
				return typeof allowedTypes === "object" && Object.keys(allowedTypes).length ? allowedTypes.includes(getType(entry)) : true
			})
			// Sanitize content of webmentions against HTML limit
			.map((entry) => {
				const html = getContent(entry)

				if (html.length) {
					entry.contentSanitized = sanitizeHTML(html, options.allowedHTML)
					if (html.length > options.maximumHtmlLength) {
						entry.contentSanitized = `${options.maximumHtmlText} <a href="${getSource(entry)}">${getSource(entry)}</a>`
					}
				}

				return entry
			})
			// Sort by published
			.sort((a, b) => {
				return epoch(getPublished(a)) - epoch(getPublished(b))
			})
	)
}

const getWebmentionsFilter = async (options, url, allowedTypes, callback) => {
	if (typeof callback !== "function") {
		callback = allowedTypes
		allowedTypes = {}
	}
	const webmentions = await getWebmentions(options, url, allowedTypes)
	callback(null, webmentions)
}

const eleventyCacheWebmentions = (eleventyConfig, options = {}) => {
	options = Object.assign(defaults, options)

	// Global Data
	eleventyConfig.addGlobalData("webmentionsDefaults", defaults)
	const filtered = async () => await filteredWebmentions(options)
	eleventyConfig.addGlobalData("webmentionsByUrl", filtered)
	const unfiltered = async () => await filteredWebmentions(options).then((filtered) => Object.values(filtered).reduce((array, webmentions) => [...array, ...webmentions], []))
	eleventyConfig.addGlobalData("webmentionsAll", unfiltered)

	// Liquid Filters
	eleventyConfig.addLiquidFilter("getWebmentions", getWebmentionsFilter)
	eleventyConfig.addLiquidFilter("getWebmentionPublished", getPublished)
	eleventyConfig.addLiquidFilter("getWebmentionContent", getContent)
	eleventyConfig.addLiquidFilter("getWebmentionSource", getSource)
	eleventyConfig.addLiquidFilter("getWebmentionTarget", getTarget)
	eleventyConfig.addLiquidFilter("getWebmentionType", getType)
	eleventyConfig.addLiquidFilter("getWebmentionsByTypes", getByTypes)

	// Nunjucks Filters
	eleventyConfig.addNunjucksAsyncFilter("getWebmentions", getWebmentionsFilter)
	eleventyConfig.addNunjucksFilter("getWebmentionsByTypes", getByTypes)
	eleventyConfig.addNunjucksFilter("getWebmentionPublished", getPublished)
	eleventyConfig.addNunjucksFilter("getWebmentionContent", getContent)
	eleventyConfig.addNunjucksFilter("getWebmentionSource", getSource)
	eleventyConfig.addNunjucksFilter("getWebmentionTarget", getTarget)
	eleventyConfig.addNunjucksFilter("getWebmentionType", getType)
}

module.exports = eleventyCacheWebmentions
module.exports.defaults = defaults
module.exports.filteredWebmentions = filteredWebmentions
module.exports.webmentionsByUrl = filteredWebmentions
module.exports.fetchWebmentions = fetchWebmentions
module.exports.getWebmentions = getWebmentions
module.exports.getByTypes = getByTypes
module.exports.getPublished = getPublished
module.exports.getContent = getContent
module.exports.getSource = getSource
module.exports.getTarget = getTarget
module.exports.getType = getType
