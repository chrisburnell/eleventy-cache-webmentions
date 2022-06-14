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

module.exports = (eleventyConfig, options = {}) => {
	options = Object.assign(
		{
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
		},
		options
	)

	const fetchWebmentions = async () => {
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
			const since = webmentions.length ? webmentions[0]["wm-received"] || webmentions[0]["published"] : false
			const url = `${options.feed}${since && options.feed.includes("https://webmention.io") ? `&since=${since}` : ""}`
			await fetch(url)
				.then(async (response) => {
					if (response.ok) {
						const feed = await response.json()
						if (feed[options.key].length) {
							webmentions = uniqBy([...feed[options.key], ...webmentions], (item) => {
								return item["wm-source"] || item["source"]
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

	const filteredWebmentions = async () => {
		const rawWebmentions = await fetchWebmentions()
		let webmentions = {}

		// Sort Webmentions into groups by `wm-target` || `target`
		rawWebmentions.forEach((webmention) => {
			// Get the target of the Webmention and fix it up
			let url = baseUrl(fixUrl((webmention["wm-target"] || webmention["target"]).replace(/\/?$/, "/"), options.urlReplacements))

			if (!webmentions[url]) {
				webmentions[url] = []
			}

			webmentions[url].push(webmention)
		})

		// Sort Webmentions in groups by url and remove duplicates by `url`
		for (let url in webmentions) {
			webmentions[url] = uniqBy(webmentions[url], (item) => {
				return item["url"]
			})
		}

		return webmentions
	}

	const getWebmentions = async (url, allowedTypes = {}) => {
		const webmentions = await filteredWebmentions()
		url = absoluteURL(url, options.domain)

		if (!url || !webmentions || !webmentions[url]) {
			return []
		}

		const results = webmentions[url]
			// filter webmentions by allowed response post types
			.filter((entry) => {
				return typeof allowedTypes === "object" && Object.keys(allowedTypes).length ? allowedTypes.includes(entry["wm-property"] || entry["type"]) : true
			})
			// remove webmentions without an author name
			.filter((entry) => {
				const { author } = entry
				return !!author && !!author.name
			})
			// sanitize content of webmentions and check against HTML limit
			.map((entry) => {
				if (!("content" in entry)) {
					return entry
				}
				const { html, text } = entry.content
				if (html && html.length > options.maximumHtmlLength) {
					entry.content.value = `${options.maximumHtmlText} <a href="${entry["wm-source"] || entry["source"]}">${entry["wm-source"] || entry["source"]}</a>`
				} else if (Object.keys(options.allowedHTML).length) {
					entry.content.value = sanitizeHTML(html || text, options.allowedHTML)
				} else {
					entry.content.value = html || text
				}
				return entry
			})
			// sort by `wm-received` || `published`
			.sort((a, b) => {
				return epoch(a["wm-received"] || a.published) - epoch(b["wm-received"] || b.published)
			})

		return results
	}

	const getWebmentionsFilter = async (url, allowedTypes, callback) => {
		if (typeof callback !== "function") {
			callback = allowedTypes
			allowedTypes = {}
		}
		const webmentions = await getWebmentions(url, allowedTypes)
		callback(null, webmentions)
	}

	if (eleventyConfig && options) {
		if (!options.domain) {
			throw new Error("domain is a required field when adding the plugin to your eleventyConfig using addPlugin. See https://chrisburnell.com/eleventy-cache-webmentions/#installation for more information.")
		}

		if (!options.feed) {
			throw new Error("feed is a required field when adding the plugin to your eleventyConfig using addPlugin. See https://chrisburnell.com/eleventy-cache-webmentions/#installation for more information.")
		}

		if (!options.key) {
			throw new Error("key is a required field when adding the plugin to your eleventyConfig using addPlugin. See https://chrisburnell.com/eleventy-cache-webmentions/#installation for more information.")
		}

		// Liquid Filter
		eleventyConfig.addLiquidFilter("getWebmentions", getWebmentionsFilter)

		// Nunjucks Filter
		eleventyConfig.addNunjucksAsyncFilter("getWebmentions", getWebmentionsFilter)

		// Global Data
		eleventyConfig.addGlobalData("webmentions", filteredWebmentions)
	} else {
		// JavaScript
		return filteredWebmentions
	}
}
