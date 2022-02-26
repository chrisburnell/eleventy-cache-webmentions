const fetch = require("node-fetch")
const sanitizeHTML = require("sanitize-html")
const uniqBy = require("lodash/uniqBy")
const { AssetCache } = require("@11ty/eleventy-fetch")

// Load .env variables with dotenv
require("dotenv").config()

const TOKEN = process.env.WEBMENTION_IO_TOKEN

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
			key: "webmentions",
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
		let asset = new AssetCache(options.uniqueKey || options.key)
		asset.ensureDir()

		let webmentions = {
			type: "feed",
			name: "Webmentions",
			children: [],
		}

		// If there is a cached file at all, grab its contents now
		if (asset.isCacheValid("9001y")) {
			webmentions = await asset.getCachedValue()
		}

		// If there is a cached file but it is outside of expiry, fetch fresh
		// results since the most recent
		if (!asset.isCacheValid(options.duration)) {
			const since = webmentions.children.length ? webmentions.children[0]["wm-received"] : false
			const url = `https://webmention.io/api/mentions.jf2?domain=${hostname(options.domain)}&token=${TOKEN}&per-page=9001${since ? `&since=${since}` : ``}`
			await fetch(url)
				.then(async (response) => {
					if (response.ok) {
						const feed = await response.json()
						if (feed.children.length) {
							console.log(`[${hostname(options.domain)}] ${feed.children.length} new Webmentions fetched into cache.`)
						}
						webmentions.children = [...feed.children, ...webmentions.children]
						await asset.save(webmentions, "json")
						return webmentions
					}
					return Promise.reject(response)
				})
				.catch((error) => {
					console.log(`[${hostname(options.domain)}] Something went wrong with your request to webmention.io!`, error)
				})
		}

		return webmentions
	}

	const filteredWebmentions = async () => {
		const rawWebmentions = await fetchWebmentions()
		let webmentions = {}

		// Sort Webmentions into groups by target
		rawWebmentions.children.forEach((webmention) => {
			// Get the target of the Webmention and fix it up
			let url = baseUrl(fixUrl(webmention["wm-target"].replace(/\/?$/, "/"), options.urlReplacements))

			if (!webmentions[url]) {
				webmentions[url] = []
			}

			webmentions[url].push(webmention)
		})

		// Sort Webmentions in groups by url and remove duplicates by wm-id
		for (let url in webmentions) {
			webmentions[url] = uniqBy(webmentions[url], (item) => {
				return item["wm-id"]
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
				return typeof allowedTypes === "object" && Object.keys(allowedTypes).length ? allowedTypes.includes(entry["wm-property"]) : true
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
					entry.content.value = `${options.maximumHtmlText} <a href="${entry["wm-source"]}">${entry["wm-source"]}</a>`
				} else if (Object.keys(options.allowedHTML).length) {
					entry.content.value = sanitizeHTML(html || text, options.allowedHTML)
				} else {
					entry.content.value = html || text
				}
				return entry
			})
			// sort by published/wm-received
			.sort((a, b) => {
				return epoch(a.published || a["wm-received"]) - epoch(b.published || b["wm-received"])
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
			throw new Error("domain is a required option to be passed when adding the plugin to your eleventyConfig using addPlugin.")
		}

		// Liquid/Nunjucks Filters
		eleventyConfig.addLiquidFilter("getWebmentions", getWebmentionsFilter)
		eleventyConfig.addNunjucksAsyncFilter("getWebmentions", getWebmentionsFilter)

		// Eleventy Data
		eleventyConfig.addGlobalData("webmentions", filteredWebmentions)
	} else {
		// JavaScript
		return filteredWebmentions
	}
}
