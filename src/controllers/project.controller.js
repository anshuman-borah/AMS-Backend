import Project from "../models/project.schema.js";
import ApiError from "../utils/ApiError.js";
import { runSimilarityCheckInBackground } from "../services/similarity.worker.js";
import mongoose from "mongoose";

// Helper to abbreviate strings (e.g., "COMPUTER_SCIENCE" -> "CS", "Delhi" -> "DEL")
const getAbbreviation = (str) => {
  if (!str) return "XXX";
  const words = str.split(/[\s_]+/);
  if (words.length > 1) {
    return words.map(w => w[0]).join("").toUpperCase();
  }
  return str.substring(0, 3).toUpperCase();
};

export const createProject = async (req, res, next) => {
  try {
    // --- NEW LOGIC FOR UNIQUE ID GENERATION ---
    const { stationOrCollege, year, discipline } = req.body;
    
    let generatedUniqueCode = null;
    
    if (stationOrCollege && year && discipline) {
      const stationCode = getAbbreviation(stationOrCollege);
      const disciplineCode = getAbbreviation(discipline);
      
      // Count existing projects for this exact combination to get Serial No
      const existingCount = await Project.countDocuments({
        stationOrCollege,
        year,
        discipline
      });
      
      const serialNo = (existingCount + 1).toString().padStart(3, '0');
      generatedUniqueCode = `${stationCode}/${year}/${disciplineCode}/${serialNo}`;
    }
    // -------------------------------------------

    const projectData = {
      ...req.body,
      ownerId: req.user.userId, 
      status: "SUBMITTED",
      uniqueCode: req.body.uniqueCode || generatedUniqueCode || `PROJ-${Date.now()}`,
      submittedAt: new Date() // Set submitted timestamp when project is created
    };

    // Save project to database
    const savedProject = await Project.create(projectData);

    // Run similarity check in background without awaiting
    runSimilarityCheckInBackground(savedProject._id, projectData);

    return res.status(201).json({
      message: "Project created successfully",
      project: {
        id: savedProject._id,
        uniqueCode: savedProject.uniqueCode,
        title: savedProject.title,
        status: savedProject.status,
        ownerId: savedProject.ownerId,
        createdAt: savedProject.createdAt,
        submittedAt: savedProject.submittedAt
      },
      similarityStatus: "processing"
    });

  } catch (error) {
    next(error); 
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Only owner can edit
    if (project.ownerId.toString() !== req.user.userId) {
      throw new ApiError("Unauthorized access", 403);
    }

    // Allow editing for DRAFT or REVISION_REQUIRED status
    if (project.status !== "DRAFT" && project.status !== "REVISION_REQUIRED") {
      throw new ApiError(
        `Only draft or revision required projects can be edited. Current status: ${project.status}`,
        400
      );
    }

    // SAFE deep merge
    project.set(req.body);

    // Recalculate budget grand total AFTER merge
    if (project.budget) {
      project.budget.grandTotal =
        (project.budget.nonRecurring || 0) +
        (project.budget.recurringContingency || 0) +
        (project.budget.travellingAllowances || 0) +
        (project.budget.operationalExpenses || 0) +
        (project.budget.manpower || 0);
    }

    // If project was in REVISION_REQUIRED status, increment version
    let versionUpdated = false;
    if (project.status === "REVISION_REQUIRED") {
      project.version = (project.version || 1) + 1;
      versionUpdated = true;
    }

    const updatedProject = await project.save();

    return res.status(200).json({
      message: versionUpdated 
        ? "Project updated successfully. Version incremented. Please resubmit for review."
        : "Project updated successfully",
      project: {
        projectId: updatedProject._id,
        uniqueCode: updatedProject.uniqueCode,
        title: updatedProject.title,
        status: updatedProject.status,
        version: updatedProject.version,
        updatedAt: updatedProject.updatedAt,
      }
    });

  } catch (error) {
    next(error);
  }
};

export const resubmitProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { keepSameReviewer = true } = req.body; // Frontend can send this
    
    const project = await Project.findById(projectId);

    if (!project) {
      throw new ApiError("Project not found", 404);
    }

    // Only owner can resubmit
    if (project.ownerId.toString() !== req.user.userId) {
      throw new ApiError("Unauthorized access", 403);
    }

    // Only REVISION_REQUIRED projects can be resubmitted
    if (project.status !== "REVISION_REQUIRED") {
      throw new ApiError(
        `Only revision required projects can be resubmitted. Current status: ${project.status}`,
        400
      );
    }

    // Validate completeness
    if (!project.title || !project.introduction || !project.actionPlan || !project.expectedOutcome) {
      throw new ApiError("Project is incomplete. Please fill all required fields.", 400);
    }
    if (!project.objectives || project.objectives.length === 0) {
      throw new ApiError("At least one objective is required.", 400);
    }

    // Increment version
    project.version = (project.version || 1) + 1;
    project.submittedAt = new Date();

    if (keepSameReviewer && project.assignedReviewerId) {
      // Directly go to UNDER_REVIEW - same reviewer
      project.status = "UNDER_REVIEW";
      project.underReviewAt = new Date();
    } else {
      // Go to SUBMITTED - waiting for new reviewer assignment
      project.status = "SUBMITTED";
      project.assignedReviewerId = null; // Clear old reviewer
      project.assignedAt = null;
      project.underReviewAt = null;
    }
    
    await project.save();

    // Run similarity check
    runSimilarityCheckInBackground(project._id, project);

    return res.status(200).json({
      message: keepSameReviewer && project.assignedReviewerId
        ? "Project resubmitted. The same reviewer will be notified for re-review."
        : "Project resubmitted. Awaiting admin to assign a new reviewer.",
      project: {
        id: project._id,
        uniqueCode: project.uniqueCode,
        title: project.title,
        status: project.status,
        version: project.version,
        assignedReviewer: project.assignedReviewerId,
        submittedAt: project.submittedAt
      }
    });

  } catch (error) {
    next(error);
  }
};


// // Get all projects for scientist (with new schema)
// export const getScientistProposals = async (req, res, next) => {
//   try {
//     const scientistId = req.user.userId;
//     const { status, page = 1, limit = 10 } = req.query;
    
//     const query = { ownerId: scientistId };
    
//     if (status && ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "REVISION_REQUIRED"].includes(status)) {
//       query.status = status;
//     }
    
//     const skip = (parseInt(page) - 1) * parseInt(limit);
//     const total = await Project.countDocuments(query);
    
//     const projects = await Project.find(query)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(parseInt(limit))
//       .select("uniqueCode title discipline status similarityScore createdAt version");
    
//     return res.status(200).json({
//       proposals: projects.map(project => ({
//         id: project._id,
//         uniqueCode: project.uniqueCode,
//         title: project.title,
//         discipline: project.discipline,
//         status: project.status,
//         similarityScore: project.similarityScore || 0,
//         version: project.version,
//         createdAt: project.createdAt
//       })),
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / parseInt(limit)),
//         totalItems: total,
//         itemsPerPage: parseInt(limit)
//       }
//     });
    
//   } catch (error) {
//     next(error);
//   }
// };

// // Get single project by ID
// export const getProjectById = async (req, res, next) => {
//   try {
//     const { projectId } = req.params;
//     const userId = req.user.userId;
//     const userRole = req.user.role;

//     const project = await Project.findById(projectId)
//       .populate("ownerId", "name email institution department")
//       .populate("assignedReviewerId", "name email institution");

//     if (!project) {
//       throw new ApiError("Project not found", 404);
//     }

//     // Check permission
//     const isOwner = project.ownerId._id.toString() === userId;
//     const isAdmin = userRole === "ADMIN";
//     const isReviewer = project.assignedReviewerId?._id.toString() === userId;

//     if (!isOwner && !isAdmin && !isReviewer) {
//       throw new ApiError("Access denied", 403);
//     }

//     // Get reviews if any
//     const reviews = await Review.find({ projectId: project._id })
//       .populate("reviewerId", "name email")
//       .sort({ createdAt: -1 });

//     return res.status(200).json({
//       id: project._id,
//       uniqueCode: project.uniqueCode,
//       version: project.version,
//       proposalType: project.proposalType,
//       stationOrCollege: project.stationOrCollege,
//       title: project.title,
//       discipline: project.discipline,
//       year: project.year,
//       status: project.status,
//       introduction: project.introduction,
//       actionPlan: project.actionPlan,
//       expectedOutcome: project.expectedOutcome,
//       objectives: project.objectives,
//       budget: project.budget,
//       scientistInvolve: project.scientistInvolve,
//       similarityScore: project.similarityScore,
//       finalComment: project.finalComment,
//       createdAt: project.createdAt,
//       updatedAt: project.updatedAt,
//       approvedAt: project.approvedAt,
//       rejectedAt: project.rejectedAt,
//       submittedBy: {
//         id: project.ownerId._id,
//         name: project.ownerId.name,
//         email: project.ownerId.email,
//         institution: project.ownerId.institution,
//         department: project.ownerId.department
//       },
//       assignedReviewer: project.assignedReviewerId ? {
//         id: project.assignedReviewerId._id,
//         name: project.assignedReviewerId.name,
//         email: project.assignedReviewerId.email
//       } : null,
//       reviews: reviews.map(review => ({
//         id: review._id,
//         decision: review.decision,
//         comment: review.comment,
//         score: review.score,
//         reviewedBy: review.reviewerId.name,
//         reviewedAt: review.reviewedAt
//       }))
//     });

//   } catch (error) {
//     next(error);
//   }
// };