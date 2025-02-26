export class CSVPreprocessor {
  // Pre-process CSV to extract 1099-B section and clean data
  static preprocessCSV(csvContent: string): string {
    // Split the CSV into lines
    const lines = csvContent.split(/\r\n|\n/);
    
    // Find the header row index
    const headerIndex = lines.findIndex(line => 
      line.includes('1099-B') && 
      line.includes('ACCOUNT NUMBER') && 
      line.includes('TAX YEAR')
    );

    // If no header found, return empty string
    if (headerIndex === -1) {
      console.error('1099-B header not found');
      return '';
    }

    // Extract lines after the header
    const dataLines = lines.slice(headerIndex + 1);

    // Filter out empty lines and trim
    const cleanedLines = dataLines
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return cleanedLines.join('\n');
  }

  // Additional method to clean and normalize CSV content
  static cleanCSV(csvContent: string): string {
    // Remove extra whitespace and quote handling
    return csvContent
      .split(/\r\n|\n/)
      .map(line => line.trim().replace(/^"|"$/g, ''))
      .filter(line => line.length > 0)
      .join('\n');
  }

  // Comprehensive CSV preprocessing method
  static processCSV(csvContent: string): string {
    // Apply preprocessing steps
    let processedContent = this.preprocessCSV(csvContent);
    processedContent = this.cleanCSV(processedContent);
    
    return processedContent;
  }
}