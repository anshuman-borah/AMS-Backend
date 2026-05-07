import Similarity from "../models/similarity.schema.js";
import Project from "../models/project.schema.js";
import ApiError from "../utils/ApiError.js";

export const getProjectSimilarity = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    // Check if the project actually exists
    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Only the owner, Admin, Reviewer can view this
    const isOwner = project.ownerId.toString() === req.user.userId;
    const isPrivilegedUser = ["ADMIN", "REVIEWER"].includes(req.user.role);

    if (!isOwner && !isPrivilegedUser) {
      throw new ApiError("Unauthorized to view this similarity report", 403);
    }
    
    
    const similarityReport = await Similarity.findOne({ projectId })
      .populate("matches.projectId", "title status ownerId"); // Title of the matched projects!

    if (!similarityReport) {
      throw new ApiError("Similarity report not found for this project", 404);
    }

    return res.status(200).json({
      message: "Similarity report fetched successfully",
      similarity: similarityReport
    });

  } catch (error) {
    next(error);
  }
};