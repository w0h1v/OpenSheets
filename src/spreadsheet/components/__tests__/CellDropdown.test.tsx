import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CellDropdown } from '../CellDropdown';
import { ValidationRule } from '../../types/spreadsheet';

describe('CellDropdown', () => {
  const mockValidation: ValidationRule = {
    type: 'list',
    list: ['Option 1', 'Option 2', 'Option 3'],
    allowCustomValues: true,
    searchable: true,
    showDropdownArrow: true
  };

  const defaultProps = {
    validation: mockValidation,
    currentValue: '',
    onSelect: jest.fn(),
    onClose: jest.fn(),
    position: { x: 100, y: 100 },
    cellWidth: 150,
    cellHeight: 24
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dropdown with options', () => {
    render(<CellDropdown {...defaultProps} />);
    
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('shows search input when searchable', () => {
    render(<CellDropdown {...defaultProps} />);
    
    expect(screen.getByPlaceholderText(/Search options/)).toBeInTheDocument();
  });

  it('filters options based on search term', () => {
    render(<CellDropdown {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText(/Search options/);
    fireEvent.change(searchInput, { target: { value: 'Option 2' } });
    
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.queryByText('Option 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Option 3')).not.toBeInTheDocument();
  });

  it('calls onSelect when option is clicked', () => {
    render(<CellDropdown {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Option 1'));
    
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Option 1');
  });

  it('handles keyboard navigation', () => {
    render(<CellDropdown {...defaultProps} />);
    
    // Test arrow down navigation
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Option 1');
  });

  it('shows custom value option when allowed', () => {
    render(<CellDropdown {...defaultProps} />);
    
    const searchInput = screen.getByPlaceholderText(/Search options/);
    fireEvent.change(searchInput, { target: { value: 'Custom Value' } });
    
    expect(screen.getByText('Add "Custom Value"')).toBeInTheDocument();
  });

  it('handles multi-select when enabled', () => {
    const multiSelectValidation = {
      ...mockValidation,
      multiSelect: true
    };
    
    render(<CellDropdown {...defaultProps} validation={multiSelectValidation} />);
    
    fireEvent.click(screen.getByText('Option 1'));
    fireEvent.click(screen.getByText('Option 2'));
    
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Option 1');
    expect(defaultProps.onSelect).toHaveBeenCalledWith('Option 1, Option 2');
  });
});