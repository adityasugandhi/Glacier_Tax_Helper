# Glacier Tax Helper

A Chrome extension to help nonresident aliens fill in 1099-B stock transactions by importing from CSV files.

## Features

- Import stock transactions from CSV files
- Automatically fill in Glacier Tax forms
- Support for multiple CSV formats
- Easy-to-use interface

## Installation

1. Clone the repository:
\`\`\`bash
git clone https://github.com/yourusername/glacier-tax-helper.git
cd glacier-tax-helper
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Build the extension:
\`\`\`bash
npm run build
\`\`\`

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` directory

## Development

- Start development server:
\`\`\`bash
npm start
\`\`\`

- Run tests:
\`\`\`bash
npm test
\`\`\`

- Lint code:
\`\`\`bash
npm run lint
\`\`\`

- Format code:
\`\`\`bash
npm run format
\`\`\`

## Project Structure

\`\`\`
src/
├── components/    # Reusable UI components
├── background/    # Background script
├── content/       # Content scripts
├── popup/         # Popup UI
├── options/       # Options page
├── utils/         # Shared utilities
└── types/         # TypeScript type definitions
\`\`\`

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.