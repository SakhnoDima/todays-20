import axios from "axios";
import axiosRetry from "axios-retry";
import fs from "fs";

axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => {
    console.log(`Retry attempt ${retryCount}`);
    return retryCount * 2000;
  },
  retryCondition: (error) => {
    return error.response?.status >= 500 || error.code === "ECONNABORTED";
  },
});

import { getCurrentDayOfWeek } from "../../assistants/helpers.js";
import {
  productsLinksByCategory,
  singleProductScrapper,
} from "./infoScrappers.js";

import { createContent } from "./contentGeneration.js";

export const amazonDataFetcher = async (requiredScrappingItems = 20) => {
  let responseUrls = [];

  const currentDay = getCurrentDayOfWeek();
  console.log("Current day", currentDay);

  const departments = await axios.get(
    `https://bjn.syi.mybluehost.me/wp-json/departments/get-daily?day=${currentDay}&marketplace=amazon'`
  );

  if (departments.data.status === "OK") {
    responseUrls = departments.data.data;
  }

  console.log("Total links:", requiredScrappingItems);
  console.log("Department count:", responseUrls.length);

  let remainingItems = requiredScrappingItems;
  let productsLinks = [];
  const moversAndShakers = "movers-and-shakers/";
  const newest = "new-releases/";

  for (let i = 0; i < responseUrls.length; i++) {
    const count = Math.ceil(remainingItems / (responseUrls.length - i));
    let moversCounter = Math.max(Math.floor(count * 0.8), 1);
    let newestCounter = Math.max(Math.ceil(count * 0.2), 1);
    console.log("moversCounter links:", moversCounter);
    console.log("newestCounter links:", newestCounter);
    try {
      const moversLinks = await productsLinksByCategory(
        moversAndShakers + responseUrls[i]
      );
      const newestLinks = await productsLinksByCategory(
        newest + responseUrls[i]
      );

      if (moversLinks.length === 0) newestCounter += moversCounter;

      if (newestLinks.length === 0) moversCounter += newestCounter;

      let stillNeed = remainingItems;
      for (const linkItem of moversLinks) {
        if (!productsLinks.some((item) => item.id === linkItem.id)) {
          console.log(`Steel need ${stillNeed} links!`);

          const isDataScrapped = await singleProductScrapper(linkItem);
          if (moversCounter !== 0 && isDataScrapped) {
            productsLinks.push(linkItem);
            moversCounter--;
            stillNeed--;
          } else if (moversCounter === 0) break;
        }
      }
      for (const linkItem of newestLinks) {
        if (!productsLinks.some((item) => item.id === linkItem.id)) {
          console.log(`Steel need ${stillNeed} links!`);
          const isDataScrapped = await singleProductScrapper(linkItem);
          if (newestCounter !== 0 && isDataScrapped) {
            productsLinks.push(linkItem);
            newestCounter--;
            stillNeed--;
          } else if (newestCounter === 0) break;
        }
      }

      if (moversCounter || newestCounter) {
        remainingItems += moversCounter + newestCounter - count;
      } else {
        remainingItems -= count;
      }
    } catch (error) {
      console.error("amazon scrapping", error);
    }
  }

  console.log("All Data length", productsLinks.length);

  for (const product of productsLinks) {
    createContent(product)
      .then((content) => {
        product.content = {
          title: content.title,
          content: content.content,
        };
        delete product.title;
        delete product.description;
        delete product.customersSay;
        product.category = content.category;

        // fs.writeFileSync(
        //   `amazon_product_${product.content.title}.json`,
        //   JSON.stringify(product, null, 2),
        //   "utf-8"
        // );
        return axios.post(
          "https://todays20.com/wp-json/amazon/v1/posts/",
          product,
          {
            headers: {
              "Content-Type": "application/json",
            },
            maxBodyLength: Infinity,
          }
        );
      })
      .then((response) => {
        console.log("Success:", JSON.stringify(response.data));
      })
      .catch((error) => {
        console.log("Error while post saving:", error.message);
      });
  }
};

//amazonDataFetcher();
