import { describe, expect, it } from "@jest/globals";
import { queryByTestId } from "@testing-library/dom";
import "@testing-library/jest-dom";
import {
  currentStreak,
  groupByWeek,
  niceMax,
  renderActivityCard,
} from "../src/cards/activity.js";

/**
 * Builds consecutive daily counts ending on 2026-10-10.
 *
 * @param {number[]} counts Daily counts, oldest first.
 * @returns {{ date: string, count: number }[]} Days.
 */
const makeDays = (counts) => {
  const end = Date.UTC(2026, 9, 10);
  return counts.map((count, i) => ({
    date: new Date(end - (counts.length - 1 - i) * 864e5)
      .toISOString()
      .slice(0, 10),
    count,
  }));
};

const sum = (counts) => counts.reduce((a, b) => a + b, 0);

describe("renderActivityCard", () => {
  it("should render the title, line, area and summary", () => {
    const counts = [1, 0, 3, 2, 0, 4, 1, 2, 5, 0];
    document.body.innerHTML = renderActivityCard({
      total: sum(counts),
      days: makeDays(counts),
    });

    expect(queryByTestId(document.body, "header")).toHaveTextContent(
      "Contribution Activity",
    );
    expect(queryByTestId(document.body, "activity-line")).toHaveAttribute("d");
    expect(queryByTestId(document.body, "activity-area")).toHaveAttribute("d");
    expect(queryByTestId(document.body, "activity-summary")).toHaveTextContent(
      "18 contributions · best day: 5 (Oct 9) · streak: 4 days",
    );
  });

  it("should group into weeks for long ranges", () => {
    const counts = Array.from({ length: 70 }, (_, i) => (i % 7 === 0 ? 3 : 1));
    document.body.innerHTML = renderActivityCard({
      total: sum(counts),
      days: makeDays(counts),
    });

    expect(queryByTestId(document.body, "activity-summary")).toHaveTextContent(
      "best week: 9",
    );
  });

  it("should render a flat line with no contributions", () => {
    const counts = Array(30).fill(0);
    document.body.innerHTML = renderActivityCard({
      total: 0,
      days: makeDays(counts),
    });

    expect(queryByTestId(document.body, "activity-summary")).toHaveTextContent(
      "0 contributions · streak: 0 days",
    );
    expect(document.querySelector("circle")).toBeNull();
  });

  it("should support custom title, line color and hidden title", () => {
    const days = makeDays([1, 2, 3]);
    document.body.innerHTML = renderActivityCard(
      { total: 6, days },
      { custom_title: "Commits", line_color: "ff0000" },
    );
    expect(queryByTestId(document.body, "header")).toHaveTextContent("Commits");
    expect(queryByTestId(document.body, "activity-line")).toHaveAttribute(
      "stroke",
      "#ff0000",
    );

    document.body.innerHTML = renderActivityCard(
      { total: 6, days },
      { hide_title: true, line_color: "nope" },
    );
    expect(queryByTestId(document.body, "header")).toBeNull();
    expect(queryByTestId(document.body, "activity-line")).not.toHaveAttribute(
      "stroke",
      "#nope",
    );
  });
});

describe("renderActivityCard extras", () => {
  const days = makeDays([1, 2, 3]);

  it("should tile a known texture under the border", () => {
    document.body.innerHTML = renderActivityCard(
      { total: 6, days },
      { texture: "metal" },
    );
    expect(document.querySelector("#bg-texture image")).toHaveAttribute(
      "href",
      expect.stringMatching(/^data:image\/jpeg;base64,/),
    );
    expect(queryByTestId(document.body, "card-bg")).toHaveAttribute(
      "fill",
      "none",
    );
  });

  it("should ignore unknown textures", () => {
    for (const texture of ["nope", "constructor", "__proto__"]) {
      document.body.innerHTML = renderActivityCard(
        { total: 6, days },
        { texture },
      );
      expect(document.querySelector("#bg-texture")).toBeNull();
    }
  });

  it("should describe the chart in the subtitle when the title is custom", () => {
    document.body.innerHTML = renderActivityCard({ total: 6, days });
    expect(queryByTestId(document.body, "activity-subtitle")).toHaveTextContent(
      "last 3 days",
    );

    document.body.innerHTML = renderActivityCard(
      { total: 6, days },
      { custom_title: "Greyson Knippel" },
    );
    expect(queryByTestId(document.body, "activity-subtitle")).toHaveTextContent(
      "contribution activity · last 3 days",
    );

    document.body.innerHTML = renderActivityCard(
      { total: 6, days },
      { hide_title: true },
    );
    expect(queryByTestId(document.body, "activity-subtitle")).toBeNull();
  });
});

describe("activity helpers", () => {
  it("groupByWeek should align weeks to the last day and drop a partial week", () => {
    const days = makeDays([9, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]);
    expect(groupByWeek(days)).toStrictEqual([
      { date: days[1].date, count: 7 },
      { date: days[8].date, count: 14 },
    ]);
  });

  it("niceMax should round up to an even nice number", () => {
    expect(niceMax(0)).toBe(2);
    expect(niceMax(3)).toBe(10);
    expect(niceMax(46)).toBe(50);
    expect(niceMax(120)).toBe(200);
  });

  it("currentStreak should not break on a quiet today", () => {
    expect(currentStreak(makeDays([0, 1, 1, 1, 0]))).toBe(3);
    expect(currentStreak(makeDays([1, 0, 2, 2]))).toBe(2);
    expect(currentStreak(makeDays([1, 0, 0]))).toBe(0);
  });
});
