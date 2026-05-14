import mongoose from "mongoose";
import Project from "../models/project.schema.js";
import Review from "../models/review.schema.js";
import Similarity from "../models/similarity.schema.js";
import ApiError from "../utils/ApiError.js";

// Allowed values for validation
const ALLOWED_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "REVISION_REQUIRED",
];

const ALLOWED_DISCIPLINES = [
  "COMPUTER_SCIENCE",
  "AGRICULTURE",
  "BIOTECHNOLOGY",
  "MECHANICAL",
  "CIVIL",
  "Soil Science",
  "Crop Science",
  "Forestry",
  "Food Technology",
];

const ALLOWED_PROPOSAL_TYPES = ["NEW", "SANCTIONED"];

// Helper function to validate ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper function to get pagination values
const getPagination = (page, limit) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, skip };
};

// Get all projects with filters, search, and pagination
export const getAllProjects = async (req, res, next) => {
  try {
    const {
      status,
      discipline,
      proposalType,
      page = 1,
      limit = 10,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      ownerId,
      reviewerId,
      fromDate,
      toDate,
      minSimilarity,
      maxSimilarity,
    } = req.query;

    const query = {};

    // Status filter
    if (status && ALLOWED_STATUSES.includes(status)) {
      query.status = status;
    }

    // Discipline filter
    if (discipline && ALLOWED_DISCIPLINES.includes(discipline)) {
      query.discipline = discipline;
    }

    // Proposal type filter
    if (proposalType && ALLOWED_PROPOSAL_TYPES.includes(proposalType)) {
      query.proposalType = proposalType;
    }

    // Owner filter
    if (ownerId && isValidObjectId(ownerId)) {
      query.ownerId = ownerId;
    }

    // Reviewer filter
    if (reviewerId && isValidObjectId(reviewerId)) {
      query.assignedReviewerId = reviewerId;
    }

    // Similarity score range
    if (minSimilarity || maxSimilarity) {
      query.similarityScore = {};
      if (minSimilarity) query.similarityScore.$gte = parseFloat(minSimilarity);
      if (maxSimilarity) query.similarityScore.$lte = parseFloat(maxSimilarity);
    }

    // Date range filter
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { uniqueCode: { $regex: search, $options: "i" } },
        { stationOrCollege: { $regex: search, $options: "i" } },
        { discipline: { $regex: search, $options: "i" } },
      ];
    }

    const { pageNum, limitNum, skip } = getPagination(page, limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const [total, projects] = await Promise.all([
      Project.countDocuments(query),
      Project.find(query)
        .populate("ownerId", "name email institution department")
        .populate("assignedReviewerId", "name email institution expertise")
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(), // Use lean() for better performance
    ]);

    // Get review counts for each project
    const projectIds = projects.map(p => p._id);
    const reviewCounts = await Review.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $group: { _id: "$projectId", count: { $sum: 1 } } }
    ]);
    
    const reviewCountMap = new Map(reviewCounts.map(rc => [rc._id.toString(), rc.count]));

    const projectsWithDetails = projects.map(project => ({
      id: project._id,
      uniqueCode: project.uniqueCode,
      title: project.title,
      discipline: project.discipline,
      stationOrCollege: project.stationOrCollege,
      year: project.year,
      status: project.status,
      proposalType: project.proposalType,
      version: project.version,
      similarityScore: project.similarityScore,
      reviewCount: reviewCountMap.get(project._id.toString()) || 0,
      submittedBy: {
        id: project.ownerId?._id,
        name: project.ownerId?.name,
        email: project.ownerId?.email,
        institution: project.ownerId?.institution,
        department: project.ownerId?.department,
      },
      assignedReviewer: project.assignedReviewerId ? {
        id: project.assignedReviewerId._id,
        name: project.assignedReviewerId.name,
        email: project.assignedReviewerId.email,
        expertise: project.assignedReviewerId.expertise,
      } : null,
      submittedAt: project.submittedAt,
      assignedAt: project.assignedAt,
      approvedAt: project.approvedAt,
      rejectedAt: project.rejectedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: projectsWithDetails,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
      filters: {
        status: status || "all",
        discipline: discipline || "all",
        proposalType: proposalType || "all",
        search: search || null,
        sortBy,
        sortOrder,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get single project by ID with full details
export const getProjectById = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      throw new ApiError("Invalid project ID format", 400);
    }

    const project = await Project.findById(projectId)
      .populate("ownerId", "name email institution department")
      .populate("assignedReviewerId", "name email institution department expertise")
      .lean();

    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Get all reviews for this project
    const reviews = await Review.find({ projectId })
      .populate("reviewerId", "name email institution")
      .sort({ reviewedAt: -1 })
      .lean();

    // Get similarity matches
    const similarity = await Similarity.findOne({ projectId })
      .populate("matches.projectId", "title uniqueCode status")
      .lean();

    // Get activity timeline
    const activity = [];
    
    if (project.createdAt) {
      activity.push({ type: "CREATED", date: project.createdAt, message: "Project created" });
    }
    if (project.submittedAt) {
      activity.push({ type: "SUBMITTED", date: project.submittedAt, message: "Project submitted for review" });
    }
    if (project.assignedAt) {
      activity.push({ type: "ASSIGNED", date: project.assignedAt, message: "Reviewer assigned" });
    }
    if (project.underReviewAt) {
      activity.push({ type: "UNDER_REVIEW", date: project.underReviewAt, message: "Project under review" });
    }
    if (project.revisionRequestedAt) {
      activity.push({ type: "REVISION_REQUESTED", date: project.revisionRequestedAt, message: "Revision requested" });
    }
    if (project.approvedAt) {
      activity.push({ type: "APPROVED", date: project.approvedAt, message: "Project approved" });
    }
    if (project.rejectedAt) {
      activity.push({ type: "REJECTED", date: project.rejectedAt, message: "Project rejected" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...project,
        reviewCount: reviews.length,
        reviews: reviews.map(review => ({
          id: review._id,
          decision: review.decision,
          comment: review.comment,
          score: review.score,
          reviewedBy: {
            id: review.reviewerId?._id,
            name: review.reviewerId?.name,
            email: review.reviewerId?.email,
            institution: review.reviewerId?.institution,
          },
          reviewedAt: review.reviewedAt,
        })),
        similarityMatches: similarity?.matches || [],
        activity: activity.sort((a, b) => new Date(b.date) - new Date(a.date)),
        trackingDetails: {
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          submittedAt: project.submittedAt || null,
          assignedAt: project.assignedAt || null,
          underReviewAt: project.underReviewAt || null,
          revisionRequestedAt: project.revisionRequestedAt || null,
          approvedAt: project.approvedAt || null,
          rejectedAt: project.rejectedAt || null,
          currentStatus: project.status,
          reviewerAssigned: !!project.assignedReviewerId,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update project status (admin only)
export const updateProjectStatus = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { status, reason } = req.body;

    if (!isValidObjectId(projectId)) {
      throw new ApiError("Invalid project ID format", 400);
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      throw new ApiError("Invalid status value", 400);
    }

    const project = await Project.findById(projectId);
    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    const oldStatus = project.status;
    const updateData = { status };

    // Set appropriate timestamps based on status
    switch (status) {
      case "SUBMITTED":
        updateData.submittedAt = new Date();
        break;
      case "UNDER_REVIEW":
        updateData.underReviewAt = new Date();
        break;
      case "REVISION_REQUIRED":
        updateData.revisionRequestedAt = new Date();
        if (reason) updateData.finalComment = reason;
        break;
      case "APPROVED":
        updateData.approvedAt = new Date();
        if (reason) updateData.finalComment = reason;
        break;
      case "REJECTED":
        updateData.rejectedAt = new Date();
        if (reason) updateData.finalComment = reason;
        break;
    }

    const updatedProject = await Project.findByIdAndUpdate(projectId, updateData, { new: true })
      .populate("ownerId", "name email")
      .populate("assignedReviewerId", "name email");

    // Create system review entry if status changed by admin
    if (["APPROVED", "REJECTED", "REVISION_REQUIRED"].includes(status) && reason) {
      await Review.create({
        projectId,
        reviewerId: req.user.userId,
        decision: status,
        comment: reason,
        reviewedAt: new Date(),
      });
    }

    return res.status(200).json({
      success: true,
      message: `Project status updated from ${oldStatus} to ${status}`,
      data: {
        id: updatedProject._id,
        uniqueCode: updatedProject.uniqueCode,
        title: updatedProject.title,
        oldStatus,
        newStatus: updatedProject.status,
        updatedAt: updatedProject.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete project and all related data
export const deleteProject = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId } = req.params;

    if (!isValidObjectId(projectId)) {
      throw new ApiError("Invalid project ID format", 400);
    }

    const project = await Project.findById(projectId).session(session);
    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Delete all related data
    await Review.deleteMany({ projectId }).session(session);
    await Similarity.deleteMany({ projectId }).session(session);
    await Project.findByIdAndDelete(projectId).session(session);

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Project and all related data deleted successfully",
      data: {
        id: project._id,
        uniqueCode: project.uniqueCode,
        title: project.title,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Get project statistics for admin dashboard
export const getProjectStatistics = async (req, res, next) => {
  try {
    const [
      totalProjects,
      draftProjects,
      submittedProjects,
      underReviewProjects,
      approvedProjects,
      rejectedProjects,
      revisionRequiredProjects,
      unassignedProjects,
      averageSimilarityScore,
      recentProjects,
    ] = await Promise.all([
      Project.countDocuments(),
      Project.countDocuments({ status: "DRAFT" }),
      Project.countDocuments({ status: "SUBMITTED" }),
      Project.countDocuments({ status: "UNDER_REVIEW" }),
      Project.countDocuments({ status: "APPROVED" }),
      Project.countDocuments({ status: "REJECTED" }),
      Project.countDocuments({ status: "REVISION_REQUIRED" }),
      Project.countDocuments({ status: "SUBMITTED", assignedReviewerId: null }),
      Project.aggregate([
        { $group: { _id: null, avg: { $avg: "$similarityScore" } } }
      ]),
      Project.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("ownerId", "name email institution")
        .select("uniqueCode title status similarityScore createdAt ownerId")
        .lean(),
    ]);

    // Get discipline distribution
    const disciplineDistribution = await Project.aggregate([
      { $group: { _id: "$discipline", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Get monthly submission trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrends = await Project.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Calculate approval rate
    const totalDecisions = approvedProjects + rejectedProjects;
    const approvalRate = totalDecisions > 0 
      ? Math.round((approvedProjects / totalDecisions) * 100) 
      : 0;

    return res.status(200).json({
      success: true,
      statistics: {
        totalProjects,
        draftProjects,
        submittedProjects,
        underReviewProjects,
        approvedProjects,
        rejectedProjects,
        revisionRequiredProjects,
        unassignedProjects,
        approvalRate,
        averageSimilarityScore: averageSimilarityScore[0]?.avg || 0,
      },
      charts: {
        disciplineDistribution: disciplineDistribution.map(item => ({
          discipline: item._id || "Not specified",
          count: item.count,
        })),
        monthlyTrends: monthlyTrends.map(item => ({
          month: `${item._id.year}-${item._id.month.toString().padStart(2, "0")}`,
          submissions: item.count,
        })),
      },
      recentProjects: recentProjects.map(project => ({
        id: project._id,
        uniqueCode: project.uniqueCode,
        title: project.title,
        status: project.status,
        similarityScore: project.similarityScore,
        createdAt: project.createdAt,
        scientist: {
          id: project.ownerId?._id,
          name: project.ownerId?.name,
          email: project.ownerId?.email,
          institution: project.ownerId?.institution,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
};

// Bulk delete projects (admin only)
export const bulkDeleteProjects = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectIds } = req.body;

    if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
      throw new ApiError("Project IDs array is required", 400);
    }

    // Validate all IDs
    for (const id of projectIds) {
      if (!isValidObjectId(id)) {
        throw new ApiError(`Invalid project ID format: ${id}`, 400);
      }
    }

    // Delete all related data for each project
    await Review.deleteMany({ projectId: { $in: projectIds } }).session(session);
    await Similarity.deleteMany({ projectId: { $in: projectIds } }).session(session);
    const result = await Project.deleteMany({ _id: { $in: projectIds } }).session(session);

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} projects deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Export project data (for reports)
export const exportProjects = async (req, res, next) => {
  try {
    const { status, discipline, fromDate, toDate } = req.query;
    const query = {};

    if (status && ALLOWED_STATUSES.includes(status)) query.status = status;
    if (discipline && ALLOWED_DISCIPLINES.includes(discipline)) query.discipline = discipline;
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    const projects = await Project.find(query)
      .populate("ownerId", "name email institution")
      .populate("assignedReviewerId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const exportData = projects.map(project => ({
      UniqueCode: project.uniqueCode,
      Title: project.title,
      Discipline: project.discipline,
      StationCollege: project.stationOrCollege,
      Year: project.year,
      Status: project.status,
      SimilarityScore: project.similarityScore,
      ScientistName: project.ownerId?.name,
      ScientistEmail: project.ownerId?.email,
      ScientistInstitution: project.ownerId?.institution,
      ReviewerName: project.assignedReviewerId?.name,
      ReviewerEmail: project.assignedReviewerId?.email,
      SubmittedAt: project.submittedAt,
      ApprovedAt: project.approvedAt,
      RejectedAt: project.rejectedAt,
      TotalBudget: project.budget?.grandTotal,
    }));

    return res.status(200).json({
      success: true,
      count: exportData.length,
      data: exportData,
    });
  } catch (error) {
    next(error);
  }
};