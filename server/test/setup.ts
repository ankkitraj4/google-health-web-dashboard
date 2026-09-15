// Runs before every test file. Sets required env vars to throwaway test-only
// values before any application module is imported — db.ts, oauth.ts,
// crypto.ts etc. all read process.env at module load time.
process.env.DATABASE_PATH = ':memory:';
process.env.TOKEN_ENCRYPTION_KEY = 'dGhpcy1pcy1hLXRlc3Qtb25seS0zMi1ieXRlLWtleSE='; // "this-is-a-test-only-32-byte-key!" — never used outside tests
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.OAUTH_REDIRECT_URI = 'http://localhost:5173/callback';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
