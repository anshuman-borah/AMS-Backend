import Project from "../models/project.schema.js";

export const createProject = async (req, res, next) => {
  try {

    const projectData = {
      ...req.body,
      ownerId: req.user.userId, 
      status: "DRAFT"           
    };

    const savedProject = await Project.create(projectData);

    return res.status(201).json({
      message: "Project created successfully",
      project: {
        id: savedProject._id,
        title: savedProject.title,
        status: savedProject.status,
        ownerId: savedProject.ownerId,
        createdAt: savedProject.createdAt
      }
    });

  } catch (error) {
    next(error); 
  }
};