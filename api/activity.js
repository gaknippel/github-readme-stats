// @ts-check

import { renderActivityCard } from "../src/cards/activity.js";
import { guardAccess } from "../src/common/access.js";
import {
  CACHE_TTL,
  resolveCacheSeconds,
  setCacheHeaders,
  setErrorCacheHeaders,
} from "../src/common/cache.js";
import {
  MissingParamError,
  retrieveSecondaryMessage,
} from "../src/common/error.js";
import { clampValue, parseBoolean } from "../src/common/ops.js";
import { renderError } from "../src/common/render.js";
import { fetchActivity } from "../src/fetchers/activity.js";

const DEFAULT_DAYS = 365;
const MIN_DAYS = 14;
const MAX_DAYS = 365;

// @ts-ignore
export default async (req, res) => {
  const {
    username,
    days,
    hide_title,
    hide_border,
    card_width,
    title_color,
    text_color,
    icon_color,
    line_color,
    bg_color,
    theme,
    cache_seconds,
    custom_title,
    border_radius,
    border_color,
    disable_animations,
    texture,
  } = req.query;
  res.setHeader("Content-Type", "image/svg+xml");

  const access = guardAccess({
    res,
    id: username,
    type: "username",
    colors: {
      title_color,
      text_color,
      bg_color,
      border_color,
      theme,
    },
  });
  if (!access.isPassed) {
    return access.result;
  }

  try {
    const requestedDays = parseInt(days, 10);
    const activity = await fetchActivity(
      username,
      clampValue(
        isNaN(requestedDays) ? DEFAULT_DAYS : requestedDays,
        MIN_DAYS,
        MAX_DAYS,
      ),
    );
    const cacheSeconds = resolveCacheSeconds({
      requested: parseInt(cache_seconds, 10),
      def: CACHE_TTL.ACTIVITY_CARD.DEFAULT,
      min: CACHE_TTL.ACTIVITY_CARD.MIN,
      max: CACHE_TTL.ACTIVITY_CARD.MAX,
    });

    setCacheHeaders(res, cacheSeconds);

    return res.send(
      renderActivityCard(activity, {
        custom_title,
        hide_title: parseBoolean(hide_title),
        hide_border: parseBoolean(hide_border),
        card_width: parseInt(card_width, 10),
        title_color,
        text_color,
        icon_color,
        line_color,
        bg_color,
        theme,
        border_radius,
        border_color,
        disable_animations: parseBoolean(disable_animations),
        texture,
      }),
    );
  } catch (err) {
    setErrorCacheHeaders(res);
    if (err instanceof Error) {
      return res.send(
        renderError({
          message: err.message,
          secondaryMessage: retrieveSecondaryMessage(err),
          renderOptions: {
            title_color,
            text_color,
            bg_color,
            border_color,
            theme,
            show_repo_link: !(err instanceof MissingParamError),
          },
        }),
      );
    }
    return res.send(
      renderError({
        message: "An unknown error occurred",
        renderOptions: {
          title_color,
          text_color,
          bg_color,
          border_color,
          theme,
        },
      }),
    );
  }
};
