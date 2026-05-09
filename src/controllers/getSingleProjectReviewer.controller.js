import Project from "../models/project.schema.js";
import Review from "../models/review.schema.js";
import ApiError from "../utils/ApiError.js";

// Get a single project details for review
 const getProjectForReview = async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const reviewerId = req.user.userId;
      
      // Check if user is a reviewer
  
      const project = await Project.findById(projectId)
        .populate("ownerId", "name email")
        .populate("assignedReviewerId", "name email");
  
      if (!project) {
        throw new ApiError("Project not found", 404);
      }
  
      // Check if project is assigned to this reviewer
      if (project.assignedReviewerId?._id.toString() !== reviewerId && 
          project.assignedReviewerId?.toString() !== reviewerId) {
        throw new ApiError("This project is not assigned to you", 403);
      }
  
      // Check if project is already reviewed
      const existingReview = await Review.findOne({ projectId, reviewerId });
      if (existingReview) {
        return res.status(200).json({
          project,
          review: existingReview,
          alreadyReviewed: true
        });
      }
  
      return res.status(200).json({
        project,
        alreadyReviewed: false
      });
    } catch (error) {
      next(error);
    }
  };

  export default getProjectForReview;
  