import axios from "axios";

const apiBaseUrl =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: apiBaseUrl
});

api.interceptors.request.use((config) => {
  if (import.meta.env.DEV) {
    const requestUrl = `${config.baseURL || ""}${config.url || ""}`;
    console.log(`[GeoAI API] ${String(config.method || "get").toUpperCase()} ${requestUrl}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.detail ||
      error?.response?.data?.message ||
      error?.message ||
      "Something went wrong while talking to the GeoAI API.";
    return Promise.reject(new Error(message));
  }
);

export async function predictCountry(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/api/predict", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function getQuizQuestion(weakCountries = [], category = "general", questionType = "multiple_choice", region = "world", exclude = []) {
  const params = {};
  if (weakCountries.length > 0) {
    params.weak = weakCountries.join(",");
  }
  if (category) params.category = category;
  if (questionType) params.questionType = questionType;
  if (region) params.region = region;
  if (exclude.length > 0) params.exclude = exclude.join(",");
  const response = await api.get("/api/quiz/question", { params });
  return response.data;
}

export async function getEvalResults() {
  const response = await api.get("/api/eval/results");
  return response.data;
}

export async function getCountries() {
  const response = await api.get("/api/countries");
  return response.data;
}

export async function getQuizCountries(continent = null) {
  const params = {};
  if (continent) params.continent = continent;
  const response = await api.get("/api/quiz/countries", { params });
  return response.data;
}

export async function getGeoFeatures(type = "oceans") {
  const response = await api.get("/api/quiz/geo-features", { params: { type } });
  return response.data;
}



// ═══════════════════════════════════════════════════════
// Feature 1: Conversational Hint System
// ═══════════════════════════════════════════════════════

export async function chatAboutImage(imageBase64, messages, predictions = []) {
  const response = await api.post("/api/analyzer/chat", {
    imageBase64,
    messages,
    predictions,
  });
  return response.data.reply;
}

// ═══════════════════════════════════════════════════════
// Feature 2: Adaptive Quiz Explanations
// ═══════════════════════════════════════════════════════

export async function getQuizExplanation(question, userAnswer, correctAnswer, category = "general") {
  const response = await api.post("/api/quiz/explain", {
    question,
    userAnswer,
    correctAnswer,
    category,
  });
  return response.data.explanation;
}



export default api;
