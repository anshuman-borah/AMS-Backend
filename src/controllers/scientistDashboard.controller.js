import Project from "../models/project.schema.js";
import Review from "../models/review.schema.js";

 const getScientistDashboard = async (req, res, next) => {
  try {
    const scientistId = req.user.userId;

    // Get all proposals count by status
    const [totalProposals, pendingProposals, approvedProposals, rejectedProposals] = await Promise.all([
      Project.countDocuments({ ownerId: scientistId }),
      Project.countDocuments({ ownerId: scientistId, status: "PENDING" }),
      Project.countDocuments({ ownerId: scientistId, status: "APPROVED" }),
      Project.countDocuments({ ownerId: scientistId, status: "REJECTED" })
    ]);

    // Get 5 most recent proposals
    const recentProposals = await Project.find({ ownerId: scientistId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title status createdAt similarityScore");

    // Get recent reviews/comments on scientist's proposals
    const recentReviews = await Review.find()
      .populate({
        path: "projectId",
        match: { ownerId: scientistId },
        select: "title"
      })
      .populate("reviewerId", "name email")
      .sort({ createdAt: -1 })
      .limit(5);

    // Filter out null projects (where project doesn't belong to this scientist)
    const filteredReviews = recentReviews.filter(review => review.projectId !== null);

    return res.status(200).json({
      statistics: {
        total: totalProposals,
        pending: pendingProposals,
        approved: approvedProposals,
        rejected: rejectedProposals
      },
      recentProposals: recentProposals.map(proposal => ({
        id: proposal._id,
        title: proposal.title,
        status: proposal.status,
        similarityScore: proposal.similarityScore || 0,
        submittedDate: proposal.createdAt
      })),
      recentReviews: filteredReviews.map(review => ({
        proposalTitle: review.projectId.title,
        decision: review.decision,
        comment: review.comment,
        reviewedBy: review.reviewerId.name,
        reviewedAt: review.createdAt
      }))
    });

  } catch (error) {
    next(error);
  }
};


export default getScientistDashboard;