import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const content = await prisma.content.findFirst({
    where: { title: { startsWith: "E2E İçerik Soru" } },
  });
  console.log("Content:", content);

  if (!content) {
    console.log("No content found, creating test content...");
    const newContent = await prisma.content.create({
      data: {
        tenantId: null,
        type: "STORY",
        title: "E2E Test Content " + Date.now(),
        difficulty: 0.5,
        status: "PUBLISHED",
      },
    });
    console.log("Created content:", newContent.id);

    const version = await prisma.contentVersion.create({
      data: {
        contentId: newContent.id,
        version: 1,
        title: "E2E Test Content " + Date.now(),
        body: "Test content body",
        wordCount: 10,
        readabilityScore: 50,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    console.log("Created content version:", version.id);

    await prisma.content.update({
      where: { id: newContent.id },
      data: { currentVersionId: version.id },
    });

    // Test creating a question
    const question = await prisma.question.create({
      data: {
        contentId: newContent.id,
        position: 9999,
        type: "MULTIPLE_CHOICE",
        skillId: null,
      },
    });
    console.log("Question created:", question.id);

    const qVersion = await prisma.questionVersion.create({
      data: {
        questionId: question.id,
        version: 1,
        prompt: "2 + 2 kaçtır?",
        options: [
          { id: "opt-a", text: "3", position: 0 },
          { id: "opt-b", text: "4", position: 1 },
          { id: "opt-c", text: "5", position: 2 },
          { id: "opt-d", text: "6", position: 3 },
        ],
        correctAnswer: {
          type: "MULTIPLE_CHOICE",
          correctOptionIds: ["opt-b"],
          allowMultiple: false,
          partialCredit: false,
        },
        explanation: "Temel toplama işlemi.",
        hint: "İkiyle iki toplayın.",
        difficulty: 0.5,
      },
    });
    console.log("QuestionVersion created:", qVersion.id);

    // Cleanup
    await prisma.questionVersion.delete({ where: { id: qVersion.id } });
    await prisma.question.delete({ where: { id: question.id } });
    await prisma.contentVersion.delete({ where: { id: version.id } });
    await prisma.content.delete({ where: { id: newContent.id } });
    console.log("Test data cleaned up");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
