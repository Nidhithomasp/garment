from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
import math
from datetime import datetime

app = FastAPI(title="Garment Work Stress Monitoring System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}
behavior_data = {}

# ─────────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    worker_id: Optional[str] = None

class StylusEvent(BaseModel):
    session_id: str
    task_id: int
    level: str
    x: float
    y: float
    pressure: float
    timestamp: float
    pointer_type: str
    event_type: str

class BehaviorBatch(BaseModel):
    session_id: str
    task_id: int
    level: str
    events: List[StylusEvent]

class SelfReport(BaseModel):
    stress: float
    fatigue: float
    difficulty: float

class TaskMetrics(BaseModel):
    total_bundles: Optional[int] = None
    wrong_bundles: Optional[int] = None
    correct_selections: Optional[int] = None
    wrong_selections: Optional[int] = 0
    missed_bundles: Optional[int] = 0
    submit_attempts_total: Optional[int] = 0
    wrong_submits: Optional[int] = 0
    total_clicks: Optional[int] = 0
    unique_clicks: Optional[int] = 0
    repeated_clicks: Optional[int] = 0
    first_action_time: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    timed_out: Optional[bool] = False

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
    task_metrics: Optional[TaskMetrics] = None

# ─────────────────────────────────────────────────────────────

def normalize(value, min_val, max_val):
    if max_val == min_val:
        return 0
    return max(0, min(1, (value - min_val) / (max_val - min_val)))

# ─────────────────────────────────────────────────────────────

def compute_stylus_features(events):
    if not events:
        return {
            "pressure_variation": 0,
            "speed_variation": 0,
            "hesitation_count": 0,
            "avg_pressure": 0,
        }

    pressures = [e["pressure"] for e in events]
    avg_pressure = sum(pressures) / len(pressures)

    pressure_var = math.sqrt(
        sum((p - avg_pressure) ** 2 for p in pressures) / len(pressures)
    )

    speeds = []
    hesitations = 0

    for i in range(1, len(events)):
        dt = events[i]["timestamp"] - events[i - 1]["timestamp"]
        if dt <= 0:
            continue

        dx = events[i]["x"] - events[i - 1]["x"]
        dy = events[i]["y"] - events[i - 1]["y"]

        dist = math.sqrt(dx**2 + dy**2)
        speed = dist / dt
        speeds.append(speed)

        if dt > 800:
            hesitations += 1

    avg_speed = sum(speeds) / len(speeds) if speeds else 0

    speed_var = (
        math.sqrt(sum((s - avg_speed) ** 2 for s in speeds) / len(speeds))
        if len(speeds) > 1
        else 0
    )

    return {
        "pressure_variation": pressure_var,
        "speed_variation": speed_var,
        "hesitation_count": hesitations,
        "avg_pressure": avg_pressure,
    }

# ─────────────────────────────────────────────────────────────

def compute_stress_score(task_data, baseline=None):

    stylus = task_data.get("stylus_features", {})
    sr = task_data.get("self_report", {})
    tm = task_data.get("task_metrics", {})

    pv = normalize(stylus.get("pressure_variation", 0), 0, 0.5)
    sv = normalize(stylus.get("speed_variation", 0), 0, 300)
    hes = normalize(stylus.get("hesitation_count", 0), 0, 20)
    corr = normalize(task_data.get("corrections", 0), 0, 10)
    err = normalize(task_data.get("errors", 0), 0, 10)
    ct = normalize(task_data.get("completion_time", 30), 5, 60)

    self_report_norm = normalize(
        (sr.get("stress",1) + sr.get("fatigue",1) + sr.get("difficulty",1)) / 3,
        1, 5
    )

    # TASK 3 PENALTIES
    total_b = max(1, tm.get("wrong_bundles", 1))

    miss_penalty = normalize(tm.get("missed_bundles", 0), 0, total_b)
    false_alarm_penalty = normalize(tm.get("wrong_selections", 0), 0, 5)
    wrong_submit_penalty = normalize(tm.get("wrong_submits", 0), 0, 5)

    score = (
        0.15 * pv +
        0.10 * sv +
        0.10 * hes +
        0.10 * corr +
        0.10 * err +
        0.10 * ct +
        0.10 * self_report_norm +
        0.06 * miss_penalty +
        0.04 * false_alarm_penalty +
        0.05 * wrong_submit_penalty
    )

    score = max(0, min(1, score))

    if score <= 0.33:
        label = "Low"
    elif score <= 0.66:
        label = "Medium"
    else:
        label = "High"

    return {"score": round(score,4), "label": label}

# ─────────────────────────────────────────────────────────────

@app.post("/api/session/start")
def start_session(body: SessionStart):
    sid = str(uuid.uuid4())

    sessions[sid] = {
        "session_id": sid,
        "tasks": {},
        "baseline": None
    }

    behavior_data[sid] = {}

    return {"session_id": sid}

# ─────────────────────────────────────────────────────────────

@app.post("/api/behavior")
def store_behavior(batch: BehaviorBatch):

    sid = batch.session_id
    key = f"{batch.task_id}_{batch.level}"

    if key not in behavior_data[sid]:
        behavior_data[sid][key] = []

    behavior_data[sid][key].extend([e.dict() for e in batch.events])

    return {"stored": len(batch.events)}

# ─────────────────────────────────────────────────────────────

@app.post("/api/task-complete")
def task_complete(body: TaskComplete):

    sid = body.session_id
    key = f"{body.task_id}_{body.level}"

    events = behavior_data.get(sid, {}).get(key, [])

    stylus = compute_stylus_features(events)

    tm = body.task_metrics.dict() if body.task_metrics else {}

    task_data = {
        "task_id": body.task_id,
        "level": body.level,
        "accuracy": body.accuracy,
        "completion_time": body.completion_time,
        "errors": body.errors,
        "hesitations": body.hesitations,
        "corrections": body.corrections,
        "self_report": body.self_report.dict(),
        "stylus_features": stylus,
        "task_metrics": tm
    }

    stress = compute_stress_score(task_data)

    task_data["stress"] = stress

    sessions[sid]["tasks"][key] = task_data

    return {"status": "ok", "stress": stress}

# ─────────────────────────────────────────────────────────────

@app.get("/api/session/{sid}")
def get_session(sid: str):

    task_results = list(sessions[sid]["tasks"].values())

    if not task_results:
        return {"overall_score": 0, "overall_label": "Low"}

    scores = [t["stress"]["score"] for t in task_results]

    overall = sum(scores) / len(scores)

    if overall <= 0.33:
        label = "Low"
    elif overall <= 0.66:
        label = "Medium"
    else:
        label = "High"

    return {
        "task_results": task_results,
        "overall_score": round(overall,4),
        "overall_label": label
    }

# ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}