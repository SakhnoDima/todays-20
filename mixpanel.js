import dotenv from "dotenv";

dotenv.config();

import Mixpanel from "mixpanel";
import { getTime } from "./assistants/helpers.js";

const mixpanel = Mixpanel.init("1bd22151e54aec8e76f52e4b74e3580e", {
  secret: "0cdc889d1420b2d13e90e2d563d09a89",
});

export const trackMixpanel = async (
  crawler,
  totalVacancies,
  successful,
  message
) => {
  mixpanel.track(
    crawler,
    {
      "Vacancies found": totalVacancies,
      Status: successful === true ? "Success" : "Fail",
      Message: message ? message : "Parsing completed successfully",
    },
    (err) => {
      if (err) {
        console.error(`Error tracking event for ${crawler}:`, err);
      } else {
        console.log(`Event for ${crawler} tracked successfully`);
      }
    }
  );
};
