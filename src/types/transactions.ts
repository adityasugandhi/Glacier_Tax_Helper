export type TransactionTerm = 'SHORT' | 'LONG';
export type TransactionType = 'STOCK' | 'OPTION' | 'CRYPTO' | 'OTHER';

export interface EnhancedTransaction {
  accountNumber: string;
  taxYear: string;
  description: string;
  dateAcquired?: string;
  saleDate: string;
  shares: number;
  costBasis: number;
  salesPrice: number;
  term: TransactionTerm;
  transactionType: TransactionType;
  ordinaryIncome: boolean;
  nonCovered: boolean;
  
  // Optional metadata for additional context
  originalRowData?: Record<string, any>;
  processingNotes?: string[];
}

export interface CSVProcessingResult {
  transactions: EnhancedTransaction[];
  processingErrors: string[];
  totalTransactionsProcessed: number;
}