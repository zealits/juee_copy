import * as faceapi from "face-api.js";

// Path to models
const MODEL_URL = "/models";

// Load all required face-api.js models
export const loadModels = async () => {
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);
    console.log("Face API models loaded successfully");
    return true;
  } catch (error) {
    console.error("Error loading face-api models:", error);
    return false;
  }
};

// Detect faces and expressions in a video element
export const detectExpressions = async (videoElement) => {
  if (!videoElement || videoElement.paused || videoElement.ended) {
    return null;
  }

  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

    const result = await faceapi.detectSingleFace(videoElement, options).withFaceExpressions();

    return result;
  } catch (error) {
    console.error("Error detecting expressions:", error);
    return null;
  }
};

// Get the dominant expression from the expressions object
export const getDominantExpression = (expressions) => {
  if (!expressions) return null;

  // Find the expression with the highest score
  return Object.entries(expressions).reduce(
    (prev, current) => (current[1] > prev[1] ? current : prev),
    ["neutral", 0]
  )[0];
};

// Get color for expression
export const getExpressionColor = (expression) => {
  const colors = {
    happy: "bg-yellow-500",
    sad: "bg-blue-500",
    angry: "bg-red-500",
    fearful: "bg-purple-500",
    disgusted: "bg-green-500",
    surprised: "bg-pink-500",
    neutral: "bg-gray-500",
  };

  return colors[expression] || colors.neutral;
};

// Get emoji for expression
export const getExpressionEmoji = (expression) => {
  const emojis = {
    happy: "😊",
    sad: "😢",
    angry: "😠",
    fearful: "😨",
    disgusted: "🤢",
    surprised: "😲",
    neutral: "😐",
  };

  return emojis[expression] || emojis.neutral;
};
