import axios from "axios";
import FormData from "form-data";
import { delayer } from "../../assistants/helpers.js";
import { createListing, findClosestCombination } from "./utils/index.js";

// Get all ids, we always have 300 items
const getHomeList = async (url) => {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
      },
    });
    return response.data.offers.map(({ id }) => id);
  } catch (error) {
    console.log("Error in getHomeList", error.response?.data || error.message);
  }
};

// Get home details by id
const getHomeDetails = async (id) => {
  const url = "https://www.hometogo.de/searchdetails/5460aecab790d";
  const formData = new FormData();

  formData.append("offers", id);

  try {
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    return response.data.offers[0];
  } catch (error) {
    console.error(
      "Error in getHomeDetails:",
      error.response?.data || error.message
    );
  }
};

// Get guests reviews by house id
const getReviewsById = async (id) => {
  const url = `https://www.hometogo.de/reviews/list/${id}`;
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
      },
    });
    let review_average_total = 0;
    if (response.data.list.length === 0)
      return {
        reviews: [],
        ratingsStats: [0, 0, 0, 0, 0],
      };
    const resultList = response.data.list
      .slice(0, 20)
      .map((item) => {
        if (
          !item.nickname ||
          item.nickname.trim().length === 0 ||
          !item.rating?.value ||
          !item.text ||
          item.text.trim().length === 0
        ) {
          return "";
        } else {
          review_average_total += Number(item.rating.value);
          return {
            name: item.nickname,
            average: item.rating.value,
            text: item.text,
            reviewDate: item.rawDate,

            ratings: findClosestCombination(item.rating.value),
          };
        }
      })
      .filter(Boolean);

    return {
      ratingsStats: findClosestCombination(
        parseFloat((review_average_total / resultList.length).toFixed(2))
      ),
      reviewCount: resultList.length,
      reviewAverage: parseFloat(
        (review_average_total / resultList.length).toFixed(2)
      ),
      reviews: JSON.stringify(resultList, null, 2),
    };
  } catch (error) {
    console.log(
      `Error in getReviewsById with ${id}`,
      error.response?.data || error.message
    );
  }
};

export const ScrappingService = async (url) => {
  const homesIdList = await getHomeList(url);
  console.log("Total homes found:", homesIdList.length);

  if (homesIdList.length === 0) {
    console.log(`Location by ${url} don't have any results`);
    return;
  }

  for (let i = 0; i < homesIdList.length; i++) {
    try {
      console.log(i);
      const info = await getHomeDetails(homesIdList[i]);

      const itemData = {
        listing_type: "380",
        post_id: homesIdList[i],
        taxonomy: "rz_listing_category",
        terms: ["example-category"],
        meta: {
          rz_listing_type: "380",
        },
      };

      itemData.meta.rz_post_title_heading = info.unitTitle;
      itemData.title = info.secondaryTitle;
      itemData.content = info.description.unit.content;
      itemData.meta.rz_price = info.price.totalRawEur / 7;
      itemData.meta.rz_location__lat = info.geoLocation.lat;
      itemData.meta.rz_location__lng = info.geoLocation.lon;
      itemData.meta.rz_location = [
        info.locationTrailHeading.search,
        info.geoLocation.lat,
        info.geoLocation.lon,
      ];
      itemData.meta.rz_location_city = info.locationTrailHeading.search
        .split(",")[0]
        .trim();

      //get location details
      itemData.meta.rz_location_details = info.infoGroups.find(
        (group) => group.title === "In der Nähe"
      ).list;

      // get benefits
      const benefitsData = info.salesArguments
        .filter((item) => item.slot === 10000000)
        .map((item) => {
          if (
            item.props.icon ||
            item.props.label ||
            item.props.propertyHighlightText
          ) {
            return {
              icon: item.props.icon,
              label: item.props.label,
              text: item.props.propertyHighlightText,
            };
          } else return "";
        })
        .filter(Boolean);
      itemData.meta.rz_benefits = JSON.stringify(benefitsData, null, 2);

      // get images
      const urls = info.images.map(({ large }) => {
        return { id: `https:${large}` };
      });
      itemData.meta.rz_gallery = JSON.stringify(urls, null, 2);

      // get equipment
      let equipment = [];
      info.infoGroups.map((group) => {
        if (
          group.title === "Wichtige Ausstattung" ||
          group.title === "Außenbereiche"
        ) {
          group.list.forEach((item) => {
            equipment.push({ label: item.label, icon: item.icon });
          });
        }
      });
      itemData.meta.rz_equipment_set = JSON.stringify(equipment, null, 2);

      //get reviews
      const reviewsDates = await getReviewsById(homesIdList[i]);
      itemData.comments = reviewsDates.reviews;
      itemData.meta.rz_review_count = reviewsDates.reviewCount;
      itemData.meta.rz_review_average = reviewsDates.reviewAverage;
      itemData.meta.rz_review_rating_average_cleanliness =
        reviewsDates.ratingsStats[0];
      itemData.meta.rz_review_rating_average_communication =
        reviewsDates.ratingsStats[1];
      itemData.meta["rz_review_rating_average_check-in"] =
        reviewsDates.ratingsStats[2];
      itemData.meta.rz_review_rating_average_accuracy =
        reviewsDates.ratingsStats[3];
      itemData.meta.rz_review_rating_average_location =
        reviewsDates.ratingsStats[4];
      itemData.meta.rz_review_rating_average_value = reviewsDates.reviewAverage;

      //get rooms details
      if (info.rooms.length > 0) {
        const roomsData = info.rooms
          .map((room) => {
            if (
              !room.roomType ||
              !room.beds ||
              !room.properties ||
              !room.icons
            ) {
              return "";
            } else
              return {
                title: room.roomType,
                properties: [...room.beds, ...room.properties],
                icons: room.icons,
              };
          })
          .filter(Boolean);

        itemData.meta.rz_data_rooms = JSON.stringify(roomsData, null, 2);
      }

      //console.log(itemData); // send data to the site
      await createListing("http://fewo.down4sure.band-it.space/", itemData);
      await delayer(500);
    } catch (error) {
      console.log("Error in scrapping:", error.response?.data || error.message);
    }
  }
};

// ScrappingService(
//   "https://www.hometogo.de/search/5460aecab790d?bounds=45.88313%2C10.57633%3B45.48691%2C11.27671"
// );
