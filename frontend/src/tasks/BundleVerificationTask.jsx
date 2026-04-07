import React, { useEffect, useRef, useState } from "react";

export default function BundleVerificationTask({ level, onComplete }) {

  function getBundles(level) {
    if (level.key === "easy") {
      return {
        expected: { size: "M", shade: "S1", qty: 50 },
        bundles: [
          { id: "A", size: "M", shade: "S1", qty: 50 },
          { id: "B", size: "M", shade: "S1", qty: 40 },
          { id: "C", size: "M", shade: "S2", qty: 50 }
        ]
      };
    }

    if (level.key === "medium") {
      return {
        expected: { size: "M", shade: "S1", qty: 50 },
        bundles: [
          { id: "A", size: "M", shade: "S1", qty: 50 },
          { id: "B", size: "L", shade: "S1", qty: 50 },
          { id: "C", size: "M", shade: "S2", qty: 45 },
          { id: "D", size: "M", shade: "S1", qty: 50 }
        ]
      };
    }

    return {
      expected: { size: "M", shade: "S1", qty: 50 },
      bundles: [
        { id: "A", size: "M", shade: "S1", qty: 48 },
        { id: "B", size: "M", shade: "S2", qty: 50 },
        { id: "C", size: "L", shade: "S2", qty: 45 },
        { id: "D", size: "M", shade: "S1", qty: 50 },
        { id: "E", size: "M", shade: "S1", qty: 50 }
      ]
    };
  }

  const safeLevel = level?.key ? level : { key: "easy" };
  const { expected, bundles } = getBundles(safeLevel);

  function getTimer(level) {
    if (level.key === "easy") return 10;
    if (level.key === "medium") return 12;
    return 5;
  }

  function isWrong(b) {
    return (
      b.qty !== expected.qty ||
      b.shade !== expected.shade ||
      b.size !== expected.size
    );
  }

  const wrongBundles = bundles.filter(isWrong).map(b => b.id);

  const [selected, setSelected] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [wrongSubmits, setWrongSubmits] = useState(0);
  const [timeLeft, setTimeLeft] = useState(getTimer(safeLevel));

  const startTimeRef = useRef(Date.now());
  const firstClickRef = useRef(null);
  const clickTimesRef = useRef([]);
  const timerRef = useRef(null);

  // TIMER RESET
  useEffect(() => {
    clearInterval(timerRef.current);

    startTimeRef.current = Date.now();
    firstClickRef.current = null;
    clickTimesRef.current = [];
    setSelected([]);
    setFeedback(null);

    const duration = getTimer(safeLevel);
    setTimeLeft(duration);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);

  }, [safeLevel.key]);

  // CLICK
  function handleClick(id) {
    if (!firstClickRef.current) {
      firstClickRef.current = Date.now();
    }

    clickTimesRef.current.push(Date.now());

    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  }

  // RESULTS
  function computeResults(timedOut = false) {

    const totalTime = (Date.now() - startTimeRef.current) / 1000;

    const uniqueClicks = [...new Set(selected)];
    const totalClicks = clickTimesRef.current.length;
    const repeatedClicks = totalClicks - uniqueClicks.length;

    const correctSelections = uniqueClicks.filter(id =>
      wrongBundles.includes(id)
    ).length;

    const wrongSelections = uniqueClicks.filter(id =>
      !wrongBundles.includes(id)
    ).length;

    const missedBundles = wrongBundles.length - correctSelections;

    const firstClickTime = firstClickRef.current
      ? (firstClickRef.current - startTimeRef.current) / 1000
      : totalTime;

    const accuracy =
      wrongBundles.length > 0
        ? correctSelections / wrongBundles.length
        : 1;

    // ✅ SAFE DIVISION FIX
    const precision =
      correctSelections / Math.max(1, (correctSelections + wrongSelections));

    const recall =
      correctSelections / Math.max(1, (correctSelections + missedBundles));

    const f1 =
      (2 * precision * recall) / Math.max(0.0001, (precision + recall));

    return {
      accuracy: Number(accuracy.toFixed(4)),
      completion_time: Number(totalTime.toFixed(2)),
      errors: wrongSelections + missedBundles + wrongSubmits,
      hesitations: firstClickTime > 2 ? 1 : 0,
      corrections: totalClicks + wrongSubmits,

      task_metrics: {
        total_bundles: bundles.length,
        wrong_bundles: wrongBundles.length,
        correct_selections: correctSelections,
        wrong_selections: wrongSelections,
        missed_bundles: missedBundles,

        submit_attempts_total: submitAttempts,
        wrong_submits: wrongSubmits,

        total_clicks: totalClicks,
        unique_clicks: uniqueClicks.length,
        repeated_clicks: repeatedClicks,

        first_action_time: Number(firstClickTime.toFixed(2)),

        precision: Number(precision.toFixed(3)),
        recall: Number(recall.toFixed(3)),
        f1_score: Number(f1.toFixed(3)),
        accuracy_percent: Number((accuracy * 100).toFixed(2)),

        timed_out: timedOut
      }
    };
  }

  function handleSubmit() {
    const attempts = submitAttempts + 1;
    setSubmitAttempts(attempts);

    const uniqueClicks = [...new Set(selected)];

    const correct =
      uniqueClicks.length === wrongBundles.length &&
      uniqueClicks.every(id => wrongBundles.includes(id));

    if (correct) {
      clearInterval(timerRef.current);
      setFeedback("correct");

      setTimeout(() => {
        onComplete(computeResults(false));
      }, 400);
    } else {
      setWrongSubmits(prev => prev + 1);
      setFeedback("wrong");
    }
  }

  function handleSkip() {
    clearInterval(timerRef.current);
    setFeedback("skipped");

    setTimeout(() => {
      onComplete(computeResults(false));
    }, 400);
  }

  function handleTimeout() {
    setFeedback("timeout");

    setTimeout(() => {
      onComplete(computeResults(true));
    }, 400);
  }

  return (
    <div style={{ textAlign: "center" }}>

      <h3>
        Expected: Size {expected.size} | Shade {expected.shade} | Qty {expected.qty}
      </h3>

      <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
        {bundles.map(b => (
          <div
            key={b.id}
            onClick={() => handleClick(b.id)}
            style={{
              border: selected.includes(b.id) ? "2px solid red" : "1px solid gray",
              padding: 10,
              cursor: "pointer"
            }}
          >
            <h4>Bundle {b.id}</h4>
            <p>Size: {b.size}</p>
            <p>Shade: {b.shade}</p>
            <p>Qty: {b.qty}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>⏱ {timeLeft}s</div>

      <div style={{ marginTop: 15 }}>
        <button onClick={handleSubmit}>Submit</button>
        <button onClick={handleSkip}>Skip</button>
      </div>

      {feedback === "correct" && <p>Correct</p>}
      {feedback === "wrong" && <p>Wrong — try again</p>}
      {feedback === "skipped" && <p>Skipped</p>}
      {feedback === "timeout" && <p>Time over</p>}
    </div>
  );
}