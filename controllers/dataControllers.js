import axios from "axios";
import { trackMixpanel } from "../mixpanel.js";
import axiosRetry from "axios-retry";

axiosRetry(axios, {
  retries: 5,
  retryDelay: (retryCount) => {
    console.log(`Retry saving data: ${retryCount}`);
    return retryCount * 2000;
  },
  retryCondition: (error) => {
    const isRetryable = axiosRetry.isNetworkOrIdempotentRequestError(error);
    return isRetryable || [502, 503, 504].includes(error.response?.status);
  },
});

export const dataSaver = async (companyName, vacancies) => {
  const responseBody = {
    company: companyName,
    vacancies,
  };

  try {
    await axios.post(
      "https://topwomen.careers/wp-json/custom/v1/add-company-vacancies",
      JSON.stringify(responseBody),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`${companyName} vacancies saved!`);
    console.log(`Total vacancies in ${companyName}`, vacancies.length);
    trackMixpanel(companyName, vacancies.length, true);
  } catch (error) {
    console.error("Error saving data:", error.message);
    console.error("Error saving data:", {
      message: error.message,
      response: error.response?.data || "No response data",
      status: error.response?.status || "No status",
    });
    throw new Error(`Saving data failed: ${error.message}`);
  }
};
