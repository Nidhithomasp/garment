import React, { useEffect, useState } from "react";
import DefectDetectionTask from "./tasks/DefectDetectionTask";
import LabelCheckingTask from "./tasks/LabelCheckingTask";
import BundleVerificationTask from "./tasks/BundleVerificationTask";
import ProductionEntryTask from "./tasks/ProductionEntryTask";

const API = "http://localhost:8000";

const TASKS = [
  {
    id: 1,
    name: "Defect Detection",
    icon: "🔍",
    instruction:
      "Inspect each garment image and draw around the visible defect area. After marking a defect, classify the defect correctly. Some images may contain multiple defects.",
    canvasPrompt: "Draw around the defect area(s) in the garment image",
    color: "#e11d48",
  },
  {
    id: 2,
    name: "Label Checking",
    icon: "🏷️",
    instruction:
      "Compare the reference details with the garment label. Do not assume a mismatch exists. Edit the label only if needed, or choose No Mismatch, then click Submit.",
    canvasPrompt: "Compare details, edit if needed, or choose No Mismatch",
    color: "#7c3aed",
  },
  {
    id: 3,
    name: "Bundle Verification",
    icon: "📦",
    instruction: "Verify bundle information and mark incorrect bundle items.",
    canvasPrompt: "Mark incorrect bundle items",
    color: "#0284c7",
  },
  {
    id: 4,
    name: "Production Entry",
    icon: "📝",
    instruction: "Enter production values accurately and maintain clarity.",
    canvasPrompt: "Write values in the fields",
    color: "#059669",
  },
];

const LEVELS = [
  { key: "easy",   label: "Easy",   timer: null, color: "#4ade80" },
  { key: "medium", label: "Medium", timer: 30,   color: "#f59e0b" },
  { key: "hard",   label: "Hard",   timer: 20,   color: "#ef4444" },
];

export default function App() {
  const [phase,            setPhase]            = useState("intro");
  const [taskIdx,          setTaskIdx]          = useState(0);
  const [levelIdx,         setLevelIdx]         = useState(0);
  const [sessionId,        setSessionId]        = useState(null);
  const [sessionResult,    setSessionResult]    = useState(null);
  const [pendingTaskResult,setPendingTaskResult] = useState(null);
  const [selfReport,       setSelfReport]       = useState({ stress: 3, fatigue: 3, difficulty: 3 });
  const [productivity, setProductivity] = useState(null);

  const task  = TASKS[taskIdx];
  const level = LEVELS[levelIdx];

  async function startSession() {
    try {
      const res = await fetch(`${API}/api/session/start`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})   // 🔥 IMPORTANT
});
      const data = await res.json();
      console.log("SESSION ID:", data.session_id);
      setSessionId(data.session_id);
      setPhase("instruction");
    } catch (err) {
      console.error("Session start error:", err);
    }
  }

  function handleTaskComplete(taskResult) {
    setPendingTaskResult(taskResult);
    setPhase("selfReport");
  }

  async function submitTaskResultWithSelfReport() {
    const payload = {
      session_id:      sessionId,
      task_id:         task.id,
      level:           level.key,
      accuracy:        pendingTaskResult?.accuracy        ?? 0,
      completion_time: pendingTaskResult?.completion_time ?? 0,
      errors:          pendingTaskResult?.errors          ?? 0,
      hesitations:     pendingTaskResult?.hesitations     ?? 0,
      corrections:     pendingTaskResult?.corrections     ?? 0,
      self_report:     selfReport,
      task_metrics:    pendingTaskResult?.task_metrics    || {},
    };

    try {
      await fetch(`${API}/api/task-complete`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      // ← pass sessionId directly to avoid stale closure
      moveNext(sessionId);
    } catch (err) {
      console.error("Task submit error:", err);
    }
  }

  function moveNext(sid) {
    setSelfReport({ stress: 3, fatigue: 3, difficulty: 3 });

    if (levelIdx < LEVELS.length - 1) {
      setLevelIdx(levelIdx + 1);
      setPhase("instruction");
    } else if (taskIdx < TASKS.length - 1) {
      setTaskIdx(taskIdx + 1);
      setLevelIdx(0);
      setPhase("instruction");
    } else {
      loadResults(sid); // ← use passed sid, not state
    }
  }

  async function loadResults(sid) {
    try {
      const res  = await fetch(`${API}/api/session/${sid}`);
const data = await res.json();
setSessionResult(data);
setPhase("results");

// 🔥 ADD THIS BLOCK
const res2 = await fetch(`${API}/api/productivity`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    industry: "garment",
    team_id: 1,
    stress_score: data.overall_score
  })
});

const prodData = await res2.json();
setProductivity(prodData);
     
    } catch (err) {
      console.error("Results fetch error:", err);
    }
  }

  return (
    <div style={styles.container}>
      {/* Navbar */}
      <nav style={styles.nav}>
        <div style={styles.logo}>🧵 STRESSLENS</div>
        {phase !== "intro" && phase !== "results" && (
          <div style={styles.stepIndicator}>
            Task {taskIdx + 1}/4 • {level.label}
          </div>
        )}
      </nav>

      <main style={styles.main}>

        {phase === "intro" && (
          <div style={styles.cardCenter}>
            <h1 style={styles.heroTitle}>Stress Monitor</h1>
            <p style={styles.heroSub}>Industrial Behavioral Assessment Protocol</p>
            <button style={styles.primaryBtn} onClick={startSession}>
              Initialize Session
            </button>
          </div>
        )}

        {phase === "instruction" && (
          <div style={styles.cardCenter}>
            <div style={{ ...styles.iconCircle, border: `2px solid ${task.color}` }}>
              {task.icon}
            </div>
            <h2 style={styles.cardTitle}>{task.name}</h2>
            <div style={{ ...styles.badge, background: level.color }}>
              {level.label} Mode
            </div>
            <p style={styles.instructionText}>{task.instruction}</p>
            <button style={styles.primaryBtn} onClick={() => setPhase("task")}>
              Start Task
            </button>
          </div>
        )}

        {phase === "task" && (
          <div style={styles.cardWide}>
            <div style={styles.taskHeader}>
              <div>
                <h3 style={styles.miniLabel}>{task.name}</h3>
                <p style={styles.canvasPrompt}>{task.canvasPrompt}</p>
              </div>
              {level.timer && (
                <div style={styles.timerBadge}>⏱ {level.timer}s</div>
              )}
            </div>
            <div style={styles.taskViewport}>
              {task.id === 1 && <DefectDetectionTask   level={level} onComplete={handleTaskComplete} />}
              {task.id === 2 && <LabelCheckingTask      level={level} onComplete={handleTaskComplete} />}
              {task.id === 3 && <BundleVerificationTask level={level} onComplete={handleTaskComplete} />}
              {task.id === 4 && <ProductionEntryTask    level={level} onComplete={handleTaskComplete} />}
            </div>
          </div>
        )}

        {phase === "selfReport" && (
          <div style={styles.cardCenter}>
            <h2 style={styles.cardTitle}>Post-Task Feedback</h2>
            <p style={styles.heroSub}>Rate your perceived state during the last task.</p>

            {["stress", "fatigue", "difficulty"].map((k) => (
              <div key={k} style={styles.sliderGroup}>
                <div style={styles.sliderHeader}>
                  <label style={styles.label}>{k.toUpperCase()}</label>
                  <span style={styles.valText}>{selfReport[k]}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={selfReport[k]}
                  style={styles.slider}
                  onChange={(e) =>
                    setSelfReport((p) => ({ ...p, [k]: Number(e.target.value) }))
                  }
                />
              </div>
            ))}

            <button style={styles.primaryBtn} onClick={submitTaskResultWithSelfReport}>
              Submit Results
            </button>
          </div>
        )}

        {phase === "results" && (
          <div style={styles.cardWide}>
            <div style={styles.resultsHeader}>
              <h1 style={styles.heroTitle}>Final Results</h1>
              <div style={styles.scoreContainer}>
                <div style={styles.bigScore}>{sessionResult?.overall_score}</div>
                <div style={styles.scoreLabel}>{sessionResult?.overall_label}</div>
              </div>
            </div>

            <div style={styles.grid}>
              {sessionResult?.task_results?.map((t, i) => (
                <div key={i} style={styles.resultItem}>
                  <div style={styles.resultItemHeader}>
                    <strong>Task {t.task_id} — {TASKS[t.task_id - 1]?.name} ({t.level})</strong>
                    <span style={{
                      color: t.stress_label === "High"   ? "#ef4444"
                           : t.stress_label === "Medium" ? "#f59e0b"
                           : "#4ade80"
                    }}>
                      {t.stress_label}
                    </span>
                  </div>
                  <div style={styles.statGrid}>
  <div style={styles.statCol}>
    Accuracy: <b>{t.accuracy}%</b>
  </div>

  <div style={styles.statCol}>
    Time: <b>{t.completion_time}s</b>
  </div>

  <div style={styles.statCol}>
    Errors: <b>{t.errors}</b>
  </div>

  <div style={styles.statCol}>
    Stress Score: <b>{t.stress_score}</b>
  </div>

  <div style={styles.statCol}>
    Hesitations: <b>{t.hesitations}</b>
  </div>

  <div style={styles.statCol}>
    Corrections: <b>{t.corrections}</b>
  </div>
</div>
                </div>
              ))}
            </div>

            <button
              style={{ ...styles.primaryBtn, marginTop: 40 }}
              onClick={() => window.location.reload()}
            >
              Restart Session
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container:       { background: "#0b1020", minHeight: "100vh", color: "white", fontFamily: "'Inter', sans-serif" },
  nav:             { padding: "20px 40px", display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e293b", background: "rgba(11,16,32,0.8)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 10 },
  logo:            { fontWeight: 900, letterSpacing: "1px", color: "#38bdf8" },
  stepIndicator:   { fontSize: "13px", fontWeight: 600, color: "#94a3b8" },
  main:            { display: "flex", justifyContent: "center", padding: "60px 20px" },
  cardCenter:      { width: "100%", maxWidth: "450px", background: "#111827", padding: "40px", borderRadius: "24px", border: "1px solid #1f2937", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" },
  cardWide:        { width: "100%", maxWidth: "1000px", background: "#111827", padding: "40px", borderRadius: "24px", border: "1px solid #1f2937" },
  heroTitle:       { fontSize: "32px", fontWeight: 800, margin: "0 0 10px 0" },
  heroSub:         { color: "#94a3b8", marginBottom: "30px" },
  cardTitle:       { fontSize: "24px", fontWeight: 700, margin: "10px 0" },
  primaryBtn:      { width: "100%", background: "#38bdf8", color: "#0c4a6e", border: "none", padding: "14px", borderRadius: "12px", fontSize: "16px", fontWeight: 700, cursor: "pointer" },
  instructionText: { color: "#cbd5e1", lineHeight: 1.6, margin: "20px 0 30px" },
  iconCircle:      { width: "60px", height: "60px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: "24px", background: "#1e293b" },
  badge:           { display: "inline-block", padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "#000" },
  taskHeader:      { display: "flex", justifyContent: "space-between", marginBottom: "20px", borderBottom: "1px solid #1f2937", paddingBottom: "20px" },
  miniLabel:       { margin: 0, fontSize: "18px" },
  canvasPrompt:    { margin: "5px 0 0", color: "#94a3b8", fontSize: "14px" },
  timerBadge:      { background: "#ef444433", color: "#ef4444", padding: "8px 16px", borderRadius: "8px", fontWeight: 700 },
  taskViewport:    { minHeight: "400px", background: "#0b1020", borderRadius: "12px", border: "1px solid #1f2937" },
  sliderGroup:     { textAlign: "left", marginBottom: "24px" },
  sliderHeader:    { display: "flex", justifyContent: "space-between", marginBottom: "10px" },
  label:           { fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" },
  valText:         { fontWeight: 800, color: "#38bdf8" },
  slider:          { width: "100%", accentColor: "#38bdf8", cursor: "pointer" },
  resultsHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" },
  scoreContainer:  { textAlign: "right" },
  bigScore:        { fontSize: "48px", fontWeight: 900, color: "#38bdf8" },
  scoreLabel:      { fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" },
  grid:            { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  resultItem:      { background: "#1f293780", padding: "20px", borderRadius: "16px", border: "1px solid #1f2937" },
  resultItemHeader:{ display: "flex", justifyContent: "space-between", marginBottom: "15px", fontSize: "14px" },
  statGrid:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px", color: "#94a3b8" },
  statCol:         { background: "#0b1020", padding: "8px", borderRadius: "6px" },
};