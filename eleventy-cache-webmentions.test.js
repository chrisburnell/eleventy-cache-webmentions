import nock from "nock";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	defaults,
	fetchWebmentions,
	filteredWebmentions,
	getByType,
	getByTypes,
	getContent,
	getPublished,
	getReceived,
	getSource,
	getTarget,
	getType,
	getWebmentions,
} from "./eleventy-cache-webmentions.js";

const options = Object.assign({}, defaults, {
	refresh: true,
	domain: "https://example.com",
	feed: `https://example.com/mentions.json`,
	key: "children",
});

const mentions = {
	type: "feed",
	name: "Webmentions",
	children: [
		{
			type: "entry",
			author: {
				type: "card",
				name: "Jane Doe",
				url: "https://example.com",
			},
			url: "https://example.com/post1/",
			published: "2024-01-01T12:00:00Z",
			"wm-received": "2024-01-01T12:00:00Z",
			"wm-id": 123456,
			"wm-source": "https://example.com/post1/",
			"wm-target": "https://example.com/page1/",
			"wm-protocol": "webmention",
			name: "Example Post",
			content: {
				"content-type": "text/html",
				value: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
				html: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
				text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
			},
			"mention-of": "https://example.com/page1/",
			"wm-property": "mention-of",
			"wm-private": false,
		},
		{
			type: "entry",
			author: {
				type: "card",
				name: "Jane Doe",
				url: "https://example.com",
			},
			url: "https://example.com/post2/",
			published: "2024-01-01T12:00:00Z",
			"wm-received": "2024-01-01T12:00:00Z",
			"wm-id": 234567,
			"wm-source": "https://example.com/post2/",
			"wm-target": "https://example.com/page2/",
			"wm-protocol": "webmention",
			name: "Example Post",
			content: {
				"content-type": "text/html",
				value: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
				html: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
				text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
			},
			"in-reply-to": "https://example.com/page2/",
			"wm-property": "in-reply-to",
			"wm-private": false,
		},
		{
			type: "entry",
			author: {
				type: "card",
				name: "Jane Doe",
				url: "https://example.com",
			},
			url: "https://example.com/post3/",
			published: "2024-01-01T12:00:00Z",
			"wm-received": "2024-01-01T12:00:00Z",
			"wm-id": 345678,
			"wm-source": "https://example.com/post3/",
			"wm-target": "https://example.com/page2/",
			"wm-protocol": "webmention",
			name: "Example Post",
			content: {
				"content-type": "text/html",
				value: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
				html: "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>",
				text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
			},
			"mention-of": "https://example.com/page2/",
			"wm-property": "mention-of",
			"wm-private": false,
		},
	],
};

describe("filteredWebmentions()", () => {
	const scope = nock("https://example.com")
		.get("/mentions.json")
		.reply(200, mentions);
	it("Should return an object of Key: URL, Value: Array of Webmentions", async () => {
		const webmentions = await filteredWebmentions(options);
		assert.strictEqual(Object.keys(webmentions).length, 2);
	});
});

describe("fetchWebmentions()", () => {
	const scope = nock("https://example.com")
		.get("/mentions.json")
		.reply(200, mentions);
	it("Should return an object of Key: URL, Value: Array of Webmentions`", async () => {
		const fetched = await fetchWebmentions(
			options,
			[],
			"https://example.com/mentions.json",
		);
		assert.strictEqual(fetched.webmentions.length, 3);
	});
});

describe("getWebmentions()", () => {
	const scope = nock("https://example.com")
		.get("/mentions.json")
		.reply(200, mentions);
	it("Should return an object of Key: URL, Value: Array of Webmentions`", async () => {
		const fetched = await getWebmentions(
			options,
			"https://example.com/page2/",
		);
		assert.strictEqual(fetched.length, 2);
	});
	it("Should return an object of Key: URL, Value: Array of Webmentions of a specific type`", async () => {
		const fetched = await getWebmentions(
			options,
			"https://example.com/page2/",
			["mention-of"],
		);
		assert.strictEqual(fetched.length, 1);
	});
});

describe("getPublished()", () => {
	it("Should return a published date from `data.published`", async () => {
		const webmention = {
			data: {
				published: "2024-01-01T12:00:00Z",
			},
		};
		assert.strictEqual(getPublished(webmention), "2024-01-01T12:00:00Z");
	});

	it("Should return a published date from `published`", async () => {
		const webmention = {
			published: "2024-01-01T12:00:00Z",
		};
		assert.strictEqual(getPublished(webmention), "2024-01-01T12:00:00Z");
	});

	it("Should return a published date from `wm-received`", async () => {
		const webmention = {
			"wm-received": "2024-01-01T12:00:00Z",
		};
		assert.strictEqual(getPublished(webmention), "2024-01-01T12:00:00Z");
	});

	it("Should return a published date from `verified_date`", async () => {
		const webmention = {
			verified_date: "2024-01-01T12:00:00Z",
		};
		assert.strictEqual(getPublished(webmention), "2024-01-01T12:00:00Z");
	});
});

describe("getReceived()", () => {
	it("Should return a received date from `wm-received`", async () => {
		const webmention = {
			"wm-received": "2024-01-01T12:00:00Z",
		};
		assert.strictEqual(getReceived(webmention), "2024-01-01T12:00:00Z");
	});

	it("Should return a received date from `verified_date`", async () => {
		const webmention = {
			verified_date: "2024-01-01T12:00:00Z",
		};
		assert.strictEqual(getReceived(webmention), "2024-01-01T12:00:00Z");
	});

	it("Should return a received date from `published`", async () => {
		const webmention = {
			published: "2024-01-01T12:00:00Z",
		};
		assert.strictEqual(getReceived(webmention), "2024-01-01T12:00:00Z");
	});

	it("Should return a received date from `data.published`", async () => {
		const webmention = {
			data: {
				published: "2024-01-01T12:00:00Z",
			},
		};
		assert.strictEqual(getReceived(webmention), "2024-01-01T12:00:00Z");
	});
});

describe("getContent()", () => {
	it("Should return content from `contentSanitized`", async () => {
		const webmention = {
			contentSanitized: "Lorem ipsum",
		};
		assert.strictEqual(getContent(webmention), "Lorem ipsum");
	});

	it("Should return content from `content.html`", async () => {
		const webmention = {
			content: {
				html: "<p>Lorem ipsum</p>",
			},
		};
		assert.strictEqual(getContent(webmention), "<p>Lorem ipsum</p>");
	});

	it("Should return content from `content.value`", async () => {
		const webmention = {
			content: {
				value: "Lorem ipsum",
			},
		};
		assert.strictEqual(getContent(webmention), "Lorem ipsum");
	});

	it("Should return content from `content`", async () => {
		const webmention = {
			content: "Lorem ipsum",
		};
		assert.strictEqual(getContent(webmention), "Lorem ipsum");
	});

	it("Should return content from `data.content`", async () => {
		const webmention = {
			data: {
				content: "Lorem ipsum",
			},
		};
		assert.strictEqual(getContent(webmention), "Lorem ipsum");
	});
});

describe("getSource()", () => {
	it("Should return a source URL from `wm-source`", async () => {
		const webmention = {
			"wm-source": "https://example.com",
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});

	it("Should return a source URL from `source`", async () => {
		const webmention = {
			source: "https://example.com",
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});

	it("Should return a source URL from `data.url`", async () => {
		const webmention = {
			data: {
				url: "https://example.com",
			},
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});

	it("Should return a source URL from `url`", async () => {
		const webmention = {
			url: "https://example.com",
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});
});

describe("getURL()", () => {
	it("Should return a origin URL from `data.url`", async () => {
		const webmention = {
			data: {
				url: "https://example.com",
			},
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});

	it("Should return a origin URL from `url`", async () => {
		const webmention = {
			url: "https://example.com",
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});

	it("Should return a origin URL from `wm-source`", async () => {
		const webmention = {
			"wm-source": "https://example.com",
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});

	it("Should return a origin URL from `source`", async () => {
		const webmention = {
			source: "https://example.com",
		};
		assert.strictEqual(getSource(webmention), "https://example.com");
	});
});

describe("getTarget()", () => {
	it("Should return a target URL from `wm-target`", async () => {
		const webmention = {
			"wm-target": "https://example.com",
		};
		assert.strictEqual(getTarget(webmention), "https://example.com");
	});

	it("Should return a target URL from `target`", async () => {
		const webmention = {
			target: "https://example.com",
		};
		assert.strictEqual(getTarget(webmention), "https://example.com");
	});
});

describe("getType()", () => {
	it("Should return a Webmention type from `wm-property`", async () => {
		const webmention = {
			"wm-property": "mention-of",
		};
		assert.strictEqual(getType(webmention), "mention-of");
	});

	it("Should return a Webmention type from `activity.type`", async () => {
		const webmention = {
			activity: {
				type: "mention-of",
			},
		};
		assert.strictEqual(getType(webmention), "mention-of");
	});

	it("Should return a Webmention type from `type`", async () => {
		const webmention = {
			type: "mention-of",
		};
		assert.strictEqual(getType(webmention), "mention-of");
	});
});

describe("getByType()", () => {
	it("Should return an array of Webmentions based on a type", async () => {
		const webmentions = [
			{
				type: "mention-of",
			},
			{
				type: "in-reply-to",
			},
		];
		assert.strictEqual(getByType(webmentions, "mention-of").length, 1);
	});
});

describe("getByTypes()", () => {
	it("Should return an array of Webmentions based on multiple types", async () => {
		const webmentions = [
			{
				type: "bookmark-of",
			},
			{
				type: "mention-of",
			},
			{
				type: "in-reply-to",
			},
		];
		assert.strictEqual(
			getByTypes(webmentions, ["in-reply-to", "mention-of"]).length,
			2,
		);
	});
});
