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
	return webmention["wm-received"] || webmention?.["data"]["published"] || webmention["verified_date"] || webmention["published"]
}

const getContent = (webmention) => {
	return webmention?.["content"]?.["html"] || webmention?.["content"] || webmention?.["data"]?.["content"] || ""
}

const getSource = (webmention) => {
	return webmention["url"] || webmention?.["data"]["url"] || webmention["wm-source"] || webmention["source"]
}

const getTarget = (webmention) => {
	return webmention["wm-target"] || webmention["target"]
}

const getType = (webmention) => {
	return webmention["wm-property"] || webmention?.["activity"]["type"] || webmention["type"]
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
	// results since the most recent webmention
	if (!asset.isCacheValid(options.duration)) {
		const since = webmentions.length ? getPublished(webmentions[0]) : false
		const url = `${options.feed}${since ? `${options.feed.includes("?") ? "&" : "?"}since=${since}` : ""}`
		await fetch(url).then(async (response) => {
			if (response.ok) {
				const feed = await response.json()
				if (feed[options.key].length) {
					// Combine newly-fetched entries with cached entries
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

	const filteredCount = Object.values(filtered).reduce((count, webmentions) => count + webmentions.length, 0)
	console.log(`[${hostname(options.domain)}] ${filteredCount} filtered Webmentions pulled from cache.`)

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

module.exports = (eleventyConfig, options = {}) => {
	options = Object.assign(defaults, options)

	if (eleventyConfig) {
		// Global Data
		const filtered = async () => await filteredWebmentions(options)
		eleventyConfig.addGlobalData("webmentionsByUrl", filtered)
		const unfiltered = async () => await filteredWebmentions(options).then((filtered) => Object.values(filtered).reduce((array, webmentions) => [...array, ...webmentions], []))
		eleventyConfig.addGlobalData("webmentionsAll", unfiltered)
		eleventyConfig.addGlobalData("webmentions", unfiltered)

		// Liquid Filter
		eleventyConfig.addLiquidFilter("getWebmentions", getWebmentionsFilter)

		// Nunjucks Filter
		eleventyConfig.addNunjucksAsyncFilter("getWebmentions", getWebmentionsFilter)
	}

	return {
		defaults: defaults,
		fetchWebmentions: fetchWebmentions,
		filteredWebmentions: filteredWebmentions,
		getWebmentions: getWebmentions,
	}
}
