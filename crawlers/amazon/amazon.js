import axios from "axios";
import fs from "fs";

import { getCurrentDayOfWeek } from "../../assistants/helpers.js";
import {
  productsLinksByCategory,
  singleProductScrapper,
} from "./infoScrappers.js";

import { createContent } from "./contentGeneration.js";

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
          !productsLinks.some((item) => item.link === linkItem.link)
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

  for (const product of productsData) {
    try {
      console.log("Product", product);
      const content = await createContent(product);
      console.log("New content", content);
      product.content = {
        title: content.title,
        content: content.content,
      };
      delete product.title;
      delete product.description;
      product.category = content.category;
    } catch (error) {
      console.log("Error processing product content", product.title, error);
    }
  }
  //TODO отправить данные на WP
  fs.writeFileSync(
    "amazon_products_data_18.json",
    JSON.stringify([...productsData], null, 2),
    "utf-8"
  );
};

amazonDataFetcher();
