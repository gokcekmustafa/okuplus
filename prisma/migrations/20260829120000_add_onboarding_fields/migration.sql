-- AŞAMA 8D: onboarding state + learning goal (StudentProfile)
ALTER TABLE "StudentProfile" ADD COLUMN "learningGoal" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
