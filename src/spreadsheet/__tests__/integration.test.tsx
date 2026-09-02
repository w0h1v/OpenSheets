import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpreadsheetProvider } from '../SpreadsheetProvider';
import { SpreadsheetGrid } from '../components/SpreadsheetGrid';
import { FormulaBar } from '../components/FormulaBar';
import { keyOf } from '../types/spreadsheet';

// Mock virtual scroller
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () =>
      [0, 1, 2, 3, 4, 5, 6].map((i) => ({
        index: i,
        start: i * 28,
        size: 28,
        key: String(i),
      })),
    getTotalSize: () => 196,
    measure: () => {},
  }),
}));

describe('Spreadsheet Integration Tests', () => {
  const TestSpreadsheet = ({ initialData = new Map() }) => (
    <SpreadsheetProvider initialData={initialData} maxRows={10} maxCols={10}>
      <FormulaBar />
      <SpreadsheetGrid />
    </SpreadsheetProvider>
  );

  // Keyboard and clipboard input is owned by the grid's focusable
  // container, so events target it rather than window/document
  const grid = () => screen.getByRole('grid');

  describe('Keyboard Navigation', () => {
    it('should navigate with arrow keys', async () => {
      render(<TestSpreadsheet />);
      
      // Click on first cell
      const firstCell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(firstCell);
      
      // Press arrow down
      fireEvent.keyDown(grid(), { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell A2/i }))
          .toHaveAttribute('aria-current', 'true');
      });
      
      // Press arrow right
      fireEvent.keyDown(grid(), { key: 'ArrowRight' });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell B2/i }))
          .toHaveAttribute('aria-current', 'true');
      });
      
      // Press arrow up
      fireEvent.keyDown(grid(), { key: 'ArrowUp' });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell B1/i }))
          .toHaveAttribute('aria-current', 'true');
      });
      
      // Press arrow left
      fireEvent.keyDown(grid(), { key: 'ArrowLeft' });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell A1/i }))
          .toHaveAttribute('aria-current', 'true');
      });
    });

    it('should navigate with Tab and Shift+Tab', async () => {
      render(<TestSpreadsheet />);
      
      const firstCell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(firstCell);
      
      // Press Tab
      fireEvent.keyDown(grid(), { key: 'Tab' });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell B1/i }))
          .toHaveAttribute('aria-current', 'true');
      });
      
      // Press Shift+Tab
      fireEvent.keyDown(grid(), { key: 'Tab', shiftKey: true });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell A1/i }))
          .toHaveAttribute('aria-current', 'true');
      });
    });

    it('should jump to data edges with Ctrl+Arrow', async () => {
      const initialData = new Map();
      initialData.set(keyOf(0, 0), { value: 'Start' });
      initialData.set(keyOf(5, 0), { value: 'End' });
      
      render(<TestSpreadsheet initialData={initialData} />);
      
      const firstCell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(firstCell);
      
      // Press Ctrl+ArrowDown
      fireEvent.keyDown(grid(), { key: 'ArrowDown', ctrlKey: true });
      await waitFor(() => {
        expect(screen.getByRole('gridcell', { name: /Cell A6/i }))
          .toHaveAttribute('aria-current', 'true');
      });
    });

    it('should select all with Ctrl+A', async () => {
      render(<TestSpreadsheet />);
      
      fireEvent.keyDown(grid(), { key: 'a', ctrlKey: true });
      
      await waitFor(() => {
        const selectedCells = screen.getAllByRole('gridcell', { selected: true });
        expect(selectedCells.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cell Editing', () => {
    it('should enter edit mode on double click', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.doubleClick(cell);
      
      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /Cell A1 editor/i });
        expect(input).toBeInTheDocument();
        expect(input).toHaveFocus();
      });
    });

    it('should enter edit mode on Enter key', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(cell);
      fireEvent.keyDown(grid(), { key: 'Enter' });
      
      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /Cell A1 editor/i });
        expect(input).toBeInTheDocument();
      });
    });

    it('should save cell value on Enter', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.doubleClick(cell);
      
      const input = await screen.findByRole('textbox', { name: /Cell A1 editor/i });
      await userEvent.clear(input);
      await userEvent.type(input, 'Test Value');
      fireEvent.keyDown(input, { key: 'Enter' });
      
      await waitFor(() => {
        expect(screen.getByText('Test Value')).toBeInTheDocument();
      });
    });

    it('should cancel edit on Escape', async () => {
      const initialData = new Map();
      initialData.set(keyOf(0, 0), { value: 'Original' });
      
      render(<TestSpreadsheet initialData={initialData} />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.doubleClick(cell);
      
      const input = await screen.findByRole('textbox', { name: /Cell A1 editor/i });
      await userEvent.clear(input);
      await userEvent.type(input, 'New Value');
      fireEvent.keyDown(input, { key: 'Escape' });
      
      await waitFor(() => {
        expect(screen.getByText('Original')).toBeInTheDocument();
        expect(screen.queryByText('New Value')).not.toBeInTheDocument();
      });
    });

    it('should start editing on printable character', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(cell);
      fireEvent.keyDown(grid(), { key: 'a' });
      
      await waitFor(() => {
        const input = screen.getByRole('textbox', { name: /Cell A1 editor/i });
        expect(input).toBeInTheDocument();
        expect(input).toHaveValue('a');
      });
    });
  });

  describe('Formula Bar Synchronization', () => {
    it('should sync formula bar with active cell', async () => {
      const initialData = new Map();
      initialData.set(keyOf(0, 0), { value: 'Test', formula: '=1+1' });
      
      render(<TestSpreadsheet initialData={initialData} />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(cell);
      
      await waitFor(() => {
        const formulaInput = screen.getByPlaceholderText(/Enter value or formula/i);
        expect(formulaInput).toHaveValue('=1+1');
      });
    });

    it('should update cell from formula bar', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(cell);
      
      const formulaInput = screen.getByPlaceholderText(/Enter value or formula/i);
      await userEvent.clear(formulaInput);
      await userEvent.type(formulaInput, 'Formula Bar Value');
      fireEvent.keyDown(formulaInput, { key: 'Enter' });
      
      await waitFor(() => {
        expect(screen.getByText('Formula Bar Value')).toBeInTheDocument();
      });
    });
  });

  describe('Comments', () => {
    it('adds a comment through the in-app dialog, never a native prompt', async () => {
      const nativePrompt = jest.spyOn(window, 'prompt').mockImplementation(() => 'should not be used');
      render(<TestSpreadsheet />);

      const cell = screen.getByRole('gridcell', { name: /Cell B2/i });
      fireEvent.contextMenu(cell);
      fireEvent.click(screen.getByRole('button', { name: 'Insert comment…' }));

      const dialog = await screen.findByRole('dialog', { name: 'Insert comment' });
      const field = screen.getByLabelText('Comment');
      expect(field).toHaveFocus();
      // Typing into the dialog must not start editing the cell behind it
      fireEvent.keyDown(field, { key: 'n' });
      fireEvent.change(field, { target: { value: 'Needs a second look' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));

      await waitFor(() => {
        expect(screen.getByTitle('You: Needs a second look')).toBeInTheDocument();
      });
      expect(dialog).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /editor/i })).toBeNull();
      expect(nativePrompt).not.toHaveBeenCalled();
      nativePrompt.mockRestore();
    });
  });

  describe('Multi-cell Selection', () => {
    it('should select range with Shift+Click', async () => {
      render(<TestSpreadsheet />);
      
      const firstCell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(firstCell);
      
      const lastCell = screen.getByRole('gridcell', { name: /Cell B2/i });
      fireEvent.mouseDown(lastCell, { shiftKey: true });
      
      await waitFor(() => {
        const selectedCells = screen.getAllByRole('gridcell', { selected: true });
        expect(selectedCells.length).toBe(4); // A1, A2, B1, B2
      });
    });

    it('extends the range only while the button is held', async () => {
      render(<TestSpreadsheet />);
      const a1 = screen.getByRole('gridcell', { name: /Cell A1/i });
      const b2 = screen.getByRole('gridcell', { name: /Cell B2/i });

      fireEvent.mouseDown(a1);
      fireEvent.mouseEnter(b2, { buttons: 1 });
      await waitFor(() => {
        expect(screen.getAllByRole('gridcell', { selected: true })).toHaveLength(4);
      });

      // Once the button is released, a wandering pointer changes nothing
      fireEvent.mouseUp(window);
      fireEvent.mouseEnter(screen.getByRole('gridcell', { name: /Cell C3/i }), { buttons: 0 });
      expect(screen.getAllByRole('gridcell', { selected: true })).toHaveLength(4);
    });

    it('does not keep selecting after a completed click', async () => {
      render(<TestSpreadsheet />);
      const a1 = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(a1);
      fireEvent.mouseUp(a1);
      fireEvent.click(a1);

      fireEvent.mouseEnter(screen.getByRole('gridcell', { name: /Cell B2/i }), { buttons: 0 });
      await waitFor(() => {
        expect(a1).toHaveAttribute('aria-current', 'true');
      });
      expect(screen.getAllByRole('gridcell', { selected: true })).toHaveLength(1);
    });

    it('should extend selection with Shift+Arrow', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(cell);
      
      fireEvent.keyDown(grid(), { key: 'ArrowRight', shiftKey: true });
      fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: true });
      
      await waitFor(() => {
        const selectedCells = screen.getAllByRole('gridcell', { selected: true });
        expect(selectedCells.length).toBe(4);
      });
    });

    it('should add to selection with Ctrl+Click', async () => {
      render(<TestSpreadsheet />);
      
      const cell1 = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(cell1);
      
      const cell2 = screen.getByRole('gridcell', { name: /Cell C3/i });
      fireEvent.mouseDown(cell2, { ctrlKey: true });
      
      await waitFor(() => {
        expect(cell1).toHaveAttribute('aria-selected', 'true');
        expect(cell2).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('Copy and Paste', () => {
    it('should copy and paste single cell', async () => {
      const initialData = new Map();
      initialData.set(keyOf(0, 0), { value: 'Copy Me' });
      
      render(<TestSpreadsheet initialData={initialData} />);
      
      // Select and copy first cell
      const sourceCell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(sourceCell);
      fireEvent.keyDown(grid(), { key: 'c', ctrlKey: true });
      
      // Select and paste to another cell
      const targetCell = screen.getByRole('gridcell', { name: /Cell B2/i });
      fireEvent.mouseDown(targetCell);
      
      // Mock clipboard API
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', 'Copy Me');
      const pasteEvent = new ClipboardEvent('paste', { clipboardData, bubbles: true });
      grid().dispatchEvent(pasteEvent);
      
      await waitFor(() => {
        expect(screen.getAllByText('Copy Me')).toHaveLength(2);
      });
    });

    it('should cut and paste cell', async () => {
      const initialData = new Map();
      initialData.set(keyOf(0, 0), { value: 'Cut Me' });
      
      render(<TestSpreadsheet initialData={initialData} />);
      
      const sourceCell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.mouseDown(sourceCell);
      fireEvent.keyDown(grid(), { key: 'x', ctrlKey: true });
      
      const targetCell = screen.getByRole('gridcell', { name: /Cell B2/i });
      fireEvent.mouseDown(targetCell);
      
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', 'Cut Me');
      const pasteEvent = new ClipboardEvent('paste', { clipboardData, bubbles: true });
      grid().dispatchEvent(pasteEvent);
      
      await waitFor(() => {
        expect(screen.getAllByText('Cut Me')).toHaveLength(1);
        expect(screen.getByRole('gridcell', { name: /Cell A1: empty/i }))
          .toBeInTheDocument();
      });
    });
  });

  describe('Undo and Redo', () => {
    it('should undo cell edit', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.doubleClick(cell);
      
      const input = await screen.findByRole('textbox', { name: /Cell A1 editor/i });
      await userEvent.clear(input);
      await userEvent.type(input, 'First Value');
      fireEvent.keyDown(input, { key: 'Enter' });
      
      await waitFor(() => {
        expect(screen.getByText('First Value')).toBeInTheDocument();
      });
      
      fireEvent.keyDown(grid(), { key: 'z', ctrlKey: true });
      
      await waitFor(() => {
        expect(screen.queryByText('First Value')).not.toBeInTheDocument();
      });
    });

    it('should redo undone action', async () => {
      render(<TestSpreadsheet />);
      
      const cell = screen.getByRole('gridcell', { name: /Cell A1/i });
      fireEvent.doubleClick(cell);
      
      const input = await screen.findByRole('textbox', { name: /Cell A1 editor/i });
      await userEvent.clear(input);
      await userEvent.type(input, 'Test Value');
      fireEvent.keyDown(input, { key: 'Enter' });
      
      fireEvent.keyDown(grid(), { key: 'z', ctrlKey: true });
      fireEvent.keyDown(grid(), { key: 'y', ctrlKey: true });
      
      await waitFor(() => {
        expect(screen.getByText('Test Value')).toBeInTheDocument();
      });
    });
  });
});