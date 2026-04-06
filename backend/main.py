from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uuid

app = FastAPI()

# ---------------- CORS ----------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- STORAGE ----------------
sessions = {}

# ---------------- MODELS ----------------

class SessionStart(BaseModel):
    worker_id: Optional[str] = None

class SelfReport(BaseModel):
    stress: float
    fatigue: float
    difficulty: float

class TaskMetrics(BaseModel):
    efficiency: Optional[float] = 100

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

# ---------------- HELPERS ----------------

def normalize(x, max_val):
    return min(1, x / max_val)

def compute_stress(task):
    score = (
        0.3 * normalize(task["errors"], 10) +
        0.3 * normalize(task["completion_time"], 60) +
        0.4 * (1 - normalize(task["accuracy"], 100)) +
        0.1 * normalize(task["hesitations"], 10) +
        0.1 * normalize(task["corrections"], 10)
    )

    # clamp to 1
    score = min(score, 1)

    if score < 0.33:
        label = "Low"
    elif score < 0.66:
        label = "Medium"
    else:
        label = "High"

    return {
        "score": round(score, 3),
        "label": label
    }

# ---------------- API ----------------

@app.post("/api/session/start")
def start_session(body: SessionStart):
    sid = str(uuid.uuid4())
    sessions[sid] = []
    return {"session_id": sid}


@app.post("/api/task-complete")
def task_complete(body: TaskComplete):
    task = body.dict()

    # compute stress
    stress = compute_stress(task)
    task["stress"] = stress

    # store
    if body.session_id not in sessions:
        sessions[body.session_id] = []

    sessions[body.session_id].append(task)

    # ✅ RETURN FULL TASK DATA (IMPORTANT)
    return {
        "task_id": task["task_id"],
        "level": task["level"],
        "stress_score": stress["score"],
        "stress_label": stress["label"],
        "accuracy": task["accuracy"],
        "completion_time": task["completion_time"],
        "errors": task["errors"],
        "hesitations": task["hesitations"],
        "corrections": task["corrections"],
        "self_report": task["self_report"],
        "task_metrics": task.get("task_metrics", {})
    }


@app.get("/api/session/{sid}")
def get_session(sid: str):
    tasks = sessions.get(sid, [])

    if not tasks:
        return {
            "task_results": [],
            "overall_score": 0,
            "overall_label": "Low"
        }

    results = []
    scores = []

    for t in tasks:
        s = t["stress"]["score"]
        scores.append(s)

        results.append({
            "task_id": t["task_id"],
            "level": t["level"],
            "stress_score": t["stress"]["score"],
            "stress_label": t["stress"]["label"],
            "accuracy": t["accuracy"],
            "completion_time": t["completion_time"],
            "errors": t["errors"],
            "hesitations": t["hesitations"],
            "corrections": t["corrections"],
            "self_report": t["self_report"],
            "task_metrics": t.get("task_metrics", {})
        })

    overall = sum(scores) / len(scores)

    if overall < 0.33:
        label = "Low"
    elif overall < 0.66:
        label = "Medium"
    else:
        label = "High"

    return {
        "task_results": results,
        "overall_score": round(overall, 3),
        "overall_label": label
    }