import ApiError from "../utils/ApiError.js";
import Review from "../models/review.schema.js";
import Project from "../models/project.schema.js";
import User from "../models/user.schema.js";
import mongoose from "mongoose";

const submitReview = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId } = req.params;
    const { decision, comment } = req.body;
    const reviewerId = req.user.userId;

    // Validate input
    if (!decision || !["APPROVED", "REJECTED", "REVISION_REQUIRED"].includes(decision)) {
      throw new ApiError("Invalid decision. Must be APPROVED, REJECTED, or REVISION_REQUIRED", 400);
    }

    if (!comment || comment.trim().length < 10) {
      throw new ApiError("Comment is required and must be at least 10 characters", 400);
    }

    // Check if user is a reviewer
    const user = await User.findById(reviewerId).session(session);
    if (!user || user.role !== "REVIEWER") {
      throw new ApiError("Access denied. Only reviewers can submit reviews", 403);
    }

    // Find the project
    const project = await Project.findById(projectId).session(session);
    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Check if project is assigned to this reviewer
    if (project.assignedReviewerId?.toString() !== reviewerId) {
      throw new ApiError("This project is not assigned to you", 403);
    }

    // Check if project status is UNDER_REVIEW (only allow review when actively under review)
    if (project.status !== "UNDER_REVIEW") {
      throw new ApiError(`Cannot review project with status: ${project.status}. Project must be UNDER_REVIEW.`, 400);
    }

    // Check if there's already a review for the CURRENT review cycle
    // Get the latest review from this reviewer
    const latestReview = await Review.findOne({ projectId, reviewerId })
      .sort({ reviewedAt: -1 })
      .session(session);
    
    // If there's a review and no revision was requested after it, prevent duplicate
    if (latestReview) {
      // Check if this review was submitted after the last revision request
      if (project.revisionRequestedAt) {
        // If revision was requested, allow new review only if the last review is BEFORE the revision request
        if (new Date(latestReview.reviewedAt) > new Date(project.revisionRequestedAt)) {
          throw new ApiError("You have already reviewed this version. Please wait for the scientist to resubmit.", 400);
        }
      } else {
        // No revision requested yet, so any existing review means already reviewed
        throw new ApiError("You have already reviewed this project", 400);
      }
    }

    // Create review
    const review = await Review.create([{
      projectId,
      reviewerId,
      decision,
      comment: comment.trim(),
      reviewedAt: new Date()
    }], { session });

    // Update project status and relevant fields
    let updateData = { status: decision };
    
    if (decision === "APPROVED") {
      updateData.approvedAt = new Date();
      updateData.finalComment = comment.trim();
    } else if (decision === "REJECTED") {
      updateData.rejectedAt = new Date();
      updateData.finalComment = comment.trim();
    } else if (decision === "REVISION_REQUIRED") {
      updateData.revisionRequestedAt = new Date();
      updateData.finalComment = comment.trim();
      // Keep status as REVISION_REQUIRED (scientist needs to make changes)
    }
    
    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      updateData,
      { session, new: true }
    );

    await session.commitTransaction();

    return res.status(201).json({
      message: `Project ${decision.toLowerCase()} successfully`,
      review: {
        id: review[0]._id,
        decision: review[0].decision,
        comment: review[0].comment,
        reviewedAt: review[0].reviewedAt
      },
      projectStatus: updatedProject.status
    });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

export default submitReview;