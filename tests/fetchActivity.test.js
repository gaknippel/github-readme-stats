import { afterEach, describe, expect, it } from "@jest/globals";
import "@testing-library/jest-dom";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { fetchActivity } from "../src/fetchers/activity.js";

const mock = new MockAdapter(axios);

afterEach(() => {
  mock.reset();
});

const data_activity = {
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 6,
          weeks: [
            {
              contributionDays: [
                { date: "2026-10-04", contributionCount: 1 },
                { date: "2026-10-05", contributionCount: 0 },
              ],
            },
            {
              contributionDays: [{ date: "2026-10-06", contributionCount: 5 }],
            },
          ],
        },
      },
    },
  },
};

const error = {
  errors: [
    {
      type: "NOT_FOUND",
      path: ["user"],
      locations: [],
      message: "Could not resolve to a User with the login of 'noname'.",
    },
  ],
};

describe("fetchActivity", () => {
  it("should flatten the contribution calendar into days", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_activity);

    const activity = await fetchActivity("anuraghazra");
    expect(activity).toStrictEqual({
      total: 6,
      days: [
        { date: "2026-10-04", count: 1 },
        { date: "2026-10-05", count: 0 },
        { date: "2026-10-06", count: 5 },
      ],
    });
  });

  it("should request the given number of days", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_activity);

    await fetchActivity("anuraghazra", 30);
    const { variables } = JSON.parse(mock.history.post[0].data);
    const span = new Date(variables.to) - new Date(variables.from);
    expect(span).toBe(29 * 24 * 60 * 60 * 1000);
  });

  it("should throw specific error when user not found", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, error);

    await expect(fetchActivity("anuraghazra")).rejects.toThrow(
      "Could not resolve to a User with the login of 'noname'.",
    );
  });

  it("should throw when no username is given", async () => {
    await expect(fetchActivity("")).rejects.toThrow(
      'Missing params "username" make sure you pass the parameters in URL',
    );
  });
});
