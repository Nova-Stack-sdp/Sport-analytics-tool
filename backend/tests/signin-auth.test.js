/**
 * Sign-in backend contract tests based on current UI:
 * - Email + password form
 * - Provider sign-in intents (Google/GitHub)
 *
 * Expected module under test:
 *   ../src/auth/signin.js
 * Expected named exports:
 *   - signInWithPassword(input, deps)
 *   - startProviderSignIn(input, deps)
 */

let signInWithPassword;
let startProviderSignIn;

beforeAll(async () => {
	// Load the module once so all test groups target the same public auth API.
	try {
		const mod = await import('../src/auth/signin.js');
		signInWithPassword = mod.signInWithPassword;
		startProviderSignIn = mod.startProviderSignIn;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Missing auth module. Create backend/src/auth/signin.js with signInWithPassword and startProviderSignIn. Original error: ${reason}`
		);
	}
});

function buildDeps(overrides = {}) {
	// Dependency container for service/repository functions used by auth logic.
	// We mock every side-effect so tests assert behavior, not infrastructure.
	return {
		users: {
			findByEmail: jest.fn(),
			incrementFailedSignIn: jest.fn(),
			resetFailedSignIn: jest.fn(),
			updateLastSignInAt: jest.fn()
		},
		password: {
			verify: jest.fn()
		},
		tokens: {
			issueAccessToken: jest.fn(),
			issueRefreshToken: jest.fn()
		},
		sessions: {
			createSession: jest.fn(),
			revokePreviousSessionsForDevice: jest.fn()
		},
		rateLimiter: {
			consume: jest.fn()
		},
		lockout: {
			isLocked: jest.fn(),
			lock: jest.fn()
		},
		audit: {
			info: jest.fn(),
			warn: jest.fn()
		},
		providerAuth: {
			createAuthorizationUrl: jest.fn()
		},
		now: () => new Date('2026-08-22T12:00:00.000Z')
	};
}

function validPayload(overrides = {}) {
	// Baseline request shape coming from the current SignIn UI form.
	return {
		email: 'driver@example.com',
		password: 'Sup3rStrongPassword!',
		ip: '203.0.113.10',
		userAgent: 'jest-test-agent',
		...overrides
	};
}

describe('signInWithPassword business rules', () => {
	// Table-driven validation coverage for the minimum required form fields.
	test.each([
		[{ email: '', password: 'validpassword123' }, 'email is required'],
		[{ email: 'bad-email-format', password: 'validpassword123' }, 'email format is invalid'],
		[{ email: 'driver@example.com', password: '' }, 'password is required']
	])('rejects invalid request payload: %s', async (input, expectedMessage) => {
		const deps = buildDeps();

		await expect(signInWithPassword(validPayload(input), deps)).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			message: expectedMessage
		});
	});

	test('trims and normalizes email before lookup', async () => {
		const deps = buildDeps();
		// Allow request to pass security gates so normalization behavior is visible.
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue(null);

		await expect(
			signInWithPassword(validPayload({ email: '  DRIVER@EXAMPLE.COM  ' }), deps)
		).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS'
		});

		// Email should be normalized before querying persistence.
		expect(deps.users.findByEmail).toHaveBeenCalledWith('driver@example.com');
	});

	test('rejects unknown email with generic error', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue(null);

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS',
			message: 'Invalid email or password'
		});

		// No user record means no hash comparison should run.
		expect(deps.password.verify).not.toHaveBeenCalled();
		// Security audit trail should still capture failed attempt metadata.
		expect(deps.audit.warn).toHaveBeenCalled();
	});

	test('rejects inactive account states', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue({
			id: 'u_1',
			email: 'driver@example.com',
			passwordHash: 'hash',
			status: 'SUSPENDED'
		});

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'ACCOUNT_DISABLED',
			message: 'Account is not active'
		});

		// Disabled accounts must fail early without password checks.
		expect(deps.password.verify).not.toHaveBeenCalled();
	});

	test('rejects wrong password with generic message and records failure', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue({
			id: 'u_1',
			email: 'driver@example.com',
			passwordHash: 'hash',
			status: 'ACTIVE'
		});
		deps.password.verify.mockResolvedValue(false);

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS',
			message: 'Invalid email or password'
		});

		// Verify user-supplied secret against stored hash.
		expect(deps.password.verify).toHaveBeenCalledWith('Sup3rStrongPassword!', 'hash');
		// Failed attempts should be counted for lockout policy.
		expect(deps.users.incrementFailedSignIn).toHaveBeenCalledWith('u_1');
	});

	test('accepts correct credentials and returns auth artifacts without sensitive fields', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue({
			id: 'u_1',
			email: 'driver@example.com',
			passwordHash: 'hash',
			status: 'ACTIVE',
			role: 'ANALYST'
		});
		deps.password.verify.mockResolvedValue(true);
		deps.tokens.issueAccessToken.mockResolvedValue('access.token.value');
		deps.tokens.issueRefreshToken.mockResolvedValue('refresh.token.value');
		deps.sessions.createSession.mockResolvedValue({ id: 'sess_1' });

		const result = await signInWithPassword(validPayload(), deps);

		expect(result).toMatchObject({
			user: {
				id: 'u_1',
				email: 'driver@example.com',
				role: 'ANALYST'
			},
			accessToken: 'access.token.value',
			refreshToken: 'refresh.token.value'
		});

		// Response contract should exclude hash and other sensitive internals.
		expect(result.user.passwordHash).toBeUndefined();
		expect(result.passwordHash).toBeUndefined();

		// Successful auth must reset counters and persist activity/session state.
		expect(deps.users.resetFailedSignIn).toHaveBeenCalledWith('u_1');
		expect(deps.users.updateLastSignInAt).toHaveBeenCalledWith('u_1', deps.now());
		expect(deps.sessions.createSession).toHaveBeenCalled();
	});
});

describe('signInWithPassword security rules', () => {
	test('rate limits repeated requests per IP/email key', async () => {
		const deps = buildDeps();
		// Simulate exhausted request quota from limiter.
		deps.rateLimiter.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'RATE_LIMITED'
		});

		// Blocked traffic should not reach user lookup.
		expect(deps.users.findByEmail).not.toHaveBeenCalled();
	});

	test('blocks sign-in when account is currently locked', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(true);

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'ACCOUNT_LOCKED'
		});

		// Lock state should short-circuit authentication flow.
		expect(deps.users.findByEmail).not.toHaveBeenCalled();
	});

	test('locks account after threshold failed attempts', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue({
			id: 'u_1',
			email: 'driver@example.com',
			passwordHash: 'hash',
			status: 'ACTIVE',
			failedSignInCount: 5
		});
		deps.password.verify.mockResolvedValue(false);

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS'
		});

		// Failing at threshold should activate lockout policy.
		expect(deps.lockout.lock).toHaveBeenCalledWith('u_1');
	});

	test('creates tokens and session only on successful authentication', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue({
			id: 'u_1',
			email: 'driver@example.com',
			passwordHash: 'hash',
			status: 'ACTIVE'
		});
		deps.password.verify.mockResolvedValue(false);

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS'
		});

		// Token/session creation is forbidden unless credentials are valid.
		expect(deps.tokens.issueAccessToken).not.toHaveBeenCalled();
		expect(deps.tokens.issueRefreshToken).not.toHaveBeenCalled();
		expect(deps.sessions.createSession).not.toHaveBeenCalled();
	});

	test('does not log raw passwords or secret token values', async () => {
		const deps = buildDeps();
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue(null);

		await expect(signInWithPassword(validPayload(), deps)).rejects.toMatchObject({
			code: 'INVALID_CREDENTIALS'
		});

		const loggedPayloads = [
			...deps.audit.info.mock.calls.flat(),
			...deps.audit.warn.mock.calls.flat()
		].filter((entry) => typeof entry === 'object' && entry !== null);

		// Catch accidental secret leakage in structured logs.
		const leakedSecret = loggedPayloads.some((entry) => {
			const content = JSON.stringify(entry);
			return content.includes('Sup3rStrongPassword!') || content.includes('token');
		});

		expect(leakedSecret).toBe(false);
	});
});

describe('startProviderSignIn authentication rules', () => {
	test.each(['google', 'github'])('creates provider authorization URL for %s', async (provider) => {
		const deps = buildDeps();
		// UI supports Google/GitHub buttons, so backend must map those providers.
		deps.providerAuth.createAuthorizationUrl.mockResolvedValue('https://auth.provider/redirect');

		const result = await startProviderSignIn(
			{
				provider,
				returnTo: '/overview'
			},
			deps
		);

		expect(deps.providerAuth.createAuthorizationUrl).toHaveBeenCalledWith(
			expect.objectContaining({ provider, returnTo: '/overview' })
		);
		// Backend returns redirect URL for frontend to continue OAuth flow.
		expect(result).toEqual({ authorizationUrl: 'https://auth.provider/redirect' });
	});

	test('rejects unsupported provider names', async () => {
		const deps = buildDeps();

		await expect(
			startProviderSignIn(
				{
					provider: 'twitter',
					returnTo: '/overview'
				},
				deps
			)
		).rejects.toMatchObject({
			code: 'UNSUPPORTED_PROVIDER'
		});

		// Unsupported providers should fail before any provider integration call.
		expect(deps.providerAuth.createAuthorizationUrl).not.toHaveBeenCalled();
	});
});

describe('input abuse and edge-case handling', () => {
	test('rejects excessively long email/password payloads', async () => {
		const deps = buildDeps();
		// Simulates payload abuse attempting to stress parser/validator limits.
		const longString = 'a'.repeat(10_000);

		await expect(
			signInWithPassword(validPayload({ email: `${longString}@example.com` }), deps)
		).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});

		await expect(signInWithPassword(validPayload({ password: longString }), deps)).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});
	});

	test('rejects malformed payload shape safely', async () => {
		const deps = buildDeps();
		// Null/undefined input should be handled safely with validation errors.

		await expect(signInWithPassword(null, deps)).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});

		await expect(signInWithPassword(undefined, deps)).rejects.toMatchObject({
			code: 'VALIDATION_ERROR'
		});
	});

	test('reuses or revokes prior same-device session to avoid duplicates', async () => {
		const deps = buildDeps();
		// Simulate successful auth path so session lifecycle behavior can be asserted.
		deps.rateLimiter.consume.mockResolvedValue({ allowed: true });
		deps.lockout.isLocked.mockResolvedValue(false);
		deps.users.findByEmail.mockResolvedValue({
			id: 'u_1',
			email: 'driver@example.com',
			passwordHash: 'hash',
			status: 'ACTIVE'
		});
		deps.password.verify.mockResolvedValue(true);
		deps.tokens.issueAccessToken.mockResolvedValue('access.token.value');
		deps.tokens.issueRefreshToken.mockResolvedValue('refresh.token.value');
		deps.sessions.createSession.mockResolvedValue({ id: 'sess_2' });

		await signInWithPassword(validPayload(), deps);

		// Prevent parallel stale sessions for the same user/device fingerprint.
		expect(deps.sessions.revokePreviousSessionsForDevice).toHaveBeenCalledWith(
			'u_1',
			expect.objectContaining({ ip: '203.0.113.10', userAgent: 'jest-test-agent' })
		);
	});
});
