// @ts-check

import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Activity fetcher object.
 *
 * @param {any} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import("axios").AxiosResponse>} Activity fetcher response.
 */
const fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userActivity($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

/**
 * @typedef {import("./types").ActivityData} ActivityData Activity data.
 */

/**
 * Fetch the daily contribution counts for a given username.
 *
 * @param {string} username GitHub username.
 * @param {number} days How many days back from today to fetch.
 * @returns {Promise<ActivityData>} Activity data.
 */
const fetchActivity = async (username, days = 365) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);

  const res = await retryer(fetcher, {
    login: username,
    from: from.toISOString(),
    to: to.toISOString(),
  });

  if (res.data.errors) {
    logger.error(res.data.errors);
    if (res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (res.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(res.data.errors[0].message, 90, 1)[0],
        res.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the activity data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  const calendar =
    res.data.data.user.contributionsCollection.contributionCalendar;

  return {
    total: calendar.totalContributions,
    days: calendar.weeks
      .flatMap((week) => week.contributionDays)
      .map((day) => ({ date: day.date, count: day.contributionCount })),
  };
};

export { fetchActivity };
export default fetchActivity;
