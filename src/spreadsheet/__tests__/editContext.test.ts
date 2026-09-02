type EditContext = typeof import('../utils/editContext');

describe('editContext', () => {
  let ctx: EditContext;

  beforeEach(async () => {
    jest.resetModules();
    ctx = await import('../utils/editContext');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults the author to "local" and lets it be changed', () => {
    expect(ctx.getEditAuthor()).toBe('local');
    ctx.setEditAuthor('alice');
    expect(ctx.getEditAuthor()).toBe('alice');
  });

  it('stamps edits with the current time and author', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1234);
    ctx.setEditAuthor('bob');
    expect(ctx.stampEditMeta()).toEqual({ ts: 1234, by: 'bob' });
  });

  describe('editStampWins', () => {
    const stamp = (ts: number, by: string) => ({ ts, by });

    it('prefers any stamp over none, and none over none is a loss', () => {
      expect(ctx.editStampWins(stamp(1, 'a'), undefined)).toBe(true);
      expect(ctx.editStampWins(undefined, stamp(1, 'a'))).toBe(false);
      expect(ctx.editStampWins(undefined, undefined)).toBe(false);
    });

    it('prefers the later timestamp', () => {
      expect(ctx.editStampWins(stamp(2, 'a'), stamp(1, 'z'))).toBe(true);
      expect(ctx.editStampWins(stamp(1, 'z'), stamp(2, 'a'))).toBe(false);
    });

    it('breaks timestamp ties by author id, so both sides agree on a winner', () => {
      expect(ctx.editStampWins(stamp(1, 'b'), stamp(1, 'a'))).toBe(true);
      expect(ctx.editStampWins(stamp(1, 'a'), stamp(1, 'b'))).toBe(false);
    });

    it('never lets an identical stamp beat itself', () => {
      expect(ctx.editStampWins(stamp(1, 'a'), stamp(1, 'a'))).toBe(false);
    });
  });

  describe('remote apply tracking', () => {
    it('is off by default and nests begin/end calls', () => {
      expect(ctx.isRemoteApplying()).toBe(false);
      ctx.beginRemoteApply();
      ctx.beginRemoteApply();
      ctx.endRemoteApply();
      expect(ctx.isRemoteApplying()).toBe(true);
      ctx.endRemoteApply();
      expect(ctx.isRemoteApplying()).toBe(false);
    });

    it('never goes negative on unbalanced end calls', () => {
      ctx.endRemoteApply();
      ctx.beginRemoteApply();
      expect(ctx.isRemoteApplying()).toBe(true);
    });
  });
});
