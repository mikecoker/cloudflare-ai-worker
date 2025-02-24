import { Hono } from 'hono';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

const assetManifest = JSON.parse(manifestJSON);
const BASE_URL = 'https://www.federalregister.gov/api/v1/documents.json';

const app = new Hono<{ Bindings: Env }>();

interface Env {
	EXECUTIVE_ORDERS_CACHE: KVNamespace;
	__STATIC_CONTENT: KVNamespace;
	CLAUDE_API_KEY: string;
	CLAUDE_API_URL: string;
	AI: Ai;
}

// Add these constants at the top with other constants
const MAX_CONCURRENT_REQUESTS = 5;
const RETRY_DELAY_MS = 60000; // 1 minute
const MAX_RETRIES = 3;
const PER_PAGE = 50;
const AI_MODEL = '@cf/meta/llama-3.2-3b-instruct';
const AI_USE_CF = true;

interface President {
	identifier: string;
	name: string;
}

interface ExecutiveOrder {
	raw_text_url: string;
	pdf_url: string;
	document_number: string;
	publication_date: string;
	signing_date: string;
	title: string;
	executive_order_number: string;
	president: President;
	type: string;
	ai_summary?: {
		content: string;
		format: 'markdown' | 'text';
	};
}

interface FederalRegisterResponse {
	count: number;
	description: string;
	total_pages: number;
	next_page_url: string | null;
	results: ExecutiveOrder[];
}

interface CachedData {
	lastUpdated: number;
	orders: ExecutiveOrder[];
}

interface QueueItem {
	documentNumber: string;
	rawTextUrl: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	attempts: number;
	lastAttempt?: number;
}

// Add these interfaces at the top with other interfaces
interface CloudflareCacheStorage extends CacheStorage {
	default: Cache;
}

interface ExecutionContext {
	waitUntil(promise: Promise<any>): void;
	passThroughOnException(): void;
	caches: CloudflareCacheStorage;
}

interface ScheduledController {
	scheduledTime: number;
	cron: string;
}

// Middleware for security headers
app.use('*', async (c, next) => {
	await next();
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('X-Frame-Options', 'DENY');
	c.header('X-XSS-Protection', '1; mode=block');
	c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
	c.header(
		'Content-Security-Policy',
		"default-src 'self'; connect-src 'self' https://www.federalregister.gov; img-src 'self' data:; style-src 'self' 'unsafe-inline';"
	);
});

// API Routes
app.get('/api/cache', async (c) => {
	// await updateCache(c.env);
	// return c.json({ message: 'Cache updated' }, 200, {
	// 	'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
	// 	Pragma: 'no-cache',
	// 	Expires: '0',
	// 	'Surrogate-Control': 'no-store',
	// });
	return c.json({ message: 'Cache updated' }, 200, {
		'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
		Pragma: 'no-cache',
		Expires: '0',
		'Surrogate-Control': 'no-store',
	});
});

app.get('/api/orders', async (c) => {
	const cachedData = await c.env.EXECUTIVE_ORDERS_CACHE.get('orders');

	if (!cachedData) {
		await updateCache(c.env);
		return c.json({ message: 'Data is being processed' }, 202);
	}

	const parsedData: CachedData = JSON.parse(cachedData);
	return c.json(parsedData.orders);
});

app.get('/api/order/:documentNumber', async (c) => {
	const documentNumber = c.req.param('documentNumber');
	const cachedData = await c.env.EXECUTIVE_ORDERS_CACHE.get('orders');

	if (!cachedData) {
		return c.json({ message: 'Not Found' }, 404);
	}

	const data: CachedData = JSON.parse(cachedData);
	const order = data.orders.find((o) => o.document_number === documentNumber);

	if (!order) {
		return c.json({ message: 'Order not found' }, 404);
	}

	const summaryKey = `summary:${documentNumber}`;
	const summary = await c.env.EXECUTIVE_ORDERS_CACHE.get(summaryKey);

	return c.json(
		{
			...order,
			ai_summary: summary
				? {
						content: summary,
						format: 'markdown',
				  }
				: {
						content: 'Summary is being generated...',
						format: 'text',
				  },
			summaryKey: summaryKey,
		},
		undefined,
		{
			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
			Pragma: 'no-cache',
			Expires: '0',
			'Surrogate-Control': 'no-store',
		}
	);
});

app.post('/api/regenerate-summary/:documentNumber', async (c) => {
	// const documentNumber = c.req.param('documentNumber');

	// try {
	// 	const orderJson = await c.env.EXECUTIVE_ORDERS_CACHE.get('orders');
	// 	if (!orderJson) {
	// 		throw new Error('Order not found in KV store');
	// 	}

	// 	const orderData = JSON.parse(orderJson);
	// 	const order = orderData.orders.find((o: any) => o.document_number === documentNumber);
	// 	if (!order) {
	// 		throw new Error('Order not found in KV store');
	// 	}

	// 	const rawTextResponse = await fetch(order.raw_text_url);
	// 	if (!rawTextResponse.ok) {
	// 		throw new Error('Failed to fetch raw text');
	// 	}
	// 	const rawText = await rawTextResponse.text();

	// 	const newSummary = await summarizeEO(rawText, c.env);
	// 	if (!newSummary) {
	// 		throw new Error('Failed to generate new summary');
	// 	}

	// 	const summaryKey = `summary:${documentNumber}`;
	// 	await c.env.EXECUTIVE_ORDERS_CACHE.put(summaryKey, newSummary);
	// 	return c.json(
	// 		{
	// 			...order,
	// 			ai_summary: {
	// 				content: newSummary,
	// 				format: 'markdown',
	// 			},
	// 			summaryKey: summaryKey,
	// 			timestamp: Date.now(),
	// 		},
	// 		undefined,
	// 		{
	// 			'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
	// 			Pragma: 'no-cache',
	// 			Expires: '0',
	// 			'Surrogate-Control': 'no-store',
	// 		}
	// 	);
	// } catch (error) {
	// 	console.error('Error regenerating summary:', error);
	// 	return c.json(
	// 		{
	// 			error: 'Failed to regenerate summary',
	// 			details: error instanceof Error ? error.message : String(error),
	// 		},
	// 		500
	// 	);
	// }
	return c.json({ message: 'disabled' }, 200);
});

// Static asset handling
app.get('*', async (c) => {
	try {
		const options = {
			ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
			ASSET_MANIFEST: assetManifest,
		};

		const url = new URL(c.req.url);
		if (url.pathname === '/' || !url.pathname.includes('.')) {
			const response = await getAssetFromKV(
				{
					request: new Request(new URL('/index.html', c.req.url), c.req),
					waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
				},
				options
			);
			return new Response(response.body, response);
		}

		const response = await getAssetFromKV(
			{
				request: new Request(c.req.url, c.req),
				waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
			},
			options
		);
		return new Response(response.body, response);
	} catch (e) {
		return c.text('Not Found', 404);
	}
});

async function fetchExecutiveOrders(): Promise<ExecutiveOrder[]> {
	const fields = [
		'document_number',
		'executive_order_number',
		'raw_text_url',
		'pdf_url',
		'president',
		'publication_date',
		'signing_date',
		'title',
		'type',
	];

	const today = new Date().toISOString().split('T')[0];
	const params = new URLSearchParams();

	// Add each field individually
	fields.forEach((field) => {
		params.append('fields[]', field);
	});

	// Add other parameters
	params.append('per_page', `${PER_PAGE}`);
	params.append('conditions[publication_date][gte]', '2017-01-20');
	params.append('conditions[publication_date][lte]', today);
	params.append('conditions[presidential_document_type][]', 'executive_order');

	const url = `${BASE_URL}?${params.toString()}`;
	console.log(url);

	const response = await fetch(url, {
		headers: {
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			Pragma: 'no-cache',
			Expires: '0',
		},
	});
	if (!response.ok) {
		throw new Error(`Failed to fetch orders: ${response.statusText}`);
	}

	const data: FederalRegisterResponse = await response.json();
	console.log(data);
	return data.results.map((result: any) => ({
		raw_text_url: result.raw_text_url,
		pdf_url: result.pdf_url,
		document_number: result.document_number,
		publication_date: result.publication_date,
		signing_date: result.signing_date,
		title: result.title,
		executive_order_number: result.executive_order_number,
		president: result.president.name,
		type: result.type,
	}));
}

async function summarizeEO(text: string, env: Env): Promise<string> {
	if (AI_USE_CF) {
		return summarizeEOCF(text, env);
	}
	return summarizeEOClaude(text, env);
}

async function summarizeEOCF(text: string, env: Env): Promise<string> {
	const messages = [
		{
			role: 'system',
			content: `You are a helpful assistant that summarizes executive orders for a general audience.`,
		},
		{
			role: 'user',
			content: `Don't repeat the title or document number.Please provide a summary of this executive order \
			in markdown format. Focus on the main purpose, key provisions, identify affected groups and potential \
			impact on those groups. Keep the summary clear and accessible to a general audience. Use markdown headings, \
			lists, and other formatting to make the summary easy to read. Include at least 5 Frequently Asked Questions \
			with with bolded text and bullet points but do not add Q and A to the questions. Answers should be bulleted \
			on a new line, indented and italicized. \
			\n\nExecutive Order text:\n${text}`,
		},
	];
	const response = await env.AI.run(AI_MODEL, {
		messages: messages,
		max_tokens: 1024,
		temperature: 0.3,
	});

	console.log(JSON.stringify(response));
	// @ts-ignore
	if (response.response) {
		// @ts-ignore
		return response.response;
	}
	return 'failed';
}

async function summarizeEOClaude(text: string, env: Env): Promise<string> {
	const CLAUDE_API_KEY = env.CLAUDE_API_KEY;
	const CLAUDE_API_URL = env.CLAUDE_API_URL;

	const payload = {
		model: 'claude-3-5-sonnet-20241022',
		max_tokens: 1024,
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: `Don't repeat the title or document number.Please provide a summary of this executive order \
						in markdown format. Focus on the main purpose, key provisions, identify affected groups and potential \
						impact on those groups. Keep the summary clear and accessible to a general audience. Use markdown headings, \
						lists, and other formatting to make the summary easy to read. Include at least 5 Frequently Asked Questions \
						with with bolded text and bullet points but do not add Q and A to the questions. Answers should be bulleted \
						on a new line, indented and italicized. \
						\n\nExecutive Order text:\n${text}`,
					},
				],
			},
		],
	};

	try {
		const response = await fetch(CLAUDE_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': CLAUDE_API_KEY,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorData: any = await response.json();
			throw new Error(`Claude API error: ${errorData.error?.message || response.statusText}`);
		}

		const data: any = await response.json();
		console.log(`Summary: ${data.content[0].text}`);
		return data.content[0].text;
	} catch (error) {
		console.error('Error in summary generation:', error);
		throw new Error('Failed to generate summary');
	}
}

async function processQueue(env: Env): Promise<void> {
	const queueData = ((await env.EXECUTIVE_ORDERS_CACHE.get('summary_queue', 'json')) as QueueItem[]) || [];
	if (!queueData.length) return;

	// Get items that are pending or failed but eligible for retry
	const eligibleItems = queueData.filter(
		(item) =>
			item.status === 'pending' ||
			(item.status === 'failed' && item.attempts < MAX_RETRIES && (!item.lastAttempt || Date.now() - item.lastAttempt >= RETRY_DELAY_MS))
	);

	// Process up to MAX_CONCURRENT_REQUESTS items
	const itemsToProcess = eligibleItems.slice(0, MAX_CONCURRENT_REQUESTS);

	for (const item of itemsToProcess) {
		// Update status to processing
		item.status = 'processing';
		item.attempts++;
		item.lastAttempt = Date.now();
		await env.EXECUTIVE_ORDERS_CACHE.put('summary_queue', JSON.stringify(queueData));

		try {
			const resp = await fetch(item.rawTextUrl);
			const text = await resp.text();
			const summary = await summarizeEO(text, env);
			await env.EXECUTIVE_ORDERS_CACHE.put(`summary:${item.documentNumber}`, summary);

			// Update queue item status
			item.status = 'completed';
		} catch (error) {
			console.error(`Failed to process summary for ${item.documentNumber}:`, error);
			item.status = 'failed';
		}

		// Update queue in KV
		await env.EXECUTIVE_ORDERS_CACHE.put('summary_queue', JSON.stringify(queueData));
	}
}

async function updateCache(env: Env, summary?: boolean): Promise<void> {
	try {
		const orders = await fetchExecutiveOrders();
		const cacheData: CachedData = {
			lastUpdated: Date.now(),
			orders,
		};

		await env.EXECUTIVE_ORDERS_CACHE.put('orders', JSON.stringify(cacheData));

		// Add orders to summary queue if summary parameter is true
		if (summary) {
			const existingQueue = ((await env.EXECUTIVE_ORDERS_CACHE.get('summary_queue', 'json')) as QueueItem[]) || [];
			const existingDocs = new Set(existingQueue.map((item) => item.documentNumber));

			const newQueueItems: QueueItem[] = orders
				.filter((order) => !existingDocs.has(order.document_number))
				.map((order) => ({
					documentNumber: order.document_number,
					rawTextUrl: order.raw_text_url,
					status: 'pending',
					attempts: 0,
				}));

			if (newQueueItems.length > 0) {
				await env.EXECUTIVE_ORDERS_CACHE.put('summary_queue', JSON.stringify([...existingQueue, ...newQueueItems]));
			}
		}
	} catch (error) {
		console.error('Failed to update cache:', error);
		throw error;
	}
}

export default {
	fetch: app.fetch,
	// @ts-ignore
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(Promise.all([updateCache(env, true), processQueue(env)]));
	},
};
