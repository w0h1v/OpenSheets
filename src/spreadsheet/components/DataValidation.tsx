import React, { useState, useCallback } from 'react';
import { ValidationRule } from '../types/actions';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import styles from './DataValidation.module.css';

interface Props {
  row: number;
  col: number;
  onClose: () => void;
}

export const DataValidation: React.FC<Props> = ({ row, col, onClose }) => {
  const { state, dispatch } = useSpreadsheetEnhanced();
  const existingRule = state.validation?.get(`${row}:${col}`);
  
  const [validationType, setValidationType] = useState<ValidationRule['type']>(
    existingRule?.type || 'number'
  );
  const [min, setMin] = useState<string>(existingRule?.min?.toString() || '');
  const [max, setMax] = useState<string>(existingRule?.max?.toString() || '');
  const [listItems, setListItems] = useState<string>(
    existingRule?.list?.join(', ') || ''
  );
  const [errorMessage, setErrorMessage] = useState<string>(
    existingRule?.errorMessage || ''
  );
  const [showError, setShowError] = useState<boolean>(
    existingRule?.showError !== false
  );

  const handleApply = useCallback(() => {
    const rule: ValidationRule = {
      type: validationType,
      errorMessage,
      showError,
    };

    switch (validationType) {
      case 'number':
        if (min) rule.min = Number(min);
        if (max) rule.max = Number(max);
        break;
      case 'date':
        if (min) rule.min = new Date(min);
        if (max) rule.max = new Date(max);
        break;
      case 'list':
        rule.list = listItems.split(',').map(item => item.trim()).filter(Boolean);
        break;
    }

    dispatch({
      type: 'SET_VALIDATION',
      payload: { row, col, validation: rule },
    });

    onClose();
  }, [validationType, min, max, listItems, errorMessage, showError, row, col, dispatch, onClose]);

  const handleRemove = useCallback(() => {
    dispatch({
      type: 'SET_VALIDATION',
      payload: { row, col, validation: null as any },
    });
    onClose();
  }, [row, col, dispatch, onClose]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Data Validation</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <label htmlFor="validation-type">Validation Type:</label>
          <select
            id="validation-type"
            value={validationType}
            onChange={(e) => setValidationType(e.target.value as ValidationRule['type'])}
          >
            <option value="number">Number</option>
            <option value="text">Text</option>
            <option value="date">Date</option>
            <option value="list">List</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {(validationType === 'number' || validationType === 'date') && (
          <>
            <div className={styles.field}>
              <label htmlFor="min-value">Minimum Value:</label>
              <input
                id="min-value"
                type={validationType === 'date' ? 'date' : 'number'}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                placeholder={`Enter minimum ${validationType}`}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="max-value">Maximum Value:</label>
              <input
                id="max-value"
                type={validationType === 'date' ? 'date' : 'number'}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                placeholder={`Enter maximum ${validationType}`}
              />
            </div>
          </>
        )}

        {validationType === 'list' && (
          <div className={styles.field}>
            <label htmlFor="list-items">List Items (comma-separated):</label>
            <textarea
              id="list-items"
              value={listItems}
              onChange={(e) => setListItems(e.target.value)}
              placeholder="Option 1, Option 2, Option 3"
              rows={3}
            />
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="error-message">Error Message:</label>
          <input
            id="error-message"
            type="text"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            placeholder="Custom error message"
          />
        </div>

        <div className={styles.field}>
          <label>
            <input
              type="checkbox"
              checked={showError}
              onChange={(e) => setShowError(e.target.checked)}
            />
            Show error alert on invalid input
          </label>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.removeButton} onClick={handleRemove}>
          Remove Validation
        </button>
        <div className={styles.actions}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.applyButton} onClick={handleApply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};