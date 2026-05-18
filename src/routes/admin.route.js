import {
    Router
} from "express";

import authMiddleware from "../middlewares/auth.middleware.js";

import roleMiddleware from "../middlewares/role.middleware.js";

import {

    getAllUsers,

    getUserById,

    updateUserRole,

    deleteUser,

    getUserStatistics

}

from "../controllers/userManagement.controller.js";


import {

    getUnassignedProposals,

    getReviewersWithWorkload

}

from "../controllers/reviewerProposalManagement.controller.js";


import {

    getAllProjects,

    getProjectById,

    deleteProject,

    getProjectStatistics

}

from "../controllers/proposalManagement.controller.js";


import {

    unassignReviewer

}

from "../controllers/assignReviewer.controller.js";


const router =
    Router();



router.use(
    authMiddleware
);

router.use(
    roleMiddleware(
        ["ADMIN"]
    )
);


// =========================
// USER MANAGEMENT
// =========================

router.get(

    "/users/statistics",

    getUserStatistics

);


router.get(

    "/users",

    getAllUsers

);


router.get(

    "/id/:userId",

    getUserById

);


router.patch(

    "/id/:userId/role",

    updateUserRole

);


router.delete(

    "/id/:userId",

    deleteUser

);


// =========================
// REVIEWER MANAGEMENT
// =========================

router.get(

    "/unassigned-proposals",

    getUnassignedProposals

);


router.get(

    "/reviewers",

    getReviewersWithWorkload

);


/*
NEW ROUTE
UNASSIGN REVIEWER
*/

router.put(

    "/projects/unassign-reviewer/:projectId",

    unassignReviewer

);


// =========================
// PROJECT MANAGEMENT
// =========================

router.get(

    "/projects/statistics",

    getProjectStatistics

);


router.get(

    "/projects",

    getAllProjects

);


router.get(

    "/projects/id/:projectId",

    getProjectById

);


router.delete(

    "/projects/id/:projectId",

    deleteProject

);


export default router;