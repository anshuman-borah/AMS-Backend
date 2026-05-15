import Project from "../models/project.schema.js";
import Review from "../models/review.schema.js";
import User from "../models/user.schema.js";
import ApiError from "../utils/ApiError.js";

// Helper function to get status description
const getStatusDescription = (status) => {
  const descriptions = {
    DRAFT: "Proposal is being prepared by the scientist",
    SUBMITTED: "Proposal submitted, waiting for reviewer assignment",
    UNDER_REVIEW: "Proposal is currently being reviewed",
    APPROVED: "Proposal has been approved",
    REJECTED: "Proposal has been rejected",
    REVISION_REQUIRED: "Changes requested, waiting for resubmission"
  };
  return descriptions[status] || "Unknown status";
};

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
      .populate("assignedReviewerId", "name email institution department");

    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Check if project is assigned to this reviewer
    if (project.assignedReviewerId?._id.toString() !== reviewerId && 
        project.assignedReviewerId?.toString() !== reviewerId) {
      throw new ApiError("This project is not assigned to you", 403);
    }

    // Get the latest review from this reviewer
    const latestReview = await Review.findOne({ projectId, reviewerId }).sort({ reviewedAt: -1 });
    
    // Determine if reviewer can submit a review
    // A reviewer can submit review if:
    // 1. Project status is UNDER_REVIEW (active review)
    // 2. OR (Project status is SUBMITTED AND this reviewer is assigned - for first review)
    let canSubmitReview = false;
    
    if (project.status === "UNDER_REVIEW") {
      // For UNDER_REVIEW, always allow review (for revision cycles)
      canSubmitReview = true;
    } else if (project.status === "SUBMITTED" && project.assignedReviewerId?._id.toString() === reviewerId) {
      // First-time review before any review is submitted
      canSubmitReview = true;
    }
    
    // Check if there's already a review for the current review cycle
    // For revision cycles, we need to check if there's a review AFTER the last revision request
    let hasReviewedThisCycle = false;
    
    if (latestReview) {
      if (project.revisionRequestedAt) {
        // If revision was requested, check if review was submitted after revision
        hasReviewedThisCycle = new Date(latestReview.reviewedAt) > new Date(project.revisionRequestedAt);
      } else {
        // No revision yet, so any review means already reviewed
        hasReviewedThisCycle = true;
      }
    }
    
    // If already reviewed this cycle, cannot submit again
    if (hasReviewedThisCycle) {
      canSubmitReview = false;
    }

    // Get all reviews for this project (history)
    const allReviews = await Review.find({ projectId })
      .populate("reviewerId", "name email institution")
      .sort({ reviewedAt: -1 });

    // Calculate time taken for each stage
    const calculateDays = (startDate, endDate) => {
      if (!startDate || !endDate) return null;
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    };

    const timeStats = {
      submissionToAssignment: calculateDays(project.submittedAt, project.assignedAt),
      assignmentToReview: calculateDays(project.assignedAt, project.underReviewAt),
      reviewToDecision: calculateDays(project.underReviewAt, project.approvedAt || project.rejectedAt),
      totalTime: calculateDays(project.createdAt, project.approvedAt || project.rejectedAt || new Date())
    };

    return res.status(200).json({
      project: {
        // Basic Info
        id: project._id,
        uniqueCode: project.uniqueCode,
        version: project.version,
        proposalType: project.proposalType,
        title: project.title,
        discipline: project.discipline,
        stationOrCollege: project.stationOrCollege,
        year: project.year,
        
        // Content
        introduction: project.introduction,
        actionPlan: project.actionPlan,
        expectedOutcome: project.expectedOutcome,
        objectives: project.objectives,
        
        // Budget
        budget: project.budget,
        scientistInvolve: project.scientistInvolve,
        
        // Status & Flow
        status: project.status,
        similarityScore: project.similarityScore,
        finalComment: project.finalComment,
        
        // Timelines
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        submittedAt: project.submittedAt,
        assignedAt: project.assignedAt,
        underReviewAt: project.underReviewAt,
        approvedAt: project.approvedAt,
        rejectedAt: project.rejectedAt,
        revisionRequestedAt: project.revisionRequestedAt,
        
        // Time statistics
        timeStats: timeStats,
        
        // Submitted By (Scientist)
        submittedBy: {
          id: project.ownerId._id,
          name: project.ownerId.name,
          email: project.ownerId.email,
          institution: project.ownerId.institution,
          department: project.ownerId.department
        },
        
        // Assigned Reviewer
        assignedReviewer: project.assignedReviewerId ? {
          id: project.assignedReviewerId._id,
          name: project.assignedReviewerId.name,
          email: project.assignedReviewerId.email,
          institution: project.assignedReviewerId.institution,
          department: project.assignedReviewerId.department
        } : null
      },
      
      // Review information
      review: latestReview || null,
      alreadyReviewed: hasReviewedThisCycle,
      canSubmitReview: canSubmitReview,
      
      // All review history
      reviewHistory: allReviews.map(review => ({
        id: review._id,
        decision: review.decision,
        comment: review.comment,
        score: review.score,
        reviewedBy: {
          id: review.reviewerId._id,
          name: review.reviewerId.name,
          email: review.reviewerId.email,
          institution: review.reviewerId.institution
        },
        reviewedAt: review.reviewedAt
      })),
      
      // Status metadata
      statusInfo: {
        currentStatus: project.status,
        statusDescription: getStatusDescription(project.status),
        canReview: canSubmitReview,
        isPending: project.status === "SUBMITTED" || project.status === "UNDER_REVIEW",
        isCompleted: project.status === "APPROVED" || project.status === "REJECTED",
        isRevisionRequired: project.status === "REVISION_REQUIRED"
      }
    });
    
  } catch (error) {
    next(error);
  }
};

export default getProjectForReview;