import axios from "axios";
import * as cheerio from "cheerio";
import qs from "qs";
import dotenv from "dotenv";

import { fetchWithRetry } from "./helpers.js";
import { delayer } from "../../assistants/helpers.js";

dotenv.config();

const getReviewsData = async (asin) => {
  let data = qs.stringify({
    asin: "B0CHH6Y67Y",
    sortBy: "recent",
    scope: "reviewsAjax2",
  });

  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: "https://www.amazon.com/hz/reviews-render/ajax/medley-filtered-reviews/get/ref=cm_cr_dp_d_fltrs_srt",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie:
        'i18n-prefs=USD; lc-main=en_US; session-id=130-7562463-7516922; session-id-time=2082787201l; session-token=AtS43uUx4sn+Na4KKWfafKK6TyFld2mUcJ1S22rTKrRUIO8t+teNpgwpYN8tNRRKnI3PEgYxhhij+tH2gqxEv9SPfC16ELvFyr1C3XnSHL2BBYWx82duf+MEq7hdE1mbIBQnnSimPZNYS9I9UIgaCHOYz9appIl9u2C2S/3ZZQmYK2yJyduo0NafPjsRQA+ZsoUE3Pa/rFnhEJZK2E+5M+FxR70SIyT+MBA3OrR0uWxIXBbo+fflrQdPwBKxbT+S4Gr2zpEoUDVjoMiMRSp3+RRhimkg0MnQngPdEcFBE9YhxKwcrY8y1yyerBaNqVbl0ZYCoLJrjM0dGG7itZtyHOHUVPyFUam7; sp-cdn="L5Z9:UA"; ubid-main=134-7284545-7209841; JSESSIONID=D347F020575A0D07CF362C0B000245EF',
    },
    data: data,
  };
  console.log(config);

  axios
    .request(config)
    .then((response) => {
      console.log(JSON.stringify(response.data));
    })
    .catch((error) => {
      console.log(error);
    });
};

export const productsLinksByCategory = async (categoryUrl) => {
  const fullUrl = "https://www.amazon.com/gp/" + categoryUrl;

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

export const singleProductScrapper = async (products) => {
  //TODO remove after testing
  // const productsLinks = JSON.parse(
  //   fs.readFileSync("amazon_products.json", "utf-8")
  // );

  const scrappedData = [];

  for (const product of products) {
    let data = {
      id: product.link.split("/")[1].toLowerCase(),
      fame: product.fame,
      link: `https://www.amazon.com${product.link.split("/ref=")[0]}?tag=${
        process.env.AFF_TEG
      }`,
    };

    const responseData = await fetchWithRetry(
      `https://www.amazon.com/${product.link}`
    );
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
      const fame = await getReviewsData(product.link.split("/")[3]);

      scrappedData.push(data);
      await delayer(1000);
    } catch (error) {
      console.error("Scrapping single Item data error", error.message);
    }
  }
  return scrappedData;
};
getReviewsData(
  "/Amazon-Fire-Stick-2-Year-Protection/dp/B0CHH6Y67Y/ref=zg_bsms_g_amazon-devices_d_sccl_1/130-6647065-5636324?psc=1".split(
    "/"
  )[3]
);
