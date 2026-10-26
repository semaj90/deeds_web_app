> ## Documentation Index
>
> Fetch the complete documentation index at: [/llms.txt](https://docs.firecrawl.dev/llms.txt)
>
> Use this file to discover all available pages before exploring further.

[Skip to main content](https://docs.firecrawl.dev/api-reference/endpoint/scrape#content-area)

cURL

scrapeUrl

```
curl --request POST \
  --url https://api.firecrawl.dev/v2/scrape \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "url": "https://example.com",
  "formats": [\
    "markdown"\
  ]
}
'
```

200

400

402

403

404

409

429

500

503

```
{
  "success": true,
  "data": {
    "markdown": "<string>",
    "pages": [\
      {\
        "pageNumber": 123,\
        "markdown": "<string>"\
      }\
    ],
    "blocks": [\
      {\
        "pageNumber": 123,\
        "width": 123,\
        "height": 123,\
        "status": "<string>",\
        "items": [\
          {\
            "id": "<string>",\
            "type": "<string>",\
            "label": "<string>",\
            "bbox": [\
              123\
            ],\
            "content": "<string>",\
            "markdownSpan": [\
              123\
            ],\
            "readingOrder": 123,\
            "source": "<string>",\
            "confidence": {\
              "layout": 123,\
              "ocr": 123\
            }\
          }\
        ]\
      }\
    ],
    "summary": "<string>",
    "html": "<string>",
    "rawHtml": "<string>",
    "rawBase64": "<string>",
    "screenshot": "<string>",
    "audio": "<string>",
    "video": "<string>",
    "answer": "<string>",
    "highlights": "<string>",
    "links": [\
      "<string>"\
    ],
    "attributes": [\
      {\
        "selector": "<string>",\
        "attribute": "<string>",\
        "values": [\
          "<string>"\
        ]\
      }\
    ],
    "actions": {
      "screenshots": [\
        "<string>"\
      ],
      "scrapes": [\
        {\
          "url": "<string>",\
          "html": "<string>"\
        }\
      ],
      "javascriptReturns": [\
        {\
          "type": "<string>",\
          "value": "<unknown>"\
        }\
      ],
      "pdfs": [\
        "<string>"\
      ]
    },
    "metadata": {
      "title": "<string>",
      "description": "<string>",
      "language": "<string>",
      "sourceURL": "<string>",
      "url": "<string>",
      "keywords": "<string>",
      "ogLocaleAlternate": [\
        "<string>"\
      ],
      "<any other metadata> ": "<string>",
      "statusCode": 123,
      "numPages": 123,
      "totalPages": 123,
      "contentType": "<string>",
      "error": "<string>",
      "concurrencyLimited": true,
      "concurrencyQueueDurationMs": 123,
      "provider": {
        "id": "<string>",
        "creditsCost": 123,
        "steps": [\
          {\
            "provider": "<string>",\
            "status": "matched",\
            "creditsCost": 123\
          }\
        ]
      }
    },
    "warning": "<string>",
    "changeTracking": {
      "previousScrapeAt": "2023-11-07T05:31:56Z",
      "changeStatus": "new",
      "visibility": "visible",
      "diff": "<string>",
      "json": {}
    },
    "branding": {
      "colorScheme": "light",
      "logo": "<string>",
      "colors": {
        "primary": "<string>",
        "secondary": "<string>",
        "accent": "<string>",
        "background": "<string>",
        "textPrimary": "<string>",
        "textSecondary": "<string>",
        "link": "<string>",
        "success": "<string>",
        "warning": "<string>",
        "error": "<string>"
      },
      "fonts": [\
        {\
          "family": "<string>"\
        }\
      ],
      "typography": {
        "fontFamilies": {
          "primary": "<string>",
          "heading": "<string>",
          "code": "<string>"
        },
        "fontSizes": {
          "h1": "<string>",
          "h2": "<string>",
          "h3": "<string>",
          "body": "<string>"
        },
        "fontWeights": {
          "light": 123,
          "regular": 123,
          "medium": 123,
          "bold": 123
        },
        "lineHeights": {
          "heading": "<string>",
          "body": "<string>"
        }
      },
      "spacing": {
        "baseUnit": 123,
        "borderRadius": "<string>",
        "padding": {},
        "margins": {}
      },
      "components": {
        "buttonPrimary": {
          "background": "<string>",
          "textColor": "<string>",
          "borderRadius": "<string>"
        },
        "buttonSecondary": {
          "background": "<string>",
          "textColor": "<string>",
          "borderColor": "<string>",
          "borderRadius": "<string>"
        },
        "input": {}
      },
      "icons": {},
      "images": {
        "logo": "<string>",
        "favicon": "<string>",
        "ogImage": "<string>"
      },
      "animations": {},
      "layout": {},
      "personality": {}
    },
    "product": {
      "title": "<string>",
      "url": "<string>",
      "variants": [\
        {\
          "availability": {\
            "inStock": true,\
            "text": "<string>"\
          },\
          "id": "<string>",\
          "sku": "<string>",\
          "title": "<string>",\
          "values": {},\
          "price": {\
            "amount": 123,\
            "currency": "<string>",\
            "formatted": "<string>"\
          },\
          "sale": {\
            "originalPrice": {\
              "amount": 123,\
              "currency": "<string>",\
              "formatted": "<string>"\
            }\
          },\
          "images": [\
            {\
              "url": "<string>",\
              "alt": "<string>"\
            }\
          ]\
        }\
      ],
      "brand": "<string>",
      "category": "<string>",
      "description": "<string>"
    },
    "menu": {
      "isMenu": true,
      "sections": [\
        {\
          "name": "<string>",\
          "items": [\
            {\
              "name": "<string>",\
              "id": "<string>",\
              "description": "<string>",\
              "images": [\
                {\
                  "url": "<string>",\
                  "alt": "<string>"\
                }\
              ],\
              "price": {\
                "amount": 123,\
                "currency": "<string>",\
                "formatted": "<string>"\
              },\
              "availability": {\
                "inStock": true,\
                "text": "<string>"\
              },\
              "dietary": [\
                "<string>"\
              ],\
              "calories": 123,\
              "optionGroups": [\
                {}\
              ],\
              "identifiers": {\
                "merchantItemId": "<string>"\
              },\
              "url": "<string>",\
              "sourceUrl": "<string>"\
            }\
          ],\
          "id": "<string>",\
          "description": "<string>"\
        }\
      ],
      "confidence": 123,
      "merchant": {
        "name": "<string>",
        "type": "<string>"
      },
      "currency": "<string>",
      "sourceUrl": "<string>"
    },
    "tools": [\
      {\
        "provider": "<string>",\
        "capability": "<string>",\
        "description": "<string>",\
        "id": "<string>",\
        "name": "<string>",\
        "creditsCost": 1,\
        "perRecord": true,\
        "options": [\
          {\
            "name": "<string>",\
            "type": "<string>"\
          }\
        ],\
        "response": {\
          "about": "<string>",\
          "key": "<string>",\
          "fields": [\
            {}\
          ]\
        },\
        "matchedBy": [\
          "semantic"\
        ],\
        "matchedUrls": [\
          "<string>"\
        ]\
      }\
    ]
  }
}
```

```
{
  "success": false,
  "error": "Bad request. `alexandria` cannot be combined with `url`, `formats`, or other scrape options, and only recognizes `provider`, `capability`, and `options`.",
  "code": "<string>",
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "Payment required to access this resource.",
  "code": "insufficient_credits",
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "THIRD_PARTY_DATA_TERMS_REQUIRED",
  "requiresAction": {
    "type": "accept_terms",
    "terms": "<string>",
    "version": "<string>",
    "url": "<string>"
  },
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "unknown_provider",
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "duplicate_request",
  "chargeId": "<string>"
}
```

```
{
  "error": "Request rate limit exceeded. Please wait and try again later."
}
```

```
{
  "success": false,
  "code": "UNKNOWN_ERROR",
  "error": "An unexpected error occurred on the server."
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "request_unresolved",
  "chargeId": "<string>"
}
```

POST

/

scrape

Try it

cURL

scrapeUrl

```
curl --request POST \
  --url https://api.firecrawl.dev/v2/scrape \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '
{
  "url": "https://example.com",
  "formats": [\
    "markdown"\
  ]
}
'
```

200

400

402

403

404

409

429

500

503

```
{
  "success": true,
  "data": {
    "markdown": "<string>",
    "pages": [\
      {\
        "pageNumber": 123,\
        "markdown": "<string>"\
      }\
    ],
    "blocks": [\
      {\
        "pageNumber": 123,\
        "width": 123,\
        "height": 123,\
        "status": "<string>",\
        "items": [\
          {\
            "id": "<string>",\
            "type": "<string>",\
            "label": "<string>",\
            "bbox": [\
              123\
            ],\
            "content": "<string>",\
            "markdownSpan": [\
              123\
            ],\
            "readingOrder": 123,\
            "source": "<string>",\
            "confidence": {\
              "layout": 123,\
              "ocr": 123\
            }\
          }\
        ]\
      }\
    ],
    "summary": "<string>",
    "html": "<string>",
    "rawHtml": "<string>",
    "rawBase64": "<string>",
    "screenshot": "<string>",
    "audio": "<string>",
    "video": "<string>",
    "answer": "<string>",
    "highlights": "<string>",
    "links": [\
      "<string>"\
    ],
    "attributes": [\
      {\
        "selector": "<string>",\
        "attribute": "<string>",\
        "values": [\
          "<string>"\
        ]\
      }\
    ],
    "actions": {
      "screenshots": [\
        "<string>"\
      ],
      "scrapes": [\
        {\
          "url": "<string>",\
          "html": "<string>"\
        }\
      ],
      "javascriptReturns": [\
        {\
          "type": "<string>",\
          "value": "<unknown>"\
        }\
      ],
      "pdfs": [\
        "<string>"\
      ]
    },
    "metadata": {
      "title": "<string>",
      "description": "<string>",
      "language": "<string>",
      "sourceURL": "<string>",
      "url": "<string>",
      "keywords": "<string>",
      "ogLocaleAlternate": [\
        "<string>"\
      ],
      "<any other metadata> ": "<string>",
      "statusCode": 123,
      "numPages": 123,
      "totalPages": 123,
      "contentType": "<string>",
      "error": "<string>",
      "concurrencyLimited": true,
      "concurrencyQueueDurationMs": 123,
      "provider": {
        "id": "<string>",
        "creditsCost": 123,
        "steps": [\
          {\
            "provider": "<string>",\
            "status": "matched",\
            "creditsCost": 123\
          }\
        ]
      }
    },
    "warning": "<string>",
    "changeTracking": {
      "previousScrapeAt": "2023-11-07T05:31:56Z",
      "changeStatus": "new",
      "visibility": "visible",
      "diff": "<string>",
      "json": {}
    },
    "branding": {
      "colorScheme": "light",
      "logo": "<string>",
      "colors": {
        "primary": "<string>",
        "secondary": "<string>",
        "accent": "<string>",
        "background": "<string>",
        "textPrimary": "<string>",
        "textSecondary": "<string>",
        "link": "<string>",
        "success": "<string>",
        "warning": "<string>",
        "error": "<string>"
      },
      "fonts": [\
        {\
          "family": "<string>"\
        }\
      ],
      "typography": {
        "fontFamilies": {
          "primary": "<string>",
          "heading": "<string>",
          "code": "<string>"
        },
        "fontSizes": {
          "h1": "<string>",
          "h2": "<string>",
          "h3": "<string>",
          "body": "<string>"
        },
        "fontWeights": {
          "light": 123,
          "regular": 123,
          "medium": 123,
          "bold": 123
        },
        "lineHeights": {
          "heading": "<string>",
          "body": "<string>"
        }
      },
      "spacing": {
        "baseUnit": 123,
        "borderRadius": "<string>",
        "padding": {},
        "margins": {}
      },
      "components": {
        "buttonPrimary": {
          "background": "<string>",
          "textColor": "<string>",
          "borderRadius": "<string>"
        },
        "buttonSecondary": {
          "background": "<string>",
          "textColor": "<string>",
          "borderColor": "<string>",
          "borderRadius": "<string>"
        },
        "input": {}
      },
      "icons": {},
      "images": {
        "logo": "<string>",
        "favicon": "<string>",
        "ogImage": "<string>"
      },
      "animations": {},
      "layout": {},
      "personality": {}
    },
    "product": {
      "title": "<string>",
      "url": "<string>",
      "variants": [\
        {\
          "availability": {\
            "inStock": true,\
            "text": "<string>"\
          },\
          "id": "<string>",\
          "sku": "<string>",\
          "title": "<string>",\
          "values": {},\
          "price": {\
            "amount": 123,\
            "currency": "<string>",\
            "formatted": "<string>"\
          },\
          "sale": {\
            "originalPrice": {\
              "amount": 123,\
              "currency": "<string>",\
              "formatted": "<string>"\
            }\
          },\
          "images": [\
            {\
              "url": "<string>",\
              "alt": "<string>"\
            }\
          ]\
        }\
      ],
      "brand": "<string>",
      "category": "<string>",
      "description": "<string>"
    },
    "menu": {
      "isMenu": true,
      "sections": [\
        {\
          "name": "<string>",\
          "items": [\
            {\
              "name": "<string>",\
              "id": "<string>",\
              "description": "<string>",\
              "images": [\
                {\
                  "url": "<string>",\
                  "alt": "<string>"\
                }\
              ],\
              "price": {\
                "amount": 123,\
                "currency": "<string>",\
                "formatted": "<string>"\
              },\
              "availability": {\
                "inStock": true,\
                "text": "<string>"\
              },\
              "dietary": [\
                "<string>"\
              ],\
              "calories": 123,\
              "optionGroups": [\
                {}\
              ],\
              "identifiers": {\
                "merchantItemId": "<string>"\
              },\
              "url": "<string>",\
              "sourceUrl": "<string>"\
            }\
          ],\
          "id": "<string>",\
          "description": "<string>"\
        }\
      ],
      "confidence": 123,
      "merchant": {
        "name": "<string>",
        "type": "<string>"
      },
      "currency": "<string>",
      "sourceUrl": "<string>"
    },
    "tools": [\
      {\
        "provider": "<string>",\
        "capability": "<string>",\
        "description": "<string>",\
        "id": "<string>",\
        "name": "<string>",\
        "creditsCost": 1,\
        "perRecord": true,\
        "options": [\
          {\
            "name": "<string>",\
            "type": "<string>"\
          }\
        ],\
        "response": {\
          "about": "<string>",\
          "key": "<string>",\
          "fields": [\
            {}\
          ]\
        },\
        "matchedBy": [\
          "semantic"\
        ],\
        "matchedUrls": [\
          "<string>"\
        ]\
      }\
    ]
  }
}
```

```
{
  "success": false,
  "error": "Bad request. `alexandria` cannot be combined with `url`, `formats`, or other scrape options, and only recognizes `provider`, `capability`, and `options`.",
  "code": "<string>",
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "Payment required to access this resource.",
  "code": "insufficient_credits",
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "THIRD_PARTY_DATA_TERMS_REQUIRED",
  "requiresAction": {
    "type": "accept_terms",
    "terms": "<string>",
    "version": "<string>",
    "url": "<string>"
  },
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "unknown_provider",
  "chargeId": "<string>"
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "duplicate_request",
  "chargeId": "<string>"
}
```

```
{
  "error": "Request rate limit exceeded. Please wait and try again later."
}
```

```
{
  "success": false,
  "code": "UNKNOWN_ERROR",
  "error": "An unexpected error occurred on the server."
}
```

```
{
  "success": false,
  "error": "<string>",
  "code": "request_unresolved",
  "chargeId": "<string>"
}
```

## [​](https://docs.firecrawl.dev/api-reference/endpoint/scrape\#capabilities) Capabilities

[Capabilities](https://docs.firecrawl.dev/capabilities) is the single page listing what a scrape can do to a page, which of those capabilities run in a self-hosted deployment, and which endpoints accept a request with no API key.

## [​](https://docs.firecrawl.dev/api-reference/endpoint/scrape\#interactions) Interactions

For browser interactions (clicking, typing, navigating, extracting dynamic content), use the [Interact endpoint](https://docs.firecrawl.dev/features/interact). Scrape a page first, then call `POST /v2/scrape/{scrapeId}/interact` with a natural-language prompt or Playwright code to take actions on the page.See the [Interact documentation](https://docs.firecrawl.dev/features/interact) for full details and examples.Optionally you can also use the `actions` parameter, although it’s not recommended to use it for complex interactions.

> Are you an AI agent that needs a Firecrawl API key? See [firecrawl.dev/agent-onboarding/SKILL.md](https://www.firecrawl.dev/agent-onboarding/SKILL.md) for automated onboarding instructions.

#### Authorizations

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#authorization-authorization)

Authorization

string

header

required

Bearer authentication header of the form `Bearer <token>`, where `<token>` is your auth token.

#### Body

application/json

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-url)

url

string<uri>

required

The URL to scrape

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-formats)

formats

(Markdown · object \| Summary · object \| HTML · object \| Raw HTML · object \| Raw Base64 · object \| Links · object \| Images · object \| Attributes · object \| Screenshot · object \| JSON · object \| Change Tracking · object \| Branding · object \| Product · object \| Menu · object \| Audio · object \| Video · object \| Question · object \| Highlights · object)\[\]

Output formats to include in the response. You can specify one or more formats, either as strings (e.g., `'markdown'`) or as objects with additional options (e.g., `{ type: 'json', schema: {...} }`). Some formats require specific options to be set. Example: `['markdown', { type: 'json', schema: {...} }]`.

- Markdown

- Summary

- HTML

- Raw HTML

- Raw Base64

- Links

- Images

- Attributes

- Screenshot

- JSON

- Change Tracking

- Branding

- Product

- Menu

- Audio

- Video

- Question

- Highlights


Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-only-main-content)

onlyMainContent

boolean

default:true

Only return the main content of the page excluding headers, navs, footers, etc. This is a deterministic HTML-level filter applied before markdown is generated; no LLM is involved.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-only-clean-content)

onlyCleanContent

boolean

default:false

Beta. Run an additional LLM-based pass over the generated markdown to remove residual boilerplate that `onlyMainContent` can miss (cookie banners, ad blocks, social share widgets, breadcrumbs, newsletter signups, comment sections, related-article lists). Headings, lists, tables, code blocks, image references, and inline links are preserved. Can be combined with `onlyMainContent` (the most common setup) or used on its own. Skipped with a warning when the markdown exceeds the cleaning model's output token limit (the original markdown is preserved). Not supported on zero-data-retention requests.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-include-tags)

includeTags

string\[\]

Tags to include in the output.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-exclude-tags)

excludeTags

string\[\]

Tags to exclude from the output.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-max-age)

maxAge

integer

default:172800000

Returns a cached version of the page if it is younger than this age in milliseconds. If a cached version of the page is older than this value, the page will be scraped. If you do not need extremely fresh data, enabling this can speed up your scrapes by 500%. Defaults to 2 days.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-min-age)

minAge

integer

When set, the request only checks the cache and never triggers a fresh scrape. The value is in milliseconds and specifies the minimum age the cached data must be. If matching cached data exists, it is returned instantly. If no cached data is found, a 404 with error code SCRAPE\_NO\_CACHED\_DATA is returned. Set to 1 to accept any cached data regardless of age.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-headers)

headers

object

Headers to send with the request. Can be used to send cookies, user-agent, etc.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-wait-for)

waitFor

integer

default:0

Specify a delay in milliseconds before fetching the content, allowing the page sufficient time to load. This waiting time is in addition to Firecrawl's smart wait feature.

Required range: `x <= 60000`

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-mobile)

mobile

boolean

default:false

Set to true if you want to emulate scraping from a mobile device. Useful for testing responsive pages and taking mobile screenshots.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-skip-tls-verification)

skipTlsVerification

boolean

default:true

Skip TLS certificate verification when making requests.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-timeout)

timeout

integer

default:60000

Timeout in milliseconds for the request. Minimum is 1000 (1 second). Default is 60000 (60 seconds). Maximum is 300000 (300 seconds).

Required range: `1000 <= x <= 300000`

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-parsers)

parsers

(enum<string> \| PDF · object \| Image · object)\[\]

Controls how files are processed during scraping. Each item is a parser name (`"pdf"` or `"image"`) or a parser object. Both parsers are on by default.

- pdf: PDF content is extracted and converted to markdown format, with billing based on the number of pages (1 credit per page).
- image: Raster images (PNG, JPEG, JPEG 2000, TIFF, GIF, BMP, WebP, AVIF) are OCR'd as one-page documents and converted to markdown. SVG and HEIC are not supported.

If you pass a list, parsers that are not in the list are off. For example, `["pdf"]` turns off image OCR, so image URLs fail as unsupported files. When an empty array is passed, the PDF file is returned in base64 encoding with a flat rate of 1 credit for the entire PDF.

Shorthand for a parser object with default options. `"pdf"` is the same as `{ "type": "pdf" }`.

Available options:

`pdf`,

`image`

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-actions)

actions

(Wait by Duration · object \| Wait for Element · object \| Screenshot · object \| Click · object \| Write text · object \| Press a key · object \| Scroll · object \| Scrape · object \| Execute JavaScript · object \| Generate PDF · object)\[\]

Actions to perform on the page before grabbing the content

- Wait by Duration

- Wait for Element

- Screenshot

- Click

- Write text

- Press a key

- Scroll

- Scrape

- Execute JavaScript

- Generate PDF


Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-location)

location

object

Location settings for the request. When specified, this will use an appropriate proxy if available and emulate the corresponding language and timezone settings. Defaults to 'US' if not specified.

Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-remove-base64-images)

removeBase64Images

boolean

default:true

Removes all base 64 images from the markdown output, which may be overwhelmingly long. This does not affect html or rawHtml formats. The image's alt text remains in the output, but the URL is replaced with a placeholder.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-block-ads)

blockAds

boolean

default:true

Enables ad-blocking and cookie popup blocking.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-proxy)

proxy

enum<string>

default:auto

Specifies the type of proxy to use.

- basic: Proxies for scraping sites with none to basic anti-bot solutions. Fast and usually works.
- enhanced: Enhanced proxies for scraping sites with advanced anti-bot solutions. Slower, but more reliable on certain sites. Billed at the same credit cost as basic.
- auto: Firecrawl will automatically retry scraping with enhanced proxies if the basic proxy fails. Enhanced proxies carry no credit surcharge, so either way only the regular cost is billed.

Available options:

`basic`,

`enhanced`,

`auto`

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-store-in-cache)

storeInCache

boolean

default:true

If true, the page will be stored in the Firecrawl index and cache. Setting this to false is useful if your scraping activity may have data protection concerns. Using some parameters associated with sensitive scraping (e.g. actions, headers) will force this parameter to be false.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-lockdown)

lockdown

boolean

default:false

If true, serves the request from Firecrawl's cache only and never makes an outbound request to the target URL. Designed for compliance-constrained or air-gapped environments where the scrape request itself could leak sensitive information. On cache miss, returns a 404 with error code SCRAPE\_LOCKDOWN\_CACHE\_MISS (the URL is never logged on miss). Lockdown requests are treated as zero data retention. Default maxAge is extended to 2 years so existing cached pages remain eligible. Billed at 5 credits on hit, 1 credit on cache miss.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-check-prompt-injection)

checkPromptInjection

boolean

default:false

When enabled, scans the page content for prompt injection attempts before any LLM-backed format (such as json, summary or question) runs. Works with any format except rawBase64. If an injection is detected, the request fails with a 403 and error code SCRAPE\_PROMPT\_INJECTION\_DETECTED. Adds 4 credits when the check runs. If the check cannot scan all of the content, the scrape continues with a warning and the check is not billed.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-redact-pii-one-of-0)

redactPII

booleanobjectbooleanobject

default:false

Redact personally identifiable information from returned markdown. Pass `true` to use defaults, or an object to tune mode, entities, and replacement style.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-profile)

profile

object

Enable persistent browser storage across scrape and interact sessions. Pass a profile when scraping to preserve cookies, localStorage, and session data. Sessions with the same profile name share browser state.

Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-threat-protection)

threatProtection

Threat Protection Override · object

Per-request [Threat Protection](https://docs.firecrawl.dev/features/threat-protection) override. Fields you provide replace the corresponding fields of your organization's policy for this request only; omitted fields keep their organization-level values. Requires Threat Protection to be enabled for your team (enterprise feature) — otherwise the request is rejected with a 403. If your organization has disabled request overrides, any request that includes this object is rejected with a 403. If Threat Protection is enforced for your team, `mode` may not be set to `off`.

Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-audit-metadata)

auditMetadata

object

User attribution included with SIEM logging events when SIEM Logging is enabled for the organization.

Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-zero-data-retention)

zeroDataRetention

boolean

default:false

If true, this will enable zero data retention for this scrape. To enable this feature, please contact [help@firecrawl.dev](mailto:help@firecrawl.dev)

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-alexandria)

alexandria

object

Execute one or more catalogued provider tools instead of scraping a URL. Cannot be combined with `url`, `formats`, or other scrape options (400); the only allowed sibling keys are `timeout`, `origin`, and `integration`. Use the `x-request-id` request header as a client-chosen idempotency key (1 to 128 characters of letters, digits, `.`, `_`, `:`, `-`) — it is echoed back, and a completed request with the same key replays its original response and `scrape_id` instead of re-executing. To browse the catalogue and read tool contracts for free, call Find Tools: set `provider` to `firecrawl`, `capability` to `find-tools`, and `options` to a `FindToolsOptions` object. The result `data` is a `FindToolsData` page.

- object

- object\[\]


Showchild attributes

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-domain-tools)

domainTools

boolean

default:false

When true on an ordinary URL scrape, `data.tools` lists tool contracts matched to the scraped page's domain (same `DiscoveredTool` shape as search). Requires the team's Alexandria access to be enabled and no zero data retention (403 otherwise). Free.

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#body-tool-detail)

toolDetail

enum<string>

How much of each tool contract to return in `data.tools` when `domainTools` is true. `compact` returns only `provider`, `capability`, and `description`. `summary` returns the full tool entry without `options` and `response`. `full` also returns `options`, `response`, and `examples`. If you omit it, tools are returned as with `summary`.

Available options:

`compact`,

`summary`,

`full`

#### Response

200

application/json

Successful response

- Option 1

- Option 2


[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#response-one-of-0-success)

success

boolean

[​](https://docs.firecrawl.dev/api-reference/endpoint/scrape#response-one-of-0-data)

data

object

Showchild attributes

[Suggest edits](https://github.com/firecrawl/firecrawl-docs/edit/main/api-reference/endpoint/scrape.mdx) [Raise issue](https://github.com/firecrawl/firecrawl-docs/issues/new?title=Issue%20on%20docs&body=Path:%20/api-reference/endpoint/scrape)

✕