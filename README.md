# eleventy-cache-webmentions

> Cache webmentions using eleventy-fetch and make them available to use in collections, layouts, pages, etc. in Eleventy.

## Breaking change for v2.0.0

Version 2.0.0 introduces a breaking change for those migrating from earlier versions of the plugin. This affects usage of the plugin from JavaScript files; specifically, you will need to make a small change to the way that you `require()` the plugin by removing an extra set of parentheses:

**v1.2.5 and below**

```javascript
require("@chrisburnell/eleventy-cache-webmentions")()
```

**v2.0.0 and above**

```javascript
require("@chrisburnell/eleventy-cache-webmentions")
```

## Quick Guide

I wrote a quicker and simpler guide to getting this Eleventy plugin working that cuts out all the fluff and extra details.

Check it out: [Webmention Setup for Eleventy](https://chrisburnell.com/article/webmention-eleventy-setup/).

## Installation

-   **With npm:** `npm install @chrisburnell/eleventy-cache-webmentions`
-   **Direct download:** [https://github.com/chrisburnell/eleventy-cache-webmentions/archive/master.zip](https://github.com/chrisburnell/eleventy-cache-webmentions/archive/master.zip)

Inside your Eleventy config file, use `addPlugin()` to add it to your project:

```javascript
const pluginWebmentions = require("@chrisburnell/eleventy-cache-webmentions")

module.exports = function(eleventyConfig) {
	eleventyConfig.addPlugin(pluginWebmentions, {
		// These 3 fields are all required!
		domain: "https://example.com",
		feed: "https://webmentions.example.com?token=S3cr3tT0k3n",
		key: "array_of_webmentions"
	})
}
```

Make sure you get the correct values for this configuration. Check below for both Webmention.io configuration and go-jamming configuration.

<details>
<summary>Full options list</summary>
<table>
    <thead>
        <tr>
            <th>option</th>
            <th>default value</th>
            <th>description</th>
            <th>version added</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td><code>domain</code><br><em>required</em></td>
            <td>—</td>
            <td>The website you’re fetching Webmentions for.</td>
            <td>0.0.1</td>
        </tr>
        <tr>
            <td><code>feed</code><br><em>required</em></td>
            <td>—</td>
            <td>The URL of your Webmention server’s feed for your <code>domain</code>.</td>
            <td>0.2.0</td>
        </tr>
        <tr>
            <td><code>key</code><br><em>required</em></td>
            <td>—</td>
            <td>The key in the above <code>feed</code> whose value is an Array of Webmentions.</td>
            <td>0.0.1</td>
        </tr>
        <tr>
            <td><code>directory</code></td>
            <td><code>".cache"</code></td>
            <td>See <a href="https://www.11ty.dev/docs/plugins/cache/#cache-directory">Eleventy Fetch’s Cache Directory</a> for more information.</td>
            <td>1.1.2</td>
        </tr>
        <tr>
            <td><code>refresh</code></td>
            <td><code>false</code></td>
            <td>Forces fresh results from the Webmention endpoint every time.</td>
            <td>2.1.3</td>
        </tr>
        <tr>
            <td><code>duration</code></td>
            <td><code>"1d"</code> <em>or</em> 1 day</td>
            <td>See <a href="https://www.11ty.dev/docs/plugins/cache/#change-the-cache-duration">Eleventy Fetch’s Cache Duration</a> for more information.</td>
            <td>0.0.1</td>
        </tr>
        <tr>
            <td><code>uniqueKey</code></td>
            <td><code>"webmentions"</code></td>
            <td>The name of the file generated by Eleventy Fetch.</td>
            <td>0.1.9</td>
        </tr>
        <tr>
            <td><code>allowedHTML</code></td>
            <td>See code example below</td>
            <td>See the <a href="https://www.npmjs.com/package/sanitize-html">sanitize-html</a> package for more information.</td>
            <td>0.0.1</td>
        </tr>
        <tr>
            <td><code>allowlist</code></td>
            <td><code>[]</code></td>
            <td>An Array of root URLs from which Webmentions are kept.</td>
            <td>1.1.0</td>
        </tr>
        <tr>
            <td><code>blocklist</code></td>
            <td><code>[]</code></td>
            <td>An Array of root URLs from which Webmentions are discarded.</td>
            <td>1.1.0</td>
        </tr>
        <tr>
            <td><code>urlReplacements</code></td>
            <td><code>{}</code></td>
            <td>An Object of key-value string pairs containing from-to URL replacements on this <code>domain</code>.</td>
            <td>0.0.3</td>
        </tr>
        <tr>
            <td><code>maximumHtmlLength</code></td>
            <td><code>2000</code></td>
            <td>Maximum number of characters in a Webmention’s HTML content, beyond which point a different message is shown, referring to the original source.</td>
            <td>0.0.1</td>
        </tr>
        <tr>
            <td><code>maximumHtmlText</code></td>
            <td><code>"mentioned this in"</code></td>
            <td>The glue-y part of the message displayed when a Webmention content’s character count exceeds <code>maximumHtmlLength</code>.</td>
            <td>0.1.0</td>
        </tr>
    </tbody>
</table>
</details>

## Usage

`eleventy-cache-webmentions` comes with a number of ways of accessing your Webmentions as [Global Data](https://www.11ty.dev/docs/data-global-custom/) in both JavaScript and Liquid/Nunjucks as well as a series of [Eleventy Filters](https://www.11ty.dev/docs/filters/) and JavaScript Functions for filtering, sorting, and reading properties about each Webmention:

### Global Data

<details>
<summary>JavaScript</summary>

```javascript
const {
	defaults, // default options for the plugin
	webmentionsByUrl, // Object containing Arrays of Webmentions by URL
} = require("@chrisburnell/eleventy-cache-webmentions")
```

</details>

<details>
<summary>Liquid / Nunjucks</summary>

```twig
{# default options for the plugin #}
{{ webmentionsDefaults }}
{# Object containing Arrays of Webmentions by URL #}
{{ webmentionsByUrl }}
```

</details>

### Filters

<details>
<summary>JavaScript</summary>

```javascript
const {
	getWebmentions, // get Array of Webmentions for a given URL
	getByTypes, // filter Webmentions by their response type
	getPublished, // get received/published time of a Webmention
	getContent, // get content of a Webmention
	getSource, // get source URL of a Webmention (where it's from)
	getTarget, // get target URL of a Webmention (where it's sent to)
	getType, // get response type of a Webmention
} = require("@chrisburnell/eleventy-cache-webmentions")

// This is NOT the best way to get Webmentions!
// See "Attach Webmentions to Pages using Directory Data" below.
const webmentions = getWebmentions({
	domain: "https://example.com",
	feed: "https://webmentions.example.com?token=S3cr3tT0k3n",
	key: "array_of_webmentions"
}, "https://example.com/specific-page/")

const responsesOnly = getByTypes(webmentions, ['mention-of', 'in-reply-to'])

webmentions.forEach((webmention) => {
	const published = getPublished(webmention)
	const content = getContent(webmention)
	const source = getSource(webmention)
	const target = getTarget(webmention)
	const type = getType(webmention)
})
```

</details>

<details>
<summary>Liquid / Nunjucks</summary>

```twig
{# filter Webmentions by their response type #}
{{ set responses = webmentions | getWebmentionsByTypes(['mention-of', 'in-reply-to']) }}

{% for webmention in webmentions %}
    {# get received/published time of a Webmention #}
    {{ webmentions | getWebmentionPublished }}
    {# get content of a Webmention #}
    {{ webmentions | getWebmentionContent }}
    {# get source URL of a Webmention (where it's from) #}
    {{ webmentions | getWebmentionSource }}
    {# get target URL of a Webmention (where it's sent to) #}
    {{ webmentions | getWebmentionTarget }}
    {# get response type of a Webmention #}
    {{ webmentions | getWebmentionType }}
{% endfor %}
```

</details>

### Attach Webmentions to Pages using Directory Data

Using [Eleventy’s Data Cascade](https://www.11ty.dev/docs/data-cascade/), you can attach Webmentions to each page by using [Directory Specific Data Files](https://www.11ty.dev/docs/data-template-dir/).

For example, if you have a folder, `/pages/`, and want to attach Webmentions to each page, create or add the following to a `pages.11tydata.js` file within the folder:

```javascript
const { getWebmentions, getPublished } = require("@chrisburnell/eleventy-cache-webmentions")

module.exports = {
	eleventyComputed: {
		webmentions: (data) => {
			// Get this page's Webmentions as an Array (based on the URL)
			const webmentionsForUrl = getWebmentions({
				domain: "https://example.com",
				feed: "https://webmentions.example.com?token=S3cr3tT0k3n",
				key: "array_of_webmentions"
			}, "https://example.com" + data.page.url)

			// If there are Webmentions for this page
			if (webmentionsForUrl.length) {
				// Sort them (based on when they were received/published)
				return webmentionsForUrl.sort((a, b) => {
					return getPublished(b) - getPublished(a)
				})
			}
			// Otherwise, return an empty Array
			return []
		},
	},
}
```

This attaches an Array containing Webmentions to each page (based on its URL). You can then access this Array of Webmentions with the variable, <samp>webmentions</samp>, within a [Layout](https://www.11ty.dev/docs/layouts/), [Include](https://www.11ty.dev/docs/includes/), or from the page itself:

```twig
{% for webmention in webmentions %}
    {# Do something with each Webmention #}
{% endfor %}
```

These Arrays of Webmentions can even be accessed when building [Collections](https://www.11ty.dev/docs/collections/), allowing you to create a Collection of pages sorted by their number of Webmentions, for example:

```javascript
module.exports = (eleventyConfig) => {
	eleventyConfig.addCollection("popular", (collection) => {
		return collection
			.sort((a, b) => {
				return b.data.webmentions.length - a.data.webmentions.length
			})
	})
}
```

### Get specific types of Webmentions

Instead of getting all the Webmentions for a given page, you may want to grab only certain types of Webmentions. This is useful if you want to display different types of Webmentions separately, e.g.:

```twig
{% set bookmarks = webmentions | getWebmentionsByTypes(['bookmark-of']) %}
{% set likes = webmentions | getWebmentionsByTypes(['like-of']) %}
{% set reposts = webmentions | getWebmentionsByTypes(['repost-of']) %}

{% set replies = webmentions | getWebmentionsByTypes(['mention-of', 'in-reply-to']) %}
```

### Get all Webmentions at once

If you need it, the plugin also makes available an Object containing your cached Webmentions organised in key:value pairs, where each key is a full URL on your website and its value is an Array of Webmentions sent to that URL:

```twig
{% set count = 0 %}
{% for url, array in webmentionsByUrl %}
	{% set count = array.length + count %}
{% endfor %}
<p>This website has received {{ count }} Webmentions!</p>
```

## Webmention.io

[Webmention.io](https://webmention.io) is a in-place Webmention receiver solution that you can use by authenticating yourself via [IndieAuth](https://indieauth.com/) (or host it yourself), and, like *so much* other publicly-available IndieWeb software, is built and hosted by [Aaron Parecki](https://aaronparecki.com/).

### Add your token

Get set up on [Webmention.io](https://webmention.io) and add your **API Key** (found on your [settings page](https://webmention.io/settings)) to your project as an environment variable, i.e. in a `.env` file in the root of your project:

```text
WEBMENTION_IO_TOKEN=njJql0lKXnotreal4x3Wmd
```

### Set your feed and key config options

The example below requests the [JF2](https://www.w3.org/TR/jf2/) file format, which I highly recommend using; although, there is a JSON format available from [Webmention.io](https://webmention.io) as well. The [official documentation](https://github.com/aaronpk/webmention.io) has more information on how to use these two formats.

The key difference between the two feed formats is in the *naming* of the keys: the JF2 format holds the array of Webmentions in the `children` key, whereas the JSON format holds them in the `links` key. The JF2 format, however, provides keys and values that more tightly-align with [microformats](https://indieweb.org/microformats), the method I recommend the most for marking up HTML such that it can be consumed and understood by <q>search engines, aggregators, and other tools</q> across the Indieweb.

```javascript
const pluginWebmentions = require("@chrisburnell/eleventy-cache-webmentions")

module.exports = function(eleventyConfig) {
	eleventyConfig.addPlugin(pluginWebmentions, {
		domain: "https://example.com",
		feed: `https://webmention.io/api/mentions.jf2?domain=example.com&per-page=9001&token=${process.env.WEBMENTION_IO_TOKEN}`,
		key: "children"
	})
}
```

If you want to use the JSON format instead, make sure that you replace `mentions.jf2` in the URL with `mentions.json` and change the value of the key from `children` to `links`.

## go-jamming

[go-jamming](https://git.brainbaking.com/wgroeneveld/go-jamming) is a self-hosted Webmention sender and receiver, built in Go by [Wouter Groeneveld](https://brainbaking.com) and available with more information on his [personal git instance](https://git.brainbaking.com/wgroeneveld/go-jamming).

### Add your token

Once you’ve set up your *go-jamming* server and you’ve defined your token, you’ll need add it to your project as an environment variable, i.e. in a `.env` file in the root of your project:

```text
GO_JAMMING_TOKEN=njJql0lKXnotreal4x3Wmd
```

### Set your feed and key config options

```javascript
const pluginWebmentions = require("@chrisburnell/eleventy-cache-webmentions")

module.exports = function(eleventyConfig) {
	eleventyConfig.addPlugin(pluginWebmentions, {
		domain: "https://example.com",
		feed: `https://jam.example.com/webmention/example.com/${process.env.GO_JAMMING_TOKEN}`,
		key: "json"
	})
}
```

## Contributing

Contributions of all kinds are welcome! Please [submit an Issue on GitHub](https://github.com/chrisburnell/eleventy-cache-webmentions/issues) or [get in touch with me](https://chrisburnell.com/about/#contact) if you’d like to do so.

## License

This project is licensed under an MIT license.
