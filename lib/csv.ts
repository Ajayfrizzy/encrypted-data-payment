// Changes from me

import Papa from "papaparse";

export type CsvSummary = {
  columns: string[];
  sampleRows: string[][];
  rowCount: number;
};

export function summarizeCsv(csv: string): CsvSummary {
  const result = Papa.parse<string[]>(csv, {
    delimiter: ",",
    header: false,
    dynamicTyping: false,
    skipEmptyLines: "greedy",
  });

  if (result.errors.length > 0) {
    throw new Error(`Invalid CSV: ${result.errors[0].message}`);
  }

  const [header, ...rows] = result.data;

  if (!header || header.length === 0) {
    throw new Error("CSV header is missing.");
  }

  if (header.length > 50) {
    throw new Error(`CSV has ${header.length} columns. Maximum allowed is 50.`);
  }

  const emptyColumn = header.findIndex((column) => !column.trim());

  if (emptyColumn !== -1) {
    throw new Error(
      `Column ${emptyColumn + 1} has no name. Check for extra commas.`,
    );
  }

  const longColumn = header.findIndex((column) => column.length > 100);

  if (longColumn !== -1) {
    throw new Error(
      `Column ${longColumn + 1} has a name longer than 100 characters.`,
    );
  }

  const columns = header.map((column) => column.trim());

  if (new Set(columns).size !== columns.length) {
    throw new Error("CSV column names must be unique.");
  }

  if (rows.length === 0) {
    throw new Error("CSV must contain at least one data row.");
  }

  const invalidRow = rows.findIndex((row) => row.length !== columns.length);

  if (invalidRow !== -1) {
    throw new Error(
      `Data row ${invalidRow + 1} has the wrong number of cells.`,
    );
  }

  const sampleRows = rows.slice(0, 2);

  if (sampleRows.some((row) => row.some((cell) => cell.length > 500))) {
    throw new Error("Preview cells must not exceed 500 characters.");
  }

  return {
    columns,
    sampleRows,
    rowCount: rows.length,
  };
} // Stop here
