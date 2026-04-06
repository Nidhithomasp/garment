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
    task_metrics: Optional[Dict[str, Any]] = None

def normalize(value, min_val, max_val):
    if max_val == min_val:
        return 0.0
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))

def compute_stylus_features(events: list) -> dict:
    if not events:
        return {
            "pressure_variation": 0,
            "speed_variation": 0,
            "total_distance": 0,
            "hesitation_count": 0,
            "avg_pressure": 0,
        }

    pressures = [e["pressure"] for e in events]
    avg_pressure = sum(pressures) / len(pressures) if pressures else 0
    pressure_var = (
        math.sqrt(sum((p - avg_pressure) ** 2 for p in pressures) / len(pressures))
        if len(pressures) > 1 else 0
    )

    speeds = []
    distances = []
    hesitations = 0

    for i in range(1, len(events)):
        dt = events[i]["timestamp"] - events[i - 1]["timestamp"]
        if dt <= 0:
            continue
        dx = events[i]["x"] - events[i - 1]["x"]
        dy = events[i]["y"] - events[i - 1]["y"]
        dist = math.sqrt(dx ** 2 + dy ** 2)
        distances.append(dist)
        speed = dist / dt
        speeds.append(speed)

        if dt > 800:
            hesitations += 1

    avg_speed = sum(speeds) / len(speeds) if speeds else 0
    speed_var = (
        math.sqrt(sum((s - avg_speed) ** 2 for s in speeds) / len(speeds))
        if len(speeds) > 1 else 0
    )
    total_distance = sum(distances)

    return {
        "pressure_variation": pressure_var,
        "speed_variation": speed_var,
        "total_distance": total_distance,
        "hesitation_count": hesitations,
        "avg_pressure": avg_pressure,
    }

def compute_stress_score(task_data: dict, baseline: Optional[dict] = None) -> dict:
    stylus = task_data.get("stylus_features", {})
    sr = task_data.get("self_report", {"stress": 1, "fatigue": 1, "difficulty": 1})
    tm = task_data.get("task_metrics", {})

    pv = normalize(stylus.get("pressure_variation", 0), 0, 0.5)
    sv = normalize(stylus.get("speed_variation", 0), 0, 300)
    hes = normalize(stylus.get("hesitation_count", 0), 0, 20)
    corr = normalize(task_data.get("corrections", 0), 0, 10)
    err = normalize(task_data.get("errors", 0), 0, 10)
    ct = normalize(task_data.get("completion_time", 30), 5, 60)
    self_report_norm = normalize(
        (sr["stress"] + sr["fatigue"] + sr["difficulty"]) / 3, 1, 5
    )

    if baseline:
      b_pv = baseline.get("pv", 0)
      b_sv = baseline.get("sv", 0)
      pv = max(0, pv - b_pv)
      sv = max(0, sv - b_sv)

    detection_penalty = 0.0
    classification_penalty = 0.0
    false_click_penalty = 0.0
    miss_penalty = 0.0

    if task_data.get("task_id") == 1 and tm:
        detection_penalty = 1 - tm.get("detection_accuracy", 1.0)
        classification_penalty = 1 - tm.get("classification_accuracy", 1.0)
        false_click_penalty = normalize(tm.get("false_clicks", 0), 0, 10)
        miss_penalty = normalize(tm.get("missed_defects", 0), 0, 3)

    score = (
        0.15 * pv +
        0.10 * sv +
        0.10 * hes +
        0.10 * corr +
        0.10 * err +
        0.10 * ct +
        0.10 * self_report_norm +
        0.15 * detection_penalty +
        0.10 * classification_penalty +
        0.05 * false_click_penalty +
        0.05 * miss_penalty
    )

    score = max(0.0, min(1.0, score))

    if score <= 0.33:
        label = "Low"
        color = "#4ade80"
    elif score <= 0.66:
        label = "Medium"
        color = "#f59e0b"
    else:
        label = "High"
        color = "#ef4444"

    return {
        "score": round(score, 4),
        "label": label,
        "color": color,
        "components": {
            "pressure_variation": round(pv, 4),
            "speed_variation": round(sv, 4),
            "hesitation": round(hes, 4),
            "correction_count": round(corr, 4),
            "error_rate": round(err, 4),
            "completion_time": round(ct, 4),
            "self_report": round(self_report_norm, 4),
            "detection_penalty": round(detection_penalty, 4),
            "classification_penalty": round(classification_penalty, 4),
            "false_click_penalty": round(false_click_penalty, 4),
            "miss_penalty": round(miss_penalty, 4),
        },
    }

def generate_insight(overall_score: float, task_results: list) -> str:
    if overall_score <= 0.33:
        return "Your performance indicates low stress levels. Behavior stayed fairly stable across tasks."
    elif overall_score <= 0.66:
        return "Your performance indicates moderate stress under workload. Some hesitation, errors, or slower responses were observed."
    return "Your performance indicates high stress under workload. Strong behavioral and performance degradation signals were detected."

@app.post("/api/session/start")
def start_session(body: SessionStart):
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "session_id": session_id,
        "worker_id": body.worker_id or "anonymous",
        "started_at": datetime.utcnow().isoformat(),
        "tasks": {},
        "baseline": None,
    }
    behavior_data[session_id] = {}
    return {"session_id": session_id}

@app.post("/api/behavior")
def store_behavior(batch: BehaviorBatch):
    sid = batch.session_id
    if sid not in behavior_data:
        raise HTTPException(404, "Session not found")

    key = f"{batch.task_id}_{batch.level}"
    if key not in behavior_data[sid]:
        behavior_data[sid][key] = []

    behavior_data[sid][key].extend([e.dict() for e in batch.events])
    return {"stored": len(batch.events)}

@app.post("/api/task-complete")
def task_complete(body: TaskComplete):
    sid = body.session_id
    if sid not in sessions:
        raise HTTPException(404, "Session not found")

    key = f"{body.task_id}_{body.level}"
    raw_events = behavior_data.get(sid, {}).get(key, [])
    stylus_features = compute_stylus_features(raw_events)

    task_data = {
        "task_id": body.task_id,
        "level": body.level,
        "accuracy": body.accuracy,
        "completion_time": body.completion_time,
        "errors": body.errors,
        "hesitations": body.hesitations,
        "corrections": body.corrections,
        "self_report": body.self_report.dict(),
        "stylus_features": stylus_features,
        "event_count": len(raw_events),
        "task_metrics": body.task_metrics or {},
    }

    baseline = None
    if body.level == "easy":
        sessions[sid]["baseline"] = {
            "pv": normalize(stylus_features["pressure_variation"], 0, 0.5),
            "sv": normalize(stylus_features["speed_variation"], 0, 300),
        }
    else:
        baseline = sessions[sid].get("baseline")

    stress = compute_stress_score(task_data, baseline)
    task_data["stress"] = stress

    sessions[sid]["tasks"][key] = task_data
    return {"status": "ok", "stress": stress}

@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    sess = sessions[session_id]
    task_results = list(sess["tasks"].values())

    if not task_results:
        return {
            **sess,
            "overall_score": 0,
            "overall_label": "Low",
            "summary": "No tasks completed yet."
        }

    scores = [t["stress"]["score"] for t in task_results]
    overall = round(sum(scores) / len(scores), 4)

    if overall <= 0.33:
        overall_label = "Low"
    elif overall <= 0.66:
        overall_label = "Medium"
    else:
        overall_label = "High"

    return {
        **sess,
        "task_results": task_results,
        "overall_score": overall,
        "overall_label": overall_label,
        "summary": generate_insight(overall, task_results),
    }

@app.get("/health")
def health():
    return {"status": "ok"}