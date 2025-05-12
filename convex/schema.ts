import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
    clerkId: v.string(),
  }).index("by_clerk_id", ["clerkId"]),

  interviewPlans: defineTable({
    userId: v.string(),
    name: v.string(), // e.g. "SDE-1 Prep", "Backend Focus"
    position: v.string(), // e.g. "SDE-1", "Frontend Engineer"
    experienceLevel: v.string(), // e.g. "Fresher", "1-3 years", "Senior"
    topics: v.array(
      v.object({
        name: v.string(), // e.g. "Arrays", "System Design"
        numberOfQuestions: v.number(),
        difficulty: v.string(), // "Easy" | "Medium" | "Hard"
        questions: v.array(
          v.object({
            question: v.string(),
            solution: v.optional(v.string()),
            tags: v.optional(v.array(v.string())),
            difficulty: v.string(), // Optional per-question difficulty
          })
        ),
      })
    ),
    isActive: v.boolean(),
  })
    .index("by_user_id", ["userId"])
    .index("by_active", ["isActive"]),
});
