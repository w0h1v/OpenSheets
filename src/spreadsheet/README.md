# Spreadsheet Component (Google Sheets-like for React + TypeScript)

This package provides a production-ready spreadsheet table with Google Sheets-style features:
- Virtualized rendering for large grids
- Cell editing with formulas
- Range selection with keyboard and mouse
- Copy/paste from the OS clipboard
- Formatting toolbar
- Context menu for data operations

## Installation

```bash
npm install @tanstack/react-virtual react-hotkeys-hook
```

## Usage

```tsx
import React from 'react';
import {
  SpreadsheetProvider,
  SpreadsheetTable,
  FormulaBar,
  FormattingToolbar
} from './spreadsheet';

export default function App() {
  return (
    <SpreadsheetProvider>
      <FormattingToolbar />
      <FormulaBar />
      <SpreadsheetTable />
    </SpreadsheetProvider>
  );
}
```

## Features

### Core Features
- **Infinite grid** with row/column headers
- **Virtual scrolling** for performance with large datasets
- **Cell editing** (double-click or press Enter to edit)
- **Formula bar** for viewing and editing cell values/formulas

### Navigation
- Arrow keys to move between cells
- Tab/Shift+Tab for horizontal navigation
- Enter/Shift+Enter for vertical navigation
- Click to select single cell
- Drag to select range (coming soon)

### Formulas
- `=SUM(A1:A5)` - Sum a range of cells
- `=AVERAGE(A1:B10)` - Average of cells
- `=COUNT(A1:C20)` - Count non-empty cells
- Basic arithmetic expressions supported

### Formatting
- Bold, italic, underline, strikethrough
- Text alignment (left, center, right)
- Background and text colors
- Cell borders (coming soon)

### Clipboard Operations
- Ctrl/Cmd+C to copy
- Ctrl/Cmd+V to paste
- Ctrl/Cmd+X to cut
- Supports pasting from Excel/Google Sheets

### Context Menu
Right-click on cells to access:
- Cut, Copy, Paste
- Insert/Delete rows and columns
- Clear cell contents
- Format cells

## API

### SpreadsheetProvider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialData` | `SparseMatrix<CellData>` | `new Map()` | Initial cell data |
| `maxRows` | `number` | `1000` | Maximum number of rows |
| `maxCols` | `number` | `100` | Maximum number of columns |
| `readOnly` | `boolean` | `false` | Disable editing |
| `onCellChange` | `(row, col, data) => void` | - | Callback when cell changes |
| `onSelectionChange` | `(selection) => void` | - | Callback when selection changes |

### Cell Data Structure

```ts
interface CellData {
  value: any;           // Display value
  formula?: string;     // Formula (e.g., "=SUM(A1:A5)")
  format?: CellFormat;  // Formatting options
  metadata?: any;       // Custom metadata
}

interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  color?: string;
  borders?: BorderStyle;
  numberFormat?: string;
}
```

## Styling

All components use CSS modules for easy customization. You can override styles by:

1. Creating your own CSS modules
2. Using CSS-in-JS solutions
3. Overriding the default class names

## Performance

The spreadsheet uses virtualization to handle large datasets efficiently:
- Only visible cells are rendered
- Smooth scrolling with 1000+ rows/columns
- Optimized re-renders using React Context

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Arrow Keys | Navigate cells |
| Tab | Move right |
| Shift+Tab | Move left |
| Enter | Edit cell / Move down |
| Shift+Enter | Move up |
| Escape | Cancel editing |
| Delete/Backspace | Clear cell |
| Ctrl/Cmd+C | Copy |
| Ctrl/Cmd+V | Paste |
| Ctrl/Cmd+X | Cut |
| Ctrl/Cmd+Z | Undo (coming soon) |
| Ctrl/Cmd+Y | Redo (coming soon) |

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

MIT