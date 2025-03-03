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
  const cookies = [
    {
      name: "csm-hit",
      value:
        "adb:adblk_no&t:1740657283525&tb:s-PHZK2DM6ZA933TPVK127|1740657280947",
      domain: "www.amazon.com",
      path: "/",
      expires: 1770897283,
    },
    {
      name: "session-id",
      value: "139-9580207-0072344",
      domain: ".amazon.com",
      path: "/",
      expires: 1772193270.991621,
      secure: true,
    },
    {
      name: "csm-hit",
      value:
        "adb:adblk_yes&t:1740653049827&tb:6CQKP61G25YMEEMMNVQB+s-VH4MKXENTX2NSGNKZJ3N|1740653049827",
      domain: ".amazon.com",
      path: "/",
      session: true,
    },
    {
      name: "ubid-main",
      value: "134-4240842-3401920",
      domain: ".amazon.com",
      path: "/",
      expires: 1772193273.290907,
      secure: true,
    },
    {
      name: "session-token",
      value:
        "WbBx0CwFjZASlbsC+hnni4WctszrYlWOMEe6Ay+jotsRR+HpWW1Yq6fzRiU4wOt2gPFbD26Nkas4zQc7vHaU5Rav8+iLqpCcEMg68PmE9HGBWJQcHABXAWKWy+GPX3eY2cUaqrpDMoSOD30HjiN3pO/Vj9L/1h1LH5Jz+E7KKBpBx5PSNOalUcDn4k+fg+tVc90iHPEZePR34vRht0fXQNapIGDFTlAR9XZaXfihfm/v0qX1VgzyadUHdOk6GX9dh0LBE8g0d7Lj5f/rofYbkTxNFdkJU70TmRc75Tyj4IR4byEKps0l+wnb2xjZj2WwpaCb8LC7HmtXm/QARHXsmrOvFpkHviF7",
      domain: ".amazon.com",
      path: "/",
      expires: 1772193273.884434,
      secure: true,
    },
    {
      name: "i18n-prefs",
      value: "USD",
      domain: ".amazon.com",
      path: "/",
      session: true,
    },
    {
      name: "session-id-time",
      value: "2082787201l",
      domain: ".amazon.com",
      path: "/",
      session: true,
    },
  ];

  await page.setCookie(...cookies);
  let responseData = {
    fame: 0,
    images: [],
    info: {},
    amazonInfo: {},
  };
  try {
    console.log("Im trying to go to page...");
    await page.goto(`${product.link}/139-9580207-0072344`, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await delayer(2000);
    console.log("Ok, Im on page!");

    // availability
    const isAvailability = await page.$("#availability > span");
    if (isAvailability) {
      const AvailabilityText = await page.evaluate(
        (el) => el.textContent.trim(),
        isAvailability
      );
      if (AvailabilityText.includes("left in stock - order soon.")) {
        responseData.fame += 5;
        console.log("isAvailability OK");
      }
    } else {
      console.log("isAvailability not found");
    }
    //TODO time deal
    // const isTimeDeal = await page.$("#dealBadge_feature_div > span");
    // if (isTimeDeal) {
    //   console.log("Good prise!!! Time deal!!!");
    // }

    // bought in past month
    const isPastMonth = await page.$(
      "#social-proofing-faceout-title-tk_bought > span.a-text-bold"
    );
    if (isPastMonth) {
      const inPastMonthText = await page.evaluate(
        (el) => el.textContent.trim(),
        isPastMonth
      );
      console.log("isPastMonth OK");
      if (inPastMonthText.includes("K")) {
        const match = inPastMonthText.match(/\d+/);
        responseData.fame += Number(match);
        console.log(`We add ${match} because:`, inPastMonthText);
      } else {
        responseData.fame += 1;
        console.log(`We add 1 because:`, inPastMonthText);
      }
    } else {
      console.log("isPastMonth not found");
    }

    // reviews
    try {
      const response = await page.evaluate(async (asin) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        console.log("Start fetching data in evaluate reviews");

        const res = await fetch(
          "/hz/reviews-render/ajax/medley-filtered-reviews/get/ref=cm_cr_dp_d_fltrs_srt",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              asin: asin,
              //sortBy: "recent", Amazon remove sorting
              scope: "reviewsAjax2",
            }),
          }
        );
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        return await res.text();
      }, product.id);

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
      console.log("Getting reviews error:", error);
    }
    //images
    try {
      const allScripts = await page.evaluate(() => {
        console.log("Start getting img in evaluate");
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
            const uniqueLinks = new Set();

            for (const match of matchesImgs) {
              const urlMatch = match.match(/"hiRes":"(https:\/\/[^"]+)"/);
              if (urlMatch) {
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
      console.log("Getting images error:", error);
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
        responseData.amazonInfo
      );
    } else if (
      await page.$("#productDetails_techSpec_section_1 > tbody > tr")
    ) {
      await extractTableData(
        page,
        "#productDetails_techSpec_section_1 > tbody > tr",
        "th",
        "td",
        responseData.amazonInfo
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

    //customers say
    const customersSaySelector = "#product-summary > p.a-spacing-small";
    if (await page.$(customersSaySelector)) {
      const customersSay = await page.$eval(customersSaySelector, (el) =>
        el.innerText.trim().replace(/\n/g, " ")
      );
      if (customersSay.length > 0) {
        responseData.customersSay = customersSay;
      }
    }

    await browser.close();
    await delayer(1000);
    console.log("Browser closed!");
    return responseData;
  } catch (error) {
    console.error(`The page failed to load!`, error);
    await browser.close();
    console.log("Browser closed!");
    await delayer(1000);
    return null;
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

export const singleProductScrapper = async (product) => {
  try {
    const responseData = await fetchWithRetry(`${baseUrl}/${product.link}`);
    const $ = cheerio.load(responseData);

    //product link
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

    if (!browserData) {
      return null;
    }
    // customersSay
    if (browserData.customersSay && browserData.customersSay.length > 0) {
      product.customersSay = browserData.customersSay;
    }

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
      product.info = browserData.info;
    }
    if (
      browserData.amazonInfo &&
      Object.keys(browserData.amazonInfo).length > 0
    ) {
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

    await delayer(2000);
    console.log("Product:", product);
    return true;
  } catch (error) {
    console.error("Scrapping single Item data error", error.message);
    return null;
  }
};
