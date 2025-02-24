import * as cheerio from "cheerio";

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

const getDetailsFromBrowser = async (product) => {
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

  let responseData = {
    fame: 0,
    images: [],
    info: {},
    amazonInfo: {},
  };
  try {
    console.log("Im trying to go to page...");
    await page.goto(product.link, {
      waitUntil: "networkidle2",
      timeout: 50000,
    });
    await delayer(1000);
    console.log("Ok, Im on page!");

    // reviews
    try {
      const response = await page.evaluate(async (asin) => {
        console.log(11);
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
        console.log(111);
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        return await res.text();
      }, product.id);
      console.log(1111);
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
    } catch (error) {
      console.log(error);

      console.log("Getting reviews error");
    }
    //images
    try {
      const allScripts = await page.evaluate(() => {
        const scripts = [...document.scripts].map((s) => s.textContent);
        return scripts.find((text) => text.includes("jQuery.parseJSON"));
      });
      console.log(2);
      if (allScripts) {
        console.log(3);
        const match = allScripts.match(/jQuery\.parseJSON\('(.+?)'\)/);
        if (match && match[1]) {
          try {
            console.log(4);
            const jsonString = match[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, "")
              .replace(/\\r/g, "")
              .replace(/\\t/g, "")
              .replace(/\\\\/g, "\\");

            const matchesImgs =
              jsonString.match(/"hiRes":"(https:\/\/[^"]+)"/g) || [];
            const uniqueLinks = new Set();

            for (const match of matchesImgs) {
              const urlMatch = match.match(/"hiRes":"(https:\/\/[^"]+)"/);
              if (urlMatch) {
                console.log(uniqueLinks.size);

                uniqueLinks.add(urlMatch[1]);
                if (uniqueLinks.size >= 4) break;
              }
            }

            responseData.images = [...uniqueLinks];
          } catch (error) {
            console.error("JSON Parsing Error:", error);
          }
        } else {
          console.log("No JSON data found in script.");
        }
      }
    } catch (error) {
      console.log("Getting images error");
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

    if (await page.$("#productDescription")) {
      const description = await page.$eval("#productDescription", (el) =>
        el.innerText.trim().replace(/\n/g, " ")
      );
      if (description.length > 0) {
        responseData.description = description;
      }
    }

    await browser.close();
    await delayer(1000);
    console.log("Browser closed!");
    return responseData;
  } catch (error) {
    console.error(`The page failed to load after !`);
    await browser.close();
    console.log("Browser closed!");
    await delayer(1000);
    return responseData;
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
      dataInHighCategory.id = productLink.trim().split("/")[3];

      products.push(dataInHighCategory);
    }
  });

  return products;
};

export const singleProductScrapper = async (products) => {
  for (const product of products) {
    try {
      const responseData = await fetchWithRetry(`${baseUrl}/${product.link}`);
      const $ = cheerio.load(responseData);

      1; //product link
      product.link = `${baseUrl}${product.link.split("/ref=")[0]}?tag=${
        process.env.AFF_TEG
      }`;

      //product title
      product.title = $("#productTitle").text().trim();

      //product img
      product.images = [$("#landingImage").attr("src")];

      //product description
      const description = [];
      $(
        "ul.a-unordered-list.a-vertical.a-spacing-mini li.a-spacing-mini span.a-list-item"
      ).each((_, element) => {
        description.push($(element).text().trim());
      });

      product.description = description.join(" ");

      //product topBrand
      const topBrandFame = $(
        "#brandInsights_feature_div_3 > div > div > h2"
      ).text();
      if (topBrandFame) {
        product.fame += 10;
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
            product.fame += 1;
          } else {
            product.fame += Math.min(11, Math.floor(ratingNumber / 1000));
          }
        }
      }

      //product reviews
      const browserData = await getDetailsFromBrowser(product);

      //update fame
      product.fame += browserData.fame;

      //update description
      product.description += " " + browserData.description;

      //update images
      if (browserData.images.length > 0) {
        product.images = browserData.images;
      }

      //product info

      if (browserData.info && Object.keys(browserData.info).length > 0) {
        console.log("browserData.info", browserData.info);

        product.info = browserData.info;
      }
      if (
        browserData.amazonInfo &&
        Object.keys(browserData.amazonInfo).length > 0
      ) {
        console.log("browserData.amazonInfo", browserData.amazonInfo);
        product.amazonInfo = browserData.amazonInfo;
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
        product.fame += 4;
        product.badge = "Amazon Choice";
      } else if (zeitgeistBadge.trim().includes("#1 Best Seller")) {
        console.log("Amazon best seller!");
        product.fame += 6;
        product.badge = "Best Seller";
      } else if (zeitgeistBadge.trim().includes("#1 New Release")) {
        console.log("New Release!");
        product.fame += 4;
        product.badge = "New Release";
      }

      await delayer(1000);
      console.log("Product link:", product.link);
    } catch (error) {
      console.error("Scrapping single Item data error", error.message);
    }
  }
};
