// @ts-check

import { Card } from "../common/Card.js";
import { getCardColors, isValidHexColor } from "../common/color.js";
import { clampValue } from "../common/ops.js";

const DEFAULT_CARD_WIDTH = 495;
const MIN_CARD_WIDTH = 300;
const MAX_CARD_WIDTH = 1000;
const CARD_HEIGHT = 230;

const CHART_LEFT = 45;
const CHART_RIGHT_PADDING = 25;
const CHART_TOP = 8;
const CHART_HEIGHT = 105;

// Group days into weeks once the range is long enough to look noisy.
const WEEKLY_THRESHOLD_DAYS = 60;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * @typedef {import("../fetchers/types").ActivityData} ActivityData
 * @typedef {{ date: string, count: number }} Bucket
 */

/**
 * Sums days into 7-day buckets, aligned so the last bucket ends today.
 * A partial leading bucket is dropped so it doesn't read as a dip.
 *
 * @param {Bucket[]} days Daily counts, oldest first.
 * @returns {Bucket[]} Weekly buckets dated by their first day.
 */
const groupByWeek = (days) => {
  const buckets = [];
  for (let end = days.length; end - 7 >= 0; end -= 7) {
    const week = days.slice(end - 7, end);
    buckets.unshift({
      date: week[0].date,
      count: week.reduce((sum, day) => sum + day.count, 0),
    });
  }
  return buckets;
};

/**
 * Rounds a value up to a "nice" axis maximum (1, 2, 5 x 10^n), even when
 * above 1 so the midpoint gridline lands on a whole number.
 *
 * @param {number} value Largest value on the chart.
 * @returns {number} Axis maximum.
 */
const niceMax = (value) => {
  if (value <= 2) {
    return 2;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= value) || 10;
  const max = step * magnitude;
  return max % 2 === 0 ? max : max * 2;
};

/**
 * Builds a smooth SVG path through the points using monotone cubic
 * interpolation, which never overshoots below zero or above a peak.
 *
 * @param {{ x: number, y: number }[]} points Points, sorted by x.
 * @returns {string} SVG path data.
 */
const monotonePath = (points) => {
  const n = points.length;
  if (n === 1) {
    return `M${points[0].x},${points[0].y}`;
  }

  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push(
      (points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x),
    );
  }

  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    tangents.push(
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2,
    );
  }
  tangents.push(slopes[n - 2]);

  // Fritsch-Carlson adjustment keeps each segment monotone.
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangents[i] = (3 * a * slopes[i]) / h;
      tangents[i + 1] = (3 * b * slopes[i]) / h;
    }
  }

  const fmt = (v) => Math.round(v * 100) / 100;
  let path = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (points[i + 1].x - points[i].x) / 3;
    path += ` C${fmt(points[i].x + dx)},${fmt(points[i].y + tangents[i] * dx)}`;
    path += ` ${fmt(points[i + 1].x - dx)},${fmt(points[i + 1].y - tangents[i + 1] * dx)}`;
    path += ` ${fmt(points[i + 1].x)},${fmt(points[i + 1].y)}`;
  }
  return path;
};

/**
 * Counts consecutive active days ending today. A quiet today doesn't break
 * the streak, since the day isn't over yet.
 *
 * @param {Bucket[]} days Daily counts, oldest first.
 * @returns {number} Current streak in days.
 */
const currentStreak = (days) => {
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) {
    i--;
  }
  let streak = 0;
  while (i >= 0 && days[i].count > 0) {
    streak++;
    i--;
  }
  return streak;
};

/**
 * Formats an ISO date (YYYY-MM-DD) as e.g. "Mar 4".
 *
 * @param {string} date ISO date.
 * @returns {string} Short date.
 */
const shortDate = (date) => {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
};

/**
 * Renders the contribution activity card.
 *
 * @param {ActivityData} activity Activity data.
 * @param {Partial<import("./types").ActivityCardOptions>} options Card options.
 * @returns {string} Activity card SVG.
 */
const renderActivityCard = (activity, options = {}) => {
  const {
    hide_title = false,
    hide_border = false,
    card_width,
    title_color,
    text_color,
    icon_color,
    line_color,
    bg_color,
    border_color,
    border_radius,
    theme = "default",
    custom_title,
    disable_animations = false,
  } = options;

  const width = clampValue(
    card_width || DEFAULT_CARD_WIDTH,
    MIN_CARD_WIDTH,
    MAX_CARD_WIDTH,
  );

  const { titleColor, textColor, iconColor, bgColor, borderColor } =
    getCardColors({
      title_color,
      text_color,
      icon_color,
      bg_color,
      border_color,
      theme,
    });
  const lineColor =
    line_color && isValidHexColor(line_color) ? `#${line_color}` : iconColor;

  const days = activity.days;
  const weekly = days.length > WEEKLY_THRESHOLD_DAYS;
  const buckets = weekly ? groupByWeek(days) : days;

  const chartWidth = width - CHART_LEFT - CHART_RIGHT_PADDING;
  const chartBottom = CHART_TOP + CHART_HEIGHT;
  const peak = buckets.reduce(
    (best, bucket) => (bucket.count > best.count ? bucket : best),
    { date: "", count: 0 },
  );
  const yMax = niceMax(peak.count);

  const xAt = (i) =>
    CHART_LEFT +
    (buckets.length > 1 ? (i / (buckets.length - 1)) * chartWidth : 0);
  const yAt = (count) => chartBottom - (count / yMax) * CHART_HEIGHT;

  const points = buckets.map((bucket, i) => ({
    x: xAt(i),
    y: yAt(bucket.count),
  }));
  const linePath = points.length ? monotonePath(points) : "";
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x},${chartBottom} L${points[0].x},${chartBottom} Z`
    : "";

  const gridlines = [0, yMax / 2, yMax]
    .map(
      (value) => `
      <line x1="${CHART_LEFT}" x2="${CHART_LEFT + chartWidth}" y1="${yAt(value)}" y2="${yAt(value)}" class="grid" />
      <text x="${CHART_LEFT - 8}" y="${yAt(value) + 4}" class="axis" text-anchor="end">${value}</text>`,
    )
    .join("");

  // Weekly charts label each month where it starts; daily charts label every
  // 7th day counting back from today. Labels that would collide are skipped.
  const MIN_LABEL_GAP = 30;
  let lastLabelX = -Infinity;
  let lastMonth = -1;
  const xLabels = buckets
    .map((bucket, i) => {
      const month = Number(bucket.date.split("-")[1]) - 1;
      const x = xAt(i);
      let label = "";
      if (weekly) {
        if (month !== lastMonth && i > 0) {
          label = MONTHS[month];
        }
        lastMonth = month;
      } else if ((buckets.length - 1 - i) % 7 === 0) {
        label = shortDate(bucket.date);
      }
      if (!label || x - lastLabelX < MIN_LABEL_GAP) {
        return "";
      }
      lastLabelX = x;
      return `<text x="${x}" y="${chartBottom + 16}" class="axis" text-anchor="middle">${label}</text>`;
    })
    .join("");

  const peakIndex = buckets.indexOf(peak);
  const peakDot =
    peakIndex >= 0 && peak.count > 0
      ? `<circle cx="${xAt(peakIndex)}" cy="${yAt(peak.count)}" r="3.5" fill="${lineColor}" class="dot" />`
      : "";

  const streak = currentStreak(days);
  const summary = [
    `${activity.total} contributions`,
    peak.count > 0
      ? `best ${weekly ? "week" : "day"}: ${peak.count} (${shortDate(peak.date)})`
      : "",
    `streak: ${streak} ${streak === 1 ? "day" : "days"}`,
  ]
    .filter(Boolean)
    .join("   ·   ");

  const card = new Card({
    customTitle: custom_title,
    defaultTitle: "Contribution Activity",
    width,
    height: CARD_HEIGHT,
    border_radius,
    colors: {
      titleColor,
      textColor,
      iconColor,
      bgColor,
      borderColor,
    },
  });

  if (disable_animations) {
    card.disableAnimations();
  }

  card.setHideBorder(hide_border);
  card.setHideTitle(hide_title);
  card.setAccessibilityLabel({
    title: `${card.title}, ${activity.total} contributions`,
    desc: summary,
  });
  card.setCSS(`
    @keyframes drawLine {
      to { stroke-dashoffset: 0; }
    }
    @keyframes fadeIn {
      to { opacity: 1; }
    }
    .axis {
      font: 400 10px 'Requiem', 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
    }
    .summary {
      font: 400 12px 'Requiem', 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${textColor};
      white-space: pre;
    }
    .grid {
      stroke: ${textColor};
      stroke-opacity: 0.15;
      stroke-dasharray: 3 4;
    }
    .line {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: drawLine 1.6s ease-in-out forwards;
    }
    .area, .dot {
      opacity: 0;
      animation: fadeIn 0.6s ease-in-out 1.2s forwards;
    }
  `);

  return card.render(`
    <defs>
      <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.45" />
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${gridlines}
    ${xLabels}
    <path d="${areaPath}" fill="url(#activity-fill)" class="area" data-testid="activity-area" />
    <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pathLength="1" class="line" data-testid="activity-line" />
    ${peakDot}
    <text x="25" y="${chartBottom + 42}" class="summary" data-testid="activity-summary">${summary}</text>
  `);
};

export { renderActivityCard, groupByWeek, niceMax, currentStreak };
export default renderActivityCard;
