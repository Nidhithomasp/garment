import React, { useState } from "react";
import DefectDetectionTask from "./tasks/DefectDetectionTask";
import LabelCheckingTask from "./tasks/LabelCheckingTask";
import BundleVerificationTask from "./tasks/BundleVerificationTask";
import ProductionEntryTask from "./tasks/ProductionEntryTask";

const API = "http://localhost:8000";

const TASKS = [
  { id: 1, name: "Defect Detection", icon: "🔍", instruction: "Inspect each garment image and draw around the visible defect area.", canvasPrompt: "Draw around defect area", color: "#e11d48" },
  { id: 2, name: "Label Checking", icon: "🏷️", instruction: "Compare label details carefully.", canvasPrompt: "Check label", color: "#7c3aed" },
  { id: 3, name: "Bundle Verification", icon: "📦", instruction: "Verify bundle info.", canvasPrompt: "Mark incorrect items", color: "#0284c7" },
  { id: 4, name: "Production Entry", icon: "📝", instruction: "Enter values correctly.", canvasPrompt: "Enter values", color: "#059669" },
];

const LEVELS = [
  { key: "easy", label: "Easy", timer: null, color: "#4ade80" },
  { key: "medium", label: "Medium", timer: 30, color: "#f59e0b" },
  { key: "hard", label: "Hard", timer: 20, color: "#ef4444" },
];

export default function App() {
  const [phase, setPhase] = useState("intro");
  const [taskIdx, setTaskIdx] = useState(0);
  const [levelIdx, setLevelIdx] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [sessionResult, setSessionResult] = useState(null);
  const [pendingTaskResult, setPendingTaskResult] = useState(null);
  const [selfReport, setSelfReport] = useState({ stress: 3, fatigue: 3, difficulty: 3 });

  const task = TASKS[taskIdx];
  const level = LEVELS[levelIdx];

  // ✅ FIXED SESSION START
  async function startSession() {
    try {
      const res = await fetch(`${API}/api/session/start`, { method: "POST" });
      const data = await res.json();

      console.log("SESSION ID:", data.session_id);

      setSessionId(data.session_id);
      setPhase("instruction");
    } catch (err) {
      console.error("SESSION ERROR:", err);
    }
  }

  function handleTaskComplete(taskResult) {
    console.log("TASK RESULT:", taskResult);
    setPendingTaskResult(taskResult);
    setPhase("selfReport");
  }

  // ✅ FIXED SAVE (CRITICAL)
  async function submitTaskResultWithSelfReport() {
    if (!sessionId) {
      alert("Session not started");
      return;
    }

    const payload = {
  session_id: sessionId,
  task_id: task.id,
  level: level.key,
  accuracy: pendingTaskResult?.accuracy ?? 0,
  completion_time: pendingTaskResult?.completion_time ?? 0,
  errors: pendingTaskResult?.errors ?? 0,
  hesitations: pendingTaskResult?.hesitations ?? 0,
  corrections: pendingTaskResult?.corrections ?? 0,
  self_report: selfReport,
  task_metrics: pendingTaskResult?.task_metrics || {}   // 🔥 ADD THIS
};

    console.log("SENDING:", payload);

    try {
      const res = await fetch(`${API}/api/task-complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      console.log("SAVED:", data);

      // ✅ WAIT before moving
      setTimeout(() => {
        moveNext();
      }, 300);

    } catch (err) {
      console.error("ERROR:", err);
    }
  }

  function moveNext() {
    setSelfReport({ stress: 3, fatigue: 3, difficulty: 3 });

    if (levelIdx < LEVELS.length - 1) {
      setLevelIdx(levelIdx + 1);
      setPhase("instruction");
    } else if (taskIdx < TASKS.length - 1) {
      setTaskIdx(taskIdx + 1);
      setLevelIdx(0);
      setPhase("instruction");
    } else {
      loadResults();
    }
  }

  // ✅ FIXED RESULT FETCH
  async function loadResults() {
    console.log("FETCHING RESULTS FOR:", sessionId);

    try {
      const res = await fetch(`${API}/api/session/${sessionId}`);
      const data = await res.json();

      console.log("RESULT:", data);

      setSessionResult(data);
      setPhase("results");

    } catch (err) {
      console.error("RESULT ERROR:", err);
    }
  }

  return (
    <div style={styles.container}>
      <nav style={styles.nav}>
        <div style={styles.logo}>🧵 STRESSLENS</div>
      </nav>

      <main style={styles.main}>
        {phase === "intro" && (
          <div style={styles.cardCenter}>
            <h1>Stress Monitor</h1>
            <button style={styles.primaryBtn} onClick={startSession}>
              Initialize Session
            </button>
          </div>
        )}

        {phase === "instruction" && (
          <div style={styles.cardCenter}>
            <h2>{task.name}</h2>
            <button style={styles.primaryBtn} onClick={() => setPhase("task")}>
              Start Task
            </button>
          </div>
        )}

        {phase === "task" && (
          <div style={styles.cardWide}>
            {task.id === 1 && <DefectDetectionTask level={level} onComplete={handleTaskComplete} />}
            {task.id === 2 && <LabelCheckingTask level={level} onComplete={handleTaskComplete} />}
            {task.id === 3 && <BundleVerificationTask level={level} onComplete={handleTaskComplete} />}
            {task.id === 4 && <ProductionEntryTask level={level} onComplete={handleTaskComplete} />}
          </div>
        )}

        {phase === "selfReport" && (
          <div style={styles.cardCenter}>
            <h2>Feedback</h2>
            {["stress", "fatigue", "difficulty"].map((k) => (
              <input
                key={k}
                type="range"
                min="1"
                max="5"
                value={selfReport[k]}
                onChange={(e) =>
                  setSelfReport((p) => ({
                    ...p,
                    [k]: Number(e.target.value),
                  }))
                }
              />
            ))}
            <button style={styles.primaryBtn} onClick={submitTaskResultWithSelfReport}>
              Submit
            </button>
          </div>
        )}

        {phase === "results" && (
          <div style={styles.cardWide}>
            <h1>Final Results</h1>

            <h2>{sessionResult?.overall_label}</h2>
            <p>Score: {sessionResult?.overall_score}</p>

            {sessionResult?.task_results?.map((t, i) => (
              <div key={i}>
                <h3>Task {t.task_id} ({t.level})</h3>
                <p>Stress: {t.stress_label}</p>
                <p>Score: {t.stress_score}</p>
                <p>Accuracy: {t.accuracy}%</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}