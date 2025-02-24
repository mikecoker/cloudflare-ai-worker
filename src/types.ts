export interface ExecutiveOrder {
	pdf_url: string;
	document_number: string;
	publication_date: string;
	signing_date: string;
	title: string;
	executive_order_number: string;
	president: string;
	ai_summary?: string;
  }

  export interface CachedData {
	lastUpdated: number;
	orders: ExecutiveOrder[];
  }
