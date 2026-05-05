import { z } from "zod";

const optionalTextField = (minLength, maxLength, errorMessage) => 
  z.string()
   .trim()
   .min(minLength, errorMessage)
   .max(maxLength, `Cannot exceed ${maxLength} characters`)
   .optional()
   .or(z.literal("").transform(() => undefined));

export const createProjectSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters").max(200, "Title too long"),
  
  discipline: optionalTextField(2, 100, "Discipline name too short"),
  introduction: optionalTextField(10, 5000, "Introduction must be at least 10 characters"),
  actionPlan: optionalTextField(10, 5000, "Action plan must be at least 10 characters"),
  expectedOutcome: optionalTextField(10, 5000, "Expected outcome must be at least 10 characters"),
  
  year: z.coerce.number().int().min(2000, "Year must be 2000 or later").max(2100).optional(),
  
  objectives: z.array(
    z.string().trim().min(5, "Objective too short").max(500, "Objective too long")
  ).min(1, "At least one objective is required").max(20, "Too many objectives"),
  
  budget: z.object({
    nonRecurring: z.coerce.number().min(0, "Cannot be negative").optional().default(0),
    recurring: z.coerce.number().min(0).optional().default(0),
    travel: z.coerce.number().min(0).optional().default(0),
    operational: z.coerce.number().min(0).optional().default(0),
    manpower: z.coerce.number().min(0).optional().default(0),
  }).optional()
  .transform((data) => {
    if (!data) return undefined; 
    
    const computedTotal = 
      data.nonRecurring + 
      data.recurring + 
      data.travel + 
      data.operational + 
      data.manpower;

    return {
      ...data,
      total: computedTotal
    };
  })
}).strict();