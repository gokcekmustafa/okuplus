-- Release 0.5: separate daily TrainingSession completion from exercise points.
ALTER TYPE "PointEventType" ADD VALUE 'TRAINING_SESSION_COMPLETED' BEFORE 'CORRECT_ANSWER';
