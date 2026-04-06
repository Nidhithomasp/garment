import React, { useEffect, useRef, useState } from "react";
import DefectDetectionTask from "./tasks/DefectDetectionTask";

import LabelCheckingTask from "./tasks/LabelCheckingTask";

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
  // FIX 1: Removed double comma that caused syntax error
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
  {
    id: 5,
    name: "Multitask Simulation",
    icon: "⚡",
    instruction:
      "Perform multiple task zones simultaneously while balancing speed and accuracy.",
    canvasPrompt: "Work across all zones",
    color: "#d97706",
  },
];

const LEVELS = [
  { key: "easy", label: "Easy", timer: null, color: "#4ade80" },
  { key: "medium", label: "Medium", timer: 15, color: "#f59e0b" },
  { key: "hard", label: "Hard", timer: 10, color: "#ef4444" },
];

// FIX 2: Batch and flush stylus events to /api/behavior
// Called from DefectDetectionTask via the onBehavior prop, and from generic tasks
async function flushBehaviorBatch(sessionId, taskId, levelKey, events) {
  if (!events || events.length === 0) return;
  try {
    await fetch(`${API}/api/behavior`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        task_id: taskId,
        level: levelKey,
        events: events.map((e) => ({
  session_id: sessionId,
  task_id: taskId,
  level: levelKey,
  x: e.x ?? 0,
  y: e.y ?? 0,
  pressure: e.pressure ?? 0.5,
  timestamp: e.timestamp ?? 0,
  pointer_type: e.pointerType ?? "mouse",
  event_type: e.eventType ?? "move",
})),
      }),
    });
  } catch (err) {
    console.error("Failed to flush behavior batch:", err);
  }
}

export default function App() {
  const [phase, setPhase] = useState("intro"); // intro | instruction | task | selfReport | results
  const [taskIdx, setTaskIdx] = useState(0);
  const [levelIdx, setLevelIdx] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [sessionResult, setSessionResult] = useState(null);

  const [selfReport, setSelfReport] = useState({
    stress: 3,
    fatigue: 3,
    difficulty: 3,
  });

  const [timeLeft, setTimeLeft] = useState(null);
  const [pendingTaskResult, setPendingTaskResult] = useState(null);

  // FIX 3: Buffer generic-task pointer events for behavior batching
  const genericEventsRef = useRef([]);
  const genericStartTimeRef = useRef(Date.now());

  const canvasRef = useRef(null);

  const task = TASKS[taskIdx];
  const level = LEVELS[levelIdx];

  async function startSession() {
    const res = await fetch(`${API}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setSessionId(data.session_id);
    setPhase("instruction");
  }

  // FIX 4: Accept behavior events from DefectDetectionTask and flush them
  async function handleBehavior(events) {
    if (!sessionId) return;
    await flushBehaviorBatch(sessionId, task.id, level.key, events);
  }

  function handleTaskComplete(taskResult) {
    setPendingTaskResult(taskResult);
    setPhase("selfReport");
  }

  async function submitTaskResultWithSelfReport() {
    if (!pendingTaskResult) return;

    // FIX 5: Flush generic task behavior events before submitting
    if (task.id !== 1 && genericEventsRef.current.length > 0) {
      await flushBehaviorBatch(
        sessionId,
        task.id,
        level.key,
        genericEventsRef.current
      );
      genericEventsRef.current = [];
    }

    // FIX 6: Map task_metrics fields to what the backend expects
    // DefectDetectionTask returns detection_accuracy, classification_accuracy,
    // false_clicks, missed_defects nested inside task_metrics — pass them through directly
    const taskMetrics = pendingTaskResult.task_metrics || {};

    try {
      await fetch(`${API}/api/task-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          task_id: task.id,
          level: level.key,
          accuracy: pendingTaskResult.accuracy,
          completion_time: pendingTaskResult.completion_time,
          errors: pendingTaskResult.errors,
          hesitations: pendingTaskResult.hesitations,
          corrections: pendingTaskResult.corrections,
          self_report: selfReport,
          task_metrics: {
            // Core defect detection metrics the backend stress model reads
            detection_accuracy: taskMetrics.detection_accuracy ?? null,
            classification_accuracy: taskMetrics.classification_accuracy ?? null,
            false_clicks: taskMetrics.false_clicks ?? 0,
            missed_defects: taskMetrics.missed_defects ?? 0,
            // Extra detail for logging / future use
            total_images: taskMetrics.total_images ?? null,
            total_defects: taskMetrics.total_defects ?? null,
            detected_defects: taskMetrics.detected_defects ?? null,
            avg_image_time: taskMetrics.avg_image_time ?? null,
            avg_pressure: taskMetrics.avg_pressure ?? null,
            avg_pressure_variation: taskMetrics.avg_pressure_variation ?? null,
            image_results: taskMetrics.image_results ?? [],
          },
        }),
      });
    } catch (err) {
      console.error("Failed to submit task result:", err);
    }

    setPendingTaskResult(null);
    moveNext();
  }

  function moveNext() {
    setSelfReport({ stress: 3, fatigue: 3, difficulty: 3 });

    const nextLevel = levelIdx + 1;
    if (nextLevel < LEVELS.length) {
      setLevelIdx(nextLevel);
      setPhase("instruction");
      return;
    }

    const nextTask = taskIdx + 1;
    if (nextTask < TASKS.length) {
      setTaskIdx(nextTask);
      setLevelIdx(0);
      setPhase("instruction");
      return;
    }

    loadResults();
  }

  async function loadResults() {
    try {
      const res = await fetch(`${API}/api/session/${sessionId}`);
      const data = await res.json();
      setSessionResult(data);
    } catch (err) {
      console.error("Failed to load results:", err);
    }
    setPhase("results");
  }

  // FIX 7: Timer only runs for non-task-1 tasks (task 1 handles its own timer)
  useEffect(() => {
    if (phase !== "task" || task.id === 1) {
      setTimeLeft(null);
      return;
    }

    if (!level.timer) {
      setTimeLeft(null);
      return;
    }

    setTimeLeft(level.timer);
    genericEventsRef.current = [];
    genericStartTimeRef.current = Date.now();

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          completeGenericTask();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, task.id, level.key, level.timer]);

  useEffect(() => {
    if (phase !== "task" || task.id === 1) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    drawGenericTaskBackground(ctx, task, canvas.width, canvas.height);
  }, [phase, task.id, task.name, task.canvasPrompt, level.key]);

  function drawGenericTaskBackground(ctx, taskObj, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = taskObj.color + "22";
    ctx.lineWidth = 1;

    for (let i = 0; i < w; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let j = 0; j < h; j += 28) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(w, j);
      ctx.stroke();
    }

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "18px Arial";
    ctx.fillText(taskObj.name, 20, 30);
    ctx.font = "14px Arial";
    ctx.fillText(taskObj.canvasPrompt, 20, 55);

    if (taskObj.id === 2) {
      ctx.fillStyle = "#ffffff0a";
      ctx.fillRect(60, 70, 300, 180);
      ctx.strokeStyle = "#7c3aed88";
      ctx.lineWidth = 2;
      ctx.strokeRect(60, 70, 300, 180);

      ctx.fillStyle = "#e5e7eb";
      ctx.font = "13px monospace";
      ctx.fillText("SKU: GRM-2024-009", 80, 105);
      ctx.fillText("Size: M  Color: Navy", 80, 135);
      ctx.fillText("Batch: B-441  QTY: 48", 80, 165);
      ctx.fillText("Cert: ISO-9001", 80, 195);

      ctx.fillStyle = "#ef444433";
      ctx.fillRect(60, 160, 300, 35);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Batch: B-441  QTY: 52  ← mismatch", 80, 182);
    } else if (taskObj.id === 3) {
      const items = [
        { x: 30, y: 70, w: 140, h: 60, label: "Bundle A", ok: true },
        { x: 220, y: 70, w: 140, h: 60, label: "Bundle B", ok: false },
        { x: 30, y: 160, w: 140, h: 60, label: "Bundle C", ok: true },
        { x: 220, y: 160, w: 140, h: 60, label: "Bundle D", ok: false },
      ];
      items.forEach((it) => {
        ctx.fillStyle = it.ok ? "#05966922" : "#ef444422";
        ctx.fillRect(it.x, it.y, it.w, it.h);
        ctx.strokeStyle = it.ok ? "#10b981" : "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(it.x, it.y, it.w, it.h);
        ctx.fillStyle = "#fff";
        ctx.fillText(it.label, it.x + 15, it.y + 35);
      });
    } else if (taskObj.id === 4) {
      ["Units Produced", "Defects Found", "Efficiency %"].forEach((label, i) => {
        const y = 80 + i * 70;
        ctx.fillStyle = "#ffffff0a";
        ctx.fillRect(50, y, 320, 40);
        ctx.strokeStyle = "#10b98166";
        ctx.strokeRect(50, y, 320, 40);
        ctx.fillStyle = "#10b981";
        ctx.fillText(label, 55, y - 8);
      });
    } else if (taskObj.id === 5) {
      const zones = [
        [20, 20, 160, 100, "#d97706", "Zone 1"],
        [220, 20, 160, 100, "#7c3aed", "Zone 2"],
        [20, 150, 360, 90, "#e11d48", "Zone 3"],
      ];
      zones.forEach(([x, y, ww, hh, color, lbl]) => {
        ctx.fillStyle = color + "22";
        ctx.fillRect(x, y, ww, hh);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ww, hh);
        ctx.fillStyle = "#fff";
        ctx.fillText(lbl, x + 10, y + 22);
      });
    }
  }

  // FIX 8: Generic pointer handler also buffers events for /api/behavior
  function handleGenericPointer(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.type === "pointerdown" || e.type === "pointermove") {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = task.color;
      ctx.fill();

      // Buffer the event
      genericEventsRef.current.push({
        x,
        y,
        pressure: e.pressure > 0 ? e.pressure : 0.5,
        timestamp: Date.now() - genericStartTimeRef.current,
        pointerType: e.pointerType || "mouse",
      });
    }
  }

  function completeGenericTask() {
    handleTaskComplete({
      accuracy: 0.8,
      completion_time: level.timer ? level.timer - (timeLeft || 0) : 20,
      errors: 1,
      hesitations: 0,
      corrections: 0,
      task_metrics: {},
    });
  }

  const totalSteps = TASKS.length * LEVELS.length;
  const currentStep = taskIdx * LEVELS.length + levelIdx + 1;

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.brand}>🧵 StressLens</div>

        {sessionId && phase !== "intro" && phase !== "results" && (
          <div style={styles.headerRight}>
            <div style={styles.smallText}>
              Task {taskIdx + 1}/{TASKS.length} · {level.label}
            </div>
            <div style={styles.progressOuter}>
              <div
                style={{
                  ...styles.progressInner,
                  width: `${(currentStep / totalSteps) * 100}%`,
                  background: task.color,
                }}
              />
            </div>
          </div>
        )}
      </header>

      <main style={styles.main}>
        {phase === "intro" && (
          <div style={styles.card}>
            <div style={styles.bigIcon}>🧵</div>
            <h1 style={styles.title}>Garment Work Stress Monitor</h1>
            <p style={styles.subtitle}>
              This website simulates garment work tasks and estimates stress from
              behavioral performance.
            </p>

            <div style={styles.taskGrid}>
              {TASKS.map((t) => (
                <div key={t.id} style={styles.taskBox}>
                  <div style={{ fontSize: 28 }}>{t.icon}</div>
                  <div style={styles.taskName}>{t.name}</div>
                </div>
              ))}
            </div>

            <button style={styles.primaryBtn} onClick={startSession}>
              Start Session
            </button>
          </div>
        )}

        {phase === "instruction" && (
          <div style={styles.card}>
            <div style={{ fontSize: 40 }}>{task.icon}</div>
            <h2 style={styles.title2}>
              {task.name} — {level.label}
            </h2>
            <p style={styles.subtitle}>{task.instruction}</p>

            {task.id === 1 && (
  <div style={styles.noteBox}>
    Each level contains 2 images. Draw around the visible defect area and classify it. Some images may contain multiple defects. Medium images are timed for 15 seconds and hard images are timed for 10 seconds.
  </div>
)}

            <button style={styles.primaryBtn} onClick={() => setPhase("task")}>
              Begin
            </button>
          </div>
        )}

        {phase === "task" && (
          <div style={styles.cardWide}>
            <div style={styles.topRow}>
              <div>
                <h2 style={styles.title2}>{task.name}</h2>
                <p style={styles.subtitleSmall}>{task.canvasPrompt}</p>
              </div>

              <div style={styles.topStats}>
                <div style={styles.statPill}>{level.label}</div>
                {/* FIX 9: Only show App-level timer for non-task-1 tasks */}
                {task.id !== 1 && timeLeft !== null && (
                  <div style={styles.statPill}>⏱ {timeLeft}s</div>
                )}
              </div>
            </div>

            {task.id === 1 ? (
              <DefectDetectionTask
                level={level}
                task={task}
                sessionId={sessionId}
                onComplete={handleTaskComplete}
                // FIX 10: Pass behavior flush callback so task can send events up
                onBehavior={handleBehavior}
              />
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={280}
                  style={styles.canvas}
                  onPointerDown={handleGenericPointer}
                  onPointerMove={handleGenericPointer}
                  onPointerUp={handleGenericPointer}
                />

                <div style={styles.taskActionRow}>
                  <button style={styles.primaryBtn} onClick={completeGenericTask}>
                    Finish Task
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {phase === "selfReport" && (
          <div style={styles.card}>
            <h2 style={styles.title2}>Self Report</h2>
            <p style={styles.subtitle}>Rate how you felt during this task.</p>

            {["stress", "fatigue", "difficulty"].map((key) => (
              <div key={key} style={styles.sliderBlock}>
                <label style={styles.label}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}:{" "}
                  {selfReport[key]}
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={selfReport[key]}
                  onChange={(e) =>
                    setSelfReport((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </div>
            ))}

            <button
              style={styles.primaryBtn}
              onClick={submitTaskResultWithSelfReport}
            >
              Submit Report
            </button>
          </div>
        )}

        {phase === "results" && (
          <div style={styles.cardWide}>
            <h2 style={styles.title2}>Session Results</h2>

            {!sessionResult ? (
              <p>Loading...</p>
            ) : (
              <>
                <div style={styles.resultSummary}>
                  <div style={styles.resultBox}>
                    <div style={styles.resultLabel}>Overall Score</div>
                    <div style={styles.resultValue}>
                      {sessionResult.overall_score}
                    </div>
                  </div>
                  <div style={styles.resultBox}>
                    <div style={styles.resultLabel}>Stress Level</div>
                    <div style={styles.resultValue}>
                      {sessionResult.overall_label}
                    </div>
                  </div>
                </div>

                <div style={styles.noteBox}>{sessionResult.summary}</div>

                <div style={{ marginTop: 20 }}>
                  {sessionResult.task_results?.map((t, idx) => (
                    <div key={idx} style={styles.taskResultCard}>
                      <div style={{ fontWeight: 700 }}>
                        Task {t.task_id} · {t.level}
                      </div>
                      <div>Accuracy: {t.accuracy}</div>
                      <div>Stress Score: {t.stress?.score}</div>
                      <div>Stress Label: {t.stress?.label}</div>

                      {t.task_metrics?.total_images && (
                        <>
                          <div>
                            Detection Accuracy:{" "}
                            {t.task_metrics.detection_accuracy}
                          </div>
                          <div>
                            Classification Accuracy:{" "}
                            {t.task_metrics.classification_accuracy}
                          </div>
                          <div>False Clicks: {t.task_metrics.false_clicks}</div>
                          <div>
                            Missed Defects: {t.task_metrics.missed_defects}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0b1020",
    color: "#fff",
    fontFamily: "Arial, sans-serif",
  },
  header: {
    padding: "16px 24px",
    borderBottom: "1px solid #1f2937",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: { fontSize: 22, fontWeight: 700 },
  headerRight: { width: 280 },
  smallText: { fontSize: 13, marginBottom: 6, color: "#cbd5e1" },
  progressOuter: {
    width: "100%",
    height: 10,
    background: "#1e293b",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressInner: { height: "100%", borderRadius: 999 },
  main: { padding: 24, display: "flex", justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: 700,
    background: "#111827",
    borderRadius: 18,
    padding: 28,
    boxSizing: "border-box",
    boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
  },
  cardWide: {
    width: "100%",
    maxWidth: 900,
    background: "#111827",
    borderRadius: 18,
    padding: 28,
    boxSizing: "border-box",
    boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
    position: "relative",
  },
  bigIcon: { fontSize: 60, textAlign: "center", marginBottom: 8 },
  title: { margin: 0, textAlign: "center", fontSize: 34 },
  title2: { marginTop: 0, marginBottom: 8, fontSize: 28 },
  subtitle: { color: "#cbd5e1", lineHeight: 1.6, textAlign: "center" },
  subtitleSmall: { color: "#cbd5e1", marginTop: 0 },
  taskGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginTop: 20,
    marginBottom: 24,
  },
  taskBox: {
    background: "#1f2937",
    borderRadius: 12,
    padding: 16,
    textAlign: "center",
  },
  taskName: { marginTop: 8, fontWeight: 700 },
  primaryBtn: {
    background: "#22c55e",
    color: "#08110b",
    border: "none",
    padding: "12px 20px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
    display: "block",
    margin: "20px auto 0",
  },
  noteBox: {
    background: "#1e293b",
    padding: 14,
    borderRadius: 12,
    color: "#cbd5e1",
    marginTop: 16,
    textAlign: "center",
  },
  topRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  topStats: { display: "flex", gap: 10 },
  statPill: {
    background: "#1e293b",
    padding: "8px 12px",
    borderRadius: 999,
    fontSize: 13,
  },
  canvas: {
    display: "block",
    margin: "20px auto",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "#0f172a",
    maxWidth: "100%",
    cursor: "crosshair",
  },
  taskActionRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    marginTop: 12,
  },
  sliderBlock: { marginTop: 16 },
  label: { display: "block", marginBottom: 8 },
  resultSummary: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginTop: 20,
  },
  resultBox: {
    background: "#1e293b",
    padding: 18,
    borderRadius: 14,
    textAlign: "center",
  },
  resultLabel: { color: "#94a3b8", fontSize: 13, marginBottom: 8 },
  resultValue: { fontSize: 28, fontWeight: 700 },
  taskResultCard: {
    background: "#1e293b",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    lineHeight: 1.7,
  },
};
