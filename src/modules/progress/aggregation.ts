import { prisma } from "../../lib/prisma.js";

function getWeekRange(date: Date): { periodStart: Date; periodEnd: Date } {
  const d = new Date(date);
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { periodStart: monday, periodEnd: sunday };
}

/**
 * Bir oturum tamamlandıktan sonra StudentProgress tablosunu günceller.
 * Çağrı: completeExerciseSession() sonrası, aynı transaction DIŞINDA.
 *
 * Recomputational: her öğrenci+skill+period için TÜM tamamlanmış oturumlardan
 * toplam istatistikleri hesaplar. Bu sayede:
 * - Doğru accuracy (cumulative correctCount / scoredAttempts)
 * - İdempotent (aynı session birden fazla çağrılmasında sonuç değişmez)
 */
export async function aggregateSessionProgress(sessionId: string): Promise<void> {
  const session = await prisma.exerciseSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      completedAt: true,
      attempts: {
        select: {
          id: true,
          isCorrect: true,
          rawScore: true,
          timeSpentMs: true,
          answeredAt: true,
          questionVersion: {
            select: {
              question: { select: { skillId: true } },
            },
          },
        },
      },
    },
  });

  if (!session) return;
  if (!session.completedAt) return;

  // Attempt'leri skill'e göre grupla
  const skillIds = new Set<string>();
  for (const attempt of session.attempts) {
    const skillId = attempt.questionVersion?.question?.skillId;
    if (skillId) skillIds.add(skillId);
  }

  if (skillIds.size === 0) return;

  const { periodStart, periodEnd } = getWeekRange(session.completedAt);

  // Her skill için TÜM period'daki tamamlanmış oturumları sorgula
  for (const skillId of skillIds) {
    // Bu student+skill+period'daki TÜM tamamlanmış attempt'leri çek
    const allAttempts = await prisma.attempt.findMany({
      where: {
        session: {
          studentId: session.studentId,
          tenantId: session.tenantId,
          completedAt: { gte: periodStart, lte: periodEnd },
          status: "COMPLETED",
        },
        questionVersion: {
          question: { skillId },
        },
      },
      select: {
        isCorrect: true,
        rawScore: true,
        timeSpentMs: true,
        answeredAt: true,
      },
    });

    // Benzersiz session sayısını hesapla
    const sessionIds = await prisma.exerciseSession.findMany({
      where: {
        studentId: session.studentId,
        tenantId: session.tenantId,
        completedAt: { gte: periodStart, lte: periodEnd },
        status: "COMPLETED",
        attempts: {
          some: {
            questionVersion: {
              question: { skillId },
            },
          },
        },
      },
      select: { id: true },
    });

    const sessionCount = sessionIds.length;
    const attemptCount = allAttempts.length;
    const correctCount = allAttempts.filter((a) => a.isCorrect === true).length;
    const scoredAttempts = allAttempts.filter((a) => a.rawScore !== null);
    const accuracy = scoredAttempts.length > 0 ? correctCount / scoredAttempts.length : null;

    const timeValues = allAttempts.filter((a) => a.timeSpentMs !== null).map((a) => a.timeSpentMs!);
    const avgTimeMs =
      timeValues.length > 0
        ? Math.round(timeValues.reduce((sum, t) => sum + t, 0) / timeValues.length)
        : null;

    const lastAttemptAt =
      allAttempts.length > 0
        ? allAttempts.reduce(
            (latest, a) => (a.answeredAt > latest ? a.answeredAt : latest),
            allAttempts[0]!.answeredAt,
          )
        : session.completedAt;

    const uniqueKey = {
      tenantId_studentId_skillId_periodStart_periodEnd: {
        tenantId: session.tenantId,
        studentId: session.studentId,
        skillId,
        periodStart,
        periodEnd,
      },
    };

    try {
      await prisma.studentProgress.upsert({
        where: uniqueKey,
        create: {
          tenantId: session.tenantId,
          studentId: session.studentId,
          skillId,
          periodStart,
          periodEnd,
          sessionCount,
          attemptCount,
          correctCount,
          accuracy,
          avgTimeMs,
          lastAttemptAt,
        },
        update: {
          sessionCount,
          attemptCount,
          correctCount,
          accuracy,
          avgTimeMs,
          lastAttemptAt,
        },
      });
    } catch {
      // Upsert failure shouldn't break session completion
    }
  }
}
