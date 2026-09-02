type PresenceStore = typeof import('../collaboration/presenceStore');

describe('presenceStore', () => {
  let store: PresenceStore;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();
    store = await import('../collaboration/presenceStore');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with nobody connected and no toasts', () => {
    expect(store.getCollabUsers()).toEqual([]);
    expect(store.getCollabToasts()).toEqual([]);
  });

  it('replaces the user list and notifies subscribers', () => {
    const listener = jest.fn();
    store.subscribeCollab(listener);
    const users = [{ id: 'u1', name: 'Ann', color: '#111', sheetId: 'Sheet1' }];

    store.setCollabUsers(users);

    expect(store.getCollabUsers()).toBe(users);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribeCollab(listener);
    unsubscribe();
    store.setCollabUsers([]);
    expect(listener).not.toHaveBeenCalled();
  });

  describe('toasts', () => {
    it('queues toasts with increasing ids and notifies', () => {
      const listener = jest.fn();
      store.subscribeCollab(listener);

      store.pushCollabToast('Ann joined', '#111');
      store.pushCollabToast('Bob joined', '#222');

      expect(store.getCollabToasts()).toEqual([
        { id: 1, text: 'Ann joined', color: '#111' },
        { id: 2, text: 'Bob joined', color: '#222' },
      ]);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('expires each toast 3.5 seconds after it was pushed', () => {
      store.pushCollabToast('Ann joined', '#111');
      jest.advanceTimersByTime(1000);
      store.pushCollabToast('Bob joined', '#222');

      jest.advanceTimersByTime(2499);
      expect(store.getCollabToasts()).toHaveLength(2);

      jest.advanceTimersByTime(1);
      expect(store.getCollabToasts()).toEqual([{ id: 2, text: 'Bob joined', color: '#222' }]);

      jest.advanceTimersByTime(1000);
      expect(store.getCollabToasts()).toEqual([]);
    });

    it('notifies subscribers when a toast expires', () => {
      const listener = jest.fn();
      store.subscribeCollab(listener);
      store.pushCollabToast('Ann joined', '#111');
      listener.mockClear();

      jest.advanceTimersByTime(3500);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  it('offers a fixed palette of distinct colors', () => {
    expect(store.COLLAB_PALETTE).toHaveLength(10);
    expect(new Set(store.COLLAB_PALETTE).size).toBe(10);
    store.COLLAB_PALETTE.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });
});
