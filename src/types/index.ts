export interface StockTransaction {
  name: string;
  purchaseDate: string;
  dateSold: string;
  salesPrice: number;
  costBasis: number;
  quantity: number;
  gain: number;
  loss: number;
  isShortTerm: boolean;
}