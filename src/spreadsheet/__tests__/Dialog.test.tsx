import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfirmDialog, PromptDialog, useDialogs } from '../components/Dialog';

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    render(<ConfirmDialog open={false} title="Delete?" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal with the confirm button focused', () => {
    render(<ConfirmDialog open title="Delete sheet?" message="Gone for good." confirmLabel="Delete" onConfirm={() => {}} onCancel={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Delete sheet?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Gone for good.');
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  });

  it('confirms on the button or Enter, cancels on the button, Escape or the backdrop', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(<ConfirmDialog open title="Sure?" onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('hides the cancel button when asked', () => {
    render(<ConfirmDialog open title="Heads up" cancelLabel={null} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('keeps keyboard events away from ancestors', () => {
    const onKeyDown = jest.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <ConfirmDialog open title="Inside" onConfirm={() => {}} onCancel={() => {}} />
      </div>
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'a' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('returns focus to the element that had it', () => {
    const Host = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <ConfirmDialog open={open} title="Modal" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </>
      );
    };
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('button', { name: 'OK' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(opener).toHaveFocus();
  });
});

describe('PromptDialog', () => {
  it('focuses the field, waits for text and submits the trimmed value', () => {
    const onSubmit = jest.fn();
    render(<PromptDialog open title="Rename" label="Sheet name" submitLabel="Rename" onSubmit={onSubmit} onCancel={() => {}} />);
    const field = screen.getByLabelText('Sheet name');
    expect(field).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();

    fireEvent.change(field, { target: { value: '  Budget  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('Budget');
  });

  it('starts from the default value and can allow an empty one', () => {
    const onSubmit = jest.fn();
    render(<PromptDialog open title="Version" label="Label" defaultValue="Draft" allowEmpty onSubmit={onSubmit} onCancel={() => {}} />);
    const field = screen.getByLabelText('Label') as HTMLInputElement;
    expect(field.value).toBe('Draft');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('submits a multiline field with Ctrl+Enter, not Enter', () => {
    const onSubmit = jest.fn();
    render(<PromptDialog open title="Add comment" label="Comment" multiline onSubmit={onSubmit} onCancel={() => {}} />);
    const field = screen.getByLabelText('Comment');
    fireEvent.change(field, { target: { value: 'line one' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith('line one');
  });
});

describe('useDialogs', () => {
  const Host = () => {
    const { confirm, alert, prompt, dialogs } = useDialogs();
    const [log, setLog] = useState<string[]>([]);
    const note = (entry: string) => setLog((l) => [...l, entry]);
    return (
      <>
        {dialogs}
        <button onClick={async () => note(`confirm:${await confirm({ title: 'Delete?', destructive: true })}`)}>ask</button>
        <button onClick={async () => { await alert({ title: 'Saved' }); note('alerted'); }}>tell</button>
        <button onClick={async () => note(`prompt:${await prompt({ title: 'Your name', label: 'Name' })}`)}>name</button>
        <output>{log.join(',')}</output>
      </>
    );
  };

  it('resolves confirm with the answer', async () => {
    render(<Host />);
    fireEvent.click(screen.getByText('ask'));
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('confirm:true'));

    fireEvent.click(screen.getByText('ask'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('confirm:true,confirm:false'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves alert once dismissed and prompt with the text or null', async () => {
    render(<Host />);
    fireEvent.click(screen.getByText('tell'));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('alerted'));

    fireEvent.click(screen.getByText('name'));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Q3' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('prompt:Q3'));

    fireEvent.click(screen.getByText('name'));
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('prompt:null'));
  });

  it('cancels an open request when another one is made', async () => {
    render(<Host />);
    fireEvent.click(screen.getByText('ask'));
    await screen.findByRole('dialog', { name: 'Delete?' });
    await act(async () => { fireEvent.click(screen.getByText('name')); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('confirm:false'));
    expect(screen.getByRole('dialog', { name: 'Your name' })).toBeInTheDocument();
  });
});
