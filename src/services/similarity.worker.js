import { checkSimilarityWithPythonServer, saveSimilarityResults } from "./similarity.service.js";

export const runSimilarityCheckInBackground = async (projectId, projectData) => {
  try {
    console.log(`Starting similarity check for project: ${projectId}`);
    
    // Call Python similarity server
    const similarityResults = await checkSimilarityWithPythonServer(projectData);
    
    if (similarityResults && similarityResults.results) {
      // Save results to database
      await saveSimilarityResults(projectId, similarityResults);
      console.log(`Similarity check completed for project: ${projectId}`);
      return similarityResults;
    } else {
      console.log(`No similarity results for project: ${projectId}`);
      return null;
    }
    
  } catch (error) {
    console.error(`Background similarity check failed for project ${projectId}:`, error.message);
    return null;
  }
};