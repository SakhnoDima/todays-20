import axios from "axios";
import { delayer } from "../../../assistants/helpers.js";

export async function createListing(url, data) {
  try {
    const response = await axios.post(
      `${url}wp-json/fewo/v1/create-listing`,
      data,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Response:", response.data);

    await delayer(500);
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
  }
}

export function findClosestCombination(targetAvg) {
  const targetSum = Math.round(targetAvg * 5);
  let result = Array(5).fill(Math.floor(targetAvg));
  let currentSum = result.reduce((sum, num) => sum + num, 0);

  let i = 0;

  while (currentSum < targetSum) {
    if (result[i] < 5) {
      result[i]++;
      currentSum++;
    }
    i = (i + 1) % 5;
  }

  while (currentSum > targetSum) {
    if (result[i] > 1) {
      result[i]--;
      currentSum--;
    }
    i = (i + 1) % 5;
  }

  return result;
}
