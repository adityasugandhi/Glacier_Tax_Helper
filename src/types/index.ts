export interface StockTransaction {
  date: string;
  description: string;
  quantity: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  shortTerm: boolean;
}

export interface CSVMapping {
  date: string;
  description: string;
  quantity: string;
  proceeds: string;
  costBasis: string;
}

export interface StorageData {
  csvMapping: CSVMapping;
  lastImport: Date;
  transactions: StockTransaction[];
}