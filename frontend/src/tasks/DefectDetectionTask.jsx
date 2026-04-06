import React, { useEffect, useRef, useState, useCallback } from "react";

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
    return { current: 0, avg: 0, variation: 0, min: 0, max: 0, count: 0 };
  }
  const values = pressureEvents.map((p) => p.pressure);
  const current = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  return {
    current: Number(current.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    variation: Number(std.toFixed(3)),
    min: Number(Math.min(...values).toFixed(3)),
    max: Number(Math.max(...values).toFixed(3)),
    count: values.length,
  };
}

export default function DefectDetectionTask({ level, onComplete, onBehavior }) {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  // FIX 1: Store loaded image in a ref — never reload mid-stroke
  const loadedImageRef = useRef(null);

  // FIX 2: Mirror mutable state in refs so timer closures read live values
  const markedDefectsRef = useRef([]);
  const falseMarksRef = useRef(0);
  const imageStartTimeRef = useRef(Date.now());
  const firstDrawTimeRef = useRef(null);
  const pressureEventsRef = useRef([]);
  const strokeBoxesRef = useRef([]);
  const timeUpRef = useRef(false);
  const pointerTypeRef = useRef("unknown");
  const imageIdxRef = useRef(0);

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
  const [wrongClassification, setWrongClassification] = useState(null); // stores the wrong answer they picked

  const [pointerType, setPointerType] = useState("unknown");
  const [pressureEvents, setPressureEvents] = useState([]);
  const [livePressure, setLivePressure] = useState(0);

  const currentItem = DEFECT_TASK_DATA[level.key][imageIdx];
  const defects = currentItem.defects;
  const totalImages = DEFECT_TASK_DATA[level.key].length;
  const hasMultipleDefects = defects.length > 1;
  const pressureStats = computePressureStats(pressureEvents);

  // ── Canvas draw ───────────────────────────────────────────────────────────

  // FIX 3: Single draw function — uses already-loaded image ref,
  // accepts boxes + live stroke as args so it never reads stale state
  const drawScene = useCallback(
    (boxes, extraStroke = []) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (loadedImageRef.current) {
        ctx.drawImage(loadedImageRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "14px monospace";
        ctx.fillText("Image not found: " + currentItem.image, 16, 36);
      }

      boxes.forEach((box) => {
        ctx.strokeStyle = box.ok ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
      });

      if (extraStroke.length > 1) {
        ctx.beginPath();
        ctx.moveTo(extraStroke[0].x, extraStroke[0].y);
        for (let i = 1; i < extraStroke.length; i++) {
          ctx.lineTo(extraStroke[i].x, extraStroke[i].y);
        }
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.stroke();
      }
    },
    [currentItem.image]
  );

  // Load image whenever item changes, then draw
  useEffect(() => {
    loadedImageRef.current = null;
    const img = new Image();
    img.src = currentItem.image;
    img.onload = () => {
      loadedImageRef.current = img;
      drawScene(strokeBoxesRef.current);
    };
    img.onerror = () => {
      loadedImageRef.current = null;
      drawScene(strokeBoxesRef.current);
    };
  }, [currentItem.image, drawScene]);

  // Redraw when committed boxes change (image already loaded)
  useEffect(() => {
    if (loadedImageRef.current) drawScene(strokeBoxes);
  }, [strokeBoxes, drawScene]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  function resetImageState() {
    setIsDrawing(false);
    setCurrentStroke([]);
    setStrokeBoxes([]);
    setMarkedDefects([]);
    setFalseMarks(0);
    setClassificationOpen(false);
    setActiveDefect(null);
    setWrongClassification(null);
    setPointerType("unknown");
    setPressureEvents([]);
    setLivePressure(0);
    setTimeUp(false);

    // Reset refs immediately so timer closures read fresh values
    markedDefectsRef.current = [];
    falseMarksRef.current = 0;
    strokeBoxesRef.current = [];
    pressureEventsRef.current = [];
    timeUpRef.current = false;
    firstDrawTimeRef.current = null;
    imageStartTimeRef.current = Date.now();
    pointerTypeRef.current = "unknown";
  }

  useEffect(() => {
    imageIdxRef.current = 0;
    setImageIdx(0);
    setImageResults([]);
    resetImageState();
  }, [level.key]);

  // ── Timer ─────────────────────────────────────────────────────────────────

  // FIX 4: Timer reads from refs so stale closure is never an issue
  useEffect(() => {
    clearInterval(timerRef.current);
    timeUpRef.current = false;
    setTimeUp(false);

    let duration = null;
    if (level.key === "medium") duration = 15;
    if (level.key === "hard") duration = 10;

    if (!duration) { setTimeLeft(null); return; }

    setTimeLeft(duration);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timeUpRef.current = true;
          setTimeUp(true);
          // FIX 5: finalizeImageFromRefs reads live refs, not stale closure
          setTimeout(() => finalizeImageFromRefs(), 250);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [imageIdx, level.key]);

  // ── Pointer helpers ───────────────────────────────────────────────────────

  // FIX 6: Scale coordinates for CSS-resized canvas
  function getCanvasPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // FIX 7: Only record pressure on down/move, never on up (pressure = 0 after lift)
  function recordPressure(e) {
    const p = typeof e.pressure === "number" && e.pressure > 0 ? e.pressure : 0.5;
    const pt = e.pointerType || "mouse";
    const point = getCanvasPoint(e);
    pointerTypeRef.current = pt;
    setPointerType(pt);
    setLivePressure(Number(p.toFixed(3)));
    const event = {
  pressure: p,
  timestamp: Date.now() - imageStartTimeRef.current,
  pointerType: pt,
  eventType: e.type,
  x: point.x,
  y: point.y,
};
    pressureEventsRef.current = [...pressureEventsRef.current, event];
    setPressureEvents((prev) => [...prev, event]);
  }

  function handlePointerDown(e) {
    if (classificationOpen || timeUpRef.current) return;
    e.preventDefault();
    recordPressure(e);
    if (firstDrawTimeRef.current === null) {
      firstDrawTimeRef.current = (Date.now() - imageStartTimeRef.current) / 1000;
    }
    setIsDrawing(true);
    setCurrentStroke([getCanvasPoint(e)]);
  }

  function handlePointerMove(e) {
    if (!isDrawing || classificationOpen || timeUpRef.current) return;
    e.preventDefault();
    recordPressure(e);
    const updated = [...currentStroke, getCanvasPoint(e)];
    setCurrentStroke(updated);
    // FIX 8: Pass strokeBoxes from ref — avoids stale state in tight render loop
    drawScene(strokeBoxesRef.current, updated);
  }

  function handlePointerUp(e) {
    if (!isDrawing || classificationOpen || timeUpRef.current) return;
    e.preventDefault();
    // FIX 9: No recordPressure — pressure is always 0 on pointerUp
    setIsDrawing(false);

    if (currentStroke.length < 2) {
      setCurrentStroke([]);
      drawScene(strokeBoxesRef.current);
      return;
    }

    const box = getBoundingBox(currentStroke);
    let matched = null;

    for (const defect of defects) {
      const alreadyMarked = markedDefectsRef.current.find((d) => d.id === defect.id);
      if (!alreadyMarked && pointInsideBox(defect.x, defect.y, box)) {
        matched = defect;
        break;
      }
    }

    const newBox = { ...box, ok: !!matched };
    const updatedBoxes = [...strokeBoxesRef.current, newBox];
    strokeBoxesRef.current = updatedBoxes;
    setStrokeBoxes(updatedBoxes);

    if (matched) {
      const updatedMarked = [
        ...markedDefectsRef.current,
        { id: matched.id, expectedType: matched.type, classificationCorrect: false, classified: false },
      ];
      markedDefectsRef.current = updatedMarked;
      setMarkedDefects(updatedMarked);
      setActiveDefect(matched);
      setClassificationOpen(true);
    } else {
      falseMarksRef.current += 1;
      setFalseMarks(falseMarksRef.current);
    }

    setCurrentStroke([]);
    drawScene(updatedBoxes);
  }

  function handleClassification(selectedType) {
    if (!activeDefect) return;
    const correct = selectedType === activeDefect.type;

    if (correct) {
      const updatedMarked = markedDefectsRef.current.map((d) =>
        d.id === activeDefect.id
          ? { ...d, classified: true, classificationCorrect: true }
          : d
      );
      markedDefectsRef.current = updatedMarked;
      setMarkedDefects(updatedMarked);
      setActiveDefect(null);
      setClassificationOpen(false);
      setWrongClassification(null);
    } else {
      // If timer already ran out, don't keep them stuck — just close
      if (timeUpRef.current) {
        const updatedMarked = markedDefectsRef.current.map((d) =>
          d.id === activeDefect.id
            ? { ...d, classified: true, classificationCorrect: false }
            : d
        );
        markedDefectsRef.current = updatedMarked;
        setMarkedDefects(updatedMarked);
        setActiveDefect(null);
        setClassificationOpen(false);
        setWrongClassification(null);
        return;
      }
      // Wrong — keep modal open, show error, let them try again
      setWrongClassification(selectedType);
    }
  }

  // ── Finalize ──────────────────────────────────────────────────────────────

  // FIX 10: Reads exclusively from refs — safe to call from timer or button
  function finalizeImageFromRefs() {
    const marked = markedDefectsRef.current;
    const falseMks = falseMarksRef.current;
    const pEvents = pressureEventsRef.current;
    // Use imageIdxRef — imageIdx is stale inside timer/callback closures
    const currentIdx = imageIdxRef.current;
    const item = DEFECT_TASK_DATA[level.key][currentIdx];
    const defs = item.defects;

    // Flush this image's stylus events to the parent for /api/behavior
    if (onBehavior && pEvents.length > 0) {
      onBehavior(pEvents);
    }

    const correctClassifications = marked.filter((d) => d.classificationCorrect).length;
    const stats = computePressureStats(pEvents);

    const result = {
      image_index: currentIdx,
      image_path: item.image,
      total_defects: defs.length,
      detected_defects: marked.length,
      missed_defects: defs.length - marked.length,
      false_marks: falseMks,
      correct_classifications: correctClassifications,
      classification_accuracy: defs.length > 0 ? correctClassifications / defs.length : 0,
      detection_accuracy: defs.length > 0 ? marked.length / defs.length : 0,
      time_taken: Number(((Date.now() - imageStartTimeRef.current) / 1000).toFixed(2)),
      first_draw_time: Number((firstDrawTimeRef.current || 0).toFixed(2)),
      multiple: defs.length > 1,
      timed_out: timeUpRef.current,
      pointer_type: pointerTypeRef.current,
      pressure_current: stats.current,
      pressure_avg: stats.avg,
      pressure_variation: stats.variation,
      pressure_min: stats.min,
      pressure_max: stats.max,
      pressure_event_count: stats.count,
    };

    setImageResults((prevResults) => {
      const updated = [...prevResults, result];

      if (currentIdx < totalImages - 1) {
        // Reset per-image state first, then advance index.
        // This ensures the image-load useEffect fires into clean state.
        resetImageState();
        const nextIdx = currentIdx + 1;
        imageIdxRef.current = nextIdx;
        setImageIdx(nextIdx);
      } else {
        const totalDefects = updated.reduce((s, r) => s + r.total_defects, 0);
        const detectedDefects = updated.reduce((s, r) => s + r.detected_defects, 0);
        const missedDefects = updated.reduce((s, r) => s + r.missed_defects, 0);
        const totalFalseMarks = updated.reduce((s, r) => s + r.false_marks, 0);
        const totalCorrectClassifications = updated.reduce((s, r) => s + r.correct_classifications, 0);
        const totalTime = updated.reduce((s, r) => s + r.time_taken, 0);
        const hesitations = updated.filter((r) => r.first_draw_time > 2).length;
        const avgPressure = updated.reduce((s, r) => s + (r.pressure_avg || 0), 0) / updated.length;
        const avgPressureVariation = updated.reduce((s, r) => s + (r.pressure_variation || 0), 0) / updated.length;
        const detectionAccuracy = totalDefects > 0 ? detectedDefects / totalDefects : 0;
        const classificationAccuracy = totalDefects > 0 ? totalCorrectClassifications / totalDefects : 0;
        const finalAccuracy = 0.7 * detectionAccuracy + 0.3 * classificationAccuracy;

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

      return updated;
    });
  }

  function finalizeImage() {
    finalizeImageFromRefs();
  }

  const allDefectsMarked = markedDefects.length === defects.length;
  const danger = timeLeft !== null && timeLeft <= 5;

  return (
    <div style={styles.wrapper}>
      <div style={styles.topRow}>
        <div style={styles.pill}>Image {imageIdx + 1} / {totalImages}</div>
        <div style={styles.pill}>Marked {markedDefects.length} / {defects.length}</div>
        <div style={styles.pillBad}>False marks: {falseMarks}</div>
        {timeLeft !== null && (
          <div style={{ ...styles.timerPill, ...(danger ? styles.timerDanger : {}) }}>
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
              onPointerLeave={handlePointerUp}
            />
          </div>

          <div style={styles.legend}>
            <span><span style={styles.greenDot} /> Correct mark</span>
            <span><span style={styles.redDot} /> Incorrect mark</span>
          </div>
        </div>

        <div style={styles.sidePanel}>
          <div style={styles.sideCard}>
            <div style={styles.sideTitle}>Live Input Metrics</div>
            <div style={styles.metricRow}><span>Pointer</span><strong>{pointerType}</strong></div>
            <div style={styles.metricRow}><span>Current pressure</span><strong>{livePressure}</strong></div>
            <div style={styles.metricRow}><span>Average pressure</span><strong>{pressureStats.avg}</strong></div>
            <div style={styles.metricRow}><span>Pressure variation</span><strong>{pressureStats.variation}</strong></div>
            <div style={styles.metricRow}><span>Min pressure</span><strong>{pressureStats.min}</strong></div>
            <div style={styles.metricRow}><span>Max pressure</span><strong>{pressureStats.max}</strong></div>
            <div style={styles.metricRow}><span>Pressure events</span><strong>{pressureStats.count}</strong></div>
            <div style={styles.noteText}>
              Pen/stylus gives real pressure. Mouse usually provides limited or constant pressure values.
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
            <div style={{
              ...styles.modalBadge,
              ...(wrongClassification ? { background: "#7f1d1d", color: "#fecaca" } : {}),
            }}>
              {wrongClassification ? "Wrong Classification" : "Defect Classification"}
            </div>

            {wrongClassification ? (
              <>
                <h3 style={styles.modalTitle}>That's not right — try again</h3>
                <p style={{ ...styles.modalText, color: "#fca5a5" }}>
                  <strong style={{ color: "#fecaca" }}>{wrongClassification}</strong> is incorrect.
                  Select the correct defect type.
                </p>
              </>
            ) : (
              <>
                <h3 style={styles.modalTitle}>Select the defect type</h3>
                <p style={styles.modalText}>
                  Choose the option that best matches the defect you marked.
                </p>
              </>
            )}

            <div style={styles.optionGrid}>
              {DEFECT_OPTIONS.map((opt) => {
                const isWrong = opt === wrongClassification;
                return (
                  <button
                    key={opt}
                    disabled={isWrong}
                    style={{
                      ...styles.optionButton,
                      ...(isWrong ? {
                        background: "#3f1d1d",
                        borderColor: "#ef4444",
                        color: "#fca5a5",
                        cursor: "not-allowed",
                        opacity: 0.6,
                      } : {}),
                    }}
                    onMouseEnter={(e) => {
                      if (isWrong) return;
                      e.currentTarget.style.background = "#1e293b";
                      e.currentTarget.style.borderColor = "#60a5fa";
                      e.currentTarget.style.color = "#bfdbfe";
                    }}
                    onMouseLeave={(e) => {
                      if (isWrong) return;
                      e.currentTarget.style.background = styles.optionButton.background;
                      e.currentTarget.style.borderColor = "#334155";
                      e.currentTarget.style.color = styles.optionButton.color;
                    }}
                    onClick={() => !isWrong && handleClassification(opt)}
                  >
                    {opt}
                    {isWrong && <span style={{ marginLeft: 6, fontSize: 11 }}>✗</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulseDanger {
          0%   { transform: scale(1);    box-shadow: 0 0 0   rgba(239,68,68,0.0); }
          50%  { transform: scale(1.05); box-shadow: 0 0 16px rgba(239,68,68,0.35); }
          100% { transform: scale(1);    box-shadow: 0 0 0   rgba(239,68,68,0.0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  wrapper: { marginTop: 16 },
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
  leftPane: { flex: "1 1 500px", minWidth: 0 },
  sidePanel: { flex: "0 0 260px", width: 260 },
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
  instructionText: { color: "#e2e8f0", lineHeight: 1.5, fontSize: 14 },
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
    touchAction: "none",
  },
  legend: {
    display: "flex",
    gap: 16,
    marginTop: 10,
    fontSize: 13,
    color: "#94a3b8",
    alignItems: "center",
  },
  greenDot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#22c55e",
    marginRight: 5,
    verticalAlign: "middle",
  },
  redDot: {
    display: "inline-block",
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#ef4444",
    marginRight: 5,
    verticalAlign: "middle",
  },
  sideCard: {
    background: "#111827",
    border: "1px solid #334155",
    borderRadius: 18,
    padding: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  },
  sideTitle: { fontSize: 15, fontWeight: 700, color: "#bfdbfe", marginBottom: 12 },
  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
    borderBottom: "1px solid #1f2937",
    color: "#e5e7eb",
    fontSize: 13,
  },
  noteText: { marginTop: 12, color: "#94a3b8", fontSize: 12, lineHeight: 1.5 },
  buttonRow: { display: "flex", justifyContent: "flex-end", marginTop: 16 },
  nextButton: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px 28px",
    fontSize: 14,
    fontWeight: 700,
    transition: "background 0.15s",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 20,
    padding: "28px 32px",
    maxWidth: 400,
    width: "90%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  },
  modalBadge: {
    display: "inline-block",
    background: "#1d4ed8",
    color: "#bfdbfe",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "4px 10px",
    borderRadius: 6,
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: "#f1f5f9", margin: "0 0 8px" },
  modalText: { fontSize: 13, color: "#94a3b8", marginBottom: 20, lineHeight: 1.5 },
  optionGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  optionButton: {
    background: "#0f172a",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "12px 8px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },
};
