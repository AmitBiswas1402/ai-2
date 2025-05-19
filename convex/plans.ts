import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createPlan = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    interviewPlan: v.object({
      topic: v.string(),
      level: v.string(),
      questions: v.array(
        v.object({
          question: v.string(),
          answer: v.string(), // You can keep this but it won't be saved unless your schema supports it
        })
      ),
    }),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Deactivate old plans
    const activePlans = await ctx.db
      .query("interviewPlans")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const plan of activePlans) {
      await ctx.db.patch(plan._id, { isActive: false });
    }

    // Transform to match schema
    const newPlan = {
      name: args.name,
      userId: args.userId,
      position: "N/A", // Or make it a part of args if needed
      experienceLevel: "N/A", // Same here
      isActive: args.isActive,
      topics: [
        {
          name: args.interviewPlan.topic,
          numberOfQuestions: args.interviewPlan.questions.length,
          difficulty: args.interviewPlan.level,
          questions: args.interviewPlan.questions.map((q) => ({
            question: q.question,
            difficulty: args.interviewPlan.level,
            solution: q.answer, // Optional
            tags: [], // Optional
          })),
        },
      ],
    };

    const planId = await ctx.db.insert("interviewPlans", newPlan);
    return planId;
  },
});
