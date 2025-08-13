import React from 'react';
import { Meta, StoryObj } from '@storybook/react';

import { SpreadsheetProvider } from './SpreadsheetContext';
import { SpreadsheetTable } from './components/SpreadsheetTable';
import { FormattingToolbar } from './components/FormattingToolbar';
import { FormulaBar } from './components/FormulaBar';
import { keyOf, CellData } from './types/spreadsheet';

// ===== Sample Data =====
const createSampleData = () => {
  const data = new Map<string, CellData>();
  
  // Headers
  data.set(keyOf(0, 0), { value: 'Product', format: { bold: true, backgroundColor: '#f0f0f0' } });
  data.set(keyOf(0, 1), { value: 'Q1', format: { bold: true, backgroundColor: '#f0f0f0' } });
  data.set(keyOf(0, 2), { value: 'Q2', format: { bold: true, backgroundColor: '#f0f0f0' } });
  data.set(keyOf(0, 3), { value: 'Q3', format: { bold: true, backgroundColor: '#f0f0f0' } });
  data.set(keyOf(0, 4), { value: 'Q4', format: { bold: true, backgroundColor: '#f0f0f0' } });
  data.set(keyOf(0, 5), { value: 'Total', format: { bold: true, backgroundColor: '#f0f0f0' } });
  
  // Product A
  data.set(keyOf(1, 0), { value: 'Product A', format: { bold: true } });
  data.set(keyOf(1, 1), { value: 100 });
  data.set(keyOf(1, 2), { value: 150 });
  data.set(keyOf(1, 3), { value: 200 });
  data.set(keyOf(1, 4), { value: 250 });
  data.set(keyOf(1, 5), { value: '=SUM(B2:E2)', formula: '=SUM(B2:E2)' });
  
  // Product B
  data.set(keyOf(2, 0), { value: 'Product B', format: { bold: true } });
  data.set(keyOf(2, 1), { value: 80 });
  data.set(keyOf(2, 2), { value: 120 });
  data.set(keyOf(2, 3), { value: 140 });
  data.set(keyOf(2, 4), { value: 160 });
  data.set(keyOf(2, 5), { value: '=SUM(B3:E3)', formula: '=SUM(B3:E3)' });
  
  // Product C
  data.set(keyOf(3, 0), { value: 'Product C', format: { bold: true } });
  data.set(keyOf(3, 1), { value: 90 });
  data.set(keyOf(3, 2), { value: 110 });
  data.set(keyOf(3, 3), { value: 130 });
  data.set(keyOf(3, 4), { value: 170 });
  data.set(keyOf(3, 5), { value: '=SUM(B4:E4)', formula: '=SUM(B4:E4)' });
  
  // Totals row
  data.set(keyOf(4, 0), { value: 'Total', format: { bold: true, backgroundColor: '#e8f4f8' } });
  data.set(keyOf(4, 1), { value: '=SUM(B2:B4)', formula: '=SUM(B2:B4)', format: { backgroundColor: '#e8f4f8' } });
  data.set(keyOf(4, 2), { value: '=SUM(C2:C4)', formula: '=SUM(C2:C4)', format: { backgroundColor: '#e8f4f8' } });
  data.set(keyOf(4, 3), { value: '=SUM(D2:D4)', formula: '=SUM(D2:D4)', format: { backgroundColor: '#e8f4f8' } });
  data.set(keyOf(4, 4), { value: '=SUM(E2:E4)', formula: '=SUM(E2:E4)', format: { backgroundColor: '#e8f4f8' } });
  data.set(keyOf(4, 5), { value: '=SUM(F2:F4)', formula: '=SUM(F2:F4)', format: { backgroundColor: '#e8f4f8', bold: true } });
  
  // Some formatted examples
  data.set(keyOf(6, 0), { value: 'Formatted Examples:', format: { bold: true, italic: true } });
  data.set(keyOf(7, 0), { value: 'Bold Text', format: { bold: true } });
  data.set(keyOf(8, 0), { value: 'Italic Text', format: { italic: true } });
  data.set(keyOf(9, 0), { value: 'Underlined', format: { underline: true } });
  data.set(keyOf(10, 0), { value: 'Red Background', format: { backgroundColor: '#ffcccc' } });
  data.set(keyOf(11, 0), { value: 'Blue Text', format: { color: '#0066cc' } });
  data.set(keyOf(12, 0), { value: 'Center Aligned', format: { textAlign: 'center' } });
  
  return data;
};

// ===== Storybook Meta =====
const meta: Meta = {
  title: 'Spreadsheet/Full Example',
  component: SpreadsheetTable,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <SpreadsheetProvider initialData={createSampleData()} maxRows={100} maxCols={26}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100vh',
          background: '#fff' 
        }}>
          <FormattingToolbar />
          <FormulaBar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Story />
          </div>
        </div>
      </SpreadsheetProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SpreadsheetTable>;

// ===== Stories =====

export const Default: Story = {
  args: {},
};

export const EmptySpreadsheet: Story = {
  decorators: [
    (Story) => (
      <SpreadsheetProvider maxRows={50} maxCols={20}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100vh',
          background: '#fff' 
        }}>
          <FormattingToolbar />
          <FormulaBar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Story />
          </div>
        </div>
      </SpreadsheetProvider>
    ),
  ],
};

export const ReadOnly: Story = {
  decorators: [
    (Story) => (
      <SpreadsheetProvider 
        initialData={createSampleData()} 
        maxRows={100} 
        maxCols={26}
        readOnly={true}
      >
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100vh',
          background: '#fff' 
        }}>
          <div style={{ 
            padding: '8px', 
            background: '#fff3cd', 
            borderBottom: '1px solid #ffc107',
            color: '#856404'
          }}>
            📋 Read-only mode - Editing is disabled
          </div>
          <FormulaBar />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Story />
          </div>
        </div>
      </SpreadsheetProvider>
    ),
  ],
};

export const LargeDataset: Story = {
  decorators: [
    (Story) => {
      // Generate a large dataset for performance testing
      const largeData = new Map<string, CellData>();
      for (let r = 0; r < 100; r++) {
        for (let c = 0; c < 20; c++) {
          if (r === 0) {
            largeData.set(keyOf(r, c), { 
              value: `Header ${c + 1}`, 
              format: { bold: true, backgroundColor: '#f0f0f0' } 
            });
          } else {
            largeData.set(keyOf(r, c), { 
              value: `R${r}C${c}` 
            });
          }
        }
      }
      
      return (
        <SpreadsheetProvider initialData={largeData} maxRows={1000} maxCols={100}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100vh',
            background: '#fff' 
          }}>
            <div style={{ 
              padding: '8px', 
              background: '#d4edda', 
              borderBottom: '1px solid #28a745',
              color: '#155724'
            }}>
              🚀 Large Dataset: 1000 rows × 100 columns with virtual scrolling
            </div>
            <FormattingToolbar />
            <FormulaBar />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Story />
            </div>
          </div>
        </SpreadsheetProvider>
      );
    },
  ],
};