import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Explicit opt-in: these tests delete fixture rows. Never accept the app's
// DATABASE_URL or a remote/shared database as the target.
const databaseUrl = process.env.VERIFIED_CODE_TEST_DATABASE_URL;
if (databaseUrl) {
  const target = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || !/^\/verified_code_test_[a-z0-9_]+$/.test(target.pathname)) {
    throw new Error('VERIFIED_CODE_TEST_DATABASE_URL must target a dedicated local verified_code_test_* database');
  }
}
const integration = databaseUrl ? describe : describe.skip;
let prisma;

const sourceData = (id, extra = {}) => ({
  id, title: 'Season points', language: 'JavaScript', code: 'return results.length;',
  submitterId: 'test-user', ...extra,
});
const verifiedData = (submission) => ({
  sourceSubmissionId: submission.id, title: submission.title, language: submission.language,
  code: submission.code, description: submission.description, tags: submission.tags,
  submitterId: submission.submitterId, verifiedBy: 'test-admin',
});

integration('VerifiedCode migration against PostgreSQL', () => {
  beforeAll(() => {
    prisma = new pkg.PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  });
  beforeEach(async () => {
    await prisma.verifiedCode.deleteMany();
    await prisma.codeSubmission.deleteMany();
  });
  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.verifiedCode.deleteMany();
      await prisma.codeSubmission.deleteMany();
    } finally { await prisma.$disconnect(); }
  });

  test('stores a linked copy with review metadata and rejects duplicate/orphan copies', async () => {
    const source = await prisma.codeSubmission.create({ data: sourceData('source', { status: 'approved' }) });
    const copy = await prisma.verifiedCode.create({ data: verifiedData(source) });
    expect(copy.code).toBe(source.code);
    expect(copy.tags).toEqual([]);
    expect(copy.verifiedAt).toBeInstanceOf(Date);
    expect(copy.verifiedBy).toBe('test-admin');
    const linked = await prisma.codeSubmission.findUnique({ where: { id: source.id }, include: { verifiedCode: true } });
    expect(linked.verifiedCode.id).toBe(copy.id);
    await expect(prisma.verifiedCode.create({ data: verifiedData(source) })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.verifiedCode.create({ data: { ...verifiedData(source), sourceSubmissionId: 'missing' } }))
      .rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.codeSubmission.delete({ where: { id: source.id } })).rejects.toThrow();
    // Also bypass Prisma's relation check to prove PostgreSQL itself
    // rejects deletion of a source that has a verified copy.
    await expect(prisma.$executeRaw`DELETE FROM "code_submission" WHERE "code_submission_id" = ${source.id}`)
      .rejects.toThrow();
    expect(await prisma.codeSubmission.findUnique({ where: { id: source.id } })).not.toBeNull();
    expect(await prisma.verifiedCode.count()).toBe(1);
  });

  test('supports a pipeline transaction that rolls back status if the verified copy fails', async () => {
    const source = await prisma.codeSubmission.create({ data: sourceData('pending') });
    await expect(prisma.$transaction(async (tx) => {
      await tx.codeSubmission.update({ where: { id: source.id }, data: { status: 'approved' } });
      await tx.verifiedCode.create({ data: { ...verifiedData(source), sourceSubmissionId: 'missing' } });
    })).rejects.toMatchObject({ code: 'P2003' });
    expect((await prisma.codeSubmission.findUnique({ where: { id: source.id } })).status).toBe('pending');
    expect(await prisma.verifiedCode.count()).toBe(0);
  });

});
