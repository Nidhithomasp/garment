import React, { useEffect, useMemo, useRef, useState } from "react";

const LABEL_TASK_DATA = {
  easy: [
    {
      id: "easy_q1",
      reference: {
        sku: "GRM-2024-009",
        size: "M",
        color: "Navy",
        batch: "B-441",
        qty: "48",
      },
      label: {
        sku: "GRM-2024-009",
        size: "M",
        color: "Navy",
        batch: "B-441",
        qty: "52",
      },
    },
    {
      id: "easy_q2",
      reference: {
        sku: "GRM-2024-015",
        size: "L",
        color: "Black",
        batch: "C-210",
        qty: "36",
      },
      label: {
        sku: "GRM-2024-015",
        size: "M",
        color: "Black",
        batch: "C-210",
        qty: "36",
      },
    },
  ],

  medium: [
    {
      id: "med_q1",
      reference: {
        sku: "GRM-2024-021",
        size: "S",
        color: "Olive",
        batch: "D-118",
        qty: "24",
      },
      label: {
        sku: "GRM-2024-021",
        size: "M",
        color: "Olive",
        batch: "D-119",
        qty: "24",
      },
    },
    {
      id: "med_q2",
      reference: {
        sku: "GRM-2024-030",
        size: "XL",
        color: "Maroon",
        batch: "E-502",
        qty: "60",
      },
      label: {
        sku: "GRM-2024-030",
        size: "XL",
        color: "Maroon",
        batch: "E-502",
        qty: "60",
      },
    },
  ],

  hard: [
    {
      id: "hard_q1",
      reference: {
        sku: "GRM-2024-041",
        size: "M",
        color: "Teal",
        batch: "F-611",
        qty: "42",
      },
      label: {
        sku: "GRM-2024-041",
        size: "L",
        color: "Teel",
        batch: "F-611",
        qty: "24",
      },
    },
    {
      id: "hard_q2",
      reference: {
        sku: "GRM-2024-052",
        size: "XS",
        color: "Beige",
        batch: "G-703",
        qty: "18",
      },
      label: {
        sku: "GRM-2024-052",
        size: "S",
        color: "Beige",
        batch: "G-730",
        qty: "18",
      },
    },
  ],
};

const FIELD_ORDER = [
  { key: "sku", label: "SKU" },
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "batch", label: "Batch" },
  { key: "qty", label: "Qty" },
];

function countMismatches(reference, label) {
  return FIELD_ORDER.reduce(
    (count, f) => count + (reference[f.key] !== label[f.key] ? 1 : 0),
    0
  );
}

export default function LabelCheckingTask({ level, onComplete }) {
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const firstActionTimeRef = useRef(null);

  const questions = LABEL_TASK_DATA[level.key];
  const totalQuestions = questions.length;

  const [questionIdx, setQuestionIdx] = useState(0);
  const [questionResults, setQuestionResults] = useState([]);

  const currentQuestion = questions[questionIdx];
  const [labelState, setLabelState] = useState({ ...currentQuestion.label });
  const [editingField, setEditingField] = useState(null);

  const [timeLeft, setTimeLeft] = useState(null);
  const [feedback, setFeedback] = useState(null); // correct | wrong | skipped | timeout
  const [noMismatchSelected, setNoMismatchSelected] = useState(false);

  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [wrongSubmits, setWrongSubmits] = useState(0);
  const [editedFields, setEditedFields] = useState(new Set());
  const [changeCount, setChangeCount] = useState(0);

  const mismatchCount = useMemo(
    () => countMismatches(currentQuestion.reference, currentQuestion.label),
    [currentQuestion]
  );

  useEffect(() => {
    loadQuestion(questionIdx);
    return () => clearInterval(timerRef.current);
  }, [questionIdx, level.key]);

  function loadQuestion(idx) {
    clearInterval(timerRef.current);

    const q = questions[idx];
    setLabelState({ ...q.label });
    setEditingField(null);
    setFeedback(null);
    setNoMismatchSelected(false);
    setSubmitAttempts(0);
    setWrongSubmits(0);
    setEditedFields(new Set());
    setChangeCount(0);

    startTimeRef.current = Date.now();
    firstActionTimeRef.current = null;

    let duration = null;
    if (level.key === "medium") duration = 20;
    if (level.key === "hard") duration = 25;

    if (!duration) {
      setTimeLeft(null);
      return;
    }

    setTimeLeft(duration);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function markFirstAction() {
    if (firstActionTimeRef.current === null) {
      firstActionTimeRef.current = (Date.now() - startTimeRef.current) / 1000;
    }
  }

  function handleEditClick(fieldKey) {
    markFirstAction();
    setEditingField(fieldKey);
    setNoMismatchSelected(false);
  }

  function handleFieldChange(fieldKey, value) {
    markFirstAction();
    setLabelState((prev) => ({ ...prev, [fieldKey]: value }));
    setNoMismatchSelected(false);

    setEditedFields((prev) => {
      const next = new Set(prev);
      next.add(fieldKey);
      return next;
    });
    setChangeCount((prev) => prev + 1);
  }

  function handleNoMismatch() {
    markFirstAction();
    setNoMismatchSelected((prev) => !prev);
    setEditingField(null);
  }

  function isExactMatch(reference, label) {
    return FIELD_ORDER.every((f) => reference[f.key] === label[f.key]);
  }

  function saveResultAndMove(result) {
    const updated = [...questionResults, result];
    setQuestionResults(updated);

    if (questionIdx < totalQuestions - 1) {
      setQuestionIdx((prev) => prev + 1);
    } else {
      finalizeLevel(updated);
    }
  }

  function handleSubmit() {
    markFirstAction();
    setSubmitAttempts((prev) => prev + 1);

    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    const correct = isExactMatch(currentQuestion.reference, labelState);

    if (correct) {
      clearInterval(timerRef.current);
      setFeedback("correct");

      const result = {
        question_id: currentQuestion.id,
        mismatch_count_initial: mismatchCount,
        final_correct: true,
        skipped: false,
        timed_out: false,
        no_mismatch_selected: noMismatchSelected,
        submit_attempts: submitAttempts + 1,
        wrong_submits: wrongSubmits,
        edited_fields_count: editedFields.size,
        total_edits: changeCount,
        first_action_time: Number((firstActionTimeRef.current || 0).toFixed(2)),
        time_taken: Number(elapsed.toFixed(2)),
      };

      setTimeout(() => saveResultAndMove(result), 700);
    } else {
      setWrongSubmits((prev) => prev + 1);
      setFeedback("wrong");
    }
  }

  function handleSkip() {
    clearInterval(timerRef.current);
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    setFeedback("skipped");

    const result = {
      question_id: currentQuestion.id,
      mismatch_count_initial: mismatchCount,
      final_correct: false,
      skipped: true,
      timed_out: false,
      no_mismatch_selected: noMismatchSelected,
      submit_attempts,
      wrong_submits: wrongSubmits,
      edited_fields_count: editedFields.size,
      total_edits: changeCount,
      first_action_time: Number((firstActionTimeRef.current || 0).toFixed(2)),
      time_taken: Number(elapsed.toFixed(2)),
    };

    setTimeout(() => saveResultAndMove(result), 500);
  }

  function handleTimeout() {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    setFeedback("timeout");

    const result = {
      question_id: currentQuestion.id,
      mismatch_count_initial: mismatchCount,
      final_correct: false,
      skipped: false,
      timed_out: true,
      no_mismatch_selected: noMismatchSelected,
      submit_attempts,
      wrong_submits: wrongSubmits,
      edited_fields_count: editedFields.size,
      total_edits: changeCount,
      first_action_time: Number((firstActionTimeRef.current || 0).toFixed(2)),
      time_taken: Number(elapsed.toFixed(2)),
    };

    setTimeout(() => saveResultAndMove(result), 500);
  }

  function finalizeLevel(results) {
    const total = results.length;
    const correctCount = results.filter((r) => r.final_correct).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const timeoutCount = results.filter((r) => r.timed_out).length;
    const wrongSubmitTotal = results.reduce((s, r) => s + r.wrong_submits, 0);
    const totalTime = results.reduce((s, r) => s + r.time_taken, 0);
    const hesitations = results.filter((r) => r.first_action_time > 2).length;
    const totalEdits = results.reduce((s, r) => s + r.total_edits, 0);

    const accuracy = total > 0 ? correctCount / total : 0;

    onComplete({
      accuracy: Number(accuracy.toFixed(4)),
      completion_time: Number(totalTime.toFixed(2)),
      errors: total - correctCount + wrongSubmitTotal,
      hesitations,
      corrections: totalEdits,
      task_metrics: {
        total_questions: total,
        correct_answers: correctCount,
        skipped_questions: skippedCount,
        timed_out_questions: timeoutCount,
        wrong_submits: wrongSubmitTotal,
        avg_question_time: Number((totalTime / total).toFixed(4)),
        question_results: results,
      },
    });
  }

  const danger = timeLeft !== null && timeLeft <= 5;

  return (
    <div style={styles.wrapper}>
      <div style={styles.topRow}>
        <div style={styles.pill}>
          Question {questionIdx + 1} / {totalQuestions}
        </div>
        <div style={styles.pill}>Level: {level.label}</div>
        {timeLeft !== null && (
          <div
            style={{
              ...styles.timerPill,
              ...(danger ? styles.timerDanger : {}),
            }}
          >
            ⏱ {timeLeft}s
          </div>
        )}
      </div>

      <div style={styles.noteBox}>
        Compare the reference details with the garment label. Do not assume an
        error exists. Edit only if needed, then click Submit.
      </div>

      <div style={styles.mainGrid}>
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Reference Details</div>
          {FIELD_ORDER.map((field) => (
            <div key={field.key} style={styles.row}>
              <span style={styles.key}>{field.label}</span>
              <span style={styles.value}>{currentQuestion.reference[field.key]}</span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>Garment Label</div>
          {FIELD_ORDER.map((field) => (
            <div key={field.key} style={styles.row}>
              <span style={styles.key}>{field.label}</span>

              {editingField === field.key ? (
                <input
                  autoFocus
                  value={labelState[field.key]}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditingField(null);
                  }}
                  style={styles.input}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => handleEditClick(field.key)}
                  style={{
                    ...styles.editButton,
                    ...(editedFields.has(field.key) ? styles.editedField : {}),
                  }}
                >
                  {labelState[field.key]}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={styles.actionRow}>
        <button
          type="button"
          onClick={handleNoMismatch}
          style={{
            ...styles.secondaryBtn,
            ...(noMismatchSelected ? styles.activeNoMismatch : {}),
          }}
        >
          No Mismatch
        </button>

        <button type="button" onClick={handleSubmit} style={styles.primaryBtn}>
          Submit
        </button>

        <button type="button" onClick={handleSkip} style={styles.skipBtn}>
          Skip
        </button>
      </div>

      {feedback === "correct" && (
        <div style={{ ...styles.feedback, ...styles.correctFeedback }}>
          Correct — the final label matches the reference.
        </div>
      )}

      {feedback === "wrong" && (
        <div style={{ ...styles.feedback, ...styles.wrongFeedback }}>
          Wrong — the label still does not match the reference. Check again.
        </div>
      )}

      {feedback === "skipped" && (
        <div style={{ ...styles.feedback, ...styles.skipFeedback }}>
          Skipped — moving to the next question.
        </div>
      )}

      {feedback === "timeout" && (
        <div style={{ ...styles.feedback, ...styles.skipFeedback }}>
          Time over — moving to the next question.
        </div>
      )}

      <style>
        {`
          @keyframes pulseDanger {
            0% { transform: scale(1); box-shadow: 0 0 0 rgba(239,68,68,0.0); }
            50% { transform: scale(1.05); box-shadow: 0 0 16px rgba(239,68,68,0.35); }
            100% { transform: scale(1); box-shadow: 0 0 0 rgba(239,68,68,0.0); }
          }
        `}
      </style>
    </div>
  );
}

const styles = {
  wrapper: {
    marginTop: 16,
  },
  topRow: {
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  pill: {
    background: "#1e293b",
    color: "#e2e8f0",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
  },
  timerPill: {
    background: "#111827",
    color: "#facc15",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    border: "1px solid #facc15",
  },
  timerDanger: {
    background: "#ef4444",
    color: "#ffffff",
    border: "1px solid #fecaca",
    animation: "pulseDanger 1s infinite",
  },
  noteBox: {
    background: "#1e293b",
    padding: 14,
    borderRadius: 12,
    color: "#cbd5e1",
    marginBottom: 16,
    textAlign: "center",
    lineHeight: 1.5,
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  panel: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#bfdbfe",
    marginBottom: 12,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "90px 1fr",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  key: {
    color: "#94a3b8",
    fontWeight: 600,
    fontSize: 14,
  },
  value: {
    color: "#f8fafc",
    fontSize: 14,
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: 10,
    padding: "10px 12px",
  },
  editButton: {
    textAlign: "left",
    color: "#f8fafc",
    fontSize: 14,
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "10px 12px",
    cursor: "pointer",
  },
  editedField: {
    border: "1px solid #22c55e",
    boxShadow: "0 0 0 1px rgba(34,197,94,0.25)",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    color: "#f8fafc",
    fontSize: 14,
    background: "#111827",
    border: "1px solid #60a5fa",
    borderRadius: 10,
    padding: "10px 12px",
    outline: "none",
  },
  actionRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
    flexWrap: "wrap",
  },
  primaryBtn: {
    background: "#22c55e",
    color: "#08110b",
    border: "none",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryBtn: {
    background: "#1e293b",
    color: "#f8fafc",
    border: "1px solid #334155",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  activeNoMismatch: {
    background: "#312e81",
    border: "1px solid #818cf8",
    color: "#e0e7ff",
  },
  skipBtn: {
    background: "#374151",
    color: "#f8fafc",
    border: "none",
    padding: "12px 18px",
    borderRadius: 10,
    fontWeight: 700,
    cursor: "pointer",
  },
  feedback: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    textAlign: "center",
    fontWeight: 600,
  },
  correctFeedback: {
    background: "#052e16",
    color: "#bbf7d0",
    border: "1px solid #166534",
  },
  wrongFeedback: {
    background: "#3f1d1d",
    color: "#fecaca",
    border: "1px solid #7f1d1d",
  },
  skipFeedback: {
    background: "#1e293b",
    color: "#cbd5e1",
    border: "1px solid #334155",
  },
};