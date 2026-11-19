import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/\d/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");

export const loginSchema = z.object({
  identifier: z.string().min(3, "Enter your email or username"),
  password: z.string().min(8, "Enter your password"),
  remember: z.boolean().optional(),
});

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores"),
    email: z.string().email("Enter a valid email"),
    phone: z.string().min(7, "Enter a phone number"),
    password: passwordSchema,
    confirmPassword: z.string(),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    location: z.string().optional(),
    language: z.string().optional(),
    interests: z.array(z.string()).optional(),
    personalizationConsent: z.boolean().optional(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Accept the terms to continue" }) }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const businessApplicationSchema = z
  .object({
    businessName: z.string().min(2, "Business name is required"),
    legalName: z.string().min(2, "Legal name is required"),
    category: z.string().min(2, "Choose a category"),
    country: z.string().min(2, "Country is required"),
    city: z.string().min(2, "City is required"),
    address: z.string().min(4, "Address is required"),
    phone: z.string().min(7, "Business phone is required"),
    email: z.string().email("Enter a valid business email"),
    website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
    description: z.string().min(20, "Add a short description (20+ characters)"),
    ownerName: z.string().min(3, "Owner name is required"),
    ownerEmail: z.string().email("Owner email is required"),
    ownerPhone: z.string().min(7, "Owner phone is required"),
    ownerPassword: z.string().optional(),
    ownerConfirmPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.ownerPassword !== undefined && value.ownerPassword !== "") {
      const check = passwordSchema.safeParse(value.ownerPassword);
      if (!check.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ownerPassword"],
          message: check.error.issues[0]?.message ?? "Use a stronger password",
        });
      }
      if (value.ownerPassword !== value.ownerConfirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ownerConfirmPassword"],
          message: "Passwords do not match",
        });
      }
    }
  });

export const resetRequestSchema = z.object({
  identifier: z.string().min(3, "Enter the email or phone on the account"),
});

export const resetConfirmSchema = z
  .object({
    code: z.string().min(6, "Enter the 6-digit code").max(6),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const serviceSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(8),
  category: z.string().min(2),
  price: z.coerce.number().positive(),
  durationMinutes: z.coerce.number().int().positive(),
  cancellationPolicy: z.string().min(4),
});

export const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(8),
  categoryId: z.string().min(2),
  price: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
});

export const expenseSchema = z.object({
  category: z.string().min(2),
  amount: z.coerce.number().positive(),
  note: z.string().min(2),
  incurredOn: z.string().min(8),
});

export const reviewSchema = z.object({
  rating: z.coerce.number().min(1).max(5),
  title: z.string().min(2),
  body: z.string().min(8),
});

export const addressSchema = z.object({
  label: z.string().min(2),
  line1: z.string().min(4),
  city: z.string().min(2),
  region: z.string().min(2),
  postalCode: z.string().min(3),
  country: z.string().min(2),
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type BusinessApplicationInput = z.infer<typeof businessApplicationSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetConfirmInput = z.infer<typeof resetConfirmSchema>;
