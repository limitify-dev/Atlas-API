/**
 * WS4 verification: drives the real finance services end-to-end against the
 * dev DB — post fee → parent submits proof → staff reviews (approve) → invoice
 * becomes PAID with the balance settled. Creates a throwaway invoice for one
 * existing student and cleans up everything it created afterwards.
 *
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/verify-finance-flow.ts
 */
import 'dotenv/config';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../finance/invoices/invoices.service';
import { PaymentsService } from '../finance/payments/payments.service';
import { FeeScope } from '../finance/dto/post-fee.dto';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  // Warm the pool + an interactive transaction so the first real one below
  // isn't charged cold-start latency against the 5s transaction budget.
  await prisma.$transaction(async (tx) => {
    await tx.student.count();
  });

  // DomainEventsService only fires notifications; a no-op stub is fine here.
  const eventsStub = { emit: async () => undefined } as any;
  const invoices = new InvoicesService(prisma, eventsStub);
  const payments = new PaymentsService(prisma, eventsStub);

  const created: { invoiceId?: string; submissionId?: string } = {};
  let ok = true;
  const log = (label: string, value: unknown) =>
    console.log(`  ${label.padEnd(26)} ${JSON.stringify(value)}`);

  try {
    // ── Fixtures: pick a real student + a real user in the same tenant ──
    const student = await prisma.student.findFirst({
      select: { id: true, tenantId: true, firstName: true, lastName: true },
    });
    if (!student) throw new Error('No students in DB to test with.');
    const actor = await prisma.user.findFirst({
      where: { tenantId: student.tenantId },
      select: { id: true },
    });
    const actorId =
      actor?.id ??
      (await prisma.user.findFirst({ select: { id: true } }))!.id;

    console.log('\n── Finance flow verification ──────────────────────────');
    log('student', `${student.firstName} ${student.lastName} (${student.id})`);
    log('tenant', student.tenantId);

    // ── 1. Post a fee (admin) → creates the balance/invoice ──
    const postResult = await invoices.postFee(
      student.tenantId,
      {
        title: '__VERIFY__ Term Fee',
        amount: '250.00',
        currency: 'USD',
        dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
        term: 'VERIFY-T1',
        category: 'tuition',
        scope: FeeScope.STUDENTS,
        studentIds: [student.id],
      },
      actorId,
    );
    log('1. postFee created', postResult.created);
    if (postResult.created !== 1) throw new Error('postFee did not create the invoice');

    const invoice = await prisma.invoice.findFirst({
      where: { tenantId: student.tenantId, studentId: student.id, title: '__VERIFY__ Term Fee' },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoice) throw new Error('Created invoice not found');
    created.invoiceId = invoice.id;
    log('   invoice status', invoice.status);
    log('   invoice amount', String(invoice.amount));

    // ── 2. Parent submits proof of payment ──
    await payments.submitProof(
      student.tenantId,
      invoice.id,
      { amountClaimed: '250.00', note: 'verify script' },
      actorId,
    );
    const afterSubmit = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    const submission = await prisma.paymentSubmission.findFirst({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: 'desc' },
    });
    created.submissionId = submission?.id;
    log('2. after submit-proof', `invoice=${afterSubmit?.status} submission=${submission?.status}`);
    if (!submission) throw new Error('Submission not created');

    // ── 3. Staff reviews → APPROVE (the "triage") ──
    await payments.review(
      student.tenantId,
      submission.id,
      { approved: true, reviewNote: 'verified' },
      actorId,
    );
    const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    const finalSubmission = await prisma.paymentSubmission.findUnique({ where: { id: submission.id } });
    log('3. after approve', `invoice=${finalInvoice?.status} amountPaid=${String(finalInvoice?.amountPaid)} submission=${finalSubmission?.status}`);

    // ── Assertions ──
    const paid = finalInvoice?.status === 'PAID';
    const settled = Number(finalInvoice?.amountPaid) === 250;
    const approved = finalSubmission?.status === 'APPROVED';
    console.log('\n── Result ─────────────────────────────────────────────');
    log('invoice PAID', paid);
    log('amountPaid = 250', settled);
    log('submission APPROVED', approved);
    ok = !!(paid && settled && approved);
    console.log(`\n  ${ok ? '✅ PASS — end-to-end flow works' : '❌ FAIL — see above'}\n`);
  } catch (e) {
    ok = false;
    console.error('\n❌ ERROR during verification:', e);
  } finally {
    // ── Cleanup: remove everything this script created ──
    if (created.submissionId)
      await prisma.paymentSubmission.deleteMany({ where: { id: created.submissionId } });
    if (created.invoiceId)
      await prisma.invoice.deleteMany({ where: { id: created.invoiceId } });
    await prisma.$disconnect();
  }
  process.exit(ok ? 0 : 1);
}

main();
