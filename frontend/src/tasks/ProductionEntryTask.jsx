import React, { useEffect, useRef, useState } from "react";

export default function ProductionEntryTask({ level, onComplete }) {
  const [target] = useState(120);
  const [actual] = useState(100);
  const [workers] = useState(5);
  const [hours] = useState(8);

  const [effInput, setEffInput] = useState("");
  const [prodInput, setProdInput] = useState("");

  const [timeLeft, setTimeLeft] = useState(null);

  const [errorCount, setErrorCount] = useState(0);
  const [correct, setCorrect] = useState(false);

  // 🔥 NEW METRICS
  const [corrections, setCorrections] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const startTimeRef = useRef(Date.now());
  const firstAttemptRef = useRef(null);

  const timerRef = useRef(null);

  // 👉 FORMULAS
  const efficiency = (actual / target) * 100;
  const productivity = actual / (workers * hours);

  // ⏱ TIMER
  useEffect(() => {
    let initialTime = null;

    if (level.key === "medium") initialTime = 20;
    else if (level.key === "hard") initialTime = 15;

    setTimeLeft(initialTime);

    if (initialTime !== null) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            finishTask(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(timerRef.current);
  }, [level.key]);

  // 🎯 CHECK ANSWER
  const checkAnswer = () => {
    const eff = parseFloat(effInput);
    const prod = parseFloat(prodInput);

    const effRounded = parseFloat(efficiency.toFixed(1));
    const prodRounded = parseFloat(productivity.toFixed(1));

    // track attempts
    setAttempts((prev) => prev + 1);

    // first attempt time
    if (!firstAttemptRef.current) {
      firstAttemptRef.current = Date.now() - startTimeRef.current;
    }

    if (eff === effRounded && prod === prodRounded) {
      setCorrect(true);
      clearInterval(timerRef.current);
      finishTask(true);
    } else {
      setErrorCount((prev) => prev + 1);
      alert("❌ Wrong! Try again.");
    }
  };

  const finishTask = (isCorrect) => {
    const totalTime =
      level.key === "medium" ? 20 :
      level.key === "hard" ? 15 : 0;

    const timeTaken =
      timeLeft !== null ? totalTime - timeLeft : 0;

    const submitAttempts = attempts + (isCorrect ? 1 : 0);

    const result = {
      task_id: 4,
      level: level.key,

      // ORIGINAL
      efficiency: parseFloat(efficiency.toFixed(2)),
      productivity: parseFloat(productivity.toFixed(2)),
      errors: errorCount,
      completed: isCorrect,
      time_taken: timeTaken,

      // 🔥 NEW ADVANCED METRICS
      wrong_submits: errorCount,
      submit_attempts_total: submitAttempts,
      first_attempt_time: firstAttemptRef.current
        ? (firstAttemptRef.current / 1000).toFixed(2)
        : null,
      avg_attempt_time:
        submitAttempts > 0 ? (timeTaken / submitAttempts).toFixed(2) : null,
      corrections: corrections,
      input_variability:
        submitAttempts > 0 ? (corrections / submitAttempts).toFixed(2) : null,
      time_to_correct: isCorrect ? timeTaken : null,
      hesitations: 0, // placeholder (can improve later)
    };

    onComplete(result);
  };

  const handleSkip = () => {
    clearInterval(timerRef.current);
    finishTask(false);
  };

  return (
    <div style={styles.wrapper}>
      <h2>📝 Production Entry Task</h2>

      <p><b>Calculate the following:</b></p>

      <div style={styles.box}>
        <p>Target Production: <b>{target}</b></p>
        <p>Actual Production: <b>{actual}</b></p>
        <p>Workers: <b>{workers}</b></p>
        <p>Hours: <b>{hours}</b></p>
      </div>

      <div style={styles.formula}>
        <p>Efficiency = (Actual / Target) × 100</p>
        <p>Productivity = Actual / (Workers × Hours)</p>
      </div>

      {timeLeft !== null && (
        <p style={{ color: "red" }}>⏳ Time Left: {timeLeft}s</p>
      )}

      <div style={styles.inputs}>
        <input
          type="number"
          placeholder="Efficiency"
          value={effInput}
          onChange={(e) => {
            setCorrections((prev) => prev + 1);
            setEffInput(e.target.value);
          }}
        />

        <input
          type="number"
          placeholder="Productivity"
          value={prodInput}
          onChange={(e) => {
            setCorrections((prev) => prev + 1);
            setProdInput(e.target.value);
          }}
        />
      </div>

      <div>
        <button onClick={checkAnswer}>Submit</button>
        <button onClick={handleSkip}>Skip</button>
      </div>

      {correct && <p style={{ color: "green" }}>✅ Correct!</p>}
    </div>
  );
}

// 🎨 UI UNCHANGED
const styles = {
  wrapper: {
    marginTop: 20,
    fontFamily: "Arial",
    textAlign: "center",
  },

  box: {
    border: "1px solid #ccc",
    padding: 10,
    margin: 10,
    display: "inline-block",
  },

  formula: {
    margin: 10,
    fontStyle: "italic",
  },

  inputs: {
    margin: 15,
    display: "flex",
    justifyContent: "center",
    gap: 10,
  },
};