import React, { useEffect, useRef, useState } from "react";

const DEFECT_OPTIONS = [
  "Hole / Tear",
  "Stain / Spot",
  "Stitching Issue",
  "Color Defect",
];

const DEFECT_TASK_DATA = {
  easy: [
    {
      image: "/images/easy1.png",
      defects: [{ id: "e1_d1", x: 257, y: 130, type: "Stitching Issue" }],
    },
    {
      image: "/images/easy2.png",
      defects: [{ id: "e2_d1", x: 218, y: 129, type: "Stain / Spot" }],
    },
  ],
  medium: [
    {
      image: "/images/med1.png",
      defects: [{ id: "m1_d1", x: 229, y: 176, type: "Hole / Tear" }],
    },
    {
      image: "/images/med2.png",
      defects: [
        { id: "m2_d1", x: 114, y: 82, type: "Color Defect" },
        { id: "m2_d2", x: 336, y: 201, type: "Color Defect" },
      ],
    },
  ],
  hard: [
    {
      image: "/images/hard1.png",
      defects: [{ id: "h1_d1", x: 331, y: 152, type: "Stain / Spot" }],
    },
    {
      image: "/images/hard2.png",
      defects: [{ id: "h2_d1", x: 263, y: 146, type: "Hole / Tear" }],
    },
  ],
};

function getBoundingBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function pointInsideBox(x, y, box) {
  const pad = 10;
  return (
    x >= box.minX - pad &&
    x <= box.maxX + pad &&
    y >= box.minY - pad &&
    y <= box.maxY + pad
  );
}

function computePressureStats(pressureEvents) {
  if (!pressureEvents.length) {
    return {
      current: 0,
      avg: 0,
      variation: 0,
      min: 0,
      max: 0,
      count: 0,
    };
  }

  const values = pressureEvents.map((p) => p.pressure);
  const current = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    current: Number(current.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    variation: Number(std.toFixed(3)),
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    count: values.length,
  };
}

export default function DefectDetectionTask({ level, onComplete }) {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  const [timeLeft, setTimeLeft] = useState(null);
  const [timeUp, setTimeUp] = useState(false);

  const [imageIdx, setImageIdx] = useState(0);
  const [imageResults, setImageResults] = useState([]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [strokeBoxes, setStrokeBoxes] = useState([]);

  const [markedDefects, setMarkedDefects] = useState([]);
  const [falseMarks, setFalseMarks] = useState(0);

  const [classificationOpen, setClassificationOpen] = useState(false);
  const [activeDefect, setActiveDefect] = useState(null);

  const [imageStartTime, setImageStartTime] = useState(Date.now());
  const [firstDrawTime, setFirstDrawTime] = useState(null);

  // Live pressure / pointer side panel
  const [pointerType, setPointerType] = useState("unknown");
  const [pressureEvents, setPressureEvents] = useState([]);
  const [livePressure, setLivePressure] = useState(0);

  const currentItem = DEFECT_TASK_DATA[level.key][imageIdx];
  const defects = currentItem.defects;
  const totalImages = DEFECT_TASK_DATA[level.key].length;
  const hasMultipleDefects = defects.length > 1;

  const pressureStats = computePressureStats(pressureEvents);

  useEffect(() => {
    setImageIdx(0);
    setImageResults([]);
    resetImageState();
  }, [level.key]);

  useEffect(() => {
    drawBaseImage();
  }, [level.key, imageIdx]);

  useEffect(() => {
    setupTimer();
    return () => clearInterval(timerRef.current);
  }, [imageIdx, level.key]);

  function setupTimer() {
    clearInterval(timerRef.current);
    setTimeUp(false);

    let duration = null;
    if (level.key === "medium") duration = 15;
    if (level.key === "hard") duration = 10;

    if (!duration) {
      setTimeLeft(null);
      return;
    }

    setTimeLeft(duration);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimeUp(true);
          setTimeout(() => finalizeImage(), 250);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function resetImageState() {
    setIsDrawing(false);
    setCurrentStroke([]);
    setStrokeBoxes([]);
    setMarkedDefects([]);
    setFalseMarks(0);
    setClassificationOpen(false);
    setActiveDefect(null);
    setImageStartTime(Date.now());
    setFirstDrawTime(null);

    setPointerType("unknown");
    setPressureEvents([]);
    setLivePressure(0);
  }

  function drawBaseImage() {
    const canvas = canvasRef.current;
    if (!canvas || !currentItem) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.src = currentItem.image;

    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      redrawOverlays();
    };

    img.onerror = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e5e7eb";
      ctx.font = "16px Arial";
      ctx.fillText("Image not found: " + currentItem.image, 20, 40);
      redrawOverlays();
    };
  }

  function redrawOverlays(extraStroke = []) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    strokeBoxes.forEach((box) => {
      ctx.strokeStyle = box.ok ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(
        box.minX,
        box.minY,
        box.maxX - box.minX,
        box.maxY - box.minY
      );
    });

    if (extraStroke.length > 1) {
      ctx.beginPath();
      ctx.moveTo(extraStroke[0].x, extraStroke[0].y);
      for (let i = 1; i < extraStroke.length; i++) {
        ctx.lineTo(extraStroke[i].x, extraStroke[i].y);
      }
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  function getCanvasPoint(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function recordPressure(e) {
    const p =
      typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 0.5;

    setPointerType(e.pointerType || "mouse");
    setLivePressure(Number(p.toFixed(3)));
    setPressureEvents((prev) => [
      ...prev,
      {
        pressure: p,
        timestamp: Date.now() - imageStartTime,
        pointerType: e.pointerType || "mouse",
      },
    ]);
  }

  function handlePointerDown(e) {
    if (classificationOpen || timeUp) return;

    recordPressure(e);

    if (firstDrawTime === null) {
      setFirstDrawTime((Date.now() - imageStartTime) / 1000);
    }

    setIsDrawing(true);
    setCurrentStroke([getCanvasPoint(e)]);
  }

  function handlePointerMove(e) {
    if (!isDrawing || classificationOpen || timeUp) return;

    recordPressure(e);

    const updated = [...currentStroke, getCanvasPoint(e)];
    setCurrentStroke(updated);
    drawBaseImage();
    redrawOverlays(updated);
  }

  function handlePointerUp(e) {
    if (!isDrawing || classificationOpen || timeUp) return;

    recordPressure(e);

    setIsDrawing(false);

    if (currentStroke.length < 2) {
      setCurrentStroke([]);
      drawBaseImage();
      return;
    }

    const box = getBoundingBox(currentStroke);
    let matched = null;

    for (const defect of defects) {
      const alreadyMarked = markedDefects.find((d) => d.id === defect.id);
      if (!alreadyMarked && pointInsideBox(defect.x, defect.y, box)) {
        matched = defect;
        break;
      }
    }

    const newBox = { ...box, ok: !!matched };
    setStrokeBoxes((prev) => [...prev, newBox]);

    if (matched) {
      setMarkedDefects((prev) => [
        ...prev,
        {
          id: matched.id,
          expectedType: matched.type,
          classificationCorrect: false,
          classified: false,
        },
      ]);
      setActiveDefect(matched);
      setClassificationOpen(true);
    } else {
      setFalseMarks((prev) => prev + 1);
    }

    setCurrentStroke([]);
    setTimeout(drawBaseImage, 0);
  }

  function handleClassification(selectedType) {
    if (!activeDefect) return;

    setMarkedDefects((prev) =>
      prev.map((d) =>
        d.id === activeDefect.id
          ? {
              ...d,
              classified: true,
              classificationCorrect: selectedType === d.expectedType,
            }
          : d
      )
    );

    setActiveDefect(null);
    setClassificationOpen(false);
  }

  function finalizeImage() {
    const correctClassifications = markedDefects.filter(
      (d) => d.classificationCorrect
    ).length;

    const stats = computePressureStats(pressureEvents);

    const result = {
      image_index: imageIdx,
      image_path: currentItem.image,
      total_defects: defects.length,
      detected_defects: markedDefects.length,
      missed_defects: defects.length - markedDefects.length,
      false_marks: falseMarks,
      correct_classifications: correctClassifications,
      classification_accuracy:
        defects.length > 0 ? correctClassifications / defects.length : 0,
      detection_accuracy:
        defects.length > 0 ? markedDefects.length / defects.length : 0,
      time_taken: Number(((Date.now() - imageStartTime) / 1000).toFixed(2)),
      first_draw_time: Number((firstDrawTime || 0).toFixed(2)),
      multiple: hasMultipleDefects,
      timed_out: timeUp,
      pointer_type: pointerType,
      pressure_current: stats.current,
      pressure_avg: stats.avg,
      pressure_variation: stats.variation,
      pressure_min: stats.min,
      pressure_max: stats.max,
      pressure_event_count: stats.count,
    };

    const updated = [...imageResults, result];
    setImageResults(updated);

    if (imageIdx < totalImages - 1) {
      setImageIdx((prev) => prev + 1);
      setTimeout(() => resetImageState(), 0);
    } else {
      const totalDefects = updated.reduce((sum, r) => sum + r.total_defects, 0);
      const detectedDefects = updated.reduce(
        (sum, r) => sum + r.detected_defects,
        0
      );
      const missedDefects = updated.reduce(
        (sum, r) => sum + r.missed_defects,
        0
      );
      const totalFalseMarks = updated.reduce(
        (sum, r) => sum + r.false_marks,
        0
      );
      const totalCorrectClassifications = updated.reduce(
        (sum, r) => sum + r.correct_classifications,
        0
      );
      const totalTime = updated.reduce((sum, r) => sum + r.time_taken, 0);
      const hesitations = updated.filter((r) => r.first_draw_time > 2).length;

      const avgPressure =
        updated.reduce((sum, r) => sum + (r.pressure_avg || 0), 0) /
        updated.length;

      const avgPressureVariation =
        updated.reduce((sum, r) => sum + (r.pressure_variation || 0), 0) /
        updated.length;

      const detectionAccuracy =
        totalDefects > 0 ? detectedDefects / totalDefects : 0;
      const classificationAccuracy =
        totalDefects > 0 ? totalCorrectClassifications / totalDefects : 0;
      const finalAccuracy =
        0.7 * detectionAccuracy + 0.3 * classificationAccuracy;

      onComplete({
        accuracy: Number(finalAccuracy.toFixed(4)),
        completion_time: Number(totalTime.toFixed(2)),
        errors: totalFalseMarks + missedDefects,
        hesitations,
        corrections: 0,
        task_metrics: {
          total_images: updated.length,
          total_defects: totalDefects,
          detected_defects: detectedDefects,
          missed_defects: missedDefects,
          false_clicks: totalFalseMarks,
          detection_accuracy: Number(detectionAccuracy.toFixed(4)),
          classification_accuracy: Number(classificationAccuracy.toFixed(4)),
          avg_image_time: Number((totalTime / updated.length).toFixed(4)),
          avg_pressure: Number(avgPressure.toFixed(4)),
          avg_pressure_variation: Number(avgPressureVariation.toFixed(4)),
          image_results: updated,
        },
      });
    }
  }

  const allDefectsMarked = markedDefects.length === defects.length;
  const danger = timeLeft !== null && timeLeft <= 5;

  return (
    <div style={styles.wrapper}>
      <div style={styles.topRow}>
        <div style={styles.pill}>Image {imageIdx + 1} / {totalImages}</div>
        <div style={styles.pill}>
          Marked {markedDefects.length} / {defects.length}
        </div>
        <div style={styles.pillBad}>False marks: {falseMarks}</div>

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

      <div style={styles.mainRow}>
        <div style={styles.leftPane}>
          <div style={styles.instructionCard}>
            <div style={styles.instructionTitle}>Instruction</div>
            <div style={styles.instructionText}>
              {hasMultipleDefects
                ? "This image contains multiple defects. Draw around both defects and classify each one."
                : "Draw around the visible defect and then classify it."}
            </div>
          </div>

          <div style={styles.canvasCard}>
            <canvas
              ref={canvasRef}
              width={420}
              height={280}
              style={{
                ...styles.canvas,
                cursor: timeUp ? "not-allowed" : "crosshair",
                opacity: timeUp ? 0.9 : 1,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>

          <div style={styles.legend}>
            <span>
              <span style={styles.greenDot} />
              Correct mark
            </span>
            <span>
              <span style={styles.redDot} />
              Incorrect mark
            </span>
          </div>
        </div>

        <div style={styles.sidePanel}>
          <div style={styles.sideCard}>
            <div style={styles.sideTitle}>Live Input Metrics</div>

            <div style={styles.metricRow}>
              <span>Pointer</span>
              <strong>{pointerType}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Current pressure</span>
              <strong>{livePressure}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Average pressure</span>
              <strong>{pressureStats.avg}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Pressure variation</span>
              <strong>{pressureStats.variation}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Min pressure</span>
              <strong>{pressureStats.min}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Max pressure</span>
              <strong>{pressureStats.max}</strong>
            </div>
            <div style={styles.metricRow}>
              <span>Pressure events</span>
              <strong>{pressureStats.count}</strong>
            </div>

            <div style={styles.noteText}>
              Pen/stylus gives real pressure. Mouse usually provides limited or
              constant pressure values.
            </div>
          </div>
        </div>
      </div>

      <div style={styles.buttonRow}>
        <button
          style={{
            ...styles.nextButton,
            opacity: classificationOpen ? 0.65 : 1,
            cursor: classificationOpen ? "not-allowed" : "pointer",
          }}
          disabled={classificationOpen}
          onClick={finalizeImage}
        >
          {imageIdx === totalImages - 1
            ? "Finish Level"
            : hasMultipleDefects && !allDefectsMarked
            ? "Skip Remaining and Continue"
            : "Next Image"}
        </button>
      </div>

      {classificationOpen && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <div style={styles.badge}>Defect Classification</div>
            <h3 style={styles.modalTitle}>Select the defect type</h3>
            <p style={styles.modalText}>
              Choose the option that best matches the defect you marked.
            </p>

            <div style={styles.optionGrid}>
              {DEFECT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  style={styles.optionButton}
                  onClick={() => handleClassification(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
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
  mainRow: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  leftPane: {
    flex: "1 1 500px",
    minWidth: 0,
  },
  sidePanel: {
    flex: "0 0 260px",
    width: 260,
  },
  pill: {
    background: "#1e293b",
    color: "#e2e8f0",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
  },
  pillBad: {
    background: "#3f1d1d",
    color: "#fecaca",
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
  instructionCard: {
    background: "linear-gradient(135deg, #172554, #1e293b)",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#bfdbfe",
    marginBottom: 6,
  },
  instructionText: {
    color: "#e2e8f0",
    lineHeight: 1.5,
    fontSize: 14,
  },
  canvasCard: {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  canvas: {
    display: "block",
    margin: "0 auto",
    borderRadius: 14,
    border: "1px solid #475569",
    background: "#0f172a",
    maxWidth: "100%",
  },
  sideCard: {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  sideTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "#bfdbfe",
    marginBottom: 12,
  },
  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid #1f2937",
    color: "#e5e7eb",
    fontSize: 13,
  },
  noteText: {
    marginTop: 12,
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 1.5
  }
}

  