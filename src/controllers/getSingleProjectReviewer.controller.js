import Project from "../models/project.schema.js";
import Review from "../models/review.schema.js";
import User from "../models/user.schema.js";
import ApiError from "../utils/ApiError.js";

// Get a single project details for review
const getProjectForReview = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const reviewerId = req.user.userId;
    
    // Check if user is a reviewer
    const user = await User.findById(reviewerId);
    if (!user || user.role !== "REVIEWER") {
      throw new ApiError("Access denied. Only reviewers can access this resource", 403);
    }
    
    const project = await Project.findById(projectId)
      .populate("ownerId", "name email institution department")
      .populate("assignedReviewerId", "name email");

    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Check if project is assigned to this reviewer
    if (project.assignedReviewerId?._id.toString() !== reviewerId && 
        project.assignedReviewerId?.toString() !== reviewerId) {
      throw new ApiError("This project is not assigned to you", 403);
    }

    // REMOVED status check - Reviewer can view project regardless of status
    // Only submission will be restricted based on status

    // Check if project is already reviewed
    const existingReview = await Review.findOne({ projectId, reviewerId });
    
    // Determine if reviewer can submit review (only for SUBMITTED or UNDER_REVIEW status)
    const canSubmitReview = project.status === "SUBMITTED" || project.status === "UNDER_REVIEW";
    
    // Determine if review is already submitted
    const isAlreadyReviewed = !!existingReview;

    return res.status(200).json({
      project: {
        id: project._id,
        uniqueCode: project.uniqueCode,
        title: project.title,
        discipline: project.discipline,
        stationOrCollege: project.stationOrCollege,
        year: project.year,
        introduction: project.introduction,
        actionPlan: project.actionPlan,
        expectedOutcome: project.expectedOutcome,
        objectives: project.objectives,
        budget: project.budget,
        scientistInvolve: project.scientistInvolve,
        status: project.status,
        similarityScore: project.similarityScore,
        finalComment: project.finalComment,
        submittedAt: project.submittedAt,
        assignedAt: project.assignedAt,
        underReviewAt: project.underReviewAt,
        approvedAt: project.approvedAt,
        rejectedAt: project.rejectedAt,
        revisionRequestedAt: project.revisionRequestedAt,
        submittedBy: {
          id: project.ownerId._id,
          name: project.ownerId.name,
          email: project.ownerId.email,
          institution: project.ownerId.institution,
          department: project.ownerId.department
        },
        assignedReviewer: project.assignedReviewerId ? {
          id: project.assignedReviewerId._id,
          name: project.assignedReviewerId.name,
          email: project.assignedReviewerId.email
        } : null
      },
      review: existingReview || null,
      alreadyReviewed: isAlreadyReviewed,
      canSubmitReview: canSubmitReview && !isAlreadyReviewed // Can only submit if status allows and not already reviewed
    });
    
  } catch (error) {
    next(error);
  }
};

export default getProjectForReview;