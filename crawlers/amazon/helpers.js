import axios from "axios";
import { delayer } from "../../assistants/helpers.js";

export const fetchWithRetry = async (url, retries = 5, delay = 5000) => {
  console.log("Scrapping url:", url);

  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
      });

      if (response.data.includes("Request was throttled")) {
        throw new Error("Throttling detected (429). Retrying...");
      }

      return response.data;
    } catch (error) {
      if (
        error.response?.status === 429 ||
        error.message.includes("Throttling detected")
      ) {
        console.warn(`Get 429 error. Retrying in ${delay / 1000} seconds`);
        await delayer(delay);
      } else {
        throw error;
      }
    } finally {
      await delayer(delay);
    }
  }
  throw new Error("Increased number of requests. Scraping failed!");
};

export const isRecentReview = (reviewString) => {
  const datePattern = /on (\w+ \d{1,2}, \d{4})/;
  const match = reviewString.match(datePattern);

  if (match) {
    const reviewDate = new Date(match[1]);
    const currentDate = new Date();
    const diffTime = currentDate - reviewDate;
    const diffDays = diffTime / (1000 * 3600 * 24);

    return diffDays <= 11;
  }

  return false;
};
