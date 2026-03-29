import Papa from 'papaparse';

export interface RawCSVData {
  headers: { name: string; index: number }[];
  rows: any[][];
}

export const parseCSVFile = (file: File): Promise<RawCSVData> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const rawHeaders = results.data[0] as string[];
          const rows = results.data.slice(1) as any[][];
          
          // Filter headers: remove empty, null, undefined, and dummy names like "열 1" or "Column 7"
          const dummyPattern = /^(열\s*\d+|Column\s*\d+)$/i;
          const headers = rawHeaders
            .map((name, index) => ({ 
              name: (name || '').trim(), 
              index 
            }))
            .filter(h => 
              h.name !== '' && 
              !dummyPattern.test(h.name)
            );

          resolve({ headers, rows });
        } else {
          reject(new Error('Empty file or invalid CSV format'));
        }
      },
      error: (error) => {
        reject(error);
      },
      skipEmptyLines: true,
    });
  });
};

export const cleanAmount = (value: any): number => {
  if (typeof value === 'number') return Math.abs(value);
  if (!value || typeof value !== 'string') return 0;
  
  // Remove non-numeric characters except digits
  const numericString = value.replace(/[^0-9]/g, '');
  const amount = parseInt(numericString, 10);
  
  return isNaN(amount) ? 0 : Math.abs(amount);
};

export const cleanDate = (value: any): string => {
  if (!value || typeof value !== 'string') return new Date().toISOString().split('T')[0];
  
  // Replace . or / with -
  let normalized = value.trim().replace(/[\.\/]/g, '-');
  
  // If it's like 2024-3-27, pad with zeros: 2024-03-27
  const parts = normalized.split('-');
  if (parts.length === 3) {
    const year = parts[0].length === 2 ? `20${parts[0]}` : parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return normalized;
};
