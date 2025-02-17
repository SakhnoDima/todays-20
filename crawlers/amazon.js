import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

import { delayer, getCurrentDayOfWeek } from "../assistants/helpers.js";
// import { daysOfWeek } from "../constants/index.js";

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
    const dataInHighCategory = {
      fame: 5,
    };

    const productLink = $(element)
      .find("div.p13n-sc-uncoverable-faceout > a")
      .attr("href");

    if (categoryUrl.includes("movers-and-shakers")) {
      const rankPercent = $(element)
        .find("div.a-row.a-spacing-none.aok-inline-block > span > span")
        .text()
        .match(/\d+/)?.[0];

      if (rankPercent && rankPercent > 500) {
        dataInHighCategory.fame = 15;
      }
    }

    if (productLink) {
      dataInHighCategory.link = productLink.trim();
      products.push(dataInHighCategory);
    }
  });

  return products;
};

const singleProductScrapper = async (products) => {
  //TODO remove after testing
  // const productsLinks = JSON.parse(
  //   fs.readFileSync("amazon_products.json", "utf-8")
  // );

  const scrappedData = [];

  for (const product of products) {
    let data = {
      id: product.link.split("/")[1],
      fame: product.fame,
    };

    const responseData = await fetchWithRetry(baseUrl + product.link);
    const $ = cheerio.load(responseData);
    try {
      //product title
      data.title = $("#productTitle").text().trim();

      //product img
      data.img = $("#landingImage").attr("src");

      //product description
      const description = [];
      $(
        "ul.a-unordered-list.a-vertical.a-spacing-mini li.a-spacing-mini span.a-list-item"
      ).each((_, element) => {
        description.push($(element).text().trim());
      });

      data.description = description.join(" ");

      //product topBrand
      const topBrandFame = $(
        "#brandInsights_feature_div_3 > div > div > h2"
      ).text();
      if (topBrandFame) {
        data.fame += 10;
      }

      //TODO product pastMonthBought
      // const pastMonthBought = $(
      //   "#social-proofing-faceout-title-tk_bought > span.a-text-bold"
      // ).text();

      // if (!pastMonthBought) {
      //   data.fame += 1;
      //   console.log("no");
      // } else if (
      //   pastMonthBought &&
      //   !pastMonthBought.includes("K") &&
      //   !pastMonthBought.includes("M")
      // ) {
      //   data.fame += 1;
      //   console.log("less");
      // } else if (pastMonthBought.match(/\d+/)?.[0] < 10) {
      //   data.fame += pastMonthBought.match(/\d+/)?.[0] * 2;
      //   console.log(pastMonthBought.match(/\d+/)?.[0]);
      // } else if (pastMonthBought.match(/\d+/)?.[0] >= 10) {
      //   data.fame += 20;
      // }

      //product totalRating
      const totalRating = $("#acrCustomerReviewText").text();
      if (totalRating) {
        data.fame +=
          Number(totalRating.match(/\d+/)?.[0]) <= 10
            ? Number(totalRating.match(/\d+/)?.[0])
            : 10;
      }

      //TODO product reviews

      scrappedData.push(data);
      await delayer(1000);
    } catch (error) {
      console.error("Scrapping single Item data error", error.message);
    }
  }
  return scrappedData;
};

export const amazonDataFetcher = async (requiredScrappingItems = 10) => {
  let responseUrls = [];

  const currentDay = getCurrentDayOfWeek();
  console.log("Current day", currentDay);

  const departments = await axios.get(
    `https://bjn.syi.mybluehost.me/wp-json/departments/get-daily?day=${currentDay}&marketplace=amazon'`
  );

  if (departments.data.status === "OK") {
    responseUrls = departments.data.data;
  }

  console.log("Scrapping links:", requiredScrappingItems);

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
      for (const linkItem of moversLinks) {
        if (
          moversCounter !== 0 &&
          !productsLinks.some((item) => item.link === linkItem.lin)
        ) {
          productsLinks.push(linkItem);
          moversCounter--;
        }
      }

      const newestLinks = await productsLinksByCategory(newest + linkItem);

      for (const linkItem of newestLinks) {
        if (
          newestCounter !== 0 &&
          !productsLinks.some((item) => item.link === linkItem.link)
        ) {
          productsLinks.push(linkItem);
          newestCounter--;
        }
      }
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
};
amazonDataFetcher();
