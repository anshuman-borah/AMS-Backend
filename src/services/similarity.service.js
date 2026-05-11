import axios from 'axios';
import Similarity from '../models/similarity.schema.js';
import Project from '../models/project.schema.js';

const SIMILARITY_SERVER_URL = process.env.SURL || 'http://localhost:5000';

export const checkSimilarityWithPythonServer = async (projectData) => {
  try {
    const searchPayload = {
      title: projectData.title || "",
      introduction: projectData.introduction || "",
      actionPlan: projectData.actionPlan || "",
      expectedOutcome: projectData.expectedOutcome || "",
      objectives: projectData.objectives || []
    };

    const response = await axios.post(
      `${SIMILARITY_SERVER_URL}/search`,
      searchPayload,
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error calling similarity server:', error.message);
    return null;
  }
};

export const saveSimilarityResults = async (projectId, similarityResults) => {
  try {
    if (!similarityResults || !similarityResults.results) {
      return null;
    }

    const matches = similarityResults.results.map(result => ({
      projectId: result.proposal_id,
      score: result.similarity_score
    }));

    const similarityScore = similarityResults.results[0]?.similarity_score || 0;

    // Save to similarity collection
    const similarityDoc = await Similarity.findOneAndUpdate(
      { projectId },
      {
        projectId,
        similarityScore,
        matches
      },
      { upsert: true, new: true }
    );

    // Update project's similarityScore field
    await Project.findByIdAndUpdate(projectId, {
      similarityScore: similarityScore
    });

    return similarityDoc;
  } catch (error) {
    console.error('Error saving similarity results:', error.message);
    return null;
  }
};