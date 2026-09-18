type Config = typeof import('../collaboration/config');

describe('collaboration config', () => {
  let config: Config;

  beforeEach(async () => {
    jest.resetModules();
    config = await import('../collaboration/config');
  });

  describe('relayUrl', () => {
    it('defaults to /collab on the page origin', () => {
      expect(config.relayUrl({ protocol: 'http:', host: 'example.test:3000' }))
        .toBe('ws://example.test:3000/collab');
    });

    it('upgrades to wss on an https page', () => {
      expect(config.relayUrl({ protocol: 'https:', host: 'example.test' }))
        .toBe('wss://example.test/collab');
    });

    it('uses a configured relay URL verbatim', () => {
      config.configureCollaboration({ relayUrl: 'wss://relay.example.com/collab' });
      expect(config.relayUrl()).toBe('wss://relay.example.com/collab');
    });
  });

  describe('authUrl', () => {
    it('defaults to /auth on the page origin', () => {
      expect(config.authUrl('login')).toBe('/auth/login');
    });

    it('uses a configured base and tolerates a trailing slash', () => {
      config.configureCollaboration({ authUrl: 'https://relay.example.com/auth/' });
      expect(config.authUrl('register')).toBe('https://relay.example.com/auth/register');
    });

    it('keeps earlier settings when configured again', () => {
      config.configureCollaboration({ relayUrl: 'wss://relay.example.com/collab' });
      config.configureCollaboration({ authUrl: 'https://relay.example.com/auth' });
      expect(config.relayUrl()).toBe('wss://relay.example.com/collab');
      expect(config.authUrl('login')).toBe('https://relay.example.com/auth/login');
    });
  });
});
