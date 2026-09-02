import React from 'react';
import { act, render } from '@testing-library/react';
import { useCollaboration } from '../collaboration/useCollaboration';
import { configureCollaboration } from '../collaboration/config';
import * as authStore from '../collaboration/authStore';
import * as presenceStore from '../collaboration/presenceStore';
import { getEditAuthor, setEditAuthor } from '../utils/editContext';
import { CellData, SpreadsheetState, keyOf } from '../types/spreadsheet';

// A WebSocket stand-in whose lifecycle the test drives by hand
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    act(() => { this.onopen?.(); });
  }

  receive(msg: unknown) {
    act(() => { this.onmessage?.({ data: JSON.stringify(msg) }); });
  }

  receiveRaw(data: string) {
    act(() => { this.onmessage?.({ data }); });
  }

  drop() {
    this.readyState = FakeSocket.CLOSED;
    act(() => { this.onclose?.(); });
  }

  messages(type?: string) {
    return this.sent.map((m) => JSON.parse(m)).filter((m) => !type || m.type === type);
  }
}

const ME = { id: 'me', name: 'Me', color: '#111111', authenticated: false };
const THEM = { id: 'them', name: 'Them', color: '#222222' };

const emptyState = (): SpreadsheetState => ({
  data: new Map(),
  maxRows: 10,
  maxCols: 10,
  selection: { ranges: [], active: null },
  editing: null,
  formulaInput: '',
});

describe('useCollaboration', () => {
  let state: SpreadsheetState;
  let dispatch: jest.Mock;
  let queue: Record<string, string>;

  const socket = (index = 0) => FakeSocket.instances[index];

  const mount = (props: Partial<Parameters<typeof useCollaboration>[0]> = {}) => {
    const api: { send?: (msg: unknown) => void; connected?: boolean } = {};
    const Host: React.FC = () => {
      const collab = useCollaboration({
        getState: () => state,
        dispatch,
        sheetId: 'Sheet1',
        ...props,
      });
      api.send = collab.send;
      api.connected = collab.connected;
      return null;
    };
    const view = render(<Host />);
    return { api, view, Host };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    FakeSocket.instances = [];
    state = emptyState();
    dispatch = jest.fn((action) => {
      // Apply remote cell writes so later diffs see them
      if (action.type === 'SET_CELLS') {
        action.payload.updates.forEach(({ row, col, data }: { row: number; col: number; data: CellData }) => {
          state.data.set(keyOf(row, col), data);
        });
      }
    });
    queue = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => queue[k] ?? null,
        setItem: (k: string, v: string) => { queue[k] = v; },
        removeItem: (k: string) => { delete queue[k]; },
        clear: () => { queue = {}; },
        key: () => null,
        length: 0,
      },
    });
    (global as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
    configureCollaboration({ relayUrl: 'ws://relay.test/collab' });
    jest.spyOn(authStore, 'getIdentity').mockReturnValue(ME);
    jest.spyOn(authStore, 'subscribeAuth').mockReturnValue(() => true);
    jest.spyOn(authStore, 'getAuthToken').mockReturnValue('tok');
    jest.spyOn(authStore, 'getClientSlot').mockReturnValue({ clientId: 'slot-1', clientSecret: 'sec-1' });
    jest.spyOn(authStore, 'setClientSlot').mockImplementation(() => {});
    jest.spyOn(authStore, 'adoptServerIdentity').mockImplementation(() => {});
    jest.spyOn(presenceStore, 'setCollabUsers');
    jest.spyOn(presenceStore, 'pushCollabToast').mockImplementation(() => {});
    setEditAuthor('local');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    setEditAuthor('local');
  });

  describe('connecting', () => {
    it('opens the configured relay and greets it with the slot and token', () => {
      mount();
      expect(socket().url).toBe('ws://relay.test/collab');

      socket().open();

      expect(socket().messages()[0]).toEqual({
        type: 'hello',
        clientId: 'slot-1',
        clientSecret: 'sec-1',
        token: 'tok',
        user: ME,
      });
      expect(socket().messages()[1]).toEqual({ type: 'sync', sheetId: 'Sheet1' });
      expect(getEditAuthor()).toBe('me');
    });

    it('connects to nothing when disabled', () => {
      mount({ enabled: false });
      expect(FakeSocket.instances).toHaveLength(0);
    });

    it('says bye and closes on unmount', () => {
      const { view } = mount();
      socket().open();
      act(() => { view.unmount(); });
      expect(socket().messages('bye')).toHaveLength(1);
      expect(socket().readyState).toBe(FakeSocket.CLOSED);
      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([]);
    });
  });

  describe('roster', () => {
    it('adopts the assigned client slot and the identity the relay derived', () => {
      mount();
      socket().open();

      socket().receive({ type: 'roster', clientId: 'c9', clientSecret: 's9', you: { ...ME, id: 'server-me' }, users: [] });

      expect(authStore.setClientSlot).toHaveBeenCalledWith({ clientId: 'c9', clientSecret: 's9' });
      expect(authStore.adoptServerIdentity).toHaveBeenCalledWith({ ...ME, id: 'server-me' });
      expect(getEditAuthor()).toBe('server-me');
    });

    it('publishes everyone but us as remote users', () => {
      mount();
      socket().open();

      socket().receive({ type: 'roster', users: [ME, THEM], you: ME });

      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([{ ...THEM, sheetId: undefined }]);
    });
  });

  describe('snapshots', () => {
    const snapshot = { type: 'snapshot', sheetId: 'Sheet1', data: [['0:0', { value: 'server' }]] };

    it('applies a snapshot when the document is empty', () => {
      mount();
      socket().open();

      socket().receive(snapshot);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_CELLS',
        payload: { updates: [{ row: 0, col: 0, data: { value: 'server' } }] },
      });
    });

    it('keeps local data instead of overwriting it with a snapshot', () => {
      state.data.set(keyOf(0, 0), { value: 'mine' });
      mount();
      socket().open();

      socket().receive(snapshot);

      expect(dispatch).not.toHaveBeenCalled();
      expect(state.data.get(keyOf(0, 0))).toEqual({ value: 'mine' });
    });

    it('ignores snapshots for another sheet or with no rows', () => {
      mount();
      socket().open();
      socket().receive({ ...snapshot, sheetId: 'Sheet2' });
      socket().receive({ ...snapshot, data: [] });
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('remote cell edits', () => {
    const cellsFrom = (updates: Array<{ row: number; col: number; data: Partial<CellData> }>, over: Record<string, unknown> = {}) =>
      ({ type: 'cells', sheetId: 'Sheet1', clientId: 'their-client', user: THEM, updates, ...over });

    it('applies remote writes that beat the local edit stamp', () => {
      state.data.set(keyOf(1, 1), { value: 'old', editMeta: { ts: 10, by: 'me' } });
      mount();
      socket().open();

      socket().receive(cellsFrom([{ row: 1, col: 1, data: { value: 'new', editMeta: { ts: 20, by: 'them' } } }]));

      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_CELLS',
        payload: { updates: [{ row: 1, col: 1, data: { value: 'new', editMeta: { ts: 20, by: 'them' } } }] },
      });
    });

    it('drops remote writes that lose to the local edit stamp', () => {
      state.data.set(keyOf(1, 1), { value: 'mine', editMeta: { ts: 30, by: 'me' } });
      mount();
      socket().open();

      socket().receive(cellsFrom([{ row: 1, col: 1, data: { value: 'stale', editMeta: { ts: 20, by: 'them' } } }]));

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('ignores its own echo by client id', () => {
      mount();
      socket().open();
      socket().receive({ type: 'roster', clientId: 'mine', clientSecret: 's', users: [], you: ME });

      socket().receive(cellsFrom([{ row: 0, col: 0, data: { value: 'echo', editMeta: { ts: 1, by: 'me' } } }], { clientId: 'mine' }));

      expect(dispatch).not.toHaveBeenCalled();
    });

    it('ignores edits for another sheet and malformed frames', () => {
      mount();
      socket().open();
      socket().receive(cellsFrom([{ row: 0, col: 0, data: { value: 'x', editMeta: { ts: 1, by: 'them' } } }], { sheetId: 'Sheet2' }));
      socket().receiveRaw('not json');
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('tracks the sender as a present user, but not another tab of our own account', () => {
      mount();
      socket().open();
      socket().receive({ type: 'roster', users: [], you: ME });
      (presenceStore.setCollabUsers as jest.Mock).mockClear();

      socket().receive(cellsFrom([]));
      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: 'them', sheetId: 'Sheet1', editing: false }),
      ]);

      (presenceStore.setCollabUsers as jest.Mock).mockClear();
      socket().receive(cellsFrom([], { user: ME, clientId: 'other-tab' }));
      expect(presenceStore.setCollabUsers).not.toHaveBeenCalled();
    });
  });

  describe('presence', () => {
    it('announces joins and leaves', () => {
      mount();
      socket().open();

      socket().receive({ type: 'join', user: THEM });
      expect(presenceStore.pushCollabToast).toHaveBeenCalledWith('Them joined', '#222222');
      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([THEM]);

      socket().receive({ type: 'leave', user: THEM });
      expect(presenceStore.pushCollabToast).toHaveBeenCalledWith('Them left', '#222222');
      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([]);
    });

    it('ignores join and leave frames about ourselves', () => {
      mount();
      socket().open();
      socket().receive({ type: 'join', user: ME });
      socket().receive({ type: 'leave', user: ME });
      expect(presenceStore.pushCollabToast).not.toHaveBeenCalled();
    });

    it('records another user\'s selection, and only for the sheet we are on', () => {
      mount();
      socket().open();
      const selection = { sheetId: 'Sheet1', startRow: 1, startCol: 1, endRow: 2, endCol: 2 };

      socket().receive({ type: 'selection', sheetId: 'Sheet1', user: THEM, selection, clientId: 'their-client' });
      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'them', selection })]);

      socket().receive({ type: 'selection', sheetId: 'Sheet2', user: THEM, selection, clientId: 'their-client' });
      expect(presenceStore.setCollabUsers).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: 'them', sheetId: 'Sheet2', selection: undefined }),
      ]);
    });

    it('broadcasts our own selection, normalized, when it changes', () => {
      const { view, Host } = mount();
      socket().open();

      state.selection = { ranges: [{ startRow: 3, startCol: 4, endRow: 1, endCol: 2 }], active: null };
      act(() => { view.rerender(<Host />); });

      expect(socket().messages('selection')).toEqual([{
        type: 'selection',
        sheetId: 'Sheet1',
        selection: { sheetId: 'Sheet1', startRow: 1, startCol: 2, endRow: 3, endCol: 4 },
      }]);

      // The same selection again is not re-broadcast
      state.selection = { ...state.selection };
      act(() => { view.rerender(<Host />); });
      expect(socket().messages('selection')).toHaveLength(1);
    });

    it('hands every relayed frame to the caller, and survives a listener that throws', () => {
      const onRemoteMessage = jest.fn(() => { throw new Error('listener blew up'); });
      mount({ onRemoteMessage });
      socket().open();

      socket().receive({ type: 'sheets', user: THEM, clientId: 'their-client', sheets: ['A'] });

      expect(onRemoteMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'sheets' }));
    });
  });

  describe('outgoing edits', () => {
    it('sends changed and cleared cells after the diff delay', () => {
      state.data.set(keyOf(0, 0), { value: 'before' });
      mount();
      socket().open();

      state.data.set(keyOf(0, 0), { value: 'after' });
      state.data.set(keyOf(2, 2), { value: 'added' });
      act(() => { jest.advanceTimersByTime(300 + 150); });

      expect(socket().messages('cells')).toEqual([{
        type: 'cells',
        sheetId: 'Sheet1',
        updates: [
          { row: 0, col: 0, data: { value: 'after' } },
          { row: 2, col: 2, data: { value: 'added' } },
        ],
      }]);

      state.data.delete(keyOf(2, 2));
      act(() => { jest.advanceTimersByTime(300 + 150); });
      expect(socket().messages('cells')[1].updates).toEqual([{ row: 2, col: 2, data: { value: '' } }]);
    });

    it('sends nothing while the document is unchanged', () => {
      mount();
      socket().open();
      act(() => { jest.advanceTimersByTime(3000); });
      expect(socket().messages('cells')).toHaveLength(0);
    });

    it('keeps edits pending while offline and re-sends them once reconnected', () => {
      mount();
      socket().open();
      socket().drop();

      state.data.set(keyOf(0, 0), { value: 'offline edit' });
      act(() => { jest.advanceTimersByTime(1000); });
      expect(socket().messages('cells')).toHaveLength(0);

      act(() => { jest.advanceTimersByTime(1000); });
      socket(1).open();
      act(() => { jest.advanceTimersByTime(300 + 150); });

      expect(socket(1).messages('cells')[0].updates).toEqual([{ row: 0, col: 0, data: { value: 'offline edit' } }]);
    });
  });

  describe('send', () => {
    it('sends immediately over an open socket', () => {
      const { api } = mount();
      socket().open();

      act(() => { api.send?.({ type: 'sheets', sheets: ['A'] }); });

      expect(socket().messages('sheets')).toEqual([{ type: 'sheets', sheets: ['A'] }]);
    });

    it('buffers while connecting and flushes on open', () => {
      const { api } = mount();

      act(() => { api.send?.({ type: 'sheets', sheets: ['A'] }); });
      expect(socket().sent).toHaveLength(0);

      socket().open();
      expect(socket().messages('sheets')).toEqual([{ type: 'sheets', sheets: ['A'] }]);
    });

    it('queues sheet messages in storage while offline and flushes them on reconnect', () => {
      const { api } = mount();
      socket().open();
      socket().drop();

      act(() => { api.send?.({ type: 'sheets', sheets: ['A'] }); });
      expect(JSON.parse(queue.opensheets_collab_queue)).toEqual([{ type: 'sheets', sheets: ['A'] }]);

      act(() => { jest.advanceTimersByTime(1000); });
      socket(1).open();

      expect(socket(1).messages('sheets')).toEqual([{ type: 'sheets', sheets: ['A'] }]);
      expect(JSON.parse(queue.opensheets_collab_queue)).toEqual([]);
    });

    it('does not persist cell messages while offline (the differ re-sends them)', () => {
      const { api } = mount();
      socket().open();
      socket().drop();

      act(() => { api.send?.({ type: 'cells', updates: [] }); });

      expect(JSON.parse(queue.opensheets_collab_queue ?? '[]')).toEqual([]);
    });
  });

  describe('reconnecting', () => {
    it('backs off exponentially after a drop', () => {
      mount();
      socket().open();

      socket().drop();
      act(() => { jest.advanceTimersByTime(999); });
      expect(FakeSocket.instances).toHaveLength(1);
      act(() => { jest.advanceTimersByTime(1); });
      expect(FakeSocket.instances).toHaveLength(2);

      socket(1).drop();
      act(() => { jest.advanceTimersByTime(1999); });
      expect(FakeSocket.instances).toHaveLength(2);
      act(() => { jest.advanceTimersByTime(1); });
      expect(FakeSocket.instances).toHaveLength(3);
    });

    it('resets the backoff after a successful connection', () => {
      mount();
      socket().open();
      socket().drop();
      act(() => { jest.advanceTimersByTime(1000); });
      socket(1).open();

      socket(1).drop();
      act(() => { jest.advanceTimersByTime(1000); });
      expect(FakeSocket.instances).toHaveLength(3);
    });

    it('gives up after twelve attempts', () => {
      mount();
      for (let i = 0; i < 20; i++) {
        FakeSocket.instances[FakeSocket.instances.length - 1].drop();
        act(() => { jest.advanceTimersByTime(20000); });
      }
      expect(FakeSocket.instances).toHaveLength(13);
    });

    it('retries when the socket constructor itself throws', () => {
      const failing = jest.fn(() => { throw new Error('refused'); });
      (global as unknown as { WebSocket: unknown }).WebSocket = failing;
      mount();
      expect(failing).toHaveBeenCalledTimes(1);

      act(() => { jest.advanceTimersByTime(1000); });
      expect(failing).toHaveBeenCalledTimes(2);
    });

    it('stops reconnecting once unmounted', () => {
      const { view } = mount();
      socket().open();
      socket().drop();
      act(() => { view.unmount(); });
      act(() => { jest.advanceTimersByTime(30000); });
      expect(FakeSocket.instances).toHaveLength(1);
    });
  });
});
