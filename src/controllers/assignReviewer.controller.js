import ApiError from "../utils/ApiError.js";
import Project from "../models/project.schema.js";
import User from "../models/user.schema.js";


// =====================================
// ASSIGN REVIEWER
// =====================================

const assignReviewer = async (
    req,
    res,
    next
) => {

    try {

        const {
            projectId
        } =
        req.params;

        const {
            reviewerId
        } =
        req.body;


        const project =
            await Project.findById(
                projectId
            );

        if (!project) {

            throw new ApiError(
                "Project not found",
                404
            );

        }


        if (

            project.status === "APPROVED"

            ||

            project.status === "REJECTED"

        ) {

            throw new ApiError(

                `Cannot assign reviewer to a ${project.status.toLowerCase()} project`,

                400

            );

        }


        if (
            project.status === "UNDER_REVIEW"
        ) {

            throw new ApiError(

                "Project already has a reviewer assigned",

                400

            );

        }


        const reviewer =
            await User.findById(
                reviewerId
            );

        if (!reviewer) {

            throw new ApiError(
                "Reviewer not found",
                404
            );

        }


        if (
            reviewer.role !== "REVIEWER"
        ) {

            throw new ApiError(

                "User must have REVIEWER role",

                400

            );

        }


        project.assignedReviewerId =
            reviewerId;

        project.status =
            "UNDER_REVIEW";

        project.assignedAt =
            new Date();

        project.underReviewAt =
            new Date();


        await project.save();


        await project.populate(
            "assignedReviewerId",
            "name email"
        );


        return res.status(200)
            .json({

                message:

                    "Reviewer assigned successfully. Project is now under review.",

                project: {

                    id: project._id,

                    uniqueCode: project.uniqueCode,

                    title: project.title,

                    status: project.status,

                    assignedReviewer: project.assignedReviewerId,

                    assignedAt: project.assignedAt,

                    underReviewAt: project.underReviewAt

                }

            });

    } catch (error) {

        next(error);

    }

};


// =====================================
// UNASSIGN REVIEWER
// =====================================

export const unassignReviewer =
    async (
        req,
        res,
        next
    ) => {

        try {

            const {
                projectId
            } =
            req.params;


            const project =
                await Project.findById(
                    projectId
                );

            if (!project) {

                throw new ApiError(
                    "Project not found",
                    404
                );

            }


            /*
            Only UNDER_REVIEW projects
            can be unassigned
            */

            if (

                project.status !== "UNDER_REVIEW"

                ||

                !project.assignedReviewerId

            ) {

                throw new ApiError(

                    "No reviewer assigned to this project",

                    400

                );

            }


            const oldReviewer =

                project.assignedReviewerId;


            /*
            Remove reviewer
            */

            project.assignedReviewerId =
                null;

            project.assignedAt =
                null;

            project.underReviewAt =
                null;


            /*
            Move back for reassignment
            */

            project.status =
                "SUBMITTED";


            await project.save();


            return res.status(200)
                .json({

                    message:

                        "Reviewer unassigned successfully. Project moved back to SUBMITTED.",

                    project: {

                        id: project._id,

                        uniqueCode: project.uniqueCode,

                        title: project.title,

                        status: project.status,

                        previousReviewer: oldReviewer

                    }

                });

        } catch (error) {

            next(error);

        }

    };


export default assignReviewer;