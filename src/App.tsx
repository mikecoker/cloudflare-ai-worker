import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AISummary {
	content: string;
	format: 'markdown' | 'text';
}

interface ExecutiveOrder {
	pdf_url: string;
	document_number: string;
	publication_date: string;
	signing_date: string;
	title: string;
	executive_order_number: string;
	president: string;
	ai_summary?: AISummary | string;
}

export default function App() {
	const [orders, setOrders] = useState<ExecutiveOrder[]>([]);
	const [selectedOrder, setSelectedOrder] = useState<ExecutiveOrder | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	//const [isRegenerating, setIsRegenerating] = useState(false);

	useEffect(() => {
		fetchOrders();
	}, []);

	const fetchOrders = async () => {
		try {
			const response = await fetch('/api/orders');
			if (response.status === 202) {
				// Data is being processed, retry after a delay
				setTimeout(fetchOrders, 5000);
				return;
			}
			const data = await response.json();

			// Add debug logging
			console.log('Received data:', data);

			// Ensure we have an array
			if (!Array.isArray(data)) {
				throw new Error('Expected an array of orders but received: ' + typeof data);
			}

			setOrders(data);
			setLoading(false);
		} catch (err) {
			console.error('Error fetching orders:', err);
			setError('Failed to fetch executive orders: ' + (err instanceof Error ? err.message : String(err)));
			setLoading(false);
		}
	};

	const fetchOrderDetails = async (orderId: string) => {
		try {
			const response = await fetch(`/api/order/${orderId}`, {
				headers: {
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Pragma': 'no-cache',
					'Expires': '0',
				},
			});
			const data = (await response.json()) as ExecutiveOrder;
			setSelectedOrder(data);
		} catch (err) {
			setError('Failed to fetch order details');
		}
	};

	// Add this helper function at the top of your component or in a separate utils file
	const formatSummary = (text: string) => {
		if (!text) return null;

		const sections = text.split(/(?=\b(?:Main Purpose:|Key Provisions:|Affected Groups:|Potential Impact:))/g);

		return sections.map((section, index) => {
			const [title, ...content] = section.split(':');
			const contentText = content.join(':').trim();

			// Split content into items, but only when it's actually a list item
			const items = contentText
				.split(/(?=(?:\d+\.|-)(?:\s|$))/)  // Only split on numbers/bullets followed by space or end
				.map(item => item.trim())
				.filter(item => item.length > 0);

			return (
				<div key={index} className="mb-6">
					<h4 className="text-lg font-semibold text-slate-900 mb-2">{title.trim()}</h4>
					<ul className="space-y-2">
						{items.map((item, itemIndex) => {
							// Check if it's actually a list item
							const isNumbered = /^\d+\.\s/.test(item);
							const isBullet = /^-\s/.test(item);

							if (!isNumbered && !isBullet) {
								// Regular paragraph
								return (
									<li key={itemIndex} className="text-slate-700">
										{item}
									</li>
								);
							}

							const cleanedItem = item.replace(/^\d+\.\s*|-\s*/, '');

							return (
								<li
									key={itemIndex}
									className="flex text-slate-700"
								>
									{isNumbered ? (
										<span className="font-medium text-slate-900 mr-2">
											{item.match(/^\d+/)?.[0]}.
										</span>
									) : (
										<span className="text-slate-900 mr-2">•</span>
									)}
									<span>{cleanedItem}</span>
								</li>
							);
						})}
					</ul>
				</div>
			);
		});
	};

	// Add a function to handle regeneration
	// const regenerateAISummary = async (documentNumber: string) => {
	// 	try {
	// 		setIsRegenerating(true);
	// 		// Replace this URL with your actual API endpoint
	// 		const response = await fetch(`/api/regenerate-summary/${documentNumber}`, {
	// 			method: 'POST',
	// 			headers: {
	// 				'Cache-Control': 'no-cache, no-store, must-revalidate',
	// 				'Pragma': 'no-cache',
	// 				'Expires': '0',
	// 			},
	// 		});

	// 		if (!response.ok) {
	// 			throw new Error('Failed to regenerate summary');
	// 		}

	// 		// Fetch the updated order details to get the new summary
	// 		await fetchOrderDetails(documentNumber);
	// 	} catch (error) {
	// 		console.error('Error regenerating summary:', error);
	// 	} finally {
	// 		setIsRegenerating(false);
	// 	}
	// };

	function OrderSummary({ summary }: { summary: AISummary | string }) {
		// Handle old string format
		if (typeof summary === 'string') {
			return formatSummary(summary);
		}

		// Handle new format
		if (summary.format === 'markdown') {
			return (
				<div className="prose prose-sm max-w-none dark:prose-invert prose-slate
					prose-headings:text-slate-900
					prose-p:text-slate-900
					prose-li:text-slate-900
					prose-ul:text-slate-900
					prose-ol:text-slate-900
					prose-strong:text-slate-900
					[&_ol>li]:text-slate-900
					[&_ol>li::marker]:text-slate-900">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{summary.content}
					</ReactMarkdown>
				</div>
			);
		}

		return <p className="whitespace-pre-wrap text-slate-900">{summary.content}</p>;
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
			</div>
		);
	}

	if (error) {
		return <div className="text-red-500 p-4">{error}</div>;
	}

	return (
		<div className="min-h-screen bg-slate-100">
			{/* Top Navigation Bar */}
			<nav className="bg-white shadow-sm border-b border-slate-200">
				<div className="px-6 py-4">
					<h1 className="text-2xl font-bold text-slate-800">Executive Orders</h1>
				</div>
			</nav>

			{/* Main Content */}
			<div className="flex h-[calc(100vh-73px)]">
				{/* Left Sidebar - Fixed width, scrollable */}
				<div className="w-96 bg-white border-r border-slate-200 overflow-y-auto">
					<div className="divide-y divide-slate-200">
						{orders.map((order) => (
							<div
								key={order.document_number}
								className={`p-4 cursor-pointer transition-all ${
									selectedOrder?.document_number === order.document_number
										? 'bg-blue-50 border-l-4 border-blue-500'
										: 'hover:bg-slate-50 border-l-4 border-transparent'
								}`}
								onClick={() => fetchOrderDetails(order.document_number)}
							>
								<h3 className="font-medium text-slate-900 line-clamp-2">{order.title}</h3>
								<div className="mt-2 flex items-center text-sm text-slate-500 space-x-3">
									<span>{new Date(order.publication_date).toLocaleDateString()}</span>
									<span>•</span>
									<span>EO {order.document_number}</span>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Right Content Area - Flexible width */}
				<div className="flex-1 overflow-y-auto bg-slate-50">
					{selectedOrder ? (
						<div className="p-8 max-w-4xl mx-auto">
							<div className="bg-white rounded-xl shadow-sm p-6 mb-6">
								<h2 className="text-2xl font-bold text-slate-900 mb-4">{selectedOrder.title}</h2>
								<div className="grid grid-cols-2 gap-4 mb-6">
									<div className="bg-slate-50 p-3 rounded-lg">
										<p className="text-sm text-slate-500">Executive Order Number</p>
										<p className="font-medium text-slate-900">{selectedOrder.document_number}</p>
									</div>
									<div className="bg-slate-50 p-3 rounded-lg">
										<p className="text-sm text-slate-500">Signing Date</p>
										<p className="font-medium text-slate-900">
											{new Date(selectedOrder.signing_date).toLocaleDateString()}
										</p>
									</div>
									<div className="bg-slate-50 p-3 rounded-lg">
										<p className="text-sm text-slate-500">President</p>
										<p className="font-medium text-slate-900">{selectedOrder.president}</p>
									</div>
									<div className="bg-slate-50 p-3 rounded-lg">
										<p className="text-sm text-slate-500">Publication Date</p>
										<p className="font-medium text-slate-900">
											{new Date(selectedOrder.publication_date).toLocaleDateString()}
										</p>
									</div>
								</div>

								<div className="prose max-w-none">
									<div className="flex items-center justify-between mb-3">
										<h3 className="text-lg font-semibold text-slate-900">AI Summary</h3>
										<a
											href={selectedOrder.pdf_url}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
										>
											View Original PDF
											<svg className="ml-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
											</svg>
										</a>
									</div>
									<div className="text-slate-700 leading-relaxed">
										{selectedOrder.ai_summary ?
											<OrderSummary summary={selectedOrder.ai_summary} /> :
											'Summary is being generated...'
										}
									</div>
								</div>

								{/* <div className="mt-6 pt-6 border-t border-slate-200">
									{selectedOrder && (
										<button
											onClick={() => regenerateAISummary(selectedOrder.document_number)}
											disabled={isRegenerating}
											className={`
												inline-flex items-center px-3 py-1.5 rounded-md text-sm
												${isRegenerating
													? 'bg-slate-100 text-slate-500 cursor-not-allowed'
													: 'bg-blue-50 text-blue-600 hover:bg-blue-100'
												}
											`}
										>
											{isRegenerating ? (
												<>
													<svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
														<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
														<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
													</svg>
													Regenerating...
												</>
											) : (
												<>
													<svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
													</svg>
													Regenerate Summary
												</>
											)}
										</button>
									)}
								</div> */}
							</div>
						</div>
					) : (
						<div className="flex items-center justify-center h-full text-slate-500">
							<p>Select an executive order to view details</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
