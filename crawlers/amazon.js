import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

import { delayer, getCurrentDayOfWeek } from "../assistants/helpers.js";

const baseUrl = "https://www.amazon.com/";

const fetchWithRetry = async (url, retries = 5, delay = 5000) => {
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

const productsLinksByCategory = async (categoryUrl) => {
  const fullUrl = baseUrl + "gp/" + categoryUrl;

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

const singleProductScrapper = async (links) => {
  //TODO remove after testing
  // const productsLinks = JSON.parse(
  //   fs.readFileSync("amazon_products.json", "utf-8")
  // );

  const scrappedData = [];

  for (const link of links) {
    let data = {
      id: link.split("/")[1],
    };

    const responseData = await fetchWithRetry(baseUrl + link);
    const $ = cheerio.load(responseData);
    try {
      data.title = $("#productTitle").text().trim();
      data.img = $("#landingImage").attr("src");

      const description = [];
      $(
        "ul.a-unordered-list.a-vertical.a-spacing-mini li.a-spacing-mini span.a-list-item"
      ).each((_, element) => {
        description.push($(element).text().trim());
      });

      data.description = description.join(" ");
      scrappedData.push(data);
      await delayer(1000);
    } catch (error) {
      console.error("Scrapping single Item data error", error.message);
    }
  }
  return scrappedData;
};

export const amazonDataFetcher = async (requiredScrappingItems = 20) => {
  //TODO get current day of week then send request to WP for daily links
  console.log("Current day", getCurrentDayOfWeek());
  console.log("Scrapping links:", requiredScrappingItems);

  const responseUrls = ["amazon-devices"];

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
        if (moversCounter !== 0 && !productsLinks.includes(link)) {
          productsLinks.push(link);
          moversCounter--;
        }
      }

      const newestLinks = await productsLinksByCategory(newest + linkItem);
      for (const link of newestLinks) {
        if (newestCounter !== 0 && !productsLinks.includes(link)) {
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

  const productsData = await singleProductScrapper(productsLinks);
  console.log(productsData);

  // fs.writeFileSync(
  //   "amazon_products_details.json",
  //   JSON.stringify([...productsData], null, 2),
  //   "utf-8"
  // );

  console.log(productsLinks);
};
