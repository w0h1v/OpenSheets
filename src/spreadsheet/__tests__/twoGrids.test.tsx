import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpreadsheetProvider } from '../SpreadsheetProvider';
import { SpreadsheetGrid } from '../components/SpreadsheetGrid';
import { FormulaBar } from '../components/FormulaBar';
import { FormattingToolbar } from '../components/FormattingToolbar';

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

// Two independent spreadsheets side by side on one page
const Sheet = ({ id }: { id: string }) => (
  <div data-testid={id}>
    <SpreadsheetProvider maxRows={10} maxCols={10}>
      <FormattingToolbar />
      <FormulaBar />
      <SpreadsheetGrid />
    </SpreadsheetProvider>
  </div>
);

const scopeOf = (id: string) => within(screen.getByTestId(id));
type Scope = ReturnType<typeof scopeOf>;

const renderTwoGrids = () => {
  render(
    <>
      <Sheet id="left" />
      <Sheet id="right" />
    </>
  );
  return { left: scopeOf('left'), right: scopeOf('right') };
};

// "Cell A1:" (with the colon) so A1 never matches A10
const cell = (scope: Scope, ref: string) =>
  scope.getByRole('gridcell', { name: new RegExp(`^Cell ${ref}:`) });

const currentCellLabel = (scope: Scope) => {
  const current = scope.queryAllByRole('gridcell').find((el) => el.getAttribute('aria-current') === 'true');
  return current?.getAttribute('aria-label') ?? null;
};

describe('Two grids on one page', () => {
  it('moves the selection only in the focused grid', async () => {
    const { left, right } = renderTwoGrids();

    // Clicking a cell focuses that grid's container
    fireEvent.mouseDown(cell(left, 'A1'));
    expect(left.getByRole('grid')).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(currentCellLabel(left)).toMatch(/^Cell A2:/));
    expect(currentCellLabel(right)).toBeNull();

    // Clicking into the other grid moves focus, and keys now drive it alone
    fireEvent.mouseDown(cell(right, 'A1'));
    expect(right.getByRole('grid')).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(currentCellLabel(right)).toMatch(/^Cell B1:/));
    expect(currentCellLabel(left)).toMatch(/^Cell A2:/);
  });

  it('starts editing only in the focused grid when typing', async () => {
    const { left, right } = renderTwoGrids();

    fireEvent.mouseDown(cell(right, 'A1'));
    await userEvent.keyboard('h');

    const editor = await right.findByRole('textbox', { name: /Cell A1 editor/i });
    expect(editor).toHaveValue('h');
    expect(left.queryByRole('textbox', { name: /editor/i })).toBeNull();

    // The rest of the word goes to that editor, and Enter commits it there
    await userEvent.keyboard('i{Enter}');
    await waitFor(() => expect(cell(right, 'A1')).toHaveAccessibleName('Cell A1: hi'));
    expect(cell(left, 'A1')).toHaveAccessibleName('Cell A1: empty');
  });

  it('undoes only in the focused grid', async () => {
    const { left, right } = renderTwoGrids();

    // Give each grid an edit of its own
    fireEvent.mouseDown(cell(left, 'A1'));
    await userEvent.keyboard('one{Enter}');
    await waitFor(() => expect(cell(left, 'A1')).toHaveAccessibleName('Cell A1: one'));

    fireEvent.mouseDown(cell(right, 'A1'));
    await userEvent.keyboard('two{Enter}');
    await waitFor(() => expect(cell(right, 'A1')).toHaveAccessibleName('Cell A1: two'));

    // Undo with the left grid focused reverts the left edit only
    fireEvent.mouseDown(cell(left, 'B2'));
    expect(left.getByRole('grid')).toHaveFocus();
    await userEvent.keyboard('{Control>}z{/Control}');

    await waitFor(() => expect(cell(left, 'A1')).toHaveAccessibleName('Cell A1: empty'));
    expect(cell(right, 'A1')).toHaveAccessibleName('Cell A1: two');
  });

  it('opens the filter panel only in the grid whose toolbar was used', async () => {
    const { left, right } = renderTwoGrids();

    fireEvent.mouseDown(cell(left, 'A1'));
    fireEvent.click(left.getByTitle('Create a filter'));

    expect(await left.findByText(/^Filter Column 1$/)).toBeInTheDocument();
    expect(right.queryByText(/Filter Column/)).toBeNull();

    // Pressing in the other grid dismisses the first panel (it is a press
    // outside it) and that grid opens its own panel from its own store
    fireEvent.mouseDown(cell(right, 'B1'));
    fireEvent.click(right.getByTitle('Create a filter'));

    expect(await right.findByText(/^Filter Column 2$/)).toBeInTheDocument();
    expect(left.queryByText(/Filter Column/)).toBeNull();
  });

  it('does not treat keys typed in the formula bar as grid shortcuts', async () => {
    const { left } = renderTwoGrids();

    fireEvent.mouseDown(cell(left, 'A1'));
    const formulaInput = left.getByPlaceholderText(/Enter value or formula/i);
    formulaInput.focus();
    await userEvent.keyboard('{ArrowDown}x');

    expect(currentCellLabel(left)).toMatch(/^Cell A1:/);
    expect(left.queryByRole('textbox', { name: /editor/i })).toBeNull();
    expect(formulaInput).toHaveValue('x');
  });
});
