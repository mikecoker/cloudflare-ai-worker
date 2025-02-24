# Federal Register Executive Orders API

A Cloudflare Worker service that fetches and caches executive orders from the Federal Register API.

## Overview

This service provides a streamlined interface to access executive orders published in the Federal Register since January 20, 2017 (tunable). It implements caching to improve performance and reduce API calls to the Federal Register.

## Features

- Fetches executive orders from the Federal Register API
- Caches responses for improved performance
- Returns key information including:
  - Document number
  - Executive order number
  - Raw text and PDF URLs
  - President's name
  - Publication date
  - Signing date
  - Title
  - Document type

## API Endpoints

### GET /
Returns the main webpage that includes a list of executive orders on the left. You can select an order and get the cached summary, if one exists.

### GET /api/orders
Returns a list of all cached executive orders.

### GET /api/order/:documentNumber
Returns the summary for the specified order.

### GET /api/cache
Triggers a manual update of the cache with fresh data from the Federal Register. This should probably be disabled and just run on a schedule.

### POST /api/regenerate-summary/:documentNumber
This is used to regenerate the AI summary for a specific executive order. This could be disabled but is useful for testing.

## Development

### Prerequisites
- Node.js
- Cloudflare Workers account
- Wrangler CLI
