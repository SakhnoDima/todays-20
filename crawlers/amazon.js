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

const productsLinksByCategory = async (categoryUrl) => {
  const baseUrl = "https://www.amazon.com/gp/";

  const fullUrl = baseUrl + categoryUrl;

  const responseData = await fetchWithRetry(fullUrl);
  const $ = cheerio.load(responseData);
  let products = [];

  $("div[id='gridItemRoot']").each((_, element) => {
    const productLink = $(element)
      .find("div.p13n-sc-uncoverable-faceout > a")
      .attr("href");

    if (productLink) {
      products.push(productLink.trim());
    }
  });

  return products;
};
export const amazonDataFetcher = async (requiredScrappingItems = 10) => {
  //TODO get current day of week then send request to WP for daily links
  console.log("Current day", getCurrentDayOfWeek());
  console.log("Scrapping links:", requiredScrappingItems);

  const responseUrls = ["amazon-devices", "amazon-renewed", "appliances"];

  const totalElementFromLink = Math.floor(
    requiredScrappingItems / responseUrls.length
  );
  let productsLinks = [];
  const moversAndShakers = "movers-and-shakers/";
  const newest = "new-releases/";

  for (const linkItem of responseUrls) {
    let moversCounter = Math.max(Math.ceil(totalElementFromLink * 0.8), 1);
    let newestCounter = Math.max(Math.ceil(totalElementFromLink * 0.2), 1);

    try {
      const moversLinks = await productsLinksByCategory(
        moversAndShakers + linkItem
      );
      for (const link of moversLinks) {
        if (moversCounter != 0 && !productsLinks.includes(link)) {
          productsLinks.push(link);
          moversCounter--;
        }
      }

      const newestLinks = await productsLinksByCategory(newest + linkItem);
      for (const link of newestLinks) {
        if (newestCounter != 0 && !productsLinks.includes(link)) {
          productsLinks.push(link);
          newestCounter--;
        }
      }

      console.log(`Data links for category -  ${linkItem} saved!`);
    } catch (error) {
      console.error("amazon scrapping", error);
    }
  }

  productsLinks = productsLinks.slice(0, requiredScrappingItems); // should have specified quantity

  fs.writeFileSync(
    "amazon_products.json",
    JSON.stringify([...productsLinks], null, 2),
    "utf-8"
  );

  console.log(productsLinks);
};

amazonDataFetcher();
