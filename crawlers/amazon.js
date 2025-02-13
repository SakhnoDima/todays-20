import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

import { delayer, getCurrentDayOfWeek } from "../assistants/helpers.js";

const fetchWithRetry = async (url, retries = 5, delay = 5000) => {
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
    }
  }
  throw new Error("Increased number of requests. Scraping failed!");
};

export const amazonDataFetcher = async () => {
  //TODO get current day of week then send request to WP for daily links
  console.log(getCurrentDayOfWeek());

  const responseUrls = ["amazon-devices"];

  const baseUrl = "https://www.amazon.com/gp/";
  const moversAndShakers = "movers-and-shakers/";
  const newest = "new-releases/";

  const totalElementFromLink = Math.ceil(20 / responseUrls.length);

  for (const linkItem of responseUrls) {
    const fullUrl = baseUrl + newest + linkItem;
    console.log(totalElementFromLink);

    // try {
    //   const responseData = await fetchWithRetry(fullUrl);
    //   console.log(responseData);

    //   const $ = cheerio.load(responseData);
    //   let products = [];

    //   $("div[id='gridItemRoot']").each((index, element) => {
    //     const productLink = $(element)
    //       .find("div.p13n-sc-uncoverable-faceout > a")
    //       .attr("href")
    //       .trim();

    //     if (productLink) {
    //       products.push(productLink);
    //     }
    //   });

    //   fs.writeFileSync(
    //     "amazon_products_m.json",
    //     JSON.stringify(products, null, 2),
    //     "utf-8"
    //   );

    //   console.log("Дані збережено у файл amazon_products.json");
    // } catch (error) {
    //   console.error("amazon scrapping", error);
    // }
  }
};

amazonDataFetcher();
