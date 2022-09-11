const fetch = require("node-fetch")
const sanitizeHTML = require("sanitize-html")
const uniqBy = require("lodash/uniqBy")
const { AssetCache } = require("@11ty/eleventy-fetch")
const { defaultsDeep } = require("lodash")

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
	return webmention?.["content"]["html"] || webmention["content"] || webmention?.["data"]["content"]
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
	uniqueKey: "webmentions",
	allowedHTML: {
		allowedTags: ["b", "i", "em", "strong", "a"],
		allowedAttributes: {
			a: ["href"],
		},
	},
	urlReplacements: {},
	maximumHtmlLength: 2000,
	maximumHtmlText: "mentioned this in",
}

const fetchWebmentions = async (options) => {
	let asset = new AssetCache(options.uniqueKey)
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
		await fetch(url)
			.then(async (response) => {
				if (response.ok) {
					const feed = await response.json()
					if (feed[options.key].length) {
						webmentions = uniqBy([...feed[options.key], ...webmentions], (entry) => {
							return getSource(entry)
						})
						console.log(`[${hostname(options.domain)}] ${feed[options.key].length} new Webmentions fetched into cache.`)
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

const filteredWebmentions = async (options) => {
	const rawWebmentions = await fetchWebmentions(options)
	let webmentions = {}

	// Sort Webmentions into groups by target
	rawWebmentions.forEach((webmention) => {
		// Get the target of the Webmention and fix it up
		let url = baseUrl(fixUrl(getTarget(webmention).replace(/\/?$/, "/"), options.urlReplacements))

		if (!webmentions[url]) {
			webmentions[url] = []
		}

		webmentions[url].push(webmention)
	})

	// Sort Webmentions in groups by url and remove duplicates by `url`
	for (let url in webmentions) {
		webmentions[url] = uniqBy(webmentions[url], (entry) => {
			return getSource(entry)
		})
	}

	return webmentions
}

const getWebmentions = async (options, url, allowedTypes = {}) => {
	const webmentions = await filteredWebmentions(options)
	url = absoluteURL(url, options.domain)

	if (!url || !webmentions || !webmentions[url]) {
		return []
	}

	const results = webmentions[url]
		// filter webmentions by allowed response post types
		.filter((entry) => {
			return typeof allowedTypes === "object" && Object.keys(allowedTypes).length ? allowedTypes.includes(getType(entry)) : true
		})
		// sanitize content of webmentions against HTML limit
		.map((entry) => {
			if (!("content" in entry) || !("data" in entry)) {
				return entry
			}
			const html = getContent(entry)
			if (html && html.length > options.maximumHtmlLength) {
				entry.content = `${options.maximumHtmlText} <a href="${getSource(entry)}">${getSource(entry)}</a>`
			} else if (Object.keys(options.allowedHTML).length) {
				entry.content = sanitizeHTML(html, options.allowedHTML)
			} else {
				entry.content = html
			}
			return entry
		})
		// sort by published
		.sort((a, b) => {
			return epoch(getPublished(a)) - epoch(getPublished(b))
		})

	return results
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

	if (!options.domain) {
		throw new Error("domain is a required field when adding the plugin to your eleventyConfig using addPlugin. See https://chrisburnell.com/eleventy-cache-webmentions/#installation for more information.")
	}

	if (!options.feed) {
		throw new Error("feed is a required field when adding the plugin to your eleventyConfig using addPlugin. See https://chrisburnell.com/eleventy-cache-webmentions/#installation for more information.")
	}

	if (!options.key) {
		throw new Error("key is a required field when adding the plugin to your eleventyConfig using addPlugin. See https://chrisburnell.com/eleventy-cache-webmentions/#installation for more information.")
	}

	if (eleventyConfig) {
		// Global Data
		eleventyConfig.addGlobalData("webmentions", filteredWebmentions(options))

		// Liquid Filter
		eleventyConfig.addLiquidFilter("getWebmentions", getWebmentionsFilter)

		// Nunjucks Filter
		eleventyConfig.addNunjucksAsyncFilter("getWebmentions", getWebmentionsFilter)
	}

	return {
		webmentions: filteredWebmentions(options),
		getWebmentions: getWebmentions,
	}
}
