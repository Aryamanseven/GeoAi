# GeoAI: Intelligent Geography Explorer

GeoAI is a highly interactive, full-stack machine learning application that acts as an AI geography detective (inspired by GeoGuessr). It combines deep learning computer vision, large vision-language models, and an interactive 3D WebGL globe to analyze and explain the geography of any uploaded image.

## Features

- **Multi-Modal Image Analysis**: Upload a street view, skyline, or landscape image to get the top 3 country predictions with confidence bars.
- **Explainable AI Reasoning**: Leverages Llama-4-Scout-17b to analyze visual clues (architecture, language, vegetation, infrastructure) and explain *why* the model made its prediction.
- **Interactive Geography Detective Chat**: An expandable chat interface allowing users to interrogate the AI about specific elements in the image.
- **Dynamic 3D Globe**: A custom WebGL/Three.js globe that responds to predictions, animating to the top predicted country and displaying interactive telemetry markers.
- **Adaptive Geography Quiz**: An AI-generated, dynamic quiz mode that biases future questions based on user performance, powered by Llama-3.3-70b.

## Technical Architecture

This project was built from scratch and demonstrates advanced techniques in model fine-tuning and full-stack integration:

### 1. Advanced Computer Vision (PyTorch & LoRA)
- The core classification engine uses **OpenAI's CLIP (ViT-L-14)** foundational vision model.
- The model is parameter-efficiently fine-tuned using **LoRA (Low-Rank Adaptation)** on the `Country211` dataset.
- The training pipeline (`train.py`) uses `peft` and custom PyTorch dataloaders for efficient optimization.

### 2. Generative Vision-Language Models (MLLMs)
- Integrated the **Groq API** to serve Meta's `Llama-4-Scout-17b` vision model for high-speed, explainable multi-modal reasoning.
- Used `Llama-3.3-70b-versatile` for generating adaptive quiz questions and micro-lessons for wrong answers.

### 3. Full-Stack Engineering (FastAPI + React)
- **Backend**: A robust `FastAPI` service running on Uvicorn, wrapping the PyTorch inference pipeline and managing external LLM API calls.
- **Frontend**: A highly polished, responsive `React` and `Tailwind CSS` interface.
- **WebGL**: A custom `Three.js` implementation for rendering the vintage-style 3D globe, complete with draggable interactions, raycasting, and real-time HTML label positioning.

## Local Setup

1. **Clone the repository and install dependencies:**
   Ensure you have Node.js and Python 3.10+ installed.

2. **Environment Configuration:**
   Copy `.env.example` to `.env` and configure your API keys:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   ```

3. **Train / Load the Vision Model:**
   To train the CLIP model using LoRA:
   ```bash
   python -m backend.model.train --dataset-root ./data/country211
   ```
   *The trained weights will automatically save to `backend/model/saved/clip_finetuned.pt`.*

4. **Run the Backend (FastAPI):**
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```

5. **Run the Frontend (React/Vite):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` to view the app!

## Model Performance Targets
- **Zero-shot CLIP baseline:** ~18% top-1 accuracy on Country211.
- **LoRA Fine-tuned ViT-L-14:** ~42.0% top-1 accuracy, ~62.0% top-3 accuracy.

## Project Structure
```text
GeoAI/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── model/
│   │   ├── train.py            # LoRA finetuning pipeline
│   │   └── clip_classifier.py  # PyTorch inference wrapper
│   └── services/
│       └── llm_service.py      # Groq API and Llama integration
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Globe.jsx       # Three.js custom globe renderer
│       │   └── ChatPanel.jsx   # Interactive AI chat interface
│       └── pages/
│           ├── Analyzer.jsx    # Main photo analysis layout
│           └── Quiz.jsx        # Adaptive geography quiz layout
```
