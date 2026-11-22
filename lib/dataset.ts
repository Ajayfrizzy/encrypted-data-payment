// New dataset types and demo data for the application - Changes from me

export type DatasetPreview = {
    title: string;
    description: string;
    columns: string[];
    sampleRows: string[][];
    rowCount: number;
};

export type DatasetContent = {
    filename: string;
    csv: string;
}

export const demoPreview: DatasetPreview = {
  title: 'Sample Store Transactions',
  description: 'Five fictional transactions for practicing data analysis.',
  columns: ['order_id', 'category', 'amount_ngn'],
  sampleRows: [
    ['ORD-001', 'Books', '4500'],
    ['ORD-002', 'Clothing', '12000'],
  ],
  rowCount: 5,
};

export const demoContent: DatasetContent = {
  filename: 'sample-store-transactions.csv',
  csv: [
    'order_id,category,amount_ngn',
    'ORD-001,Books,4500',
    'ORD-002,Clothing,12000',
    'ORD-003,Electronics,35000',
    'ORD-004,Books,6000',
    'ORD-005,Groceries,8500',
  ].join('\n'),
};

export function parseDatasetContent(text: string): DatasetContent {
  const value: unknown = JSON.parse(text);

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Decrypted dataset must be an object.");
  }

  if (
    !("filename" in value) ||
    typeof value.filename !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\.csv$/i.test(value.filename)
  ) {
    throw new Error("Dataset must have a valid CSV filename.");
  }

  if (
    !("csv" in value) ||
    typeof value.csv !== "string" ||
    !value.csv.trim()
  ) {
    throw new Error("Dataset CSV content is missing.");
  }

  return {
    filename: value.filename,
    csv: value.csv,
  };
} // Stop here