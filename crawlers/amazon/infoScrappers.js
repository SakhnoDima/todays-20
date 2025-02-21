import * as cheerio from "cheerio";
import fs from "fs/promises";

import dotenv from "dotenv";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { fetchWithRetry, isRecentReview } from "./helpers.js";
import { delayer } from "../../assistants/helpers.js";

dotenv.config();

const baseUrl = "https://www.amazon.com";

const extractTableData = async (
  page,
  selector,
  keySelector,
  valueSelector,
  targetObject
) => {
  const rows = await page.$$(selector);
  if (rows.length === 0) {
    return;
  }
  for (const row of rows) {
    const keyElement = await row.$(keySelector);
    const valueElement = await row.$(valueSelector);

    if (keyElement && valueElement) {
      const key = (
        await page.evaluate(
          (el) => el.innerText.trim().replace(/\n/g, " "),
          keyElement
        )
      ).replace(":", "");
      const value = await page.evaluate(
        (el) => el.innerText.trim().replace(/\n/g, " "),
        valueElement
      );

      targetObject[key] = value;
    }
  }
};

const getDetailsFromBrowser = async (singleLink) => {
  puppeteer.use(StealthPlugin());

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1440,760",
    ],
  });

  const [page] = await browser.pages();
  await page.setViewport({
    width: 1440,
    height: 760,
    deviceScaleFactor: 1,
  });

  const maxRetries = 5;
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await page.goto(`${baseUrl}/${singleLink}`, {
        waitUntil: "networkidle2",
        timeout: 500000,
      });

      let responseData = {
        fame: 0,
        images: [],
        info: {},
        amazonInfo: {},
      };

      //images
      const allScripts = await page.evaluate(() => {
        const scripts = [...document.scripts].map((s) => s.textContent);
        return scripts.find((text) => text.includes("jQuery.parseJSON"));
      });

      if (allScripts) {
        const match = allScripts.match(/jQuery\.parseJSON\('(.+?)'\)/);
        if (match && match[1]) {
          try {
            const jsonString = match[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, "")
              .replace(/\\r/g, "")
              .replace(/\\t/g, "")
              .replace(/\\\\/g, "\\");

            const matchesImgs =
              jsonString.match(/"hiRes":"(https:\/\/[^"]+)"/g) || [];
            const uniqueLinks = [
              ...new Set(
                matchesImgs.map(
                  (m) => m.match(/"hiRes":"(https:\/\/[^"]+)"/)[1]
                )
              ),
            ];
            responseData.images = [...uniqueLinks.slice(0, 4)];
          } catch (error) {
            console.error("JSON Parsing Error:", error);
          }
        } else {
          console.log("No JSON data found in script.");
        }
      }

      // reviews
      const response = await page.evaluate(async (asin) => {
        const res = await fetch(
          "/hz/reviews-render/ajax/medley-filtered-reviews/get/ref=cm_cr_dp_d_fltrs_srt",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              asin: asin,
              sortBy: "recent",
              scope: "reviewsAjax2",
            }),
          }
        );
        return res.text();
      }, singleLink.split("/")[3]);

      if (response) {
        const arrReviews = response.replace("\n", "").split("&&&").splice(3);

        arrReviews.forEach((el) => {
          const newElem = el.replace(/\\/g, "");

          const matchRating = newElem.match(
            /<span class="a-icon-alt">(.*?)<\/span>/
          );
          const matchDay = newElem.match(
            /<span data-hook="review-date" aria-level="6" class="a-size-base a-color-secondary review-date" role="heading">(.*?)<\/span>/
          );

          if (matchRating && matchRating[1] && matchDay && matchDay[1]) {
            const ratingMatch = matchRating[1].match(/^\d+(\.\d+)?/);
            if (ratingMatch) {
              const rating = parseFloat(ratingMatch[0]);

              const isLas10DaysReview = isRecentReview(matchDay[1]);

              responseData.fame += isLas10DaysReview ? 2 : 1;

              responseData.fame += rating;
            }
          }
        });
        console.log("Review rating:", responseData.fame);
      }

      // productInfo
      if (
        await page.$("#productOverview_feature_div > div > table > tbody > tr")
      ) {
        await extractTableData(
          page,
          "#productOverview_feature_div > div > table > tbody > tr",
          "td.a-span3 span.a-size-base.a-text-bold",
          "td.a-span9 span.a-size-base.po-break-word",
          responseData.info
        );
      } else if (
        await page.$("#productDetails_techSpec_section_1 > tbody > tr")
      ) {
        await extractTableData(
          page,
          "#productDetails_techSpec_section_1 > tbody > tr",
          "th",
          "td",
          responseData.info
        );
      }

      await extractTableData(
        page,
        "#tech > div:nth-child(4) > div > div:nth-child(1) > div > table > tbody > tr",
        "td:nth-child(1) p strong",
        "td:nth-child(2) p",
        responseData.amazonInfo
      );

      // descriptions
      const descriptionElement = await page.$("#productDescription");
      if (descriptionElement) {
        const description = await page.$eval("#productDescription", (el) =>
          el.innerText.trim().replace(/\n/g, " ")
        );
        if (description.length > 0) {
          responseData.description = description;
        }
      }

      console.log(responseData);

      await browser.close();
      return responseData;
    } catch (error) {
      console.error(`Помилка під час переходу (спроба ${attempt + 1}):`, error);
      attempt++;
      if (attempt < maxRetries) {
        console.log(`Повторний перехід через ${delay / 1000} сек...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `Не вдалося завантажити сторінку після ${maxRetries} спроб.`
        );
        await browser.close();
        return { fame: 0, images: [], info: {}, amazonInfo: {} };
      }
    }
  }
};

export const productsLinksByCategory = async (categoryUrl) => {
  const fullUrl = `${baseUrl}/gp/` + categoryUrl;

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
        .replace(/[^0-9,]/g, "")
        .replace(",", "")
        .match(/\d+/)?.[0];

      const rankValue = rankPercent ? parseInt(rankPercent, 10) : 0;

      if (rankValue > 100 && rankValue < 200) {
        dataInHighCategory.fame = 10;
      } else if (rankValue > 200) {
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

export const singleProductScrapper = async (products) => {
  const scrappedData = [];

  for (const product of products) {
    let data = {
      id: product.link.split("/")[3],
      fame: product.fame,
      link: `${baseUrl}${product.link.split("/ref=")[0]}?tag=${
        process.env.AFF_TEG
      }`,
    };

    const responseData = await fetchWithRetry(`${baseUrl}/${product.link}`);
    const $ = cheerio.load(responseData);
    try {
      //product title
      data.title = $("#productTitle").text().trim();

      //product img
      data.images = [$("#landingImage").attr("src")];

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

      //product totalRating
      const totalRating = $("#acrCustomerReviewText").text();
      if (totalRating) {
        const ratingNumber = Number(
          totalRating.replace(/,/g, "").match(/\d+/)?.[0]
        );

        if (!isNaN(ratingNumber)) {
          console.log("Product rating:", ratingNumber);

          if (ratingNumber < 1000) {
            data.fame += 1;
          } else {
            data.fame += Math.min(11, Math.floor(ratingNumber / 1000));
          }
        }
      }

      //product reviews
      const browserData = await getDetailsFromBrowser(product.link);

      //update fame
      data.fame += browserData.fame;

      //update description
      data.description += " " + browserData.description;

      //update images
      if (browserData.images.length > 0) {
        data.images = browserData.images;
      }

      //product info

      if (browserData.info && Object.keys(browserData.info).length > 0) {
        console.log("browserData.info", browserData.info);

        data.info = browserData.info;
      }
      if (
        browserData.amazonInfo &&
        Object.keys(browserData.amazonInfo).length > 0
      ) {
        console.log("browserData.amazonInfo", browserData.amazonInfo);
        data.amazonInfo = browserData.amazonInfo;
      }

      // amazonsChoice or newRelease or bestSeller
      const amazonsChoice = $(
        "#acBadge_feature_div > div > span.a-declarative > span.a-size-small.aok-float-left.ac-badge-rectangle"
      );
      const zeitgeistBadge = $(
        "#zeitgeistBadge_feature_div > div > a > i"
      ).text();

      if (amazonsChoice.length) {
        console.log("Amazon choice!");
        data.fame += 4;
        data.badge = "Amazon Choice";
      } else if (zeitgeistBadge.trim().includes("#1 Best Seller")) {
        console.log("Amazon best seller!");
        data.fame += 6;
        data.badge = "Best Seller";
      } else if (zeitgeistBadge.trim().includes("#1 New Release")) {
        console.log("New Release!");
        data.fame += 4;
        data.badge = "New Release";
      }

      scrappedData.push(data);
      await delayer(1000);
    } catch (error) {
      console.error("Scrapping single Item data error", error.message);
    }
  }
  return scrappedData;
};
