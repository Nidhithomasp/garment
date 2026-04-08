from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}

class SessionStart(BaseModel):
    worker_id: Optional[str] = None

class SelfReport(BaseModel):
    stress: float
    fatigue: float
    difficulty: float

class TaskComplete(BaseModel):
    session_id: str
    task_id: int
    level: str
    accuracy: float
    completion_time: float
    errors: int
    hesitations: int
    corrections: int
    self_report: SelfReport
    task_metrics: Optional[Dict[str, Any]] = None  # ← fixed: accepts any keys

def normalize(x, max_val):
    if max_val == 0:
        return 0
    return min(1.0, float(x) / float(max_val))

def compute_stress(task):
    m = task.get("task_metrics") or {}
    if hasattr(m, "dict"):
        m = m.dict()

    level = task.get("level", "easy")
    time_ceiling = {"easy": 60, "medium": 40, "hard": 30}.get(level, 60)

    # ── PERFORMANCE (50%) ──────────────────────────────────────────────
    perf = (
        0.3 * normalize(task["errors"], 10) +
        0.3 * normalize(task["completion_time"], time_ceiling) +
        0.4 * (1 - normalize(task["accuracy"], 100))
    )

    # ── BEHAVIOUR (20%) ────────────────────────────────────────────────
    behavior = (
        0.5 * normalize(task["hesitations"], 10) +
        0.5 * normalize(task["corrections"], 20)
    )

    # ── COGNITIVE / TASK-SPECIFIC (30%) ────────────────────────────────
    scores = []

    def add(val, direction="high_is_bad", ceiling=1.0):
        if val is None:
            return
        try:
            v = float(val)
        except (TypeError, ValueError):
            return
        n = min(1.0, v / ceiling) if ceiling != 0 else 0.0
        scores.append(n if direction == "high_is_bad" else 1.0 - n)

    # --- Task 1: Defect Detection ---
    add(m.get("detection_accuracy"),                    "high_is_good", 100)
    add(m.get("classification_accuracy"),               "high_is_good", 100)
    add(m.get("avg_pressure_variation"),                "high_is_bad",  0.5)
    add(m.get("avg_image_time"),                        "high_is_bad",  30)
    add(m.get("wrong_classification_attempts_total"),   "high_is_bad",  10)
    add(m.get("false_clicks"),                          "high_is_bad",  10)
    add(m.get("missed_defects"),                        "high_is_bad",  5)
    add(m.get("avg_box_area"),                          "high_is_bad",  50000)
    add(m.get("avg_draw_distance"),                     "high_is_bad",  2000)

    # --- Task 2: Label Checking ---
    add(m.get("wrong_submits"),                         "high_is_bad",  5)
    add(m.get("avg_question_time"),                     "high_is_bad",  30)
    add(m.get("skipped_questions"),                     "high_is_bad",  3)
    add(m.get("timed_out_questions"),                   "high_is_bad",  3)
    total_q   = m.get("total_questions")
    correct_q = m.get("correct_answers")
    if total_q and correct_q is not None and float(total_q) > 0:
        add(float(correct_q) / float(total_q),          "high_is_good", 1.0)

    # --- Task 3: Bundle Verification ---
    add(m.get("precision"),                             "high_is_good", 1.0)
    add(m.get("recall"),                                "high_is_good", 1.0)
    add(m.get("f1_score"),                              "high_is_good", 1.0)
    add(m.get("first_action_time"),                     "high_is_bad",  10)
    add(m.get("repeated_clicks"),                       "high_is_bad",  10)
    add(m.get("missed_bundles"),                        "high_is_bad",  5)
    add(m.get("wrong_selections"),                      "high_is_bad",  5)

    # --- Task 4: Production Entry ---
    eff = m.get("efficiency")
    if eff is not None:
        try:
            add(abs(float(eff) - 100),                  "high_is_bad",  100)
        except (TypeError, ValueError):
            pass
    add(m.get("wrong_submits"),                         "high_is_bad",  5)
    add(m.get("submit_attempts_total"),                 "high_is_bad",  5)
    add(m.get("first_attempt_time"),                    "high_is_bad",  10)
    add(m.get("avg_attempt_time"),                      "high_is_bad",  15)
    add(m.get("input_variability"),                     "high_is_bad",  5)
    add(m.get("time_to_correct"),                       "high_is_bad",  time_ceiling)

    cognitive = sum(scores) / len(scores) if scores else 0.0

    # ── FINAL SCORE ────────────────────────────────────────────────────
    # ---------------- SELF REPORT ----------------
    # ---------------- SELF REPORT (FIXED) ----------------
    sr = task.get("self_report")
    self_stress = 0
    if sr:
        # convert pydantic → dict if needed
        if hasattr(sr, "dict"):
            sr = sr.dict()
        try:
            self_stress = (sr["stress"] + sr["fatigue"] + sr["difficulty"]) / 3
            self_stress = (self_stress - 1) / 4   # normalize 1–5 → 0–1
        except:
            self_stress = 0
    # ---------------- SYSTEM STRESS ----------------
    system_stress = min(1.0, 0.5 * perf + 0.2 * behavior + 0.3 * cognitive)
    # ---------------- ADAPTIVE FUSION (IMPROVED) ---------------
    if self_stress > 0.7:
        score = 0.5 * system_stress + 0.5 * self_stress
    else:
        score = 0.8 * system_stress + 0.2 * self_stress
    score = min(1.0, score)
    # ---------------- STORE FOR DEBUG / FRONTEND ----------------
    task["system_stress"] = round(system_stress, 3)
    task["self_stress"] = round(self_stress, 3)
    

    if score < 0.3:
        label = "Low"
    elif score < 0.7:
        label = "Medium"
    else:
        label = "High"

    return {"score": round(score, 3), "label": label}


@app.post("/api/session/start")
def start_session():
    sid = str(uuid.uuid4())
    sessions[sid] = []
    return {"session_id": sid}


@app.post("/api/task-complete")
def task_complete(body: TaskComplete):
    task = body.dict()
    stress = compute_stress(task)
    task["stress"] = stress

    if body.session_id not in sessions:
        sessions[body.session_id] = []

    sessions[body.session_id].append(task)

    return {
    "task_id": task["task_id"],
    "level": task["level"],
    "stress_score": stress["score"],
    "stress_label": stress["label"],

    # 🔥 ADD THIS LINE HERE
    "fusion_type": "adaptive",

    "system_stress": task.get("system_stress"),
    "self_stress": task.get("self_stress"),
    "accuracy": task["accuracy"],
    "completion_time": task["completion_time"],
    "errors": task["errors"],
    "hesitations": task["hesitations"],
    "corrections": task["corrections"],
    "self_report": task["self_report"],
    "task_metrics": task.get("task_metrics", {}),
}


@app.get("/api/session/{sid}")
def get_session(sid: str):
    tasks = sessions.get(sid, [])

    if not tasks:
        return {"task_results": [], "overall_score": 0, "overall_label": "Low"}

    results = []
    scores  = []

    for t in tasks:
        s = t["stress"]["score"]
        scores.append(s)
        results.append({
    "task_id":         t["task_id"],
    "level":           t["level"],
    "stress_score":    t["stress"]["score"],
    "stress_label":    t["stress"]["label"],

    # 🔥 ADD THESE
    "system_stress":   t.get("system_stress"),
    "self_stress":     t.get("self_stress"),

    "accuracy":        t["accuracy"],
    "completion_time": t["completion_time"],
    "errors":          t["errors"],
    "hesitations":     t["hesitations"],
    "corrections":     t["corrections"],
    "self_report":     t["self_report"],
    "task_metrics":    t.get("task_metrics", {}),
})

    overall = sum(scores) / len(scores)
    label   = "Low" if overall < 0.33 else "Medium" if overall < 0.66 else "High"

    return {
        "task_results":  results,
        "overall_score": round(overall, 3),
        "overall_label": label,
    }