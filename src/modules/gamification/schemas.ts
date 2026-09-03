import { z } from "zod";

export const studentGamificationQuerySchema = z.object({}).strict();

export type StudentGamificationQuery = z.infer<typeof studentGamificationQuerySchema>;
