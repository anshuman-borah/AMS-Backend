import mongoose from "mongoose";
import User from "../models/user.schema.js";
import Project from "../models/project.schema.js";

// Get all users with pagination and filters
export const getAllUsers = async (req, res, next) => {
  try {
    const { 
      role, 
      page = 1, 
      limit = 10,
      search,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    // Build query
    const query = {};
    
    // Filter by role
    if (role && ["SCIENTIST", "REVIEWER", "ADMIN"].includes(role)) {
      query.role = role;
    }
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    // Get total count for pagination
    const total = await User.countDocuments(query);
    
    // Get users with pagination
    const users = await User.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select("-password"); // Exclude password field

    // Get project count for each scientist/reviewer
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        let projectStats = {};
        
        if (user.role === "SCIENTIST") {
          const [total, pending, approved, rejected] = await Promise.all([
            Project.countDocuments({ ownerId: user._id }),
            Project.countDocuments({ ownerId: user._id, status: "PENDING" }),
            Project.countDocuments({ ownerId: user._id, status: "APPROVED" }),
            Project.countDocuments({ ownerId: user._id, status: "REJECTED" })
          ]);
          
          projectStats = {
            totalProjects: total,
            pendingProjects: pending,
            approvedProjects: approved,
            rejectedProjects: rejected
          };
        }
        
        if (user.role === "REVIEWER") {
          const assignedProjects = await Project.countDocuments({ 
            assignedReviewerId: user._id 
          });
          
          const completedReviews = await Project.countDocuments({ 
            assignedReviewerId: user._id,
            status: { $in: ["APPROVED", "REJECTED"] }
          });
          
          projectStats = {
            assignedProjects,
            completedReviews,
            pendingReviews: assignedProjects - completedReviews
          };
        }
        
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          ...projectStats
        };
      })
    );

    return res.status(200).json({
      users: usersWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      filters: {
        role: role || "all",
        search: search || null,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    next(error);
  }
};

// Get single user by ID
export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
        // Validate ObjectId format first
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid user ID format" });
          }
      

    const user = await User.findById(userId).select("-password");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Get user's projects (if scientist)
    let projects = [];
    if (user.role === "SCIENTIST") {
      projects = await Project.find({ ownerId: user._id })
        .select("title status createdAt similarityScore")
        .sort({ createdAt: -1 });
    }
    
    // Get assigned projects (if reviewer)
    let assignedProjects = [];
    if (user.role === "REVIEWER") {
      assignedProjects = await Project.find({ assignedReviewerId: user._id })
        .select("title status ownerId createdAt")
        .populate("ownerId", "name email");
    }
    
    return res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      projects: user.role === "SCIENTIST" ? projects : undefined,
      assignedProjects: user.role === "REVIEWER" ? assignedProjects : undefined
    });
    
  } catch (error) {
    next(error);
  }
};

// Update user role (admin only)
export const updateUserRole = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!role || !["SCIENTIST", "REVIEWER", "ADMIN"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Prevent changing own role
    if (userId === req.user.userId) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }
    
    user.role = role;
    await user.save();
    
    return res.status(200).json({
      message: "User role updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    next(error);
  }
};

// Delete user (admin only)
export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Prevent deleting own account
    if (userId === req.user.userId) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if user has projects (if scientist)
    if (user.role === "SCIENTIST") {
      const projectCount = await Project.countDocuments({ ownerId: userId });
      if (projectCount > 0) {
        return res.status(400).json({ 
          message: `Cannot delete user. They have ${projectCount} projects. Reassign or delete projects first.` 
        });
      }
    }
    
    // Check if user is assigned as reviewer
    if (user.role === "REVIEWER") {
      const assignedProjects = await Project.countDocuments({ assignedReviewerId: userId });
      if (assignedProjects > 0) {
        return res.status(400).json({ 
          message: `Cannot delete user. They are assigned to ${assignedProjects} projects. Reassign reviewers first.` 
        });
      }
    }
    
    await User.findByIdAndDelete(userId);
    
    return res.status(200).json({
      message: "User deleted successfully"
    });
    
  } catch (error) {
    next(error);
  }
};

// Get user statistics for admin dashboard
export const getUserStatistics = async (req, res, next) => {
  try {
    const [totalScientists, totalReviewers, totalAdmins, recentUsers] = await Promise.all([
      User.countDocuments({ role: "SCIENTIST" }),
      User.countDocuments({ role: "REVIEWER" }),
      User.countDocuments({ role: "ADMIN" }),
      User.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email role createdAt")
    ]);
    
    return res.status(200).json({
      totalUsers: totalScientists + totalReviewers + totalAdmins,
      scientists: totalScientists,
      reviewers: totalReviewers,
      admins: totalAdmins,
      recentUsers: recentUsers.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        joinedAt: user.createdAt
      }))
    });
    
  } catch (error) {
    next(error);
  }
};