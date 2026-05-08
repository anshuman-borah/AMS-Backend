import Similarity from "../models/similarity.schema.js";
import Project from "../models/project.schema.js";
import ApiError from "../utils/ApiError.js";



export const getSimilarityStatus = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.userId;
    
    // Check if user owns this project
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    
    if (project.ownerId.toString() !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Find similarity results
    const similarity = await Similarity.findOne({ projectId })
      .populate('matches.projectId', 'title');
    
    if (!similarity) {
      return res.status(200).json({
        status: "PENDING",
        message: "Similarity check is still in progress or not started yet."
      });
    }
    
    // Return results
    return res.status(200).json({
      status: "COMPLETED",
      similarityScore: similarity.similarityScore,
      riskLevel: getRiskLevel(similarity.similarityScore),
      matches: similarity.matches.slice(0, 3).map(match => ({
        title: match.projectId.title,
        score: match.score
      }))
    });
    
  } catch (error) {
    next(error);
  }
};

const getRiskLevel = (score) => {
  if (score >= 85) return "HIGH";
  if (score >= 70) return "MEDIUM";
  return "LOW";
};