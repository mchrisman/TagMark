import React, { useEffect, useState } from 'react';

function createInitialState(rows, cols) {
  const total = rows * cols;
  const now = performance.now();
  const sensors = new Array(total);
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sensors[idx++] = {
        id: `r${r}c${c}`,
        value: Math.random(),
        trend: 0,
        lastUpdated: now
      };
    }
  }
  return {
    config: {
      rows,
      cols,
      updateRateMs: 50,
      updateFraction: 0.05
    },
    sensors,
    stats: {
      tick: 0,
      lastFrameMs: 0,
      avgFrameMs: 0
    }
  };
}

function colorForValue(v) {
  const t = Math.max(0, Math.min(1, v));
  const r = t < 0.5 ? t * 2 * 255 : 255;
  const g = t < 0.5 ? t * 2 * 255 : (1 - (t - 0.5) * 2) * 255;
  const b = t < 0.5 ? 255 : (1 - (t - 0.5) * 2) * 64;
  return `rgb(${(r | 0)},${(g | 0)},${(b | 0)})`;
}

export function SensorWall() {
  const rows = 80;
  const cols = 80;

  const [state, setState] = useState(() => createInitialState(rows, cols));

  useEffect(() => {
    let lastFrameStart = performance.now();
    const { updateRateMs, updateFraction } = state.config;
    const total = state.sensors.length;
    const countPerTick = Math.max(1, Math.floor(updateFraction * total));

    const intervalId = setInterval(() => {
      const t0 = performance.now();

      setState(prev => {
        const sensors = prev.sensors.slice();
        for (let i = 0; i < countPerTick; i++) {
          const idx = (Math.random() * sensors.length) | 0;
          const cell = sensors[idx];
          const old = cell.value;
          const next = Math.random();
          // mutate copy (OK, it's a fresh array)
          cell.value = next;
          cell.trend = next - old;
          cell.lastUpdated = t0;
        }

        const t1 = performance.now();
        const frameMs = t1 - lastFrameStart;
        lastFrameStart = t1;

        const tick = prev.stats.tick + 1;
        const lastFrameMs = frameMs;
        const avgFrameMs =
          prev.stats.avgFrameMs === 0
            ? frameMs
            : prev.stats.avgFrameMs * 0.9 + frameMs * 0.1;

        return {
          ...prev,
          sensors,
          stats: {
            tick,
            lastFrameMs,
            avgFrameMs
          }
        };
      });
    }, updateRateMs);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  const { config, sensors, stats } = state;
  const totalCols = config.cols;

  return (
    <div className="page">
      <h2>React Sensor Wall Benchmark</h2>

      <div className="controls">
        <div>
          <span className="label">Grid:</span>
          {' '}
          {config.rows} × {config.cols}
          {' '}&nbsp;|&nbsp;{' '}
          <span className="label">Tick interval:</span>
          {' '}
          {config.updateRateMs} ms
          {' '}&nbsp;|&nbsp;{' '}
          <span className="label">Mutated per tick:</span>
          {' '}
          {Math.round(config.updateFraction * 100)}%
        </div>
        <div>
          <span className="label">Tick:</span>
          {' '}
          {stats.tick}
          {' '}&nbsp;|&nbsp;{' '}
          <span className="label">Last frame:</span>
          {' '}
          {stats.lastFrameMs.toFixed(2)} ms
          {' '}&nbsp;|&nbsp;{' '}
          <span className="label">Avg frame:</span>
          {' '}
          {stats.avgFrameMs.toFixed(2)} ms
        </div>
      </div>

      <div className="legend">
        ⚠️ &gt; 0.8 &nbsp;&nbsp; ⬇️ &lt; 0.2 &nbsp;&nbsp; • otherwise
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${totalCols}, 1fr)`
        }}
      >
        {sensors.map(cell => {
          const v = cell.value;
          const bg = colorForValue(v);
          const opacity = 0.4 + 0.6 * Math.min(1, Math.abs(cell.trend) * 4);

          let icon = '•';
          if (v > 0.8) icon = '⚠️';
          else if (v < 0.2) icon = '⬇️';

          const title =
            `ID: ${cell.id}\n` +
            `Value: ${v.toFixed(3)}\n` +
            `Trend: ${cell.trend.toFixed(3)}\n` +
            `Last: ${Math.round(cell.lastUpdated)} ms`;

          return (
            <div
              key={cell.id}
              className="cell"
              style={{ backgroundColor: bg, opacity }}
              title={title}
            >
              <div
                className="bar"
                style={{ transform: `scaleY(${Math.max(0.05, v)})` }}
              />
              <div className="val">
                {v.toFixed(2)}
              </div>
              <div className="icon">
                {icon}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
