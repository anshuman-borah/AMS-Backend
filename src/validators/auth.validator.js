import { z } from "zod";

const allowedExpertise = [
  "COMPUTER_SCIENCE",
  "AGRICULTURE",
  "BIOTECHNOLOGY",
  "MECHANICAL",
  "CIVIL",
  "Soil Science",
  "Crop Science",
  "Forestry",
  "Food Technology"
];

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required")
});
export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  role: z.enum(["SCIENTIST", "REVIEWER", "ADMIN"]),
  expertise: z.array(z.string()).optional() // Changed to array
}).superRefine((data, ctx) => {
  // Only validate expertise for REVIEWER
  if (data.role === "REVIEWER") {
    // Expertise required for reviewer
    if (!data.expertise || data.expertise.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expertise"],
        message: "At least one expertise is required for reviewer"
      });
      return;
    }

    // Each expertise must match allowed disciplines
    for (const exp of data.expertise) {
      if (!allowedExpertise.includes(exp)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expertise"],
          message: `Invalid expertise: ${exp}. Must be one of: ${allowedExpertise.join(", ")}`
        });
        break; // Stop after first error
      }
    }
  }
});